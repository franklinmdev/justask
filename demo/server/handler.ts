import {
	type AskError,
	createSearchHandler,
	fuzzyShortlist,
	type Provider,
} from "justask";
import { searchEndpoint } from "../src/api.ts";
import { english } from "../src/content/en.ts";
import { spanish } from "../src/content/es.ts";
import type { Content, Language } from "../src/content/types.ts";

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

const contents: Record<Language, Content> = { en: english, es: spanish };

/**
 * The demo's server side: one search handler per language, each at its own
 * route with its own catalog. The provider is built by the caller, on the
 * server, so the key never reaches the browser.
 */
export function createDemoHandler(
	provider: Provider,
	{ onError }: { onError?: (error: AskError) => void } = {},
): (request: Request) => Promise<Response> {
	const routes = new Map(
		Object.values(contents).map((content) => [
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
		]),
	);
	return async (request) => {
		const route = routes.get(new URL(request.url).pathname);
		return route ? route(request) : new Response(null, { status: 404 });
	};
}
