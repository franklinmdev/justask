import type { AmountRange, DateRange } from "../filter.ts";
import {
	amountPlan,
	datePlan,
	type FieldAnswer,
	type Fields,
	type Filter,
	gateField,
} from "../filter.ts";
import { checkGate } from "../gate.ts";
import {
	emptyStats,
	type FieldStats,
	notePick,
	weakestPick,
} from "./field-stats.ts";
import type { FilterRun, FilterRunRow } from "./filter-run.ts";
import {
	type ExpectedValue,
	type FilterEvalKind,
	isAmountRange,
	isDateRange,
} from "./filter-set.ts";
import { HELD } from "./held.ts";
import { type ProbeWindow, probeWindow } from "./probe.ts";
import {
	costPerCall,
	judge,
	type Measures,
	measuresOf,
	type Verdict,
} from "./score.ts";

/** A field the filter got wrong: a wrong or held value, or a value where none belongs. */
export type FilterMiss = {
	id: string;
	request: string;
	kind: FilterEvalKind;
	field: string;
	/** The expected value, `"held"`, or null when the request does not mention the field. */
	expected: ExpectedValue | typeof HELD | null;
	/** The value the field filled with (a catalog field's candidate id), or null when held. */
	got: ExpectedValue | null;
	/** The field's weakest pick; null when the field was not asked or tied. */
	probability: number | null;
	/** That pick's label, such as a candidate id or `not_mentioned`. */
	label: string | null;
	/**
	 * `shortlist` or `parser` when no candidate could build the expected value,
	 * so no pick could have been right; `provider` otherwise.
	 */
	blame: "shortlist" | "parser" | "provider";
};

export type FilterReport = {
	gates: Record<string, number>;
	/** True when scored at any gate other than the run's own: no verdict then. */
	retuned: boolean;
	rows: number;
	measures: Measures;
	counts: {
		/** Answered filterable rows: the denominator of coverage. */
		filterable: number;
		/** Filterable rows where every expected field filled: the denominator of exact. */
		covered: number;
		/** Covered rows whose whole filter object is the expected one. */
		exact: number;
		nothing: number;
		ambiguous: number;
		/** Ambiguous rows where every field marked held stayed empty. */
		held: number;
	};
	/** Ids of nothing rows that filled any field. */
	invented: string[];
	/** Ids of ambiguous rows that filled a field marked held. */
	leaked: string[];
	fields: Record<string, FieldStats>;
	/** Null when the provider did not report every call's cost. */
	costPerCallUsd: number | null;
	/** The provider's latency around the run; null for a run saved before probes. */
	window: ProbeWindow | null;
	/** Filled and wrong first, surest first; then held and wrong, in set order. */
	misses: FilterMiss[];
	/** Checked against the kill lines saved with the run; null when retuned. */
	verdict: Verdict | null;
};

/** Reads a field with no gate: every pick counts, whatever its probability. */
const NO_GATE = Number.MIN_VALUE;

/** The plans only read answers here; the questions they build are never asked. */
const REREAD: Filter<Fields> = { description: "", fields: {} };

/** A field read at a gate: its value, and its weakest pick's probability and label. */
type FieldReading = {
	value: ExpectedValue | null;
	probability: number | null;
	label: string | null;
};

const UNASKED: FieldReading = { value: null, probability: null, label: null };

/**
 * A field's value at a gate, as `ask` builds it: a catalog field's candidate
 * id, a date range or an amount. Null when the field is held.
 */
