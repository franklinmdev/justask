import { checkGate } from "../gate.ts";
import { gateSearch, NONE, SEVERAL } from "../search.ts";
import { type KillLines, MEASURES, type Measure } from "./kill-lines.ts";
import { type ProbeWindow, probeWindow } from "./probe.ts";
import type { Run, RunRow } from "./run.ts";
import type { EvalKind } from "./set.ts";

/** Every measure a kill line can hold; null when the set has no row to measure it on. */
export type Measures = Record<Measure, number | null>;

/** A row the search got wrong: a wrong or held item, or an item where none belongs. */
export type Miss = {
	id: string;
	request: string;
	kind: EvalKind;
	expected: string | null;
	/** The candidate id the item filled with, or null when held. */
	item: string | null;
	/** The `none` label's probability, which the gate reads. */
	none: number | null;
	/** The `several` label's probability, which the gate also reads; null in a log saved before ADR 0007. */
	several: number | null;
	/**
	 * `shortlist` when the expected candidate never reached the provider, so
	 * no pick could have been right; `provider` otherwise.
	 */
	blame: "shortlist" | "provider";
};

export type VerdictLine = {
	measure: Measure;
	line: number;
	atLeast: boolean;
	actual: number | null;
	pass: boolean;
	/** The latency line of a run in a slow window: measured again in a normal one (#65). */
	pending?: true;
};

/**
 * Passes only when every line does. In a slow window the latency line is
 * pending, so the run cannot pass; its quality lines still decide a fail.
 */
export type Verdict = {
	pass: boolean;
	slowWindow: boolean;
	lines: VerdictLine[];
};

export type Report = {
	gate: number;
	/** True when scored at a gate other than the run's own: no verdict then. */
	retuned: boolean;
	rows: number;
	measures: Measures;
	counts: {
		/** Answered item rows: the denominator of coverage. */
		items: number;
		/** Item rows whose item filled: the denominator of exact. */
		covered: number;
		right: number;
		nothing: number;
		ambiguous: number;
		held: number;
	};
	/** Ids of nothing rows that got an item. */
	invented: string[];
	/** Ids of ambiguous rows whose item filled. */
	leaked: string[];
	/** Null when the provider did not report every call's cost. */
	costPerCallUsd: number | null;
	/** The provider's latency around the run; null for a run saved before probes. */
	window: ProbeWindow | null;
	/** Filled and wrong first, surest first; then held and wrong. */
	misses: Miss[];
	/** Checked against the kill lines saved with the run; null when retuned. */
	verdict: Verdict | null;
};

/**
 * Scores a saved run, by default at the gate it was run under, which gives the
 * verdict. Another gate rescores the same answers with no provider call; a
 * gate chosen after seeing the run gives no verdict, since it would be judged
 * on the rows it was tuned on. Error rows count as errors, and in cost when
 * the call was paid for.
 */
export function scoreRun(run: Run, { gate = run.gate } = {}): Report {
	checkGate(gate, "a gate");
	const answered = run.rows.filter((row) => !row.error);
	const read = answered.map((row) => ({ row, ...readRow(row, gate) }));

	const items = read.filter(({ row }) => row.kind === "item");
	const covered = items.filter(({ item }) => item !== null);
	const right = covered.filter(({ row, item }) => item === row.expected);
	const nothing = read.filter(({ row }) => row.kind === "nothing");
	const invented = nothing.filter(({ item }) => item !== null);
	const ambiguous = read.filter(({ row }) => row.kind === "ambiguous");
	const leaked = ambiguous.filter(({ item }) => item !== null);

	const measures = measuresOf(run.rows, {
		exact: right.length,
		covered: covered.length,
		expected: items.length,
		invented: invented.length,
		ambiguous: ambiguous.length,
		held: ambiguous.length - leaked.length,
	});

	const misses = read
		.filter(({ row, item }) => item !== row.expected)
		.map(
			({ row, item, none, several }): Miss => ({
				id: row.id,
				request: row.request,
				kind: row.kind,
				expected: row.expected,
				item,
				none,
				several,
				blame:
					row.expected !== null &&
					!row.candidates.some(({ id }) => id === row.expected)
						? "shortlist"
						: "provider",
			}),
		)
		.sort(
			(a, b) =>
				Number(b.item !== null) - Number(a.item !== null) ||
				(a.none ?? 1) - (b.none ?? 1),
		);

	const retuned = gate !== run.gate;
	return {
		gate,
		retuned,
		rows: run.rows.length,
		measures,
		counts: {
			items: items.length,
			covered: covered.length,
			right: right.length,
			nothing: nothing.length,
			ambiguous: ambiguous.length,
			held: ambiguous.length - leaked.length,
		},
		invented: invented.map(({ row }) => row.id),
		leaked: leaked.map(({ row }) => row.id),
		costPerCallUsd: costPerCall(run.rows),
		window: probeWindow(run.probes),
		misses,
		verdict: retuned ? null : judge(run.killLines, measures, run.probes),
	};
}

