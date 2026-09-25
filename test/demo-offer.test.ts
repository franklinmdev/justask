import type { Probabilities, SearchResult } from "justask";
import { describe, expect, it } from "vitest";
import { english } from "../demo/src/content/en.ts";
import type { Vendor } from "../demo/src/content/types.ts";
import { heldBy, offerOf } from "../demo/src/offer.ts";

const candidates = english.vendors;

/** A held answer over the whole English catalog: every vendor at zero but the ones given. */
function held(
	probabilities: Probabilities,
	{
		pick,
		pair,
	}: { pick?: string | null; pair?: SearchResult<Vendor>["pair"] } = {},
): SearchResult<Vendor> {
	const all: Probabilities = {
		...Object.fromEntries(candidates.map(({ id }) => [id, 0])),
		none: 0,
		several: 0,
		...probabilities,
	};
	const top = Object.entries(all).sort(([, a], [, b]) => b - a)[0];
	const label = pick === undefined ? (top?.[0] ?? null) : pick;
	return {
		item: null,
		candidates,
		pick: label === null ? null : { label, probability: all[label] ?? 0 },
		probabilities: all,
		gate: 0.15,
		...(pair && { pair }),
	};
}

const ids = (offer: ReturnType<typeof offerOf<Vendor>>) =>
	offer?.candidates.map(({ id }) => id);

describe("what the Search case offers when the item is held", () => {
	it("offers nothing before an answer, or once a vendor filled", () => {
		expect(offerOf(null)).toBeNull();
		const larkspur = candidates[1];
		if (!larkspur) throw new Error("no second vendor");
		expect(
			offerOf({
				...held({ larkspur: 0.94 }),
				item: larkspur.value,
			}),
		).toBeNull();
	});

	it("offers nothing when no answer came back, since nothing ranks the candidates", () => {
		expect(offerOf({ ...held({}), pick: null, probabilities: {} })).toBeNull();
	});

	it("offers the two vendors a request names as choices, whatever the pick (ADR 0011)", () => {
		const offer = offerOf(
			held(
				{ papergrove: 0.9, larkspur: 0.07 },
				{
					pair: {
						ids: ["larkspur", "papergrove"],
						text: "Larkspur or Papergrove",
					},
				},
			),
		);
		expect(offer?.kind).toBe("choices");
		expect(ids(offer)).toEqual(["larkspur", "papergrove"]);
	});

	it("offers the two likeliest vendors as choices when several held the item", () => {
		const offer = offerOf(
			held({ several: 0.92, glasswell: 0.03, brightmop: 0.04, none: 0.01 }),
		);
		expect(offer?.kind).toBe("choices");
		expect(ids(offer)).toEqual(["brightmop", "glasswell"]);
	});

	it("offers every vendor tied at the top as choices, not an arbitrary two of them", () => {
		const offer = offerOf(
			held({
				several: 0.13,
				papergrove: 0.12,
				larkspur: 0.12,
				brightmop: 0.12,
				none: 0.03,
			}),
		);
		expect(offer?.kind).toBe("choices");
		expect(ids(offer)).toEqual(["papergrove", "larkspur", "brightmop"]);
	});

	it("offers the tied vendors as choices on a tie for first place", () => {
		const offer = offerOf(
			held({ brightmop: 0.45, glasswell: 0.45, none: 0.1 }, { pick: null }),
		);
		expect(offer?.kind).toBe("choices");
		expect(ids(offer)).toEqual(["brightmop", "glasswell"]);
	});

	it("offers the three closest vendors when none held the item", () => {
		const offer = offerOf(
			held({ none: 0.61, papergrove: 0.2, larkspur: 0.19, fixbright: 0.1 }),
		);
		expect(offer?.kind).toBe("closest");
		expect(ids(offer)).toEqual(["papergrove", "larkspur", "fixbright"]);
	});

	it("offers the closest vendors when a tie held none against one vendor", () => {
		const offer = offerOf(
			held({ none: 0.45, larkspur: 0.45, papergrove: 0.1 }, { pick: null }),
		);
		expect(offer?.kind).toBe("closest");
		expect(ids(offer)).toEqual(["larkspur", "papergrove"]);
	});

	it("reads none before several, as the state panel does", () => {
		// A real answer to "how much do we owe in total?": several sat on the gate.
		const offer = offerOf(
			held({ none: 0.85, several: 0.15, papergrove: 0.01 }),
		);
		expect(offer?.kind).toBe("closest");
		expect(ids(offer)).toEqual(["papergrove"]);
	});

	it("never offers a vendor at zero, so the closest can be none at all", () => {
		expect(offerOf(held({ none: 0.85, several: 0.15 }))).toEqual({
			kind: "closest",
			candidates: [],
		});
		expect(offerOf(held({ several: 0.99, none: 0.01 }))).toBeNull();
	});

	it("offers nothing when the shortlist found no candidate, so the provider was not asked", () => {
		expect(
			offerOf({ ...held({}), candidates: [], pick: null, probabilities: {} }),
		).toBeNull();
	});
});

describe("what held the item, as the hood says it and the page offers it", () => {
	it("reads a tie between vendors as a tie, which offers them as choices", () => {
		const result = held(
			{ brightmop: 0.45, glasswell: 0.45, none: 0.1 },
			{ pick: null },
		);
		expect(heldBy(result)).toBe("tie");
		expect(offerOf(result)?.kind).toBe("choices");
	});

	it("reads a vendor tied with none by the gate: none reached it, so the closest show", () => {
		const result = held(
			{ none: 0.45, larkspur: 0.45, papergrove: 0.1 },
			{ pick: null },
		);
		expect(heldBy(result)).toBe("none-reached-gate");
		expect(offerOf(result)?.kind).toBe("closest");
	});

	it("says none tied for first place when it tied below the gate, and offers the closest", () => {
		const result = held(
			{ none: 0.12, glasswell: 0.12, larkspur: 0.1, several: 0.05 },
			{ pick: null },
		);
		expect(heldBy(result)).toBe("none-tied");
		expect(ids(offerOf(result))).toEqual(["glasswell", "larkspur"]);
	});

	it("says several tied for first place when it tied below the gate, and offers choices", () => {
		const result = held(
			{ several: 0.12, glasswell: 0.12, brightmop: 0.1, none: 0.05 },
			{ pick: null },
		);
		expect(heldBy(result)).toBe("several-tied");
		expect(offerOf(result)?.kind).toBe("choices");
	});
});