export function readField(
	row: FilterRunRow,
	name: string,
	gate: number,
): FieldReading {
	const logged = row.fields[name];
	if (!logged || row.error || logged.candidates.length === 0) return UNASKED;
	if (logged.kind === "catalog") {
		const { pick, filled } = gateField(row.answers[name] ?? {}, gate);
		return {
			value: filled,
			probability: pick?.probability ?? null,
			label: pick?.label ?? null,
		};
	}
	const plan =
		logged.kind === "date"
			? datePlan(
					name,
					REREAD,
					{ kind: "date", description: "", gate },
					logged.candidates,
				)
			: amountPlan(
					name,
					REREAD,
					{ kind: "amount", description: "", gate },
					logged.candidates,
				);
	if (plan.questions.length === 0) return UNASKED;
	const { result, value } = plan.read(row.answers);
	const picks = Object.values(
		(result as { answers: Record<string, FieldAnswer> }).answers,
	).map(({ pick }) => pick);
	const weakest = weakestPick(picks);
	return {
		value: (value as DateRange | AmountRange | undefined) ?? null,
		probability: weakest?.probability ?? null,
		label: weakest?.label ?? null,
	};
}

/** Whether a filled value is the expected one: same id, same range, same bounds and currency. */
export function sameValue(
	a: ExpectedValue | null,
	b: ExpectedValue | null,
): boolean {
	if (a === null || b === null) return a === b;
	if (typeof a === "string" || typeof b === "string") return a === b;
	const keys = ["from", "to", "min", "max", "exact", "currency"] as const;
	return keys.every(
		(key) =>
			(a as Record<string, unknown>)[key] ===
			(b as Record<string, unknown>)[key],
	);
}

/**
 * Scores a saved filter run, by default at the gates it was run under, which
 * gives the verdict. Other gates, any field at a time, rescore the same
 * answers with no provider call and give no verdict. Error rows count as
 * errors, and in cost when the call was paid for.
 */
export function scoreFilterRun(
	run: FilterRun,
	{ gates: overrides = {} }: { gates?: Record<string, number> } = {},
): FilterReport {
	const gates = { ...run.gates, ...overrides };
	for (const [name, gate] of Object.entries(gates)) {
		checkGate(gate, `the gate of field "${name}"`);
	}
	const names = Object.keys(gates);
	const answered = run.rows.filter((row) => !row.error);
	const read = answered.map((row) => ({
		row,
		at: Object.fromEntries(
			names.map((name) => [name, readField(row, name, gates[name] as number)]),
		),
	}));
	const filled = (at: (typeof read)[number]["at"], name: string) =>
		at[name]?.value ?? null;

	const filterable = read.filter(({ row }) => row.kind === "filterable");
	const covered = filterable.filter(({ row, at }) =>
		Object.keys(row.expected).every((name) => filled(at, name) !== null),
	);
	const exact = covered.filter(({ row, at }) =>
		names.every((name) =>
			sameValue(filled(at, name), expectedValue(row, name)),
		),
	);
	const nothing = read.filter(({ row }) => row.kind === "nothing");
	const invented = nothing.filter(({ at }) =>
		names.some((name) => filled(at, name) !== null),
	);
	const ambiguous = read.filter(({ row }) => row.kind === "ambiguous");
	const leaked = ambiguous.filter(({ row, at }) =>
		Object.entries(row.expected).some(
			([name, value]) => value === HELD && filled(at, name) !== null,
		),
	);

	const measures = measuresOf(run.rows, {
		exact: exact.length,
		covered: covered.length,
		expected: filterable.length,
		invented: invented.length,
		ambiguous: ambiguous.length,
		held: ambiguous.length - leaked.length,
	});

	const fields = Object.fromEntries(
		names.map((name) => [name, fieldStats(name, gates[name] as number, read)]),
	);

	const misses: FilterMiss[] = [];
	for (const { row, at } of read) {
		for (const name of names) {
			const got = filled(at, name);
			const wanted = row.expected[name] ?? null;
			const expected = wanted === HELD ? null : wanted;
			if (sameValue(got, expected)) continue;
			misses.push({
				id: row.id,
				request: row.request,
				kind: row.kind,
				field: name,
				expected: wanted,
				got,
				probability: at[name]?.probability ?? null,
				label: at[name]?.label ?? null,
				blame: blame(row, name, expected),
			});
		}
	}
	misses.sort(
		(a, b) =>
			Number(b.got !== null) - Number(a.got !== null) ||
			(a.got !== null ? (b.probability ?? 0) - (a.probability ?? 0) : 0),
	);

	const retuned = names.some((name) => gates[name] !== run.gates[name]);
	const window = probeWindow(run.probes);
	return {
		gates,
		retuned,
		rows: run.rows.length,
		measures,
		counts: {
			filterable: filterable.length,
			covered: covered.length,
			exact: exact.length,
			nothing: nothing.length,
			ambiguous: ambiguous.length,
			held: ambiguous.length - leaked.length,
		},
		invented: invented.map(({ row }) => row.id),
		leaked: leaked.map(({ row }) => row.id),
		fields,
		costPerCallUsd: costPerCall(run.rows),
		misses,
		window,
		verdict: retuned ? null : judge(run.killLines, measures, window),
	};
}

