import { ask, type Facts, type Parser, type Probabilities } from "justask";
import { describe, expect, expectTypeOf, it } from "vitest";
import { fakeProvider } from "./fake-provider.ts";

// A Tuesday. The handler writes today as a sentence; `ask` reads the date in it.
const facts: Facts = {
	today: "Today is Tuesday 2026-09-22 (martes 22 de septiembre de 2026).",
};

function invoiceFilter({
	issuedGate = 0.8,
	totalGate = 0.8,
	parsers,
}: {
	issuedGate?: number;
	totalGate?: number;
	parsers?: Parser[];
} = {}) {
	return {
		description: "invoices, one row per invoice",
		fields: {
			issued: {
				kind: "date" as const,
				description: "the day the invoice was issued",
				gate: issuedGate,
			},
			total: {
				kind: "amount" as const,
				description: "the invoice's total",
				gate: totalGate,
			},
		},
		...(parsers && { parsers }),
	};
}

const base = { facts, timeoutMs: 1_000 };

/** Every label at `rest`, and `winner` at `p`. */
function answer(labels: string[], winner: string, p = 0.9): Probabilities {
	const rest = labels.length > 1 ? (1 - p) / (labels.length - 1) : 0;
	return Object.fromEntries(
		labels.map((label) => [label, label === winner ? p : rest]),
	);
}

const MISSING = ["not_mentioned", "not_available"];
const ROLES = ["min", "max", "exact", ...MISSING];

