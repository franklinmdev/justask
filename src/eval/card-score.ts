import {
	type CardField,
	type Card as CardShape,
	cardPlan,
	INTENT,
	NEW_RECORD,
	NO_READINGS,
	readIntent,
} from "../card.ts";
import type { FieldAnswer } from "../filter.ts";
import { checkGate } from "../gate.ts";
import { readPick } from "../pick.ts";
import type { CardRun, CardRunRow, LoggedCardField } from "./card-run.ts";
import {
	type CardEvalKind,
	type CardExpectedValue,
	isAmount,
} from "./card-set.ts";
import type { FieldStats } from "./filter-score.ts";
import { HELD } from "./filter-set.ts";
import {
	costPerCall,
	judge,
	type Measures,
	measuresOf,
	ratio,
	type Verdict,
} from "./score.ts";

/** A field the card got wrong, or the intent when it held a record or let a nothing row through. */
export type CardMiss = {
	id: string;
	request: string;
	kind: CardEvalKind;
	/** A field's name, or `intent`. */
	field: string;
	/**
	 * The expected value, `"held"`, or null when the request does not mention
	 * the field. For the intent, `new_record`, or null on a nothing row.
	 */
	expected: CardExpectedValue | typeof HELD | null;
	/** The value the field filled with (a catalog field's candidate id), or null when held. */
	got: CardExpectedValue | null;
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

export type CardReport = {
	/** The intent's gate, under `intent`, and each field's. */
	gates: Record<string, number>;
	/** True when scored at any gate other than the run's own: no verdict then. */
	retuned: boolean;
	rows: number;
	measures: Measures;
	counts: {
		/** Answered record and ambiguous rows: every row that asks for a new record. */
		cards: number;
		/** Cards that filled at least one field: the denominator of exact. */
		filled: number;
		/** Of those, the ones with no field filled wrong: nothing for the person to correct. */
		exact: number;
		/** Fields the cards expect a value in: the denominator of coverage. */
		fieldsExpected: number;
		/** Of those, the ones that filled. */
		fieldsFilled: number;
		nothing: number;
		ambiguous: number;
		/** Ambiguous rows where every field marked held stayed empty. */
		held: number;
	};
	/** Ids of nothing rows that filled any field. */
	invented: string[];
	/** Ids of ambiguous rows that filled a field marked held. */
	leaked: string[];
	/**
	 * The intent over the run: a card that asks for a new record and passes
	 * is right, a nothing row that passes is wrong. Its picks are
	 * `new_record`'s probabilities.
	 */
	intent: FieldStats;
	fields: Record<string, FieldStats>;
	/** Null when the provider did not report every call's cost. */
	costPerCallUsd: number | null;
	/** Filled and wrong first, surest first; then held and wrong, in set order. */
	misses: CardMiss[];
	/** Checked against the kill lines saved with the run; null when retuned. */
	verdict: Verdict | null;
};

/** Reads a field with no gate: every pick counts, whatever its probability. */
const NO_GATE = Number.MIN_VALUE;

/** The plans only read answers here; the questions they build are never asked. */
const REREAD: CardShape<Record<string, CardField>> = {
	description: "",
	gate: NO_GATE,
	fields: {},
};

/** A field read at a gate: its value, and its weakest pick's probability and label. */
type FieldReading = {
	value: CardExpectedValue | null;
	probability: number | null;
	label: string | null;
};

const UNASKED: FieldReading = { value: null, probability: null, label: null };

/**
 * A field's value at its gate, as `ask` builds it, the intent aside: a
 * catalog field's candidate id, a several-item field's ids, a day, a time or
 * an amount. Null when the field is held.
 */
function readField(row: CardRunRow, name: string, gate: number): FieldReading {
	const logged = row.fields[name];
	if (!logged || row.error || logged.candidates.length === 0) return UNASKED;
	const plan = cardPlan(
		name,
		REREAD,
		declared(logged, gate),
		logged.kind === "catalog" || logged.kind === "several"
			? logged.candidates.map(({ id, description }) => ({
					id,
					description,
					value: id,
				}))
			: [],
		{
			...NO_READINGS,
			...(logged.kind === "date" && { dates: logged.candidates }),
			...(logged.kind === "time" && { times: logged.candidates }),
			...(logged.kind === "amount" && { amounts: logged.candidates }),
		},
	);
	const { result, value } = plan.read(row.answers);
	const picks =
		"answers" in result
			? Object.values(result.answers as Record<string, FieldAnswer>).map(
					({ pick }) => pick,
				)
			: [result.pick];
	const weakest = picks.every((pick) => pick !== null)
		? picks.reduce((a, b) =>
				(b?.probability ?? 1) < (a?.probability ?? 1) ? b : a,
			)
		: null;
	return {
		value: (value as CardExpectedValue | undefined) ?? null,
		probability: weakest?.probability ?? null,
		label: weakest?.label ?? null,
	};
}

/** A stand-in declaration of a logged field, so `cardPlan` rebuilds it at a gate. */
function declared(logged: LoggedCardField, gate: number): CardField {
	const base = { description: "", gate };
	switch (logged.kind) {
		case "catalog":
			return { ...base, kind: "catalog", shortlist: () => [] };
		case "several":
			return { ...base, kind: "catalog", several: true, shortlist: () => [] };
		case "date":
			return { ...base, kind: "date", reads: "past" };
		case "time":
			return { ...base, kind: "time" };
		case "amount":
			return { ...base, kind: "amount" };
	}
}

/** Throws on the first gate that is not one, naming the card's or the field's. */
function checkGates(gates: Record<string, number>): void {
	for (const [name, gate] of Object.entries(gates)) {
		checkGate(
			gate,
			name === INTENT ? "the card's gate" : `the gate of field "${name}"`,
		);
	}
}

/** The intent's pick, and whether it lets the card fill at this gate. */
function readRowIntent(row: CardRunRow, gate: number) {
	if (row.error) return { passes: false, pick: null };
	const { result, passes } = readIntent(row.answers[INTENT] ?? {}, gate);
	return { passes, pick: result.pick };
}

/** Whether a filled value is the expected one: same id, same ids in any order, same day, time or amount. */
export function sameCardValue(
	a: CardExpectedValue | null,
	b: CardExpectedValue | null,
): boolean {
	if (a === null || b === null) return a === b;
	if (Array.isArray(a) || Array.isArray(b)) {
		return (
			Array.isArray(a) &&
			Array.isArray(b) &&
			a.length === b.length &&
			a.every((id) => b.includes(id))
		);
	}
	if (typeof a === "string" || typeof b === "string") return a === b;
	return a.value === b.value && a.currency === b.currency;
}

/** The value a row expects in a field; null when held or not mentioned. */
function expectedValue(
	row: CardRunRow,
	name: string,
): CardExpectedValue | null {
	const value = row.expected[name];
	return value === undefined || value === HELD ? null : value;
}

/** The card at its gates: each field's reading, emptied when the intent holds the card. */
function readCard(row: CardRunRow, gates: Record<string, number>) {
	const intent = readRowIntent(row, gates[INTENT] as number);
	const at: Record<string, FieldReading> = {};
	for (const [name, gate] of Object.entries(gates)) {
		if (name === INTENT) continue;
		const reading = readField(row, name, gate);
		at[name] = intent.passes ? reading : { ...reading, value: null };
	}
	return { intent, at };
}

/**
 * Scores a saved card run, by default at the gates it was run under, which
 * gives the verdict. Other gates, the intent's or any field's, rescore the
 * same answers with no provider call and give no verdict. Error rows count as
 * errors, and in cost when the call was paid for.
 *
 * A card is scored as the person meets it: exact is the share of the cards
 * that filled anything with nothing to correct (a held field is not a
 * correction), coverage the share of the fields the cards expect that filled.
 */
export function scoreCardRun(
	run: CardRun,
	{ gates: overrides = {} }: { gates?: Record<string, number> } = {},
): CardReport {
	const gates = { ...run.gates, ...overrides };
	checkGates(gates);
	const names = Object.keys(gates).filter((name) => name !== INTENT);
	const answered = run.rows.filter((row) => !row.error);
	const read = answered.map((row) => ({ row, ...readCard(row, gates) }));
	const filledIn = (at: Record<string, FieldReading>) =>
		names.filter((name) => at[name]?.value != null);
	const wrongIn = (row: CardRunRow, at: Record<string, FieldReading>) =>
		filledIn(at).filter(
			(name) =>
				!sameCardValue(at[name]?.value ?? null, expectedValue(row, name)),
		);

	const cards = read.filter(({ row }) => row.kind !== "nothing");
	const filled = cards.filter(({ at }) => filledIn(at).length > 0);
	const exact = filled.filter(({ row, at }) => wrongIn(row, at).length === 0);
	let fieldsExpected = 0;
	let fieldsFilled = 0;
	for (const { row, at } of cards) {
		for (const name of names) {
			if (expectedValue(row, name) === null) continue;
			fieldsExpected++;
			if (at[name]?.value != null) fieldsFilled++;
		}
	}
	const nothing = read.filter(({ row }) => row.kind === "nothing");
	const invented = nothing.filter(({ at }) => filledIn(at).length > 0);
	const ambiguous = read.filter(({ row }) => row.kind === "ambiguous");
	const leaked = ambiguous.filter(({ row, at }) =>
		Object.entries(row.expected).some(
			([name, value]) => value === HELD && at[name]?.value != null,
		),
	);

	const measures: Measures = {
		...measuresOf(run.rows, {
			exact: exact.length,
			covered: filled.length,
			expected: cards.length,
			invented: invented.length,
			ambiguous: ambiguous.length,
			held: ambiguous.length - leaked.length,
		}),
		// A card's coverage counts fields, not rows: a card that fills three of
		// its four fields still saves the person three.
		coverage: ratio(fieldsFilled, fieldsExpected),
	};

	const misses: CardMiss[] = [];
	for (const { row, intent, at } of read) {
		const wantsRecord = row.kind !== "nothing";
		if (wantsRecord !== intent.passes) {
			misses.push({
				id: row.id,
				request: row.request,
				kind: row.kind,
				field: INTENT,
				expected: wantsRecord ? NEW_RECORD : null,
				got: intent.passes ? NEW_RECORD : null,
				probability: intent.pick?.probability ?? null,
				label: intent.pick?.label ?? null,
				blame: "provider",
			});
		}
		// A held intent explains every held field; a passing one on a nothing row
		// is listed beside the fields it let through.
		if (!intent.passes) continue;
		for (const name of names) {
			const got = at[name]?.value ?? null;
			const wanted = row.expected[name] ?? null;
			const expected = wanted === HELD ? null : wanted;
			if (sameCardValue(got, expected)) continue;
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

	const retuned = Object.keys(gates).some(
		(name) => gates[name] !== run.gates[name],
	);
	return {
		gates,
		retuned,
		rows: run.rows.length,
		measures,
		counts: {
			cards: cards.length,
			filled: filled.length,
			exact: exact.length,
			fieldsExpected,
			fieldsFilled,
			nothing: nothing.length,
			ambiguous: ambiguous.length,
			held: ambiguous.length - leaked.length,
		},
		invented: invented.map(({ row }) => row.id),
		leaked: leaked.map(({ row }) => row.id),
		intent: intentStats(gates[INTENT] as number, read),
		fields: Object.fromEntries(
			names.map((name) => [
				name,
				fieldStats(name, gates[name] as number, read),
			]),
		),
		costPerCallUsd: costPerCall(run.rows),
		misses,
		verdict: retuned ? null : judge(run.killLines, measures),
	};
}

type Read = {
	row: CardRunRow;
	intent: { passes: boolean };
	at: Record<string, FieldReading>;
};

function intentStats(gate: number, read: Read[]): FieldStats {
	const stats: FieldStats = {
		gate,
		expected: 0,
		filled: 0,
		right: 0,
		wrong: 0,
		lowestRight: null,
		highestWrong: null,
	};
	for (const { row, intent } of read) {
		const wantsRecord = row.kind !== "nothing";
		if (wantsRecord) {
			stats.expected++;
			if (intent.passes) {
				stats.filled++;
				stats.right++;
			}
		} else if (intent.passes) {
			stats.wrong++;
		}
		const pick = readPick(row.answers[INTENT] ?? {});
		if (pick?.label !== NEW_RECORD) continue;
		if (wantsRecord) {
			stats.lowestRight = Math.min(
				stats.lowestRight ?? pick.probability,
				pick.probability,
			);
		} else {
			stats.highestWrong = Math.max(
				stats.highestWrong ?? pick.probability,
				pick.probability,
			);
		}
	}
	return stats;
}

/**
 * A field at its gate over the run, the intent applied; its picks read with
 * no gate on the rows that ask for a new record only, since on a nothing row
 * the intent, not the field, keeps the card empty.
 */
function fieldStats(name: string, gate: number, read: Read[]): FieldStats {
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
			if (got !== null && sameCardValue(got, expected)) stats.right++;
		}
		if (got !== null && !sameCardValue(got, expected)) stats.wrong++;
		if (row.kind === "nothing") continue;
		const bare = readField(row, name, NO_GATE);
		if (bare.value === null || bare.probability === null) continue;
		if (sameCardValue(bare.value, expected)) {
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
	row: CardRunRow,
	name: string,
	expected: CardExpectedValue | null,
): CardMiss["blame"] {
	const logged = row.fields[name];
	if (expected === null || !logged) return "provider";
	const ids = logged.candidates.map(({ id }) => id);
	switch (logged.kind) {
		case "catalog":
			return ids.includes(expected as string) ? "provider" : "shortlist";
		case "several":
			return Array.isArray(expected) && expected.every((id) => ids.includes(id))
				? "provider"
				: "shortlist";
		case "date":
			return logged.candidates.some(
				({ value }) => value.from === expected && value.to === expected,
			)
				? "provider"
				: "parser";
		case "time":
			return logged.candidates.some(({ value }) => value.time === expected)
				? "provider"
				: "parser";
		case "amount":
			return isAmount(expected) &&
				logged.candidates.some(({ value }) => value.value === expected.value)
				? "provider"
				: "parser";
	}
}

/** A field whose value changed between two runs of the same set, the intent applied. */
export type CardFlip = {
	id: string;
	request: string;
	field: string;
	before: CardExpectedValue | null;
	after: CardExpectedValue | null;
};

/**
 * Lists the fields whose value flipped between a first run and a second run
 * of the same set, at the first run's gates by default. A card the intent
 * held on one run and not the other flips every field it fills. The second
 * run never changes the verdict; it says how much of the first run sat on a
 * gate.
 */
export function compareCardRuns(
	first: CardRun,
	second: CardRun,
	{ gates: overrides = {} }: { gates?: Record<string, number> } = {},
): CardFlip[] {
	const gates = { ...first.gates, ...overrides };
	checkGates(gates);
	const again = new Map(second.rows.map((row) => [row.id, row]));
	const flips: CardFlip[] = [];
	for (const row of first.rows) {
		const other = again.get(row.id);
		if (row.error || !other || other.error) continue;
		const before = readCard(row, gates).at;
		const after = readCard(other, gates).at;
		for (const name of Object.keys(before)) {
			const was = before[name]?.value ?? null;
			const is = after[name]?.value ?? null;
			if (!sameCardValue(was, is)) {
				flips.push({
					id: row.id,
					request: row.request,
					field: name,
					before: was,
					after: is,
				});
			}
		}
	}
	return flips;
}
