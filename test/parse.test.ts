import { builtInParser, type Facts } from "justask";
import { describe, expect, it } from "vitest";

// A Monday, as in the lab. Every relative date below is computed from it, never from the clock.
const TODAY = "2026-09-21";

const parse = (text: string, facts: Facts = {}) =>
	builtInParser(text, { today: TODAY, reads: "past", facts });
const dates = (text: string) =>
	(parse(text).dates ?? []).map((d) => [d.text, d.from, d.to]);
const ahead = (text: string, today = TODAY) =>
	(builtInParser(text, { today, reads: "future", facts: {} }).dates ?? []).map(
		(d) => [d.text, d.from, d.to],
	);
const times = (text: string) =>
	(parse(text).times ?? []).map((t) => [t.text, t.time]);
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
		expect(dates("el sábado")).toEqual([
			["sábado", "2026-09-19", "2026-09-19"],
		]);
	});
});

describe("reading the future, as a due date does", () => {
	it.each([
		["mañana", "2026-09-22"],
		["tomorrow", "2026-09-22"],
		["pasado mañana", "2026-09-23"],
		["the day after tomorrow", "2026-09-23"],
		["en 3 días", "2026-09-24"],
		["dentro de dos semanas", "2026-10-05"],
		["in 2 weeks", "2026-10-05"],
		["hoy", "2026-09-21"],
	])("%s", (text, day) => {
		expect(ahead(text)).toEqual([[text, day, day]]);
	});

	it("reads a weekday as the first one after today, so on a Monday 'el lunes' is a week away", () => {
		expect(ahead("el viernes")).toEqual([
			["viernes", "2026-09-25", "2026-09-25"],
		]);
		expect(ahead("el lunes")).toEqual([["lunes", "2026-09-28", "2026-09-28"]]);
	});

	it.each([
		["5 de marzo", "2027-03-05"],
		["March 5", "2027-03-05"],
		["25 de septiembre", "2026-09-25"],
		["21 de septiembre", "2026-09-21"],
		["el día 28", "2026-09-28"],
		["el día 5", "2026-10-05"],
		["due on the 3rd", "2026-10-03"],
		["el 28 a las 3", "2026-09-28"],
	])("puts a day with no year on or after today: %s", (text, day) => {
		expect(ahead(text).map(([, from]) => from)).toEqual([day]);
	});

	it.each([
		["en octubre", "2026-10-01", "2026-10-31"],
		["in August", "2027-08-01", "2027-08-31"],
		["en septiembre", "2026-09-01", "2026-09-30"],
		["Q1", "2027-01-01", "2027-03-31"],
		["third quarter", "2026-07-01", "2026-09-30"],
	])(
		"puts a month or quarter with no year in the first one not over: %s",
		(text, from, to) => {
			expect(ahead(text).map(([, f, t]) => [f, t])).toEqual([[from, to]]);
		},
	);

	it("offers both readings of 03/04 in the future", () => {
		expect(ahead("03/04")).toEqual([
			["03/04", "2027-04-03", "2027-04-03"],
			["03/04", "2027-03-04", "2027-03-04"],
		]);
	});

	it.each([
		["friday next week", "2026-10-02"],
		["el viernes de la semana que viene", "2026-10-02"],
		["el viernes de la semana pasada", "2026-09-18"],
	])(
		"reads a weekday of the week after or before this one one way: %s",
		(text, day) => {
			expect(ahead(text).map(([, from]) => from)).toEqual([day]);
		},
	);

	it("reads no day from an ordinal that ranks rows", () => {
		expect(ahead("the 3rd largest invoice")).toEqual([]);
		expect(dates("the 3 largest invoices")).toEqual([]);
	});
});

