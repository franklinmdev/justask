import type { Facts } from "./provider.ts";

/** A date or period a parser read from the request, already resolved to days. */
export type DateReading = {
	/** The span as the person typed it. */
	text: string;
	/** First day covered, YYYY-MM-DD. */
	from: string;
	/** Last day covered, YYYY-MM-DD; equal to `from` for a single day. */
	to: string;
	/** How the text was read, for the provider: "reading the numbers as day/month". */
	note?: string;
	/**
	 * The request itself does not say which day: said on a Monday, "next
	 * Friday" reads two ways (this week's or next week's) and nothing in the
	 * words decides. A field whose pick lands on such a reading is held,
	 * whatever its probability.
	 */
	ambiguous?: boolean;
};

/** A time of day a parser read from the request. */
export type TimeReading = {
	/** The span as the person typed it. */
	text: string;
	/** HH:MM, 24-hour clock. */
	time: string;
	/** How the text was read, for the provider: "reading the hour as morning". */
	note?: string;
	/** The request does not say the exact time: "2 y pico". Held like an ambiguous date. */
	ambiguous?: boolean;
};

/** A money amount a parser read from the request. */
export type AmountReading = {
	/** The span as the person typed it, currency mark included. */
	text: string;
	value: number;
	/** An ISO 4217 code, or null when the request does not say which currency. */
	currency: string | null;
	/**
	 * The currency the request names, as typed, when it does not resolve
	 * against the `local_currency` fact: "pesos" when the local currency is
	 * USD. A field with such a reading is held, never filled with the number
	 * alone.
	 */
	unresolved?: string;
};

export type Readings = {
	dates?: DateReading[];
	times?: TimeReading[];
	amounts?: AmountReading[];
};

/**
 * Which way a date that does not say its year or week reads: back for a
 * filter and an expense's day, forward for a due date or an appointment.
 */
export type Reads = "past" | "future";

export type ParserInput = {
	/** Today in the person's time zone, YYYY-MM-DD. */
	today: string;
	reads: Reads;
	facts: Facts;
};

/**
 * Code that finds candidates in a request. A host app registers its own
 * beside the built-in one, for its domain's or region's formats.
 */
export type Parser = (request: string, input: ParserInput) => Readings;

/**
 * The built-in English and general Spanish parser, ported from the lab. It
 * reads dates backward, as a filter looks at what already happened, and
 * resolves a bare "$" and currency words through the `local_currency` fact.
 * An ambiguous reading is never guessed: "03/04" becomes two readings.
 */
export const builtInParser: Parser = (request, input) => {
	const { dates, times, amounts } = readSpans(request, input, []);
	return {
		dates: dates.map(({ reading }) => reading),
		times: times.map(({ reading }) => reading),
		amounts: amounts.map(({ reading }) => reading),
	};
};

type Span = [number, number];
type Placed<R> = { at: Span; reading: R };

/**
 * The host app's parsers' readings and the built-in one's, in the order they
 * appear in the request. The host app's parsers run first, and their spans
 * win: the built-in parser reads nothing that overlaps text they already read.
 */
export function parseRequest(
	request: string,
	input: ParserInput,
	parsers: readonly Parser[],
): { dates: DateReading[]; times: TimeReading[]; amounts: AmountReading[] } {
	const claimed: Span[] = [];
	const dates: Placed<DateReading>[] = [];
	const times: Placed<TimeReading>[] = [];
	const amounts: Placed<AmountReading>[] = [];
	for (const parser of parsers) {
		const readings = parser(request, input);
		for (const reading of readings.dates ?? []) {
			dates.push({ at: place(request, reading.text, claimed), reading });
		}
		for (const reading of readings.times ?? []) {
			times.push({ at: place(request, reading.text, claimed), reading });
		}
		for (const reading of readings.amounts ?? []) {
			amounts.push({ at: place(request, reading.text, claimed), reading });
		}
	}
	const own = readSpans(request, input, claimed);
	const inOrder = <R>(placed: Placed<R>[]) =>
		placed.sort((x, y) => x.at[0] - y.at[0]).map(({ reading }) => reading);
	return {
		dates: inOrder([...dates, ...own.dates]),
		times: inOrder([...times, ...own.times]),
		amounts: inOrder([...amounts, ...own.amounts]),
	};
}

/** The first unclaimed place a host parser's text sits, claimed; a text not found sorts last and claims nothing. */
function place(request: string, text: string, claimed: Span[]): Span {
	const overlaps = (s: number) =>
		claimed.some(([cs, ct]) => s < ct && cs < s + text.length);
	let start = text ? request.indexOf(text) : -1;
	while (start >= 0 && overlaps(start))
		start = request.indexOf(text, start + 1);
	if (start < 0) return [request.length, request.length];
	const span: Span = [start, start + text.length];
	claimed.push(span);
	return span;
}

// Text and calendar helpers

/**
 * Lowercase and strip accents one character at a time, so every index in the
 * folded text is the same index in the original. "Año" folds to "ano".
 */
function fold(text: string): string {
	let out = "";
	for (const c of text) {
		const f = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
		out += f.length === c.length ? f : c;
	}
	return out;
}

const DAY_MS = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => fmt(toTime(iso) + n * DAY_MS);

/** An ISO date, or null when the day does not exist in that month. */
function ymd(y: number, m: number, d: number): string | null {
	if (m < 1 || m > 12 || d < 1) return null;
	const t = Date.UTC(y, m - 1, d);
	return new Date(t).getUTCMonth() === m - 1 ? fmt(t) : null;
}

const monthStart = (y: number, m: number) => fmt(Date.UTC(y, m - 1, 1));
const monthEnd = (y: number, m: number) => fmt(Date.UTC(y, m, 0));
const yearOf = (iso: string) => Number(iso.slice(0, 4));
const monthOf = (iso: string) => Number(iso.slice(5, 7));
const dayOf = (iso: string) => Number(iso.slice(8, 10));
/** 0 = Monday ... 6 = Sunday. */
const weekday = (iso: string) => (new Date(toTime(iso)).getUTCDay() + 6) % 7;

const MONTH_EN = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

// Vocabulary

/**
 * "ago" and "set" are left out on purpose: "3 days ago" and the English verb
 * would read as August and September.
 */
const MONTHS: Record<string, number> = {
	enero: 1,
	january: 1,
	ene: 1,
	jan: 1,
	febrero: 2,
	february: 2,
	feb: 2,
	marzo: 3,
	march: 3,
	mar: 3,
	abril: 4,
	april: 4,
	abr: 4,
	apr: 4,
	mayo: 5,
	may: 5,
	junio: 6,
	june: 6,
	jun: 6,
	julio: 7,
	july: 7,
	jul: 7,
	agosto: 8,
	august: 8,
	aug: 8,
	septiembre: 9,
	setiembre: 9,
	september: 9,
	sept: 9,
	sep: 9,
	octubre: 10,
	october: 10,
	oct: 10,
	noviembre: 11,
	november: 11,
	nov: 11,
	diciembre: 12,
	december: 12,
	dic: 12,
	dec: 12,
};
const month = (word: string | undefined) => MONTHS[word ?? ""] ?? 0;
const byLength = (words: string[]) =>
	[...words].sort((a, b) => b.length - a.length).join("|");
