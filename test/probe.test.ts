import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	formatCardReport,
	formatFilterReport,
	formatReport,
	type KillLines,
	type Probe,
	type Probes,
	parseCardEvalSet,
	parseEvalSet,
	parseFilterEvalSet,
	probeMedian,
	type Run,
	type RunRow,
	readCardRun,
	readFilterRun,
	readProbes,
	readRun,
	runCardEval,
	runEval,
	runFilterEval,
	scoreCardRun,
	scoreFilterRun,
	scoreRun,
} from "justask/eval";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	type FakeAnswers,
	failingProvider,
	fakeProvider,
	hangingProvider,
} from "./fake-provider.ts";

const killLines: KillLines = {
	exact: 0.9,
	coverage: 0.7,
	invented: 0,
	heldAmbiguous: 0.75,
	p95Ms: 800,
	errors: 0,
};

const probe: Probe = {
	input: {
		request: "the catering invoices",
		facts: { today: "Today is Tuesday 2026-09-22." },
		questions: [
			{
				id: "probe",
				instruction: "Which vendor does the request mean?",
				labels: [
					{ label: "acme", description: "Acme Supplies, paper" },
					{ label: "northwind", description: "Northwind, catering" },
				],
			},
		],
	},
	times: 3,
	baselineMs: 250,
};

const probeAnswer: FakeAnswers = { probe: { acme: 0.1, northwind: 0.9 } };

/** Answers the probe, and every row of the three flows below as a nothing row. */
const provider = () =>
	fakeProvider((request) =>
		request === probe.input.request
			? probeAnswer
			: {
					search: { acme: 0.05, none: 0.95, several: 0 },
					vendor: { acme: 0.03, not_mentioned: 0.95, not_available: 0.02 },
					intent: {
						new_record: 0.03,
						not_mentioned: 0.95,
						not_available: 0.02,
					},
				},
	);

const acme = [{ id: "acme", description: "Acme Supplies", value: "acme" }];
const facts = { today: "Today is Tuesday 2026-09-22." };
const nothing = JSON.stringify({
	id: "hello",
	request: "hola",
	kind: "nothing",
});

