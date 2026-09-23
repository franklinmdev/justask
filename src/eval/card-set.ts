import type { Amount } from "../card.ts";
import { HELD } from "./held.ts";

/**
 * What a card row expects: `record` asks for a new record and names a value
 * for each field it mentions, `ambiguous` asks for one too but marks at least
 * one field `"held"`, since it could mean more than one value, and `nothing`
 * asks for no new record at all.
 */
export type CardEvalKind = "record" | "ambiguous" | "nothing";

/**
 * A catalog field's candidate id, a several-item field's ids, a date field's
 * YYYY-MM-DD day, a time field's HH:MM, or an amount field's value and currency.
 */
export type CardExpectedValue = string | string[] | Amount;

/** One request of a card eval set, with the record a person expects. */
export type CardEvalRow = {
	id: string;
	request: string;
	kind: CardEvalKind;
	/**
	 * Per field the request mentions, its value or `"held"`. A field left out
	 * is not mentioned, so it must stay empty too.
	 */
	expected: Record<string, CardExpectedValue | typeof HELD>;
};

const KEYS = new Set(["id", "request", "kind", "expected"]);

function isKind(kind: unknown): kind is CardEvalKind {
	return kind === "record" || kind === "ambiguous" || kind === "nothing";
}

/** Whether an expected value is an amount: a `value` number, and a `currency` code. */
export function isAmount(value: unknown): value is Amount {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const { value: number, currency, ...rest } = value as Record<string, unknown>;
	return (
		Object.keys(rest).length === 0 &&
		typeof number === "number" &&
		(currency === undefined || typeof currency === "string")
	);
}

/** Whether an expected value is a several-item field's ids: a list of distinct, non-empty ids. */
export function isIds(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((id) => typeof id === "string" && id !== "") &&
		new Set(value).size === value.length
	);
}

function isExpectedValue(value: unknown): value is CardExpectedValue {
	return (
		(typeof value === "string" && value !== "" && value !== HELD) ||
		isIds(value) ||
		isAmount(value)
	);
}

/**
 * Reads a card eval set, one JSON object per line: `{ "id", "request",
 * "kind", "expected" }`, where `expected` maps each mentioned field to its
 * value or `"held"`. A row without an id is named by its line. Throws on the
 * first row that is not one, naming its line. Whether each field exists and
 * takes that kind of value is checked against the card, before a run.
 */
export function parseCardEvalSet(jsonl: string): CardEvalRow[] {
	const rows: CardEvalRow[] = [];
	const lineOf = new Map<string, number>();
	jsonl.split("\n").forEach((text, index) => {
		if (!text.trim()) return;
		const line = index + 1;
		const invalid = (why: string) =>
			new Error(`justask: card eval set line ${line}: ${why}`);
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
			throw invalid('"kind" must be record, ambiguous or nothing');
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
					`field "${field}" expects a catalog id, a list of ids, a day, a time, an amount, or "held"`,
				);
			}
		}
		const held = fields.some(([, value]) => value === HELD);
		if (kind === "nothing" && fields.length > 0) {
			throw invalid('a nothing row expects no field; leave "expected" out');
		}
		if (kind === "record" && fields.length === 0) {
			throw invalid("a record row expects at least one field");
		}
		if (kind === "record" && held) {
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
			expected: expected as CardEvalRow["expected"],
		});
	});
	if (rows.length === 0) {
		throw new Error("justask: the card eval set has no rows");
	}
	return rows;
}
