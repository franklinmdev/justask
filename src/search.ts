import type { Question } from "./provider.ts";

/** A value code found for the search before the provider is asked: one catalog row. */
export type Candidate<T> = {
	/** The label the provider picks; unique in the shortlist and never `none`. */
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
	/** The minimum probability the winner needs to fill the item. No default (ADR 0003). */
	gate: number;
	shortlist: Shortlist<T>;
};

export const NONE = "none";

export function checkShortlist(candidates: Candidate<unknown>[]): void {
	const seen = new Set<string>();
	for (const { id } of candidates) {
		if (id === NONE) {
			throw new TypeError(
				`justask: a shortlist candidate cannot use the id "${NONE}", which is the search's own label`,
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
