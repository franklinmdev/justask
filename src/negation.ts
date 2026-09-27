import { foldWord, mentions, type Word, words } from "./named-pair.ts";
import type { Candidate } from "./search.ts";

/**
 * Words that negate an item's name, in a card's language: `before` words sit
 * before the name, with up to two other words between ("not Beanhaven",
 * "didn't go to Larkspur", "no fue Cafetal"); `after` words follow it
 * straight on ("Larkspur wasn't it"). A phrase may be several words.
 */
export type Negations = { before: string[]; after: string[] };

/** An item the request names only with a negation beside it, as the request writes it, in NFC. */
export type NegatedItem = {
	/** The item's candidate id. */
	id: string;
	/** The request's words from the negation to the name, or from the name to the negation. */
	text: string;
};

/** Other words than the name that may sit between a `before` negation and it. */
const GAP = 2;

/** A mark that ends a clause, so a negation on its other side negates something else. */
const CLAUSE = /[,;:.!?()[\]"“”¿¡]/;

/**
 * The items of the candidates the request names, every time it names them,
 * with a negation beside the name in the same clause: a `before` phrase with
 * up to two words between it and the name, and no other item's name among
 * them; or an `after` phrase straight after it. An item the request also
 * names once without one is left out.
 */
export function findNegated(
	request: string,
	candidates: Candidate<unknown>[],
	negations: Negations | undefined,
): NegatedItem[] {
	if (!negations) return [];
	const text = request.normalize("NFC");
	const said = words(text);
	const named = mentions(said, candidates);
	const phrase = (words: string) => words.trim().split(/\s+/).map(foldWord);
	const before = negations.before.map(phrase);
	const after = negations.after.map(phrase);
	/** Whether `phrase` is said starting at word `at`, in one clause. */
	const saidAt = (at: number, phrase: string[]) =>
		at >= 0 &&
		at + phrase.length <= said.length &&
		phrase.every((word, i) => said[at + i]?.folded === word) &&
		sameClause(text, said, at, at + phrase.length - 1);

	const negated = new Map<string, string>();
	const plain = new Set<string>();
	for (const mention of named) {
		let span: [number, number] | undefined;
		for (const words of after) {
			if (saidAt(mention.last + 1, words)) {
				span = [mention.first, mention.last + words.length];
				break;
			}
		}
		for (let gap = 0; !span && gap <= GAP; gap++) {
			for (const words of before) {
				const at = mention.first - gap - words.length;
				const other = named.some(
					(m) => m !== mention && m.last >= at && m.first < mention.first,
				);
				if (
					!other &&
					saidAt(at, words) &&
					sameClause(text, said, at, mention.last)
				) {
					span = [at, mention.last];
					break;
				}
			}
		}
		if (!span) {
			plain.add(mention.id);
			continue;
		}
		if (!negated.has(mention.id)) {
			negated.set(
				mention.id,
				text.slice((said[span[0]] as Word).start, (said[span[1]] as Word).end),
			);
		}
	}
	return [...negated]
		.filter(([id]) => !plain.has(id))
		.map(([id, text]) => ({ id, text }));
}

/** Whether words `from` to `to` sit in one clause, with no clause mark between them. */
function sameClause(text: string, said: Word[], from: number, to: number) {
	return !CLAUSE.test(
		text.slice((said[from] as Word).start, (said[to] as Word).end),
	);
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
