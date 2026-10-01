import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Candidate } from "@justask/core";
import {
	compareRuns,
	type EvalRow,
	formatReport,
	type KillLines,
	parseEvalSet,
	type Run,
	type RunRow,
	readRun,
	runEval,
	scoreRun,
} from "@justask/core/eval";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	type FakeAnswers,
	failingProvider,
	fakeProvider,
	hangingProvider,
} from "./fake-provider.ts";

const set = (lines: object[]) =>
	parseEvalSet(lines.map((line) => JSON.stringify(line)).join("\n"));

const killLines: KillLines = {
	exact: 0.9,
	coverage: 0.7,
	invented: 0,
	heldAmbiguous: 0.75,
	p95Ms: 800,
	errors: 0,
};

describe("parseEvalSet", () => {
	it("reads one row per line, naming a row without an id by its line", () => {
		const rows = parseEvalSet(
			[
				JSON.stringify({
					id: "s1",
					request: "invoices from Acme",
					kind: "item",
					expected: "acme",
				}),
				"",
				JSON.stringify({ request: "hola", kind: "nothing" }),
				JSON.stringify({
					request: "Acme or Northwind",
					kind: "ambiguous",
					expected: null,
				}),
			].join("\n"),
		);

		expect(rows).toEqual([
			{
				id: "s1",
				request: "invoices from Acme",
				kind: "item",
				expected: "acme",
			},
			{ id: "line-3", request: "hola", kind: "nothing", expected: null },
			{
				id: "line-4",
				request: "Acme or Northwind",
				kind: "ambiguous",
				expected: null,
			},
		]);
	});

	it.each([
		["a line that is not JSON", "{", /line 1: not JSON/],
		["an empty set", "\n\n", /no rows/],
		[
			"a row without a request",
			JSON.stringify({ kind: "nothing" }),
			/"request"/,
		],
		[
			"an unknown kind",
			JSON.stringify({ request: "x", kind: "filterable" }),
			/"kind" must be item, nothing or ambiguous/,
		],
		[
			"an item row without the expected candidate id",
			JSON.stringify({ request: "x", kind: "item" }),
			/an item row expects a candidate id/,
		],
		[
			"a nothing row that expects an item",
			JSON.stringify({ request: "x", kind: "nothing", expected: "acme" }),
			/a nothing row expects no item/,
		],
		[
			"an ambiguous row that expects an item",
			JSON.stringify({ request: "x", kind: "ambiguous", expected: "acme" }),
			/an ambiguous row expects no item/,
		],
		[
			"an unknown key",
			JSON.stringify({ request: "x", kind: "nothing", expect: "acme" }),
			/unknown key "expect"/,
		],
		[
			"two rows with one id",
			[
				JSON.stringify({ id: "a", request: "x", kind: "nothing" }),
				JSON.stringify({ id: "a", request: "y", kind: "nothing" }),
			].join("\n"),
			/line 2: the id "a" is already used on line 1/,
		],
	])("rejects %s", (_, jsonl, error) => {
		expect(() => parseEvalSet(jsonl)).toThrow(error);
	});
});

type Vendor = { name: string };

const catalog: Candidate<Vendor>[] = [
	{ id: "acme", description: "Acme Supplies", value: { name: "Acme" } },
	{ id: "northwind", description: "Northwind", value: { name: "Northwind" } },
];

const search = {
	description: "the vendor the request means",
	gate: 0.5,
	shortlist: (request: string) => (request === "zzz" ? [] : catalog),
};

const answersByRequest: Record<string, FakeAnswers> = {
	"invoices from Acme": {
		search: { acme: 0.9, northwind: 0.08, none: 0.02, several: 0 },
	},
	"catering bills": {
		search: { acme: 0.1, northwind: 0.5, none: 0.4, several: 0 },
	},
	hola: { search: { acme: 0.05, northwind: 0.05, none: 0.9, several: 0 } },
};

