import { ask, type Candidate } from "justask";
import { describe, expect, expectTypeOf, it } from "vitest";
import { failingProvider, fakeProvider, rawProvider } from "./fake-provider.ts";

type Account = "cash" | "bank" | "rent";
type Status = "draft" | "posted" | "voided";

const accounts: Candidate<Account>[] = [
	{
		id: "cash",
		description: "Caja, efectivo, cash, petty cash",
		value: "cash",
	},
	{ id: "bank", description: "Banco, bank account", value: "bank" },
	{ id: "rent", description: "Alquiler, renta del local, rent", value: "rent" },
];
const statuses: Candidate<Status>[] = [
	{ id: "draft", description: "Borrador, draft, unposted", value: "draft" },
	{ id: "posted", description: "Contabilizado, posted", value: "posted" },
	{ id: "voided", description: "Anulado, voided", value: "voided" },
];

function ledgerFilter({ accountGate = 0.8, statusGate = 0.8 } = {}) {
	return {
		description: "ledger entries, one row per entry",
		fields: {
			account: {
				kind: "catalog" as const,
				description: "the ledger account the entries belong to",
				gate: accountGate,
				shortlist: () => accounts,
			},
			status: {
				kind: "catalog" as const,
				description: "the status of the entries",
				gate: statusGate,
				shortlist: () => statuses,
			},
		},
	};
}

const base = {
	request: "posted rent entries",
	facts: { today: "2026-09-22" },
	timeoutMs: 1_000,
};

