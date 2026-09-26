import type { FilterValue } from "justask";
import type {
	FieldName,
	Transaction,
	TransactionFields,
} from "./content/types.ts";
import { foreignCurrency } from "./format.ts";

export type Applied = FilterValue<TransactionFields>;

/**
 * What the table's controls hold, and which of them the latest answer set
 * rather than the person.
 */
export type Table = { applied: Applied; byAnswer: FieldName[] };

/**
 * The Monday of the week the content's transactions are dated for, the week
 * of the eval sets' fixed today (2026-09-23): on any day of it they show as
 * written, their latest a Friday, 2026-09-18.
 */
export const DATED_WEEK = "2026-09-21";

const DAY_MS = 86_400_000;

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

/**
 * The transactions as the fictional app holds them on `today`, a YYYY-MM-DD:
 * moved by the whole weeks since the dated week, so a relative request
 * ("last week", "last month") finds the same shape of data on any day and
 * every invoice keeps its weekday (#122). A replay passes the day it was
 * recorded, so its rows are the ones it ran on.
 */
export function transactionsOn(
	transactions: Transaction[],
	today: string,
): Transaction[] {
	const weeks = Math.floor((dayNumber(today) - dayNumber(DATED_WEEK)) / 7);
	if (weeks === 0) return transactions;
	return transactions.map((row) => ({
		...row,
		date: new Date((dayNumber(row.date) + weeks * 7) * DAY_MS)
			.toISOString()
			.slice(0, 10),
	}));
}

/** Every row the table's controls keep. The table's amounts are in the local currency, so another one keeps none. */
export function matches(row: Transaction, filter: Applied): boolean {
	const { vendor, status, date, amount } = filter;
	if (vendor && row.vendorId !== vendor.id) return false;
	if (status && row.status !== status) return false;
	if (date?.from && row.date < date.from) return false;
	if (date?.to && row.date > date.to) return false;
	if (amount) {
		if (foreignCurrency(amount.currency)) return false;
		if (amount.min !== undefined && row.amount < amount.min) return false;
		if (amount.max !== undefined && row.amount > amount.max) return false;
	}
	return true;
}

/**
 * The table's controls once an answer applies: a filled field replaces its
 * control's value, a held one leaves it as it was. The amount control is two
 * bounds, so an exact amount sets both.
 */
export function applyTo(table: Applied, value: Applied): Applied {
	const next = { ...table, ...value };
	if (value.amount?.exact !== undefined) {
		const { exact, ...rest } = value.amount;
		next.amount = { ...rest, min: exact, max: exact };
	}
	return next;
}

/**
 * The table once a new answer applies: the fields earlier answers set go
 * first, so a new request starts over rather than narrowing the last one,
 * and only what the person set by hand stays beside it (#123). A field the
 * person set that the answer fills takes the answer's value.
 */
export function answerOver(table: Table, value: Applied): Table {
	const byHand = Object.fromEntries(
		Object.entries(table.applied).filter(
			([name]) => !table.byAnswer.includes(name as FieldName),
		),
	) as Applied;
	return {
		applied: applyTo(byHand, value),
		byAnswer: Object.keys(value) as FieldName[],
	};
}

/** The table once the person sets one control by hand: that field is theirs now. */
export function setByHand(
	table: Table,
	name: FieldName,
	applied: Applied,
): Table {
	return {
		applied,
		byAnswer: table.byAnswer.filter((other) => other !== name),
	};
}
