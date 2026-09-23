import { builtInParser, type Facts } from "justask";
import { describe, expect, it } from "vitest";

// A Monday, as in the lab. Every relative date below is computed from it, never from the clock.
const TODAY = "2026-09-21";

const parse = (text: string, facts: Facts = {}) =>
	builtInParser(text, { today: TODAY, facts });
const dates = (text: string) =>
	(parse(text).dates ?? []).map((d) => [d.text, d.from, d.to]);
const amounts = (text: string, facts: Facts = {}) =>
	(parse(text, facts).amounts ?? []).map((a) => [a.text, a.value, a.currency]);

describe("relative dates", () => {
	it.each([
		["ventas de hoy", "hoy", "2026-09-21", "2026-09-21"],
		["what came in today", "today", "2026-09-21", "2026-09-21"],
		["gastos de ayer", "ayer", "2026-09-20", "2026-09-20"],
		["yesterday's entries", "yesterday", "2026-09-20", "2026-09-20"],
		["lo de anteayer", "anteayer", "2026-09-19", "2026-09-19"],
		["lo de antier", "antier", "2026-09-19", "2026-09-19"],
		[
			"the day before yesterday",
			"the day before yesterday",
			"2026-09-19",
			"2026-09-19",
		],
	])("%s", (text, span, from, to) => {
		expect(dates(text)).toEqual([[span, from, to]]);
	});

	it("does not read 'ayer' twice inside 'antes de ayer'", () => {
		expect(dates("pagos de antes de ayer")).toEqual([
			["antes de ayer", "2026-09-19", "2026-09-19"],
		]);
	});

	it.each([
		["esta semana", "2026-09-21", "2026-09-27"],
		["this week", "2026-09-21", "2026-09-27"],
		["la semana pasada", "2026-09-14", "2026-09-20"],
		["la pasada semana", "2026-09-14", "2026-09-20"],
		["semana anterior", "2026-09-14", "2026-09-20"],
		["last week", "2026-09-14", "2026-09-20"],
		["la semana que viene", "2026-09-28", "2026-10-04"],
	])("week: %s is Monday to Sunday", (text, from, to) => {
		expect(dates(text)).toEqual([[text, from, to]]);
	});

	it.each([
		["este mes", "2026-09-01", "2026-09-30"],
		["el mes pasado", "2026-08-01", "2026-08-31"],
		["last month", "2026-08-01", "2026-08-31"],
		["este año", "2026-01-01", "2026-12-31"],
		["el año pasado", "2025-01-01", "2025-12-31"],
		["last year", "2025-01-01", "2025-12-31"],
	])("month and year: %s", (text, from, to) => {
		expect(dates(text)).toEqual([[text, from, to]]);
	});

	it.each([
		["el trimestre pasado", "2026-04-01", "2026-06-30"],
		["trimestre anterior", "2026-04-01", "2026-06-30"],
		["el último trimestre", "2026-04-01", "2026-06-30"],
		["last quarter", "2026-04-01", "2026-06-30"],
		["este trimestre", "2026-07-01", "2026-09-30"],
		["this quarter", "2026-07-01", "2026-09-30"],
	])("quarter: %s", (text, from, to) => {
		expect(dates(text)).toEqual([[text, from, to]]);
	});

	it.each([
		["Q1", "2026-01-01", "2026-03-31"],
		["Q4", "2025-10-01", "2025-12-31"],
		["q2 2025", "2025-04-01", "2025-06-30"],
		["primer trimestre", "2026-01-01", "2026-03-31"],
		["segundo trimestre del año pasado", "2025-04-01", "2025-06-30"],
		["third quarter", "2026-07-01", "2026-09-30"],
	])("named quarter, the latest one already begun: %s", (text, from, to) => {
		expect(dates(text)).toEqual([[text, from, to]]);
	});

	it.each([
		["los últimos 7 días", "2026-09-15", "2026-09-21"],
		["últimos 30 días", "2026-08-23", "2026-09-21"],
		["last 2 weeks", "2026-09-08", "2026-09-21"],
		["the past three days", "2026-09-19", "2026-09-21"],
		["últimos 3 meses", "2026-06-22", "2026-09-21"],
	])("last N: %s ends today", (text, from, to) => {
		expect(dates(text)).toEqual([[text, from, to]]);
	});

	it.each([
		["hace 3 días", "2026-09-18"],
		["hace dos semanas", "2026-09-07"],
		["5 days ago", "2026-09-16"],
		["hace un mes", "2026-08-21"],
	])("ago: %s", (text, day) => {
		expect(dates(text)).toEqual([[text, day, day]]);
	});

	it("reads a weekday as the most recent one before today, so on a Monday 'el lunes' is a week back", () => {
		expect(dates("lo del viernes")).toEqual([
			["viernes", "2026-09-18", "2026-09-18"],
		]);
		expect(dates("el lunes")).toEqual([["lunes", "2026-09-14", "2026-09-14"]]);
		expect(dates("since Wednesday")).toEqual([
			["Wednesday", "2026-09-16", "2026-09-16"],
		]);
		expect(dates("el sábado pasado")).toEqual([
			["sábado pasado", "2026-09-19", "2026-09-19"],
		]);
	});
});