/** A row whose item crossed the gate, or changed while filled, between two runs. */
export type Flip = {
	id: string;
	request: string;
	before: Side;
	after: Side;
};

export type Side = {
	item: string | null;
	none: number | null;
	several: number | null;
	filled: boolean;
};

/**
 * Lists the rows whose item flipped between a first run and a second run of
 * the same set, at the first run's gate by default. The second run never
 * changes the verdict; it says how much of the first run sat on the gate.
 */
export function compareRuns(
	first: Run,
	second: Run,
	{ gate = first.gate } = {},
): Flip[] {
	checkGate(gate, "a gate");
	const again = new Map(second.rows.map((row) => [row.id, row]));
	const flips: Flip[] = [];
	for (const row of first.rows) {
		const other = again.get(row.id);
		if (row.error || !other || other.error) continue;
		const before = side(row, gate);
		const after = side(other, gate);
		if (before.item !== after.item) {
			flips.push({ id: row.id, request: row.request, before, after });
		}
	}
	return flips;
}

function side(row: RunRow, gate: number): Side {
	const { item, none, several } = readRow(row, gate);
	return { item, none, several, filled: item !== null };
}

/** The candidate id the item fills with at this gate, as `ask` reads it. */
function readRow(
	row: RunRow,
	gate: number,
): { item: string | null; none: number | null; several: number | null } {
	return {
		item: gateSearch(row.probabilities, gate).filled,
		none: row.probabilities[NONE] ?? null,
		several: row.probabilities[SEVERAL] ?? null,
	};
}

/**
 * The measures every flow's report shares, from its counts: exact over the
 * covered rows, coverage over the rows that expect a fill, and latency over
 * the answered rows. The error rows are the rest of the run.
 */
export function measuresOf(
	rows: Pick<RunRow, "latencyMs" | "error">[],
	counts: {
		exact: number;
		covered: number;
		expected: number;
		invented: number;
		ambiguous: number;
		held: number;
	},
): Measures {
	const answered = rows.filter((row) => !row.error);
	return {
		exact: ratio(counts.exact, counts.covered),
		coverage: ratio(counts.covered, counts.expected),
		invented: counts.invented,
		heldAmbiguous: ratio(counts.held, counts.ambiguous),
		p95Ms: percentile(
			answered.map(({ latencyMs }) => latencyMs),
			95,
		),
		errors: rows.length - answered.length,
	};
}

export function judge(
	killLines: KillLines,
	measures: Measures,
	probes?: Run["probes"],
): Verdict {
	const slowWindow = probeWindow(probes)?.slow ?? false;
	const lines = MEASURES.map(({ measure, atLeast }): VerdictLine => {
		const line = killLines[measure];
		const actual = measures[measure];
		if (slowWindow && measure === "p95Ms") {
			return { measure, line, atLeast, actual, pass: false, pending: true };
		}
		// A line the set cannot measure fails: a set without ambiguous rows
		// has not shown that ambiguous requests stay held.
		const pass = actual !== null && (atLeast ? actual >= line : actual <= line);
		return { measure, line, atLeast, actual, pass };
	});
	return { pass: lines.every(({ pass }) => pass), slowWindow, lines };
}

/**
 * Over every call the provider answered, error rows included: an answer that
 * broke the contract was still paid for. A timeout's cost is never known, so
 * it is left out. Null when an answered call did not report its cost.
 */
export function costPerCall(
	rows: Pick<RunRow, "called" | "error" | "costUsd">[],
): number | null {
	const calls = rows.filter(
		({ called, error, costUsd }) => called && (!error || costUsd !== undefined),
	);
	if (calls.length === 0) return null;
	let total = 0;
	for (const { costUsd } of calls) {
		if (costUsd === undefined) return null;
		total += costUsd;
	}
	return total / calls.length;
}

export function ratio(part: number, whole: number): number | null {
	return whole === 0 ? null : part / whole;
}

/** Nearest rank, as in the lab. */
function percentile(values: number[], p: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)] ?? null;
}
