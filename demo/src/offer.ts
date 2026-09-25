import type { Candidate, SearchResult } from "justask";

/** The search question's own labels, asked beside the candidates (ADR 0005, 0007). */
const NONE = "none";
const SEVERAL = "several";

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
 * or none, and the message then stands alone; so it does when several held
 * the item and no vendor is above zero.
 */
export function offerOf<T>(result: SearchResult<T> | null): Offer<T> | null {
	if (!result || result.item !== null || result.candidates.length === 0) {
		return null;
	}
	const { probabilities, pick, pair } = result;
	if (Object.keys(probabilities).length === 0) return null;

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
	// With no vendor above zero there is nothing to choose, and the message stands alone.
	const choices = (): Offer<T> | null =>
		ranked.length === 0
			? null
			: {
					kind: "choices",
					candidates: tied.length > 1 ? tied : ranked.slice(0, 2),
				};
	const closest: Offer<T> = {
		kind: "closest",
		candidates: ranked.slice(0, CLOSEST),
	};
	// In the order the state panel reads the gate, so the two never disagree.
	if (pick === null) {
		return tied.length > 1 && top >= probability(NONE) ? choices() : closest;
	}
	if (probability(NONE) >= result.gate) return closest;
	if (probability(SEVERAL) >= result.gate || pick.label === SEVERAL) {
		return choices();
	}
	return closest;
}
