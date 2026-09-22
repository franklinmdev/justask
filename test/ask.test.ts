import {
	ask,
	type Candidate,
	fuzzyShortlist,
	type Provider,
	type ProviderAnswer,
} from "justask";
import { describe, expect, it } from "vitest";
import { fakeProvider } from "./fake-provider.ts";

type Vendor = { id: number; name: string };

const acme: Candidate<Vendor> = {
	id: "acme",
	description: "Acme Supplies, office paper and toner",
	value: { id: 1, name: "Acme Supplies" },
};
const northwind: Candidate<Vendor> = {
	id: "northwind",
	description: "Northwind Traders, catering",
	value: { id: 2, name: "Northwind Traders" },
};

function vendorSearch(gate = 0.5) {
	return {
		description: "the vendor the request means",
		gate,
		shortlist: () => [acme, northwind],
	};
}

const base = {
	request: "invoices from Acme",
	facts: { today: "2026-09-22" },
	timeoutMs: 1_000,
};

function provider(answer: () => Promise<ProviderAnswer>): Provider {
	return { answer };
}

describe("ask: search", () => {
	it("fills the item when the provider picks a candidate and none stays below the gate, in one call", async () => {
		const fake = fakeProvider({
			search: { acme: 0.93, northwind: 0.05, none: 0.02 },
		});

		const result = await ask({
			...base,
			provider: fake,
			search: vendorSearch(),
		});

		expect(fake.calls).toHaveLength(1);
		expect(fake.calls[0]?.request).toBe("invoices from Acme");
		expect(fake.calls[0]?.facts).toEqual({ today: "2026-09-22" });
		expect(result.error).toBeUndefined();
		expect(result.search).toEqual({
			item: { id: 1, name: "Acme Supplies" },
			candidates: [acme, northwind],
			pick: { label: "acme", probability: 0.93 },
			probabilities: { acme: 0.93, northwind: 0.05, none: 0.02 },
			gate: 0.5,
		});
	});

	it("fills the item when near-duplicates split the vote, as long as none stays below the gate", async () => {
		const fake = fakeProvider({
			search: { acme: 0.45, northwind: 0.35, none: 0.2 },
		});

		const result = await ask({
			...base,
			provider: fake,
			search: vendorSearch(),
		});

		expect(result.search.item).toEqual({ id: 1, name: "Acme Supplies" });
		expect(result.search.pick).toEqual({ label: "acme", probability: 0.45 });
	});

	it("holds the item when the provider picks none, whatever its probability", async () => {
		const fake = fakeProvider({
			search: { acme: 0.3, northwind: 0.3, none: 0.4 },
		});

		const result = await ask({
			...base,
			provider: fake,
			search: vendorSearch(),
		});

		expect(result.search.item).toBeNull();
		expect(result.search.pick).toEqual({ label: "none", probability: 0.4 });
		expect(result.error).toBeUndefined();
	});

	it("holds the item when none reaches the gate, even though a candidate wins, and still exposes the pick", async () => {
		const fake = fakeProvider({
			search: { acme: 0.5, northwind: 0.1, none: 0.4 },
		});

		const result = await ask({
			...base,
			provider: fake,
			search: vendorSearch(0.4),
		});

		expect(result.search.item).toBeNull();
		expect(result.search.pick).toEqual({ label: "acme", probability: 0.5 });
		expect(result.search.gate).toBe(0.4);
	});

	it("fills the item when none sits just below the gate", async () => {
		const fake = fakeProvider({
			search: { acme: 0.6, northwind: 0.01, none: 0.39 },
		});

		const result = await ask({
			...base,
			provider: fake,
			search: vendorSearch(0.4),
		});

		expect(result.search.item).toEqual({ id: 1, name: "Acme Supplies" });
	});

	it("holds the item on a tie for first place, whatever order the provider used", async () => {
		const tied = [
			{ acme: 0.45, northwind: 0.45, none: 0.1 },
			{ none: 0.1, northwind: 0.45, acme: 0.45 },
		];
		for (const probabilities of tied) {
			const result = await ask({
				...base,
				provider: provider(async () => ({ search: probabilities })),
				search: vendorSearch(),
			});

			expect(result.search.item).toBeNull();
			expect(result.search.pick).toBeNull();
			expect(result.search.probabilities).toEqual(probabilities);
			expect(result.error).toBeUndefined();
		}
	});

	it("holds everything and returns a typed error when the provider fails, without retrying", async () => {
		let calls = 0;
		const cause = new Error("503 from the provider");
		const result = await ask({
			...base,
			provider: provider(async () => {
				calls++;
				throw cause;
			}),
			search: vendorSearch(),
		});

		expect(calls).toBe(1);
		expect(result.error).toEqual({
			kind: "provider",
			message: "503 from the provider",
			cause,
		});
		expect(result.search).toEqual({
			item: null,
			candidates: [acme, northwind],
			pick: null,
			probabilities: {},
			gate: 0.5,
		});
	});

	it("returns a typed error when the provider throws before returning a promise", async () => {
		const result = await ask({
			...base,
			provider: {
				answer: () => {
					throw new Error("missing key");
				},
			},
			search: vendorSearch(),
		});

		expect(result.error).toMatchObject({
			kind: "provider",
			message: "missing key",
		});
		expect(result.search.item).toBeNull();
	});

	it("holds everything and returns a timeout error when the provider outlasts the developer's timeout", async () => {
		let signal: AbortSignal | undefined;
		const result = await ask({
			...base,
			timeoutMs: 20,
			provider: {
				answer: (input) => {
					signal = input.signal;
					return new Promise(() => {});
				},
			},
			search: vendorSearch(),
		});

		expect(result.error).toMatchObject({ kind: "timeout", timeoutMs: 20 });
		expect(result.search.item).toBeNull();
		expect(result.search.pick).toBeNull();
		expect(signal?.aborted).toBe(true);
	});

	it.each<[string, ProviderAnswer]>([
		["leaves the question out", {}],
		["leaves a label out", { search: { acme: 0.9, none: 0.1 } }],
		[
			"adds a label nobody asked for",
			{ search: { acme: 0.9, northwind: 0.05, none: 0.02, zeta: 0.03 } },
		],
		[
			"returns something that is not a probability",
			{ search: { acme: 1.5, northwind: 0, none: Number.NaN } },
		],
	])("treats an answer that %s as a provider error", async (_, answer) => {
		const result = await ask({
			...base,
			provider: provider(async () => answer),
			search: vendorSearch(),
		});

		expect(result.error?.kind).toBe("provider");
		expect(result.search.item).toBeNull();
		expect(result.search.pick).toBeNull();
		expect(result.search.probabilities).toEqual({});
	});

	it("holds without calling the provider when the shortlist is empty", async () => {
		let calls = 0;
		const result = await ask({
			...base,
			provider: provider(async () => {
				calls++;
				return {};
			}),
			search: { ...vendorSearch(), shortlist: async () => [] },
		});

		expect(calls).toBe(0);
		expect(result.search.item).toBeNull();
		expect(result.search.candidates).toEqual([]);
		expect(result.error).toBeUndefined();
	});

	it("passes the request to the shortlist function", async () => {
		const seen: string[] = [];
		await ask({
			...base,
			provider: fakeProvider({ search: { acme: 1, none: 0 } }),
			search: {
				...vendorSearch(),
				shortlist: (request) => {
					seen.push(request);
					return [acme];
				},
			},
		});

		expect(seen).toEqual(["invoices from Acme"]);
	});

	it.each([
		["a candidate id is none", [{ ...acme, id: "none" }]],
		["two candidates share an id", [acme, { ...northwind, id: "acme" }]],
	])("rejects a shortlist where %s", async (_, candidates) => {
		await expect(
			ask({
				...base,
				provider: fakeProvider({}),
				search: { ...vendorSearch(), shortlist: () => candidates },
			}),
		).rejects.toThrow(TypeError);
	});
});