const MONTH_ANY = `(${byLength(Object.keys(MONTHS))})\\.?`;
/** Standing alone, only full names count: "mar" is the sea and "jun" is noise. */
const ABBREVIATIONS = new Set([
	"ene",
	"jan",
	"feb",
	"mar",
	"abr",
	"apr",
	"jun",
	"jul",
	"aug",
	"sept",
	"sep",
	"oct",
	"nov",
	"dic",
	"dec",
]);
const MONTH_FULL = `(${byLength(Object.keys(MONTHS).filter((w) => !ABBREVIATIONS.has(w)))})`;

const SMALL_NUMBERS: Record<string, number> = {
	un: 1,
	uno: 1,
	una: 1,
	dos: 2,
	tres: 3,
	cuatro: 4,
	cinco: 5,
	seis: 6,
	siete: 7,
	ocho: 8,
	nueve: 9,
	diez: 10,
	a: 1,
	an: 1,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
};
const SMALL = `(\\d{1,3}|${byLength(Object.keys(SMALL_NUMBERS).filter((w) => w !== "a" && w !== "an"))})`;
const small = (s: string | undefined) =>
	SMALL_NUMBERS[s ?? ""] ?? Number(s ?? 0);

/**
 * Currency codes that also count in lowercase beside a number ("300 mxn"):
 * the common ones that are no everyday word, so "a cad" or "top 10" never read
 * as one.
 */
const LOWERCASE_CODES = [
	"usd",
	"eur",
	"gbp",
	"mxn",
	"dop",
	"jpy",
	"cny",
	"aud",
	"chf",
	"clp",
	"brl",
	"ars",
];
const CURRENCY_WORDS = "pesos|peso|dolares|dolar|dollars|dollar|euros|euro";

const WEEKDAYS: Record<string, number> = {
	lunes: 0,
	martes: 1,
	miercoles: 2,
	jueves: 3,
	viernes: 4,
	sabado: 5,
	domingo: 6,
	monday: 0,
	tuesday: 1,
	wednesday: 2,
	thursday: 3,
	friday: 4,
	saturday: 5,
	sunday: 6,
};

const WEEKDAY_ANY = `(${Object.keys(WEEKDAYS).join("|")})`;

const ORDINAL_QUARTER: Record<string, number> = {
	primer: 1,
	primero: 1,
	"1er": 1,
	segundo: 2,
	"2do": 2,
	tercer: 3,
	tercero: 3,
	"3er": 3,
	cuarto: 4,
	"4to": 4,
	first: 1,
	"1st": 1,
	second: 2,
	"2nd": 2,
	third: 3,
	"3rd": 3,
	fourth: 4,
	"4th": 4,
};

/** An optional year after a date: "2025", "de 2025", "del año pasado", "last year". */
const YEAR =
	"(?:,?\\s*(?:de\\s+|del\\s+|of\\s+)?(\\d{4}|(?:el\\s+)?ano\\s+pasado|este\\s+ano|last\\s+year|this\\s+year))?";

function resolveYear(raw: string | undefined, today: string): number | null {
	if (!raw) return null;
	if (/^\d{4}$/.test(raw)) return Number(raw);
	return /pasado|last/.test(raw) ? yearOf(today) - 1 : yearOf(today);
}

// Date rules

type Hit = { from: string; to: string; note?: string; ambiguous?: boolean };

type DateRule = {
	re: RegExp;
	/** Returns the readings of one match, or null to reject it. */
	read: (m: RegExpExecArray, today: string, reads: Reads) => Hit[] | null;
	/** Soft spans stay available to the amount rules ("2025" can be a year or a number). */
	soft?: boolean;
	/** Offset into the match where the span starts, for a leading word kept out of the span. */
	lead?: (m: RegExpExecArray) => number;
};

/**
 * A day with no year: reading the past, the latest one not after today;
 * reading the future, the first one not before today.
 */
function undatedDay(
	m: number,
	d: number,
	today: string,
	reads: Reads,
): string | null {
	const y = yearOf(today);
	const thisYear = ymd(y, m, d);
	if (reads === "past") {
		return thisYear && thisYear <= today ? thisYear : ymd(y - 1, m, d);
	}
	return thisYear && thisYear >= today ? thisYear : ymd(y + 1, m, d);
}

/** A day of the month alone, "el día 28": the nearest one that way, today included. */
function undatedDayOfMonth(
	d: number,
	today: string,
	reads: Reads,
): string | null {
	if (d < 1 || d > 31) return null;
	const step = reads === "past" ? -1 : 1;
	let y = yearOf(today);
	let m = monthOf(today);
	for (let i = 0; i < 12; i++) {
		const iso = ymd(y, m, d);
		if (iso && (reads === "past" ? iso <= today : iso >= today)) return iso;
		m += step;
		if (m < 1 || m > 12) {
			m = m < 1 ? 12 : 1;
			y += step;
		}
	}
	return null;
}

const monthRange = (y: number, m: number): Hit => ({
	from: monthStart(y, m),
	to: monthEnd(y, m),
});

/** A month with no year: reading the past, the latest one begun; reading the future, the first one not over. */
function undatedMonth(m: number, today: string, reads: Reads): Hit {
	const y = yearOf(today);
	if (reads === "past") {
		return monthRange(monthStart(y, m) <= today ? y : y - 1, m);
	}
	return monthRange(monthEnd(y, m) >= today ? y : y + 1, m);
}

const quarterRange = (y: number, q: number): Hit => ({
	from: monthStart(y, q * 3 - 2),
	to: monthEnd(y, q * 3),
});

function point(iso: string | null, note?: string): Hit[] | null {
	return iso ? [{ from: iso, to: iso, ...(note && { note }) }] : null;
}

/** "03/04" read both ways when both are valid and differ. */
function numericReadings(
	a: number,
	b: number,
	y: number | null,
	today: string,
	reads: Reads,
): Hit[] | null {
	const dm = y === null ? undatedDay(b, a, today, reads) : ymd(y, b, a);
	const md = y === null ? undatedDay(a, b, today, reads) : ymd(y, a, b);
	if (dm && md && dm !== md) {
		return [
			{ from: dm, to: dm, note: "reading the numbers as day/month" },
			{ from: md, to: md, note: "reading the numbers as month/day" },
		];
	}
	return point(dm ?? md);
}