describe("runEval", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "justask-eval-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	const rows = () =>
		set([
			{
				id: "acme",
				request: "invoices from Acme",
				kind: "item",
				expected: "acme",
			},
			{
				id: "catering",
				request: "catering bills",
				kind: "item",
				expected: "northwind",
			},
			{ id: "hello", request: "hola", kind: "nothing" },
			{ id: "empty", request: "zzz", kind: "nothing" },
		]);

	function input(log: string, provider = fakeAnswers()) {
		return {
			set: rows(),
			search,
			provider,
			facts: { today: "Today is Tuesday 2026-09-22." },
			timeoutMs: 1_000,
			killLines,
			log,
		};
	}

	function fakeAnswers() {
		return fakeProvider(
			(request) => {
				const answers = answersByRequest[request];
				if (!answers) throw new Error(`no fixture for "${request}"`);
				return answers;
			},
			{ costUsd: 0.0001 },
		);
	}

	it("runs every row through the real pipeline, one call at a time, and writes the raw log as it goes", async () => {
		const log = join(dir, "run-1.jsonl");
		const provider = fakeAnswers();

		const run = await runEval(input(log, provider));

		expect(provider.calls.map(({ request }) => request)).toEqual([
			"invoices from Acme",
			"catering bills",
			"hola",
		]);
		expect(provider.calls[0]?.facts).toEqual({
			today: "Today is Tuesday 2026-09-22.",
		});
		expect(run.gate).toBe(0.5);
		expect(run.killLines).toEqual(killLines);
		expect(run.rows.map(({ id }) => id)).toEqual([
			"acme",
			"catering",
			"hello",
			"empty",
		]);
		expect(run.rows[0]).toMatchObject({
			request: "invoices from Acme",
			kind: "item",
			expected: "acme",
			candidates: [
				{ id: "acme", description: "Acme Supplies" },
				{ id: "northwind", description: "Northwind" },
			],
			probabilities: { acme: 0.9, northwind: 0.08, none: 0.02, several: 0 },
			called: true,
			costUsd: 0.0001,
		});
		expect(run.rows[0]?.latencyMs).toBeGreaterThanOrEqual(0);
		expect(run.rows[3]).toMatchObject({
			candidates: [],
			probabilities: {},
			called: false,
		});
		expect(await readRun(log)).toEqual(run);
		expect((await readFile(log, "utf8")).trim().split("\n")).toHaveLength(5);
	});

	it("records a provider failure or a timeout as the row's error, and carries on", async () => {
		const failed = await runEval(
			input(join(dir, "failed.jsonl"), failingProvider(new Error("down"))),
		);
		const late = await runEval({
			...input(join(dir, "late.jsonl"), hangingProvider()),
			set: rows().slice(0, 1),
			timeoutMs: 20,
		});

		expect(failed.rows.map(({ error }) => error)).toEqual([
			{ kind: "provider", message: "down" },
			{ kind: "provider", message: "down" },
			{ kind: "provider", message: "down" },
			undefined,
		]);
		expect(late.rows[0]?.error).toEqual({
			kind: "timeout",
			message: "The provider did not answer within 20 ms",
			transport: true,
		});
	});

	it("never overwrites a saved run", async () => {
		const log = join(dir, "run-1.jsonl");
		await writeFile(log, "paid for\n");
		const provider = fakeAnswers();

		await expect(runEval(input(log, provider))).rejects.toThrow(/exists/);
		expect(provider.calls).toHaveLength(0);
		expect(await readFile(log, "utf8")).toBe("paid for\n");
	});

	it.each([
		["a rate above 1", { ...killLines, exact: 1.5 }],
		["a negative count", { ...killLines, errors: -1 }],
		["a missing line", { ...killLines, p95Ms: Number.NaN }],
	])("refuses kill lines with %s before any call", async (_, lines) => {
		const provider = fakeAnswers();

		await expect(
			runEval({
				...input(join(dir, "run.jsonl"), provider),
				killLines: lines,
			}),
		).rejects.toThrow(TypeError);
		expect(provider.calls).toHaveLength(0);
	});

	it("logs the pair that held the item and holds it at every gate (ADR 0010)", async () => {
		const log = join(dir, "run-1.jsonl");
		const run = await runEval({
			...input(
				log,
				fakeProvider({
					search: answersByRequest["invoices from Acme"]?.search ?? {},
				}),
			),
			set: set([
				{
					id: "pair",
					request: "Acme or Northwind invoices",
					kind: "ambiguous",
				},
				{
					id: "acme",
					request: "invoices from Acme",
					kind: "item",
					expected: "acme",
				},
			]),
			search: { ...search, joiners: { or: ["or"], and: [] } },
		});

		expect(run.rows[0]?.pair).toEqual({
			ids: ["acme", "northwind"],
			text: "Acme or Northwind",
		});
		expect(run.rows[1]).not.toHaveProperty("pair");
		expect((await readRun(log)).rows[0]?.pair).toEqual(run.rows[0]?.pair);
		// Acme won at 0.9 with none at 0.02: no gate lets it through now.
		expect(scoreRun(run).leaked).toEqual([]);
		expect(scoreRun(run, { gate: 0.99 }).leaked).toEqual([]);
		expect(scoreRun(run).counts.covered).toBe(1);
	});

	it("rescores a saved run at another gate with no provider call", async () => {
		const log = join(dir, "run-1.jsonl");
		const provider = fakeAnswers();
		await runEval(input(log, provider));

		const saved = await readRun(log);
		const atRunGate = scoreRun(saved);
		const stricter = scoreRun(saved, { gate: 0.3 });

		expect(provider.calls).toHaveLength(3);
		expect(atRunGate.counts.covered).toBe(2);
		expect(stricter.counts.covered).toBe(1);
		expect(stricter).toMatchObject({ gate: 0.3, retuned: true });
	});
});