describe("ask: filter with catalog fields", () => {
	it("fills each field from its picked candidate, in one call", async () => {
		const fake = fakeProvider({
			account: {
				cash: 0.02,
				bank: 0.03,
				rent: 0.9,
				not_mentioned: 0.04,
				not_available: 0.01,
			},
			status: {
				draft: 0.01,
				posted: 0.95,
				voided: 0.01,
				not_mentioned: 0.02,
				not_available: 0.01,
			},
		});

		const result = await ask({
			...base,
			provider: fake,
			filter: ledgerFilter(),
		});

		expect(fake.calls).toHaveLength(1);
		expect(result.error).toBeUndefined();
		expect(result.filter.value).toEqual({ account: "rent", status: "posted" });
	});

	it("puts one question per field to the provider: every candidate, plus not_mentioned and not_available", async () => {
		const fake = fakeProvider(answers({ account: "rent", status: "posted" }));

		await ask({ ...base, provider: fake, filter: ledgerFilter() });

		const questions = fake.calls[0]?.questions ?? [];
		expect(questions.map(({ id }) => id)).toEqual(["account", "status"]);
		expect(
			questions.map(({ labels }) => labels.map(({ label }) => label)),
		).toEqual([
			["cash", "bank", "rent", "not_mentioned", "not_available"],
			["draft", "posted", "voided", "not_mentioned", "not_available"],
		]);
		expect(questions[0]?.labels[0]).toEqual({
			label: "cash",
			description: "Caja, efectivo, cash, petty cash",
		});
	});

	it.each(["not_mentioned", "not_available"])(
		"holds a field whose pick is %s, whatever its probability, and leaves it out like an empty one",
		async (missing) => {
			const result = await ask({
				...base,
				provider: fakeProvider(
					answers({ account: "rent", status: missing }, 0.99),
				),
				filter: ledgerFilter(),
			});

			expect(result.filter.value).toEqual({ account: "rent" });
			expect("status" in result.filter.value).toBe(false);
			expect(result.filter.fields.status.pick).toEqual({
				label: missing,
				probability: 0.99,
			});
		},
	);

	it("holds a field whose pick is below its own gate, while another clears its gate", async () => {
		const result = await ask({
			...base,
			provider: fakeProvider(
				answers({ account: "rent", status: "posted" }, 0.7),
			),
			filter: ledgerFilter({ accountGate: 0.6, statusGate: 0.75 }),
		});

		expect(result.filter.value).toEqual({ account: "rent" });
		expect(result.filter.fields.status).toEqual({
			candidates: statuses,
			pick: { label: "posted", probability: 0.7 },
			probabilities: answers({ status: "posted" }, 0.7).status,
			gate: 0.75,
		});
	});

	it("fills a field whose pick sits exactly on its gate", async () => {
		const result = await ask({
			...base,
			provider: fakeProvider(
				answers({ account: "rent", status: "posted" }, 0.8),
			),
			filter: ledgerFilter({ accountGate: 0.8, statusGate: 0.8 }),
		});

		expect(result.filter.value).toEqual({ account: "rent", status: "posted" });
	});

	it("holds a field on a tie for first place", async () => {
		const result = await ask({
			...base,
			provider: rawProvider({
				account: {
					cash: 0.45,
					bank: 0.45,
					rent: 0.05,
					not_mentioned: 0.05,
					not_available: 0,
				},
				status: answers({ status: "posted" }).status ?? {},
			}),
			filter: ledgerFilter({ accountGate: 0.4 }),
		});

		expect(result.filter.value).toEqual({ status: "posted" });
		expect(result.filter.fields.account.pick).toBeNull();
	});

	it("holds a field with no candidates without asking about it", async () => {
		const fake = fakeProvider(answers({ status: "posted" }));
		const filter = ledgerFilter();

		const result = await ask({
			...base,
			provider: fake,
			filter: {
				...filter,
				fields: {
					...filter.fields,
					account: { ...filter.fields.account, shortlist: async () => [] },
				},
			},
		});

		expect(fake.calls[0]?.questions.map(({ id }) => id)).toEqual(["status"]);
		expect(result.filter.value).toEqual({ status: "posted" });
		expect(result.filter.fields.account).toEqual({
			candidates: [],
			pick: null,
			probabilities: {},
			gate: 0.8,
		});
	});

	it("holds everything without calling the provider when no field has candidates", async () => {
		const fake = fakeProvider({});
		const empty = () => [];

		const result = await ask({
			...base,
			provider: fake,
			filter: {
				description: "ledger entries",
				fields: {
					account: { ...ledgerFilter().fields.account, shortlist: empty },
				},
			},
		});

		expect(fake.calls).toHaveLength(0);
		expect(result.filter.value).toEqual({});
		expect(result.error).toBeUndefined();
	});

	it("passes the request to every field's shortlist function", async () => {
		const seen: string[] = [];
		const filter = ledgerFilter();

		await ask({
			...base,
			provider: fakeProvider(answers({ account: "rent", status: "posted" })),
			filter: {
				...filter,
				fields: {
					account: {
						...filter.fields.account,
						shortlist: (request) => {
							seen.push(`account: ${request}`);
							return accounts;
						},
					},
					status: {
						...filter.fields.status,
						shortlist: async (request) => {
							seen.push(`status: ${request}`);
							return statuses;
						},
					},
				},
			},
		});

		expect(seen.sort()).toEqual([
			"account: posted rent entries",
			"status: posted rent entries",
		]);
	});

	it("holds every field and returns a typed error when the provider fails, without retrying", async () => {
		const cause = new Error("503 from the provider");
		const provider = failingProvider(cause);

		const result = await ask({ ...base, provider, filter: ledgerFilter() });

		expect(provider.calls).toHaveLength(1);
		expect(result.error).toEqual({
			kind: "provider",
			message: "503 from the provider",
			cause,
		});
		expect(result.filter.value).toEqual({});
		expect(result.filter.fields.account).toEqual({
			candidates: accounts,
			pick: null,
			probabilities: {},
			gate: 0.8,
		});
	});

	it("treats an answer that leaves a field's question out as a provider error", async () => {
		const result = await ask({
			...base,
			provider: rawProvider(answers({ account: "rent" })),
			filter: ledgerFilter(),
		});

		expect(result.error?.kind).toBe("provider");
		expect(result.filter.value).toEqual({});
	});

	it.each([
		[
			"a candidate id is not_mentioned",
			[{ ...statuses[0], id: "not_mentioned" }],
		],
		[
			"a candidate id is not_available",
			[{ ...statuses[0], id: "not_available" }],
		],
		[
			"two candidates share an id",
			[statuses[0], { ...statuses[1], id: "draft" }],
		],
	])("rejects a field's shortlist where %s", async (_, candidates) => {
		const filter = ledgerFilter();
		await expect(
			ask({
				...base,
				provider: fakeProvider({}),
				filter: {
					...filter,
					fields: {
						...filter.fields,
						status: {
							...filter.fields.status,
							shortlist: () => candidates as Candidate<Status>[],
						},
					},
				},
			}),
		).rejects.toThrow(TypeError);
	});

	it("infers the filter object's type from the declaration", async () => {
		const result = await ask({
			...base,
			provider: fakeProvider(answers({ account: "rent", status: "posted" })),
			filter: ledgerFilter(),
		});

		expectTypeOf(result.filter.value).toEqualTypeOf<{
			account?: Account;
			status?: Status;
		}>();
		expectTypeOf(result.filter.fields.account.candidates).toEqualTypeOf<
			Candidate<Account>[]
		>();
	});

	it("does not compile a field without a gate", () => {
		const declare = () =>
			ask({
				...base,
				provider: fakeProvider({}),
				filter: {
					description: "ledger entries",
					fields: {
						// @ts-expect-error: every field declares its gate (ADR 0003)
						account: {
							kind: "catalog",
							description: "the ledger account the entries belong to",
							shortlist: () => accounts,
						},
					},
				},
			});

		expect(declare).toBeTypeOf("function");
	});
});

/**
 * Per field, the given label at `probability` and the rest of that field's
 * labels sharing what is left evenly.
 */
function answers(
	picks: { account?: string; status?: string },
	probability = 0.9,
) {
	const labels = {
		account: [
			...accounts.map(({ id }) => id),
			"not_mentioned",
			"not_available",
		],
		status: [...statuses.map(({ id }) => id), "not_mentioned", "not_available"],
	};
	const fixtures: Record<string, Record<string, number>> = {};
	for (const [field, picked] of Object.entries(picks)) {
		const all = labels[field as keyof typeof labels];
		const rest = (1 - probability) / (all.length - 1);
		fixtures[field] = Object.fromEntries(
			all.map((label) => [label, label === picked ? probability : rest]),
		);
	}
	return fixtures;
}