function dayRange(
	d1: number,
	d2: number,
	m: number,
	y: number | null,
	today: string,
	reads: Reads,
): Hit[] | null {
	const ty = yearOf(today);
	const year =
		y ??
		(reads === "past"
			? (ymd(ty, m, d1) ?? "") <= today
				? ty
				: ty - 1
			: (ymd(ty, m, d2) ?? "") >= today
				? ty
				: ty + 1);
	const from = ymd(year, m, d1);
	const to = ymd(year, m, d2);
	if (!from || !to || from > to) return null;
	return [{ from, to }];
}

function dayMonth(
	d: number,
	m: number,
	y: number | null,
	today: string,
	reads: Reads,
): Hit[] | null {
	return point(y === null ? undatedDay(m, d, today, reads) : ymd(y, m, d));
}

/**
 * "next Friday" and "last Friday": the closest one that way, or that weekday
 * in the week after or before this one, weeks starting on Monday (ADR 0008).
 * When both are the same day the words say which; when they differ nothing
 * in the words chooses, so both readings are ambiguous.
 */
function eitherWeek(
	closest: string,
	today: string,
	step: 7 | -7,
	word: string,
): Hit[] {
	const inWeek = addDays(today, -weekday(today) + step + weekday(closest));
	const way = step > 0 ? "after" : "before";
	const inTheWeek = `reading '${word}' as that weekday in the week ${way} this one`;
	if (inWeek === closest)
		return [{ from: closest, to: closest, note: inTheWeek }];
	return [
		{
			from: closest,
			to: closest,
			note: `reading '${word}' as the closest one ${way} today`,
			ambiguous: true,
		},
		{ from: inWeek, to: inWeek, note: inTheWeek, ambiguous: true },
	];
}

const unitIsMonths = (unit: string) => /^(mes|meses|months?)$/.test(unit);
const unitIsWeeks = (unit: string) => /^(semanas?|weeks?)$/.test(unit);

const b = "(?<![a-z0-9])";
const e = "(?![a-z0-9])";