/**
 * A hand-written row of a saved run, answered unless `error` is given: `pick`
 * wins (the expected item by default) and `none` holds its probability.
 * `several` is left out unless given, as in a log saved before ADR 0007.
 */
function row(
	fields: Pick<EvalRow, "id" | "kind"> &
		Partial<Omit<RunRow, "id" | "kind">> & {
			none?: number;
			several?: number;
			pick?: string;
			priced?: boolean;
		},
): RunRow {
	const { none = 0.02, several, pick, priced = true, ...rest } = fields;
	const winner = pick ?? rest.expected ?? "acme";
	const share = 1 - none - (several ?? 0) - 0.01;
	const labels = {
		none,
		...(several !== undefined && { several }),
	};
	const probabilities =
		rest.error || rest.called === false
			? {}
			: winner === "none" || winner === "several"
				? { acme: 0.05, northwind: 0.05, ...labels }
				: {
						acme: winner === "acme" ? share : 0.01,
						northwind: winner === "northwind" ? share : 0.01,
						...labels,
					};
	return {
		request: `request ${fields.id}`,
		expected: null,
		candidates: [
			{ id: "acme", description: "Acme Supplies" },
			{ id: "northwind", description: "Northwind" },
		],
		probabilities,
		latencyMs: 300,
		called: true,
		...(priced && { costUsd: 0.0001 }),
		...rest,
	};
}

function savedRun(rows: RunRow[], gate = 0.5): Run {
	return { startedAt: "2026-09-22T12:00:00.000Z", gate, killLines, rows };
}

