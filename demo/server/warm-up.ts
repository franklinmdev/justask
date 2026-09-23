import type { Provider } from "justask";
import { PROBE, PROBE_WARM_UP } from "../eval/probe.ts";
import { TIMEOUT_MS } from "./handler.ts";

/**
 * Discarded calls of the eval's probe request, straight to the provider, so
 * a cold start after idle falls on them and not on a call that counts (#65).
 * The eval runners send PROBE_WARM_UP before any row, and so does the
 * recording script before its recorded calls; the demo's dev server sends
 * one on start, before a visitor's first request. Each call waits at most
 * the demo's timeout, and a failed one is dropped: a warm-up only has to
 * reach the provider.
 */
export async function warmUp(
	provider: Provider,
	{
		times = PROBE_WARM_UP,
		timeoutMs = TIMEOUT_MS,
	}: { times?: number; timeoutMs?: number } = {},
): Promise<void> {
	for (let i = 0; i < times; i++) {
		const signal = AbortSignal.timeout(timeoutMs);
		const aborted = new Promise<void>((resolve) =>
			signal.addEventListener("abort", () => resolve(), { once: true }),
		);
		await Promise.race([
			Promise.resolve()
				.then(() => provider.answer({ ...PROBE, signal }))
				.catch(() => {}),
			aborted,
		]);
	}
}
