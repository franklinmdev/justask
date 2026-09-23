import { ask, type Candidate, type Facts, type Probabilities } from "justask";
import { describe, expect, expectTypeOf, it } from "vitest";
import { failingProvider, fakeProvider } from "./fake-provider.ts";

// A Tuesday. The handler writes today as a sentence; `ask` reads the date in it.
const facts: Facts = {
	today: "Today is Tuesday 2026-09-22 (martes 22 de septiembre de 2026).",
	local_currency: "USD",
};

type Vendor = { name: string };
const vendors: Candidate<Vendor>[] = [
	{
		id: "northwind",
		description: "Northwind Catering",
		value: { name: "Northwind" },
	},
	{ id: "acme", description: "Acme Office Supply", value: { name: "Acme" } },
];
type Tag = "meals" | "travel" | "client";
const tags: Candidate<Tag>[] = [
	{ id: "meals", description: "Meals: lunch, dinner, coffee", value: "meals" },
	{ id: "travel", description: "Travel: taxi, flight, hotel", value: "travel" },
	{
		id: "client",
		description: "Client work, billable to a client",
		value: "client",
	},
];

function expenseCard({
	gate = 0.8,
	fieldGate = 0.8,
}: {
	gate?: number;
	fieldGate?: number;
} = {}) {
	return {
		description: "expense the person paid",
		gate,
		fields: {
			vendor: {
				kind: "catalog" as const,
				description: "the vendor who was paid",
				gate: fieldGate,
				shortlist: () => vendors,
			},
			tags: {
				kind: "catalog" as const,
				several: true as const,
				description: "the expense's tags",
				gate: fieldGate,
				shortlist: () => tags,
			},
			spent_on: {
				kind: "date" as const,
				reads: "past" as const,
				description: "the day the money was spent",
				gate: fieldGate,
			},
			at: {
				kind: "time" as const,
				description: "the time the money was spent",
				gate: fieldGate,
			},
			total: {
				kind: "amount" as const,
				description: "the amount paid",
				gate: fieldGate,
			},
		},
	};
}

const base = { facts, timeoutMs: 1_000 };

const MISSING = ["not_mentioned", "not_available"];
const INTENT = ["new_record", ...MISSING];
const YES = ["yes", ...MISSING];

/** Every label at `rest`, and `winner` at `p`. */
function answer(labels: string[], winner: string, p = 0.9): Probabilities {
	const rest = labels.length > 1 ? (1 - p) / (labels.length - 1) : 0;
	return Object.fromEntries(
		labels.map((label) => [label, label === winner ? p : rest]),
	);
}

/** Every tag's question answered `not_mentioned`, but the ones in `yes`. */
function tagAnswers(yes: Tag[] = [], p = 0.9) {
	return Object.fromEntries(
		tags.map(({ id }) => [
			`tags_${id}`,
			answer(YES, yes.includes(id as Tag) ? "yes" : "not_mentioned", p),
		]),
	);
}

