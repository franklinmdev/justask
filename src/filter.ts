import type { AmountReading, DateReading, Parser } from "./parse.ts";
import { type Pick, readPick } from "./pick.ts";
import type { Probabilities, ProviderAnswer, Question } from "./provider.ts";
import type { Candidate, Shortlist } from "./search.ts";

export const NOT_MENTIONED = "not_mentioned";
export const NOT_AVAILABLE = "not_available";

/** The two labels every field's question carries besides its candidates. */
export const MISSING = [NOT_MENTIONED, NOT_AVAILABLE] as const;

/** A field whose candidates are rows of the host app's own catalog. */
export type CatalogField<T> = {
	kind: "catalog";
	/** What the field means in the host app, used in its question. */
	description: string;
	/** The probability the pick needs before the field fills. No default (ADR 0003). */
	gate: number;
	shortlist: Shortlist<T>;
};

/** A field whose candidates are the dates and periods the parsers read, filled as a range of days. */
export type DateField = {
	kind: "date";
	/** What the field means in the host app, used in its questions. */
	description: string;
	/** The probability every one of the field's picks needs before it fills. No default (ADR 0003). */
	gate: number;
};

/** A field whose candidates are the amounts the parsers read, filled as bounds. */
export type AmountField = {
	kind: "amount";
	/** What the field means in the host app, used in its questions. */
	description: string;
	/** The probability every one of the field's picks needs before it fills. No default (ADR 0003). */
	gate: number;
};

/** One named part of a filter, declared with its kind, description and gate. */
export type Field = CatalogField<unknown> | DateField | AmountField;

export type Fields = Record<string, Field>;

export type Filter<F extends Fields> = {
	/** What one row of the host app's table is, used in every question. */
	description: string;
	fields: F;
	/** The host app's own parsers, run beside the built-in one; their readings win where they overlap. */
	parsers?: Parser[];
};

/** A date field's value: the first and last day it covers, YYYY-MM-DD. Either may be open. */
export type DateRange = { from?: string; to?: string };

/** An amount field's value, with the currency when the request says which. */
export type AmountRange = {
	min?: number;
	max?: number;
	exact?: number;
	/** An ISO 4217 code. */
	currency?: string;
};

/** The value a field fills with, inferred from its declaration. */
export type FieldValue<F extends Field> =
	F extends CatalogField<infer T>
		? T
		: F extends DateField
			? DateRange
			: F extends AmountField
				? AmountRange
				: never;

/**
 * The filter object the host app's table understands. A held field's key is
 * left out, exactly as when the request never mentioned it.
 */
export type FilterValue<F extends Fields> = {
	[K in keyof F]?: FieldValue<F[K]>;
};

/** One question's answer: the pick, and every label's probability. */
export type FieldAnswer = {
	/** Null on a tie for first place. */
	pick: Pick | null;
	probabilities: Probabilities;
};

export type CatalogFieldResult<T> = {
	candidates: Candidate<T>[];
	/** Null when there was no answer, or on a tie for first place. */
	pick: Pick | null;
	/** Every label's probability; empty when the field was not asked or there was no answer. */
	probabilities: Probabilities;
	gate: number;
};

/**
 * A date or amount field asks several questions: a date field where the
 * period starts (`from`) and ends (`to`), an amount field what each number
 * does, keyed by the number's candidate id.
 */
export type ParsedFieldResult<T> = {
	candidates: Candidate<T>[];
	/** Empty when the field was not asked or there was no answer. */
	answers: Record<string, FieldAnswer>;
	gate: number;
};

export type FieldResult<F extends Field> =
	F extends CatalogField<infer T>
		? CatalogFieldResult<T>
		: F extends DateField
			? ParsedFieldResult<DateReading>
			: ParsedFieldResult<AmountReading>;

export type FilterResult<F extends Fields> = {
	value: FilterValue<F>;
	fields: { [K in keyof F]: FieldResult<F[K]> };
};

/**
 * Reads a field's answer through its gate: the id of the candidate that fills
 * the field, or null when it is held. A missing label or a tie holds the field
 * whatever its probability.
 */
export function gateField(
	probabilities: Probabilities,
	gate: number,
): { pick: Pick | null; filled: string | null } {
	const pick = readPick(probabilities);
	const filled =
		pick &&
		!(MISSING as readonly string[]).includes(pick.label) &&
		pick.probability >= gate
			? pick.label
			: null;
	return { pick, filled };
}

