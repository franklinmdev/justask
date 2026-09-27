import { waitOf } from "../format.ts";
import {
	type Content,
	type FieldHeldReason,
	IMPLIES_OFFICE,
	status,
	transaction as t,
	tag,
	vendor,
} from "./types.ts";

const listFormat = new Intl.ListFormat("en");

/** Why a filter or card field is held, as both panels say it. */
function fieldHeldBecause(reason: FieldHeldReason): string {
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
		case "pair":
			return `The request names two candidates (“${reason.text}”), so the code held the field whatever the pick.`;
		case "marker":
			return `The request speaks as the system or an admin (“${reason.text}”), not as the person, so the code held the field whatever the pick.`;
	}
}

// Fictional vendors with invented names, made up to be no real business.
export const english: Content = {
	language: "en",
	locale: "en-US",
	copy: {
		skip: "Skip to the content",
		stopped: {
			budget: {
				title: "The demo's budget for today is spent",
				body: "The demo calls TypeSafe on its owner's key, with $1 to spend a day, and the day's dollar is gone. It starts over at midnight UTC. Until then every case's recorded run still plays, and a clone of justask runs on your own key.",
			},
			paused: {
				title: "The live demo is paused",
				body: "The demo's owner has paused its live calls to TypeSafe. Every case's recorded run still plays, and a clone of justask runs on your own key.",
			},
			key: {
				title: "The demo's own key is out of service right now",
				body: "This is not justask misreading your request. TypeSafe refused the key the demo calls it with. Every case's recorded run still plays, and a clone of justask runs on your own key.",
			},
			minute: {
				title: "You have used your 20 live requests this minute",
				body: "Each visitor gets 20 live requests a minute and 200 a day on the demo's key, counted by IP address. They come back in about a minute. Until then every case's recorded run still plays, and a clone of justask runs on your own key.",
			},
			day: {
				title: "You have used your 200 live requests today",
				body: "Each visitor gets 200 live requests a day on the demo's key, counted by IP address, so people on one office network share them. They come back at midnight UTC. Until then every case's recorded run still plays, and a clone of justask runs on your own key.",
			},
			replay: "Replay the recorded run",
			clone: "Clone justask and run it with your own key",
		},
		product: "justask demo",
		casesLabel: "Cases",
		cases: { table: "Table", form: "Form", search: "Search" },
		hood: "Under the hood",
		hoodViews: "Views",
		trace: "Trace",
		json: "JSON",
		code: "Code",
		strip: "This call",
		stripIdle: "Latency, tokens and cost show after the first call.",
		notReported: "Not reported",
		cut: (limit) =>
			`Requests stop at ${limit} characters, so the rest was left out.`,
		jsonIdle: "The result shows here after the first call.",
		showLabel: "Show",
		app: "App",
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
		empty: "No vendor matches",
		unanswered:
			"The request could not be read, so no vendor is shown. Try again.",
		choices: "Which one?",
		severalFit: "More than one vendor could fit",
		closest: "Closest",
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
		waiting: "Waiting for the answer…",
		filled: "Filled",
		held: "Held",
		failed: "Failed",
		filledBecause: (name, none, several, gate) =>
			`${name} won, and none (${none}) and several (${several}) stayed below the gate (${gate}).`,
		heldBecause: (reason) => {
			switch (reason.kind) {
				case "none-reached-gate":
					return `none (${reason.none}) reached the gate (${reason.gate}), so nothing is shown.`;
				case "several-reached-gate":
					return `several (${reason.several}) reached the gate (${reason.gate}), so nothing is shown.`;
				case "none-picked":
					return `The provider picked none (${reason.none}), so nothing is shown.`;
				case "several-picked":
					return `The provider picked several (${reason.several}), so nothing is shown.`;
				case "none-tied":
					return `none (${reason.none}) tied for first place, so nothing is shown.`;
				case "several-tied":
					return `several (${reason.several}) tied for first place, so nothing is shown.`;
				case "pair":
					return `The request names two candidates (“${reason.text}”), so the code shows nothing, whatever the pick.`;
				case "tie":
					return "Two candidates tied for first place, so nothing is shown.";
				case "no-candidates":
					return "The shortlist found no candidates, so the provider was not asked.";
				case "provider":
					return "The provider failed, so nothing is shown. The server log has the details.";
				case "timeout":
					return `The provider did not answer within ${reason.timeoutMs}\u00a0ms, so nothing is shown.`;
				case "refused":
					return `The server refused the request: ${reason.message}`;
				case "too-large":
					return "The request was too large for the server, so nothing is shown.";
				case "unsupported":
					return "The server did not take the request as JSON, so nothing is shown.";
				case "rate-limited": {
					if (reason.retryAfterMs === null) {
						return "The server is taking too many requests. Try again in a moment.";
					}
					const wait = waitOf(reason.retryAfterMs);
					const after =
						"seconds" in wait
							? `${wait.seconds} ${wait.seconds === 1 ? "second" : "seconds"}`
							: `${wait.minutes} ${wait.minutes === 1 ? "minute" : "minutes"}`;
					return `The server is taking too many requests. Try again in ${after}.`;
				}
				case "server":
					return `The server failed (${reason.status}), so nothing is shown. Try again.`;
				case "unreachable":
					return `The server could not be reached: ${reason.message}`;
			}
		},
		request: "Request",
		candidate: "Candidate",
		probability: "Probability",
		pick: "pick",
		gate: "Gate on none and several",
		shortlistLabel: "Shortlist",
		shortlist: (count, catalog) => `${count} of ${catalog} vendors`,
		latency: "Latency",
		calls: "Calls",
		retried: "(retried)",
		inputTokens: "Input tokens",
		cost: "Cost",
		recorded: (date) => `Recorded run · ${date}`,
		replaying: (date, request) =>
			`Replaying a recorded run from ${date}: “${request}”`,
		saved: ({ clicks, menus }) => {
			const words = `1 sentence vs ${clicks} ${clicks === 1 ? "click" : "clicks"}`;
			return menus === 0
				? words
				: `${words} in ${menus} ${menus === 1 ? "menu" : "menus"}`;
		},
		filter: {
			transactions: "Transactions",
			boxLabel: "Filter the transactions",
			placeholder: "Describe the transactions you want to see",
			fields: {
				vendor: "Vendor",
				status: "Status",
				date: "Date",
				amount: "Amount",
			},
			empty: "Nothing in that request filters the transactions.",
			unanswered:
				"The request could not be read, so the table stays as it was. Try again.",
			applied: "Applied",
			appliedFields: (set, held) =>
				[
					set.length > 0 &&
						`Set: ${set.map(([field, value]) => `${field}, ${value}`).join("; ")}.`,
					held.length > 0 && `Held: ${held.join(", ")}.`,
				]
					.filter(Boolean)
					.join(" "),
			clear: "Clear filters",
			showing: (count, total) =>
				count === total
					? `All ${total} transactions`
					: `${count} of ${total} transactions`,
			pages: {
				label: "Pages",
				previous: "Previous",
				next: "Next",
				range: (first, last, total) => `${first} to ${last} of ${total}`,
			},
			controls: {
				allVendors: "All vendors",
				allStatuses: "All statuses",
				from: "Start date",
				to: "End date",
				fromEmpty: "Start",
				toEmpty: "End",
				min: "Minimum amount",
				max: "Maximum amount",
				minEmpty: "Min",
				maxEmpty: "Max",
				calendar: {
					label: "Choose the day",
					previous: "Previous month",
					next: "Next month",
					clear: "Clear",
				},
			},
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
				const money = (value: number) => amount(value, currency);
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
					: filled === total
						? `All ${total} fields filled.`
						: `${filled} of ${total} fields filled, the rest held.`,
			filledBecause: (probability, gate) =>
				`Every pick cleared the gate: the lowest was ${probability}, the gate ${gate}.`,
			heldBecause: fieldHeldBecause,
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
		card: {
			title: "New expense",
			boxLabel: "Describe the expense",
			placeholder: "Describe the expense in your own words",
			fill: "Fill the card",
			fillHint: "Press Enter to fill the card",
			fields: {
				vendor: "Vendor",
				tags: "Tags",
				spent_on: "Day",
				total: "Amount",
			},
			tags: {
				meals: "Meals",
				travel: "Travel",
				office: "Office",
				client: "Client",
			},
			chooseVendor: "Choose a vendor",
			fromRequest: "from the request",
			fromVendor: "from the vendor",
			announce: (filled, waiting, kept) => {
				const list = (names: string[]) =>
					listFormat.format(names.map((name) => name.toLowerCase()));
				return [
					filled.length > 0
						? `Filled: ${list(filled)}.`
						: kept.length === 0 && "Nothing filled.",
					kept.length > 0 && `Kept your changes: ${list(kept)}.`,
					waiting.length > 0
						? `For you to fill: ${list(waiting)}.`
						: "Nothing left to fill.",
				]
					.filter(Boolean)
					.join(" ");
			},
			unanswered:
				"The request could not be read, so the card stays as it was. Fill it in by hand.",
			pickDay: "Pick a day",
			calendar: {
				label: "Choose the day",
				previous: "Previous month",
				next: "Next month",
				clear: "Clear",
			},
			confirm: "Save expense",
			saved: "Expense saved.",
			undo: "Undo",
			expenses: "Saved expenses",
			noExpenses:
				"No expense saved yet. Saved ones stay in memory until the page reloads.",
			fills: "Fills the card",
			holds: "Leaves one empty",
			nothing: "Not a new expense",
			intent: "New expense?",
			intentLabels: {
				new_record: "records a new expense",
				not_mentioned: "asks for no record",
				not_available: "changes, deletes, sends or asks about one",
			},
			intentBecause: (reason) => {
				switch (reason.kind) {
					case "passed":
						return `The request asks for a new expense: new_record (${reason.probability}) cleared the gate (${reason.gate}).`;
					case "below-gate":
						return `new_record (${reason.probability}) fell below the gate (${reason.gate}), so every field is held.`;
					case "not-mentioned":
						return "The provider says the request asks for no record, so every field is held.";
					case "not-available":
						return "The provider says the request is about an expense but adds none, so every field is held.";
					case "tie":
						return "Two labels tied for first place, so every field is held.";
					case "failed":
						return "No answer came back, so every field is held.";
					case "command":
						return `The request acts on an expense already recorded (“${reason.verb}”, “${reason.reference}”), so the code held every field whatever the pick.`;
					case "marker":
						return `The request speaks as the system or an admin (“${reason.text}”), not as the person, so the code held every field whatever the pick.`;
				}
			},
			heldBecause: (reason) => {
				switch (reason.kind) {
					case "not-a-record":
						return "The request asks for no new expense, so the field is held with the rest.";
					case "foreign-currency":
						return `The pick names “${reason.mark}”, which is not the local currency, so the code held the field.`;
					case "ambiguous":
						return `“${reason.text}” reads two ways, so the code held the field whatever its probability.`;
					case "period":
						return `“${reason.text}” is a period, not one day, so the code held the field.`;
					case "negated":
						return `The request says it was not this vendor (“${reason.text}”), so the code held the field whatever the pick.`;
					case "after-today":
						return `“${reason.text}” is after today, and an expense’s day has already happened, so the code held the field.`;
					default:
						return fieldHeldBecause(reason);
				}
			},
			impliedBecause: (vendor, tags) =>
				`Filled from the vendor: every sale at ${vendor} is tagged ${tags.toLowerCase()}, and no tag's answer said otherwise.`,
			tagQuestion: (name) => `Tagged ${name.toLowerCase()}?`,
			yes: "the request asks for it",
			unresolved: (mark) => `“${mark}” is not the local currency`,
			ambiguous: "reads two ways",
		},
		calculator: {
			title: "Cost per month",
			users: "Users",
			actions: "Actions per person a day",
			costPerCall: "Cost per call",
			perMonth: "Per month",
			noCall: "No call yet",
			notPriced: "Not priced",
			idle: "The month is priced after the first call.",
			unpriced:
				"The provider did not report this call's cost, so the month cannot be priced.",
			invalid: "Enter a whole number to price the month.",
			formula: (users, actions, cost, days) =>
				`${users} × ${actions} × ${cost} × ${days} days`,
			measured: "The cost per call is the displayed run's measured cost.",
			rate: (model, rate) =>
				`${model} charges ${rate} per million input tokens, output tokens free.`,
			readFrom: "Read from",
			readOn: (date) => `on ${date}.`,
		},
	},
	vendors: [
		vendor(
			"papergrove",
			"Papergrove Supplies",
			"office paper, toner and stationery",
			"Papergrove",
			IMPLIES_OFFICE,
		),
		vendor(
			"larkspur",
			"Larkspur Catering",
			"catering and office lunches",
			"Larkspur",
		),
		vendor(
			"cloudberth",
			"Cloudberth Hosting",
			"website hosting and cloud servers",
			"Cloudberth",
			IMPLIES_OFFICE,
		),
		vendor(
			"brightmop",
			"Brightmop Cleaning",
			"nightly office cleaning",
			"Brightmop",
			IMPLIES_OFFICE,
		),
		vendor(
			"glasswell",
			"Glasswell Janitorial",
			"office cleaning and window washing",
			"Glasswell",
			IMPLIES_OFFICE,
		),
		vendor(
			"inkhollow",
			"Inkhollow Print",
			"business cards, flyers and signs",
			"Inkhollow",
			IMPLIES_OFFICE,
		),
		vendor(
			"farwander",
			"Farwander Travel",
			"flights and hotels for staff trips",
			"Farwander",
		),
		vendor(
			"tallyroot",
			"Tallyroot Software",
			"accounting software licenses",
			"Tallyroot",
			IMPLIES_OFFICE,
		),
		vendor(
			"beanhaven",
			"Beanhaven Coffee",
			"coffee beans and coffee machine rental",
			"Beanhaven",
		),
		vendor(
			"swiftlane",
			"Swiftlane Couriers",
			"same-day courier deliveries",
			"Swiftlane",
			IMPLIES_OFFICE,
		),
		vendor(
			"clausewood",
			"Clausewood Legal",
			"contract review and legal advice",
			"Clausewood",
			IMPLIES_OFFICE,
		),
		vendor(
			"fixbright",
			"Fixbright IT",
			"laptop repair and IT support",
			"Fixbright",
			IMPLIES_OFFICE,
		),
		vendor(
			"paydale",
			"Paydale Payroll",
			"payroll and HR services",
			"Paydale",
			IMPLIES_OFFICE,
		),
		vendor(
			"sureharbor",
			"Sureharbor Insurance",
			"business insurance",
			"Sureharbor",
			IMPLIES_OFFICE,
		),
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
			"what we paid last month",
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
	tags: [
		tag(
			"meals",
			"meals: food and drink, such as lunch, dinner, coffee, snacks and catering",
		),
		tag("travel", "travel: flights, hotels, taxis and trains"),
		tag(
			"office",
			"office: what keeps the business running, such as supplies, equipment, software, hosting, repairs, cleaning and window washing, printing, couriers, payroll and HR, legal advice and insurance",
		),
		tag(
			"client",
			"billable to a client, or spent with a client, when the request says so for certain, not when it says maybe",
		),
	],
	cardCommands: {
		verbs: [
			"remove",
			"delete",
			"erase",
			"cancel",
			"void",
			"change",
			"edit",
			"update",
			"move",
			"undo",
			"send",
			"resend",
			"forward",
			"email",
		],
		references: [
			"the expense",
			"that expense",
			"this expense",
			"the expenses",
			"the invoice",
			"that invoice",
			"this invoice",
			"the invoices",
		],
	},
	joiners: { or: ["or", "vs", "versus"], and: ["and"] },
	cardNegations: {
		before: [
			"not",
			"never",
			"no",
			"wasn't",
			"wasnt",
			"was not",
			"isn't",
			"isnt",
			"is not",
			"didn't",
			"didnt",
			"did not",
		],
		after: ["wasn't", "wasnt", "was not", "isn't", "isnt", "is not"],
	},

	cardSuggestions: {
		fills: [
			"lunch with Larkspur yesterday, $86.40",
			"Farwander taxi with a client on Friday, $64",
			"Beanhaven coffee today, $18.50",
		],
		holds: [
			"lunch with the cleaners yesterday, $40",
			"Papergrove toner last week, $120",
			"Swiftlane courier, 300 pesos",
		],
		nothing: ["how much did we spend on lunch?", "delete yesterday's taxi"],
	},
};
