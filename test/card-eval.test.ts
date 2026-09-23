import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Candidate, Probabilities } from "justask";
import {
	type CardRun,
	compareCardRuns,
	formatCardReport,
	type KillLines,
	parseCardEvalSet,
	readCardRun,
	runCardEval,
	scoreCardRun,
} from "justask/eval";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	type FakeAnswers,
	failingProvider,
	fakeProvider,
} from "./fake-provider.ts";

const set = (lines: object[]) =>
	parseCardEvalSet(lines.map((line) => JSON.stringify(line)).join("\n"));

const killLines: KillLines = {
	exact: 0.9,
	coverage: 0.7,
	invented: 0,
	heldAmbiguous: 0.75,
	p95Ms: 1000,
	errors: 0,
};

describe("parseCardEvalSet", () => {
	it("reads one row per line: a value or held per field, none on a nothing row", () => {
		const rows = set([
			{
				id: "c1",
				request: "lunch with Northwind yesterday, $42",
				kind: "record",
				expected: {
					vendor: "northwind",
					tags: ["meals"],
					spent_on: "2026-09-22",
					total: { value: 42, currency: "USD" },
				},
			},
			{
				request: "lunch with Northwind or Acme",
				kind: "ambiguous",
				expected: { vendor: "held", tags: ["meals"] },
			},
			{ request: "hola", kind: "nothing" },
		]);

		expect(rows).toEqual([
			{
				id: "c1",
				request: "lunch with Northwind yesterday, $42",
				kind: "record",
				expected: {
					vendor: "northwind",
					tags: ["meals"],
					spent_on: "2026-09-22",
					total: { value: 42, currency: "USD" },
				},
			},
			{
				id: "line-2",
				request: "lunch with Northwind or Acme",
				kind: "ambiguous",
				expected: { vendor: "held", tags: ["meals"] },
			},
			{ id: "line-3", request: "hola", kind: "nothing", expected: {} },
		]);
	});

	it.each([
		["a line that is not JSON", "{", /line 1: not JSON/],
		["an empty set", "\n", /no rows/],
		[
			"a filter kind",
			JSON.stringify({ request: "x", kind: "filterable" }),
			/"kind" must be record, ambiguous or nothing/,
		],
		[
			"a record row with no field",
			JSON.stringify({ request: "x", kind: "record", expected: {} }),
			/a record row expects at least one field/,
		],
		[
			"a record row that holds a field",
			JSON.stringify({
				request: "x",
				kind: "record",
				expected: { vendor: "held" },
			}),
			/only an ambiguous row expects a field held/,
		],
		[
			"an ambiguous row with no held field",
			JSON.stringify({
				request: "x",
				kind: "ambiguous",
				expected: { vendor: "acme" },
			}),
			/an ambiguous row expects at least one field "held"/,
		],
		[
			"a nothing row that expects a field",
			JSON.stringify({
				request: "x",
				kind: "nothing",
				expected: { vendor: "acme" },
			}),
			/a nothing row expects no field/,
		],
		[
			"an empty list of items",
			JSON.stringify({ request: "x", kind: "record", expected: { tags: [] } }),
			/field "tags" expects/,
		],
		[
			"an amount with no value",
			JSON.stringify({
				request: "x",
				kind: "record",
				expected: { total: { currency: "USD" } },
			}),
			/field "total" expects/,
		],
		[
			"a repeated id",
			[
				JSON.stringify({ id: "a", request: "x", kind: "nothing" }),
				JSON.stringify({ id: "a", request: "y", kind: "nothing" }),
			].join("\n"),
			/line 2: the id "a" is already used on line 1/,
		],
	])("refuses %s", (_, jsonl, error) => {
		expect(() => parseCardEvalSet(jsonl)).toThrow(error);
	});
});

type Vendor = { name: string };
const vendors: Candidate<Vendor>[] = [
	{ id: "acme", description: "Acme Office Supply", value: { name: "Acme" } },
	{
		id: "northwind",
		description: "Northwind Catering",
		value: { name: "Northwind" },
	},
];
type Tag = "meals" | "travel";
const tagCatalog: Candidate<Tag>[] = [
	{ id: "meals", description: "meals: lunch, dinner", value: "meals" },
	{ id: "travel", description: "travel: taxi, flight", value: "travel" },
];

