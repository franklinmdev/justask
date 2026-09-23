import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { ask } from "justask";
import { type EvalRow, parseEvalSet, readRun, scoreRun } from "justask/eval";
import { describe, expect, it } from "vitest";
import { KILL_LINES } from "../demo/eval/kill-lines.ts";
import { demoSearch, FACTS } from "../demo/server/handler.ts";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
import { failingProvider } from "./fake-provider.ts";

const evalFile = (name: string) =>
	new URL(`../demo/eval/${name}`, import.meta.url);
const read = (name: string) =>
	parseEvalSet(readFileSync(evalFile(name), "utf8"));

const normalized = (request: string) => request.trim().toLowerCase();

describe.each([english, spanish])("the search sets in $language", (content) => {
	const evalSet = read(`search-${content.language}.jsonl`);
	const devSet = read(`search-${content.language}.dev.jsonl`);
	const round2 = read(`search-${content.language}.round2.jsonl`);
	const round3 = read(`search-${content.language}.round3.jsonl`);
	const round4 = read(`search-${content.language}.round4.jsonl`);
	const catalog = new Set(content.vendors.map(({ id }) => id));
	const count = (set: EvalRow[], kind: EvalRow["kind"]) =>
		set.filter((row) => row.kind === kind).length;

	it("expect only vendors of that language's catalog", () => {
		for (const row of [
			...evalSet,
			...devSet,
			...round2,
			...round3,
			...round4,
		]) {
			if (row.expected !== null) expect(catalog).toContain(row.expected);
		}
	});

	it("give the eval set every kind, and every vendor twice", () => {
		expect(count(evalSet, "item")).toBe(28);
		expect(count(evalSet, "nothing")).toBe(6);
		expect(count(evalSet, "ambiguous")).toBe(6);
		for (const id of catalog) {
			expect(evalSet.filter((row) => row.expected === id)).toHaveLength(2);
		}
	});

	it("give the dev set every kind", () => {
		expect(count(devSet, "item")).toBe(8);
		expect(count(devSet, "nothing")).toBe(2);
		expect(count(devSet, "ambiguous")).toBe(2);
	});

	it("never repeat an eval request in the dev set or the demo's suggestions", () => {
		const seen = new Set(
			[
				...devSet.map(({ request }) => request),
				...Object.values(content.suggestions).flat(),
			].map(normalized),
		);
		for (const { request } of evalSet) {
			expect(seen).not.toContain(normalized(request));
		}
		expect(
			new Set(evalSet.map(({ request }) => normalized(request))).size,
		).toBe(evalSet.length);
	});

	it("give the round 2 eval set every kind", () => {
		expect(count(round2, "item")).toBe(28);
		expect(count(round2, "nothing")).toBe(6);
		expect(count(round2, "ambiguous")).toBe(6);
	});

	it("never repeat a round 1 request in round 2, nor a suggestion but the one approved", () => {
		const seen = new Set(
			[
				...evalSet.map(({ request }) => request),
				...devSet.map(({ request }) => request),
				...Object.values(content.suggestions).flat(),
			].map(normalized),
		);
		const repeated = round2.filter(({ request }) =>
			seen.has(normalized(request)),
		);
		// es-r2-35 is one of the Spanish suggestions; approved as is, and logged
		// in docs/search-eval.md.
		expect(repeated.map(({ id }) => id)).toEqual(
			content.language === "es" ? ["es-r2-35"] : [],
		);
		expect(new Set(round2.map(({ request }) => normalized(request))).size).toBe(
			round2.length,
		);
	});

	it("give the round 3 eval set every kind", () => {
		expect(count(round3, "item")).toBe(28);
		expect(count(round3, "nothing")).toBe(6);
		expect(count(round3, "ambiguous")).toBe(6);
	});

	it("never repeat an earlier request or a suggestion in round 3", () => {
		const seen = new Set(
			[
				...evalSet.map(({ request }) => request),
				...devSet.map(({ request }) => request),
				...round2.map(({ request }) => request),
				...Object.values(content.suggestions).flat(),
			].map(normalized),
		);
		for (const { request } of round3) {
			expect(seen).not.toContain(normalized(request));
		}
		expect(new Set(round3.map(({ request }) => normalized(request))).size).toBe(
			round3.length,
		);
	});

	it("give the round 4 eval set every kind, and every vendor twice", () => {
		expect(count(round4, "item")).toBe(28);
		expect(count(round4, "nothing")).toBe(6);
		expect(count(round4, "ambiguous")).toBe(6);
		for (const id of catalog) {
			expect(round4.filter((row) => row.expected === id)).toHaveLength(2);
		}
	});

	it("never repeat a request of any set in demo/eval/ or any of the demo's suggestions in round 4", () => {
		const seen = new Set(
			[
				...readdirSync(evalFile("."))
					.filter(
						(name) => name.endsWith(".jsonl") && !name.includes("search-"),
					)
					.flatMap((name) =>
						readFileSync(evalFile(name), "utf8")
							.split("\n")
							.filter((line) => line.trim())
							.map((line) => JSON.parse(line).request as string),
					),
				...[evalSet, devSet, round2, round3]
					.flat()
					.map(({ request }) => request),
				...[english, spanish].flatMap((language) =>
					[
						language.suggestions,
						language.filterSuggestions,
						language.cardSuggestions,
					].flatMap((groups) => Object.values(groups).flat()),
				),
			].map(normalized),
		);
		for (const { request } of round4) {
			expect(seen).not.toContain(normalized(request));
		}
		expect(new Set(round4.map(({ request }) => normalized(request))).size).toBe(
			round4.length,
		);
	});

	it("hold a named pair in round 4 only on its two pair rows, and on no item (ADR 0011)", async () => {
		// The code finds the pair before any answer, so a failing provider still reports it.
		const held: string[] = [];
		for (const { id, request } of round4) {
			const { search } = await ask({
				request,
				facts: FACTS,
				provider: failingProvider(new Error("no call")),
				timeoutMs: 1_000,
				search: demoSearch(content),
			});
			if (search.pair) held.push(id);
		}
		expect(held).toEqual([
			`${content.language}-r4-35`,
			`${content.language}-r4-36`,
		]);
	});

	it("are run against the search the demo serves, on that catalog", async () => {
		for (const { request } of [...evalSet, ...round2, ...round3, ...round4]) {
			const shortlist = await demoSearch(content).shortlist(request);
			for (const { id } of shortlist) expect(catalog).toContain(id);
		}
	});
});