describe("ask: filter with date fields", () => {
	it("fills a date field from the parser's reading of 'last month', in one call", async () => {
		const labels = ["d0", ...MISSING];
		const fake = fakeProvider({
			issued_from: answer(labels, "d0"),
			issued_to: answer(labels, "d0"),
		});

		const result = await ask({
			...base,
			request: "invoices from last month",
			provider: fake,
			filter: invoiceFilter(),
		});

		expect(fake.calls).toHaveLength(1);
		expect(result.filter.value).toEqual({
			issued: { from: "2026-08-01", to: "2026-08-31" },
		});
		expect(result.filter.fields.issued.candidates).toEqual([
			{
				id: "d0",
				description: expect.stringContaining("2026-08-01"),
				value: {
					text: "last month",
					from: "2026-08-01",
					to: "2026-08-31",
					note: "August 2026, last month",
				},
			},
		]);
	});

	it("asks where the period starts and where it ends, each over every date candidate plus not_mentioned and not_available", async () => {
		const labels = ["d0", "d1", ...MISSING];
		const fake = fakeProvider({
			issued_from: answer(labels, "d0"),
			issued_to: answer(labels, "d1"),
		});

		const result = await ask({
			...base,
			request: "facturas desde el 5 de agosto hasta ayer",
			provider: fake,
			filter: invoiceFilter(),
		});

		const questions = fake.calls[0]?.questions ?? [];
		expect(questions.map(({ id }) => id)).toEqual(["issued_from", "issued_to"]);
		for (const question of questions) {
			expect(question.labels.map(({ label }) => label)).toEqual(labels);
		}
		expect(result.filter.value).toEqual({
			issued: { from: "2026-08-05", to: "2026-09-21" },
		});
	});

	it("fills only the start when the request names only a start", async () => {
		const labels = ["d0", ...MISSING];
		const result = await ask({
			...base,
			request: "since August",
			provider: fakeProvider({
				issued_from: answer(labels, "d0"),
				issued_to: answer(labels, "not_mentioned"),
			}),
			filter: invoiceFilter(),
		});

		expect(result.filter.value).toEqual({ issued: { from: "2026-08-01" } });
	});

	it("reads a date in the past, as a filter looks back", async () => {
		const labels = ["d0", ...MISSING];
		const result = await ask({
			...base,
			request: "facturas del 25 de diciembre",
			provider: fakeProvider({
				issued_from: answer(labels, "d0"),
				issued_to: answer(labels, "d0"),
			}),
			filter: invoiceFilter(),
		});

		expect(result.filter.value).toEqual({
			issued: { from: "2025-12-25", to: "2025-12-25" },
		});
	});

	it.each([
		["below its gate", { from: "d0", to: "d0", p: 0.7 }],
		[
			"not_available at either end",
			{ from: "d0", to: "not_available", p: 0.95 },
		],
		[
			"not_mentioned at both ends",
			{ from: "not_mentioned", to: "not_mentioned", p: 0.95 },
		],
	])("holds a date field whose picks are %s", async (_, { from, to, p }) => {
		const labels = ["d0", ...MISSING];
		const result = await ask({
			...base,
			request: "invoices from last month",
			provider: fakeProvider({
				issued_from: answer(labels, from, p),
				issued_to: answer(labels, to, p),
			}),
			filter: invoiceFilter(),
		});

		expect(result.filter.value).toEqual({});
		expect(result.filter.fields.issued.answers).toEqual({
			from: {
				pick: { label: from, probability: p },
				probabilities: answer(labels, from, p),
			},
			to: {
				pick: { label: to, probability: p },
				probabilities: answer(labels, to, p),
			},
		});
	});

	it("holds a date field whose start falls after its end", async () => {
		const labels = ["d0", "d1", ...MISSING];
		const result = await ask({
			...base,
			request: "desde el 5 de agosto hasta ayer",
			provider: fakeProvider({
				issued_from: answer(labels, "d1"),
				issued_to: answer(labels, "d0"),
			}),
			filter: invoiceFilter(),
		});

		expect(result.filter.value).toEqual({});
	});

	it("puts both readings of '03/04' to the provider and fills the one it picks", async () => {
		const labels = ["d0", "d1", ...MISSING];
		const fake = fakeProvider({
			issued_from: answer(labels, "d1"),
			issued_to: answer(labels, "d1"),
		});

		const result = await ask({
			...base,
			request: "invoices from 03/04",
			provider: fake,
			filter: invoiceFilter(),
		});

		const [d0, d1] = fake.calls[0]?.questions[0]?.labels ?? [];
		expect(d0?.description).toContain("day/month");
		expect(d1?.description).toContain("month/day");
		expect(result.filter.value).toEqual({
			issued: { from: "2026-03-04", to: "2026-03-04" },
		});
	});

	it("holds a date field with no date in the request, without a question for it", async () => {
		const fake = fakeProvider({
			total_a0: answer(ROLES, "min"),
		});

		const result = await ask({
			...base,
			request: "invoices over 500",
			provider: fake,
			filter: invoiceFilter(),
		});

		expect(fake.calls[0]?.questions.map(({ id }) => id)).toEqual(["total_a0"]);
		expect(result.filter.value).toEqual({ total: { min: 500 } });
		expect(result.filter.fields.issued).toEqual({
			candidates: [],
			answers: {},
			gate: 0.8,
		});
	});

	it("makes no call when the request has neither a date nor a number", async () => {
		const fake = fakeProvider({});

		const result = await ask({
			...base,
			request: "unpaid invoices",
			provider: fake,
			filter: invoiceFilter(),
		});

		expect(fake.calls).toHaveLength(0);
		expect(result.filter.value).toEqual({});
	});

	it("refuses a date or amount field when the facts carry no today", async () => {
		await expect(
			ask({
				...base,
				facts: {},
				request: "invoices from last month",
				provider: fakeProvider({}),
				filter: invoiceFilter(),
			}),
		).rejects.toThrow(/today/);
	});
});