describe("month names", () => {
	it.each([
		["ventas de agosto", "agosto", "2026-08-01", "2026-08-31"],
		["in August", "August", "2026-08-01", "2026-08-31"],
		["en septiembre", "septiembre", "2026-09-01", "2026-09-30"],
		["octubre", "octubre", "2025-10-01", "2025-10-31"],
		["diciembre 2024", "diciembre 2024", "2024-12-01", "2024-12-31"],
		["marzo de 2025", "marzo de 2025", "2025-03-01", "2025-03-31"],
		[
			"agosto del año pasado",
			"agosto del año pasado",
			"2025-08-01",
			"2025-08-31",
		],
		["since May", "May", "2026-05-01", "2026-05-31"],
	])("%s", (text, span, from, to) => {
		expect(dates(text)).toEqual([[span, from, to]]);
	});

	it("does not read the English modal 'may' or the Spanish 'mar' as months", () => {
		expect(dates("you may filter by amount")).toEqual([]);
		expect(dates("gastos del viaje al mar")).toEqual([]);
	});

	it.each([
		["el 5 de agosto", "5 de agosto", "2026-08-05"],
		["15 agosto", "15 agosto", "2026-08-15"],
		["August 5th", "August 5th", "2026-08-05"],
		["Aug 5, 2025", "Aug 5, 2025", "2025-08-05"],
		["the 3rd of March", "the 3rd of March", "2026-03-03"],
		["25 de diciembre", "25 de diciembre", "2025-12-25"],
		["1 de octubre de 2026", "1 de octubre de 2026", "2026-10-01"],
	])("day and month: %s", (text, span, day) => {
		expect(dates(text)).toEqual([[span, day, day]]);
	});

	it.each([
		[
			"del 1 al 15 de agosto",
			"del 1 al 15 de agosto",
			"2026-08-01",
			"2026-08-15",
		],
		[
			"entre el 10 y el 20 de julio",
			"entre el 10 y el 20 de julio",
			"2026-07-10",
			"2026-07-20",
		],
		[
			"1-15 de marzo de 2025",
			"1-15 de marzo de 2025",
			"2025-03-01",
			"2025-03-15",
		],
		["August 1 to 15", "August 1 to 15", "2026-08-01", "2026-08-15"],
		["Aug 3-9", "Aug 3-9", "2026-08-03", "2026-08-09"],
	])("day range in one month: %s", (text, span, from, to) => {
		expect(dates(text)).toEqual([[span, from, to]]);
	});

	it("keeps two dates of one sentence apart and in order", () => {
		expect(dates("desde el 5 de agosto hasta ayer")).toEqual([
			["5 de agosto", "2026-08-05", "2026-08-05"],
			["ayer", "2026-09-20", "2026-09-20"],
		]);
		expect(dates("between March 3 and April 10")).toEqual([
			["March 3", "2026-03-03", "2026-03-03"],
			["April 10", "2026-04-10", "2026-04-10"],
		]);
	});
});