/** A field's questions, and how to build its result from the provider's answer. */
export type FieldPlan = {
	questions: Question[];
	/** The result with nothing answered: every question unasked, the field held. */
	held: CatalogFieldResult<unknown> | ParsedFieldResult<unknown>;
	read(answer: ProviderAnswer): {
		result: CatalogFieldResult<unknown> | ParsedFieldResult<unknown>;
		/** Present only when the field fills. */
		value?: unknown;
	};
};

/** The ids a field's questions take, besides its own name, so two fields never share one. */
export function questionIds(name: string, field: Field): RegExp {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	if (field.kind === "date") return new RegExp(`^${escaped}_(from|to)$`);
	if (field.kind === "amount") return new RegExp(`^${escaped}_a\\d+$`);
	return new RegExp(`^${escaped}$`);
}

export function catalogPlan(
	name: string,
	filter: Filter<Fields>,
	field: CatalogField<unknown>,
	candidates: Candidate<unknown>[],
): FieldPlan {
	const held = { candidates, pick: null, probabilities: {}, gate: field.gate };
	return {
		questions:
			candidates.length > 0
				? [catalogQuestion(name, filter, field, candidates)]
				: [],
		held,
		read(answer) {
			const probabilities = answer[name] ?? {};
			const { pick, filled } = gateField(probabilities, field.gate);
			const result = { ...held, pick, probabilities };
			const winner = candidates.find(({ id }) => id === filled);
			return winner ? { result, value: winner.value } : { result };
		},
	};
}

/**
 * Two questions over every date candidate: where the period starts, where it
 * ends. The field fills when both picks clear its gate, at least one is a
 * candidate, neither is `not_available`, and the start is not after the end.
 */
export function datePlan(
	name: string,
	filter: Filter<Fields>,
	field: DateField,
	candidates: Candidate<DateReading>[],
): FieldPlan {
	const held = { candidates, answers: {}, gate: field.gate };
	const ends = ["from", "to"] as const;
	return {
		questions:
			candidates.length > 0
				? ends.map((end) =>
						dateQuestion(`${name}_${end}`, end, filter, field, candidates),
					)
				: [],
		held,
		read(answer) {
			const [from, to] = ends.map((end) =>
				answerOf(answer[`${name}_${end}`]),
			) as [FieldAnswer, FieldAnswer];
			const result = { ...held, answers: { from, to } };
			if (!clearsGate([from, to], field.gate)) return { result };
			const start = candidates.find(({ id }) => id === from.pick?.label);
			const end = candidates.find(({ id }) => id === to.pick?.label);
			if (!start && !end) return { result };
			const value: DateRange = {};
			if (start) value.from = start.value.from;
			if (end) value.to = end.value.to;
			if (value.from && value.to && value.from > value.to) return { result };
			return { result, value };
		},
	};
}

const ROLES = ["min", "max", "exact"] as const;

/**
 * One question per amount candidate: what the number does to the field. The
 * field fills when every pick clears its gate and none is `not_available`,
 * each part is played by one number at most, an exact amount comes alone, the
 * minimum is not above the maximum, and the numbers name one currency at most.
 * A number whose currency does not resolve against the local one holds the
 * whole field before any question, so the number never fills alone.
 */
export function amountPlan(
	name: string,
	filter: Filter<Fields>,
	field: AmountField,
	candidates: Candidate<AmountReading>[],
): FieldPlan {
	const held = { candidates, answers: {}, gate: field.gate };
	if (candidates.some(({ value }) => value.unresolved !== undefined)) {
		return { questions: [], held, read: () => ({ result: held }) };
	}
	return {
		questions: candidates.map((candidate) =>
			amountQuestion(`${name}_${candidate.id}`, filter, field, candidate),
		),
		held,
		read(answer) {
			const answers: Record<string, FieldAnswer> = {};
			for (const { id } of candidates) {
				answers[id] = answerOf(answer[`${name}_${id}`]);
			}
			const result = { ...held, answers };
			if (!clearsGate(Object.values(answers), field.gate)) return { result };
			const value: AmountRange = {};
			const currencies = new Set<string>();
			for (const { id, value: reading } of candidates) {
				const role = ROLES.find((role) => role === answers[id]?.pick?.label);
				if (!role) continue;
				if (value[role] !== undefined) return { result };
				value[role] = reading.value;
				if (reading.currency) currencies.add(reading.currency);
			}
			const bounded = value.min !== undefined || value.max !== undefined;
			if (!bounded && value.exact === undefined) return { result };
			if (bounded && value.exact !== undefined) return { result };
			if (
				value.min !== undefined &&
				value.max !== undefined &&
				value.min > value.max
			) {
				return { result };
			}
			if (currencies.size > 1) return { result };
			const [currency] = currencies;
			if (currency) value.currency = currency;
			return { result, value };
		},
	};
}

