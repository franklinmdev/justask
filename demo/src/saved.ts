import type { CardValue, FilterValue } from "justask";
import type {
	ExpenseFields,
	TransactionFields,
	Vendor,
} from "./content/types.ts";

/** What the person works to set one control by hand. */
export type Cost = { clicks: number; menus: number };

/** The kinds of control the showcase's apps set from an answer. */
export type ControlKind = "menu" | "calendar" | "box" | "checkbox";

/**
 * What setting one control of each kind takes by hand. A floor: the steps
 * between a calendar's months, and the typing, are not counted.
 */
export const costs: Record<ControlKind, Cost> = {
	// Open the menu, pick the option.
	menu: { clicks: 2, menus: 1 },
	// Open the calendar, pick the day.
	calendar: { clicks: 2, menus: 1 },
	// Click into the box, then type.
	box: { clicks: 1, menus: 0 },
	checkbox: { clicks: 1, menus: 0 },
};

/**
 * The table's controls an answer sets: the vendor's and the status's menus,
 * a calendar per end of the date range, and a box per bound of the amount,
 * both for an exact amount. A held field is not in the value, so it sets none.
 */
export function tableControls(
	value: FilterValue<TransactionFields>,
): ControlKind[] {
	const { vendor, status, date, amount } = value;
	const kinds: ControlKind[] = [];
	if (vendor) kinds.push("menu");
	if (status) kinds.push("menu");
	if (date?.from) kinds.push("calendar");
	if (date?.to) kinds.push("calendar");
	if (amount?.exact !== undefined) kinds.push("box", "box");
	else {
		if (amount?.min !== undefined) kinds.push("box");
		if (amount?.max !== undefined) kinds.push("box");
	}
	return kinds;
}

/** The form's controls an answer fills: the vendor's menu, a checkbox per tag, the day's calendar and the amount's box. */
export function formControls(value: CardValue<ExpenseFields>): ControlKind[] {
	const kinds: ControlKind[] = [];
	if (value.vendor) kinds.push("menu");
	for (const _ of value.tags ?? []) kinds.push("checkbox");
	if (value.spent_on) kinds.push("calendar");
	if (value.total) kinds.push("box");
	return kinds;
}

/** The vendor found: by hand, a pick from the vendor list's menu. A held item sets nothing. */
export function searchControls(item: Vendor | null): ControlKind[] {
	return item ? ["menu"] : [];
}

/** What the controls take by hand together, or null when the answer set none. */
export function costOf(kinds: ControlKind[]): Cost | null {
	if (kinds.length === 0) return null;
	return kinds.reduce(
		(sum, kind) => ({
			clicks: sum.clicks + costs[kind].clicks,
			menus: sum.menus + costs[kind].menus,
		}),
		{ clicks: 0, menus: 0 },
	);
}