describe("numeric dates", () => {
	it("reads an unambiguous day/month one way", () => {
		expect(dates("desde el 25/08")).toEqual([
			["25/08", "2026-08-25", "2026-08-25"],
		]);
		expect(dates("since 8/25")).toEqual([["8/25", "2026-08-25", "2026-08-25"]]);
	});

	it("offers both readings of an ambiguous one, each saying which it is, for the provider to pick", () => {
		const read = parse("desde el 03/04").dates ?? [];
		expect(read.map((d) => [d.text, d.from])).toEqual([
			["03/04", "2026-04-03"],
			["03/04", "2026-03-04"],
		]);
		expect(read[0]?.note).toContain("day/month");
		expect(read[1]?.note).toContain("month/day");
	});

	it("gives one candidate when both readings are the same day", () => {
		expect(dates("05/05")).toHaveLength(1);
	});

	it.each([
		["15/08/2025", "2025-08-15"],
		["08/15/2025", "2025-08-15"],
		["15-08-2025", "2025-08-15"],
		["15.08.25", "2025-08-15"],
		["2025-08-15", "2025-08-15"],
	])("with a year: %s", (text, day) => {
		expect(dates(text)).toEqual([[text, day, day]]);
	});

	it("drops a day that does not exist", () => {
		expect(dates("31/02")).toEqual([]);
	});

	it("puts an undated day in the past, since a filter looks back", () => {
		expect(dates("12/25")).toEqual([["12/25", "2025-12-25", "2025-12-25"]]);
	});
});

describe("a bare year is both a date and a number", () => {
	it("offers 2025 as the whole year and as an amount", () => {
		const read = parse("facturas de 2025");
		expect(read.dates?.map((d) => [d.from, d.to])).toEqual([
			["2025-01-01", "2025-12-31"],
		]);
		expect(read.amounts?.map((a) => a.value)).toEqual([2025]);
	});
});

