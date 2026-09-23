import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { ask, builtInParser } from "justask";
import {
	type FilterEvalKind,
	type FilterEvalRow,
	parseFilterEvalSet,
	readFilterRun,
	scoreFilterRun,
} from "justask/eval";
import { describe, expect, it } from "vitest";
import { fixGate, poolFields } from "../demo/eval/gates.ts";
import { FILTER_KILL_LINES } from "../demo/eval/kill-lines.ts";
import { demoFilter, FACTS, FILTER_GATES } from "../demo/server/handler.ts";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
import type { FieldName } from "../demo/src/content/types.ts";
import { failingProvider } from "./fake-provider.ts";

const evalFile = (name: string) =>
	new URL(`../demo/eval/${name}`, import.meta.url);
const read = (name: string) => readFileSync(evalFile(name), "utf8");

const normalized = (request: string) => request.trim().toLowerCase();

/** The day the eval runs are fixed at, as demo/eval/filter.ts writes it. */
const TODAY = "2026-09-22";

const FIELDS: FieldName[] = ["vendor", "status", "date", "amount"];

/** A field's value as the set balances it: a status, an amount's role, or held. */
function shape(row: FilterEvalRow, field: FieldName): string | undefined {
	const value = row.expected[field];
	if (value === undefined || value === "held") return value;
	if (field === "status") return value as string;
	if (field !== "amount") return "value";
	const { min, max, exact } = value as Record<string, unknown>;
	if (exact !== undefined) return "exact";
	if (min !== undefined && max !== undefined) return "range";
	return min !== undefined ? "min" : "max";
}

describe.each([english, spanish])("the filter sets in $language", (content) => {
	const evalSet = parseFilterEvalSet(read(`filter-${content.language}.jsonl`));
	const devSet = parseFilterEvalSet(
		read(`filter-${content.language}.dev.jsonl`),
	);
	const round2 = parseFilterEvalSet(
		read(`filter-${content.language}.round2.jsonl`),
	);
	const filter = demoFilter(content);
	const rows = (set: FilterEvalRow[], kind: FilterEvalKind) =>
		set.filter((row) => row.kind === kind);
	const tally = (set: FilterEvalRow[], field: FieldName) => {
		const counts: Record<string, number> = {};
		for (const row of set) {
			const key = shape(row, field);
			if (key !== undefined) counts[key] = (counts[key] ?? 0) + 1;
		}
		return counts;
	};

	it("expect only fields of the demo's filter, and values of that language's catalogs", () => {
		const vendors = new Set(content.vendors.map(({ id }) => id));
		const statuses = new Set(content.statuses.map(({ id }) => id));
		for (const row of [...evalSet, ...devSet, ...round2]) {
			for (const [field, value] of Object.entries(row.expected)) {
				expect(Object.keys(filter.fields)).toContain(field);
				if (value === "held") continue;
				if (field === "vendor") expect(vendors).toContain(value);
				if (field === "status") expect(statuses).toContain(value);
			}
		}
	});

	it.each([
		["eval", evalSet],
		["round 2", round2],
	])("split the %s set's rows evenly across fields and values", (_, set) => {
		const filterable = rows(set, "filterable");
		const ambiguous = rows(set, "ambiguous");
		expect(filterable).toHaveLength(28);
		expect(ambiguous).toHaveLength(8);
		expect(rows(set, "nothing")).toHaveLength(6);
		for (const field of FIELDS) {
			expect(filterable.filter((row) => field in row.expected)).toHaveLength(
				14,
			);
			expect(tally(ambiguous, field).held).toBe(2);
		}
		expect(
			filterable
				.map((row) => row.expected.vendor)
				.filter(Boolean)
				.sort(),
		).toEqual(content.vendors.map(({ id }) => id).sort());
		expect(tally(filterable, "status")).toEqual({
			paid: 5,
			open: 5,
			overdue: 4,
		});
		expect(tally(filterable, "amount")).toEqual({
			min: 4,
			max: 4,
			exact: 3,
			range: 3,
		});
	});

	it("split the dev set's rows evenly across fields and values", () => {
		const filterable = rows(devSet, "filterable");
		const ambiguous = rows(devSet, "ambiguous");
		expect(filterable).toHaveLength(12);
		expect(ambiguous).toHaveLength(4);
		expect(rows(devSet, "nothing")).toHaveLength(4);
		for (const field of FIELDS) {
			expect(filterable.filter((row) => field in row.expected)).toHaveLength(6);
			expect(tally(ambiguous, field).held).toBe(1);
		}
		expect(tally(filterable, "status")).toEqual({
			paid: 2,
			open: 2,
			overdue: 2,
		});
		expect(tally(filterable, "amount")).toEqual({
			min: 2,
			max: 2,
			exact: 1,
			range: 1,
		});
		const vendors = filterable
			.map((row) => row.expected.vendor)
			.filter(Boolean);
		expect(new Set(vendors).size).toBe(vendors.length);
	});

	it("never repeat a request of any other set in demo/eval, of each other, or a suggestion", () => {
		const others = readdirSync(evalFile("."))
			.filter((name) => name.endsWith(".jsonl") && !name.startsWith("filter-"))
			.flatMap((name) =>
				read(name)
					.split("\n")
					.filter((line) => line.trim())
					.map((line) => JSON.parse(line).request as string),
			);
		const seen = new Set(
			[
				...others,
				...Object.values(content.suggestions).flat(),
				...Object.values(content.filterSuggestions).flat(),
				...Object.values(content.cardSuggestions).flat(),
			].map(normalized),
		);
		const repeated: string[] = [];
		for (const { id, request } of [...devSet, ...evalSet, ...round2]) {
			if (seen.has(normalized(request))) repeated.push(id);
			seen.add(normalized(request));
		}
		// es-r2-n42, "perfecto, gracias", is also card round 5's es-r5-40: both
		// sets were frozen seconds apart from parallel sessions (#68, #73), and
		// the owner approved it as is, logged in docs/filter-eval.md.
		expect(repeated).toEqual(content.language === "es" ? ["es-r2-n42"] : []);
	});

	it("hold a named pair in round 2 only on the vendor of its two pair rows (ADR 0011)", async () => {
		// The code finds the pair before any answer, so a failing provider still reports it.
		const held: string[] = [];
		for (const { id, request } of round2) {
			const { filter: result } = await ask({
				request,
				facts: { ...FACTS, today: TODAY },
				provider: failingProvider(new Error("no call")),
				timeoutMs: 1_000,
				filter,
			});
			for (const [name, field] of Object.entries(result.fields)) {
				if ("pair" in field && field.pair) held.push(`${id} ${name}`);
			}
		}
		expect(held).toEqual([
			`${content.language}-r2-a29 vendor`,
			`${content.language}-r2-a30 vendor`,
		]);
	});

	it("expect only dates and amounts the parser can build, on the day the runs are fixed at", () => {
		for (const row of [...devSet, ...evalSet, ...round2]) {
			const { dates: read = [], amounts = [] } = builtInParser(row.request, {
				today: TODAY,
				facts: FACTS,
				reads: "past",
			});
			// A pick on an ambiguous reading holds the field whatever its probability.
			const dates = read.filter((d) => !d.ambiguous);
			const { date, amount } = row.expected;
			if (date && date !== "held" && typeof date === "object") {
				const { from, to } = date as { from?: string; to?: string };
				if (from)
					expect(
						dates.map((d) => d.from),
						row.id,
					).toContain(from);
				if (to)
					expect(
						dates.map((d) => d.to),
						row.id,
					).toContain(to);
			}
			if (amount && amount !== "held" && typeof amount === "object") {
				const { currency, ...bounds } = amount as Record<string, unknown>;
				for (const bound of Object.values(bounds)) {
					expect(
						amounts.map((a) => a.value),
						row.id,
					).toContain(bound);
				}
				const currencies = new Set(
					amounts.map((a) => a.currency).filter(Boolean),
				);
				expect([...currencies], row.id).toEqual(currency ? [currency] : []);
			}
		}
	});
});

