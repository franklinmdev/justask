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
 * spent, or the kill switch is on, with no provider call (#109). `cause` says
 * which limit: the day's budget, the only one so far.
 */
export const BUDGET_EXCEEDED = {
	error: {
		kind: "budget_exceeded",
		cause: "budget",
		message: "The demo's budget for today is spent",
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

/** Why the demo stopped calling on the owner's key, from the server's answer. */
export type Stopped =
	| (typeof BUDGET_EXCEEDED)["error"]["kind"]
	| (typeof KEY_OUT_OF_SERVICE)["error"]["kind"];
