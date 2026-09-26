import type {
	AmountField,
	AmountRange,
	Candidate,
	CardCommand,
	CardCommands,
	CardDateField,
	CatalogField,
	DateField,
	DateRange,
	Joiners,
	SeveralCatalogField,
} from "justask";
export type Language = "en" | "es";

/** The clicks and menus the person works through to set controls by hand. */
export type Cost = { clicks: number; menus: number };

/** The showcase's cases, in the order the tabs show them. */
export type Case = "table" | "form" | "search";

/** A vendor of the fictional invoicing app: the search's candidate value. */
export type Vendor = {
	id: string;
	name: string;
	supplies: string;
};

export type TransactionStatus = "paid" | "open" | "overdue";

export type Transaction = {
	vendorId: string;
	/** The invoice number, such as INV-2041. */
	number: string;
	/** ISO date, YYYY-MM-DD. */
	date: string;
	/** In the app's local currency, USD. */
	amount: number;
	status: TransactionStatus;
};

/** The transactions table's filter, as the demo's filter handler declares it. */
export type TransactionFields = {
	vendor: CatalogField<Vendor>;
	status: CatalogField<TransactionStatus>;
	date: DateField;
	amount: AmountField;
};

export type FieldName = keyof TransactionFields;

/** Why a filter field is held, as the state panel explains it. */
export type FieldHeldReason =
	| { kind: "no-candidates" }
	| { kind: "unresolved-currency"; mark: string }
	| { kind: "failed" }
	| { kind: "tie" }
	| { kind: "not-mentioned" }
	| { kind: "not-available" }
	| { kind: "below-gate"; probability: string; gate: string }
	| { kind: "conflict" }
	| { kind: "pair"; text: string };

/** How an expense is tagged; several can apply to one. */
export type Tag = "meals" | "travel" | "office" | "client";

/** The expense card, as the demo's card handler declares it. */
export type ExpenseFields = {
	vendor: CatalogField<Vendor>;
	tags: SeveralCatalogField<Tag>;
	spent_on: CardDateField;
	total: AmountField;
};

export type ExpenseName = keyof ExpenseFields;

/** Why a card field is held, as the state panel explains it. */
export type CardHeldReason =
	| FieldHeldReason
	| { kind: "not-a-record" }
	| { kind: "foreign-currency"; mark: string }
	| { kind: "ambiguous"; text: string }
	| { kind: "period"; text: string };

/** Why the intent question let the fields fill, or held them all. */
export type IntentReason =
	| { kind: "passed"; probability: string; gate: string }
	| { kind: "below-gate"; probability: string; gate: string }
	| { kind: "not-mentioned" }
	| { kind: "not-available" }
	| { kind: "tie" }
	| { kind: "failed" }
	| ({ kind: "command" } & CardCommand);

/** A calendar popover's words: its name, the month steps and the clear button. */
export type CalendarCopy = {
	label: string;
	previous: string;
	next: string;
	clear: string;
};

/** The card page's own words. */
export type CardCopy = {
	title: string;
	boxLabel: string;
	placeholder: string;
	/** The button beside the box that sends the request, as Enter does (#147). */
	fill: string;
	/** Under the box while its sentence has not been sent. */
	fillHint: string;
	fields: Record<ExpenseName, string>;
	tags: Record<Tag, string>;
	chooseVendor: string;
	/** Beside a field's label while its value is the one the request gave. */
	fromRequest: string;
	/** Beside the tags' label while their value is the one the vendor implied (ADR 0012). */
	fromVendor: string;
	/** What a screen reader hears, and the page shows, once an answer comes back. */
	announce: (filled: string[], waiting: string[]) => string;
	/** What the page says when the answer failed: the card stays as it was. */
	unanswered: string;
	pickDay: string;
	calendar: CalendarCopy;
	confirm: string;
	saved: string;
	undo: string;
	expenses: string;
	noExpenses: string;
	fills: string;
	holds: string;
	nothing: string;
	intent: string;
	intentLabels: Record<
		"new_record" | "not_mentioned" | "not_available",
		string
	>;
	intentBecause: (reason: IntentReason) => string;
	heldBecause: (reason: CardHeldReason) => string;
	/** Why the tags filled from the vendor, in a gap its answers left (ADR 0012). */
	impliedBecause: (vendor: string, tags: string) => string;
	tagQuestion: (tag: string) => string;
	yes: string;
	unresolved: (mark: string) => string;
	ambiguous: string;
};