describe("scoreRun", () => {
	const run = savedRun([
		row({ id: "ok", kind: "item", expected: "acme", latencyMs: 200 }),
		row({
			id: "wrong",
			kind: "item",
			expected: "northwind",
			pick: "acme",
			none: 0.01,
			latencyMs: 400,
		}),
		row({ id: "held", kind: "item", expected: "acme", none: 0.6 }),
		row({
			id: "not-listed",
			kind: "item",
			expected: "contoso",
			pick: "none",
			none: 0.9,
		}),
		row({ id: "hello", kind: "nothing", pick: "none", none: 0.9 }),
		row({ id: "invented", kind: "nothing", pick: "acme", none: 0.1 }),
		row({ id: "amb", kind: "ambiguous", none: 0.55, latencyMs: 800 }),
		row({ id: "amb-leak", kind: "ambiguous", none: 0.2 }),
		row({
			id: "down",
			kind: "item",
			expected: "acme",
			error: { kind: "provider", message: "down" },
			latencyMs: 5_000,
			priced: false,
		}),
	]);
	const report = scoreRun(run);

	it("counts coverage over answered item rows and exact over the covered ones", () => {
		expect(report.counts).toMatchObject({ items: 4, covered: 2, right: 1 });
		expect(report.measures.coverage).toBe(0.5);
		expect(report.measures.exact).toBe(0.5);
	});

	it("counts an item on a nothing row as invented", () => {
		expect(report.invented).toEqual(["invented"]);
		expect(report.measures.invented).toBe(1);
	});

	it("counts an ambiguous row as right only when its item stays held", () => {
		expect(report.leaked).toEqual(["amb-leak"]);
		expect(report.measures.heldAmbiguous).toBe(0.5);
	});

	it("reports p95 latency over answered rows, errors, and cost per call", () => {
		expect(report.measures.p95Ms).toBe(800);
		expect(report.measures.errors).toBe(1);
		expect(report.costPerCallUsd).toBeCloseTo(0.0001, 10);
	});

	it("puts filled misses first, surest first, and blames the shortlist when the expected item was never a candidate", () => {
		expect(
			report.misses.map(({ id, item, blame }) => [id, item, blame]),
		).toEqual([
			["wrong", "acme", "provider"],
			["invented", "acme", "provider"],
			["amb-leak", "acme", "provider"],
			["held", null, "provider"],
			["not-listed", null, "shortlist"],
		]);
	});

	it("checks every kill line declared before the run", () => {
		expect(report.verdict?.pass).toBe(false);
		expect(
			report.verdict?.lines.map(({ measure, actual, pass }) => [
				measure,
				actual,
				pass,
			]),
		).toEqual([
			["exact", 0.5, false],
			["coverage", 0.5, false],
			["invented", 1, false],
			["heldAmbiguous", 0.5, false],
			["p95Ms", 800, true],
			["errors", 1, false],
		]);
	});

	it("passes when every line holds", () => {
		const passing = scoreRun(
			savedRun([
				row({ id: "ok", kind: "item", expected: "acme" }),
				row({ id: "hello", kind: "nothing", pick: "none", none: 0.9 }),
				row({ id: "amb", kind: "ambiguous", none: 0.7 }),
			]),
		);

		expect(passing.verdict?.pass).toBe(true);
	});

	it("fails a line the set cannot measure, rather than passing it", () => {
		const noAmbiguous = scoreRun(
			savedRun([row({ id: "ok", kind: "item", expected: "acme" })]),
		);

		expect(noAmbiguous.measures.heldAmbiguous).toBeNull();
		expect(noAmbiguous.verdict?.lines[3]).toMatchObject({
			measure: "heldAmbiguous",
			actual: null,
			pass: false,
		});
	});

	it("reports cost per call as unknown when the provider did not say", () => {
		const unpriced = scoreRun(
			savedRun([
				row({ id: "ok", kind: "item", expected: "acme", priced: false }),
			]),
		);

		expect(unpriced.costPerCallUsd).toBeNull();
	});

	it("counts the cost of a paid call whose answer broke the contract", () => {
		const breached = scoreRun(
			savedRun([
				row({ id: "ok", kind: "item", expected: "acme", costUsd: 0.0001 }),
				row({
					id: "breach",
					kind: "item",
					expected: "acme",
					error: { kind: "provider", message: "left out a label" },
					costUsd: 0.0003,
				}),
				row({
					id: "late",
					kind: "item",
					expected: "acme",
					error: { kind: "timeout", message: "late" },
					priced: false,
				}),
			]),
		);

		expect(breached.costPerCallUsd).toBeCloseTo(0.0002, 10);
	});

	it("gives no verdict at a retuned gate, since the gate was chosen after seeing the run", () => {
		const retuned = scoreRun(run, { gate: 0.015 });

		expect(retuned.retuned).toBe(true);
		expect(retuned.verdict).toBeNull();
		expect(retuned.counts.covered).toBe(1);
	});

	it("refuses a gate that is not strictly between 0 and 1", () => {
		expect(() => scoreRun(run, { gate: 0 })).toThrow(TypeError);
		expect(() => scoreRun(run, { gate: 1 })).toThrow(TypeError);
		expect(() => scoreRun(run, { gate: 1.2 })).toThrow(TypeError);
		expect(() => scoreRun(run, { gate: Number.NaN })).toThrow(TypeError);
	});

	it("formats the report as Markdown, verdict first", () => {
		const text = formatReport(report);

		expect(text).toContain("Verdict: FAIL");
		expect(text).toContain("| coverage | at least 0.7 | 0.5 | FAIL |");
		expect(text).toContain("| p95Ms | at most 800 | 800 | pass |");
	});
});