describe("ask: fuzzyShortlist", () => {
	const catalog: Candidate<string>[] = [
		{ id: "paper", description: "Acme Supplies, office paper", value: "p" },
		{ id: "catering", description: "Northwind Traders, catering", value: "c" },
		{ id: "cloud", description: "Contoso Cloud hosting", value: "h" },
		{ id: "cleaning", description: "Fabrikam cleaning services", value: "l" },
	];

	async function shortlisted(request: string, limit: number) {
		const result = await ask({
			...base,
			request,
			provider: fakeProvider({
				search: Object.fromEntries([
					...catalog.map(({ id }) => [id, 0]),
					["none", 1],
				]),
			}),
			search: {
				description: "the vendor the request means",
				gate: 0.5,
				shortlist: fuzzyShortlist(catalog, { limit }),
			},
		});
		return result.search.candidates.map(({ id }) => id);
	}

	it("puts the best text matches first, tolerating accents, plurals and prefixes", async () => {
		expect(await shortlisted("northwnd", 2)).toEqual(["catering", "paper"]);
		expect(await shortlisted("the cleanings", 1)).toEqual(["cleaning"]);
		expect(await shortlisted("Cóntoso", 1)).toEqual(["cloud"]);
		expect(await shortlisted("cater", 1)).toEqual(["catering"]);
	});

	it("fills the slots a text match left empty in catalog order, so the provider still judges", async () => {
		expect(await shortlisted("la limpieza de la oficina", 3)).toEqual([
			"paper",
			"catering",
			"cloud",
		]);
	});

	it("never exceeds the limit or the catalog", async () => {
		expect(await shortlisted("acme", 10)).toHaveLength(4);
		expect(await shortlisted("acme", 2)).toHaveLength(2);
	});

	it("returns nothing for an empty request", async () => {
		expect(await shortlisted("   ", 3)).toEqual([]);
	});
});