const DATE_RULES: DateRule[] = [
	{
		// ISO
		re: new RegExp(`${b}(\\d{4})-(\\d{1,2})-(\\d{1,2})${e}`, "g"),
		read: (m) => point(ymd(Number(m[1]), Number(m[2]), Number(m[3]))),
	},
	{
		// Numeric with a year
		re: new RegExp(
			`${b}(\\d{1,2})([/.-])(\\d{1,2})\\2(\\d{4}|\\d{2})${e}`,
			"g",
		),
		read: (m, today, reads) => {
			const raw = m[4] ?? "";
			const y = raw.length === 2 ? 2000 + Number(raw) : Number(raw);
			return numericReadings(Number(m[1]), Number(m[3]), y, today, reads);
		},
	},
	{
		// Numeric without a year
		re: new RegExp(`${b}(\\d{1,2})/(\\d{1,2})${e}(?!/)`, "g"),
		read: (m, today, reads) =>
			numericReadings(Number(m[1]), Number(m[2]), null, today, reads),
	},
	{
		// A day range in one month, Spanish
		re: new RegExp(
			`${b}(?:del?\\s+|entre\\s+el\\s+)?(\\d{1,2})\\s*(?:al|a|-|y\\s+el|hasta\\s+el)\\s*(\\d{1,2})\\s+de\\s+${MONTH_ANY}${YEAR}${e}`,
			"g",
		),
		read: (m, today, reads) =>
			dayRange(
				Number(m[1]),
				Number(m[2]),
				month(m[3]),
				resolveYear(m[4], today),
				today,
				reads,
			),
	},
	{
		// A day range in one month, English
		re: new RegExp(
			`${b}${MONTH_ANY}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to|through|until)\\s*(\\d{1,2})(?:st|nd|rd|th)?${YEAR}${e}`,
			"g",
		),
		read: (m, today, reads) =>
			dayRange(
				Number(m[2]),
				Number(m[3]),
				month(m[1]),
				resolveYear(m[4], today),
				today,
				reads,
			),
	},
	{
		// The last N days, weeks or months
		re: new RegExp(
			`${b}(?:(?:los|las)\\s+)?(?:ultim[oa]s|(?:the\\s+)?(?:last|past))\\s+${SMALL}\\s+(dias?|semanas?|mes(?:es)?|days?|weeks?|months?)${e}`,
			"g",
		),
		read: (m, today) => {
			const n = small(m[1]);
			if (!n) return null;
			const unit = m[2] ?? "";
			if (unitIsMonths(unit)) {
				const back = fmt(
					Date.UTC(yearOf(today), monthOf(today) - 1 - n, dayOf(today)),
				);
				return [
					{
						from: addDays(back, 1),
						to: today,
						note: `the last ${n} months up to today`,
					},
				];
			}
			const days = unitIsWeeks(unit) ? n * 7 : n;
			return [
				{
					from: addDays(today, -(days - 1)),
					to: today,
					note: `the last ${days} days, today included`,
				},
			];
		},
	},
	{
		// N days, weeks or months ago
		re: new RegExp(
			`${b}(?:hace\\s+${SMALL}\\s+(dias?|semanas?|mes(?:es)?)|${SMALL}\\s+(days?|weeks?|months?)\\s+ago)${e}`,
			"g",
		),
		read: (m, today) => {
			const n = small(m[1] ?? m[3]);
			const unit = m[2] ?? m[4] ?? "";
			if (unitIsMonths(unit)) {
				return point(
					fmt(Date.UTC(yearOf(today), monthOf(today) - 1 - n, dayOf(today))),
				);
			}
			return point(addDays(today, -(unitIsWeeks(unit) ? n * 7 : n)));
		},
	},
	{
		// Day and month, Spanish
		re: new RegExp(`${b}(\\d{1,2})\\s+(?:de\\s+)?${MONTH_ANY}${YEAR}${e}`, "g"),
		read: (m, today, reads) =>
			dayMonth(
				Number(m[1]),
				month(m[2]),
				resolveYear(m[3], today),
				today,
				reads,
			),
	},
	{
		// Day and month, English
		re: new RegExp(
			`${b}${MONTH_ANY}\\s+(\\d{1,2})(?:st|nd|rd|th)?${YEAR}${e}`,
			"g",
		),
		read: (m, today, reads) =>
			dayMonth(
				Number(m[2]),
				month(m[1]),
				resolveYear(m[3], today),
				today,
				reads,
			),
	},
	{
		// Day of month, English
		re: new RegExp(
			`${b}(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+${MONTH_ANY}${YEAR}${e}`,
			"g",
		),
		read: (m, today, reads) =>
			dayMonth(
				Number(m[1]),
				month(m[2]),
				resolveYear(m[3], today),
				today,
				reads,
			),
	},
	{
		// A named quarter
		re: new RegExp(
			`${b}(?:q([1-4])|(${byLength(Object.keys(ORDINAL_QUARTER))})\\s+(?:trimestre|quarter))${YEAR}${e}`,
			"g",
		),
		read: (m, today, reads) => {
			const q = m[1] ? Number(m[1]) : (ORDINAL_QUARTER[m[2] ?? ""] ?? 1);
			const y = resolveYear(m[3], today);
			if (y !== null) return [quarterRange(y, q)];
			const hit = quarterRange(yearOf(today), q);
			if (reads === "past") {
				return [hit.from <= today ? hit : quarterRange(yearOf(today) - 1, q)];
			}
			return [hit.to >= today ? hit : quarterRange(yearOf(today) + 1, q)];
		},
	},
	{
		// This or last quarter
		re: new RegExp(
			`${b}(?:(este|el\\s+pasado|el\\s+ultimo)\\s+trimestre|(?:el\\s+)?trimestre\\s+(pasado|anterior|actual)|(this|last|previous|current)\\s+quarter)${e}`,
			"g",
		),
		read: (m, today) => {
			const word = m[1] ?? m[2] ?? m[3] ?? "";
			const y = yearOf(today);
			const current = Math.ceil(monthOf(today) / 3);
			if (/este|actual|this|current/.test(word)) {
				return [
					{
						...quarterRange(y, current),
						note: `Q${current} ${y}, the quarter we are in`,
					},
				];
			}
			const q = current === 1 ? 4 : current - 1;
			const qy = current === 1 ? y - 1 : y;
			return [
				{
					...quarterRange(qy, q),
					note: `Q${q} ${qy}, the quarter before this one`,
				},
			];
		},
	},
	{
		// A month, with or without a year
		re: new RegExp(
			`${b}(?:(en|in|de|del|of|during|since|desde|hasta|until|before|after|through)\\s+)?${MONTH_FULL}${YEAR}${e}`,
			"g",
		),
		read: (m, today, reads) => {
			// "may" is a month only after a preposition or with a year: "you may see" is not May.
			if (m[2] === "may" && !m[1] && !m[3]) return null;
			const y = resolveYear(m[3], today);
			return [
				y === null
					? undatedMonth(month(m[2]), today, reads)
					: monthRange(y, month(m[2])),
			];
		},
		lead: (m) => (m[1] ? m[0].indexOf(m[2] ?? "", m[1].length) : 0),
	},
	{
		// A weekday of the week before or after this one: "Friday next week", "el viernes de la semana pasada".
		re: new RegExp(
			`${b}${WEEKDAY_ANY}\\s+(?:de\\s+la\\s+|of\\s+)?(semana\\s+que\\s+viene|proxima\\s+semana|semana\\s+proxima|next\\s+week|semana\\s+pasada|last\\s+week)${e}`,
			"g",
		),
		read: (m, today) => {
			const later = /viene|proxima|next/.test(m[2] ?? "");
			const monday = addDays(today, -weekday(today) + (later ? 7 : -7));
			return point(
				addDays(monday, WEEKDAYS[m[1] ?? ""] ?? 0),
				`that weekday in the week ${later ? "after" : "before"} this one`,
			);
		},
	},
	{
		// "next Friday", "el próximo viernes", "el viernes que viene".
		re: new RegExp(
			`${b}(?:(?:next|proxim[oa])\\s+${WEEKDAY_ANY}|${WEEKDAY_ANY}\\s+(?:que\\s+viene|proxim[oa]))${e}`,
			"g",
		),
		read: (m, today) => {
			const w = WEEKDAYS[m[1] ?? m[2] ?? ""] ?? 0;
			const ahead = (w - weekday(today) + 7) % 7 || 7;
			return eitherWeek(addDays(today, ahead), today, 7, "next");
		},
	},
	{
		// "this coming Friday": the first one after today, whichever way the field reads.
		re: new RegExp(
			`${b}(?:(?:this|the)\\s+)?coming\\s+${WEEKDAY_ANY}${e}`,
			"g",
		),
		read: (m, today) => {
			const w = WEEKDAYS[m[1] ?? ""] ?? 0;
			const ahead = (w - weekday(today) + 7) % 7 || 7;
			return point(addDays(today, ahead), "the first one after today");
		},
	},
	{
		// "last Friday", "el viernes pasado", "el pasado viernes".
		re: new RegExp(
			`${b}(?:(?:last|past|pasad[oa])\\s+${WEEKDAY_ANY}|${WEEKDAY_ANY}\\s+pasad[oa])${e}`,
			"g",
		),
		read: (m, today) => {
			const w = WEEKDAYS[m[1] ?? m[2] ?? ""] ?? 0;
			const back = (weekday(today) - w + 7) % 7 || 7;
			return eitherWeek(addDays(today, -back), today, -7, "last");
		},
	},
	{
		// This, last or next week
		re: new RegExp(
			`${b}(?:(esta|la\\s+pasada|la\\s+proxima)\\s+semana|(?:la\\s+)?semana\\s+(pasada|anterior|actual|que\\s+viene|proxima)|(this|last|previous|next|current)\\s+week)${e}`,
			"g",
		),
		read: (m, today) => {
			const word = m[1] ?? m[2] ?? m[3] ?? "";
			const monday = addDays(today, -weekday(today));
			const shift = /pasada|anterior|last|previous/.test(word)
				? -7
				: /proxima|viene|next/.test(word)
					? 7
					: 0;
			const from = addDays(monday, shift);
			const label =
				shift < 0
					? "the week before this one"
					: shift > 0
						? "the week after this one"
						: "this week";
			return [
				{ from, to: addDays(from, 6), note: `${label}, Monday to Sunday` },
			];
		},
	},
	{
		// This or last month
		re: new RegExp(
			`${b}(?:(este)\\s+mes|(?:el\\s+)?mes\\s+(pasado|anterior|actual)|(this|last|previous|current)\\s+month)${e}`,
			"g",
		),
		read: (m, today) => {
			const word = m[1] ?? m[2] ?? m[3] ?? "";
			const y = yearOf(today);
			const mo = monthOf(today);
			if (/este|actual|this|current/.test(word)) {
				return [
					{
						...monthRange(y, mo),
						note: `${MONTH_EN[mo - 1]} ${y}, this month`,
					},
				];
			}
			const py = mo === 1 ? y - 1 : y;
			const pm = mo === 1 ? 12 : mo - 1;
			return [
				{
					...monthRange(py, pm),
					note: `${MONTH_EN[pm - 1]} ${py}, last month`,
				},
			];
		},
	},
	{
		// This or last year
		re: new RegExp(
			`${b}(?:(este)\\s+ano|(?:el\\s+)?ano\\s+(pasado|anterior|actual)|(this|last|previous|current)\\s+year)${e}`,
			"g",
		),
		read: (m, today) => {
			const word = m[1] ?? m[2] ?? m[3] ?? "";
			const y = yearOf(today);
			const year = /este|actual|this|current/.test(word) ? y : y - 1;
			return [
				{
					from: `${year}-01-01`,
					to: `${year}-12-31`,
					note: `the year ${year}`,
				},
			];
		},
	},
	{
		// The day before yesterday
		re: new RegExp(
			`${b}(?:anteayer|antier|antes\\s+de\\s+ayer|(?:the\\s+)?day\\s+before\\s+yesterday)${e}`,
			"g",
		),
		read: (_m, today) => point(addDays(today, -2)),
	},
	{
		re: new RegExp(
			`${b}(?:pasado\\s+manana|(?:the\\s+)?day\\s+after\\s+tomorrow)${e}`,
			"g",
		),
		read: (_m, today) => point(addDays(today, 2)),
	},
	{
		// "de la mañana", "esta mañana", "por la mañana" are a time of day, not tomorrow.
		re: new RegExp(
			`${b}(?<!(?:la|esta|por|en)\\s+)(?:manana|tomorrow)${e}`,
			"g",
		),
		read: (_m, today) => point(addDays(today, 1)),
	},
	{
		// In N days or weeks
		re: new RegExp(
			`${b}(?:(?:en|dentro\\s+de)\\s+${SMALL}\\s+(dias?|semanas?)|in\\s+${SMALL}\\s+(days?|weeks?))${e}`,
			"g",
		),
		read: (m, today) => {
			const n = small(m[1] ?? m[3]);
			if (!n) return null;
			const days = unitIsWeeks(m[2] ?? m[4] ?? "") ? n * 7 : n;
			return point(addDays(today, days), `today plus ${days} days`);
		},
	},
	{
		// A part of the day is that day: a date field holds a day, never hours.
		re: new RegExp(
			`${b}(?:this\\s+(?:morning|afternoon|evening)|tonight|esta\\s+(?:manana|tarde|noche))${e}`,
			"g",
		),
		read: (_m, today) => point(today),
	},
	{
		// Last night (as Duckling and Recognizers-Text read it) and last evening are yesterday, whatever the hour.
		re: new RegExp(`${b}(?:last\\s+(?:night|evening)|anoche)${e}`, "g"),
		read: (_m, today) => point(addDays(today, -1)),
	},
	{
		re: new RegExp(`${b}(?:hoy|today)${e}`, "g"),
		read: (_m, today) => point(today),
	},
	{
		re: new RegExp(`${b}(?:ayer|yesterday)${e}`, "g"),
		read: (_m, today) => point(addDays(today, -1)),
	},
	{
		// A weekday: the nearest one that way, never today, so on a Monday "el lunes" is a week away.
		re: new RegExp(`${b}${WEEKDAY_ANY}${e}`, "g"),
		read: (m, today, reads) => {
			const w = WEEKDAYS[m[1] ?? ""] ?? 0;
			if (reads === "past") {
				const back = (weekday(today) - w + 7) % 7 || 7;
				return point(addDays(today, -back), "the most recent one before today");
			}
			const ahead = (w - weekday(today) + 7) % 7 || 7;
			return point(addDays(today, ahead), "the first one after today");
		},
	},
	{
		// A day of the month alone: "el día 28", "on the 3rd", "el 28 a las 3". Not "the 3rd largest".
		re: new RegExp(
			`${b}(?:(?:el\\s+)?dia\\s+(\\d{1,2})|(?:el|the|on\\s+the)\\s+(\\d{1,2})(?:st|nd|rd|th)?)${e}(?=\\s*(?:$|[,.;:!?)]|a\\s+las?\\s|at\\s|@))`,
			"g",
		),
		read: (m, today, reads) =>
			point(
				undatedDayOfMonth(Number(m[1] ?? m[2]), today, reads),
				`the ${reads === "past" ? "latest such day up to" : "first such day from"} today`,
			),
	},
	{
		// A year alone, unless a currency touches it: "$2025" and "2025 dólares" are money.
		re: new RegExp(
			`${b}(?<![$€£¥]\\s*)((?:19|20)\\d{2})${e}(?![.,]\\d|\\s*(?:${CURRENCY_WORDS}|${LOWERCASE_CODES.join("|")})(?![a-z]))`,
			"g",
		),
		read: (m) => [
			{
				from: `${m[1]}-01-01`,
				to: `${m[1]}-12-31`,
				note: `the whole year ${m[1]}`,
			},
		],
		soft: true,
	},
];

