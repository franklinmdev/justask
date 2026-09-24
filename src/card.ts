import {
	type AmountField,
	type CatalogField,
	type CatalogFieldResult,
	clearsGate,
	type FieldAnswer,
	type FieldPlan,
	NOT_AVAILABLE,
	NOT_MENTIONED,
	type Paired,
	type ParsedFieldResult,
} from "./filter.ts";
import type { Joiners, NamedPair } from "./named-pair.ts";
import type {
	AmountReading,
	DateReading,
	Parser,
	Reads,
	TimeReading,
} from "./parse.ts";
import { type Pick, readPick } from "./pick.ts";
import type { Probabilities, Question } from "./provider.ts";
import type { Candidate, Shortlist } from "./search.ts";

/** The intent question's id, which no card field may take. */
export const INTENT = "intent";
/** The intent question's label for a request that asks for a new record. */
export const NEW_RECORD = "new_record";
/** A several-item catalog question's label for an item the request asks for. */
export const YES = "yes";

/**
 * A catalog field where several items may apply to one record. Each item on
 * the shortlist gets its own yes-or-no question, so combinations are never
 * enumerated.
 */
export type SeveralCatalogField<T> = {
	kind: "catalog";
	several: true;
	/** What the field means in the host app, used in its questions. */
	description: string;
	/** The probability every item's pick needs before the field fills. No default (ADR 0003). */
	gate: number;
	shortlist: Shortlist<T>;
};

/** A card's date field: one day, read from the parsers. */
export type CardDateField = {
	kind: "date";
	/**
	 * Which way a date that does not say its year or week reads: "Friday" is
	 * the last one for an expense's day, the coming one for a due date.
	 */
	reads: Reads;
	/** What the field means in the host app, used in its question. */
	description: string;
	/** The probability the pick needs before the field fills. No default (ADR 0003). */
	gate: number;
};

/** A card's time field: a time of day, read from the parsers. */
export type TimeField = {
	kind: "time";
	/** What the field means in the host app, used in its question. */
	description: string;
	/** The probability the pick needs before the field fills. No default (ADR 0003). */
	gate: number;
};

/** One named part of a card, declared with its kind, description and gate. */
export type CardField =
	| CatalogField<unknown>
	| SeveralCatalogField<unknown>
	| CardDateField
	| TimeField
	| AmountField;

export type CardFields = Record<string, CardField>;

export type Card<F extends CardFields> = {
	/** What one record is, used in every question: "expense the person paid". */
	description: string;
	/**
	 * The probability the intent question's `new_record` pick needs. Below it,
	 * every field is held. No default (ADR 0003).
	 */
	gate: number;
	fields: F;
	/** The host app's own parsers, run beside the built-in one; their readings win where they overlap. */
	parsers?: Parser[];
	/**
	 * Words of a command on a record that already exists, in the card's
	 * language. A request with one of the verbs and one of the references,
	 * each as whole words, ignoring case but not accents, is held whole before
	 * the intent's gate, whatever its pick (ADR 0009).
	 */
	commands?: CardCommands;
	/**
	 * Words that join two items, in the card's language, each one word: `or`
	 * words offer a choice ("or"; "o", "u"), `and` words name both ("and";
	 * "y", "e"). A request that names two items of one catalog field, and no
	 * third, with one of these between them holds that field before its gate,
	 * whatever its pick; an `and` word holds only a field that takes one item
	 * (ADR 0010).
	 */
	joiners?: Joiners;
};

/** A card's command words: "quite", "envíe"; "el gasto", "la factura". */
export type CardCommands = {
	verbs: string[];
	/**
	 * A determiner and a record's noun, so the noun alone in a new record does
	 * not hold it. Up to two words may sit between them: "the $58 Beanhaven
	 * expense" holds on "the expense".
	 */
	references: string[];
};

/** The words of a command that held a card, as the request writes them, in NFC. */
export type CardCommand = { verb: string; reference: string };

/** An amount field's value on a card: the amount, with the currency when the request says which. */
export type Amount = {
	value: number;
	/** An ISO 4217 code. */
	currency?: string;
};

/** The value a card field fills with, inferred from its declaration. */
export type CardFieldValue<F extends CardField> =
	F extends SeveralCatalogField<infer T>
		? T[]
		: F extends CatalogField<infer T>
			? T
			: F extends CardDateField
				? string
				: F extends TimeField
					? string
					: F extends AmountField
						? Amount
						: never;

