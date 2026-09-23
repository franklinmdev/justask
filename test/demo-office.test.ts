import type { CardRun, CardRunRow } from "justask/eval";
import { describe, expect, it } from "vitest";
import { CARD_KILL_LINES } from "../demo/eval/kill-lines.ts";
import {
	OFFICE_LABELS,
	officePicks,
	withOfficeLabel,
} from "../demo/eval/office.ts";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";

const officeOf = (content: typeof english) =>
	content.tags.find(({ id }) => id === "office")?.description;

describe.each([english, spanish])(
	"#77's office labels in $language",
	(content) => {
		it("start from the label the demo serves", () => {
			expect(OFFICE_LABELS[content.language].current).toBe(officeOf(content));
		});

		it.each(Object.keys(OFFICE_LABELS[content.language]))(
			"change the office tag alone, to %s",
			(label) => {
				const changed = withOfficeLabel(content, label);
				expect(officeOf(changed)).toBe(OFFICE_LABELS[content.language][label]);
				expect(changed.tags.filter(({ id }) => id !== "office")).toEqual(
					content.tags.filter(({ id }) => id !== "office"),
				);
				expect({ ...changed, tags: [] }).toEqual({ ...content, tags: [] });
			},
		);

		it("refuse a label that is not written down", () => {
			expect(() => withOfficeLabel(content, "longer")).toThrow(/longer/);
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
		expect(picks.rows.map(({ id, pick, p }) => [id, pick, p])).toEqual([
			["yes", "yes", 0.62],
			["weak yes", "yes", 0.38],
			["not mentioned", "not_mentioned", 0.85],
			["not available", "not_available", 0.5],
		]);
	});

	it("read the tag's own question, whatever the intent did", () => {
		const picks = officePicks(
			run([row("held card", { yes: 0.7, not_mentioned: 0.3 }, 0.2)]),
		);
		expect(picks.yes).toBe(1);
		expect(picks.rows[0]?.newRecord).toBe(0.2);
	});
});
