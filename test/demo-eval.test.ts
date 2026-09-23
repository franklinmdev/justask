import { readFileSync } from "node:fs";
import { type EvalRow, parseEvalSet } from "justask/eval";
import { describe, expect, it } from "vitest";
import { demoSearch } from "../demo/server/handler.ts";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";

const read = (name: string) =>
	parseEvalSet(
		readFileSync(new URL(`../demo/eval/${name}`, import.meta.url), "utf8"),
	);

const normalized = (request: string) => request.trim().toLowerCase();

describe.each([english, spanish])("the search sets in $language", (content) => {
	const evalSet = read(`search-${content.language}.jsonl`);
	const devSet = read(`search-${content.language}.dev.jsonl`);
	const catalog = new Set(content.vendors.map(({ id }) => id));
	const count = (set: EvalRow[], kind: EvalRow["kind"]) =>
		set.filter((row) => row.kind === kind).length;

	it("expect only vendors of that language's catalog", () => {
		for (const row of [...evalSet, ...devSet]) {
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

	it("are run against the search the demo serves, on that catalog", async () => {
		for (const { request } of evalSet) {
			const shortlist = await demoSearch(content).shortlist(request);
			for (const { id } of shortlist) expect(catalog).toContain(id);
		}
	});
});