/** The filter page's own words. */
export type FilterCopy = {
	transactions: string;
	boxLabel: string;
	placeholder: string;
	fields: Record<FieldName, string>;
	empty: string;
	applied: string;
	/** What a screen reader hears once an answer sets the controls: each field set, with its value, then each field held. */
	appliedFields: (
		set: [field: string, value: string][],
		held: string[],
	) => string;
	clear: string;
	showing: (count: number, total: number) => string;
	/** The table's pages, 10 rows each (#134). */
	pages: {
		label: string;
		previous: string;
		next: string;
		/** The rows on screen: the first and last, of every row kept. */
		range: (first: number, last: number, total: number) => string;
	};
	/** The table's own filter controls, which an answer sets and the person can change. */
	controls: {
		allVendors: string;
		allStatuses: string;
		/** The date range's first day, by name. */
		from: string;
		/** Its last day, by name. */
		to: string;
		/** What the first day's button shows while empty. */
		fromEmpty: string;
		/** What the last day's button shows while empty. */
		toEmpty: string;
		/** The amount range's lower bound, by name. */
		min: string;
		/** Its upper bound, by name. */
		max: string;
		/** The lower bound's placeholder. */
		minEmpty: string;
		/** The upper bound's placeholder. */
		maxEmpty: string;
		calendar: CalendarCopy;
	};
	none: string;
	vendorColumn: string;
	fills: string;
	holds: string;
	nothing: string;
	dateRange: (range: DateRange, date: (iso: string) => string) => string;
	amountRange: (
		range: AmountRange,
		amount: (value: number, currency?: string) => string,
	) => string;
	summary: (filled: number, total: number) => string;
	filledBecause: (probability: string, gate: string) => string;
	heldBecause: (reason: FieldHeldReason) => string;
	start: string;
	end: string;
	number: (text: string) => string;
	/** What each number of an amount can do: its bounds, or the exact amount. */
	roles: Record<Exclude<keyof AmountRange, "currency">, string>;
	more: (count: number) => string;
	gate: string;
	questions: string;
};

/** Why a search holds its item, as the state panel explains it. */
export type HeldReason =
	| { kind: "none-reached-gate"; none: string; gate: string }
	| { kind: "several-reached-gate"; several: string; gate: string }
	| { kind: "none-picked"; none: string }
	| { kind: "several-picked"; several: string }
	| { kind: "none-tied"; none: string }
	| { kind: "several-tied"; several: string }
	| { kind: "pair"; text: string }
	| { kind: "tie" }
	| { kind: "no-candidates" }
	| { kind: "provider" }
	| { kind: "timeout"; timeoutMs: number }
	| { kind: "unreachable"; message: string };

/**
 * What the page says once the demo stops calling on the owner's key (#109):
 * a heading and one paragraph per cause, then the way on.
 */
export type StoppedCopy = {
	budget: { title: string; body: string };
	/** The kill switch: no time it comes back, since the owner ends it. */
	paused: { title: string; body: string };
	key: { title: string; body: string };
	/** This visitor's limits (#110): each says when its calls come back. */
	minute: { title: string; body: string };
	day: { title: string; body: string };
	replay: string;
	clone: string;
};