describe("amounts", () => {
	it.each([
		["más de 500", "500", 500],
		["over 1,500", "1,500", 1500],
		["más de 1.500", "1.500", 1500],
		["1,500.50", "1,500.50", 1500.5],
		["1.500,50", "1.500,50", 1500.5],
		["12.5", "12.5", 12.5],
		["10 mil", "10 mil", 10000],
		["10mil", "10mil", 10000],
		["5k", "5k", 5000],
		["2.5 millones", "2.5 millones", 2500000],
		["mil pesos", "mil", 1000],
		["diez mil", "diez mil", 10000],
		["un millón", "un millón", 1000000],
		["a thousand", "a thousand", 1000],
	])("%s", (text, span, value) => {
		expect(amounts(text)).toEqual([[span, value, null]]);
	});

	it.each([
		["US$200", "US$200", 200],
		["USD 200", "USD 200", 200],
		["200 usd", "200 usd", 200],
		["200 dólares", "200 dólares", 200],
		["1 million dollars", "1 million dollars", 1000000],
	])(
		"reads %s as US dollars when the app's currency is not a dollar",
		(text, span, value) => {
			expect(amounts(text)).toEqual([[span, value, "USD"]]);
			expect(amounts(text, { local_currency: "EUR" })).toEqual([
				[span, value, "USD"],
			]);
		},
	);

	it.each([
		["50 euros", "50 euros", 50],
		["€50", "€50", 50],
		["50 EUR", "50 EUR", 50],
	])("reads %s as euros", (text, span, value) => {
		expect(amounts(text)).toEqual([[span, value, "EUR"]]);
	});

	it("reads a currency code written in capitals, any the runtime knows", () => {
		expect(amounts("over 500 MXN")).toEqual([["500 MXN", 500, "MXN"]]);
		expect(amounts("DOP 1,200")).toEqual([["DOP 1,200", 1200, "DOP"]]);
	});

	it("does not read an everyday word of three letters as a currency code", () => {
		expect(amounts("the top 10 invoices")).toEqual([["10", 10, null]]);
		expect(amounts("500 for rent")).toEqual([["500", 500, null]]);
	});

	describe("the local currency fact", () => {
		it.each([
			["$300", "$300", 300],
			["300 pesos", "300 pesos", 300],
			["quinientos pesos", "quinientos pesos", 500],
		])(
			"reads %s in the local peso when the app's currency is a peso",
			(text, span, value) => {
				expect(amounts(text, { local_currency: "MXN" })).toEqual([
					[span, value, "MXN"],
				]);
			},
		);

		it("reads a bare $ as the local dollar", () => {
			expect(amounts("$300", { local_currency: "CAD" })).toEqual([
				["$300", 300, "CAD"],
			]);
			expect(amounts("$300", { local_currency: "USD" })).toEqual([
				["$300", 300, "USD"],
			]);
		});

		it("reads dollars as the local dollar when the app's currency is a dollar", () => {
			expect(amounts("200 dollars", { local_currency: "CAD" })).toEqual([
				["200 dollars", 200, "CAD"],
			]);
			expect(amounts("200 dólares", { local_currency: "CAD" })).toEqual([
				["200 dólares", 200, "CAD"],
			]);
		});

		it("leaves a bare $ and pesos unresolved when there is no local currency, or it does not fit", () => {
			expect(amounts("$300")).toEqual([["$300", 300, null]]);
			expect(amounts("300 pesos")).toEqual([["300 pesos", 300, null]]);
			expect(amounts("$300", { local_currency: "EUR" })).toEqual([
				["$300", 300, null],
			]);
			expect(amounts("300 pesos", { local_currency: "USD" })).toEqual([
				["300 pesos", 300, null],
			]);
		});

		it("keeps the currency a request names when it does not resolve against the local one", () => {
			expect(
				parse("más de 300 pesos", { local_currency: "USD" }).amounts,
			).toEqual([
				{ text: "300 pesos", value: 300, currency: null, unresolved: "pesos" },
			]);
			expect(parse("over $300", { local_currency: "EUR" }).amounts).toEqual([
				{ text: "$300", value: 300, currency: null, unresolved: "$" },
			]);
			// Nothing to resolve against: the currency is only left out.
			expect(parse("over $300").amounts).toEqual([
				{ text: "$300", value: 300, currency: null },
			]);
			// No mark at all, and one that resolves, are never unresolved.
			expect(parse("over 300", { local_currency: "USD" }).amounts).toEqual([
				{ text: "300", value: 300, currency: null },
			]);
			expect(parse("over $300", { local_currency: "USD" }).amounts).toEqual([
				{ text: "$300", value: 300, currency: "USD" },
			]);
		});

		it("lets the currency word after a number decide over a bare $ before it", () => {
			expect(amounts("más de $500 pesos", { local_currency: "USD" })).toEqual([
				["$500 pesos", 500, null],
			]);
			expect(amounts("más de $500 pesos", { local_currency: "MXN" })).toEqual([
				["$500 pesos", 500, "MXN"],
			]);
		});

		it("refuses a local currency that is not a currency code", () => {
			expect(() => parse("500", { local_currency: "pesos" })).toThrow(
				/local_currency/,
			);
		});
	});

	it("does not read a number word without a multiplier or currency as money", () => {
		expect(amounts("los dos de Ana")).toEqual([]);
	});

	it("does not read the numbers inside a date as amounts", () => {
		expect(amounts("del 1 al 15 de agosto")).toEqual([]);
		expect(amounts("últimos 30 días")).toEqual([]);
		expect(amounts("25/08")).toEqual([]);
		expect(amounts("Q2")).toEqual([]);
	});

	it("reads two amounts and a date in one sentence, in order", () => {
		const read = parse("entre 500 y 2,000 dólares de la semana pasada");
		expect(read.amounts?.map((a) => [a.text, a.value, a.currency])).toEqual([
			["500", 500, null],
			["2,000 dólares", 2000, "USD"],
		]);
		expect(read.dates?.map((d) => d.text)).toEqual(["la semana pasada"]);
	});

	it("leaves every other number for the provider to call not an amount", () => {
		expect(amounts("los 10 más grandes").map(([, v]) => v)).toEqual([10]);
	});

	it.each([
		["1,500", 1500],
		["1.500", 1500],
		["1.5", 1.5],
		["300", 300],
		["1,234,567.89", 1234567.89],
		["1.234.567,89", 1234567.89],
		["1,5", 1.5],
	])("reads the separators of %s", (raw, value) => {
		expect(amounts(raw)).toEqual([[raw, value, null]]);
	});
});

describe("accents", () => {
	it("keeps every span where the person typed it, accents included", () => {
		expect(dates("Pagos de María del año pasado")).toEqual([
			["año pasado", "2025-01-01", "2025-12-31"],
		]);
	});
});

describe("nothing to parse", () => {
	it("returns no candidates for a request with no date or number", () => {
		expect(parse("ventas contabilizadas de Ana")).toEqual({
			dates: [],
			amounts: [],
		});
	});
});