/** The value a row expects in a field; null when held or not mentioned. */
function expectedValue(row: FilterRunRow, name: string): ExpectedValue | null {
	const value = row.expected[name];
	return value === undefined || value === HELD ? null : value;
}

function fieldStats(
	name: string,
	gate: number,
	read: {
		row: FilterRunRow;
		at: Record<string, { value: ExpectedValue | null }>;
	}[],
): FieldStats {
	const stats = emptyStats(gate);
	for (const { row, at } of read) {
		const expected = expectedValue(row, name);
		const got = at[name]?.value ?? null;
		if (expected !== null) {
			stats.expected++;
			if (got !== null) stats.filled++;
			if (got !== null && sameValue(got, expected)) stats.right++;
		}
		if (got !== null && !sameValue(got, expected)) stats.wrong++;
		const bare = readField(row, name, NO_GATE);
		if (bare.value === null || bare.probability === null) continue;
		notePick(stats, sameValue(bare.value, expected), bare.probability);
	}
	return stats;
}

/** Whether any candidate could have built the expected value. */
function blame(
	row: FilterRunRow,
	name: string,
	expected: ExpectedValue | null,
): FilterMiss["blame"] {
	const logged = row.fields[name];
	if (expected === null || !logged) return "provider";
	if (logged.kind === "catalog") {
		return logged.candidates.some(({ id }) => id === expected)
			? "provider"
			: "shortlist";
	}
	if (logged.kind === "date" && isDateRange(expected)) {
		const reachable =
			(expected.from === undefined ||
				logged.candidates.some(({ value }) => value.from === expected.from)) &&
			(expected.to === undefined ||
				logged.candidates.some(({ value }) => value.to === expected.to));
		return reachable ? "provider" : "parser";
	}
	if (logged.kind === "amount" && isAmountRange(expected)) {
		const { currency: _, ...bounds } = expected;
		const reachable = Object.values(bounds).every((bound) =>
			logged.candidates.some(({ value }) => value.value === bound),
		);
		return reachable ? "provider" : "parser";
	}
	return "provider";
}

/** A field whose value changed between two runs of the same set. */
export type FilterFlip = {
	id: string;
	request: string;
	field: string;
	before: ExpectedValue | null;
	after: ExpectedValue | null;
};

/**
 * Lists the fields whose value flipped between a first run and a second run
 * of the same set, at the first run's gates by default. The second run never
 * changes the verdict; it says how much of the first run sat on a gate.
 */
export function compareFilterRuns(
	first: FilterRun,
	second: FilterRun,
	{ gates: overrides = {} }: { gates?: Record<string, number> } = {},
): FilterFlip[] {
	const gates = { ...first.gates, ...overrides };
	for (const [name, gate] of Object.entries(gates)) {
		checkGate(gate, `the gate of field "${name}"`);
	}
	const again = new Map(second.rows.map((row) => [row.id, row]));
	const flips: FilterFlip[] = [];
	for (const row of first.rows) {
		const other = again.get(row.id);
		if (row.error || !other || other.error) continue;
		for (const [name, gate] of Object.entries(gates)) {
			const before = readField(row, name, gate).value;
			const after = readField(other, name, gate).value;
			if (!sameValue(before, after)) {
				flips.push({
					id: row.id,
					request: row.request,
					field: name,
					before,
					after,
				});
			}
		}
	}
	return flips;
}