/**
 * "before X" and "after X" leave X out, so a filter's bound is the day next
 * to it: "after May 5" starts on May 6, "antes de mayo" ends on April 30.
 * "since", "until", "desde" and "hasta" keep X, and stay the period itself.
 */
const BOUND =
	/(?<![a-z0-9])(before|after|antes\s+del?|despues\s+del?|luego\s+del?)\s+$/;

function beyond(
	hit: Hit,
	bound: RegExpExecArray,
	said: string,
	typed: string,
): Hit {
	const after = /^(after|despues|luego)/.test(bound[1] ?? "");
	const day = after ? addDays(hit.to, 1) : addDays(hit.from, -1);
	const word = typed.trim().replace(/\s+/g, " ");
	return {
		from: day,
		to: day,
		note: `the ${after ? "first day after" : "last day before"} ${said}, which '${word}' leaves out${hit.note ? `; ${said} read as ${hit.note}` : ""}`,
		...(hit.ambiguous && { ambiguous: true }),
	};
}

// Amount rules

/** "RD$", "US$", "£", or a code: a mark touching the number, letters before a "$" included. */
const PRE_MARK = `(us\\$|[a-z]{1,2}\\$|${LOWERCASE_CODES.join("|")}|\\$|€|£|¥)?\\s*`;
/**
 * Thousands with spaces ("1 234,56"), with commas ("1,500.50") or with dots
 * ("1.500,50"), or a plain number with an optional decimal part. A single
 * separator followed by exactly three digits is always thousands: nobody
 * types a money amount to three decimals.
 */
const NUMBER =
	"(\\d{1,3}(?:[ \\u00a0]\\d{3})+(?:[.,]\\d{1,2})?(?!\\d)|\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)";
/** "m" and "mm" are millions only beside a currency: "5m" alone may be minutes or meters. */
const MULTIPLIER =
	"(?:\\s*(k|mil|millones|millon|millions|million|thousand|mm|m)(?![a-z]))?";
const POST_MARK = `(?:\\s*(${CURRENCY_WORDS}|${LOWERCASE_CODES.join("|")}|us\\$|€)(?![a-z]))?`;
const MILLIONS_MARK = new Set(["m", "mm"]);
const DIGIT_AMOUNT = new RegExp(
	`${b}${PRE_MARK}${NUMBER}${MULTIPLIER}${POST_MARK}`,
	"g",
);

/** What a number word does: adds itself, multiplies what came before, or starts a group of thousands or millions. */
type NumberWord =
	| { kind: "unit" | "teen" | "tens" | "hundreds"; value: number }
	| { kind: "hundred" | "thousand" | "million" | "article" };

