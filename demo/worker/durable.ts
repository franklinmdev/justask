import { env } from "cloudflare:workers";
import type { Provider } from "justask";
import { createWorker } from "./index.ts";
import { durableLedger, type LedgerNamespace } from "./ledger.ts";

export { DemoLedger } from "./ledger.ts";

/**
 * The Worker as deployed, over `provider`: its ledger is the DemoLedger
 * Durable Object bound as LEDGER, and the secret DEMO_KILL_SWITCH, set to any
 * value, turns the kill switch on (wrangler.jsonc, docs/workers.md). Both are
 * read once per isolate; setting or deleting a secret deploys a new version.
 */
export function durableWorker(provider: Provider) {
	return createWorker(provider, {
		ledger: durableLedger(env.LEDGER as LedgerNamespace),
		killSwitch: Boolean(env.DEMO_KILL_SWITCH),
	});
}