describe("a run's probes", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "justask-probe-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	it("sends the fixed probe straight to the provider before the rows and again after, and logs each latency", async () => {
		const log = join(dir, "run-1.jsonl");
		const fake = provider();

		const run = await runEval({
			set: parseEvalSet(nothing),
			search: { description: "the vendor", gate: 0.5, shortlist: () => acme },
			provider: fake,
			facts,
			timeoutMs: 1_000,
			killLines,
			log,
			probe,
		});

		expect(fake.calls.map(({ request }) => request)).toEqual([
			...Array(3).fill("the catering invoices"),
			"hola",
			...Array(3).fill("the catering invoices"),
		]);
		expect(fake.calls[0]).toMatchObject(probe.input);
		expect(run.probes?.baselineMs).toBe(250);
		expect(run.probes?.before).toHaveLength(3);
		expect(run.probes?.after).toHaveLength(3);
		for (const result of [
			...(run.probes?.before ?? []),
			...(run.probes?.after ?? []),
		]) {
			expect(result.latencyMs).toBeGreaterThanOrEqual(0);
			expect(result.error).toBeUndefined();
		}
		expect(await readRun(log)).toEqual(run);
		expect(await readProbes(log)).toEqual(run.probes);
		// The header, the row, and the probes after the rows on a line of their own.
		expect((await readFile(log, "utf8")).trim().split("\n")).toHaveLength(3);
	});

	it("records a probe that fails or times out, and still runs the rows", async () => {
		const failed = await runEval({
			set: parseEvalSet(nothing),
			search: { description: "the vendor", gate: 0.5, shortlist: () => [] },
			provider: failingProvider(new Error("down")),
			facts,
			timeoutMs: 1_000,
			killLines,
			log: join(dir, "failed.jsonl"),
			probe: { ...probe, times: 1 },
		});
		const late = await runEval({
			set: parseEvalSet(nothing),
			search: { description: "the vendor", gate: 0.5, shortlist: () => [] },
			provider: hangingProvider(),
			facts,
			timeoutMs: 20,
			killLines,
			log: join(dir, "late.jsonl"),
			probe: { ...probe, times: 1 },
		});

		expect(failed.probes?.before[0]?.error).toBe("provider");
		expect(late.probes?.after?.[0]?.error).toBe("timeout");
		expect(late.probes?.after?.[0]?.latencyMs).toBeGreaterThanOrEqual(19);
		expect(failed.rows).toHaveLength(1);
	});

	it("reads no probes from a run saved before them", async () => {
		const log = join(dir, "old.jsonl");
		await runEval({
			set: parseEvalSet(nothing),
			search: { description: "the vendor", gate: 0.5, shortlist: () => [] },
			provider: provider(),
			facts,
			timeoutMs: 1_000,
			killLines,
			log,
		});

		expect(await readProbes(log)).toBeNull();
		expect((await readRun(log)).probes).toBeUndefined();
	});

	it("probes a filter run and a card run the same way", async () => {
		const filterLog = join(dir, "filter-1.jsonl");
		const cardLog = join(dir, "card-1.jsonl");
		const vendor = {
			kind: "catalog" as const,
			description: "the vendor",
			gate: 0.8,
			shortlist: () => acme,
		};
		const filterFake = provider();
		const cardFake = provider();

		const filterRun = await runFilterEval({
			set: parseFilterEvalSet(nothing),
			filter: { description: "invoices", fields: { vendor } },
			provider: filterFake,
			facts,
			timeoutMs: 1_000,
			killLines,
			log: filterLog,
			probe: { ...probe, times: 2 },
		});
		const cardRun = await runCardEval({
			set: parseCardEvalSet(nothing),
			card: { description: "expense", gate: 0.5, fields: { vendor } },
			provider: cardFake,
			facts,
			timeoutMs: 1_000,
			killLines,
			log: cardLog,
			probe: { ...probe, times: 2 },
		});

		for (const fake of [filterFake, cardFake]) {
			expect(fake.calls.map(({ request }) => request)).toEqual([
				"the catering invoices",
				"the catering invoices",
				"hola",
				"the catering invoices",
				"the catering invoices",
			]);
		}
		expect(filterRun.probes?.after).toHaveLength(2);
		expect(cardRun.probes?.after).toHaveLength(2);
		expect(await readFilterRun(filterLog)).toEqual(filterRun);
		expect(await readCardRun(cardLog)).toEqual(cardRun);
		expect(scoreFilterRun(filterRun).window).toMatchObject({ baselineMs: 250 });
		expect(scoreCardRun(cardRun).window).toMatchObject({ baselineMs: 250 });
		expect(formatFilterReport(scoreFilterRun(filterRun))).toMatch(
			/- Probes: median [\d.]+ ms against a baseline of 250 ms · normal/,
		);
		expect(formatCardReport(scoreCardRun(cardRun))).toMatch(
			/- Probes: median [\d.]+ ms against a baseline of 250 ms · normal/,
		);
	});

	it("refuses a probe sent fewer than once, or a negative baseline, before any call", async () => {
		const fake = provider();
		const run = (bad: Probe) =>
			runEval({
				set: parseEvalSet(nothing),
				search: { description: "the vendor", gate: 0.5, shortlist: () => acme },
				provider: fake,
				facts,
				timeoutMs: 1_000,
				killLines,
				log: join(dir, "run.jsonl"),
				probe: bad,
			});

		await expect(run({ ...probe, times: 0 })).rejects.toThrow(TypeError);
		await expect(run({ ...probe, baselineMs: -1 })).rejects.toThrow(TypeError);
		expect(fake.calls).toHaveLength(0);
	});
});

/**
 * A saved run of an item row filled right, an ambiguous row held, and a
 * nothing row that picks `pick`, each at `rowMs`, whose probes answered in
 * `probesMs`.
 */