/**
 * Frozen on the owner's approval, 2026-09-22 (#13), before any scored run of
 * each round. A
 * failure here means a verdict's inputs changed after the fact: revert the
 * edit, or log the owner's call in docs/search-eval.md with a new checksum or value.
 */
describe("the frozen search eval", () => {
	it.each([
		[
			"search-en.jsonl",
			"28808a234da4d9fc80a0633e082d0fa5255f70a86e94c61d4c9ed8190f643da0",
		],
		[
			"search-es.jsonl",
			"ca6a654c7eec78bb3bfa9bf1176850a828a80e7ea73741f62ebb401e96fc8815",
		],
		[
			"search-en.round2.jsonl",
			"fbe870431300a3759e9f13dc5731c3214fb80d7b014a423429a067adaba0dbbe",
		],
		[
			"search-es.round2.jsonl",
			"b09cbcdaafba5c5a5ffe32c3f24976b28ec1d56c7fe04ea820cb92a8dae0722f",
		],
		[
			"search-en.round3.jsonl",
			"3d137e989a9d7fe52b09a452a7f26fcf206d9ac73a0ec561a8dc11af91ef4c23",
		],
		[
			"search-es.round3.jsonl",
			"8cf43ad146b70d4ba66d2e46763d50a5bf848859eeea7e5b4f3f8bc605293e8c",
		],
		// Round 4 (#68), approved in four batches on 2026-09-23, before any call.
		[
			"search-en.round4.jsonl",
			"4bd9cd9496140914992d15179518c4308992ee7cd7608c288c22ddb16c6d0337",
		],
		[
			"search-es.round4.jsonl",
			"a073535a4e15a56b109bdaf93b722daf0688a61cad0b2df40f83611304ec7d5f",
		],
	])("keeps %s as approved", (name, sha256) => {
		const bytes = readFileSync(evalFile(name));
		expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
	});

	// By value, so a formatter pass over the file never reads as a change.
	it("keeps the kill lines as approved", () => {
		expect(KILL_LINES).toEqual({
			exact: 0.9,
			coverage: 0.8,
			invented: 0,
			heldAmbiguous: 0.75,
			p95Ms: 800,
			errors: 0,
		});
	});
});

/**
 * The recorded rounds were run before the search asked for several (ADR 0007).
 * Their logs have no several, so they must rescore exactly as
 * docs/search-eval.md records them.
 */
describe("the recorded search rounds", () => {
	it.each([
		["search-en-1.jsonl", 28, 28, 5, true],
		["search-es-1.jsonl", 28, 27, 4, false],
		["search-en-round2-1.jsonl", 28, 26, 5, true],
		["search-es-round2-1.jsonl", 28, 24, 4, false],
	])("rescore %s as recorded", async (log, items, covered, held, pass) => {
		const report = scoreRun(await readRun(evalFile(`runs/${log}`).pathname));

		expect(report.counts).toMatchObject({ items, covered, right: covered });
		expect(report.counts.held).toBe(held);
		expect(report.measures.invented).toBe(0);
		expect(report.verdict?.pass).toBe(pass);
	});
});