function expenseCard(
	gates = { intent: 0.8, vendor: 0.8, tags: 0.8, spent_on: 0.8, total: 0.8 },
) {
	return {
		description: "expense the person paid",
		gate: gates.intent,
		fields: {
			vendor: {
				kind: "catalog" as const,
				description: "the vendor who was paid",
				gate: gates.vendor,
				shortlist: () => vendors,
			},
			tags: {
				kind: "catalog" as const,
				several: true as const,
				description: "the expense's tags",
				gate: gates.tags,
				shortlist: () => tagCatalog,
			},
			spent_on: {
				kind: "date" as const,
				reads: "past" as const,
				description: "the day the money was spent",
				gate: gates.spent_on,
			},
			total: {
				kind: "amount" as const,
				description: "the amount paid",
				gate: gates.total,
			},
		},
	};
}

const MISSING = ["not_mentioned", "not_available"];

/** Every label at an even share of what is left, and `winner` at `p`. */
function answer(labels: string[], winner: string, p = 0.9): Probabilities {
	const rest = (1 - p) / (labels.length - 1);
	return Object.fromEntries(
		labels.map((label) => [label, label === winner ? p : rest]),
	);
}
const intentLabels = ["new_record", ...MISSING];
const vendorLabels = ["acme", "northwind", ...MISSING];
const yesLabels = ["yes", ...MISSING];
const dateLabels = ["d0", ...MISSING];
const amountLabels = ["a0", ...MISSING];

/** Both tags' questions, `meals` answered yes at `p`, `travel` not mentioned. */
const mealsOnly = (p = 0.95) => ({
	tags_meals: answer(yesLabels, "yes", p),
	tags_travel: answer(yesLabels, "not_mentioned", 0.97),
});

const answersByRequest: Record<string, FakeAnswers> = {
	// Every field right and sure.
	"lunch with Northwind yesterday, $42": {
		intent: answer(intentLabels, "new_record", 0.97),
		vendor: answer(vendorLabels, "northwind", 0.95),
		...mealsOnly(),
		spent_on: answer(dateLabels, "d0", 0.93),
		total: answer(amountLabels, "a0", 0.99),
	},
	// A record whose vendor is right but unsure, 0.7, with no day in it.
	"acme toner, $18": {
		intent: answer(intentLabels, "new_record", 0.9),
		vendor: answer(vendorLabels, "acme", 0.7),
		tags_meals: answer(yesLabels, "not_mentioned", 0.9),
		tags_travel: answer(yesLabels, "not_mentioned", 0.9),
		total: answer(amountLabels, "a0", 0.95),
	},
	// Ambiguous: the vendor filled at 0.85 where it must stay held.
	"lunch with Northwind or Acme": {
		intent: answer(intentLabels, "new_record", 0.95),
		vendor: answer(vendorLabels, "northwind", 0.85),
		...mealsOnly(0.9),
	},
	// Nothing: new_record at 0.6, and a sure vendor that must never show.
	"how much did Northwind cost?": {
		intent: answer(intentLabels, "new_record", 0.6),
		vendor: answer(vendorLabels, "northwind", 0.99),
		tags_meals: answer(yesLabels, "not_mentioned", 0.9),
		tags_travel: answer(yesLabels, "not_mentioned", 0.9),
	},
};