describe("parts of the day", () => {
	const both = (text: string) => {
		const past = dates(text);
		expect(ahead(text)).toEqual(past);
		return past;
	};

	it.each([
		"this morning",
		"this afternoon",
		"this evening",
		"tonight",
		"esta mañana",
		"esta tarde",
		"esta noche",
	])("reads '%s' as today, whichever way the field reads", (text) => {
		expect(both(`gas ${text}`)).toEqual([[text, TODAY, TODAY]]);
	});

	it.each(["last night", "last evening", "anoche"])(
		"reads '%s' as yesterday, whichever way the field reads",
		(text) => {
			expect(both(`dinner ${text}`)).toEqual([
				[text, "2026-09-20", "2026-09-20"],
			]);
		},
	);

	it("reads the hour beside a part of the day as a time, and the part as the day", () => {
		expect(both("a las 9 esta noche")).toEqual([["esta noche", TODAY, TODAY]]);
		expect(times("a las 9 esta noche").map(([span]) => span)).toContain(
			"a las 9",
		);
	});

	it("still reads 'mañana' alone as tomorrow", () => {
		expect(ahead("mañana")).toEqual([["mañana", "2026-09-22", "2026-09-22"]]);
	});
});

describe("next and last weekdays", () => {
	const SATURDAY = "2026-09-26";
	const WEDNESDAY = "2026-09-23";
	const readings = (text: string, reads: "past" | "future", today = TODAY) =>
		(builtInParser(text, { today, reads, facts: {} }).dates ?? []).map((d) => [
			d.from,
			d.ambiguous ?? false,
		]);
	/** The same readings on a past and a future field (ADR 0008). */
	const bothWays = (text: string, today: string) => {
		const past = readings(text, "past", today);
		expect(readings(text, "future", today)).toEqual(past);
		return past;
	};

	it.each([
		["last Friday", SATURDAY],
		["el viernes pasado", SATURDAY],
		["el pasado viernes", SATURDAY],
	])(
		"holds '%s' said on Saturday %s: yesterday, or the Friday of the week before this one",
		(text, today) => {
			expect(bothWays(text, today)).toEqual([
				["2026-09-25", true],
				["2026-09-18", true],
			]);
		},
	);

	it.each([
		["last Friday", WEDNESDAY],
		["el viernes pasado", WEDNESDAY],
		["el pasado viernes", WEDNESDAY],
	])(
		"reads '%s' said on Wednesday %s one way: the closest Friday is the one of the week before this one",
		(text, today) => {
			expect(bothWays(text, today)).toEqual([["2026-09-18", false]]);
		},
	);

	it.each([
		["last Monday", SATURDAY],
		["el lunes pasado", SATURDAY],
		["last Monday", WEDNESDAY],
		["el lunes pasado", WEDNESDAY],
	])(
		"holds '%s' said on %s: this week's Monday, or last week's",
		(text, today) => {
			expect(bothWays(text, today)).toEqual([
				["2026-09-21", true],
				["2026-09-14", true],
			]);
		},
	);

	it.each(["last Monday", "el lunes pasado"])(
		"reads '%s' said on a Monday one way: a week ago",
		(text) => {
			expect(bothWays(text, TODAY)).toEqual([["2026-09-14", false]]);
		},
	);

	it.each([
		["next Friday", WEDNESDAY],
		["el próximo viernes", WEDNESDAY],
		["el viernes que viene", WEDNESDAY],
	])(
		"holds '%s' said on Wednesday %s: this week's Friday, or the one of the week after this one",
		(text, today) => {
			expect(bothWays(text, today)).toEqual([
				["2026-09-25", true],
				["2026-10-02", true],
			]);
		},
	);

	it.each([
		["next Friday", SATURDAY],
		["el próximo viernes", SATURDAY],
		["el viernes que viene", SATURDAY],
	])(
		"reads '%s' said on Saturday %s one way: the closest Friday is the one of the week after this one",
		(text, today) => {
			expect(bothWays(text, today)).toEqual([["2026-10-02", false]]);
		},
	);

	it.each([
		["next Monday", WEDNESDAY],
		["el próximo lunes", SATURDAY],
		["el próximo lunes", TODAY],
	])(
		"reads '%s' said on %s one way: the Monday that starts next week",
		(text, today) => {
			expect(bothWays(text, today)).toEqual([["2026-09-28", false]]);
		},
	);

	it("says which way each held reading was taken", () => {
		const notes = (
			builtInParser("last Friday", {
				today: SATURDAY,
				reads: "past",
				facts: {},
			}).dates ?? []
		).map((d) => d.note);
		expect(notes).toEqual([
			"reading 'last' as the closest one before today",
			"reading 'last' as that weekday in the week before this one",
		]);
	});

	it("reads 'this coming Friday' as the first one after today, whichever way the field reads", () => {
		expect(readings("this coming Friday", "past")).toEqual([
			["2026-09-25", false],
		]);
		expect(readings("the coming Friday", "future")).toEqual([
			["2026-09-25", false],
		]);
	});
});

