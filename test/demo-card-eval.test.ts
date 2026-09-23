import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { builtInParser } from "justask";
import {
	type CardEvalKind,
	type CardEvalRow,
	parseCardEvalSet,
	readCardRun,
	scoreCardRun,
} from "justask/eval";
import { describe, expect, it } from "vitest";
import { fixGate, poolFields } from "../demo/eval/gates.ts";
import { CARD_KILL_LINES } from "../demo/eval/kill-lines.ts";
import { CARD_GATES, demoCard, FACTS } from "../demo/server/handler.ts";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
import type { ExpenseName } from "../demo/src/content/types.ts";

const evalFile = (name: string) =>
	new URL(`../demo/eval/${name}`, import.meta.url);
const read = (name: string) => readFileSync(evalFile(name), "utf8");

const normalized = (request: string) => request.trim().toLowerCase();

/** The day the eval runs are fixed at, as demo/eval/card.ts writes it. */
const TODAY = "2026-09-23";

const FIELDS: ExpenseName[] = ["vendor", "tags", "spent_on", "total"];

describe.each([english, spanish])("the card sets in $language", (content) => {
	const evalSet = parseCardEvalSet(read(`card-${content.language}.jsonl`));
	const devSet = parseCardEvalSet(read(`card-${content.language}.dev.jsonl`));
	const round2Set = parseCardEvalSet(
		read(`card-${content.language}.round2.jsonl`),
	);
	const round3Set = parseCardEvalSet(
		read(`card-${content.language}.round3.jsonl`),
	);
	const round4Set = parseCardEvalSet(
		read(`card-${content.language}.round4.jsonl`),
	);
	const diagSet = parseCardEvalSet(read(`card-${content.language}.diag.jsonl`));
	const pairSet = parseCardEvalSet(read(`card-${content.language}.pair.jsonl`));
	const allSets = [
		...devSet,
		...evalSet,
		...round2Set,
		...round3Set,
		...round4Set,
		...diagSet,
		...pairSet,
	];
	const card = demoCard(content);
	const rows = (set: CardEvalRow[], kind: CardEvalKind) =>
		set.filter((row) => row.kind === kind);
	const mentioning = (set: CardEvalRow[], field: ExpenseName) =>
		set.filter((row) => field in row.expected);
	const heldOn = (set: CardEvalRow[], field: ExpenseName) =>
		set.filter((row) => row.expected[field] === "held");

	it("expect only fields of the demo's card, and values of that language's catalogs", () => {
		const vendors = new Set(content.vendors.map(({ id }) => id));
		const tags = new Set(content.tags.map(({ id }) => id));
		for (const row of allSets) {
			for (const [field, value] of Object.entries(row.expected)) {
				expect(Object.keys(card.fields)).toContain(field);
				if (value === "held") continue;
				if (field === "vendor") expect(vendors).toContain(value);
				if (field === "tags") {
					for (const tag of value as string[]) expect(tags).toContain(tag);
				}
			}
		}
	});

	it.each([
		["round 1", evalSet],
		["round 2", round2Set],
		["round 3", round3Set],
		["round 4", round4Set],
	])(
		"give the %s set 28 records, 2 ambiguous rows per field and 6 with nothing to record",
		(_, set) => {
			const records = rows(set, "record");
			const ambiguous = rows(set, "ambiguous");
			expect(records).toHaveLength(28);
			expect(ambiguous).toHaveLength(8);
			expect(rows(set, "nothing")).toHaveLength(6);
			for (const field of FIELDS)
				expect(heldOn(ambiguous, field)).toHaveLength(2);
			// Every vendor at least once, and seven records with no vendor of the catalog.
			expect(new Set(records.map((row) => row.expected.vendor))).toEqual(
				new Set([...content.vendors.map(({ id }) => id), undefined]),
			);
			expect(mentioning(records, "vendor")).toHaveLength(21);
			expect(mentioning(records, "tags")).toHaveLength(28);
			expect(mentioning(records, "spent_on")).toHaveLength(24);
			expect(mentioning(records, "total")).toHaveLength(27);
		},
	);

	it("give the dev set 12 records, 1 ambiguous row per field and 12 with nothing to record", () => {
		const records = rows(devSet, "record");
		const ambiguous = rows(devSet, "ambiguous");
		expect(records).toHaveLength(12);
		expect(ambiguous).toHaveLength(4);
		expect(rows(devSet, "nothing")).toHaveLength(12);
		for (const field of FIELDS)
			expect(heldOn(ambiguous, field)).toHaveLength(1);
	});

	it("never repeat a request of any other set in demo/eval, of each other, or a suggestion", () => {
		const others = readdirSync(evalFile("."))
			.filter((name) => name.endsWith(".jsonl") && !name.startsWith("card-"))
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
		for (const { request } of allSets) {
			expect(seen).not.toContain(normalized(request));
			seen.add(normalized(request));
		}
	});

	it("expect only days and amounts the parser can build, on the day the runs are fixed at", () => {
		for (const row of allSets) {
			const { dates = [], amounts = [] } = builtInParser(row.request, {
				today: TODAY,
				facts: FACTS,
				reads: "past",
			});
			const { spent_on, total } = row.expected;
			if (typeof spent_on === "string" && spent_on !== "held") {
				// A pick on an ambiguous reading holds the field whatever its probability.
				expect(
					dates
						.filter((d) => !d.ambiguous && d.from === d.to)
						.map((d) => d.from),
					row.id,
				).toContain(spent_on);
			}
			if (total && total !== "held") {
				const { value, currency } = total as {
					value: number;
					currency?: string;
				};
				expect(
					amounts
						.filter((a) => a.unresolved === undefined)
						.map((a) => [a.value, a.currency ?? undefined]),
					row.id,
				).toContainEqual([value, currency]);
			}
		}
	});

	it("hold each ambiguous day and amount by the parser's own reading, or by two candidates", () => {
		for (const row of rows(allSets, "ambiguous")) {
			const { dates = [], amounts = [] } = builtInParser(row.request, {
				today: TODAY,
				facts: FACTS,
				reads: "past",
			});
			if (row.expected.spent_on === "held") {
				const days = dates.filter((d) => !d.ambiguous && d.from === d.to);
				expect(days, row.id).toEqual([]);
			}
			if (row.expected.total === "held") {
				const resolved = amounts.filter((a) => a.unresolved === undefined);
				expect(resolved.length === 0 || resolved.length > 1, row.id).toBe(true);
			}
		}
	});
});