/**
 * Frozen on the owner's approval, 2026-09-22 (#17), before any scored run. A
 * failure here means the verdict's inputs changed after the fact: revert the
 * edit, or log the owner's call in docs/filter-eval.md with a new checksum or
 * value.
 */
describe("the frozen filter eval", () => {
	it.each([
		[
			"filter-en.jsonl",
			"6625316611529dae92779980abe676c881907815e7635cafcb61f455064ec02b",
		],
		[
			"filter-es.jsonl",
			"f108351bbbcf5a28d4ef6d8a8aa72d28c65c76a3be6067017b60e073d414479f",
		],
		// Round 2 (#68), approved in five batches on 2026-09-23, before any call.
		[
			"filter-en.round2.jsonl",
			"a6d950e5db531edeadb6d964e7f9f6da9b01cebfe3474d9ad4f37070ba8fcada",
		],
		[
			"filter-es.round2.jsonl",
			"37de9852985225b7af0bba01f82721de1f31055c10b4720481092fb27f016063",
		],
	])("keeps %s as approved", (name, sha256) => {
		const bytes = readFileSync(evalFile(name));
		expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
	});

	// By value, so a formatter pass over the file never reads as a change.
	it("keeps the kill lines as approved", () => {
		expect(FILTER_KILL_LINES).toEqual({
			exact: 0.9,
			coverage: 0.7,
			invented: 0,
			heldAmbiguous: 0.75,
			p95Ms: 800,
			errors: 0,
		});
	});
});

/**
 * The demo serves the gates the rule gives on dev run 1 of both languages,
 * read from the committed logs with no call (docs/filter-eval.md).
 */
describe("the filter's gates", () => {
	it("are the approved rule applied to dev run 1", async () => {
		const reports = await Promise.all(
			["en", "es"].map(async (language) =>
				scoreFilterRun(
					await readFilterRun(
						evalFile(`runs/filter-${language}-dev-1.jsonl`).pathname,
					),
				),
			),
		);
		const fixed = Object.fromEntries(
			Object.entries(poolFields(reports)).map(([name, picks]) => [
				name,
				fixGate(picks),
			]),
		);

		expect(fixed).toEqual(FILTER_GATES);
	});
});
