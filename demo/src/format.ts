/** The currency the demo's amounts are in, and the one the server resolves "$" to. */
export const LOCAL_CURRENCY = "USD";

/** The figures the demo shows, formatted in the language's locale. */
export function formats(locale: string) {
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
	// A month runs to cents; below a cent it reads like a call.
	const cents = new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	const count = new Intl.NumberFormat(locale);
	return {
		probability: (value: number) => probability.format(value),
		cost: (usd: number) => cost.format(usd),
		/** To the cent, as a month's cost shows; below a cent, as a call's. */
		cents: (usd: number) =>
			usd >= 0.01 || usd === 0 ? cents.format(usd) : cost.format(usd),
		count: (value: number) => count.format(value),
		/** In the local currency, or as the bare number and its code when another one is named. */
		amount: (value: number, currency?: string | null) =>
			currency && currency !== LOCAL_CURRENCY
				? `${value} ${currency}`
				: amount.format(value),
		date: (iso: string) => date.format(new Date(`${iso}T00:00:00Z`)),
		day: (iso: string) =>
			(Number(iso.slice(0, 4)) === new Date().getFullYear()
				? day
				: dayInYear
			).format(new Date(`${iso}T00:00:00Z`)),
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