describe("ask: filter with amount fields", () => {
	it("asks what each number does to the amount, and fills 'over 500 pesos' in the local peso", async () => {
		const fake = fakeProvider({ total_a0: answer(ROLES, "min") });

		const result = await ask({
			...base,
			facts: { ...facts, local_currency: "MXN" },
			request: "facturas de más de 500 pesos",
			provider: fake,
			filter: invoiceFilter(),
		});

		const [question] = fake.calls[0]?.questions ?? [];
		expect(question?.id).toBe("total_a0");
		expect(question?.labels.map(({ label }) => label)).toEqual(ROLES);
		expect(result.filter.value).toEqual({
			total: { min: 500, currency: "MXN" },
		});
	});

	it("says a number with no currency does not say which, whatever the local currency: the card's wording (#191) is not the filter's", async () => {
		const fake = fakeProvider({ total_a0: answer(ROLES, "min") });

		await ask({
			...base,
			facts: { ...facts, local_currency: "USD" },
			request: "facturas de más de 500",
			provider: fake,
			filter: invoiceFilter(),
		});

		const [question] = fake.calls[0]?.questions ?? [];
		expect(question?.instruction).toContain(
			'the number "500": 500, the request does not say in which currency in the request',
		);
	});

	it("holds the whole amount when the request names a currency that does not resolve, without asking", async () => {
		const fake = fakeProvider({});

		const result = await ask({
			...base,
			facts: { ...facts, local_currency: "USD" },
			request: "facturas de más de 500 pesos",
			provider: fake,
			filter: invoiceFilter(),
		});

		expect(fake.calls).toHaveLength(0);
		expect(result.filter.value).toEqual({});
		expect(result.filter.fields.total).toEqual({
			candidates: [
				{
					id: "a0",
					description: expect.any(String),
					value: {
						text: "500 pesos",
						value: 500,
						currency: null,
						unresolved: "pesos",
					},
				},
			],
			answers: {},
			gate: 0.8,
		});
	});

	it("holds the whole amount when one of its numbers names an unresolved currency, and still fills the other fields", async () => {
		const dates = ["d0", ...MISSING];
		const fake = fakeProvider({
			issued_from: answer(dates, "d0"),
			issued_to: answer(dates, "d0"),
		});

		const result = await ask({
			...base,
			facts: { ...facts, local_currency: "USD" },
			request: "invoices between $200 and 500 pesos from last month",
			provider: fake,
			filter: invoiceFilter(),
		});

		expect(fake.calls[0]?.questions.map(({ id }) => id)).toEqual([
			"issued_from",
			"issued_to",
		]);
		expect(result.filter.value).toEqual({
			issued: { from: "2026-08-01", to: "2026-08-31" },
		});
	});

	it("leaves the currency out when the request does not say which", async () => {
		const result = await ask({
			...base,
			request: "invoices over $500",
			provider: fakeProvider({ total_a0: answer(ROLES, "min") }),
			filter: invoiceFilter(),
		});

		expect(result.filter.value).toEqual({ total: { min: 500 } });
		expect(result.filter.fields.total.candidates[0]?.value).toEqual({
			text: "$500",
			value: 500,
			currency: null,
		});
	});

	it("fills a range from two numbers and a date from the same request", async () => {
		const dates = ["d0", ...MISSING];
		const fake = fakeProvider({
			issued_from: answer(dates, "d0"),
			issued_to: answer(dates, "d0"),
			total_a0: answer(ROLES, "min"),
			total_a1: answer(ROLES, "max"),
		});

		const result = await ask({
			...base,
			facts: { ...facts, local_currency: "USD" },
			request: "entre 500 y 2,000 dólares de la semana pasada",
			provider: fake,
			filter: invoiceFilter(),
		});

		expect(result.filter.value).toEqual({
			issued: { from: "2026-09-14", to: "2026-09-20" },
			total: { min: 500, max: 2000, currency: "USD" },
		});
	});

	it("holds the whole amount when one of its numbers stays below the gate", async () => {
		const result = await ask({
			...base,
			request: "the 10 invoices over 500",
			provider: fakeProvider({
				total_a0: answer(ROLES, "not_mentioned", 0.6),
				total_a1: answer(ROLES, "min", 0.95),
			}),
			filter: invoiceFilter(),
		});

		expect(result.filter.value).toEqual({});
		expect(result.filter.fields.total.answers.a1?.pick).toEqual({
			label: "min",
			probability: 0.95,
		});
	});

	it("fills with the numbers that play a part, passing over one that is not about the amount", async () => {
		const result = await ask({
			...base,
			request: "the 10 invoices over 500",
			provider: fakeProvider({
				total_a0: answer(ROLES, "not_mentioned", 0.95),
				total_a1: answer(ROLES, "min", 0.95),
			}),
			filter: invoiceFilter(),
		});

		expect(result.filter.value).toEqual({ total: { min: 500 } });
	});

	it.each([
		["two numbers claim one part", "min", "min"],
		["the minimum is above the maximum", "max", "min"],
		["an exact amount comes with a bound", "exact", "min"],
		["a number asks for what no part expresses", "min", "not_available"],
	])("holds the amount when %s", async (_, first, second) => {
		const result = await ask({
			...base,
			request: "invoices between 500 and 2,000",
			provider: fakeProvider({
				total_a0: answer(ROLES, first, 0.95),
				total_a1: answer(ROLES, second, 0.95),
			}),
			filter: invoiceFilter(),
		});

		expect(result.filter.value).toEqual({});
	});

	it("holds the amount when its numbers name two currencies", async () => {
		const result = await ask({
			...base,
			request: "between 500 euros and 2,000 dollars",
			provider: fakeProvider({
				total_a0: answer(ROLES, "min"),
				total_a1: answer(ROLES, "max"),
			}),
			filter: invoiceFilter(),
		});

		expect(result.filter.value).toEqual({});
	});
});