export type Copy = {
	skip: string;
	stopped: StoppedCopy;
	product: string;
	casesLabel: string;
	cases: Record<Case, string>;
	hood: string;
	hoodViews: string;
	trace: string;
	json: string;
	code: string;
	/** The strip over the hood's tabs: what the displayed call took and used. */
	strip: string;
	stripIdle: string;
	notReported: string;
	jsonIdle: string;
	showLabel: string;
	app: string;
	languageLabel: string;
	themeLabel: string;
	themes: { system: string; light: string; dark: string };
	vendors: string;
	boxLabel: string;
	placeholder: string;
	suggestions: string;
	oneVendor: string;
	ambiguous: string;
	nothing: string;
	/** Once the answer held the item: no vendor matched. */
	empty: string;
	/** In its place when the call failed: nothing measured the vendors (#138). */
	unanswered: string;
	/** Over the vendors a request could mean, for the person to pick one (#134). */
	choices: string;
	/** In their place when several held the item and no vendor is above zero. */
	severalFit: string;
	/** Under `empty`, the likeliest vendors, for the person to pick one (#134). */
	closest: string;
	transactionsWith: (name: string) => string;
	columns: { number: string; date: string; amount: string; status: string };
	statuses: Record<TransactionStatus, string>;
	panel: string;
	idle: string;
	waiting: string;
	filled: string;
	held: string;
	failed: string;
	filledBecause: (
		name: string,
		none: string,
		several: string,
		gate: string,
	) => string;
	heldBecause: (reason: HeldReason) => string;
	request: string;
	candidate: string;
	probability: string;
	pick: string;
	gate: string;
	shortlistLabel: string;
	shortlist: (count: number, catalog: number) => string;
	latency: string;
	/** Shown only when `ask` called the provider twice (ADR 0013): the term, and the words beside the 2. */
	calls: string;
	retried: string;
	inputTokens: string;
	cost: string;
	/** The label on a case's recorded run, with the day it ran. */
	recorded: (date: string) => string;
	/** What a screen reader hears as the recorded run starts. */
	replaying: (date: string, request: string) => string;
	/** Beside the box: one sentence against the clicks and menus it takes to fill by hand the controls the answer filled. */
	saved: (cost: Cost) => string;
	filter: FilterCopy;
	card: CardCopy;
	calculator: CalculatorCopy;
};

/** The cost calculator below the case: one call scaled to a month. */
export type CalculatorCopy = {
	title: string;
	users: string;
	actions: string;
	costPerCall: string;
	perMonth: string;
	/** In the cost per call's place before any call. */
	noCall: string;
	/** In the month's place while it cannot be priced. */
	notPriced: string;
	idle: string;
	unpriced: string;
	invalid: string;
	/** Users, actions a day and the cost per call, formatted, times the days. */
	formula: (
		users: string,
		actions: string,
		cost: string,
		days: number,
	) => string;
	measured: string;
	/** The model's price per million input tokens, formatted. */
	rate: (model: string, rate: string) => string;
	readFrom: string;
	readOn: (date: string) => string;
};

/** One language's whole demo: UI text, suggested requests and data. */
export type Content = {
	language: Language;
	/** For numbers, amounts and dates. */
	locale: string;
	copy: Copy;
	vendors: Candidate<Vendor>[];
	transactions: Transaction[];
	/** The filter's status field reads these; the provider reads the description. */
	statuses: Candidate<TransactionStatus>[];
	suggestions: { oneVendor: string[]; ambiguous: string[]; nothing: string[] };
	filterSuggestions: { fills: string[]; holds: string[]; nothing: string[] };
	/** The card's tags field reads these; the provider reads the description. */
	tags: Candidate<Tag>[];
	cardSuggestions: { fills: string[]; holds: string[]; nothing: string[] };
	/**
	 * The card holds a request with one of these verbs and references, a
	 * command on an expense already recorded (ADR 0009). Per language:
	 * "quite" is a Spanish command and an English word.
	 */
	cardCommands: CardCommands;
	/**
	 * The words that join two vendors or tags into a pair the search, the
	 * filter and the card hold (ADR 0010, 0011).
	 */
	joiners: Joiners;
};

/**
 * The tags a vendor that sells office services alone implies for the
 * expense card, filled only where the tags' own questions left a gap (ADR
 * 0012).
 */
export const IMPLIES_OFFICE: { tags: Tag[] } = { tags: ["office"] };

/**
 * A catalog row: the provider reads the description, never the value. Its
 * brand is the word or two a request names it by (ADR 0010); what it
 * implies, the card's tags for a vendor whose every sale takes them (ADR
 * 0012).
 */
export function vendor(
	id: string,
	name: string,
	supplies: string,
	brand: string,
	implies?: { tags: Tag[] },
): Candidate<Vendor> {
	return {
		id,
		description: `${name}, ${supplies}`,
		value: { id, name, supplies },
		names: [brand],
		...(implies && { implies }),
	};
}

export function transaction(
	vendorId: string,
	number: string,
	date: string,
	amount: number,
	status: TransactionStatus,
): Transaction {
	return { vendorId, number, date, amount, status };
}

export function tag(id: Tag, description: string): Candidate<Tag> {
	return { id, description, value: id };
}

/** A payment status: the provider reads the id and the description. */
export function status(
	id: TransactionStatus,
	description: string,
): Candidate<TransactionStatus> {
	return { id, description, value: id };
}
