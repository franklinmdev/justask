import type { Joiners } from "./named-pair.ts";
import { type Pick, readPick } from "./pick.ts";
import type { Probabilities, Question } from "./provider.ts";

/** A value code found for a decision before the provider is asked: one catalog row. */
export type Candidate<T> = {
	/** The label the provider picks; unique in the shortlist and never one of the question's own labels. */
	id: string;
	/** What the provider reads about this row. */
	description: string;
	value: T;
	/**
	 * Other words a request names this row by, such as a brand. The pair
	 * hold reads them, exactly or with a clear typo, beside the id, which it
	 * reads exactly (ADR 0010).
	 */
	names?: string[];
};

/** Returns the few catalog candidates for one request, from the host app's own catalog. */
export type Shortlist<T> = (
	request: string,
) => Candidate<T>[] | Promise<Candidate<T>[]>;

export type Search<T> = {
	/** What the searched item means in the host app, used in the question. */
	description: string;
	/**
	 * The probability of `none` or `several` at which the item is held (ADR
	 * 0005, 0007). The item fills only while both stay below it. No default
	 * (ADR 0003).
	 */
	gate: number;
	shortlist: Shortlist<T>;
	/**
	 * Words that join two items, in the search's language, each one word:
	 * `or` words ("or"; "o", "u") and `and` words ("and"; "y", "e"). A
	 * request that names two candidates, and no third, with one of these
	 * between them holds the item whatever its pick, since the search takes
	 * one (ADR 0010).
	 */
	joiners?: Joiners;
};

export const NONE = "none";
export const SEVERAL = "several";

/** The search question's own labels, which no candidate may use as its id. */
export const SEARCH_LABELS = [NONE, SEVERAL] as const;

/** Throws on a candidate id that repeats or takes one of the question's own labels. */
export function checkShortlist(
	candidates: Candidate<unknown>[],
	reserved: readonly string[],
): void {
	const seen = new Set<string>();
	for (const { id } of candidates) {
		if (reserved.includes(id)) {
			throw new TypeError(
				`justask: a shortlist candidate cannot use the id "${id}", which is the question's own label`,
			);
		}
		if (seen.has(id)) {
			throw new TypeError(
				`justask: two shortlist candidates share the id "${id}"`,
			);
		}
		seen.add(id);
	}
}

/**
 * Reads a search's answer through its gate: the id of the candidate that
 * fills the item, or null when the item is held. The gate reads none and
 * several, not the winner (ADR 0005, 0007): near-duplicate candidates split the
 * winner's probability, while none stays low whenever one fits and several
 * rises when more than one does. A none or several pick, or a tie, still holds.
 */
export function gateSearch(
	probabilities: Probabilities,
	gate: number,
): { pick: Pick | null; filled: string | null } {
	const pick = readPick(probabilities);
	const none = probabilities[NONE] ?? 1;
	// A run log saved before ADR 0007 has no several; it reads as never raised.
	const several = probabilities[SEVERAL] ?? 0;
	const filled =
		pick &&
		!(SEARCH_LABELS as readonly string[]).includes(pick.label) &&
		none < gate &&
		several < gate
			? pick.label
			: null;
	return { pick, filled };
}

export function searchQuestion(
	id: string,
	search: Search<unknown>,
	candidates: Candidate<unknown>[],
): Question {
	return {
		id,
		instruction: `The request points at one item: ${search.description}. Which candidate is it? Pick "${NONE}" when no candidate fits the request, and "${SEVERAL}" when more than one candidate fits it.`,
		labels: [
			...candidates.map(({ id, description }) => ({
				label: id,
				description,
			})),
			{ label: NONE, description: "None of these candidates fits the request" },
			{
				label: SEVERAL,
				description: "More than one of these candidates fits the request",
			},
		],
	};
}
