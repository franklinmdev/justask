/** The currency the demo's amounts are in, and the one the server resolves "$" to. */
export const LOCAL_CURRENCY = "USD";

/** The currency's code when it names one other than the local currency, which shows as a bare "$". */
export function foreignCurrency(currency?: string | null): string | undefined {
	return currency && currency !== LOCAL_CURRENCY ? currency : undefined;
}

/** Each locale's formatters, built once: nine Intl constructors on every render were the demo's heaviest code in the page tests' profile (#120). */
const byLocale = new Map<string, ReturnType<typeof build>>();

/** The figures the demo shows, formatted in the language's locale. */
export function formats(locale: string) {
	let format = byLocale.get(locale);
	if (!format) {
		format = build(locale);
		byLocale.set(locale, format);
	}
	return format;
}

/** A YYYY-MM-DD calendar day as a Date at its UTC midnight: day arithmetic runs in UTC. */
export function dateOf(iso: string): Date {
	return new Date(`${iso}T00:00:00Z`);
}

function build(locale: string) {
	const probability = new Intl.NumberFormat(locale, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	const amount = new Intl.NumberFormat(locale, {
		style: "currency",
		currency: LOCAL_CURRENCY,
	});
	// The data's dates are calendar days, so they are read in UTC.
	const date = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeZone: "UTC",
	});
	// A range's days in a narrow control: the year only when it is not this one.
	const day = new Intl.DateTimeFormat(locale, {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
	const dayInYear = new Intl.DateTimeFormat(locale, {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
	// A call costs millionths of a dollar, so two significant digits, not cents.
	const cost = new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "USD",
		maximumSignificantDigits: 2,
	});
	// The calculator's cost per call, with every digit its month multiplies (#220); 15 keeps a double's noise out.
	const exactCost = new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "USD",
		maximumSignificantDigits: 15,
	});
	// A month runs to cents; below a cent it reads like a call.
	const cents = new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	// The calendar's day names, weekday heads and month title.
	const longDay = new Intl.DateTimeFormat(locale, {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
	const weekday = new Intl.DateTimeFormat(locale, {
		weekday: "short",
		timeZone: "UTC",
	});
	const month = new Intl.DateTimeFormat(locale, {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
	const count = new Intl.NumberFormat(locale);
	const currencyName = new Intl.DisplayNames(locale, { type: "currency" });
	return {
		probability: (value: number) => probability.format(value),
		cost: (usd: number) => cost.format(usd),
		/** A call's cost as measured, not rounded, so a sum shown with it multiplies out. */
		exactCost: (usd: number) => exactCost.format(usd),
		/** To the cent, as a month's cost shows; below a cent, as a call's. */
		cents: (usd: number) =>
			usd >= 0.01 || usd === 0 ? cents.format(usd) : cost.format(usd),
		count: (value: number) => count.format(value),
		/** In the local currency, or as the bare number and its code when another one is named. */
		amount: (value: number, currency?: string | null) => {
			const code = foreignCurrency(currency);
			return code ? `${value} ${code}` : amount.format(value);
		},
		/** How a screen reader hears an amount's currency: the local one by its name, since its mark is a bare "$", any other by its code, as its mark shows it. */
		currency: (currency?: string | null) =>
			foreignCurrency(currency) ??
			currencyName.of(LOCAL_CURRENCY) ??
			LOCAL_CURRENCY,
		date: (iso: string) => date.format(dateOf(iso)),
		longDay: (iso: string) => longDay.format(dateOf(iso)),
		weekday: (iso: string) => weekday.format(dateOf(iso)),
		month: (iso: string) => month.format(dateOf(iso)),
		day: (iso: string) =>
			(Number(iso.slice(0, 4)) === new Date().getFullYear()
				? day
				: dayInYear
			).format(dateOf(iso)),
	};
}

/**
 * The number the person typed: a comma before one or two final digits is a
 * decimal comma, any other comma or a space groups thousands.
 */
export function parseAmount(text: string): number | undefined {
	const plain = text.replace(/\s/g, "");
	if (plain === "") return undefined;
	const decimal = /^[^.]*,\d{1,2}$/.test(plain)
		? plain.replace(",", ".")
		: plain.replace(/,/g, "");
	const number = Number(decimal);
	return Number.isFinite(number) ? number : undefined;
}

/** Today on the person's own calendar, YYYY-MM-DD. */
export function today(): string {
	const now = new Date();
	return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
		.toISOString()
		.slice(0, 10);
}

/** When to try again after a rate limit, rounded up: seconds under a minute, minutes past it. */
export function waitOf(ms: number): { seconds: number } | { minutes: number } {
	const seconds = Math.max(1, Math.ceil(ms / 1_000));
	return seconds < 60 ? { seconds } : { minutes: Math.ceil(seconds / 60) };
}
