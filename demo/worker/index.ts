import type { Provider } from "justask";
import { jevProvider } from "justask/jev";
import { createDemoHandler, logError } from "../server/handler.ts";

/**
 * The demo as a Cloudflare Worker: the handler behind /api/*, with the
 * frontend served as the Worker's static assets, which never reach this code
 * (wrangler.jsonc). Built once per isolate, at startup, so the catalogs'
 * shortlists are not rebuilt on a visitor's request.
 */
export function createWorker(provider: Provider): {
	fetch(request: Request): Promise<Response>;
} {
	const handle = createDemoHandler(provider, { onError: logError });
	// The runtime also passes env and ctx, which the handler has no use for.
	return { fetch: (request) => handle(request) };
}

/**
 * The real Jev provider. Its TypeSafe client reads TYPESAFE_API_KEY from
 * process.env on the first call, which the Workers runtime fills from the
 * Worker's secret under nodejs_compat (wrangler.jsonc).
 */
export default createWorker(jevProvider());
