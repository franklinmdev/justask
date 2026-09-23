import type { Candidate } from "justask";

export type Language = "en" | "es";

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

/** Why a search holds its item, as the state panel explains it. */
export type HeldReason =
	| { kind: "none-reached-gate"; none: string; gate: string }
	| { kind: "tie" }
	| { kind: "no-candidates" }
	| { kind: "provider" }
	| { kind: "timeout"; timeoutMs: number }
	| { kind: "unreachable"; message: string };

export type Copy = {
	skip: string;
	product: string;
	page: string;
	languageLabel: string;
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
	filledBecause: (name: string, none: string, gate: string) => string;
	heldBecause: (reason: HeldReason) => string;
	request: string;
	candidate: string;
	probability: string;
	pick: string;
	gate: string;
	shortlistLabel: string;
	shortlist: (count: number, catalog: number) => string;
	roundTrip: string;
};

/** One language's whole demo: UI text, suggested requests and data. */
export type Content = {
	language: Language;
	/** For numbers, amounts and dates. */
	locale: string;
	copy: Copy;
	vendors: Candidate<Vendor>[];
	transactions: Transaction[];
	suggestions: { oneVendor: string[]; ambiguous: string[]; nothing: string[] };
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
