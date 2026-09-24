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
import {
	CARD_SET_NAMES,
	type CardSet,
	cardSetFile,
	givesVerdict,
	mixesOf,
	shapesOf,
} from "../demo/eval/card-sets.ts";
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
	const sets = Object.fromEntries(
		CARD_SET_NAMES.map((set) => [
			set,
			parseCardEvalSet(read(cardSetFile(content.language, set))),
		]),
	) as Record<CardSet, CardEvalRow[]>;
	const devSet = sets.dev;
	const allSets = Object.values(sets).flat();
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

	it.each(
		CARD_SET_NAMES.filter(givesVerdict).map(
			(set) => [set, mixesOf(set), sets[set]] as const,
		),
	)(
		"give the %s set, %i times rounds 1 to 6's mix: 28 records, 2 ambiguous rows per field and 6 with nothing to record",
		(_, mixes, set) => {
			const records = rows(set, "record");
			const ambiguous = rows(set, "ambiguous");
			expect(records).toHaveLength(28 * mixes);
			expect(ambiguous).toHaveLength(8 * mixes);
			expect(rows(set, "nothing")).toHaveLength(6 * mixes);
			for (const field of FIELDS)
				expect(heldOn(ambiguous, field)).toHaveLength(2 * mixes);
			// Every vendor at least once per mix, and seven records per mix with no vendor of the catalog.
			const named = records.map((row) => row.expected.vendor);
			for (const { id } of content.vendors)
				expect(
					named.filter((vendor) => vendor === id).length,
					id,
				).toBeGreaterThanOrEqual(mixes);
			expect(named.filter((vendor) => vendor === undefined)).toHaveLength(
				7 * mixes,
			);
			expect(mentioning(records, "vendor")).toHaveLength(21 * mixes);
			expect(mentioning(records, "tags")).toHaveLength(28 * mixes);
			expect(mentioning(records, "spent_on")).toHaveLength(24 * mixes);
			expect(mentioning(records, "total")).toHaveLength(27 * mixes);
		},
	);

	it.each(
		CARD_SET_NAMES.flatMap((set) => {
			const shapes = shapesOf(set);
			return shapes ? [[set, shapes, sets[set]] as const] : [];
		}),
	)(
		"name one approved shape on every row of the %s set, as many rows as approved",
		(_, shapes, set) => {
			const counts = new Map<string, number>();
			for (const row of set) {
				const shape = row.shape ?? "";
				expect(shapes, row.id).toHaveProperty([shape]);
				expect(row.kind, row.id).toBe(shapes[shape]?.kind);
				counts.set(shape, (counts.get(shape) ?? 0) + 1);
			}
			for (const [shape, { rows }] of Object.entries(shapes)) {
				expect(counts.get(shape) ?? 0, shape).toBe(rows);
			}
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
		const repeated: string[] = [];
		for (const { id, request } of allSets) {
			if (seen.has(normalized(request))) repeated.push(id);
			seen.add(normalized(request));
		}
		// es-r5-40, "perfecto, gracias", is also filter round 2's es-r2-n42: both
		// sets were frozen seconds apart from parallel sessions (#73, #68), and
		// the owner approved it as is, logged in docs/card-eval.md.
		expect(repeated).toEqual(content.language === "es" ? ["es-r5-40"] : []);
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

describe("the shaped card sets", () => {
	it.each(CARD_SET_NAMES.filter((set) => shapesOf(set)))(
		"give English row N and Spanish row N of the %s set the same shape and kind",
		(set) => {
			const [en, es] = [english, spanish].map((content) =>
				parseCardEvalSet(read(cardSetFile(content.language, set))).map(
					({ kind, shape }) => ({ kind, shape }),
				),
			);
			expect(es).toEqual(en);
		},
	);
});

/**
 * Frozen on the owner's approval, 2026-09-23 (#20, round 2 #44, round 3
 * #57, round 4 #63, round 5 #73, #77's office probes, #79's false-fill probes
 * and round 6; round 7 #88 and round 8 #97 on 2026-09-24), before any call. A failure here
 * means the verdict's inputs changed after the fact: revert the edit, or log
 * the owner's call in docs/card-eval.md with a new checksum or value.
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
		// Round 5, approved in five batches on 2026-09-23 (#73), before any call.
		[
			"card-en.round5.jsonl",
			"fca825759009558e2fa33a783172abb290a4d78d81858dda0061f264e4a2ccd4",
		],
		[
			"card-es.round5.jsonl",
			"66147a3d8de451c56268334ed05bbba6d294fc87882692400d7de6bceca06c6e",
		],
		// Round 6, approved in five batches on 2026-09-23 (#79), before any call.
		[
			"card-en.round6.jsonl",
			"d33a3f60caacc318c6564071f1cb031a839360aa4ecf49e252383e775e1a656e",
		],
		[
			"card-es.round6.jsonl",
			"3b3a92fcbfb0da04e0a238fc29f21dae8a4b8adf3577243b56bb400c999c768f",
		],
		// Round 7, approved in seven batches on 2026-09-24 (#88), before any call.
		[
			"card-en.round7.jsonl",
			"fdd19619169bf8470bc822c0886cba3d15525908eefe72832cc4bc7d25c6c701",
		],
		[
			"card-es.round7.jsonl",
			"912933070a5311d57292bee679392abe05ef5885137f2b1ecf2ae2d9eee9abf6",
		],
		// Round 8, approved in seven batches on 2026-09-24 (#97), before any call.
		[
			"card-en.round8.jsonl",
			"72b1014d4ffd9908a3fd70f630afebdf3627a0228ee7876c66baf5e5beab1f94",
		],
		[
			"card-es.round8.jsonl",
			"2654433d9a98d9ada94dc673d0397da636b8115936ec31b49b5d692f688b4e58",
		],
		// #63's pair probes, approved before any call: the pair rule was chosen from their runs.
		[
			"card-en.pair.jsonl",
			"2f01d4790a71f62eeea7c2b6eef5bebe8bac387acbaf251a88254b6a2d474cab",
		],
		[
			"card-es.pair.jsonl",
			"571ba0f2bdaef184a9d1e927317ac9cb75c3016d00a9db8b5ebb856bea4e1bc6",
		],
		// #77's office probes, approved in two batches on 2026-09-23, before any call.
		[
			"card-en.office.jsonl",
			"eb6a13c97c39cf2460f4c6127d6716b77d24641f96fe8f3018d0cfb73246ffaf",
		],
		[
			"card-es.office.jsonl",
			"154cbfa826a91d1edd4e44b8567aec0b6ba71386d9a2c8dd678682ed020e3d73",
		],
		// #79's false-fill probes, approved in two batches on 2026-09-23, before any call.
		[
			"card-en.notoffice.jsonl",
			"38f2e2fdfd5f6e5d36c8b6c772c46bf7f28fd5ea2fa2a981d591278b38358e0d",
		],
		[
			"card-es.notoffice.jsonl",
			"20b88aa279721a6829b80fa16ff07a59dfc69eae44dda0833d410ebe738fdfe1",
		],
		// #99's copy probes, approved in two batches on 2026-09-24, before any call.
		[
			"card-en.copy.jsonl",
			"c85406d532565e903180a7da48995edf061c05ceb82d6608d106691d340da2c2",
		],
		[
			"card-es.copy.jsonl",
			"77ecfd388a2f5a8875090de8eac5d5600a6c6bd68cd99795447c1a895c79e46d",
		],
		// #99's false-hold probes for the copy verbs, approved on 2026-09-24, before any call.
		[
			"card-en.copyrec.jsonl",
			"c9c33609f87bdbc61144230d5aafe38ef68a3a85ff5eda50e43303acc67d7dab",
		],
		[
			"card-es.copyrec.jsonl",
			"fb865c26339047f4493af7113dd5f1aa800670a22ed1608c4a75167745a99be3",
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
