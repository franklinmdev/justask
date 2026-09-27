import type { Provider } from "justask";
import { type ProbeResult, probeSender } from "justask/eval";
import { PROBE_WARM_UP, probe } from "../eval/probe.ts";
import { keyRefused } from "./budget.ts";
import { TIMEOUT_MS } from "./handler.ts";

/**
 * Discarded calls of the eval's probe request, straight to the provider, so
 * a cold start after idle falls on them and not on a call that counts (#65).
 * The eval runners send PROBE_WARM_UP before any row, and so does the
 * recording script before its recorded calls; the demo's dev server sends
 * one on start, before a visitor's first request. Each call goes through the
 * eval's own warm-up, under the demo's timeout, and a failed one is dropped:
 * a warm-up only has to reach the provider. Answers each call's result.
 */
export async function warmUp(
	provider: Provider,
	{
		times = PROBE_WARM_UP,
		timeoutMs = TIMEOUT_MS,
	}: { times?: number; timeoutMs?: number } = {},
): Promise<ProbeResult[]> {
	return probeSender(
		provider,
		{ ...probe(), warmUp: times },
		timeoutMs,
	).warmUp();
}

/**
 * The dev server's one warm-up call on start, and the line it logs: how long
 * the call took, or why it failed, so a refused key or an unreachable
 * provider shows at start and not on the first live request (#224). With the
 * kill switch on no call is sent, since the switch stops every call.
 */
export async function warmOnStart(
	provider: Provider,
	{
		killSwitch,
		timeoutMs = TIMEOUT_MS,
	}: { killSwitch: boolean; timeoutMs?: number },
): Promise<{ level: "info" | "warn"; message: string }> {
	if (killSwitch) {
		return {
			level: "info",
			message: "justask: the kill switch is on, so no warm-up call is sent",
		};
	}
	// The probe's result names only the error's kind; its cause is kept here.
	let cause: unknown;
	const [result] = await warmUp(
		{
			answer: (input) =>
				Promise.resolve()
					.then(() => provider.answer(input))
					.catch((error: unknown) => {
						cause = error;
						throw error;
					}),
		},
		{ times: 1, timeoutMs },
	);
	if (result && !result.error) {
		return {
			level: "info",
			message: `justask: provider warmed up in ${Math.round(result.latencyMs)} ms`,
		};
	}
	const reason =
		result?.error === "timeout"
			? `the provider did not answer within ${timeoutMs} ms`
			: keyRefused(cause)
				? "TypeSafe refused the key in TYPESAFE_API_KEY, so every request will answer that the key is out of service"
				: `the provider call failed (${cause instanceof Error ? cause.message : "its answer was not usable"})`;
	return { level: "warn", message: `justask: warm-up failed: ${reason}` };
}