/** The filled record. A held field's key is left out, exactly as when the request never mentioned it. */
export type CardValue<F extends CardFields> = {
	[K in keyof F]?: CardFieldValue<F[K]>;
};

/**
 * A card field's candidates, picks and gate. A several-item catalog field
 * reports one pick per item, keyed by the item's candidate id.
 */
export type CardFieldResult<F extends CardField> =
	F extends SeveralCatalogField<infer T>
		? ParsedFieldResult<T> & Paired & Implied
		: F extends CatalogField<infer T>
			? CatalogFieldResult<T> & Paired
			: F extends CardDateField
				? CatalogFieldResult<DateReading>
				: F extends TimeField
					? CatalogFieldResult<TimeReading>
					: CatalogFieldResult<AmountReading>;

/** A field filled from another field's item, where its own questions left a gap (ADR 0012). */
export type Implied = {
	/** The field whose filled item implied the value, and that item's id. */
	implied?: { field: string; id: string };
};

/** The intent question's answer and gate. */
export type IntentResult = {
	/** Null when there was no answer, or on a tie for first place. */
	pick: Pick | null;
	/** Every label's probability; empty when there was no answer. */
	probabilities: Probabilities;
	gate: number;
	/** The command that held the card before its gate, whatever the pick. */
	command?: CardCommand;
};

export type CardResult<F extends CardFields> = {
	intent: IntentResult;
	value: CardValue<F>;
	fields: { [K in keyof F]: CardFieldResult<F[K]> };
};

/** The ids a card field's questions take, so two fields, or a field and the intent question, never share one. */
export function cardQuestionIds(name: string, field: CardField): RegExp {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return "several" in field
		? new RegExp(`^${escaped}_.+$`)
		: new RegExp(`^${escaped}$`);
}

/** Whether the intent pick clears the card's gate; a command holds it whatever the pick. */
export function readIntent(
	probabilities: Probabilities,
	gate: number,
	command?: CardCommand,
): { result: IntentResult; passes: boolean } {
	const pick = readPick(probabilities);
	return {
		result: { pick, probabilities, gate, ...(command && { command }) },
		passes: !command && pick?.label === NEW_RECORD && pick.probability >= gate,
	};
}

/**
 * The first reference of the card's commands the request holds, and a verb
 * outside it, as the request writes them in NFC.
 */
export function findCommand(
	request: string,
	commands: CardCommands | undefined,
): CardCommand | undefined {
	if (!commands) return undefined;
	const text = request.normalize("NFC");
	const reference = findPhrase(text, commands.references, { gap: true });
	if (!reference) return undefined;
	// The verb never comes from inside the reference: "the email hosting
	// invoice" is a reference, not "email" and "the invoice".
	const outside =
		text.slice(0, reference.index) +
		" ".repeat(reference.text.length) +
		text.slice(reference.index + reference.text.length);
	const verb = findPhrase(outside, commands.verbs, { gap: false });
	return verb ? { verb: verb.text, reference: reference.text } : undefined;
}

/** Refuses a blank verb or reference, which would match between any two words. */
export function checkCommands(commands: CardCommands | undefined): void {
	if (!commands) return;
	for (const phrase of [...commands.verbs, ...commands.references]) {
		if (!phrase.trim()) {
			throw new TypeError(
				"justask: the card's commands hold a blank verb or reference",
			);
		}
	}
}

/**
 * The first of the phrases, in the phrases' order, found in the text as
 * whole words, ignoring case and spacing, never accents; with where it
 * starts. With `gap`, up to two words may sit between a phrase's first
 * word and the rest: "the $58 Beanhaven expense" is "the expense". A letter,
 * a combining mark, a digit or a hyphen next to the phrase joins it to
 * another word.
 */
function findPhrase(
	text: string,
	phrases: string[],
	{ gap }: { gap: boolean },
): { text: string; index: number } | undefined {
	for (const phrase of phrases) {
		const [first, ...rest] = phrase
			.normalize("NFC")
			.trim()
			.split(/\s+/)
			.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
		const between = gap ? "(?:\\s+\\S+){0,2}?" : "";
		const tail = rest.length > 0 ? `${between}\\s+${rest.join("\\s+")}` : "";
		const found = new RegExp(
			`(?<![\\p{L}\\p{M}\\p{N}-])${first}${tail}(?![\\p{L}\\p{M}\\p{N}-])`,
			"iu",
		).exec(text);
		if (found) return { text: found[0], index: found.index };
	}
	return undefined;
}