describe("ask: card", () => {
	it("fills a new record from its picked candidates, in one call with the intent question", async () => {
		const fake = fakeProvider({
			intent: answer(INTENT, "new_record", 0.97),
			vendor: answer(["northwind", "acme", ...MISSING], "northwind"),
			...tagAnswers(["meals"]),
			spent_on: answer(["d0", ...MISSING], "d0"),
			total: answer(["a0", ...MISSING], "a0"),
		});

		const result = await ask({
			...base,
			request: "log a $42 lunch with Northwind yesterday",
			provider: fake,
			card: expenseCard(),
		});

		expect(fake.calls).toHaveLength(1);
		expect(fake.calls[0]?.questions.map(({ id }) => id)).toEqual([
			"intent",
			"vendor",
			"tags_meals",
			"tags_travel",
			"tags_client",
			"spent_on",
			"total",
		]);
		expect(result.error).toBeUndefined();
		expect(result.card.value).toEqual({
			vendor: { name: "Northwind" },
			tags: ["meals"],
			spent_on: "2026-09-21",
			total: { value: 42, currency: "USD" },
		});
		expect(result.card.intent).toEqual({
			pick: { label: "new_record", probability: 0.97 },
			probabilities: answer(INTENT, "new_record", 0.97),
			gate: 0.8,
		});
		expectTypeOf(result.card.value).toEqualTypeOf<{
			vendor?: Vendor;
			tags?: Tag[];
			spent_on?: string;
			at?: string;
			total?: { value: number; currency?: string };
		}>();
	});

	/** Every field confident, so only the intent decides. */
	const confident = {
		vendor: answer(["northwind", "acme", ...MISSING], "northwind", 0.99),
		...tagAnswers(["meals"], 0.99),
		spent_on: answer(["d0", ...MISSING], "d0", 0.99),
		total: answer(["a0", ...MISSING], "a0", 0.99),
	};

	it.each([
		[
			"a question about one",
			"how much did the Northwind lunch yesterday cost, $42?",
			"not_available",
		],
		[
			"a change to one",
			"change yesterday's Northwind lunch to $42",
			"not_available",
		],
		[
			"no record at all",
			"thanks! $42 lunch with Northwind yesterday was great",
			"not_mentioned",
		],
	])(
		"fills nothing from %s, though it names a vendor, a day and an amount",
		async (_, request, pick) => {
			const result = await ask({
				...base,
				request,
				provider: fakeProvider({
					intent: answer(INTENT, pick, 0.95),
					...confident,
				}),
				card: expenseCard(),
			});

			expect(result.card.value).toEqual({});
			expect(result.card.intent.pick).toEqual({
				label: pick,
				probability: 0.95,
			});
			// The answers stay in the result, for an inspector.
			expect(result.card.fields.vendor.pick).toEqual({
				label: "northwind",
				probability: 0.99,
			});
		},
	);

	it("holds every field while new_record is below the card's gate, and fills them once it sits on it", async () => {
		const at = (p: number) =>
			ask({
				...base,
				request: "Northwind lunch $42 yesterday",
				provider: fakeProvider({
					intent: answer(INTENT, "new_record", p),
					...confident,
				}),
				card: expenseCard({ gate: 0.9 }),
			});

		expect((await at(0.89)).card.value).toEqual({});
		expect(Object.keys((await at(0.9)).card.value)).toEqual([
			"vendor",
			"tags",
			"spent_on",
			"total",
		]);
	});

	it("offers sending and forwarding a record as not adding one", async () => {
		const fake = fakeProvider({ intent: answer(INTENT, "not_available") });

		await ask({
			...base,
			request: "send the Northwind invoice to accounting",
			provider: fake,
			card: expenseCard(),
		});

		const intent = fake.calls[0]?.questions.find(({ id }) => id === "intent");
		expect(
			intent?.labels.find(({ label }) => label === "not_available")
				?.description,
		).toBe(
			"It is about a expense the person paid but does not add a new one: it changes, cancels, deletes, sends or forwards one, or asks a question",
		);
	});

	describe("commands on a record that already exists (ADR 0009)", () => {
		const commands = {
			verbs: ["quite", "envíe", "send"],
			references: ["el gasto", "la factura", "the invoice"],
		};
		const fill = (request: string) => {
			const fake = fakeProvider({
				intent: answer(INTENT, "new_record", 0.99),
				...confident,
			});
			return {
				fake,
				result: ask({
					...base,
					request,
					provider: fake,
					card: { ...expenseCard(), commands },
				}),
			};
		};

		it("holds the whole card on a verb and a reference, whatever the pick, and names the words as written", async () => {
			const { fake, result } = fill("Quite el gasto de $42 de Northwind");
			const { card } = await result;

			expect(card.value).toEqual({});
			expect(card.intent).toEqual({
				pick: { label: "new_record", probability: 0.99 },
				probabilities: answer(INTENT, "new_record", 0.99),
				gate: 0.8,
				command: { verb: "Quite", reference: "el gasto" },
			});
			// Still asked, so every pick is reported.
			expect(fake.calls).toHaveLength(1);
			expect(card.fields.vendor.pick).toEqual({
				label: "northwind",
				probability: 0.99,
			});
		});

		it("reads a reference across up to two words, as English puts them before the noun", async () => {
			const held = await fill("send the $42 Northwind invoice to accounting")
				.result;
			const far = await fill("send the big $42 Northwind invoice to accounting")
				.result;

			expect(held.card.intent.command).toEqual({
				verb: "send",
				reference: "the $42 Northwind invoice",
			});
			expect(far.card.intent.command).toBeUndefined();
		});

		it.each([
			["a verb alone", "send $42 to Northwind for lunch yesterday"],
			["a reference alone", "Northwind lunch, the invoice said $42"],
			[
				"a verb inside another word",
				"resend-free Northwind lunch, the invoice $42",
			],
			["the verb with other accents", "quité el gasto de $42 de Northwind"],
			["a reference with no determiner", "send invoice copies, Northwind, $42"],
		])("fills on %s", async (_, request) => {
			const { card } = await fill(request).result;

			expect(card.intent.command).toBeUndefined();
			expect(card.value).not.toEqual({});
		});

		it("never reads the verb from inside the reference it pairs with", async () => {
			const commands = {
				verbs: ["email"],
				references: ["the invoice"],
			};
			const result = await ask({
				...base,
				request: "paid the email hosting invoice from Northwind, $12",
				provider: fakeProvider({
					intent: answer(INTENT, "new_record", 0.99),
					...confident,
				}),
				card: { ...expenseCard(), commands },
			});

			expect(result.card.intent.command).toBeUndefined();
			expect(result.card.value).not.toEqual({});
		});

		it.each([
			[
				"a combining mark NFC cannot fold into the verb",
				"quite\u0331 el gasto de $42 de Northwind",
			],
			[
				"a verb split by another word, where only a reference may be",
				"send it over, and the invoice was $42",
			],
		])("fills on %s", async (_, request) => {
			const result = await ask({
				...base,
				request,
				provider: fakeProvider({
					intent: answer(INTENT, "new_record", 0.99),
					...confident,
				}),
				card: {
					...expenseCard(),
					commands: {
						verbs: ["quite", "send over"],
						references: ["el gasto", "the invoice"],
					},
				},
			});

			expect(result.card.intent.command).toBeUndefined();
		});

		it("refuses a blank verb or reference, which would match anywhere", async () => {
			const call = (commands: { verbs: string[]; references: string[] }) =>
				ask({
					...base,
					request: "a lunch",
					provider: fakeProvider({}),
					card: { ...expenseCard(), commands },
				});

			await expect(
				call({ verbs: ["", "delete"], references: ["the expense"] }),
			).rejects.toThrow(/blank/);
			await expect(
				call({ verbs: ["delete"], references: ["  "] }),
			).rejects.toThrow(/blank/);
		});

		it("fills as before when the card declares no commands", async () => {
			const result = await ask({
				...base,
				request: "quite el gasto de $42 de Northwind",
				provider: fakeProvider({
					intent: answer(INTENT, "new_record", 0.99),
					...confident,
				}),
				card: expenseCard(),
			});

			expect(result.card.intent.command).toBeUndefined();
			expect(result.card.value).not.toEqual({});
		});
	});

	describe("a catalog field where several items may apply", () => {
		const fill = (tagQuestions: Record<string, Probabilities>) =>
			ask({
				...base,
				request: "$42 client lunch with Northwind yesterday, taxi included",
				provider: fakeProvider({
					intent: answer(INTENT, "new_record", 0.97),
					vendor: answer(["northwind", "acme", ...MISSING], "northwind"),
					...tagQuestions,
					spent_on: answer(["d0", ...MISSING], "d0"),
					total: answer(["a0", ...MISSING], "a0"),
				}),
				card: expenseCard(),
			});

		it("puts one yes-or-no question per item, and fills with every item asked for", async () => {
			const result = await fill(tagAnswers(["meals", "travel", "client"]));

			expect(result.card.value.tags).toEqual(["meals", "travel", "client"]);
			expect(result.card.fields.tags.answers.travel).toEqual({
				pick: { label: "yes", probability: 0.9 },
				probabilities: answer(YES, "yes"),
			});
		});

		it("holds the field when one item's pick is below the gate, though the others clear it", async () => {
			const result = await fill({
				...tagAnswers(["meals", "client"]),
				tags_travel: answer(YES, "yes", 0.6),
			});

			expect("tags" in result.card.value).toBe(false);
			expect(result.card.value.vendor).toEqual({ name: "Northwind" });
		});

		it("holds the field when a word could be one item or another, as not_available says", async () => {
			const result = await fill({
				...tagAnswers(["meals"]),
				tags_travel: answer(YES, "not_available", 0.95),
			});

			expect("tags" in result.card.value).toBe(false);
		});

		it("leaves the field out when the request asks for no item", async () => {
			const result = await fill(tagAnswers([]));

			expect("tags" in result.card.value).toBe(false);
		});
	});

	describe("dates the request itself leaves open", () => {
		function billCard() {
			return {
				description: "bill to pay",
				gate: 0.8,
				fields: {
					due_on: {
						kind: "date" as const,
						reads: "future" as const,
						description: "the day the bill is due",
						gate: 0.8,
					},
				},
			};
		}

		it.each(["d0", "d1"])(
			"holds 'next Friday' whichever reading the provider picks, here %s at 0.99",
			async (picked) => {
				const result = await ask({
					...base,
					request: "Acme bill due next Friday",
					provider: fakeProvider({
						intent: answer(INTENT, "new_record", 0.97),
						due_on: answer(["d0", "d1", ...MISSING], picked, 0.99),
					}),
					card: billCard(),
				});

				expect(result.card.value).toEqual({});
				expect(
					result.card.fields.due_on.candidates.map(({ value }) => [
						value.from,
						value.ambiguous,
					]),
				).toEqual([
					["2026-09-25", true],
					["2026-10-02", true],
				]);
			},
		);

		it("holds 'next Monday' said on a Tuesday, where the nearest Monday is already next week's", async () => {
			const result = await ask({
				...base,
				request: "Acme bill due next Monday",
				provider: fakeProvider({
					intent: answer(INTENT, "new_record", 0.97),
					due_on: answer(["d0", "d1", ...MISSING], "d0", 0.99),
				}),
				card: billCard(),
			});

			expect(
				result.card.fields.due_on.candidates.map(({ value }) => value.from),
			).toEqual(["2026-09-28", "2026-10-05"]);
			expect(result.card.value).toEqual({});
		});

		it("fills a bare weekday forward on a field that reads the future, and back on one that reads the past", async () => {
			const result = await ask({
				...base,
				request: "Acme bill from Friday, due Friday",
				provider: fakeProvider({
					intent: answer(INTENT, "new_record", 0.97),
					issued_on: answer(["d0", "d1", ...MISSING], "d0"),
					due_on: answer(["d0", "d1", ...MISSING], "d1"),
				}),
				card: {
					...billCard(),
					fields: {
						issued_on: {
							kind: "date" as const,
							reads: "past" as const,
							description: "the day the bill was issued",
							gate: 0.8,
						},
						...billCard().fields,
					},
				},
			});

			expect(result.card.value).toEqual({
				issued_on: "2026-09-18",
				due_on: "2026-09-25",
			});
		});

		it("holds a date field whose pick is a period, not a day", async () => {
			const result = await ask({
				...base,
				request: "Acme bill due next week",
				provider: fakeProvider({
					intent: answer(INTENT, "new_record", 0.97),
					due_on: answer(["d0", ...MISSING], "d0", 0.99),
				}),
				card: billCard(),
			});

			expect(result.card.fields.due_on.candidates[0]?.value).toMatchObject({
				from: "2026-09-28",
				to: "2026-10-04",
			});
			expect(result.card.value).toEqual({});
		});
	});

	describe("times and amounts", () => {
		const card = () => ({
			...expenseCard(),
			fields: {
				at: expenseCard().fields.at,
				total: expenseCard().fields.total,
			},
		});

		it("fills a time field from the reading the provider picks", async () => {
			const fake = fakeProvider({
				intent: answer(INTENT, "new_record", 0.97),
				at: answer(["t0", "t1", ...MISSING], "t1"),
				total: answer(["a0", ...MISSING], "a0"),
			});

			const result = await ask({
				...base,
				request: "coffee $4.50 a la una y media",
				provider: fake,
				card: card(),
			});

			expect(result.card.value).toEqual({
				at: "13:30",
				total: { value: 4.5, currency: "USD" },
			});
		});

		it("holds 'a las 2 y pico' whichever reading the provider picks", async () => {
			const result = await ask({
				...base,
				request: "coffee $4.50 a las 2 y pico",
				provider: fakeProvider({
					intent: answer(INTENT, "new_record", 0.97),
					at: answer(["t0", "t1", ...MISSING], "t1", 0.99),
					total: answer(["a0", ...MISSING], "a0"),
				}),
				card: card(),
			});

			expect(result.card.value).toEqual({
				total: { value: 4.5, currency: "USD" },
			});
		});

		it("holds an amount whose currency does not resolve against the local one", async () => {
			const result = await ask({
				...base,
				request: "almuerzo de 500 pesos",
				provider: fakeProvider({
					intent: answer(INTENT, "new_record", 0.97),
					total: answer(["a0", ...MISSING], "a0", 0.99),
				}),
				card: card(),
			});

			expect(result.card.value).toEqual({});
			expect(result.card.fields.total.candidates[0]?.value.unresolved).toBe(
				"pesos",
			);
		});

		it("holds a field with no candidates without a question, and asks the intent question alone", async () => {
			const fake = fakeProvider({
				intent: answer(INTENT, "new_record", 0.97),
			});

			const result = await ask({
				...base,
				request: "log a coffee",
				provider: fake,
				card: card(),
			});

			expect(fake.calls[0]?.questions.map(({ id }) => id)).toEqual(["intent"]);
			expect(result.card.value).toEqual({});
		});
	});

	it("holds every field and carries the error when the provider fails", async () => {
		const result = await ask({
			...base,
			request: "log a $42 lunch with Northwind yesterday",
			provider: failingProvider(new Error("503")),
			card: expenseCard(),
		});

		expect(result.error).toMatchObject({ kind: "provider", message: "503" });
		expect(result.card.value).toEqual({});
		expect(result.card.intent).toEqual({
			pick: null,
			probabilities: {},
			gate: 0.8,
		});
		expect(result.card.fields.tags.answers).toEqual({});
	});

	describe("declarations", () => {
		it.each([0, 1, Number.NaN])("refuses a card gate of %s", async (gate) => {
			await expect(
				ask({
					...base,
					request: "a lunch",
					provider: fakeProvider({}),
					card: expenseCard({ gate }),
				}),
			).rejects.toThrow(/card's gate/);
		});

		it("refuses a field gate outside 0 and 1", async () => {
			await expect(
				ask({
					...base,
					request: "a lunch",
					provider: fakeProvider({}),
					card: expenseCard({ fieldGate: 1 }),
				}),
			).rejects.toThrow(/gate of field "vendor"/);
		});

		it("refuses a field that would take the intent question's id, or another field's", async () => {
			const date = {
				kind: "date" as const,
				reads: "past" as const,
				description: "a day",
				gate: 0.8,
			};
			const call = (
				fields: Record<
					string,
					typeof date | ReturnType<typeof expenseCard>["fields"]["tags"]
				>,
			) =>
				ask({
					...base,
					request: "a lunch",
					provider: fakeProvider({}),
					card: { description: "expense", gate: 0.8, fields },
				});

			await expect(call({ intent: date })).rejects.toThrow(/"intent"/);
			await expect(
				call({ tags: expenseCard().fields.tags, tags_meals: date }),
			).rejects.toThrow(/"tags_meals"/);
		});

		it("does not compile a date field that does not say which way it reads, and compiles it once it does", () => {
			const withoutReads = () =>
				ask({
					...base,
					request: "a lunch",
					provider: fakeProvider({}),
					// @ts-expect-error: a card's date field says which way it reads
					card: {
						description: "expense",
						gate: 0.8,
						fields: {
							spent_on: { kind: "date", description: "a day", gate: 0.8 },
						},
					},
				});
			const withReads = () =>
				ask({
					...base,
					request: "a lunch",
					provider: fakeProvider({}),
					card: {
						description: "expense",
						gate: 0.8,
						fields: {
							spent_on: {
								kind: "date",
								reads: "past",
								description: "a day",
								gate: 0.8,
							},
						},
					},
				});

			expect(withoutReads).toBeTypeOf("function");
			expect(withReads).toBeTypeOf("function");
		});
	});
});
