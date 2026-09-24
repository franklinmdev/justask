import { ask } from "../ask.ts";
import type { NamedPair } from "../named-pair.ts";
import type { Facts, Probabilities, Provider } from "../provider.ts";
import type { Search } from "../search.ts";
import { checkKillLines, type KillLines } from "./kill-lines.ts";
import { readRunLog, writeRunLog } from "./log.ts";
import { type Probe, type Probes, probeSender } from "./probe.ts";
import type { EvalRow } from "./set.ts";

/** One row of a run: the eval row and everything needed to rescore it without a call. */
export type RunRow = EvalRow & {
	/** The shortlist, as the provider read it. */
	candidates: { id: string; description: string }[];
	/** Every label's probability, `none` included; empty when there was no answer. */
	probabilities: Probabilities;
	/** The whole pipeline, shortlist included, as the person would wait for it. */
	latencyMs: number;
	/** False when the shortlist was empty, so the provider was never asked. */
	called: boolean;
	/** The named pair that held the item whatever its pick (ADR 0011); absent when none did, and from logs written before it. */
	pair?: NamedPair;
	/** What the call cost, when the provider reports it (ADR 0006). */
	costUsd?: number;
	error?: { kind: "provider" | "timeout"; message: string };
};

/** A saved run: the gate and kill lines it was run under, and its raw rows. */
export type Run = {
	startedAt: string;
	/** The provider's latency around the run (#65); absent from logs written before it. */
	probes?: Probes;
	gate: number;
	killLines: KillLines;
	rows: RunRow[];
};

export type RunEvalInput<T> = {
	set: EvalRow[];
	search: Search<T>;
	provider: Provider;
	/** Written as in production. Fix `today` so relative dates mean the same on every run. */
	facts: Facts;
	timeoutMs: number;
	/** Declared before the run and saved with it, so the verdict cannot be tuned afterwards. */
	killLines: KillLines;
	/** Where the raw run log is written, one JSON line per row. It must not exist yet. */
	log: string;
	/** Sent before the rows and after, to measure the provider's latency on its own (#65). */
	probe?: Probe;
};

/**
 * Runs an eval set through the real pipeline, `ask` with the real provider,
 * one request at a time so latency is what one person typing sees. Each row
 * is appended to the log as soon as it is answered, so a crash keeps every
 * call already paid for. The log's first line holds the gate and kill lines.
 */
export async function runEval<T>({
	set,
	search,
	provider,
	facts,
	timeoutMs,
	killLines,
	log,
	probe,
}: RunEvalInput<T>): Promise<Run> {
	checkKillLines(killLines);
	return writeRunLog(
		log,
		{ gate: search.gate, killLines },
		set,
		(row) => runRow(row, { search, provider, facts, timeoutMs }),
		probeSender(provider, probe, timeoutMs),
	);
}

async function runRow<T>(
	row: EvalRow,
	{
		search,
		provider,
		facts,
		timeoutMs,
	}: Pick<RunEvalInput<T>, "search" | "provider" | "facts" | "timeoutMs">,
): Promise<RunRow> {
	let called = false;
	let costUsd: number | undefined;
	const counted: Provider = {
		async answer(input) {
			called = true;
			const result = await provider.answer(input);
			costUsd = result.costUsd;
			return result;
		},
	};
	const started = performance.now();
	const { search: result, error } = await ask({
		request: row.request,
		facts,
		provider: counted,
		timeoutMs,
		search,
	});
	const latencyMs = performance.now() - started;
	return {
		...row,
		candidates: result.candidates.map(({ id, description }) => ({
			id,
			description,
		})),
		probabilities: result.probabilities,
		...(result.pair && { pair: result.pair }),
		latencyMs,
		called,
		...(costUsd !== undefined && { costUsd }),
		...(error && { error: { kind: error.kind, message: error.message } }),
	};
}

/** Reads a run log written by `runEval`, to rescore or compare it with no provider call. */
export async function readRun(log: string): Promise<Run> {
	const { header, rows } = await readRunLog(log);
	if (typeof header?.gate !== "number" || !header.killLines) {
		throw new Error(`justask: ${log} is not a run log written by runEval`);
	}
	return { ...header, rows } as Run;
}
