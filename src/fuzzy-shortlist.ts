import type { Candidate, Shortlist } from "./search.ts";

/**
 * Ported from the lab's search ranking (`~/jev-lab/experiments/search/ranking.ts`).
 * Filler that must never crowd out the words that matter, in both languages. Time
 * words are stopped here but stay in the request the provider reads.
 */
// biome-ignore format: word lists read better packed
const STOPWORDS = new Set([
	// English
	"the", "a", "an", "i", "my", "me", "to", "of", "that", "just", "please", "open",
	"find", "show", "get", "it", "in", "on", "from", "for", "with", "and", "all",
	"some", "this", "these", "those", "them", "about", "at", "is", "was", "were",
	"have", "had", "ive", "did", "last", "latest", "recent", "yesterday", "today",
	"morning", "afternoon", "night", "week", "month", "year", "ago", "downloaded",
	"opened", "saved", "signed", "took", "taken",
	// Spanish
	"el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "que",
	"mi", "mis", "lo", "al", "y", "o", "en", "con", "por", "para", "se",
	"su", "sus", "es", "esta", "este", "esa", "ese", "ayer", "hoy", "manana",
	"semana", "mes", "ano", "pasada", "pasado", "ultima", "ultimo", "ultimas",
	"ultimos", "abri", "baje", "firme", "tome", "guarde", "hace", "buscar",
	"abrir", "dame", "muestrame",
]);

/** A fuzzy score below this is not a match at all. */
const MINIMUM_SCORE = 0.15;

/** Lowercase, strip accents, split on anything that is not a letter, digit or hyphen. */
function tokens(text: string): string[] {
	return text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.split(/[^a-z0-9-]+/)
		.filter(Boolean);
}

/**
 * Fraction of adjacent hits when `needle` appears as a subsequence of `haystack`,
 * or null when it does not appear at all. "cntrt" inside "contrato" scores low,
 * "contra" scores high, which is what separates a typo from a coincidence.
 */
function subsequenceContiguity(
	needle: string,
	haystack: string,
): number | null {
	let n = 0;
	let last = -2;
	let adjacent = 0;
	for (let i = 0; i < haystack.length && n < needle.length; i++) {
		if (haystack[i] === needle[n]) {
			if (last === i - 1) adjacent++;
			last = i;
			n++;
		}
	}
	if (n < needle.length) return null;
	return needle.length > 1 ? adjacent / (needle.length - 1) : 1;
}

function bestTermMatch(
	token: string,
	terms: string[],
	joined: string,
	initials: string,
): number {
	let best = 0;
	for (const term of terms) {
		if (term === token) return 1;
		if (token.endsWith("s") && token.slice(0, -1) === term) {
			best = Math.max(best, 0.98);
		}
		if (term.startsWith(token)) {
			best = Math.max(best, 0.8 + (0.15 * token.length) / term.length);
		}
	}
	if (best > 0) return best;
	if (token.length >= 2 && initials.startsWith(token)) return 0.7;
	if (joined.includes(token)) return 0.55;
	if (token.length >= 3) {
		const contiguity = subsequenceContiguity(token, joined);
		if (contiguity !== null) return 0.2 + 0.2 * contiguity;
	}
	return 0;
}

/** Score in 0..1 of a request against a candidate's description. */
function fuzzyScore(request: string, description: string): number {
	const all = tokens(request);
	if (all.length === 0) return 0;
	let meaningful = all.filter((token) => !STOPWORDS.has(token));
	// A request made entirely of filler still has to match on something.
	if (meaningful.length === 0) meaningful = all;

	const terms = [...new Set(tokens(description))];
	const joined = terms.join("");
	const initials = terms.map((term) => term[0] ?? "").join("");

	let total = 0;
	let missed = 0;
	for (const token of meaningful) {
		const best = bestTermMatch(token, terms, joined, initials);
		if (best === 0) missed++;
		total += best;
	}
	if (total === 0) return 0;
	let score = total / meaningful.length;
	if (missed > 0) score *= 0.5;
	// Prefer the shorter description when everything else ties.
	score += 0.02 * Math.max(0, 1 - description.length / 40);
	return Math.min(1, score);
}

/**
 * An in-memory shortlist for small catalogs: the best text matches on each
 * candidate's description first, then the rest of the catalog in its own order
 * up to `limit`. The fill matters: in the lab, half the test requests matched no
 * text at all ("mi hoja de vida" against an English filename), and a shortlist of
 * text matches alone would never have shown the provider the right answer.
 */
export function fuzzyShortlist<T>(
	catalog: Candidate<T>[],
	{ limit }: { limit: number },
): Shortlist<T> {
	return (request) => {
		if (!request.trim()) return [];
		const matches = catalog
			.map((candidate) => ({
				candidate,
				score: fuzzyScore(request, candidate.description),
			}))
			.filter(({ score }) => score >= MINIMUM_SCORE)
			.sort((a, b) => b.score - a.score)
			.map(({ candidate }) => candidate);
		const picked = new Set(matches.slice(0, limit));
		for (const candidate of catalog) {
			if (picked.size >= limit) break;
			picked.add(candidate);
		}
		return [...picked];
	};
}
