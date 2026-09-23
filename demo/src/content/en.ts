import { type Content, status, transaction as t, vendor } from "./types.ts";

// Fictional vendors with invented names, made up to be no real business.
export const english: Content = {
	language: "en",
	locale: "en-US",
	copy: {
		skip: "Skip to the content",
		product: "justask demo",
		pagesLabel: "Pages",
		pages: { search: "Search", filter: "Filter" },
		languageLabel: "Language",
		themeLabel: "Theme",
		themes: { system: "Auto", light: "Light", dark: "Dark" },
		vendors: "Vendors",
		boxLabel: "Find a vendor",
		placeholder: "Describe the vendor in your own words",
		suggestions: "Try a request",
		oneVendor: "Names one vendor",
		ambiguous: "Could mean two",
		nothing: "Nothing to find",
		empty: "No vendor fits that request.",
		chooseHint: "Choose the vendor to see its transactions.",
		transactionsWith: (name) => `Transactions with ${name}`,
		columns: {
			number: "Invoice",
			date: "Date",
			amount: "Amount",
			status: "Status",
		},
		statuses: { paid: "Paid", open: "Open", overdue: "Overdue" },
		panel: "What happened",
		idle: "Type a request, or try one of the suggestions.",
		waiting: "Waiting for the answer",
		filled: "Filled",
		held: "Held",
		failed: "Failed",
		filledBecause: (name, none, gate) =>
			`${name} won, and none (${none}) stayed below the gate (${gate}).`,
		heldBecause: (reason) => {
			switch (reason.kind) {
				case "none-reached-gate":
					return `none (${reason.none}) reached the gate (${reason.gate}), so nothing is shown.`;
				case "none-picked":
					return `The provider picked none (${reason.none}), so nothing is shown.`;
				case "tie":
					return "Two candidates tied for first place, so nothing is shown.";
				case "no-candidates":
					return "The shortlist found no candidates, so the provider was not asked.";
				case "provider":
					return "The provider failed, so nothing is shown. The server log has the details.";
				case "timeout":
					return `The provider did not answer within ${reason.timeoutMs} ms, so nothing is shown.`;
				case "unreachable":
					return `The search handler could not be reached: ${reason.message}`;
			}
		},
		request: "Request",
		candidate: "Candidate",
		probability: "Probability",
		pick: "pick",
		gate: "Gate on none",
		shortlistLabel: "Shortlist",
		shortlist: (count, catalog) => `${count} of ${catalog} vendors`,
		roundTrip: "Round trip",
		filter: {
			transactions: "Transactions",
			boxLabel: "Filter the transactions",
			placeholder: "Describe the transactions you want to see",
			proposed: "Filters to apply",
			fields: {
				vendor: "Vendor",
				status: "Status",
				date: "Date",
				amount: "Amount",
			},
			remove: "Remove",
			removeLabel: (field) => `Remove the ${field.toLowerCase()} filter`,
			removed: (field) => `Removed: ${field.toLowerCase()}`,
			confirm: "Apply filters",
			empty: "Nothing in that request filters the transactions.",
			applied: "Applied",
			clear: "Clear filters",
			showing: (count, total) =>
				count === total
					? `All ${total} transactions`
					: `${count} of ${total} transactions`,
			none: "No transaction matches the applied filters.",
			vendorColumn: "Vendor",
			fills: "Fills the filters",
			holds: "Leaves one empty",
			nothing: "Nothing to filter",
			dateRange: ({ from, to }, date) => {
				if (from && to) {
					return from === to
						? `on ${date(from)}`
						: `${date(from)} to ${date(to)}`;
				}
				return from ? `since ${date(from)}` : `until ${date(to ?? "")}`;
			},
			amountRange: ({ min, max, exact, currency }, amount) => {
				const money = (value: number) =>
					currency && currency !== "USD"
						? `${value} ${currency}`
						: amount(value);
				if (exact !== undefined) return `exactly ${money(exact)}`;
				if (min !== undefined && max !== undefined) {
					return `${money(min)} to ${money(max)}`;
				}
				return min !== undefined
					? `${money(min)} or more`
					: `${money(max ?? 0)} or less`;
			},
			summary: (filled, total) =>
				filled === 0
					? `No field filled, all ${total} held.`
					: `${filled} of ${total} fields filled, the rest held.`,
			filledBecause: (probability, gate) =>
				`Every pick cleared the gate: the lowest was ${probability}, the gate ${gate}.`,
			heldBecause: (reason) => {
				switch (reason.kind) {
					case "no-candidates":
						return "The code found no candidates, so the provider was not asked.";
					case "unresolved-currency":
						return `The request names “${reason.mark}”, which is not the local currency, so the code held the field without asking.`;
					case "failed":
						return "No answer came back, so the field is held.";
					case "tie":
						return "Two labels tied for first place, so the field is held.";
					case "not-mentioned":
						return "The provider says the request does not mention it.";
					case "not-available":
						return "The provider says the request asks for something no candidate expresses.";
					case "below-gate":
						return `A pick (${reason.probability}) fell below the gate (${reason.gate}), so the field is held.`;
					case "conflict":
						return "The picks do not add up to one filter, so the code held the field.";
				}
			},
			start: "Where it starts",
			end: "Where it ends",
			number: (text) => `What “${text}” does`,
			roles: {
				min: "the minimum",
				max: "the maximum",
				exact: "the exact amount",
			},
			more: (count) => `${count} more candidates, not shown`,
			gate: "Gate",
			questions: "Questions in one call",
		},
	},
	vendors: [
		vendor(
			"papergrove",
			"Papergrove Supplies",
			"office paper, toner and stationery",
		),
		vendor("larkspur", "Larkspur Catering", "catering and office lunches"),
		vendor(
			"cloudberth",
			"Cloudberth Hosting",
			"website hosting and cloud servers",
		),
		vendor("brightmop", "Brightmop Cleaning", "nightly office cleaning"),
		vendor(
			"glasswell",
			"Glasswell Janitorial",
			"office cleaning and window washing",
		),
		vendor("inkhollow", "Inkhollow Print", "business cards, flyers and signs"),
		vendor(
			"farwander",
			"Farwander Travel",
			"flights and hotels for staff trips",
		),
		vendor("tallyroot", "Tallyroot Software", "accounting software licenses"),
		vendor(
			"beanhaven",
			"Beanhaven Coffee",
			"coffee beans and coffee machine rental",
		),
		vendor("swiftlane", "Swiftlane Couriers", "same-day courier deliveries"),
		vendor(
			"clausewood",
			"Clausewood Legal",
			"contract review and legal advice",
		),
		vendor("fixbright", "Fixbright IT", "laptop repair and IT support"),
		vendor("paydale", "Paydale Payroll", "payroll and HR services"),
		vendor("sureharbor", "Sureharbor Insurance", "business insurance"),
	],
	transactions: [
		t("papergrove", "INV-2041", "2026-09-14", 412.5, "open"),
		t("papergrove", "INV-1987", "2026-08-12", 389.2, "paid"),
		t("papergrove", "INV-1902", "2026-07-10", 455.0, "paid"),
		t("larkspur", "INV-2055", "2026-09-18", 1240.0, "open"),
		t("larkspur", "INV-2012", "2026-08-28", 960.0, "paid"),
		t("larkspur", "INV-1931", "2026-07-25", 1105.75, "paid"),
		t("cloudberth", "INV-2030", "2026-09-01", 299.0, "paid"),
		t("cloudberth", "INV-1960", "2026-08-01", 299.0, "paid"),
		t("brightmop", "INV-2048", "2026-09-15", 1800.0, "open"),
		t("brightmop", "INV-1975", "2026-08-15", 1800.0, "overdue"),
		t("glasswell", "INV-2033", "2026-09-05", 640.0, "paid"),
		t("glasswell", "INV-1950", "2026-08-05", 640.0, "paid"),
		t("inkhollow", "INV-2019", "2026-08-30", 185.4, "paid"),
		t("farwander", "INV-2051", "2026-09-17", 2360.9, "open"),
		t("farwander", "INV-1911", "2026-07-14", 1720.0, "paid"),
		t("tallyroot", "INV-2002", "2026-08-20", 1188.0, "paid"),
		t("beanhaven", "INV-2044", "2026-09-10", 96.3, "open"),
		t("beanhaven", "INV-1983", "2026-08-10", 112.8, "paid"),
		t("swiftlane", "INV-2038", "2026-09-08", 74.0, "overdue"),
		t("swiftlane", "INV-1994", "2026-08-18", 58.5, "paid"),
		t("clausewood", "INV-2027", "2026-09-03", 3400.0, "open"),
		t("fixbright", "INV-2009", "2026-08-24", 265.0, "paid"),
		t("fixbright", "INV-1920", "2026-07-19", 540.0, "paid"),
		t("paydale", "INV-2036", "2026-09-06", 820.0, "paid"),
		t("sureharbor", "INV-1899", "2026-07-01", 2940.0, "paid"),
	],
	statuses: [
		status("paid", "paid invoices, settled in full"),
		status("open", "open invoices, not paid yet and not yet due"),
		status("overdue", "overdue invoices, unpaid past their due date"),
	],
	filterSuggestions: {
		fills: [
			"Larkspur invoices over $1,000",
			"overdue invoices",
			"what we paid in August",
			"invoices between $200 and $1,000 from last week",
		],
		holds: [
			"the cleaners' invoices from last month",
			"invoices of around $500",
		],
		nothing: ["how much do we owe in total?", "who is our best vendor?"],
	},
	suggestions: {
		oneVendor: [
			"the catering people",
			"who hosts our website",
			"the toner order",
			"larkspr",
			"legal fees for the lease contract",
		],
		ambiguous: ["the cleaners", "the Papergrove or Larkspur invoice"],
		nothing: ["the plumber who fixed the leak", "how much do we owe in total?"],
	},
};
