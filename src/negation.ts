import { foldWord, mentions, type Word, words } from "./named-pair.ts";
import type { Candidate } from "./search.ts";

/**
 * Words that negate an item's name, in a card's language: `before` phrases
 * sit straight before the name ("wasn't Beanhaven", "no fue Cafetal"),
 * `after` phrases straight after it ("Larkspur wasn't it"). A phrase may be
 * several words.
 */
export type Negations = { before: string[]; after: string[] };

/** An item the request names only with a negation beside it, as the request writes it, in NFC. */
export type NegatedItem = {
	/** The item's candidate id. */
	id: string;
	/** The request's words from the negation to the name, or from the name to the negation. */
	text: string;
};

/** A mark that ends a clause, so a negation across it negates something else. */
const CLAUSE = /[,;:.!?()[\]"“”¿¡]/;

/**
 * The items of the candidates the request names, every time it names them,
 * with a negation right beside the name and no clause mark between them: a
 * `before` phrase straight before it, or an `after` phrase straight after
 * it. An item the request also names once without one is left out.
 */
export function findNegated(
	request: string,
	candidates: Candidate<unknown>[],
	negations: Negations | undefined,
): NegatedItem[] {
	if (!negations) return [];
	const text = request.normalize("NFC");
	const said = words(text);
	const folded = (phrase: string) => phrase.trim().split(/\s+/).map(foldWord);
	const before = negations.before.map(folded);
	const after = negations.after.map(folded);
	/** Whether `phrase` is said from word `at` on. */
	const saidAt = (at: number, phrase: string[]) =>
		at >= 0 &&
		at + phrase.length <= said.length &&
		phrase.every((word, i) => said[at + i]?.folded === word);
	/** The span of words from `from` to `to`, when no clause mark splits it. */
	const span = (from: number, to: number) => {
		const spoken = text.slice(
			(said[from] as Word).start,
			(said[to] as Word).end,
		);
		return CLAUSE.test(spoken) ? undefined : spoken;
	};

	const negated = new Map<string, string>();
	const plain = new Set<string>();
	for (const { id, first, last } of mentions(said, candidates)) {
		const spoken =
			after
				.filter((phrase) => saidAt(last + 1, phrase))
				.map((phrase) => span(first, last + phrase.length))
				.find(Boolean) ??
			before
				.filter((phrase) => saidAt(first - phrase.length, phrase))
				.map((phrase) => span(first - phrase.length, last))
				.find(Boolean);
		if (!spoken) plain.add(id);
		else if (!negated.has(id)) negated.set(id, spoken);
	}
	return [...negated]
		.filter(([id]) => !plain.has(id))
		.map(([id, text]) => ({ id, text }));
}

/** Refuses a blank negation, which would match beside any name. */
export function checkNegations(negations: Negations | undefined): void {
	for (const phrase of [
		...(negations?.before ?? []),
		...(negations?.after ?? []),
	]) {
		if (!phrase.trim()) {
			throw new TypeError("justask: the card's negations hold a blank phrase");
		}
	}
}
