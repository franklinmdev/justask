/** The figures the demo shows, formatted in the language's locale. */
export function formats(locale: string) {
	const probability = new Intl.NumberFormat(locale, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	const amount = new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "USD",
	});
	// The data's dates are calendar days, so they are read in UTC.
	const date = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeZone: "UTC",
	});
	return {
		probability: (value: number) => probability.format(value),
		amount: (value: number) => amount.format(value),
		date: (iso: string) => date.format(new Date(`${iso}T00:00:00Z`)),
	};
}
