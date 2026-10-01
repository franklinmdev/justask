import { ask, type Probabilities } from "@justask/core";
import { describe, expect, it } from "vitest";
import { demoFilter, FACTS } from "../demo/server/handler.ts";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
import { applyTo, matches, transactionsOn } from "../demo/src/transactions.ts";
import { type FakeAnswers, fakeProvider, perRequest } from "./fake-provider.ts";

/** One question's answer: `pick` at 0.96, every other label near zero. */
function question(labels: string[], pick: string | null): Probabilities {
	const answer: Probabilities = Object.fromEntries(
		labels.map((label) => [label, 0.01]),
	);
	answer.not_mentioned = pick ? 0.01 : 0.96;
	answer.not_available = 0.01;
	if (pick) answer[pick] = 0.96;
	return answer;
}

const vendors = [...english.vendors, ...spanish.vendors].map(({ id }) => id);
const statuses = english.statuses.map(({ id }) => id);

/** Every question the demo's filter can ask, answered as the request means it, and the fields that answer fills. */
function answer({
	vendor = null,
	status = null,
	date = null,
	amounts = [],
}: {
	vendor?: string | null;
	status?: string | null;
	date?: string | null;
	amounts?: string[];
}): { fixtures: FakeAnswers; fills: string[] } {
	const fixtures = {
		vendor: question(vendors, vendor),
		status: question(statuses, status),
		date_from: question(["d0", "d1", "d2", "d3"], date),
		date_to: question(["d0", "d1", "d2", "d3"], date),
		...Object.fromEntries(
			amounts.map((role, i) => [
				`amount_a${i}`,
				question(["min", "max", "exact"], role),
			]),
		),
	};
	const picked = { vendor, status, date, amount: amounts.length > 0 };
	const fills = Object.keys(picked).filter(
		(name) => picked[name as keyof typeof picked],
	);
	return { fixtures, fills };
}

/** The suggestions under "Fills the filters", each answered right. */
const fills = {
	en: {
		"Larkspur invoices over $1,000": answer({
			vendor: "larkspur",
			amounts: ["min"],
		}),
		"overdue invoices": answer({ status: "overdue" }),
		"what we paid last month": answer({ status: "paid", date: "d0" }),
		"invoices between $200 and $1,000 from last week": answer({
			date: "d0",
			amounts: ["min", "max"],
		}),
	},
	es: {
		"facturas de Cazuela Azul de más de $1,000": answer({
			vendor: "cazuela",
			amounts: ["min"],
		}),
		"facturas vencidas": answer({ status: "overdue" }),
		"lo que pagamos el mes pasado": answer({ status: "paid", date: "d0" }),
		"facturas entre 200 y 1,000 dólares de la semana pasada": answer({
			date: "d0",
			amounts: ["min", "max"],
		}),
	},
};

/** An ISO day `n` days after `iso`. */
function plus(iso: string, n: number): string {
	const day = new Date(`${iso}T00:00:00Z`);
	day.setUTCDate(day.getUTCDate() + n);
	return day.toISOString().slice(0, 10);
}

/** Every day from the release, 2026-09-24, for a year and a month: every weekday, month start and year start. */
const todays = Array.from({ length: 400 }, (_, n) => plus("2026-09-24", n));

describe.each([
	["en", english],
	["es", spanish],
] as const)("the demo's %s transactions", (language, content) => {
	it("are the ones written for the week of 2026-09-21, the eval's today", () => {
		for (const day of ["2026-09-21", "2026-09-23", "2026-09-27"]) {
			expect(transactionsOn(content.transactions, day)).toEqual(
				content.transactions,
			);
		}
	});

	it("move by whole weeks with today, so each keeps its weekday and none is later than today", () => {
		const moved = transactionsOn(content.transactions, "2027-01-01");
		const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
		moved.forEach((row, i) => {
			const written = content.transactions[i];
			expect({ ...row, date: written?.date }).toEqual(written);
			expect(weekday(row.date)).toBe(weekday(written?.date ?? ""));
		});
		expect(
			moved
				.map(({ date }) => date)
				.sort()
				.at(-1),
		).toBe("2026-12-25");
		for (const today of todays) {
			for (const { date } of transactionsOn(content.transactions, today)) {
				expect(date < today).toBe(true);
			}
		}
	});

	it("give every suggestion that fills the filters rows on every day of a year", async () => {
		expect(Object.keys(fills[language])).toEqual(
			content.filterSuggestions.fills,
		);
		const answers = fills[language] as Record<
			string,
			ReturnType<typeof answer>
		>;
		const provider = fakeProvider(
			perRequest(
				Object.fromEntries(
					Object.entries(answers).map(([request, { fixtures }]) => [
						request,
						fixtures,
					]),
				),
			),
		);
		const empty: string[] = [];
		for (const today of todays) {
			const rows = transactionsOn(content.transactions, today);
			for (const request of content.filterSuggestions.fills) {
				const { filter } = await ask({
					request,
					facts: { today, ...FACTS },
					provider,
					timeoutMs: 1_000,
					filter: demoFilter(content),
				});
				if (!filter) throw new Error(`no filter for "${request}"`);
				// Every field the answer picks fills.
				expect(Object.keys(filter.value).sort()).toEqual(
					[...(answers[request]?.fills ?? [])].sort(),
				);
				const applied = applyTo({}, filter.value);
				if (!rows.some((row) => matches(row, applied))) {
					empty.push(`${today} ${request}`);
				}
			}
		}
		expect(empty).toEqual([]);
	});
});
