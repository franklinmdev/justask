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
import type { FilterRun, FilterRunRow } from "./filter-run.ts";
import {
	type ExpectedValue,
	type FilterEvalKind,
	HELD,
	isAmountRange,
	isDateRange,
} from "./filter-set.ts";
import {
	costPerCall,
	judge,
	type Measures,
	percentile,
	ratio,
	type Verdict,
} from "./score.ts";

/** One field over a run, at its gate, with what its gate is fixed from. */
export type FieldStats = {
	gate: number;
	/** Rows that expect a value in this field. */
	expected: number;
	/** Of those, the ones the field filled at its gate. */
	filled: number;
	/** Of those, the ones it filled with the expected value. */
	right: number;
	/** Rows the field filled at its gate with anything but the expected value, or where none belongs. */
	wrong: number;
	/**
	 * Read with no gate: the lowest probability behind a right value, and the
	 * highest behind a wrong one. A field's probability is its weakest pick.
	 * Null when there was none.
	 */
	lowestRight: number | null;
	highestWrong: number | null;
};

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
	/** The field's weakest pick; null when the field was not asked. */
	probability: number | null;
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
	/** Filled and wrong first, surest first; then held and wrong, in set order. */
	misses: FilterMiss[];
	/** Checked against the kill lines saved with the run; null when retuned. */
	verdict: Verdict | null;
};

/** Reads a field with no gate: every pick counts, whatever its probability. */
const NO_GATE = Number.MIN_VALUE;

/** The plans only read answers here; the questions they build are never asked. */
const REREAD: Filter<Fields> = { description: "", fields: {} };

/**
 * A field's value at a gate, as `ask` builds it: a catalog field's candidate
 * id, a date range or an amount. Null when the field is held.
 */
export function readField(
	row: FilterRunRow,
	name: string,
	gate: number,
): { value: ExpectedValue | null; probability: number | null } {
	const logged = row.fields[name];
	if (!logged || row.error) return { value: null, probability: null };
	if (logged.kind === "catalog") {
		if (logged.candidates.length === 0)
			return { value: null, probability: null };
		const { pick, filled } = gateField(row.answers[name] ?? {}, gate);
		return { value: filled, probability: pick?.probability ?? null };
	}
	if (logged.candidates.length === 0) return { value: null, probability: null };
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
	if (plan.questions.length === 0) return { value: null, probability: null };
	const { result, value } = plan.read(row.answers);
	const picks = Object.values(
		(result as { answers: Record<string, FieldAnswer> }).answers,
	).map(({ pick }) => pick);
	const probability = picks.every((pick) => pick !== null)
		? Math.min(...picks.map((pick) => pick?.probability ?? 0))
		: null;
	return {
		value: (value as DateRange | AmountRange | undefined) ?? null,
		probability,
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

	const measures: Measures = {
		exact: ratio(exact.length, covered.length),
		coverage: ratio(covered.length, filterable.length),
		invented: invented.length,
		heldAmbiguous: ratio(ambiguous.length - leaked.length, ambiguous.length),
		p95Ms: percentile(
			answered.map(({ latencyMs }) => latencyMs),
			95,
		),
		errors: run.rows.length - answered.length,
	};

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
		verdict: retuned ? null : judge(run.killLines, measures),
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
	const stats: FieldStats = {
		gate,
		expected: 0,
		filled: 0,
		right: 0,
		wrong: 0,
		lowestRight: null,
		highestWrong: null,
	};
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
		if (sameValue(bare.value, expected)) {
			stats.lowestRight = Math.min(
				stats.lowestRight ?? bare.probability,
				bare.probability,
			);
		} else {
			stats.highestWrong = Math.max(
				stats.highestWrong ?? bare.probability,
				bare.probability,
			);
		}
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
