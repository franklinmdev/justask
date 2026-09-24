import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Provider, ProviderUnavailableError } from "justask";
import {
	formatCardReport,
	formatReport,
	type KillLines,
	mergeRemeasure,
	parseCardEvalSet,
	parseEvalSet,
	parseFilterEvalSet,
	type Run,
	type RunRow,
	readCardRun,
	readRun,
	remeasureSet,
	runCardEval,
	runEval,
	runFilterEval,
	scoreCardRun,
	scoreRun,
} from "justask/eval";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeProvider } from "./fake-provider.ts";

const killLines: KillLines = {
	exact: 0.9,
	coverage: 0.7,
	invented: 0,
	heldAmbiguous: 0.75,
	p95Ms: 800,
	errors: 0,
};

const nothingAnswer = {
	search: { acme: 0.05, none: 0.95, several: 0 },
	vendor: { acme: 0.03, not_mentioned: 0.95, not_available: 0.02 },
	intent: { new_record: 0.03, not_mentioned: 0.95, not_available: 0.02 },
};

/**
 * Per request: `busy` is unavailable on every call, `busy once` on its first
 * one only, `late` never answers,
 * `broken` answers against the contract, `down` throws a plain error, and
 * any other request is answered as a nothing row.
 */
function troubled(): Provider {
	const fake = fakeProvider(nothingAnswer);
	const seen = new Set<string>();
	return {
		answer(input) {
			const first = !seen.has(input.request);
			seen.add(input.request);
			switch (input.request) {
				case "busy once":
					return first
						? Promise.reject(new ProviderUnavailableError("529 busy"))
						: fake.answer(input);
				case "busy":
					return Promise.reject(new ProviderUnavailableError("529 busy"));
				case "late":
					return new Promise(() => {});
				case "broken":
					return Promise.resolve({ answers: {} });
				case "down":
					return Promise.reject(new Error("a bug in the adapter"));
				default:
					return fake.answer(input);
			}
		},
	};
}

const rows = (...requests: string[]) =>
	requests
		.map((request) => JSON.stringify({ id: request, request, kind: "nothing" }))
		.join("\n");

const acme = [{ id: "acme", description: "Acme Supplies", value: "acme" }];
const vendor = {
	kind: "catalog" as const,
	description: "the vendor",
	gate: 0.8,
	shortlist: () => acme,
};
const facts = { today: "Today is Tuesday 2026-09-22." };

describe("a run's errors", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "justask-transport-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	it("are logged as transport failures when the provider is unavailable or late, and not when an answer breaks the contract or an adapter throws otherwise, in every flow", async () => {
		const set = rows("busy", "late", "broken", "down", "busy once", "hello");
		const common = {
			facts,
			timeoutMs: 30,
			killLines,
		};
		const search = await runEval({
			...common,
			set: parseEvalSet(set),
			search: { description: "the vendor", gate: 0.5, shortlist: () => acme },
			log: join(dir, "search.jsonl"),
			provider: troubled(),
		});
		const filter = await runFilterEval({
			...common,
			set: parseFilterEvalSet(set),
			filter: { description: "invoices", fields: { vendor } },
			provider: troubled(),
			log: join(dir, "filter.jsonl"),
		});
		const card = await runCardEval({
			...common,
			set: parseCardEvalSet(set),
			card: { description: "expense", gate: 0.5, fields: { vendor } },
			provider: troubled(),
			log: join(dir, "card.jsonl"),
		});

		for (const run of [search, filter, card]) {
			expect(run.rows.map(({ error }) => error)).toEqual([
				{ kind: "provider", message: "529 busy", transport: true },
				{
					kind: "timeout",
					message: "The provider did not answer within 30 ms",
					transport: true,
				},
				{ kind: "provider", message: expect.any(String) },
				{ kind: "provider", message: "a bug in the adapter" },
				undefined,
				undefined,
			]);
			// The run notes where ask called once more (ADR 0013), to measure it.
			expect(run.rows.map(({ retried }) => retried)).toEqual([
				true,
				undefined,
				undefined,
				undefined,
				true,
				undefined,
			]);
		}
		expect(scoreRun(search).retried).toBe(2);
		expect(formatReport(scoreRun(search))).toContain(
			"errors: 4 (2 transport) · retried 2 ·",
		);
		expect(await readRun(join(dir, "search.jsonl"))).toEqual(search);
	});

	// #93: round 7's FAIL is not rescored under the new rule.
	it("in a log saved before the rule score as they did: card round 7 run 1 stays a FAIL on errors", async () => {
		const run = await readCardRun(
			new URL("../demo/eval/runs/card-en-round7-1.jsonl", import.meta.url)
				.pathname,
		);
		const report = scoreCardRun(run);
		const errors = report.verdict?.lines.find(
			({ measure }) => measure === "errors",
		);

		expect(errors).toEqual({
			measure: "errors",
			line: 0,
			atLeast: false,
			actual: 1,
			pass: false,
		});
		expect(report.verdict).toMatchObject({
			pass: false,
			errorsPending: false,
		});
		expect(formatCardReport(report)).toContain("## Verdict: FAIL");
	});
});