/**
 * Frozen on the owner's approval, 2026-09-23 (#20, round 2 #44, round 3 #57, round 4 #63), before any call. A
 * failure here means the verdict's inputs changed after the fact: revert the
 * edit, or log the owner's call in docs/card-eval.md with a new checksum or
 * value.
 */
describe("the frozen card eval", () => {
	it.each([
		[
			"card-en.jsonl",
			"5657469070a8a22871b884782a50639e6b6b095950eea7335d52e6ea238bdab9",
		],
		[
			"card-es.jsonl",
			"abefd6adac98f967b41c28f696865df9b220b0ce7ffb74465505ccbb03de976b",
		],
		// Round 2, approved in two batches on 2026-09-23 (#44), before any call.
		[
			"card-en.round2.jsonl",
			"aab38a439966cc961998f2746928d3731155f338a6e28987445a25c29c2c32c9",
		],
		[
			"card-es.round2.jsonl",
			"8a4572903c88e437bce14a1e8210083ae190e117e4a421316074f578d99182f2",
		],
		// Round 3, approved in five batches on 2026-09-23 (#57), before any call.
		[
			"card-en.round3.jsonl",
			"f0c044883020c57261022a89cd0154d9d8ce047cae652e08caec111a62f4b6cd",
		],
		[
			"card-es.round3.jsonl",
			"8e072a3faa4186b4921dcece01af0a32b6b87e69c55317ef14307fe31453bfb9",
		],
		// Round 4, approved in five batches on 2026-09-23 (#63), before any call.
		[
			"card-en.round4.jsonl",
			"6f401a5f6236541b997d4c5a313bfc52e26a588b59dbb528bea4f9ff7ef7e360",
		],
		[
			"card-es.round4.jsonl",
			"236390a28187c5e8ef13c55fbbeb3199e9a393c048e36f48d1a30ed3f7a6edf7",
		],
	])("keeps %s as approved", (name, sha256) => {
		const bytes = readFileSync(evalFile(name));
		expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
	});

	// By value, so a formatter pass over the file never reads as a change.
	it("keeps the kill lines as approved", () => {
		expect(CARD_KILL_LINES).toEqual({
			exact: 0.9,
			coverage: 0.7,
			invented: 0,
			heldAmbiguous: 0.75,
			p95Ms: 1000,
			errors: 0,
		});
	});
});

/**
 * The demo serves the gates the rule gives on dev run 5 of both languages,
 * the first with the named-pair hold (ADR 0010) and the intent label that
 * names setting a value, the intent's among them, read from the committed
 * logs with no call (docs/card-eval.md).
 */
describe("the card's gates", () => {
	it("are the approved rule applied to dev run 5", async () => {
		const reports = await Promise.all(
			["en", "es"].map(async (language) => {
				const { intent, fields } = scoreCardRun(
					await readCardRun(
						evalFile(`runs/card-${language}-dev-5.jsonl`).pathname,
					),
				);
				return { fields: { intent, ...fields } };
			}),
		);
		const fixed = Object.fromEntries(
			Object.entries(poolFields(reports)).map(([name, picks]) => [
				name,
				fixGate(picks),
			]),
		);

		expect(fixed).toEqual(CARD_GATES);
	});
});