function probedRun(
	probesMs: number[],
	{
		baselineMs = 250 as number | null,
		rowMs = 900,
		pick = "none",
	}: { baselineMs?: number | null; rowMs?: number; pick?: string } = {},
): Run {
	const half = Math.ceil(probesMs.length / 2);
	const results = probesMs.map((latencyMs) => ({ latencyMs }));
	const answered = (
		row: Pick<RunRow, "id" | "kind" | "expected">,
		label: string,
	): RunRow => ({
		...row,
		request: row.id,
		candidates: [{ id: "acme", description: "Acme Supplies" }],
		probabilities: {
			acme: label === "acme" ? 0.95 : 0.05,
			none: label === "none" ? 0.95 : 0.05,
			several: 0,
		},
		latencyMs: rowMs,
		called: true,
	});
	return {
		startedAt: "2026-09-22T12:00:00.000Z",
		gate: 0.5,
		killLines,
		rows: [
			answered({ id: "acme", kind: "item", expected: "acme" }, "acme"),
			answered({ id: "two", kind: "ambiguous", expected: null }, "none"),
			answered({ id: "hello", kind: "nothing", expected: null }, pick),
		],
		probes: {
			baselineMs,
			before: results.slice(0, half),
			after: results.slice(half),
		},
	};
}

describe("a slow window", () => {
	it("is a run whose probes' median is more than twice the baseline", () => {
		expect(scoreRun(probedRun([400, 500, 600, 700])).window).toEqual({
			medianMs: 550,
			baselineMs: 250,
			slow: true,
		});
		expect(scoreRun(probedRun([400, 500, 500, 700])).window).toEqual({
			medianMs: 500,
			baselineMs: 250,
			slow: false,
		});
	});

	it("leaves the latency line pending while the quality lines still decide", () => {
		const slow = scoreRun(probedRun([700, 800, 900]));
		const slowAndInvented = scoreRun(
			probedRun([700, 800, 900], { pick: "acme" }),
		);
		const normal = scoreRun(probedRun([200, 250, 300]));

		expect(slow.verdict).toMatchObject({ pass: false, slowWindow: true });
		expect(
			slow.verdict?.lines.find(({ measure }) => measure === "p95Ms"),
		).toMatchObject({
			pass: false,
			pending: true,
		});
		expect(slow.verdict?.lines.filter(({ pending }) => pending)).toHaveLength(
			1,
		);
		expect(formatReport(slow)).toContain("## Verdict: LATENCY PENDING");
		expect(formatReport(slow)).toMatch(
			/\| p95Ms \| at most 800 \| 900 \| pending/,
		);

		expect(formatReport(slowAndInvented)).toContain("## Verdict: FAIL");
		expect(normal.verdict).toMatchObject({ pass: false, slowWindow: false });
		expect(formatReport(normal)).toContain("## Verdict: FAIL");
	});

	it("is not judged with no baseline, nor on a run saved before probes", () => {
		const unjudged = scoreRun(probedRun([700, 800, 900], { baselineMs: null }));
		const { probes: _, ...old } = probedRun([700, 800, 900]);

		expect(unjudged.window).toEqual({
			medianMs: 800,
			baselineMs: null,
			slow: false,
		});
		expect(unjudged.verdict?.slowWindow).toBe(false);
		expect(scoreRun(old).window).toBeNull();
		expect(scoreRun(old).verdict?.slowWindow).toBe(false);
	});

	it("reads a timed out probe at its wait, and leaves a failed one out", () => {
		const run = probedRun([200]);
		run.probes = {
			baselineMs: 250,
			before: [{ latencyMs: 200 }, { latencyMs: 2_000, error: "timeout" }],
			after: [
				{ latencyMs: 3, error: "provider" },
				{ latencyMs: 2_000, error: "timeout" },
			],
		};

		expect(scoreRun(run).window?.medianMs).toBe(2_000);
	});

	it("prints the window in the measures", () => {
		const run = probedRun([700, 800, 900]);
		const line =
			"- Probes: median 800 ms against a baseline of 250 ms · slow window";

		expect(formatReport(scoreRun(run))).toContain(line);
		expect(
			formatReport(scoreRun(probedRun([200, 250], { baselineMs: null }))),
		).toContain("- Probes: median 225 ms · no baseline yet");
	});
});

describe("probeMedian", () => {
	it("is the median over every probe of the runs given, a baseline to write before the next verdict run", () => {
		const runs: Probes[] = [
			{
				baselineMs: null,
				before: [{ latencyMs: 200 }],
				after: [{ latencyMs: 260 }],
			},
			{
				baselineMs: null,
				before: [{ latencyMs: 240 }, { latencyMs: 5, error: "provider" }],
			},
		];

		expect(probeMedian(runs)).toBe(240);
		expect(probeMedian([])).toBeNull();
	});
});
