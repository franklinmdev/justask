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
	return {
		probability: (value: number) => probability.format(value),
		/** In the local currency, or as the bare number and its code when another one is named. */
		amount: (value: number, currency?: string | null) =>
			currency && currency !== LOCAL_CURRENCY
				? `${value} ${currency}`
				: amount.format(value),
		date: (iso: string) => date.format(new Date(`${iso}T00:00:00Z`)),
	};
}