/** Whether the request asks for a new record at all, asked before every field. */
export function intentQuestion(card: Card<CardFields>): Question {
	return {
		id: INTENT,
		instruction: `Does the request ask to record a new ${card.description}? Judge the whole request, not only whether it names something a record would hold.`,
		labels: [
			{
				label: NEW_RECORD,
				description: `It asks to record, log or add a new ${card.description}, even in few words`,
			},
			{
				label: NOT_MENTIONED,
				description:
					"It asks for no record at all: a greeting, a note, something unrelated",
			},
			{
				label: NOT_AVAILABLE,
				description: `It is about a ${card.description} but does not add a new one: it changes, cancels, deletes, sends or forwards one, sets one to a new value, or asks a question`,
			},
		],
	};
}

/** The parsers' readings of one request, as candidates. */
export type CandidateReadings = {
	dates: Candidate<DateReading>[];
	times: Candidate<TimeReading>[];
	amounts: Candidate<AmountReading>[];
};

export const NO_READINGS: CandidateReadings = {
	dates: [],
	times: [],
	amounts: [],
};

/**
 * A field that one question fills: a single catalog row, a day, a time or an
 * amount. The pick's candidate holds the field when a parser marked it
 * ambiguous, whatever its probability, before the gate is read. `fill` holds
 * it too, by returning undefined, for a candidate that cannot be the field's
 * value (a period for a day).
 */
function choicePlan<T>(
	name: string,
	question: Question | null,
	candidates: Candidate<T>[],
	gate: number,
	fill: (value: T) => unknown,
	ambiguous: (value: T) => boolean = () => false,
	pair?: NamedPair,
): FieldPlan {
	const held = {
		candidates,
		pick: null,
		probabilities: {},
		gate,
		...(pair && { pair }),
	};
	return {
		questions: question ? [question] : [],
		held,
		read(answer) {
			const probabilities = answer[name] ?? {};
			const pick = readPick(probabilities);
			const result = { ...held, pick, probabilities };
			const winner = candidates.find(({ id }) => id === pick?.label);
			if (pair || !winner || !pick || ambiguous(winner.value)) {
				return { result };
			}
			if (pick.probability < gate) return { result };
			const value = fill(winner.value);
			return value === undefined ? { result } : { result, value };
		},
	};
}

/**
 * A card field's questions, and how to build its value from the provider's
 * picks. A catalog field the request names a pair of is held whatever its
 * picks (ADR 0010).
 */
export function cardPlan(
	name: string,
	card: Card<CardFields>,
	field: CardField,
	catalog: Candidate<unknown>[],
	readings: CandidateReadings,
	pair?: NamedPair,
): FieldPlan {
	if (field.kind === "catalog" && "several" in field) {
		return severalPlan(name, card, field, catalog, pair);
	}
	const ask = <T>(candidates: Candidate<T>[], rules: string) =>
		candidates.length > 0
			? choiceQuestion(name, card, field, candidates, rules)
			: null;
	switch (field.kind) {
		case "catalog":
			return choicePlan(
				name,
				ask(catalog, ""),
				catalog,
				field.gate,
				(v) => v,
				undefined,
				pair,
			);
		case "date":
			return choicePlan(
				name,
				ask(
					readings.dates,
					" Each candidate is a date or period the code already read from the request; never compute a date yourself. When one piece of text has two readings, pick the reading the language of the request uses.",
				),
				readings.dates,
				field.gate,
				({ from, to }) => (from === to ? from : undefined),
				({ ambiguous }) => ambiguous === true,
			);
		case "time":
			return choicePlan(
				name,
				ask(
					readings.times,
					` Each candidate is a time the code already read from the request; never compute a time yourself. When one hour has a morning and an evening reading, pick the one the words around it say; if they say nothing, neither is sure.`,
				),
				readings.times,
				field.gate,
				({ time }) => time,
				({ ambiguous }) => ambiguous === true,
			);
		case "amount":
			return choicePlan(
				name,
				ask(
					readings.amounts,
					" Each candidate is a number the code already read from the request, its value and currency already read.",
				),
				readings.amounts,
				field.gate,
				({ value, currency, unresolved }): Amount | undefined =>
					unresolved !== undefined
						? undefined
						: { value, ...(currency && { currency }) },
			);
	}
}

/**
 * One yes-or-no question per item. The field fills with the items asked for
 * when every item's pick clears the gate and none says the request names
 * something that could be this item or another.
 */