describe("runCardEval", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "justask-card-eval-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	const rows = () =>
		set([
			{
				id: "full",
				request: "lunch with Northwind yesterday, $42",
				kind: "record",
				expected: {
					vendor: "northwind",
					tags: ["meals"],
					spent_on: "2026-09-22",
					total: { value: 42, currency: "USD" },
				},
			},
			{
				id: "unsure",
				request: "acme toner, $18",
				kind: "record",
				expected: { vendor: "acme", total: { value: 18, currency: "USD" } },
			},
			{
				id: "two",
				request: "lunch with Northwind or Acme",
				kind: "ambiguous",
				expected: { vendor: "held", tags: ["meals"] },
			},
			{ id: "ask", request: "how much did Northwind cost?", kind: "nothing" },
		]);

	const fakeAnswers = () =>
		fakeProvider(
			(request) => {
				const answers = answersByRequest[request];
				if (!answers) throw new Error(`no fixture for "${request}"`);
				return answers;
			},
			{ costUsd: 0.0001 },
		);

	const input = (log: string, provider = fakeAnswers()) => ({
		set: rows(),
		card: expenseCard(),
		provider,
		facts: { today: "Today is Wednesday 2026-09-23.", local_currency: "USD" },
		timeoutMs: 1_000,
		killLines,
		log,
	});

	it("runs every row through the real pipeline and logs the intent's and each field's gate, candidates and raw answer", async () => {
		const log = join(dir, "run-1.jsonl");
		const provider = fakeAnswers();

		const run = await runCardEval(input(log, provider));

		expect(provider.calls).toHaveLength(4);
		expect(run.gates).toEqual({
			intent: 0.8,
			vendor: 0.8,
			tags: 0.8,
			spent_on: 0.8,
			total: 0.8,
		});
		expect(run.killLines).toEqual(killLines);
		expect(run.rows[0]).toMatchObject({
			id: "full",
			kind: "record",
			called: true,
			costUsd: 0.0001,
			answers: answersByRequest["lunch with Northwind yesterday, $42"],
			fields: {
				vendor: {
					kind: "catalog",
					candidates: [
						{ id: "acme", description: "Acme Office Supply" },
						{ id: "northwind", description: "Northwind Catering" },
					],
				},
				tags: {
					kind: "several",
					candidates: [
						{ id: "meals", description: "meals: lunch, dinner" },
						{ id: "travel", description: "travel: taxi, flight" },
					],
				},
				spent_on: {
					kind: "date",
					candidates: [{ id: "d0", value: { from: "2026-09-22" } }],
				},
				total: {
					kind: "amount",
					candidates: [{ id: "a0", value: { value: 42, currency: "USD" } }],
				},
			},
		});
		expect(await readCardRun(log)).toEqual(run);
		expect((await readFile(log, "utf8")).trim().split("\n")).toHaveLength(5);
	});

	it("refuses, before any call, a row that expects a field the card lacks or a value of another kind", async () => {
		const provider = fakeAnswers();
		const unknown = set([
			{ request: "x", kind: "record", expected: { payee: "acme" } },
		]);
		const wrongKind = set([
			{ request: "x", kind: "record", expected: { tags: "meals" } },
		]);
		const notADay = set([
			{ request: "x", kind: "record", expected: { spent_on: "yesterday" } },
		]);

		for (const [name, rows] of [
			["a", unknown],
			["b", wrongKind],
			["c", notADay],
		] as const) {
			await expect(
				runCardEval({
					...input(join(dir, `${name}.jsonl`), provider),
					set: rows,
				}),
			).rejects.toThrow(/justask: card eval row/);
		}
		expect(provider.calls).toHaveLength(0);
	});

	it("never overwrites a saved run", async () => {
		const log = join(dir, "run-1.jsonl");
		await writeFile(log, "paid for\n");
		const provider = fakeAnswers();

		await expect(runCardEval(input(log, provider))).rejects.toThrow(/exists/);
		expect(provider.calls).toHaveLength(0);
	});

	it("records a provider failure as the row's error, and carries on", async () => {
		const run = await runCardEval(
			input(join(dir, "failed.jsonl"), failingProvider(new Error("down"))),
		);

		expect(run.rows.map(({ error }) => error?.kind)).toEqual([
			"provider",
			"provider",
			"provider",
			"provider",
		]);
		expect(scoreCardRun(run).measures.errors).toBe(4);
	});

	it("scores each card by its fields: exact over the cards that filled any, coverage over the fields expected", async () => {
		const log = join(dir, "run-1.jsonl");
		await runCardEval(input(log));
		const report = scoreCardRun(await readCardRun(log));

		// full fills all four; unsure fills its total only; two fills tags,
		// held vendor and all; ask fills nothing, its intent below the gate.
		expect(report.counts).toEqual({
			cards: 3,
			filled: 3,
			exact: 2,
			fieldsExpected: 7,
			fieldsFilled: 6,
			nothing: 1,
			ambiguous: 1,
			held: 0,
		});
		expect(report.measures).toMatchObject({
			exact: 2 / 3,
			coverage: 6 / 7,
			invented: 0,
			heldAmbiguous: 0,
			errors: 0,
		});
		expect(report.leaked).toEqual(["two"]);
		expect(report.verdict?.pass).toBe(false);
		expect(report.costPerCallUsd).toBe(0.0001);
	});

	it("rescores at other gates, the intent's among them, with no call and no verdict", async () => {
		const log = join(dir, "run-1.jsonl");
		const provider = fakeAnswers();
		await runCardEval(input(log, provider));
		const saved = await readCardRun(log);

		const vendorTighter = scoreCardRun(saved, { gates: { vendor: 0.9 } });
		const intentLooser = scoreCardRun(saved, { gates: { intent: 0.5 } });

		expect(provider.calls).toHaveLength(4);
		expect(vendorTighter.retuned).toBe(true);
		expect(vendorTighter.verdict).toBeNull();
		expect(vendorTighter.measures.heldAmbiguous).toBe(1);
		expect(intentLooser.invented).toEqual(["ask"]);
	});

	it("gives the intent and each field their lowest right and highest wrong pick, for fixing their gates", async () => {
		const run = await runCardEval(input(join(dir, "run-1.jsonl")));

		const { intent, fields } = scoreCardRun(run);

		// A nothing row's new_record is the intent's wrong pick; its fields never count.
		expect(intent).toMatchObject({
			gate: 0.8,
			expected: 3,
			filled: 3,
			right: 3,
			wrong: 0,
			lowestRight: 0.9,
			highestWrong: 0.6,
		});
		expect(fields.vendor).toMatchObject({
			expected: 2,
			filled: 1,
			right: 1,
			wrong: 1,
			lowestRight: 0.7,
			highestWrong: 0.85,
		});
		// The weakest item's pick is the field's: meals at 0.9 on "two".
		expect(fields.tags).toMatchObject({
			lowestRight: 0.9,
			highestWrong: null,
		});
	});

	it("lists the misses, filled and wrong first, and blames the parser when no candidate could build the value", async () => {
		const run = await runCardEval({
			...input(join(dir, "run-1.jsonl")),
			set: [
				...rows(),
				...set([
					{
						id: "unreachable",
						request: "acme toner, $18",
						kind: "record",
						expected: {
							spent_on: "2026-09-01",
							total: { value: 18, currency: "USD" },
						},
					},
				]),
			],
		});

		const { misses } = scoreCardRun(run);

		expect(
			misses.map(({ id, field, got, blame }) => [id, field, got, blame]),
		).toEqual([
			["two", "vendor", "northwind", "provider"],
			["unsure", "vendor", null, "provider"],
			["unreachable", "spent_on", null, "parser"],
		]);
	});

	it("blames the parser for an amount whose currency no candidate reads", async () => {
		const run = await runCardEval({
			...input(join(dir, "run-1.jsonl")),
			set: set([
				{
					id: "euros",
					request: "acme toner, $18",
					kind: "record",
					expected: { total: { value: 18, currency: "EUR" } },
				},
			]),
		});

		const { misses } = scoreCardRun(run);

		expect(
			misses.map(({ id, field, got, blame }) => [id, field, got, blame]),
		).toEqual([["euros", "total", { value: 18, currency: "USD" }, "parser"]]);
	});

	it("logs a command that held a row, holds it at every gate, and reads no intent pick on it for the gate", async () => {
		const request = "delete the Acme expense, $18";
		const provider = fakeProvider(
			(asked) =>
				asked === request
					? {
							intent: answer(intentLabels, "new_record", 0.99),
							vendor: answer(vendorLabels, "acme", 0.99),
							tags_meals: answer(yesLabels, "not_mentioned", 0.9),
							tags_travel: answer(yesLabels, "not_mentioned", 0.9),
							total: answer(amountLabels, "a0", 0.99),
						}
					: (answersByRequest[asked] as FakeAnswers),
			{ costUsd: 0.0001 },
		);
		const run = await runCardEval({
			...input(join(dir, "run-1.jsonl"), provider),
			set: set([
				...rows().filter(({ id }) => id === "full"),
				{ id: "delete", request, kind: "nothing" },
			]),
			card: {
				...expenseCard(),
				commands: { verbs: ["delete"], references: ["the expense"] },
			},
		});

		expect(run.rows[1]?.command).toEqual({
			verb: "delete",
			reference: "the Acme expense",
		});
		expect(
			(await readCardRun(join(dir, "run-1.jsonl"))).rows[1]?.command,
		).toEqual(run.rows[1]?.command);
		const { measures, intent } = scoreCardRun(run, {
			gates: { intent: 0.5 },
		});
		expect(measures.invented).toBe(0);
		expect(intent).toMatchObject({ wrong: 0, highestWrong: null });
	});

	it("blames the command for a record the code held, a false hold", async () => {
		const run = await runCardEval({
			...input(join(dir, "run-1.jsonl")),
			set: set(rows().filter(({ id }) => id === "full")),
			card: {
				...expenseCard(),
				commands: { verbs: ["lunch"], references: ["with Northwind"] },
			},
		});

		const { misses, intent } = scoreCardRun(run);

		expect(misses).toEqual([
			expect.objectContaining({
				id: "full",
				field: "intent",
				got: null,
				label: "new_record",
				blame: "command",
			}),
		]);
		expect(intent).toMatchObject({ filled: 0, lowestRight: null });
	});

	it("logs the pair that held a field, holds it at every gate, and reads none of its picks for the field's gate", async () => {
		const run = await runCardEval({
			...input(join(dir, "run-1.jsonl")),
			card: { ...expenseCard(), joiners: { or: ["or"], and: [] } },
		});

		expect(run.rows[2]?.pairs).toEqual({
			vendor: { ids: ["northwind", "acme"], text: "Northwind or Acme" },
		});
		expect(run.rows[0]).not.toHaveProperty("pairs");
		expect(
			(await readCardRun(join(dir, "run-1.jsonl"))).rows[2]?.pairs,
		).toEqual(run.rows[2]?.pairs);
		// Its vendor filled at 0.85 where it must stay held; no gate lets it through now.
		const { leaked, fields } = scoreCardRun(run, { gates: { vendor: 0.5 } });
		expect(leaked).toEqual([]);
		expect(fields.vendor).toMatchObject({ wrong: 0, highestWrong: null });
	});

	it("blames the pair for a record the code held, a false hold", async () => {
		const request = "Northwind lunch for the Acme or Northwind team, $42";
		const run = await runCardEval({
			...input(
				join(dir, "run-1.jsonl"),
				fakeProvider(() => ({
					intent: answer(intentLabels, "new_record", 0.97),
					vendor: answer(vendorLabels, "northwind", 0.95),
					...mealsOnly(),
					total: answer(amountLabels, "a0", 0.99),
				})),
			),
			set: set([
				{
					id: "false-hold",
					request,
					kind: "record",
					expected: {
						vendor: "northwind",
						tags: ["meals"],
						total: { value: 42, currency: "USD" },
					},
				},
			]),
			card: { ...expenseCard(), joiners: { or: ["or"], and: [] } },
		});

		const { misses, fields } = scoreCardRun(run);

		expect(misses).toEqual([
			expect.objectContaining({
				id: "false-hold",
				field: "vendor",
				got: null,
				blame: "pair",
			}),
		]);
		expect(fields.vendor).toMatchObject({ filled: 0, lowestRight: null });
	});

	it("logs what an item implies, fills the gap at any gate as ask does, and blames the item for a wrong fill (ADR 0012)", async () => {
		const caterer: Candidate<Vendor> = {
			...(vendors[0] as Candidate<Vendor>),
			implies: { tags: ["meals"] },
		};
		const card = expenseCard();
		const gap = (vendorP: number) => ({
			intent: answer(intentLabels, "new_record", 0.95),
			vendor: answer(vendorLabels, "acme", vendorP),
			tags_meals: answer(yesLabels, "not_mentioned", 0.9),
			tags_travel: answer(yesLabels, "not_mentioned", 0.9),
			total: answer(amountLabels, "a0", 0.95),
		});
		const run = await runCardEval({
			...input(
				join(dir, "run-1.jsonl"),
				fakeProvider((request) => gap(request.includes("taxi") ? 0.85 : 0.9)),
			),
			set: set([
				{
					id: "order",
					request: "acme order, $18",
					kind: "record",
					expected: {
						vendor: "acme",
						tags: ["meals"],
						total: { value: 18, currency: "USD" },
					},
				},
				{
					id: "taxi",
					request: "acme taxi, $30",
					kind: "record",
					expected: {
						vendor: "acme",
						tags: ["travel"],
						total: { value: 30, currency: "USD" },
					},
				},
			]),
			card: {
				...card,
				fields: {
					...card.fields,
					vendor: {
						...card.fields.vendor,
						shortlist: () => [caterer, vendors[1] as Candidate<Vendor>],
					},
				},
			},
		});

		expect(run.rows[0]?.fields.vendor?.candidates[0]).toEqual({
			id: "acme",
			description: "Acme Office Supply",
			implies: { tags: ["meals"] },
		});
		const saved = await readCardRun(join(dir, "run-1.jsonl"));
		const { fields, misses } = scoreCardRun(saved);
		expect(fields.tags).toMatchObject({
			expected: 2,
			filled: 2,
			right: 1,
			wrong: 1,
		});
		expect(misses).toEqual([
			expect.objectContaining({
				id: "taxi",
				field: "tags",
				got: ["meals"],
				blame: "implied",
			}),
		]);
		// Above the taxi's vendor pick, its vendor holds, and so do its tags.
		const tighter = scoreCardRun(saved, { gates: { vendor: 0.88 } });
		expect(tighter.fields.tags).toMatchObject({
			filled: 1,
			right: 1,
			wrong: 0,
		});
	});

	it("names a card held by its intent as the intent's miss alone", async () => {
		const run = await runCardEval(input(join(dir, "run-1.jsonl")));

		const { misses } = scoreCardRun(run, { gates: { intent: 0.95 } });

		expect(misses.filter(({ id }) => id === "unsure")).toEqual([
			{
				id: "unsure",
				request: "acme toner, $18",
				kind: "record",
				field: "intent",
				expected: "new_record",
				got: null,
				probability: 0.9,
				label: "new_record",
				blame: "provider",
			},
		]);
	});
});

