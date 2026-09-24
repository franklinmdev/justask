import {
	ask,
	type Candidate,
	fuzzyShortlist,
	type ProviderAnswer,
	ProviderUnavailableError,
} from "justask";
import { describe, expect, it } from "vitest";
import {
	failingProvider,
	fakeProvider,
	hangingProvider,
	rawProvider,
	unavailableFirstProvider,
} from "./fake-provider.ts";

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

describe("ask: search", () => {
	it("fills the item when the provider picks a candidate and none and several stay below the gate, in one call", async () => {
		const fake = fakeProvider({
			search: { acme: 0.93, northwind: 0.05, none: 0.02, several: 0 },
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
			probabilities: { acme: 0.93, northwind: 0.05, none: 0.02, several: 0 },
			gate: 0.5,
		});
	});

	it("fills the item when near-duplicates split the vote, as long as none and several stay below the gate", async () => {
		const fake = fakeProvider({
			search: { acme: 0.45, northwind: 0.35, none: 0.2, several: 0 },
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
			search: { acme: 0.3, northwind: 0.3, none: 0.4, several: 0 },
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
			search: { acme: 0.5, northwind: 0.1, none: 0.4, several: 0 },
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

	it("holds the item when several reaches the gate, even though a candidate wins and none stays below it", async () => {
		const fake = fakeProvider({
			search: { acme: 0.5, northwind: 0.1, none: 0.05, several: 0.35 },
		});

		const result = await ask({
			...base,
			provider: fake,
			search: vendorSearch(0.3),
		});

		expect(result.search.item).toBeNull();
		expect(result.search.pick).toEqual({ label: "acme", probability: 0.5 });
	});

	it("holds the item when the provider picks several, whatever its probability", async () => {
		const fake = fakeProvider({
			search: { acme: 0.3, northwind: 0.28, none: 0.02, several: 0.4 },
		});

		const result = await ask({
			...base,
			provider: fake,
			search: vendorSearch(0.5),
		});

		expect(result.search.item).toBeNull();
		expect(result.search.pick).toEqual({ label: "several", probability: 0.4 });
	});

	it("fills the item when none sits just below the gate", async () => {
		const fake = fakeProvider({
			search: { acme: 0.6, northwind: 0.01, none: 0.39, several: 0 },
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
			{ acme: 0.45, northwind: 0.45, none: 0.1, several: 0 },
			{ none: 0.1, several: 0, northwind: 0.45, acme: 0.45 },
		];
		for (const probabilities of tied) {
			const result = await ask({
				...base,
				provider: rawProvider({ search: probabilities }),
				search: vendorSearch(),
			});

			expect(result.search.item).toBeNull();
			expect(result.search.pick).toBeNull();
			expect(result.search.probabilities).toEqual(probabilities);
			expect(result.error).toBeUndefined();
		}
	});

	it("holds everything and returns a typed error when the provider fails, without retrying", async () => {
		const cause = new Error("503 from the provider");
		const provider = failingProvider(cause);
		const result = await ask({ ...base, provider, search: vendorSearch() });

		expect(provider.calls).toHaveLength(1);
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

	describe("when the provider is unavailable (ADR 0013)", () => {
		const unavailable = () =>
			new ProviderUnavailableError("529 high traffic", { cause: 529 });
		const answers = {
			search: { acme: 0.93, northwind: 0.05, none: 0.02, several: 0 },
		};

		it("calls it once more within the timeout, and fills from the second answer", async () => {
			const provider = unavailableFirstProvider([unavailable()], answers);
			const result = await ask({ ...base, provider, search: vendorSearch() });

			expect(provider.calls).toHaveLength(2);
			expect(provider.calls[1]?.signal).toBe(provider.calls[0]?.signal);
			expect(result.error).toBeUndefined();
			expect(result.search.item).toEqual({ id: 1, name: "Acme Supplies" });
			expect(result.retried).toBe(true);
		});

		it("holds and returns a transport error when the second call fails too, with no third", async () => {
			const second = unavailable();
			const provider = unavailableFirstProvider(
				[unavailable(), second],
				answers,
			);
			const result = await ask({ ...base, provider, search: vendorSearch() });

			expect(provider.calls).toHaveLength(2);
			expect(result.error).toEqual({
				kind: "provider",
				message: "529 high traffic",
				cause: second,
				transport: true,
			});
			expect(result.search.item).toBeNull();
			expect(result.retried).toBe(true);
		});

		it("keeps one timeout over both calls", async () => {
			const provider = unavailableFirstProvider([unavailable()], "hang", {
				delayMs: 10,
			});
			const started = performance.now();
			const result = await ask({
				...base,
				timeoutMs: 60,
				provider,
				search: vendorSearch(),
			});

			expect(result.error).toMatchObject({ kind: "timeout", timeoutMs: 60 });
			expect(performance.now() - started).toBeLessThan(120);
			expect(provider.calls).toHaveLength(2);
			expect(provider.calls[1]?.signal.aborted).toBe(true);
			expect(result.retried).toBe(true);
		});

		it("does not call again once the timeout has run out", async () => {
			const provider = unavailableFirstProvider([unavailable()], answers, {
				delayMs: 40,
			});
			const result = await ask({
				...base,
				timeoutMs: 20,
				provider,
				search: vendorSearch(),
			});
			await new Promise((resolve) => setTimeout(resolve, 60));

			expect(result.error?.kind).toBe("timeout");
			expect(provider.calls).toHaveLength(1);
			expect(result).not.toHaveProperty("retried");
		});

		it("does not call again after an answer that breaks the contract", async () => {
			const provider = rawProvider({});
			const result = await ask({ ...base, provider, search: vendorSearch() });

			expect(provider.calls).toHaveLength(1);
			expect(result.error).not.toHaveProperty("transport");
			expect(result).not.toHaveProperty("retried");
		});
	});

	it("returns a typed error when the provider throws before returning a promise", async () => {
		const result = await ask({
			...base,
			provider: failingProvider(new Error("missing key"), {
				synchronous: true,
			}),
			search: vendorSearch(),
		});

		expect(result.error).toMatchObject({
			kind: "provider",
			message: "missing key",
		});
		expect(result.search.item).toBeNull();
	});

	it("holds everything and returns a timeout error when the provider outlasts the developer's timeout", async () => {
		const provider = hangingProvider();
		const result = await ask({
			...base,
			timeoutMs: 20,
			provider,
			search: vendorSearch(),
		});

		expect(result.error).toMatchObject({ kind: "timeout", timeoutMs: 20 });
		expect(result.search.item).toBeNull();
		expect(result.search.pick).toBeNull();
		expect(provider.calls[0]?.signal.aborted).toBe(true);
	});

	it.each<[string, ProviderAnswer]>([
		["leaves the question out", {}],
		["leaves a label out", { search: { acme: 0.9, none: 0.1, several: 0 } }],
		[
			"adds a label nobody asked for",
			{
				search: {
					acme: 0.9,
					northwind: 0.05,
					none: 0.02,
					several: 0,
					zeta: 0.03,
				},
			},
		],
		[
			"returns something that is not a probability",
			{ search: { acme: 1.5, northwind: 0, none: Number.NaN, several: 0 } },
		],
	])("treats an answer that %s as a provider error", async (_, answer) => {
		const result = await ask({
			...base,
			provider: rawProvider(answer),
			search: vendorSearch(),
		});

		expect(result.error?.kind).toBe("provider");
		expect(result.search.item).toBeNull();
		expect(result.search.pick).toBeNull();
		expect(result.search.probabilities).toEqual({});
	});

	it("holds without calling the provider when the shortlist is empty", async () => {
		const provider = fakeProvider({});
		const result = await ask({
			...base,
			provider,
			search: { ...vendorSearch(), shortlist: async () => [] },
		});

		expect(provider.calls).toHaveLength(0);
		expect(result.search.item).toBeNull();
		expect(result.search.candidates).toEqual([]);
		expect(result.error).toBeUndefined();
	});

	it("passes the request to the shortlist function", async () => {
		const seen: string[] = [];
		await ask({
			...base,
			provider: fakeProvider({ search: { acme: 1, none: 0, several: 0 } }),
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

	it.each([0, 1, 2, Number.NaN])(
		"rejects a search gate of %s before any shortlist or provider call",
		async (gate) => {
			const provider = fakeProvider({});
			let shortlisted = false;

			await expect(
				ask({
					...base,
					provider,
					search: {
						...vendorSearch(gate),
						shortlist: () => {
							shortlisted = true;
							return [acme];
						},
					},
				}),
			).rejects.toThrow(
				new TypeError(
					`justask: the search's gate must be a number strictly between 0 and 1, not ${gate}`,
				),
			);
			expect(shortlisted).toBe(false);
			expect(provider.calls).toHaveLength(0);
		},
	);

	it.each([
		["a candidate id is none", [{ ...acme, id: "none" }]],
		["a candidate id is several", [{ ...acme, id: "several" }]],
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

	describe("a named pair (ADR 0010)", () => {
		const joiners = { or: ["or", "o"], and: ["and", "y"] };
		const confident = {
			search: { acme: 0.95, northwind: 0.03, none: 0.01, several: 0.01 },
		};
		const find = (
			request: string,
			declared: { or: string[]; and: string[] } | null = joiners,
		) =>
			ask({
				...base,
				request,
				provider: fakeProvider(confident),
				search: {
					...vendorSearch(),
					shortlist: () => [
						{ ...acme, names: ["Acme"] },
						{ ...northwind, names: ["Northwind"] },
					],
					...(declared && { joiners: declared }),
				},
			});

		it("holds the item when two candidates are joined by a joiner, whatever the pick, and names them as written", async () => {
			const { search } = await find("the Acme or Northwind invoice");

			expect(search.item).toBeNull();
			expect(search.pair).toEqual({
				ids: ["acme", "northwind"],
				text: "Acme or Northwind",
			});
			// Still asked, so the pick is reported.
			expect(search.pick).toEqual({ label: "acme", probability: 0.95 });
		});

		it('holds on "and" too, since the search takes one item', async () => {
			const { search } = await find("factura de Acme y de Northwind");

			expect(search.item).toBeNull();
			expect(search.pair?.ids).toEqual(["acme", "northwind"]);
		});

		it("fills as before when the request names one candidate, or the search declares no joiners", async () => {
			const one = await find("the Acme or the other invoice");
			const undeclared = await find("the Acme or Northwind invoice", null);

			for (const { search } of [one, undeclared]) {
				expect(search).not.toHaveProperty("pair");
				expect(search.item).toEqual({ id: 1, name: "Acme Supplies" });
			}
		});

		it("names the pair when the provider fails, since the code found it", async () => {
			const result = await ask({
				...base,
				request: "Acme or Northwind",
				provider: failingProvider(new Error("down")),
				search: { ...vendorSearch(), joiners },
			});

			expect(result.search.item).toBeNull();
			expect(result.search.pair?.ids).toEqual(["acme", "northwind"]);
		});

		it("refuses a joiner of several words before any call", async () => {
			const provider = fakeProvider(confident);

			await expect(
				ask({
					...base,
					provider,
					search: { ...vendorSearch(), joiners: { or: ["or else"], and: [] } },
				}),
			).rejects.toThrow(
				new TypeError(
					'justask: the search\'s joiner "or else" is not one word',
				),
			);
			expect(provider.calls).toHaveLength(0);
		});
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
					["several", 0],
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

	it("fills the places a text match left empty in catalog order, so the provider still judges", async () => {
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