type ErrorRow = { transport?: true; kind?: "provider" | "timeout" };

/**
 * A saved run of an item row filled right, an ambiguous row held, a
 * nothing row held, and a nothing row per error given, every row at
 * `rowMs`, its probes at `probeMs`.
 */
function runWith(
	errors: ErrorRow[],
	{
		lines = killLines,
		probeMs = 250,
		rowMs = 300,
		pick = "none",
	}: {
		lines?: KillLines;
		probeMs?: number;
		rowMs?: number;
		pick?: string;
	} = {},
): Run {
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
		killLines: lines,
		rows: [
			answered({ id: "acme", kind: "item", expected: "acme" }, "acme"),
			answered({ id: "two", kind: "ambiguous", expected: null }, "none"),
			answered({ id: "hello", kind: "nothing", expected: null }, pick),
			...errors.map(
				({ transport, kind = "provider" }, i): RunRow => ({
					id: `error${i}`,
					request: `error${i}`,
					kind: "nothing",
					expected: null,
					candidates: [{ id: "acme", description: "Acme Supplies" }],
					probabilities: {},
					latencyMs: rowMs,
					called: true,
					error: { kind, message: "failed", ...(transport && { transport }) },
				}),
			),
		],
		probes: {
			baselineMs: 250,
			before: [{ latencyMs: probeMs }],
			after: [{ latencyMs: probeMs }],
		},
	};
}

const errorsLine = (run: Run) =>
	scoreRun(run).verdict?.lines.find(({ measure }) => measure === "errors");

describe("the errors line (#93)", () => {
	it("is pending when only transport failures put it over, and every other line passes", () => {
		const run = runWith([
			{ transport: true },
			{ transport: true, kind: "timeout" },
		]);
		const report = scoreRun(run);

		expect(report.verdict).toMatchObject({
			pass: false,
			latencyPending: false,
			errorsPending: true,
		});
		expect(errorsLine(run)).toEqual({
			measure: "errors",
			line: 0,
			atLeast: false,
			actual: 2,
			transport: 2,
			pass: false,
			pending: true,
		});
		expect(formatReport(report)).toContain("## Verdict: ERRORS PENDING");
		expect(formatReport(report)).toMatch(
			/\| errors \| at most 0 \| 2 \(2 transport\) \| pending \|/,
		);
		expect(formatReport(report)).toContain("errors: 2 (2 transport)");
	});

	it("is pending when the rows other than transport failures stay within the line", () => {
		const run = runWith([{}, { transport: true }], {
			lines: { ...killLines, errors: 1 },
		});

		expect(errorsLine(run)).toMatchObject({ pending: true, transport: 1 });
		expect(scoreRun(run).verdict?.errorsPending).toBe(true);
	});

	it("fails when the errors that are not transport failures are over the line on their own", () => {
		const run = runWith([{}, { transport: true }]);
		const report = scoreRun(run);

		expect(errorsLine(run)).toEqual({
			measure: "errors",
			line: 0,
			atLeast: false,
			actual: 2,
			transport: 1,
			pass: false,
		});
		expect(report.verdict?.errorsPending).toBe(false);
		expect(formatReport(report)).toContain("## Verdict: FAIL");
	});

	it("fails the run whatever its transport failures when another quality line fails", () => {
		const report = scoreRun(runWith([{ transport: true }], { pick: "acme" }));

		expect(report.verdict).toMatchObject({
			pass: false,
			errorsPending: false,
		});
		expect(formatReport(report)).toContain("## Verdict: FAIL");
	});

	it("passes when the transport failures stay within the line", () => {
		const report = scoreRun(
			runWith([{ transport: true }], { lines: { ...killLines, errors: 1 } }),
		);

		expect(report.verdict).toMatchObject({ pass: true, errorsPending: false });
	});

	it("waits beside a pending latency line in a slow window", () => {
		const report = scoreRun(
			runWith([{ transport: true }], { probeMs: 900, rowMs: 900 }),
		);

		expect(report.verdict).toMatchObject({
			pass: false,
			latencyPending: true,
			errorsPending: true,
		});
		expect(formatReport(report)).toContain(
			"## Verdict: LATENCY AND ERRORS PENDING",
		);
	});
});

