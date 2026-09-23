import { type Content, transaction as t, vendor } from "./types.ts";

// Fictional vendors with invented names, made up to be no real business.
export const english: Content = {
	language: "en",
	locale: "en-US",
	copy: {
		skip: "Skip to the search",
		product: "justask demo",
		page: "Search",
		languageLabel: "Language",
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
