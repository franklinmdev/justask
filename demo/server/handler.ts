import {
	type AskError,
	type Card,
	createCardHandler,
	createFilterHandler,
	createSearchHandler,
	type Facts,
	type Filter,
	fuzzyShortlist,
	type Provider,
	type Search,
} from "justask";
import { cardEndpoint, filterEndpoint, searchEndpoint } from "../src/api.ts";
import { english } from "../src/content/en.ts";
import { spanish } from "../src/content/es.ts";
import type {
	Content,
	ExpenseFields,
	Language,
	TransactionFields,
	Vendor,
} from "../src/content/types.ts";

/**
 * Fixed by the owner for round 2, before its rows existed: round 1 failed at
 * 0.2, and 0.15 cleared every kill line on a rescore of round 1's run 1.
 * Judged on round 2's fresh sets only (docs/search-eval.md).
 */
export const GATE = 0.15;

/** The lab's search p95 was under 650 ms; this leaves room for a slow call. */
export const TIMEOUT_MS = 2_000;

/** Written beside today, which the handler adds from the browser's time zone. */
export const FACTS: Facts = { local_currency: "USD" };

/**
 * The whole catalog. At 10 of 14 the fill came from the catalog's first
 * vendors, so the last four were reachable only by a shared word: 5 of the 16
 * dev item rows never reached the provider (docs/search-eval.md).
 */
const SHORTLIST_LIMIT = 14;

export const contents: Record<Language, Content> = {
	en: english,
	es: spanish,
};

/** The search the demo serves in one language, which its eval sets measure. */
export function demoSearch(content: Content): Search<Vendor> {
	return {
		description: "the vendor the request means",
		gate: GATE,
		shortlist: fuzzyShortlist(content.vendors, { limit: SHORTLIST_LIMIT }),
	};
}

/**
 * Not measured on the demo's data yet; the filter eval set (#17) will fix one
 * per field. Until then every field takes the lab's filter gate, 0.9, under
 * which it passed 6 of 6 kill lines.
 */
export const FILTER_GATE = 0.9;

/**
 * The transactions table's filter in one language. The vendor field reads the
 * whole catalog, and the status field its three statuses.
 */
export function demoFilter(content: Content): Filter<TransactionFields> {
	return {
		description:
			"invoices the business received from its vendors, one row per invoice",
		fields: {
			vendor: {
				kind: "catalog",
				description: "the vendor who sent the invoices",
				gate: FILTER_GATE,
				shortlist: () => content.vendors,
			},
			status: {
				kind: "catalog",
				description: "the payment status of the invoices",
				gate: FILTER_GATE,
				shortlist: () => content.statuses,
			},
			date: {
				kind: "date",
				description: "the invoice date",
				gate: FILTER_GATE,
			},
			amount: {
				kind: "amount",
				description: "the invoice amount",
				gate: FILTER_GATE,
			},
		},
	};
}

/**
 * Not measured on the demo's data yet; the card eval set (#20) will fix the
 * intent's and each field's. Until then all take the lab's card gate, 0.9,
 * under which it passed 7 of 7 kill lines.
 */
export const CARD_GATE = 0.9;

/**
 * The expense card in one language: an expense the business paid, with its
 * vendor from the whole catalog, its tags, the day it was spent, read back
 * from today, and the amount.
 */
export function demoCard(content: Content): Card<ExpenseFields> {
	return {
		description: "expense the business paid",
		gate: CARD_GATE,
		fields: {
			vendor: {
				kind: "catalog",
				description: "the vendor who was paid",
				gate: CARD_GATE,
				shortlist: () => content.vendors,
			},
			tags: {
				kind: "catalog",
				several: true,
				description: "the expense's tags",
				gate: CARD_GATE,
				shortlist: () => content.tags,
			},
			spent_on: {
				kind: "date",
				reads: "past",
				description: "the day the money was spent",
				gate: CARD_GATE,
			},
			total: {
				kind: "amount",
				description: "the amount paid",
				gate: CARD_GATE,
			},
		},
	};
}

/**
 * The demo's server side: a search, a filter and a card handler per
 * language, each at its own route with its own catalog. Both languages'
 * local currency is USD, so "$" and "dólares" read as USD and "pesos" names
 * no currency. The provider is built by the caller, on the server, so the key
 * never reaches the browser.
 */
export function createDemoHandler(
	provider: Provider,
	{ onError }: { onError?: (error: AskError) => void } = {},
): (request: Request) => Promise<Response> {
	const routes = new Map(
		Object.values(contents).flatMap((content) => [
			[
				searchEndpoint(content.language),
				createSearchHandler({
					provider,
					timeoutMs: TIMEOUT_MS,
					facts: FACTS,
					search: demoSearch(content),
					...(onError && { onError }),
				}),
			],
			[
				filterEndpoint(content.language),
				createFilterHandler({
					provider,
					timeoutMs: TIMEOUT_MS,
					facts: FACTS,
					filter: demoFilter(content),
					...(onError && { onError }),
				}),
			],
			[
				cardEndpoint(content.language),
				createCardHandler({
					provider,
					timeoutMs: TIMEOUT_MS,
					facts: FACTS,
					card: demoCard(content),
					...(onError && { onError }),
				}),
			],
		]),
	);
	return async (request) => {
		const route = routes.get(new URL(request.url).pathname);
		return route ? route(request) : new Response(null, { status: 404 });
	};
}
