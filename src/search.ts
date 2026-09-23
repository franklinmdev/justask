import { type Pick, readPick } from "./pick.ts";
import type { Probabilities, Question } from "./provider.ts";

/** A value code found for a decision before the provider is asked: one catalog row. */
export type Candidate<T> = {
	/** The label the provider picks; unique in the shortlist and never one of the question's own labels. */
	id: string;
	/** What the provider reads about this row. */
	description: string;
	value: T;
};

/** Returns the few catalog candidates for one request, from the host app's own catalog. */
export type Shortlist<T> = (
	request: string,
) => Candidate<T>[] | Promise<Candidate<T>[]>;

export type Search<T> = {
	/** What the searched item means in the host app, used in the question. */
	description: string;
	/**
	 * The probability of `none` at which the item is held (ADR 0005). The item
	 * fills only while `none` stays below it. No default (ADR 0003).
	 */
	gate: number;
	shortlist: Shortlist<T>;
};

export const NONE = "none";

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
 * fills the item, or null when the item is held. The gate reads none, not the
 * winner (ADR 0005): near-duplicate candidates split the winner's probability,
 * while none stays low whenever one fits. A none pick or a tie still holds.
 */
export function gateSearch(
	probabilities: Probabilities,
	gate: number,
): { pick: Pick | null; filled: string | null } {
	const pick = readPick(probabilities);
	const none = probabilities[NONE] ?? 1;
	const filled = pick && pick.label !== NONE && none < gate ? pick.label : null;
	return { pick, filled };
}

export function searchQuestion(
	id: string,
	search: Search<unknown>,
	candidates: Candidate<unknown>[],
): Question {
	return {
		id,
		instruction: `The request points at one item: ${search.description}. Which candidate is it? Pick "${NONE}" when no candidate fits the request.`,
		labels: [
			...candidates.map(({ id, description }) => ({
				label: id,
				description,
			})),
			{ label: NONE, description: "None of these candidates fits the request" },
		],
	};
}