describe("times", () => {
	it.each([
		["a las 4 de la tarde", "a las 4 de la tarde", "16:00"],
		["at 4pm", "at 4pm", "16:00"],
		["lunch at 9 am", "at 9 am", "09:00"],
		["a las 10 de la mañana", "a las 10 de la mañana", "10:00"],
		[
			"las 5 menos cuarto de la tarde",
			"las 5 menos cuarto de la tarde",
			"16:45",
		],
		["17:00", "17:00", "17:00"],
		["al mediodía", "al mediodía", "12:00"],
		["at noon", "noon", "12:00"],
		["at 12", "at 12", "12:00"],
	])("%s", (text, span, time) => {
		expect(times(text)).toEqual([[span, time]]);
	});

	it("offers the morning and the evening reading of a bare hour, for the provider to pick from the words around it", () => {
		expect(times("a las 4")).toEqual([
			["a las 4", "04:00"],
			["a las 4", "16:00"],
		]);
		expect(times("a la una y media")).toEqual([
			["a la una y media", "01:30"],
			["a la una y media", "13:30"],
		]);
		expect(parse("a las 4").times?.every((t) => !t.ambiguous)).toBe(true);
	});

	it("marks an hour with no minute said ambiguous: 'a las 2 y pico'", () => {
		expect(
			parse("a las 2 y pico").times?.map((t) => [t.time, t.ambiguous]),
		).toEqual([
			["02:00", true],
			["14:00", true],
		]);
	});

	it("does not read 'mañana' in 'de la mañana' as tomorrow", () => {
		expect(ahead("a las 10 de la mañana")).toEqual([]);
	});

	it("leaves money and counts alone", () => {
		expect(times("lunch at 5 dollars")).toEqual([]);
		expect(amounts("lunch at 5 dollars")).toEqual([["5 dollars", 5, "USD"]]);
		expect(times("las 3 facturas")).toEqual([]);
	});

	it.each([
		["coffee at 4.50", 4.5],
		["lunch at 12.99", 12.99],
		["lunch @ 9.99", 9.99],
		["taxi a las 3,50", 3.5],
	])("leaves a number with decimals to the amounts: %s", (text, value) => {
		expect(times(text)).toEqual([]);
		expect(amounts(text).map(([, v]) => v)).toEqual([value]);
	});

	it("does not read the hour of a time as an amount", () => {
		expect(amounts("a las 4 de la tarde")).toEqual([]);
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

	describe("numbers written in words (#182)", () => {
		it.each([
			["twenty-five dollars", 25],
			["thirty two dollars", 32],
			["one hundred fifty dollars", 150],
			["two hundred and fifty dollars", 250],
			["two hundred dollars", 200],
			["twelve hundred dollars", 1200],
			["sixty-five dollars", 65],
			["cuarenta y cinco dólares", 45],
			["doscientos cincuenta dólares", 250],
			["trescientos cincuenta dólares", 350],
			["ciento veinte dólares", 120],
			["doscientos noventa y nueve dólares", 299],
			["veinticinco dólares", 25],
			["dieciséis dólares", 16],
			["mil quinientos dólares", 1500],
			["mil doscientos dólares", 1200],
			["dos mil trescientos dólares", 2300],
			["one thousand two hundred dollars", 1200],
		])("reads %s whole", (text, value) => {
			expect(amounts(text)).toEqual([[text, value, "USD"]]);
		});

		it.each([
			["diez dólares con cincuenta", 10.5],
			["10 dólares con 50", 10.5],
			["ten dollars and fifty cents", 10.5],
		])("reads the cents said after the currency: %s", (text, value) => {
			expect(amounts(text)).toEqual([[text, value, "USD"]]);
		});

		it("reads a number of words with a multiplier whole, currency or not", () => {
			expect(amounts("over two thousand five hundred")).toEqual([
				["two thousand five hundred", 2500, null],
			]);
			expect(amounts("más de dos mil quinientos")).toEqual([
				["dos mil quinientos", 2500, null],
			]);
		});

		it("still reads no money from number words with neither a multiplier nor a currency", () => {
			expect(amounts("the two hundred rows")).toEqual([]);
			expect(amounts("los dos de Ana")).toEqual([]);
			expect(amounts("a coffee")).toEqual([]);
		});
	});

	describe("abbreviated millions and spaced thousands (#182)", () => {
		it.each([
			["$1.5M", 1500000, "USD"],
			["$2M", 2000000, "USD"],
			["1.5m dollars", 1500000, "USD"],
			["US$3MM", 3000000, "USD"],
		])("reads %s as millions beside a currency", (text, value, currency) => {
			expect(amounts(text, { local_currency: "USD" })).toEqual([
				[text, value, currency],
			]);
		});

		it("reads no amount from an M with no currency beside it, which may be minutes or meters", () => {
			expect(amounts("a 5m walk")).toEqual([]);
		});

		it.each([
			["1 234,56", 1234.56, null],
			["$ 1 234,56", 1234.56, null],
			["1 000 pesos", 1000, null],
			["12 500", 12500, null],
		])(
			"reads %s with a space between thousands as one number",
			(text, value, currency) => {
				expect(amounts(text)).toEqual([[text, value, currency]]);
			},
		);
	});

	describe("a currency the request names beside the number (#181)", () => {
		it.each([
			["over RD$300", "RD$300", 300, "DOP"],
			["menos de RD$ 2,000", "RD$ 2,000", 2000, "DOP"],
			["£299", "£299", 299, "GBP"],
			["A$20", "A$20", 20, "AUD"],
			["300 mxn", "300 mxn", 300, "MXN"],
			["Pieveloz 300 dop", "300 dop", 300, "DOP"],
			["eur 12", "eur 12", 12, "EUR"],
			["EUR12", "EUR12", 12, "EUR"],
			["gbp 40", "gbp 40", 40, "GBP"],
		])("reads %s in the currency it names", (text, span, value, currency) => {
			expect(parse(text, { local_currency: "USD" }).amounts).toEqual([
				{ text: span, value, currency },
			]);
		});

		it.each([
			["over ¥1000", "¥1000", 1000, "¥"],
			["over C$500", "C$500", 500, "C$"],
			["mil pesos", "mil pesos", 1000, "pesos"],
			["un millón de pesos", "un millón de pesos", 1000000, "pesos"],
			["a thousand pesos", "a thousand pesos", 1000, "pesos"],
		])(
			"holds %s, whose mark names no one currency the local one fits, unresolved",
			(text, span, value, mark) => {
				expect(parse(text, { local_currency: "USD" }).amounts).toEqual([
					{ text: span, value, currency: null, unresolved: mark },
				]);
			},
		);

		it("reads an ambiguous mark as the local currency when that is how the local one is written", () => {
			expect(amounts("¥500", { local_currency: "JPY" })).toEqual([
				["¥500", 500, "JPY"],
			]);
			expect(amounts("mil pesos", { local_currency: "DOP" })).toEqual([
				["mil pesos", 1000, "DOP"],
			]);
		});

		it("still leaves a lowercase word of three letters that is not a common code alone", () => {
			expect(amounts("the top 10 invoices", { local_currency: "USD" })).toEqual(
				[["10", 10, null]],
			);
			expect(amounts("10 all told", { local_currency: "USD" })).toEqual([
				["10", 10, null],
			]);
		});
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
			times: [],
			amounts: [],
		});
	});
});