describe("ask: a request with more readings than a field can weigh", () => {
	it("holds the amount without a question when the request has over 10 amounts", async () => {
		const fake = fakeProvider({});

		const result = await ask({
			...base,
			request: "1 ".repeat(11),
			provider: fake,
			filter: invoiceFilter(),
		});

		expect(fake.calls).toHaveLength(0);
		expect(result.filter.value).toEqual({});
		expect(result.filter.fields.total.candidates).toEqual([]);
	});

	it("still asks about 10 amounts", async () => {
		const labels = [...ROLES];
		const fake = fakeProvider(
			Object.fromEntries(
				Array.from({ length: 10 }, (_, i) => [
					`total_a${i}`,
					answer(labels, "not_mentioned"),
				]),
			),
		);

		const result = await ask({
			...base,
			request: "1 ".repeat(10),
			provider: fake,
			filter: invoiceFilter(),
		});

		expect(fake.calls[0]?.questions).toHaveLength(10);
		expect(result.filter.fields.total.candidates).toHaveLength(10);
	});

	it("holds the date without a question when the request has over 10 dates, and still asks about the amount", async () => {
		const labels = [...ROLES];
		const fake = fakeProvider({ total_a0: answer(labels, "exact") });
		const days = Array.from(
			{ length: 11 },
			(_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`,
		).join(", ");

		const result = await ask({
			...base,
			request: `invoices of $12 on ${days}`,
			provider: fake,
			filter: invoiceFilter(),
		});

		expect(fake.calls[0]?.questions.map(({ id }) => id)).toEqual(["total_a0"]);
		expect(result.filter.fields.issued.candidates).toEqual([]);
	});
});

describe("ask: parsers the host app registers", () => {
	/** A regional format no built-in parser ships: "RD$" for Dominican pesos. */
	const dominicanPesos: Parser = (request) => {
		const match = /RD\$\s*([\d,]+)/.exec(request);
		return match?.[1]
			? {
					amounts: [
						{
							text: match[0],
							value: Number(match[1].replace(/,/g, "")),
							currency: "DOP",
						},
					],
				}
			: {};
	};

	it("adds its readings beside the built-in ones, and wins where they overlap", async () => {
		const fake = fakeProvider({ total_a0: answer(ROLES, "min") });

		const result = await ask({
			...base,
			request: "facturas de más de RD$ 5,000",
			provider: fake,
			filter: invoiceFilter({ parsers: [dominicanPesos] }),
		});

		expect(fake.calls[0]?.questions.map(({ id }) => id)).toEqual(["total_a0"]);
		expect(
			result.filter.fields.total.candidates.map(({ value }) => value),
		).toEqual([{ text: "RD$ 5,000", value: 5000, currency: "DOP" }]);
		expect(result.filter.value).toEqual({
			total: { min: 5000, currency: "DOP" },
		});
	});

	it("claims the occurrence a host parser read even when the same text comes twice", async () => {
		const secondPrice: Parser = (request) =>
			request.includes("500")
				? {
						amounts: [
							{ text: "500", value: 500, currency: "DOP" },
							{ text: "500", value: 500, currency: "DOP" },
						],
					}
				: {};

		const result = await ask({
			...base,
			request: "500 invoices over 500",
			provider: fakeProvider({
				total_a0: answer(ROLES, "not_mentioned"),
				total_a1: answer(ROLES, "min"),
			}),
			filter: invoiceFilter({ parsers: [secondPrice] }),
		});

		// The host's two readings are one value in one currency, so one candidate (#201); the built-in reads neither 500.
		expect(
			result.filter.fields.total.candidates.map(({ value }) => value.currency),
		).toEqual(["DOP"]);
	});

	it.each(["d0", "d1"])(
		"holds a date field whose pick is a reading the request leaves open, 'last Monday' as %s at 0.99",
		async (picked) => {
			const labels = ["d0", "d1", ...MISSING];
			const result = await ask({
				...base,
				request: "invoices from last Monday",
				provider: fakeProvider({
					issued_from: answer(labels, picked, 0.99),
					issued_to: answer(labels, picked, 0.99),
				}),
				filter: invoiceFilter(),
			});

			expect(
				result.filter.fields.issued.candidates.map(({ value }) => value.from),
			).toEqual(["2026-09-21", "2026-09-14"]);
			expect(result.filter.value).toEqual({});
		},
	);

	it("hands a parser today as a date, the past as the way a filter reads, and the facts", async () => {
		const seen: unknown[] = [];
		const fiscalYear: Parser = (request, input) => {
			seen.push(input);
			return request.includes("FY26")
				? {
						dates: [
							{
								text: "FY26",
								from: "2025-10-01",
								to: "2026-09-30",
								note: "the fiscal year 2026",
							},
						],
					}
				: {};
		};
		const labels = ["d0", ...MISSING];

		const result = await ask({
			...base,
			request: "invoices in FY26",
			provider: fakeProvider({
				issued_from: answer(labels, "d0"),
				issued_to: answer(labels, "d0"),
			}),
			filter: invoiceFilter({ parsers: [fiscalYear] }),
		});

		expect(seen).toEqual([{ today: "2026-09-22", reads: "past", facts }]);
		expect(result.filter.value).toEqual({
			issued: { from: "2025-10-01", to: "2026-09-30" },
		});
	});
});

describe("ask: filter declarations", () => {
	it("refuses two fields whose questions would share an id", async () => {
		await expect(
			ask({
				...base,
				request: "invoices from last month",
				provider: fakeProvider({}),
				filter: {
					description: "invoices",
					fields: {
						issued: { kind: "date", description: "issued", gate: 0.8 },
						issued_from: {
							kind: "catalog",
							description: "who issued it",
							gate: 0.8,
							shortlist: () => [
								{ id: "ana", description: "Ana", value: "ana" },
							],
						},
					},
				},
			}),
		).rejects.toThrow(/issued_from/);
	});

	it("does not compile a date or amount field without a gate", () => {
		const withoutGate = () =>
			ask({
				...base,
				request: "unpaid invoices",
				provider: fakeProvider({}),
				filter: {
					description: "invoices",
					fields: {
						// @ts-expect-error: every field declares its gate (ADR 0003)
						issued: { kind: "date", description: "the day it was issued" },
						// @ts-expect-error: every field declares its gate (ADR 0003)
						total: { kind: "amount", description: "the invoice's total" },
					},
				},
			});

		expect(withoutGate).toBeTypeOf("function");
	});

	it("infers a date field's value as a range of days and an amount's as bounds with a currency", async () => {
		const result = await ask({
			...base,
			request: "unpaid invoices",
			provider: fakeProvider({}),
			filter: invoiceFilter(),
		});

		expectTypeOf(result.filter.value).toEqualTypeOf<{
			issued?: { from?: string; to?: string };
			total?: { min?: number; max?: number; exact?: number; currency?: string };
		}>();
	});
});