function answerOf(probabilities: Probabilities = {}): FieldAnswer {
	return { pick: readPick(probabilities), probabilities };
}

/** Every pick clears the gate, and none says the request asks for what no candidate expresses. */
function clearsGate(answers: FieldAnswer[], gate: number): boolean {
	return answers.every(
		({ pick }) =>
			pick !== null && pick.probability >= gate && pick.label !== NOT_AVAILABLE,
	);
}

const WEEKDAY_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayName(iso: string): string {
	const day = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
	return `${WEEKDAY_EN[day]} ${iso}`;
}

/** What the provider reads about a date candidate, as in the lab. */
export function describeDate({ text, from, to, note }: DateReading): string {
	const span =
		from === to
			? `the single day ${dayName(from)}`
			: `${dayName(from)} to ${dayName(to)}, both included`;
	return `"${text}": ${span}${note ? ` (${note})` : ""}`;
}

/** What the provider reads about an amount candidate: its value is already read. */
export function describeAmount({
	text,
	value,
	currency,
}: AmountReading): string {
	const named = currency
		? `${value} ${currency} (${new Intl.DisplayNames("en", { type: "currency" }).of(currency)})`
		: `${value}, the request does not say in which currency`;
	return `"${text}": ${named}`;
}

function missingLabels(notMentioned: string, notAvailable: string) {
	return [
		{ label: NOT_MENTIONED, description: notMentioned },
		{ label: NOT_AVAILABLE, description: notAvailable },
	];
}

export function catalogQuestion(
	id: string,
	filter: Filter<Fields>,
	field: Field,
	candidates: Candidate<unknown>[],
): Question {
	return {
		id,
		instruction: `The request filters a table of ${filter.description}. Which candidate is ${field.description}? Pick "${NOT_MENTIONED}" when the request says nothing about it, and "${NOT_AVAILABLE}" when it asks for one that no candidate expresses.`,
		labels: [
			...candidates.map(({ id, description }) => ({
				label: id,
				description,
			})),
			...missingLabels(
				`The request says nothing about ${field.description}`,
				`The request asks for ${field.description} that none of the other candidates expresses`,
			),
		],
	};
}

function dateQuestion(
	id: string,
	end: "from" | "to",
	filter: Filter<Fields>,
	field: DateField,
	candidates: Candidate<DateReading>[],
): Question {
	const [where, names] =
		end === "from"
			? [
					"start",
					`"desde", "since", "after" and "a partir de" name the start. "hasta", "until" and "before" name only an end, so the start is not mentioned.`,
				]
			: [
					"end",
					`"hasta", "until", "before" and "antes de" name the end. "desde", "since" and "after" name only a start, so the end is not mentioned.`,
				];
	return {
		id,
		instruction: `The request filters a table of ${filter.description}. Where does the period of ${field.description} ${where}? Each candidate is a date or period the code already read from the request; never compute a date yourself. A single named period such as "last week", "in August" or "ayer" is both the start and the end, so pick it here too. ${names} When one piece of text has two readings, pick the reading the language of the request uses.`,
		labels: [
			...candidates.map(({ id, description }) => ({
				label: id,
				description,
			})),
			...missingLabels(
				`The request puts no ${where} on ${field.description}`,
				`The request names a ${where} for ${field.description} that none of the other candidates captures`,
			),
		],
	};
}

function amountQuestion(
	id: string,
	filter: Filter<Fields>,
	field: AmountField,
	candidate: Candidate<AmountReading>,
): Question {
	return {
		id,
		instruction: `The request filters a table of ${filter.description}. The code found the number ${candidate.description} in the request, its value and currency already read. What does it do to ${field.description}? Judge only the words around it. Between two numbers ("entre 500 y 1,000", "from 500 to 1,000") the lower is the min and the higher is the max.`,
		labels: [
			{
				label: "min",
				description: `Rows at or above it: "más de", "mayor que", "over", "at least", "above", "desde"`,
			},
			{
				label: "max",
				description: `Rows at or below it: "menos de", "hasta", "under", "at most", "below", "no más de"`,
			},
			{
				label: "exact",
				description: `Rows for exactly that amount: "de 500", "por 500", "for 500", "exactly"`,
			},
			...missingLabels(
				`The number is not about ${field.description} at all: a count of rows, a rank, a page or part of a name`,
				`The number sets a condition on ${field.description} that min, max and exact cannot express, such as "around" or "not equal to"`,
			),
		],
	};
}
