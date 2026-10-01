import type { Language } from "./content/types.ts";

/** Each language's catalog is its own route, so each route owns its data. */
export function searchEndpoint(language: Language): string {
	return `/api/search/${language}`;
}

export function filterEndpoint(language: Language): string {
	return `/api/filter/${language}`;
}

export function cardEndpoint(language: Language): string {
	return `/api/card/${language}`;
}

/**
 * The longest request the demo takes: the box stops at it, and the server
 * refuses a longer one with no provider call (#108). Counted as the box counts,
 * in UTF-16 code units.
 */
export const REQUEST_LIMIT = 200;

/**
 * The server's answer, 402, once the day's budget on the owner's key is
 * spent, with no provider call (#109). `cause` says which limit: here the
 * day's budget; the pause and a visitor's limits have their own below.
 */
export const BUDGET_EXCEEDED = {
	error: {
		kind: "budget_exceeded",
		cause: "budget",
		message: "The demo's budget for today is spent",
	},
} as const;

/**
 * The same 402 through the same path while the kill switch is on, whose
 * `cause` lets the page say the live demo is paused, with no time it comes
 * back: the switch ends when the owner turns it off, not at midnight (#109).
 */
export const DEMO_PAUSED = {
	error: {
		kind: "budget_exceeded",
		cause: "paused",
		message: "The live demo is paused",
	},
} as const;

/**
 * Each visitor's calls on the owner's key, counted by IP, an IPv6 address by
 * its /64, with no cookie: an office behind one address shares them (#110).
 */
export const VISITOR_MINUTE_LIMIT = 20;
export const VISITOR_DAY_LIMIT = 200;

/**
 * Each IPv6 /48's calls, beside each of its /64s' own (#250): a /56 holds 256
 * /64s, and at 200 calls a day each would spend the day's budget in minutes.
 * A /48 is one site's whole allocation, so it is looser than a visitor's: three
 * busy visitors at once, and five days' worth of one, about $0.10 a day at the
 * budget's reservation. Several visitors of one carrier's pool may share a
 * /48 and its limits.
 */
export const NETWORK_MINUTE_LIMIT = 60;
export const NETWORK_DAY_LIMIT = 1_000;

/**
 * The budget's 402 through the same path once this visitor's calls in a
 * minute, or in the UTC day, are used; `limit` says which, so the page can
 * say when it frees up (#110).
 */
export const VISITOR_MINUTE_USED = {
	error: {
		kind: "budget_exceeded",
		cause: "visitor",
		limit: "minute",
		message: `This visitor's ${VISITOR_MINUTE_LIMIT} calls a minute are used`,
	},
} as const;

export const VISITOR_DAY_USED = {
	error: {
		kind: "budget_exceeded",
		cause: "visitor",
		limit: "day",
		message: `This visitor's ${VISITOR_DAY_LIMIT} calls a day are used`,
	},
} as const;

/**
 * The same 402 once the calls of this visitor's IPv6 /48 in a minute, or in
 * the UTC day, are used, its cause the network, so the page names the
 * network's limits, not the visitor's (#250).
 */
export const NETWORK_MINUTE_USED = {
	error: {
		kind: "budget_exceeded",
		cause: "network",
		limit: "minute",
		message: `This network's ${NETWORK_MINUTE_LIMIT} calls a minute are used`,
	},
} as const;

export const NETWORK_DAY_USED = {
	error: {
		kind: "budget_exceeded",
		cause: "network",
		limit: "day",
		message: `This network's ${NETWORK_DAY_LIMIT} calls a day are used`,
	},
} as const;

/**
 * The server's answer, 503, when TypeSafe refused the owner's key with a 4xx
 * other than 429, so a key or account out of service never shows as a
 * request justask misread (#109).
 */
export const KEY_OUT_OF_SERVICE = {
	error: {
		kind: "key_out_of_service",
		message: "The demo's own key is out of service",
	},
} as const;

/**
 * Why the demo stopped calling on the owner's key, from the server's answer:
 * the day's budget, the kill switch, a key TypeSafe refused, or this
 * visitor's calls for the minute or the day (#110).
 */
export type Stopped =
	| "budget"
	| "paused"
	| "key"
	| "minute"
	| "day"
	| "networkMinute"
	| "networkDay";
