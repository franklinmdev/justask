import { type Pick, readPick } from "./pick.ts";
import type { Probabilities, Question } from "./provider.ts";
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

/** One named part of a filter, declared with its kind, description and gate. */
export type Field = CatalogField<unknown>;

export type Fields = Record<string, Field>;

export type Filter<F extends Fields> = {
	/** What one row of the host app's table is, used in every question. */
	description: string;
	fields: F;
};

/** The value a field fills with, inferred from its declaration. */
export type FieldValue<F extends Field> =
	F extends CatalogField<infer T> ? T : never;

/**
 * The filter object the host app's table understands. A held field's key is
 * left out, exactly as when the request never mentioned it.
 */
export type FilterValue<F extends Fields> = {
	[K in keyof F]?: FieldValue<F[K]>;
};

export type FieldResult<T> = {
	candidates: Candidate<T>[];
	/** Null when there was no answer, or on a tie for first place. */
	pick: Pick | null;
	/** Every label's probability; empty when the field was not asked or there was no answer. */
	probabilities: Probabilities;
	gate: number;
};

export type FilterResult<F extends Fields> = {
	value: FilterValue<F>;
	fields: { [K in keyof F]: FieldResult<FieldValue<F[K]>> };
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
			{
				label: NOT_MENTIONED,
				description: `The request says nothing about ${field.description}`,
			},
			{
				label: NOT_AVAILABLE,
				description: `The request asks for ${field.description} that none of the other candidates expresses`,
			},
		],
	};
}