const NUMBER_WORDS: Record<string, NumberWord> = {};
const words = (kind: "unit" | "teen" | "tens" | "hundreds", list: string) => {
	for (const pair of list.split(" ")) {
		const [word = "", value] = pair.split("=");
		NUMBER_WORDS[word] = { kind, value: Number(value) };
	}
};
words(
	"unit",
	"un=1 uno=1 una=1 dos=2 tres=3 cuatro=4 cinco=5 seis=6 siete=7 ocho=8 nueve=9 one=1 two=2 three=3 four=4 five=5 six=6 seven=7 eight=8 nine=9",
);
words(
	"teen",
	"diez=10 once=11 doce=12 trece=13 catorce=14 quince=15 dieciseis=16 diecisiete=17 dieciocho=18 diecinueve=19 veintiun=21 veintiuno=21 veintiuna=21 veintidos=22 veintitres=23 veinticuatro=24 veinticinco=25 veintiseis=26 veintisiete=27 veintiocho=28 veintinueve=29 ten=10 eleven=11 twelve=12 thirteen=13 fourteen=14 fifteen=15 sixteen=16 seventeen=17 eighteen=18 nineteen=19",
);
words(
	"tens",
	"veinte=20 treinta=30 cuarenta=40 cincuenta=50 sesenta=60 setenta=70 ochenta=80 noventa=90 twenty=20 thirty=30 forty=40 fifty=50 sixty=60 seventy=70 eighty=80 ninety=90",
);
words(
	"hundreds",
	"cien=100 ciento=100 doscientos=200 doscientas=200 trescientos=300 trescientas=300 cuatrocientos=400 cuatrocientas=400 quinientos=500 quinientas=500 seiscientos=600 seiscientas=600 setecientos=700 setecientas=700 ochocientos=800 ochocientas=800 novecientos=900 novecientas=900",
);
for (const word of ["hundred", "hundreds"])
	NUMBER_WORDS[word] = { kind: "hundred" };
for (const word of ["mil", "thousand", "thousands"])
	NUMBER_WORDS[word] = { kind: "thousand" };
for (const word of ["millon", "millones", "million", "millions"])
	NUMBER_WORDS[word] = { kind: "million" };
for (const word of ["a", "an"]) NUMBER_WORDS[word] = { kind: "article" };

type Words = { value: number; start: number; end: number; multiplied: boolean };

/**
 * The longest number written in words from the token at `first`: "twenty-five",
 * "two hundred and fifty", "doscientos noventa y nueve", "mil quinientos". It
 * stops before the first word that cannot follow, so "once twenty" is 11.
 */
function readWords(
	folded: string,
	tokens: RegExpExecArray[],
	first: number,
): Words | null {
	let total = 0;
	let group = 0;
	let multiplied = false;
	let last = -1;
	for (let j = first; j < tokens.length; j++) {
		const token = tokens[j] as RegExpExecArray;
		if (j > first) {
			const previous = tokens[j - 1] as RegExpExecArray;
			const gap = folded.slice(
				previous.index + previous[0].length,
				token.index,
			);
			if (!/^[\s-]+$/.test(gap)) break;
		}
		const word = token[0];
		if ((word === "y" || word === "and") && last === j - 1 && last >= first) {
			continue;
		}
		const number = NUMBER_WORDS[word];
		if (!number) break;
		const unitsOpen =
			group % 10 === 0 && (group % 100 === 0 || group % 100 >= 20);
		if (number.kind === "article") {
			// "a thousand", never the Spanish "a" in "de 500 a mil".
			const next = tokens[j + 1]?.[0] ?? "";
			if (j !== first || !/^(?:hundred|thousand|million)$/.test(next)) break;
			group = 1;
		} else if (number.kind === "unit") {
			if (!unitsOpen) break;
			group += number.value;
		} else if (number.kind === "teen" || number.kind === "tens") {
			if (group % 100 !== 0) break;
			group += number.value;
		} else if (number.kind === "hundreds") {
			if (group !== 0) break;
			group = number.value;
		} else if (number.kind === "hundred") {
			if (group >= 100) break;
			group = (group || 1) * 100;
		} else if (number.kind === "thousand") {
			if (total % 1e6 !== 0 || group >= 1000) break;
			total += (group || 1) * 1e3;
			group = 0;
			multiplied = true;
		} else {
			if (total !== 0) break;
			total = (group || 1) * 1e6;
			group = 0;
			multiplied = true;
		}
		last = j;
	}
	if (last < first) return null;
	const end = tokens[last] as RegExpExecArray;
	return {
		value: total + group,
		start: (tokens[first] as RegExpExecArray).index,
		end: end.index + end[0].length,
		multiplied,
	};
}

/** A currency word right after a number written in words: "pesos", "de pesos", "dólares". */
const WORDS_CURRENCY = new RegExp(
	`^\\s+(?:de\\s+)?(${CURRENCY_WORDS}|${LOWERCASE_CODES.join("|")})${e}`,
);

/**
 * Cents said after a currency word: "con cincuenta", "con 50", "and fifty
 * cents", "y 50 centavos". After "and" or "y" the cents word must be said, so
 * "10 dollars and 5 coffees" is not 10.05.
 */
function centsAfter(
	folded: string,
	at: number,
	tokens: RegExpExecArray[],
): { cents: number; end: number } | null {
	const lead = /^\s+(con|and|y)\s+/.exec(folded.slice(at));
	if (!lead) return null;
	const from = at + lead[0].length;
	let cents: number;
	let end: number;
	const digits = /^\d{1,2}(?![\d.,])/.exec(folded.slice(from));
	if (digits) {
		cents = Number(digits[0]);
		end = from + digits[0].length;
	} else {
		const first = tokens.findIndex((token) => token.index === from);
		const said = first < 0 ? null : readWords(folded, tokens, first);
		if (!said || said.multiplied || said.value >= 100) return null;
		cents = said.value;
		end = said.end;
	}
	const unit = /^\s+(?:centavos?|centimos?|cents?)(?![a-z])/.exec(
		folded.slice(end),
	);
	if (unit) end += unit[0].length;
	else if (lead[1] !== "con") return null;
	return { cents: cents / 100, end };
}

const MULTIPLY: Record<string, number> = {
	k: 1e3,
	mil: 1e3,
	thousand: 1e3,
	m: 1e6,
	mm: 1e6,
	millon: 1e6,
	millones: 1e6,
	million: 1e6,
	millions: 1e6,
};

function parseNumber(spaced: string): number {
	const raw = spaced.replace(/[ \u00a0]/g, "");
	if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) {
		return Number(raw.replace(/,/g, ""));
	}
	if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) {
		return Number(raw.replace(/\./g, "").replace(",", "."));
	}
	return Number(raw.replace(",", "."));
}

// Currencies

const CODES = new Set(Intl.supportedValuesOf("currency"));

/**
 * A currency code next to a number counts only in capitals ("500 MXN"), so
 * everyday words such as "top" or "all" never read as one.
 */
const isCode = (word: string) => /^[A-Z]{3}$/.test(word) && CODES.has(word);

