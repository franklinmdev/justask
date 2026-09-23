import {
	type AskError,
	createSearchHandler,
	type Facts,
	fuzzyShortlist,
	type Provider,
	type Search,
} from "justask";
import { searchEndpoint } from "../src/api.ts";
import { english } from "../src/content/en.ts";
import { spanish } from "../src/content/es.ts";
import type { Content, Language, Vendor } from "../src/content/types.ts";

/**
 * Fixed from the dev runs before the scored run, by the rule in
 * docs/search-eval.md: the midpoint between the highest none on a dev item
 * that filled right (0.17) and the lowest on a dev row with no single vendor
 * (0.23).
 */
export const GATE = 0.2;

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
				facts: FACTS,
				search: demoSearch(content),
				...(onError && { onError }),
			}),
		]),
	);
	return async (request) => {
		const route = routes.get(new URL(request.url).pathname);
		return route ? route(request) : new Response(null, { status: 404 });
	};
}
