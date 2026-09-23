import {
	type AskError,
	createFilterHandler,
	createSearchHandler,
	type Filter,
	fuzzyShortlist,
	type Provider,
} from "justask";
import { filterEndpoint, searchEndpoint } from "../src/api.ts";
import { english } from "../src/content/en.ts";
import { spanish } from "../src/content/es.ts";
import type {
	Content,
	Language,
	TransactionFields,
} from "../src/content/types.ts";

/**
 * Not measured on the demo's data yet; its search eval set will fix it. Until
 * then it sits in the gap the lab measured (ADR 0005): none at 0.00 to 0.03
 * on every request with an answer, and 0.58 or more on every one without.
 */
export const GATE = 0.5;

/** The lab's search p95 was under 650 ms; this leaves room for a slow call. */
const TIMEOUT_MS = 2_000;

/** How many vendors the provider reads per request, out of the 14. */
const SHORTLIST_LIMIT = 10;

/**
 * Not measured on the demo's data yet; the filter eval set (#17) will fix one
 * per field. Until then every field takes the lab's filter gate, 0.9, under
 * which it passed 6 of 6 kill lines.
 */
export const FILTER_GATE = 0.9;

const contents: Record<Language, Content> = { en: english, es: spanish };

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
 * The demo's server side: a search and a filter handler per language, each at
 * its own route with its own catalog. Both languages' local currency is USD,
 * so "$" and "dólares" read as USD and "pesos" names no currency. The
 * provider is built by the caller, on the server, so the key never reaches
 * the browser.
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
					facts: { local_currency: "USD" },
					search: {
						description: "the vendor the request means",
						gate: GATE,
						shortlist: fuzzyShortlist(content.vendors, {
							limit: SHORTLIST_LIMIT,
						}),
					},
					...(onError && { onError }),
				}),
			],
			[
				filterEndpoint(content.language),
				createFilterHandler({
					provider,
					timeoutMs: TIMEOUT_MS,
					facts: { local_currency: "USD" },
					filter: demoFilter(content),
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