/** A saved run by hand: one record row whose vendor pick is `p`. */
function savedRun(p: number): CardRun {
	return {
		startedAt: "2026-09-23T00:00:00.000Z",
		gates: { intent: 0.8, vendor: 0.8 },
		killLines,
		rows: [
			{
				id: "r1",
				request: "northwind lunch",
				kind: "record",
				expected: { vendor: "northwind" },
				fields: {
					vendor: {
						kind: "catalog",
						candidates: [
							{ id: "acme", description: "Acme" },
							{ id: "northwind", description: "Northwind" },
						],
					},
				},
				answers: {
					intent: answer(intentLabels, "new_record", 0.95),
					vendor: answer(vendorLabels, "northwind", p),
				},
				latencyMs: 300,
				called: true,
			},
		],
	};
}

describe("compareCardRuns", () => {
	it("lists the fields whose value changed across a gate between two runs", () => {
		expect(compareCardRuns(savedRun(0.85), savedRun(0.75))).toEqual([
			{
				id: "r1",
				request: "northwind lunch",
				field: "vendor",
				before: "northwind",
				after: null,
			},
		]);
		expect(compareCardRuns(savedRun(0.85), savedRun(0.9))).toEqual([]);
	});
});

describe("formatCardReport", () => {
	it("puts the verdict first, then the measures, the intent and fields, and the misses", () => {
		const text = formatCardReport(scoreCardRun(savedRun(0.75)));

		expect(text).toContain("## Verdict: FAIL");
		expect(text).toContain("| coverage | at least 0.7 | 0 | FAIL |");
		expect(text).toContain("| intent | 0.8 |");
		expect(text).toContain("| vendor | 0.8 |");
		expect(text).toContain(
			"| r1 | northwind lunch | vendor | northwind | held | northwind 0.75 |",
		);
	});

	it("gives a second run's report no verdict, and lists its flips", () => {
		const flips = compareCardRuns(savedRun(0.85), savedRun(0.75));

		const text = formatCardReport(scoreCardRun(savedRun(0.75)), flips);

		expect(text).not.toContain("## Verdict");
		expect(text).toContain("1 flip against the first run");
	});
});
