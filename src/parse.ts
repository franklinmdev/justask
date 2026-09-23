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
	amounts?: AmountReading[];
};

export type ParserInput = {
	/** Today in the person's time zone, YYYY-MM-DD. */
	today: string;
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
	const { dates, amounts } = readSpans(request, input, []);
	return {
		dates: dates.map(({ reading }) => reading),
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
): { dates: DateReading[]; amounts: AmountReading[] } {
	const claimed: Span[] = [];
	const dates: Placed<DateReading>[] = [];
	const amounts: Placed<AmountReading>[] = [];
	for (const parser of parsers) {
		const readings = parser(request, input);
		for (const reading of readings.dates ?? []) {
			dates.push({ at: place(request, reading.text, claimed), reading });
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

type Hit = { from: string; to: string; note?: string };

type DateRule = {
	re: RegExp;
	/** Returns the readings of one match, or null to reject it. */
	read: (m: RegExpExecArray, today: string) => Hit[] | null;
	/** Soft spans stay available to the amount rules ("2025" can be a year or a number). */
	soft?: boolean;
	/** Offset into the match where the span starts, for a leading word kept out of the span. */
	lead?: (m: RegExpExecArray) => number;
};

/** A day with no year: the latest one that is not in the future. A filter looks back. */
function latestDay(m: number, d: number, today: string): string | null {
	const y = yearOf(today);
	const thisYear = ymd(y, m, d);
	if (thisYear && thisYear <= today) return thisYear;
	return ymd(y - 1, m, d);
}

const monthRange = (y: number, m: number): Hit => ({
	from: monthStart(y, m),
	to: monthEnd(y, m),
});

function latestMonth(m: number, today: string): Hit {
	const y = yearOf(today);
	return monthRange(monthStart(y, m) <= today ? y : y - 1, m);
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
): Hit[] | null {
	const dm = y === null ? latestDay(b, a, today) : ymd(y, b, a);
	const md = y === null ? latestDay(a, b, today) : ymd(y, a, b);
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
): Hit[] | null {
	const ty = yearOf(today);
	const year = y ?? ((ymd(ty, m, d1) ?? "") <= today ? ty : ty - 1);
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
): Hit[] | null {
	return point(y === null ? latestDay(m, d, today) : ymd(y, m, d));
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
		read: (m, today) => {
			const raw = m[4] ?? "";
			const y = raw.length === 2 ? 2000 + Number(raw) : Number(raw);
			return numericReadings(Number(m[1]), Number(m[3]), y, today);
		},
	},
	{
		// Numeric without a year
		re: new RegExp(`${b}(\\d{1,2})/(\\d{1,2})${e}(?!/)`, "g"),
		read: (m, today) =>
			numericReadings(Number(m[1]), Number(m[2]), null, today),
	},
	{
		// A day range in one month, Spanish
		re: new RegExp(
			`${b}(?:del?\\s+|entre\\s+el\\s+)?(\\d{1,2})\\s*(?:al|a|-|y\\s+el|hasta\\s+el)\\s*(\\d{1,2})\\s+de\\s+${MONTH_ANY}${YEAR}${e}`,
			"g",
		),
		read: (m, today) =>
			dayRange(
				Number(m[1]),
				Number(m[2]),
				month(m[3]),
				resolveYear(m[4], today),
				today,
			),
	},
	{
		// A day range in one month, English
		re: new RegExp(
			`${b}${MONTH_ANY}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to|through|until)\\s*(\\d{1,2})(?:st|nd|rd|th)?${YEAR}${e}`,
			"g",
		),
		read: (m, today) =>
			dayRange(
				Number(m[2]),
				Number(m[3]),
				month(m[1]),
				resolveYear(m[4], today),
				today,
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
		read: (m, today) =>
			dayMonth(Number(m[1]), month(m[2]), resolveYear(m[3], today), today),
	},
	{
		// Day and month, English
		re: new RegExp(
			`${b}${MONTH_ANY}\\s+(\\d{1,2})(?:st|nd|rd|th)?${YEAR}${e}`,
			"g",
		),
		read: (m, today) =>
			dayMonth(Number(m[2]), month(m[1]), resolveYear(m[3], today), today),
	},
	{
		// Day of month, English
		re: new RegExp(
			`${b}(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+${MONTH_ANY}${YEAR}${e}`,
			"g",
		),
		read: (m, today) =>
			dayMonth(Number(m[1]), month(m[2]), resolveYear(m[3], today), today),
	},
	{
		// A named quarter
		re: new RegExp(
			`${b}(?:q([1-4])|(${byLength(Object.keys(ORDINAL_QUARTER))})\\s+(?:trimestre|quarter))${YEAR}${e}`,
			"g",
		),
		read: (m, today) => {
			const q = m[1] ? Number(m[1]) : (ORDINAL_QUARTER[m[2] ?? ""] ?? 1);
			const y = resolveYear(m[3], today);
			if (y !== null) return [quarterRange(y, q)];
			const hit = quarterRange(yearOf(today), q);
			return [hit.from <= today ? hit : quarterRange(yearOf(today) - 1, q)];
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
		read: (m, today) => {
			// "may" is a month only after a preposition or with a year: "you may see" is not May.
			if (m[2] === "may" && !m[1] && !m[3]) return null;
			const y = resolveYear(m[3], today);
			return [
				y === null
					? latestMonth(month(m[2]), today)
					: monthRange(y, month(m[2])),
			];
		},
		lead: (m) => (m[1] ? m[0].indexOf(m[2] ?? "", m[1].length) : 0),
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
		re: new RegExp(`${b}(?:hoy|today)${e}`, "g"),
		read: (_m, today) => point(today),
	},
	{
		re: new RegExp(`${b}(?:ayer|yesterday)${e}`, "g"),
		read: (_m, today) => point(addDays(today, -1)),
	},
	{
		// A weekday: the most recent one strictly before today, so on a Monday "el lunes" is a week ago.
		re: new RegExp(
			`${b}(${Object.keys(WEEKDAYS).join("|")})(?:\\s+pasado)?${e}`,
			"g",
		),
		read: (m, today) => {
			const back = (weekday(today) - (WEEKDAYS[m[1] ?? ""] ?? 0) + 7) % 7 || 7;
			return point(addDays(today, -back), "the most recent one before today");
		},
	},
	{
		// A year alone
		re: new RegExp(`${b}((?:19|20)\\d{2})${e}(?![.,]\\d)`, "g"),
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

// Amount rules

const PRE_MARK = "(us\\$|usd|\\$|€)?\\s*";
/**
 * Thousands with commas ("1,500.50"), thousands with dots ("1.500,50"), or a
 * plain number with an optional decimal part. A single separator followed by
 * exactly three digits is always thousands: nobody types a money amount to
 * three decimals.
 */
const NUMBER =
	"(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)";
const MULTIPLIER =
	"(?:\\s*(k|mil|millones|millon|millions|million|thousand)(?![a-z]))?";
const CURRENCY_WORDS = "pesos|peso|dolares|dolar|dollars|dollar|euros|euro";
const POST_MARK = `(?:\\s*(${CURRENCY_WORDS}|usd|eur|us\\$|€)(?![a-z]))?`;
const DIGIT_AMOUNT = new RegExp(
	`${b}${PRE_MARK}${NUMBER}${MULTIPLIER}${POST_MARK}`,
	"g",
);

const WORD_NUMBERS: Record<string, number> = {
	...SMALL_NUMBERS,
	veinte: 20,
	treinta: 30,
	cuarenta: 40,
	cincuenta: 50,
	cien: 100,
	ciento: 100,
	doscientos: 200,
	trescientos: 300,
	cuatrocientos: 400,
	quinientos: 500,
	seiscientos: 600,
	setecientos: 700,
	ochocientos: 800,
	novecientos: 900,
	twenty: 20,
	thirty: 30,
	forty: 40,
	fifty: 50,
	hundred: 100,
};
const WORDS = byLength(Object.keys(WORD_NUMBERS));
/** "mil", "diez mil", "un millón", "a thousand". */
const WORD_MULTIPLIED = new RegExp(
	`${b}(?:(${WORDS})\\s+)?(mil|millones|millon|thousand|million)${e}`,
	"g",
);
/** Number words without a multiplier count only with a currency after them: "dos" alone is not money. */
const WORD_WITH_CURRENCY = new RegExp(
	`${b}(${byLength(Object.keys(WORD_NUMBERS).filter((w) => w !== "a" && w !== "an"))})\\s+(${CURRENCY_WORDS})${e}`,
	"g",
);

const MULTIPLY: Record<string, number> = {
	k: 1e3,
	mil: 1e3,
	thousand: 1e3,
	millon: 1e6,
	millones: 1e6,
	million: 1e6,
	millions: 1e6,
};

function parseNumber(raw: string): number {
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
	if (m === "us$" || m === "usd") return "USD";
	if (m === "€" || m.startsWith("eur")) return "EUR";
	if (m === "$") return local && symbolOf(local) === "$" ? local : null;
	if (m.startsWith("peso")) {
		return local && nameOf(local, "es").includes("peso") ? local : null;
	}
	if (m.startsWith("dolar") || m.startsWith("dollar")) {
		return local && nameOf(local, "en").includes("dollar") ? local : "USD";
	}
	return null;
}

// The parser

/** Reads dates, then amounts, never twice over one span nor over a claimed one. */
function readSpans(
	text: string,
	{ today, facts }: ParserInput,
	claimed: readonly Span[],
): { dates: Placed<DateReading>[]; amounts: Placed<AmountReading>[] } {
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

	const dates: Placed<DateReading>[] = [];
	for (const rule of DATE_RULES) {
		rule.re.lastIndex = 0;
		for (let m = rule.re.exec(folded); m; m = rule.re.exec(folded)) {
			const s = m.index + (rule.lead?.(m) ?? 0);
			const t = m.index + m[0].length;
			if (!free(s, t, true)) continue;
			const hits = rule.read(m, today);
			if (!hits) continue;
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
		const value = parseNumber(m[2] ?? "") * (MULTIPLY[m[3] ?? ""] ?? 1);
		claim(s, t, value, mark);
	}
	WORD_MULTIPLIED.lastIndex = 0;
	for (
		let m = WORD_MULTIPLIED.exec(folded);
		m;
		m = WORD_MULTIPLIED.exec(folded)
	) {
		const value = (WORD_NUMBERS[m[1] ?? ""] ?? 1) * (MULTIPLY[m[2] ?? ""] ?? 1);
		claim(m.index, m.index + m[0].length, value, null);
	}
	WORD_WITH_CURRENCY.lastIndex = 0;
	for (
		let m = WORD_WITH_CURRENCY.exec(folded);
		m;
		m = WORD_WITH_CURRENCY.exec(folded)
	) {
		const t = m.index + m[0].length;
		const written = m[2] ?? "";
		claim(
			m.index,
			t,
			WORD_NUMBERS[m[1] ?? ""] ?? 0,
			text.slice(t - written.length, t),
		);
	}

	const inOrder = <R>(placed: Placed<R>[]) =>
		placed.sort((x, y) => x.at[0] - y.at[0]);
	return { dates: inOrder(dates), amounts: inOrder(amounts) };
}
