import type { CardRun, CardRunRow } from "justask/eval";
import { describe, expect, it } from "vitest";
import { CARD_KILL_LINES } from "../demo/eval/kill-lines.ts";
import {
	isOfficeLabel,
	OFFICE_LABEL_NAMES,
	OFFICE_LABELS,
	officePicks,
	servedLabel,
	tagGaps,
	withOfficeLabel,
} from "../demo/eval/office.ts";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";

describe.each([english, spanish])(
	"#77's office labels in $language",
	(content) => {
		it("start from the label the demo serves", () => {
			expect(OFFICE_LABELS[content.language].current).toBe(
				servedLabel(content),
			);
		});

		it.each(OFFICE_LABEL_NAMES)(
			"change the office tag alone, to %s",
			(label) => {
				const changed = withOfficeLabel(content, label);
				expect(servedLabel(changed)).toBe(
					OFFICE_LABELS[content.language][label],
				);
				expect(changed.tags.filter(({ id }) => id !== "office")).toEqual(
					content.tags.filter(({ id }) => id !== "office"),
				);
				expect({ ...changed, tags: [] }).toEqual({ ...content, tags: [] });
			},
		);

		it("are the only labels a run takes", () => {
			expect(Object.keys(OFFICE_LABELS[content.language])).toEqual(
				OFFICE_LABEL_NAMES,
			);
			for (const label of OFFICE_LABEL_NAMES) {
				expect(isOfficeLabel(label)).toBe(true);
			}
			expect(isOfficeLabel("longer")).toBe(false);
			expect(isOfficeLabel(undefined)).toBe(false);
		});
	},
);

describe("the office tag's picks", () => {
	const row = (
		id: string,
		office: Record<string, number> | undefined,
		newRecord = 0.8,
	): CardRunRow => ({
		id,
		request: id,
		kind: "record",
		expected: { tags: ["office"] },
		fields: {},
		answers: {
			intent: { new_record: newRecord, not_mentioned: 1 - newRecord },
			...(office && { tags_office: office }),
		},
		latencyMs: 250,
		called: true,
	});
	const run = (rows: CardRunRow[]): CardRun => ({
		startedAt: "2026-09-23T00:00:00.000Z",
		gates: { intent: 0.45, tags: 0.4 },
		killLines: CARD_KILL_LINES,
		rows,
	});

	it("count the rows where yes wins at the tags gate, and each label that wins instead", () => {
		const picks = officePicks(
			run([
				row("yes", { yes: 0.62, not_mentioned: 0.3, not_available: 0.08 }),
				row("weak yes", { yes: 0.38, not_mentioned: 0.3, not_available: 0.32 }),
				row("not mentioned", {
					yes: 0.1,
					not_mentioned: 0.85,
					not_available: 0.05,
				}),
				row("not available", {
					yes: 0.2,
					not_mentioned: 0.3,
					not_available: 0.5,
				}),
				row("no answer", undefined),
			]),
		);

		expect(picks.asked).toBe(4);
		expect(picks.yes).toBe(1);
		expect(picks.won).toEqual({ yes: 2, not_mentioned: 1, not_available: 1 });
		expect(
			picks.rows.map(({ id, pick, probability }) => [id, pick, probability]),
		).toEqual([
			["yes", "yes", 0.62],
			["weak yes", "yes", 0.38],
			["not mentioned", "not_mentioned", 0.85],
			["not available", "not_available", 0.5],
		]);
	});

	it("refuse a run with no tags gate, rather than count every yes", () => {
		const { tags: _, ...gates } = run([]).gates;
		expect(() => officePicks({ ...run([]), gates })).toThrow(/tags gate/);
	});

	it("read the tag's own question, whatever the intent did", () => {
		const picks = officePicks(
			run([row("held card", { yes: 0.7, not_mentioned: 0.3 }, 0.2)]),
		);
		expect(picks.yes).toBe(1);
		expect(picks.rows[0]?.newRecord).toBe(0.2);
	});
});

describe("the tags' gaps on #79's probes", () => {
	const TAGS = ["meals", "travel", "office", "client"];
	const answer = (winner: string, p = 0.9) => {
		const labels = ["yes", "not_mentioned", "not_available"];
		return Object.fromEntries(
			labels.map((label) => [label, label === winner ? p : (1 - p) / 2]),
		);
	};
	const row = (
		id: string,
		tags: Record<string, Record<string, number>>,
		vendor = 0.9,
	): CardRunRow => ({
		id,
		request: id,
		kind: "record",
		expected: { vendor: "brightmop" },
		fields: {
			vendor: {
				kind: "catalog",
				candidates: [
					{ id: "brightmop", description: "", implies: { tags: ["office"] } },
				],
			},
			tags: {
				kind: "several",
				candidates: TAGS.map((tag) => ({ id: tag, description: "" })),
			},
		},
		answers: {
			intent: { new_record: 0.9, not_mentioned: 0.05, not_available: 0.05 },
			vendor: {
				brightmop: vendor,
				not_mentioned: 1 - vendor,
				not_available: 0,
			},
			...Object.fromEntries(
				TAGS.map((tag) => [
					`tags_${tag}`,
					tags[tag] ?? answer("not_mentioned"),
				]),
			),
		},
		latencyMs: 250,
		called: true,
	});
	const run = (rows: CardRunRow[]): CardRun => ({
		startedAt: "2026-09-23T00:00:00.000Z",
		gates: { intent: 0.45, vendor: 0.7, tags: 0.4 },
		killLines: CARD_KILL_LINES,
		rows,
	});

	it("count the rows the tags left a gap on, and the ones the vendor filled office on", () => {
		const gaps = tagGaps(
			run([
				row("empty", {}),
				row("weak office", { office: answer("yes", 0.38) }),
				row("empty, vendor held", {}, 0.5),
				row("meals", { meals: answer("yes") }),
				row("office maybe", { office: answer("not_available") }),
			]),
		);

		expect(gaps.rows.map(({ id, gap, filled }) => [id, gap, filled])).toEqual([
			["empty", true, true],
			["weak office", true, true],
			["empty, vendor held", true, false],
			["meals", false, false],
			["office maybe", false, false],
		]);
		expect(gaps).toMatchObject({ rows: expect.any(Array), gaps: 3, filled: 2 });
	});
});
