import type { AmountRange, DateRange } from "../filter.ts";
import { HELD } from "./held.ts";

/**
 * What a filter row expects: `filterable` names a value for each field it
 * mentions, `ambiguous` marks at least one field `"held"`, since it could mean
 * more than one value, and `nothing` has no field to fill at all.
 */
export type FilterEvalKind = "filterable" | "ambiguous" | "nothing";

/** A catalog field's candidate id, a date field's range, or an amount field's bounds. */
export type ExpectedValue = string | DateRange | AmountRange;

/** One request of a filter eval set, with the filter object a person expects. */
export type FilterEvalRow = {
	id: string;
	request: string;
	kind: FilterEvalKind;
	/**
	 * Per field the request mentions, its value or `"held"`. A field left out
	 * is not mentioned, so it must stay empty too.
	 */
	expected: Record<string, ExpectedValue | typeof HELD>;
};

const KEYS = new Set(["id", "request", "kind", "expected"]);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isKind(kind: unknown): kind is FilterEvalKind {
	return kind === "filterable" || kind === "ambiguous" || kind === "nothing";
}

/** Whether an expected value is a date range: `from` and `to` only, each a YYYY-MM-DD day. */
export function isDateRange(value: unknown): value is DateRange {
	return shaped(
		value,
		["from", "to"],
		(v) => typeof v === "string" && ISO_DAY.test(v),
	);
}

/** Whether an expected value is an amount: `min`, `max`, `exact` as numbers, and a `currency` code. */
export function isAmountRange(value: unknown): value is AmountRange {
	if (!shaped(value, ["min", "max", "exact", "currency"], () => true)) {
		return false;
	}
	const { currency, ...bounds } = value as Record<string, unknown>;
	return (
		Object.keys(bounds).length > 0 &&
		Object.values(bounds).every((v) => typeof v === "number") &&
		(currency === undefined || typeof currency === "string")
	);
}

function shaped(
	value: unknown,
	keys: string[],
	valid: (v: unknown) => boolean,
): boolean {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const entries = Object.entries(value);
	return (
		entries.length > 0 &&
		entries.every(([key, v]) => keys.includes(key) && valid(v))
	);
}

function isExpectedValue(value: unknown): value is ExpectedValue {
	return (
		(typeof value === "string" && value !== "") ||
		isDateRange(value) ||
		isAmountRange(value)
	);
}

/**
 * Reads a filter eval set, one JSON object per line: `{ "id", "request",
 * "kind", "expected" }`, where `expected` maps each mentioned field to its
 * value or `"held"`. A row without an id is named by its line. Throws on the
 * first row that is not one, naming its line. Whether each field exists and
 * takes that kind of value is checked against the filter, before a run.
 */
export function parseFilterEvalSet(jsonl: string): FilterEvalRow[] {
	const rows: FilterEvalRow[] = [];
	const lineOf = new Map<string, number>();
	jsonl.split("\n").forEach((text, index) => {
		if (!text.trim()) return;
		const line = index + 1;
		const invalid = (why: string) =>
			new Error(`justask: filter eval set line ${line}: ${why}`);
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			throw invalid("not JSON");
		}
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			throw invalid("not a JSON object");
		}
		const unknownKey = Object.keys(parsed).find((key) => !KEYS.has(key));
		if (unknownKey) throw invalid(`unknown key "${unknownKey}"`);
		const {
			id = `line-${line}`,
			request,
			kind,
			expected = {},
		} = parsed as Record<string, unknown>;
		if (typeof id !== "string" || !id) {
			throw invalid('"id" must be a non-empty string');
		}
		if (typeof request !== "string" || !request.trim()) {
			throw invalid('"request" must be a non-empty string');
		}
		if (!isKind(kind)) {
			throw invalid('"kind" must be filterable, ambiguous or nothing');
		}
		if (
			typeof expected !== "object" ||
			expected === null ||
			Array.isArray(expected)
		) {
			throw invalid('"expected" must map each field to its value');
		}
		const fields = Object.entries(expected);
		for (const [field, value] of fields) {
			if (value !== HELD && !isExpectedValue(value)) {
				throw invalid(
					`field "${field}" expects a catalog id, a date range of YYYY-MM-DD days, an amount, or "held"`,
				);
			}
		}
		const held = fields.some(([, value]) => value === HELD);
		if (kind === "nothing" && fields.length > 0) {
			throw invalid('a nothing row expects no field; leave "expected" out');
		}
		if (kind === "filterable" && fields.length === 0) {
			throw invalid("a filterable row expects at least one field");
		}
		if (kind === "filterable" && held) {
			throw invalid("only an ambiguous row expects a field held");
		}
		if (kind === "ambiguous" && !held) {
			throw invalid('an ambiguous row expects at least one field "held"');
		}
		const used = lineOf.get(id);
		if (used) throw invalid(`the id "${id}" is already used on line ${used}`);
		lineOf.set(id, line);
		rows.push({
			id,
			request,
			kind,
			expected: expected as FilterEvalRow["expected"],
		});
	});
	if (rows.length === 0) {
		throw new Error("justask: the filter eval set has no rows");
	}
	return rows;
}
