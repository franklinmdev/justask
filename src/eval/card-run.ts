import { ask } from "../ask.ts";
import {
	type Card,
	type CardCommand,
	type CardField,
	type CardFields,
	INTENT,
} from "../card.ts";
import type { NamedPair } from "../named-pair.ts";
import type { AmountReading, DateReading, TimeReading } from "../parse.ts";
import type { Facts, Provider, ProviderAnswer } from "../provider.ts";
import { type CardEvalRow, isAmount, isIds } from "./card-set.ts";
import { HELD } from "./held.ts";
import { checkKillLines, type KillLines } from "./kill-lines.ts";
import { readRunLog, writeRunLog } from "./log.ts";

type Described = { id: string; description: string };

/**
 * A card field's candidates as the provider read them. A date, time or
 * amount candidate keeps its reading, so the field can be rebuilt at any
 * gate; a catalog candidate keeps only its id and description, not the
 * host's row.
 */
export type LoggedCardField =
	| { kind: "catalog"; candidates: Described[] }
	| { kind: "several"; candidates: Described[] }
	| { kind: "date"; candidates: (Described & { value: DateReading })[] }
	| { kind: "time"; candidates: (Described & { value: TimeReading })[] }
	| { kind: "amount"; candidates: (Described & { value: AmountReading })[] };

/** One row of a card run: the eval row and everything needed to rescore it without a call. */
export type CardRunRow = CardEvalRow & {
	fields: Record<string, LoggedCardField>;
	/** The provider's raw answer, per question id, the intent's included; empty when there was none. */
	answers: ProviderAnswer;
	/** The command that held the card before its gate (ADR 0009); absent from logs written before it. */
	command?: CardCommand;
	/** Per field, the named pair that held it whatever its pick (ADR 0010); absent when none did, and from logs written before it. */
	pairs?: Record<string, NamedPair>;
	/** The whole pipeline, parsing and shortlists included. */
	latencyMs: number;
	/** False when the provider was never asked. A card asks its intent on every request, so only a failure before the call leaves it false. */
	called: boolean;
	/** What the call cost, when the provider reports it (ADR 0006). */
	costUsd?: number;
	error?: { kind: "provider" | "timeout"; message: string };
};

/**
 * A saved card run: the intent's gate (under `intent`) and each field's, the
 * kill lines it ran under, and its raw rows.
 */
export type CardRun = {
	startedAt: string;
	gates: Record<string, number>;
	killLines: KillLines;
	rows: CardRunRow[];
};

export type RunCardEvalInput<F extends CardFields> = {
	set: CardEvalRow[];
	card: Card<F>;
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
 * Runs a card eval set through the real pipeline, `ask` with the real
 * provider, one request at a time. Each row is appended to the log as soon as
 * it is answered, so a crash keeps every call already paid for. The log's
 * first line holds the intent's and each field's gate, and the kill lines.
 */
export async function runCardEval<F extends CardFields>({
	set,
	card,
	provider,
	facts,
	timeoutMs,
	killLines,
	log,
}: RunCardEvalInput<F>): Promise<CardRun> {
	checkKillLines(killLines);
	checkSet(set, card);
	const gates = {
		[INTENT]: card.gate,
		...Object.fromEntries(
			Object.entries(card.fields).map(([name, field]) => [
				name,
				(field as CardField).gate,
			]),
		),
	};
	return writeRunLog(log, { gates, killLines }, set, (row) =>
		runRow(row, { card, provider, facts, timeoutMs }),
	);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Every expected field exists in the card and takes that kind of value, checked before any call. */
function checkSet(set: CardEvalRow[], card: Card<CardFields>): void {
	for (const row of set) {
		for (const [name, value] of Object.entries(row.expected)) {
			const field = card.fields[name];
			const invalid = (why: string) =>
				new TypeError(
					`justask: card eval row "${row.id}" expects field "${name}", ${why}`,
				);
			if (!field) throw invalid("which the card does not declare");
			if (value === HELD) continue;
			const kind = loggedKind(field);
			const fits =
				kind === "several"
					? isIds(value)
					: kind === "amount"
						? isAmount(value)
						: typeof value === "string" &&
							(kind === "catalog" ||
								(kind === "date" ? ISO_DAY : HH_MM).test(value));
			if (!fits) throw invalid(`a ${kind} field, with another kind of value`);
		}
	}
}

function loggedKind(field: CardField): LoggedCardField["kind"] {
	return field.kind === "catalog" && "several" in field
		? "several"
		: field.kind;
}

async function runRow<F extends CardFields>(
	row: CardEvalRow,
	{
		card,
		provider,
		facts,
		timeoutMs,
	}: Pick<RunCardEvalInput<F>, "card" | "provider" | "facts" | "timeoutMs">,
): Promise<CardRunRow> {
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
	const { card: result, error } = await ask({
		request: row.request,
		facts,
		provider: counted,
		timeoutMs,
		card,
	});
	const latencyMs = performance.now() - started;
	const fields: Record<string, LoggedCardField> = {};
	const pairs: Record<string, NamedPair> = {};
	for (const [name, field] of Object.entries(card.fields)) {
		const { candidates, pair } = result.fields[name] as {
			candidates: (Described & { value: unknown })[];
			pair?: NamedPair;
		};
		if (pair) pairs[name] = pair;
		const kind = loggedKind(field as CardField);
		fields[name] =
			kind === "catalog" || kind === "several"
				? {
						kind,
						candidates: candidates.map(({ id, description }) => ({
							id,
							description,
						})),
					}
				: ({ kind, candidates } as LoggedCardField);
	}
	const { command } = result.intent;
	return {
		...row,
		fields,
		answers: error ? {} : answers,
		...(command && { command }),
		...(Object.keys(pairs).length > 0 && { pairs }),
		latencyMs,
		called,
		...(costUsd !== undefined && { costUsd }),
		...(error && { error: { kind: error.kind, message: error.message } }),
	};
}

/** Reads a run log written by `runCardEval`, to rescore or compare it with no provider call. */
export async function readCardRun(log: string): Promise<CardRun> {
	const { header, rows } = await readRunLog(log);
	const gates = header?.gates as Record<string, unknown> | undefined;
	if (typeof gates?.[INTENT] !== "number" || !header?.killLines) {
		throw new Error(`justask: ${log} is not a run log written by runCardEval`);
	}
	return { ...header, rows } as CardRun;
}
