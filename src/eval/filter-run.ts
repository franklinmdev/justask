import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ask } from "../ask.ts";
import type { Field, Fields, Filter } from "../filter.ts";
import type { AmountReading, DateReading } from "../parse.ts";
import type { Facts, Provider, ProviderAnswer } from "../provider.ts";
import {
	type FilterEvalRow,
	HELD,
	isAmountRange,
	isDateRange,
} from "./filter-set.ts";
import { checkKillLines, type KillLines } from "./kill-lines.ts";

/**
 * A field's candidates as the provider read them. A date or amount
 * candidate keeps its reading, so the field can be rebuilt at any gate; a
 * catalog candidate keeps only its id and description, not the host's row.
 */
export type LoggedField =
	| {
			kind: "catalog";
			candidates: { id: string; description: string }[];
	  }
	| {
			kind: "date";
			candidates: { id: string; description: string; value: DateReading }[];
	  }
	| {
			kind: "amount";
			candidates: {
				id: string;
				description: string;
				value: AmountReading;
			}[];
	  };

/** One row of a filter run: the eval row and everything needed to rescore it without a call. */
export type FilterRunRow = FilterEvalRow & {
	fields: Record<string, LoggedField>;
	/** The provider's raw answer, per question id; empty when there was none. */
	answers: ProviderAnswer;
	/** The whole pipeline, parsing and shortlists included. */
	latencyMs: number;
	/** False when no field had a candidate, so the provider was never asked. */
	called: boolean;
	/** What the call cost, when the provider reports it (ADR 0006). */
	costUsd?: number;
	error?: { kind: "provider" | "timeout"; message: string };
};

/** A saved filter run: each field's gate and the kill lines it ran under, and its raw rows. */
export type FilterRun = {
	startedAt: string;
	gates: Record<string, number>;
	killLines: KillLines;
	rows: FilterRunRow[];
};

export type RunFilterEvalInput<F extends Fields> = {
	set: FilterEvalRow[];
	filter: Filter<F>;
	provider: Provider;
	/** Written as in production. Fix `today` so relative dates mean the same on every run. */
	facts: Facts;
	timeoutMs: number;
	/** Declared before the run and saved with it, so the verdict cannot be tuned afterwards. */
	killLines: KillLines;
	/** Where the raw run log is written, one JSON line per row. It must not exist yet. */
	log: string;
};

/**
 * Runs a filter eval set through the real pipeline, `ask` with the real
 * provider, one request at a time. Each row is appended to the log as soon as
 * it is answered, so a crash keeps every call already paid for. The log's
 * first line holds each field's gate and the kill lines.
 */
export async function runFilterEval<F extends Fields>({
	set,
	filter,
	provider,
	facts,
	timeoutMs,
	killLines,
	log,
}: RunFilterEvalInput<F>): Promise<FilterRun> {
	checkKillLines(killLines);
	checkSet(set, filter);
	await mkdir(dirname(log), { recursive: true });
	const file = await open(log, "wx").catch((error: unknown) => {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new Error(
				`justask: the run log ${log} exists already; a saved run is never overwritten`,
			);
		}
		throw error;
	});
	try {
		const run: FilterRun = {
			startedAt: new Date().toISOString(),
			gates: Object.fromEntries(
				Object.entries(filter.fields).map(([name, field]) => [
					name,
					(field as Field).gate,
				]),
			),
			killLines,
			rows: [],
		};
		const { rows: _, ...header } = run;
		await file.write(`${JSON.stringify(header)}\n`);
		for (const row of set) {
			const answered = await runRow(row, {
				filter,
				provider,
				facts,
				timeoutMs,
			});
			run.rows.push(answered);
			await file.write(`${JSON.stringify(answered)}\n`);
		}
		return run;
	} finally {
		await file.close();
	}
}

/** Every expected field exists in the filter and takes that kind of value, checked before any call. */
function checkSet(set: FilterEvalRow[], filter: Filter<Fields>): void {
	for (const row of set) {
		for (const [name, value] of Object.entries(row.expected)) {
			const field = filter.fields[name];
			const invalid = (why: string) =>
				new TypeError(
					`justask: filter eval row "${row.id}" expects field "${name}", ${why}`,
				);
			if (!field) throw invalid("which the filter does not declare");
			if (value === HELD) continue;
			const fits =
				field.kind === "catalog"
					? typeof value === "string"
					: field.kind === "date"
						? isDateRange(value)
						: isAmountRange(value);
			if (!fits)
				throw invalid(`a ${field.kind} field, with another kind of value`);
		}
	}
}

async function runRow<F extends Fields>(
	row: FilterEvalRow,
	{
		filter,
		provider,
		facts,
		timeoutMs,
	}: Pick<RunFilterEvalInput<F>, "filter" | "provider" | "facts" | "timeoutMs">,
): Promise<FilterRunRow> {
	let called = false;
	let costUsd: number | undefined;
	let answers: ProviderAnswer = {};
	const counted: Provider = {
		async answer(input) {
			called = true;
			const result = await provider.answer(input);
			costUsd = result.costUsd;
			answers = result.answers;
			return result;
		},
	};
	const started = performance.now();
	const { filter: result, error } = await ask({
		request: row.request,
		facts,
		provider: counted,
		timeoutMs,
		filter,
	});
	const latencyMs = performance.now() - started;
	const fields: Record<string, LoggedField> = {};
	for (const [name, field] of Object.entries(filter.fields)) {
		const { candidates } = result.fields[name] as {
			candidates: { id: string; description: string; value: unknown }[];
		};
		fields[name] =
			field.kind === "catalog"
				? {
						kind: "catalog",
						candidates: candidates.map(({ id, description }) => ({
							id,
							description,
						})),
					}
				: ({ kind: field.kind, candidates } as LoggedField);
	}
	return {
		...row,
		fields,
		answers: error ? {} : answers,
		latencyMs,
		called,
		...(costUsd !== undefined && { costUsd }),
		...(error && { error: { kind: error.kind, message: error.message } }),
	};
}

/** Reads a run log written by `runFilterEval`, to rescore or compare it with no provider call. */
export async function readFilterRun(log: string): Promise<FilterRun> {
	const [header, ...rows] = (await readFile(log, "utf8"))
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line));
	if (typeof header?.gates !== "object" || !header.killLines) {
		throw new Error(
			`justask: ${log} is not a run log written by runFilterEval`,
		);
	}
	return { ...header, rows };
}
