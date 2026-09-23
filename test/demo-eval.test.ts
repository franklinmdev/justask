import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { type EvalRow, parseEvalSet } from "justask/eval";
import { describe, expect, it } from "vitest";
import { KILL_LINES } from "../demo/eval/kill-lines.ts";
import { demoSearch } from "../demo/server/handler.ts";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";

const evalFile = (name: string) =>
	new URL(`../demo/eval/${name}`, import.meta.url);
const read = (name: string) =>
	parseEvalSet(readFileSync(evalFile(name), "utf8"));

const normalized = (request: string) => request.trim().toLowerCase();

describe.each([english, spanish])("the search sets in $language", (content) => {
	const evalSet = read(`search-${content.language}.jsonl`);
	const devSet = read(`search-${content.language}.dev.jsonl`);
	const round2 = read(`search-${content.language}.round2.jsonl`);
	const catalog = new Set(content.vendors.map(({ id }) => id));
	const count = (set: EvalRow[], kind: EvalRow["kind"]) =>
		set.filter((row) => row.kind === kind).length;

	it("expect only vendors of that language's catalog", () => {
		for (const row of [...evalSet, ...devSet, ...round2]) {
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

	it("are run against the search the demo serves, on that catalog", async () => {
		for (const { request } of [...evalSet, ...round2]) {
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