function severalPlan(
	name: string,
	card: Card<CardFields>,
	field: SeveralCatalogField<unknown>,
	candidates: Candidate<unknown>[],
	pair?: NamedPair,
): FieldPlan {
	const held = {
		candidates,
		answers: {},
		gate: field.gate,
		...(pair && { pair }),
	};
	return {
		questions: candidates.map((candidate) =>
			itemQuestion(`${name}_${candidate.id}`, card, field, candidate),
		),
		held,
		read(answer) {
			const answers: Record<string, FieldAnswer> = {};
			for (const { id } of candidates) {
				const probabilities = answer[`${name}_${id}`] ?? {};
				answers[id] = { pick: readPick(probabilities), probabilities };
			}
			const result = { ...held, answers };
			if (pair || !clearsGate(Object.values(answers), field.gate)) {
				return { result };
			}
			const value = candidates
				.filter(({ id }) => answers[id]?.pick?.label === YES)
				.map(({ value }) => value);
			return value.length > 0 ? { result, value } : { result };
		},
	};
}

function missingLabels(notMentioned: string, notAvailable: string) {
	return [
		{ label: NOT_MENTIONED, description: notMentioned },
		{ label: NOT_AVAILABLE, description: notAvailable },
	];
}

function choiceQuestion(
	id: string,
	card: Card<CardFields>,
	field: CardField,
	candidates: Candidate<unknown>[],
	rules: string,
): Question {
	return {
		id,
		instruction: `The request records a new ${card.description}. Which candidate is ${field.description}?${rules} Pick "${NOT_MENTIONED}" when the request says nothing about it, and "${NOT_AVAILABLE}" when it names one that no candidate expresses.`,
		labels: [
			...candidates.map(({ id, description }) => ({
				label: id,
				description,
			})),
			...missingLabels(
				`The request says nothing about ${field.description}`,
				`The request names ${field.description} that none of the other candidates expresses`,
			),
		],
	};
}

function itemQuestion(
	id: string,
	card: Card<CardFields>,
	field: SeveralCatalogField<unknown>,
	candidate: Candidate<unknown>,
): Question {
	return {
		id,
		instruction: `The request records a new ${card.description}. Is "${candidate.description}" one of ${field.description}? Several can apply to one record; judge only this one.`,
		labels: [
			{
				label: YES,
				description: `The request asks for "${candidate.description}"`,
			},
			...missingLabels(
				`The request does not ask for "${candidate.description}"`,
				`The request names something that could be "${candidate.description}" or another of ${field.description}, without saying which`,
			),
		],
	};
}

/**
 * Refuses an item that implies a value for a field the card does not declare,
 * or for one other than a catalog field where several items may apply, or an
 * item of such a field that implies one: the gap rule reads one yes-or-no
 * question per item, and a filled item of a field that takes one (ADR 0012).
 */
export function checkImplies(
	name: string,
	field: CardField,
	candidates: Candidate<unknown>[],
	fields: CardFields,
): void {
	for (const { id, implies } of candidates) {
		if (!implies) continue;
		if (field.kind === "catalog" && "several" in field) {
			throw new TypeError(
				`justask: item "${id}" of field "${name}" implies a value, but only an item of a field that takes one can`,
			);
		}
		for (const target of Object.keys(implies)) {
			const declared = fields[target];
			if (!declared) {
				throw new TypeError(
					`justask: item "${id}" implies a value for field "${target}", which the card does not declare`,
				);
			}
			if (!(declared.kind === "catalog" && "several" in declared)) {
				throw new TypeError(
					`justask: item "${id}" implies a value for field "${target}", which is not a catalog field where several items may apply`,
				);
			}
		}
	}
}

/**
 * The implied items' values for a field where several items may apply, only
 * where its own questions left a gap (ADR 0012): no named pair held it, every
 * implied item answered `not_mentioned` or `yes` at any probability, and
 * every other item `not_mentioned`. Callers ask it only of a field that did
 * not fill, so a `yes` here sits below the gate. It never fills over a `not_available`, a
 * tie, or another item the provider filled or held. Undefined when there is
 * no gap, or the field's shortlist holds none of the implied items.
 */
export function fillGap<T>(
	candidates: Candidate<T>[],
	answers: Record<string, FieldAnswer>,
	implied: readonly string[],
	pair?: NamedPair,
): T[] | undefined {
	if (pair) return undefined;
	const gap = candidates.every(({ id }) => {
		const label = answers[id]?.pick?.label;
		return label === NOT_MENTIONED || (implied.includes(id) && label === YES);
	});
	if (!gap) return undefined;
	const values = candidates
		.filter(({ id }) => implied.includes(id))
		.map(({ value }) => value);
	return values.length > 0 ? values : undefined;
}
