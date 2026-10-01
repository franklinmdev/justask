import type { Provider } from "@justask/core";
import type { Ledger } from "../server/budget.ts";
import { createDemoHandler, logError } from "../server/handler.ts";

/**
 * The demo as a Cloudflare Worker: the handler behind /api/*, with the
 * frontend served as the Worker's static assets, which never reach this code
 * (wrangler.jsonc). Built once per isolate, at startup, so the catalogs'
 * shortlists are not rebuilt on a visitor's request. The ledger and the kill
 * switch come from the runtime (durable.ts); with none, the ledger is in
 * memory, as in the Node tests.
 */
export function createWorker(
	provider: Provider,
	{ ledger, killSwitch }: { ledger?: Ledger; killSwitch?: boolean } = {},
): {
	fetch(request: Request): Promise<Response>;
} {
	const handle = createDemoHandler(provider, {
		onError: logError,
		...(ledger && { ledger }),
		...(killSwitch !== undefined && { killSwitch }),
	});
	// The runtime also passes env and ctx, which the handler has no use for.
	return { fetch: (request) => handle(request) };
}