const symbolOf = (code: string) =>
	new Intl.NumberFormat("en", {
		style: "currency",
		currency: code,
		currencyDisplay: "narrowSymbol",
	})
		.formatToParts(0)
		.find((part) => part.type === "currency")?.value;

const nameOf = (code: string, locale: string) =>
	fold(new Intl.DisplayNames(locale, { type: "currency" }).of(code) ?? "");

function localCurrency(facts: Facts): string | undefined {
	const code = facts.local_currency;
	if (code === undefined) return undefined;
	if (!isCode(code)) {
		throw new TypeError(
			`justask: the local_currency fact must be an ISO 4217 code such as "USD", not "${code}"`,
		);
	}
	return code;
}

/**
 * The currencies a mark other than a bare "$" can name: the local one when it
 * is among them, the only one when there is one, else the request does not
 * say which. "C$" is a Canadian dollar or a córdoba, "¥" a yen or a yuan.
 */
const MARKS: Record<string, string[]> = {
	"€": ["EUR"],
	"£": ["GBP"],
	"¥": ["JPY", "CNY"],
	us$: ["USD"],
	rd$: ["DOP"],
	a$: ["AUD"],
	au$: ["AUD"],
	ca$: ["CAD"],
	c$: ["CAD", "NIO"],
	mx$: ["MXN"],
	nz$: ["NZD"],
	hk$: ["HKD"],
	r$: ["BRL"],
};

/**
 * The currency a mark names. A bare "$" and "pesos" name the local currency
 * when it is written that way; otherwise the request does not say which.
 * "dollars" with no local dollar means US dollars.
 */
function currencyOf(
	mark: string | null,
	local: string | undefined,
): string | null {
	if (mark === null) return null;
	if (isCode(mark)) return mark;
	const m = fold(mark);
	if (LOWERCASE_CODES.includes(m)) return m.toUpperCase();
	if (m.startsWith("eur")) return "EUR";
	const named = MARKS[m];
	if (named) {
		if (local && named.includes(local)) return local;
		return named.length === 1 ? (named[0] ?? null) : null;
	}
	if (m === "$") return local && symbolOf(local) === "$" ? local : null;
	if (m.startsWith("peso")) {
		return local && nameOf(local, "es").includes("peso") ? local : null;
	}
	if (m.startsWith("dolar") || m.startsWith("dollar")) {
		return local && nameOf(local, "en").includes("dollar") ? local : "USD";
	}
	return null;
}

// Time rules

type TimeHit = { time: string; note: string; ambiguous?: boolean };

type TimeRule = {
	re: RegExp;
	/** Returns the readings of one match, or null to reject it. */
	read: (m: RegExpExecArray) => TimeHit[] | null;
};

const HOURS: Record<string, number> = {
	una: 1,
	dos: 2,
	tres: 3,
	cuatro: 4,
	cinco: 5,
	seis: 6,
	siete: 7,
	ocho: 8,
	nueve: 9,
	diez: 10,
	once: 11,
	doce: 12,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
};
const HOUR = `(\\d{1,2}|${byLength(Object.keys(HOURS))})`;
/** ":30", " y media", " y cuarto", " y 15", " menos cuarto", " and a half", " y pico" (no minute said), "h". */
const MINUTES =
	"(?::(\\d{2})|\\s+y\\s+(media|cuarto|pico|algo|\\d{1,2})|\\s+(menos\\s+cuarto)|\\s+and\\s+a\\s+half|\\s*(?:h|hrs?)(?![a-z]))?";
const MERIDIEM =
	"(?:\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)(?![a-z])|\\s+(?:de\\s+la|en\\s+la|por\\s+la|in\\s+the)\\s+(manana|tarde|noche|morning|afternoon|evening|night)|\\s+at\\s+night)?";
/** Not money, a share, an ordinal or a day of a month: "at 4.50", "at 5 dollars", "a las 3 de mayo". */
const NOT_A_TIME = `(?![.,]\\d|\\s*(?:${CURRENCY_WORDS}|usd|eur|us\\$|€|%|k(?![a-z])|mil(?![a-z])|st|nd|rd|th|(?:de\\s+|of\\s+)?${MONTH_ANY}(?![a-z])))`;

