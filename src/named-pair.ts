import type { Candidate } from "./search.ts";

/** Two items of one catalog field named with a joiner between them, as the request writes them, in NFC. */
export type NamedPair = {
	/** The two items' candidate ids, in the order the request names them. */
	ids: [string, string];
	/** The request's words from the first item's name to the second's. */
	text: string;
};

/**
 * A card's words that join two items, in its language, each one word. "or"
 * words offer a choice, which no catalog field can fill; "and" words name
 * both, which only a field that takes one item cannot fill.
 */
export type Joiners = { or: string[]; and: string[] };

/** Other words than the joiner that may sit between the two names: "lunch or", "o de". */
const GAP = 2;

/**
 * A word: letters, combining marks and digits, joined by hyphens and
 * apostrophes, so "either-or" is one word and "Tallyroot's" another.
 */
const WORD = /[\p{L}\p{M}\p{N}]+(?:[-'’][\p{L}\p{M}\p{N}]+)*/gu;

type Word = { folded: string; start: number; end: number };

/** Lowercase, accents and a possessive dropped: "Tallyroot's" reads "tallyroot". */
function fold(word: string): string {
	return word
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/['’]s$/, "");
}

function words(text: string): Word[] {
	return [...text.matchAll(WORD)].map((found) => ({
		folded: fold(found[0]),
		start: found.index,
		end: found.index + found[0].length,
	}));
}

/**
 * How many letters a name may miss by and still be read as a clear typo of
 * it: none under five letters, one up to seven, two from eight. The eval
 * sets' typos, such as `talyroot`, `Cuentya` and `Taliroot`, all fit.
 */
function typoAllowance(length: number): number {
	if (length < 5) return 0;
	return length < 8 ? 1 : 2;
}

/** Edit distance with adjacent swaps, stopping once it passes `limit`. */
function withinDistance(a: string, b: string, limit: number): boolean {
	if (Math.abs(a.length - b.length) > limit) return false;
	let before: number[] = [];
	let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let best = Math.min(
				(previous[j] as number) + 1,
				(current[j - 1] as number) + 1,
				(previous[j - 1] as number) + cost,
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				best = Math.min(best, (before[j - 2] as number) + 1);
			}
			current.push(best);
		}
		before = previous;
		previous = current;
	}
	return (previous[b.length] as number) <= limit;
}

/** One way a request names an item: its id, read exactly, or one of its names, which a clear typo still reads. */
type Naming = { id: string; words: string[]; typos: boolean };

function namings(candidates: Candidate<unknown>[]): Naming[] {
	return candidates.flatMap(({ id, names = [] }) => [
		{ id, words: words(id).map(({ folded }) => folded), typos: false },
		...names.map((name) => ({
			id,
			words: words(name).map(({ folded }) => folded),
			typos: true,
		})),
	]);
}

function namesItem(naming: Naming, run: Word[]): boolean {
	const written = run.map(({ folded }) => folded).join(" ");
	const name = naming.words.join(" ");
	if (written === name) return true;
	return (
		naming.typos &&
		withinDistance(written, name, typoAllowance(name.replace(/ /g, "").length))
	);
}

type Mention = { id: string; first: number; last: number };

/** The items the request names, in order, the longest naming first where two start on one word. */
function mentions(text: Word[], candidates: Candidate<unknown>[]): Mention[] {
	const all = namings(candidates)
		.filter(({ words }) => words.length > 0)
		.sort((a, b) => b.words.length - a.words.length);
	const found: Mention[] = [];
	for (let i = 0; i < text.length; i++) {
		const naming = all.find(
			(naming) =>
				i + naming.words.length <= text.length &&
				namesItem(naming, text.slice(i, i + naming.words.length)),
		);
		if (!naming) continue;
		found.push({ id: naming.id, first: i, last: i + naming.words.length - 1 });
		i += naming.words.length - 1;
	}
	return found;
}

/**
 * The two items of the candidates the request names with a joiner between
 * them, and up to two other words: "Tallyroot or Cloudberth", "de Cuentia o
 * de Nubalia", "Larkspur lunch and Beanhaven coffee". An item is named by its
 * id, read exactly, or by one of its names, exactly or with a clear typo,
 * ignoring case and accents. A request that names a third item of the field
 * holds no pair: the third is the one it is most likely about ("Swiftlane
 * courier to Clausewood or Paydale"). On a field where several items may
 * apply, only an "or" word joins a pair.
 */
export function findPair(
	request: string,
	candidates: Candidate<unknown>[],
	joiners: Joiners | undefined,
	{ several }: { several: boolean },
): NamedPair | undefined {
	if (!joiners) return undefined;
	const text = request.normalize("NFC");
	const said = words(text);
	const joining = new Set(
		[...joiners.or, ...(several ? [] : joiners.and)].map(fold),
	);
	const named = mentions(said, candidates);
	if (new Set(named.map(({ id }) => id)).size !== 2) return undefined;
	for (let n = 1; n < named.length; n++) {
		const a = named[n - 1] as Mention;
		const b = named[n] as Mention;
		if (a.id === b.id) continue;
		const between = said.slice(a.last + 1, b.first);
		const joined = between.filter(({ folded }) => joining.has(folded));
		if (joined.length !== 1 || between.length - 1 > GAP) continue;
		return {
			ids: [a.id, b.id],
			text: text.slice(
				(said[a.first] as Word).start,
				(said[b.last] as Word).end,
			),
		};
	}
	return undefined;
}

/** Refuses a blank joiner, or one of several words, which the pair hold would never read. */
export function checkJoiners(joiners: Joiners | undefined): void {
	for (const joiner of [...(joiners?.or ?? []), ...(joiners?.and ?? [])]) {
		if (!/^\S+$/.test(joiner.trim())) {
			throw new TypeError(
				`justask: the card's joiner "${joiner}" is not one word`,
			);
		}
	}
}
