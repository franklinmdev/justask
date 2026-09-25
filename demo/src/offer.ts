import type { Candidate, SearchResult } from "justask";

/** The search question's own labels, asked beside the candidates (ADR 0005, 0007). */
export const NONE = "none";
export const SEVERAL = "several";

/** What held a search's item, in the order the gate is read (ADR 0005, 0007, 0011). */
export type HeldBy =
	| "pair"
	| "tie"
	| "none-reached-gate"
	| "several-reached-gate"
	| "none-tied"
	| "several-tied"
	| "several-picked"
	| "none-picked";

/**
 * What held the item of an answer with no item: the code holds a named pair
 * before the gate is read (ADR 0011), then two or more vendors tied for first
 * place, then none or several at the gate, then none or several tied for
 * first place or picked below it. A vendor tied with none or several is read
 * as that label, never as a tie between vendors. The state panel says it and
 * the offer follows it, so the two always read the same.
 */
export function heldBy(result: SearchResult<unknown>): HeldBy {
	if (result.pair) return "pair";
	const { probabilities, gate, pick } = result;
	const probability = (label: string) => probabilities[label] ?? 0;
	const top = Math.max(...Object.values(probabilities));
	const vendorsAtTop = result.candidates.filter(
		({ id }) => probability(id) === top,
	);
	if (!pick && vendorsAtTop.length > 1) return "tie";
	if ((probabilities[NONE] ?? 1) >= gate) return "none-reached-gate";
	if (probability(SEVERAL) >= gate) return "several-reached-gate";
	// A tie that holds none reads as none, since no vendor is its equal.
	if (!pick) return probability(NONE) === top ? "none-tied" : "several-tied";
	return pick.label === SEVERAL ? "several-picked" : "none-picked";
}

/** How many of the closest vendors a request that matched none offers. */
const CLOSEST = 3;

/**
 * What the Search case offers the person when the item is held, so a slip
 * never ends on an empty table (#134). Choices: the request could mean more
 * than one vendor, a named pair (ADR 0011), several (ADR 0007) or a tie for
 * first place. Closest: it matched none, so the likeliest vendors show,
 * unselected, under the message. Either way the person picks; nothing is
 * picked for them.
 */
export type Offer<T> = {
	kind: "choices" | "closest";
	candidates: Candidate<T>[];
};

/**
 * The offer for a held answer, read from the probabilities the package
 * already returns: nothing once a vendor filled, before an answer, or when
 * no answer ranked the candidates (a failed call, or no shortlist). A
 * vendor at zero is never offered, so the closest can be fewer than three,
 * or none, and the message then stands alone. When several held the item
 * and no vendor is above zero, the choices are empty, and the page says more
 * than one vendor could fit, as the hood does.
 */
export function offerOf<T>(result: SearchResult<T> | null): Offer<T> | null {
	if (!result || result.item !== null || result.candidates.length === 0) {
		return null;
	}
	const { probabilities, pair } = result;
	if (Object.keys(probabilities).length === 0) return null;

	const held = heldBy(result);
	if (pair) {
		const named = pair.ids.flatMap(
			(id) => result.candidates.find((candidate) => candidate.id === id) ?? [],
		);
		return { kind: "choices", candidates: named };
	}
	const probability = (label: string) => probabilities[label] ?? 0;
	// Stable, so candidates at the same probability keep the catalog's order.
	// A vendor at zero is close to nothing, so it is never offered.
	const ranked = [...result.candidates]
		.filter(({ id }) => probability(id) > 0)
		.sort((a, b) => probability(b.id) - probability(a.id));
	const top = probability(ranked[0]?.id ?? "");
	const tied = ranked.filter(({ id }) => probability(id) === top);
	// With no vendor above zero the choices are empty, and the page says more than one could fit.
	const choices = (): Offer<T> => ({
		kind: "choices",
		candidates: tied.length > 1 ? tied : ranked.slice(0, 2),
	});
	const closest: Offer<T> = {
		kind: "closest",
		candidates: ranked.slice(0, CLOSEST),
	};
	switch (held) {
		case "tie":
		case "several-reached-gate":
		case "several-tied":
		case "several-picked":
			return choices();
		default:
			return closest;
	}
}