describe("compareRuns", () => {
	const first = savedRun([
		row({ id: "same", kind: "item", expected: "acme" }),
		row({ id: "crossed", kind: "item", expected: "acme", none: 0.45 }),
		row({ id: "changed", kind: "item", expected: "acme" }),
		row({ id: "held-both", kind: "nothing", pick: "none", none: 0.9 }),
	]);

	it("lists only rows whose item crossed the gate or changed while filled", () => {
		const second = savedRun([
			row({ id: "same", kind: "item", expected: "acme", none: 0.1 }),
			row({ id: "crossed", kind: "item", expected: "acme", none: 0.55 }),
			row({ id: "changed", kind: "item", expected: "acme", pick: "northwind" }),
			row({ id: "held-both", kind: "nothing", pick: "none", none: 0.7 }),
		]);

		expect(compareRuns(first, second)).toEqual([
			{
				id: "crossed",
				request: "request crossed",
				before: { item: "acme", none: 0.45, several: null, filled: true },
				after: { item: null, none: 0.55, several: null, filled: false },
			},
			{
				id: "changed",
				request: "request changed",
				before: { item: "acme", none: 0.02, several: null, filled: true },
				after: { item: "northwind", none: 0.02, several: null, filled: true },
			},
		]);
	});

	it("is empty when both runs agree", () => {
		expect(compareRuns(first, first)).toEqual([]);
	});

	it("lists the flips in the formatted report", () => {
		const second = savedRun([
			row({ id: "crossed", kind: "item", expected: "acme", none: 0.55 }),
		]);

		const text = formatReport(scoreRun(second), compareRuns(first, second));

		expect(text).toContain("1 flip against the first run");
		expect(text).toContain(
			"| crossed | request crossed | acme, none 0.45 | held, none 0.55 |",
		);
	});

	it("gives a second run no verdict of its own, since the first run keeps it", () => {
		const second = savedRun([
			row({ id: "crossed", kind: "item", expected: "acme", none: 0.55 }),
		]);

		const text = formatReport(scoreRun(second), compareRuns(first, second));

		expect(text).not.toContain("Verdict:");
		expect(text).not.toContain("| FAIL |");
		expect(text).toContain("no verdict: the first run keeps it");
	});
});

describe("scoreRun and compareRuns with a named pair (ADR 0010)", () => {
	const pair = {
		ids: ["acme", "northwind"] as [string, string],
		text: "Acme or Northwind",
	};
	const run = savedRun([
		row({ id: "amb-pair", kind: "ambiguous", pair }),
		row({ id: "false-hold", kind: "item", expected: "acme", pair }),
	]);
	const report = scoreRun(run);

	it("holds a row the pair held, whatever its pick, and blames the pair for an item it held", () => {
		expect(report.leaked).toEqual([]);
		expect(report.measures.heldAmbiguous).toBe(1);
		expect(report.counts).toMatchObject({ items: 1, covered: 0 });
		expect(report.misses).toEqual([
			expect.objectContaining({ id: "false-hold", item: null, blame: "pair" }),
		]);
	});

	it("lists no flip on a row the pair held in both runs", () => {
		expect(
			compareRuns(
				run,
				savedRun([row({ id: "amb-pair", kind: "ambiguous", pair, none: 0.6 })]),
			),
		).toEqual([]);
	});
});

describe("scoreRun and compareRuns with several (ADR 0007)", () => {
	const run = savedRun(
		[
			row({ id: "amb-several", kind: "ambiguous", none: 0.05, several: 0.4 }),
			row({ id: "amb-leak", kind: "ambiguous", none: 0.05, several: 0.1 }),
			row({
				id: "held-several",
				kind: "item",
				expected: "acme",
				none: 0.05,
				several: 0.35,
			}),
			row({ id: "picked", kind: "nothing", pick: "several", several: 0.8 }),
		],
		0.3,
	);
	const report = scoreRun(run);

	it("holds a row whose several reaches the gate, as it holds one whose none does", () => {
		expect(report.leaked).toEqual(["amb-leak"]);
		expect(report.measures.heldAmbiguous).toBe(0.5);
		expect(report.counts).toMatchObject({ items: 1, covered: 0 });
		expect(report.invented).toEqual([]);
	});

	it("reports several beside none on every miss", () => {
		expect(
			report.misses.map(({ id, none, several }) => [id, none, several]),
		).toEqual([
			["amb-leak", 0.05, 0.1],
			["held-several", 0.05, 0.35],
		]);
		expect(formatReport(report)).toContain(
			"| held-several | request held-several | acme | held | 0.05 | 0.35 | provider |",
		);
	});

	it("lists a row that several flips across the gate", () => {
		const second = savedRun(
			[row({ id: "amb-leak", kind: "ambiguous", none: 0.05, several: 0.5 })],
			0.3,
		);

		const flips = compareRuns(run, second);

		expect(flips).toEqual([
			{
				id: "amb-leak",
				request: "request amb-leak",
				before: { item: "acme", none: 0.05, several: 0.1, filled: true },
				after: { item: null, none: 0.05, several: 0.5, filled: false },
			},
		]);
		expect(formatReport(scoreRun(second), flips)).toContain(
			"| amb-leak | request amb-leak | acme, none 0.05, several 0.10 | held, none 0.05, several 0.50 |",
		);
	});
});
