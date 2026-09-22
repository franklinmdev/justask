import { gateSearch, NONE } from "../search.ts";
import { type KillLines, MEASURES, type Measure } from "./kill-lines.ts";
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
};

export type Verdict = { pass: boolean; lines: VerdictLine[] };

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
	checkGate(gate);
	const answered = run.rows.filter((row) => !row.error);
	const read = answered.map((row) => ({ row, ...readRow(row, gate) }));

	const items = read.filter(({ row }) => row.kind === "item");
	const covered = items.filter(({ item }) => item !== null);
	const right = covered.filter(({ row, item }) => item === row.expected);
	const nothing = read.filter(({ row }) => row.kind === "nothing");
	const invented = nothing.filter(({ item }) => item !== null);
	const ambiguous = read.filter(({ row }) => row.kind === "ambiguous");
	const leaked = ambiguous.filter(({ item }) => item !== null);

	const measures: Measures = {
		exact: ratio(right.length, covered.length),
		coverage: ratio(covered.length, items.length),
		invented: invented.length,
		heldAmbiguous: ratio(ambiguous.length - leaked.length, ambiguous.length),
		p95Ms: percentile(
			answered.map(({ latencyMs }) => latencyMs),
			95,
		),
		errors: run.rows.length - answered.length,
	};

	const misses = read
		.filter(({ row, item }) => item !== row.expected)
		.map(
			({ row, item, none }): Miss => ({
				id: row.id,
				request: row.request,
				kind: row.kind,
				expected: row.expected,
				item,
				none,
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
		misses,
		verdict: retuned ? null : judge(run.killLines, measures),
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
	checkGate(gate);
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
	const { item, none } = readRow(row, gate);
	return { item, none, filled: item !== null };
}

/** The candidate id the item fills with at this gate, as `ask` reads it. */
function readRow(
	row: RunRow,
	gate: number,
): { item: string | null; none: number | null } {
	return {
		item: gateSearch(row.probabilities, gate).filled,
		none: row.probabilities[NONE] ?? null,
	};
}

function judge(killLines: KillLines, measures: Measures): Verdict {
	const lines = MEASURES.map(({ measure, atLeast }): VerdictLine => {
		const line = killLines[measure];
		const actual = measures[measure];
		// A line the set cannot measure fails: a set without ambiguous rows
		// has not shown that ambiguous requests stay held.
		const pass = actual !== null && (atLeast ? actual >= line : actual <= line);
		return { measure, line, atLeast, actual, pass };
	});
	return { pass: lines.every(({ pass }) => pass), lines };
}

/**
 * Over every call the provider answered, error rows included: an answer that
 * broke the contract was still paid for. A timeout's cost is never known, so
 * it is left out. Null when an answered call did not report its cost.
 */
function costPerCall(rows: RunRow[]): number | null {
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

function checkGate(gate: number): void {
	if (!(gate > 0 && gate <= 1)) {
		throw new TypeError(
			`justask: a gate must be above 0 and at most 1, not ${gate}`,
		);
	}
}

function ratio(part: number, whole: number): number | null {
	return whole === 0 ? null : part / whole;
}

/** Nearest rank, as in the lab. */
function percentile(values: number[], p: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)] ?? null;
}