const hhmm = (h: number, min: number) =>
	`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;

/**
 * An hour with no morning or evening said reads both ways, for the provider
 * to pick from the words around it. An hour with no minute said ("y pico")
 * is marked ambiguous: no word in the request decides it.
 */
function clock(
	h: number,
	min: number,
	meridiem: "am" | "pm" | null,
	approximate: boolean,
): TimeHit[] | null {
	if (h > 23 || min > 59) return null;
	const hit = (time: string, note: string): TimeHit =>
		approximate
			? {
					time,
					note: `${note}, some minutes after it, the exact minute not said`,
					ambiguous: true,
				}
			: { time, note };
	if (h > 12 || h === 0) return [hit(hhmm(h, min), "24-hour clock")];
	if (meridiem === "am") return [hit(hhmm(h % 12, min), "morning, as said")];
	if (meridiem === "pm") {
		return [hit(hhmm((h % 12) + 12, min), "afternoon or evening, as said")];
	}
	if (h === 12) return [hit(hhmm(12, min), "noon")];
	return [
		hit(hhmm(h, min), "reading the hour as morning"),
		hit(hhmm(h + 12, min), "reading the hour as afternoon or evening"),
	];
}

/** Groups from `offset`: hour, minutes, words after, "menos cuarto", am/pm, part of the day. */
function readClock(m: RegExpExecArray, offset: number): TimeHit[] | null {
	const raw = m[offset] ?? "";
	let h = /^\d+$/.test(raw) ? Number(raw) : HOURS[raw];
	if (h === undefined) return null;
	let min = m[offset + 1] ? Number(m[offset + 1]) : 0;
	const after = m[offset + 2];
	const approximate = after === "pico" || after === "algo";
	if (after === "media" || /and\s+a\s+half/.test(m[0])) min = 30;
	else if (after === "cuarto") min = 15;
	else if (after && !approximate) min = Number(after);
	if (m[offset + 3]) {
		// "las 5 menos cuarto" is 4:45.
		h -= 1;
		min = 45;
	}
	const mark = (m[offset + 4] ?? "").replace(/[\s.]/g, "");
	const part = m[offset + 5] ?? "";
	const meridiem =
		mark === "am" || /manana|morning/.test(part)
			? "am"
			: mark === "pm" || part || /at\s+night/.test(m[0])
				? "pm"
				: null;
	return clock(h, min, meridiem, approximate);
}

const TIME_RULES: TimeRule[] = [
	{
		// "a las 4", "para las 4:30", "at 4pm", "@ 3", "a la una".
		re: new RegExp(
			`${b}(?:a\\s+las?|para\\s+las?|como\\s+a\\s+las?|tipo|at|around|@)\\s*${HOUR}${MINUTES}${MERIDIEM}${e}${NOT_A_TIME}`,
			"g",
		),
		read: (m) => readClock(m, 1),
	},
	{
		// "las 10 de la mañana", "la una y media": after "las" alone only with minutes or a part of the day, so "las 3 facturas" is a count.
		re: new RegExp(
			`${b}las?\\s+${HOUR}${MINUTES}${MERIDIEM}${e}${NOT_A_TIME}`,
			"g",
		),
		read: (m) =>
			m.slice(2).some((group) => group !== undefined) ? readClock(m, 1) : null,
	},
	{
		// "4pm", "9:30 a.m."
		re: new RegExp(
			`${b}(\\d{1,2})(?::(\\d{2}))?()()\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)(?![a-z])()`,
			"g",
		),
		read: (m) => readClock(m, 1),
	},
	{
		// "17:00", "3:30"
		re: new RegExp(`${b}(\\d{1,2}):(\\d{2})()()()()${e}${NOT_A_TIME}`, "g"),
		read: (m) => readClock(m, 1),
	},
	{
		re: new RegExp(`${b}(?:(?:al\\s+|a\\s+)?medio\\s*dia|noon)${e}`, "g"),
		read: () => [{ time: "12:00", note: "noon" }],
	},
	{
		re: new RegExp(`${b}(?:(?:a\\s+)?media\\s*noche|midnight)${e}`, "g"),
		read: () => [{ time: "00:00", note: "midnight" }],
	},
];

// The parser

/**
 * Reads times, then dates, then amounts, never twice over one span nor over a
 * claimed one. Times go first so "de la mañana" is never read as tomorrow.
 */
function readSpans(
	text: string,
	{ today, reads, facts }: ParserInput,
	claimed: readonly Span[],
): {
	dates: Placed<DateReading>[];
	times: Placed<TimeReading>[];
	amounts: Placed<AmountReading>[];
} {
	const local = localCurrency(facts);
	const folded = fold(text);
	const hard = new Array<boolean>(text.length).fill(false);
	const soft = new Array<boolean>(text.length).fill(false);
	for (const [s, t] of claimed) hard.fill(true, s, t);
	const free = (s: number, t: number, alsoSoft = false) => {
		for (let i = s; i < t; i++)
			if (hard[i] || (alsoSoft && soft[i])) return false;
		return true;
	};

	const times: Placed<TimeReading>[] = [];
	for (const rule of TIME_RULES) {
		rule.re.lastIndex = 0;
		for (let m = rule.re.exec(folded); m; m = rule.re.exec(folded)) {
			const s = m.index;
			const t = m.index + m[0].length;
			if (!free(s, t, true)) continue;
			const hits = rule.read(m);
			if (!hits) continue;
			hard.fill(true, s, t);
			for (const hit of hits) {
				times.push({ at: [s, t], reading: { text: text.slice(s, t), ...hit } });
			}
		}
	}

	const dates: Placed<DateReading>[] = [];
	for (const rule of DATE_RULES) {
		rule.re.lastIndex = 0;
		for (let m = rule.re.exec(folded); m; m = rule.re.exec(folded)) {
			let s = m.index + (rule.lead?.(m) ?? 0);
			const t = m.index + m[0].length;
			if (!free(s, t, true)) continue;
			let hits = rule.read(m, today, reads);
			if (!hits) continue;
			const bound = rule.soft ? null : BOUND.exec(folded.slice(0, s));
			if (bound && free(bound.index, s, true)) {
				hits = hits.map((hit) =>
					beyond(hit, bound, text.slice(s, t), text.slice(bound.index, s)),
				);
				s = bound.index;
			}
			(rule.soft ? soft : hard).fill(true, s, t);
			for (const hit of hits) {
				dates.push({ at: [s, t], reading: { text: text.slice(s, t), ...hit } });
			}
		}
	}

	const amounts: Placed<AmountReading>[] = [];
	const claim = (s: number, t: number, value: number, mark: string | null) => {
		if (!free(s, t) || !Number.isFinite(value)) return;
		hard.fill(true, s, t);
		const currency = currencyOf(mark, local);
		amounts.push({
			at: [s, t],
			reading: {
				text: text.slice(s, t),
				value: Math.round(value * 100) / 100,
				currency,
				// Without a local currency, a bare mark just leaves the currency out.
				...(mark !== null &&
					currency === null &&
					local && { unresolved: mark }),
			},
		});
	};
	const tokens = [...folded.matchAll(/[a-z]+/g)];
	DIGIT_AMOUNT.lastIndex = 0;
	for (let m = DIGIT_AMOUNT.exec(folded); m; m = DIGIT_AMOUNT.exec(folded)) {
		let s = m.index + (m[0].length - m[0].trimStart().length);
		let t = m.index + m[0].trimEnd().length;
		// A word after the number says more than a "$" before it: "$500 pesos".
		const written = m[4] ?? m[1];
		let mark: string | null = null;
		if (written) {
			const at = m[4]
				? folded.lastIndexOf(written, t)
				: folded.indexOf(written, s);
			mark = text.slice(at, at + written.length);
		} else {
			// A currency code in capitals just before or after the number.
			const before = /(?<![A-Za-z])([A-Za-z]{3})\s*$/.exec(text.slice(0, s));
			const after = /^\s*([A-Za-z]{3})(?![A-Za-z])/.exec(text.slice(t));
			if (before?.[1] && isCode(before[1])) {
				mark = before[1];
				s = before.index;
			} else if (after?.[1] && isCode(after[1])) {
				mark = after[1];
				t += after[0].length;
			}
		}
		if (MILLIONS_MARK.has(m[3] ?? "") && mark === null) continue;
		let value = parseNumber(m[2] ?? "") * (MULTIPLY[m[3] ?? ""] ?? 1);
		if (m[4] && new RegExp(`^(?:${CURRENCY_WORDS})$`).test(m[4])) {
			const said = centsAfter(folded, t, tokens);
			if (said) {
				value += said.cents;
				t = said.end;
			}
		}
		claim(s, t, value, mark);
	}
	// Numbers in words count with a currency after them or a multiplier in them: "dos" alone is not money.
	for (let i = 0; i < tokens.length; i++) {
		const said = readWords(folded, tokens, i);
		if (!said) continue;
		const currency = WORDS_CURRENCY.exec(folded.slice(said.end));
		if (!currency && !said.multiplied) continue;
		let { value, end } = said;
		let mark: string | null = null;
		if (currency) {
			end += currency[0].length;
			mark = text.slice(end - (currency[1] ?? "").length, end);
			const cents = centsAfter(folded, end, tokens);
			if (cents) {
				value += cents.cents;
				end = cents.end;
			}
		}
		claim(said.start, end, value, mark);
		while (i + 1 < tokens.length && (tokens[i + 1]?.index ?? 0) < end) i++;
	}

	const inOrder = <R>(placed: Placed<R>[]) =>
		placed.sort((x, y) => x.at[0] - y.at[0]);
	return {
		dates: inOrder(dates),
		times: inOrder(times),
		amounts: inOrder(amounts),
	};
}