describe("a remeasure (#93)", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "justask-remeasure-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true });
	});

	const probe = {
		input: {
			request: "the probe",
			facts,
			questions: [
				{
					id: "search",
					instruction: "Which vendor?",
					labels: [
						{ label: "acme", description: "Acme" },
						{ label: "none", description: "None" },
						{ label: "several", description: "Several" },
					],
				},
			],
		},
		warmUp: 0,
		times: 1,
		baselineMs: 250,
	};

	it("sends only the rows that failed on transport, then scores the first run with their answers in place", async () => {
		const first = runWith([{}, { transport: true }, { transport: true }], {
			lines: { ...killLines, errors: 1 },
		});
		const set = parseEvalSet(
			rows("acme", "two", "hello", "error0", "error1", "error2"),
		);
		const again = await runEval({
			set: remeasureSet(first, set),
			search: { description: "the vendor", gate: 0.5, shortlist: () => acme },
			provider: fakeProvider(nothingAnswer),
			facts,
			timeoutMs: 1_000,
			killLines: first.killLines,
			log: join(dir, "again.jsonl"),
			probe,
		});
		const merged = mergeRemeasure(first, again);

		expect(again.rows.map(({ id }) => id)).toEqual(["error1", "error2"]);
		expect(merged.rows.map(({ id }) => id)).toEqual(
			first.rows.map(({ id }) => id),
		);
		expect(merged.rows[4]).toBe(again.rows[0]);
		expect(merged.rows[3]).toBe(first.rows[3]);
		expect(merged.probes).toBe(first.probes);
		expect(scoreRun(merged).verdict).toMatchObject({
			pass: true,
			errorsPending: false,
		});
	});

	it("leaves the line pending when a row fails on transport again", () => {
		const first = runWith([{ transport: true }]);
		const again = { ...first, rows: [first.rows[3] as RunRow] };

		expect(scoreRun(mergeRemeasure(first, again)).verdict?.errorsPending).toBe(
			true,
		);
	});

	it("has nothing to send when no row failed on transport", () => {
		expect(() =>
			remeasureSet(runWith([{}]), parseEvalSet(rows("error0"))),
		).toThrow(/no row failed on transport/);
	});

	it("decides nothing in a slow window, nor with no probes, nor on rows other than the first run's transport failures", () => {
		const first = runWith([{ transport: true }]);
		const { error: _, ...answeredRow } = first.rows[3] as RunRow;
		const slow = { ...runWith([], { probeMs: 900 }), rows: [answeredRow] };
		const { probes: __, ...unprobed } = { ...first, rows: [answeredRow] };
		const wrongRows = { ...first, rows: [first.rows[0] as RunRow] };

		expect(() => mergeRemeasure(first, slow)).toThrow(/slow window/);
		expect(() => mergeRemeasure(first, unprobed)).toThrow(/probes/);
		expect(() => mergeRemeasure(first, wrongRows)).toThrow(
			/the rows that failed on transport/,
		);
		expect(() =>
			mergeRemeasure(runWith([{}]), { ...first, rows: [] as RunRow[] }),
		).toThrow(/no row failed on transport/);
	});
});
