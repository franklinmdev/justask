import type {
	AmountField,
	AmountRange,
	Candidate,
	CardDateField,
	CatalogField,
	DateField,
	DateRange,
	SeveralCatalogField,
} from "justask";

export type Language = "en" | "es";

/** One page per flow. */
export type Page = "search" | "filter" | "card";

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
	| { kind: "conflict" };

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
	| { kind: "failed" };

/** The card page's own words. */
export type CardCopy = {
	title: string;
	boxLabel: string;
	placeholder: string;
	fields: Record<ExpenseName, string>;
	tags: Record<Tag, string>;
	chooseVendor: string;
	/** Beside a field's label while its value is the one the request gave. */
	fromRequest: string;
	/** What a screen reader hears, and the page shows, once an answer comes back. */
	announce: (filled: string[], waiting: string[]) => string;
	pickDay: string;
	calendar: {
		label: string;
		previous: string;
		next: string;
		clear: string;
	};
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
	proposed: string;
	fields: Record<FieldName, string>;
	/** The visible text of a proposed filter's remove button. */
	remove: string;
	removeLabel: (field: string) => string;
	/** What a screen reader hears once a proposed filter is removed. */
	removed: (field: string) => string;
	confirm: string;
	/** Says who fills a held field, since the demo's table has no controls of its own. */
	heldHint: string;
	empty: string;
	applied: string;
	clear: string;
	showing: (count: number, total: number) => string;
	none: string;
	vendorColumn: string;
	fills: string;
	holds: string;
	nothing: string;
	dateRange: (range: DateRange, date: (iso: string) => string) => string;
	amountRange: (
		range: AmountRange,
		amount: (value: number) => string,
	) => string;
	summary: (filled: number, total: number) => string;
	filledBecause: (probability: string, gate: string) => string;
	heldBecause: (reason: FieldHeldReason) => string;
	start: string;
	end: string;
	number: (text: string) => string;
	roles: Record<"min" | "max" | "exact", string>;
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
	| { kind: "tie" }
	| { kind: "no-candidates" }
	| { kind: "provider" }
	| { kind: "timeout"; timeoutMs: number }
	| { kind: "unreachable"; message: string };

export type Copy = {
	skip: string;
	product: string;
	pagesLabel: string;
	pages: Record<Page, string>;
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
	empty: string;
	chooseHint: string;
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
	roundTrip: string;
	filter: FilterCopy;
	card: CardCopy;
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
};

/** A catalog row: the provider reads the description, never the value. */
export function vendor(
	id: string,
	name: string,
	supplies: string,
): Candidate<Vendor> {
	return {
		id,
		description: `${name}, ${supplies}`,
		value: { id, name, supplies },
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

export function status(
	id: TransactionStatus,
	description: string,
): Candidate<TransactionStatus> {
	return { id, description, value: id };
}
