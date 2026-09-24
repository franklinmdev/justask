import { answer } from "../ask.ts";
import type { Provider, ProviderInput } from "../provider.ts";
import { readRunLog } from "./log.ts";

/**
 * A fixed request sent straight to the provider, a few times before a run's
 * rows and again after, so the run log holds the provider's latency apart
 * from the flow's (#65).
 */
export type Probe = {
	/** Sent as is, with no shortlist, parser or gate around it. */
	input: Omit<ProviderInput, "signal">;
	/**
	 * How many calls of the request go first, before the measured probes and
	 * before any row, so a cold start falls on them. Logged as warm-up, never
	 * counted in the probe median or the p95.
	 */
	warmUp: number;
	/** How many times before the rows, and again after. */
	times: number;
	/**
	 * The probes' median from the most recent normal runs, declared before the
	 * run and saved with it; null until one is measured, when no run is judged
	 * a slow window.
	 */
	baselineMs: number | null;
};

/** One probe's wait; a failed probe keeps why, and is left out of the median unless it timed out. */
export type ProbeResult = {
	latencyMs: number;
	error?: "provider" | "timeout";
};

/** A run's probes as its log saves them; `after` is missing when the run never finished. */
export type Probes = {
	baselineMs: number | null;
	/** Absent from logs written before the warm-up. */
	warmUp?: ProbeResult[];
	before: ProbeResult[];
	after?: ProbeResult[];
};

/** How the provider answered around a run, against the baseline saved with it. */
export type ProbeWindow = {
	/** Null when every probe failed. */
	medianMs: number | null;
	baselineMs: number | null;
	/** The probes' median is more than twice the baseline: the latency line is measured again. */
	slow: boolean;
};

/** Throws before any call when the probe cannot be sent or judged. */
function checkProbe({ warmUp, times, baselineMs }: Probe): void {
	if (!Number.isInteger(warmUp) || warmUp < 0) {
		throw new TypeError(
			"justask: a probe's warm-up is a whole number of calls, 0 or more",
		);
	}
	if (!Number.isInteger(times) || times < 1) {
		throw new TypeError(
			"justask: a probe is sent at least once before the rows and once after",
		);
	}
	if (baselineMs !== null && !(Number.isFinite(baselineMs) && baselineMs > 0)) {
		throw new TypeError(
			"justask: a probe's baseline is a latency in ms above 0, or null before one is measured",
		);
	}
}

/** Sends a run's probes, and the baseline saved beside them. */
export type ProbeSender = {
	baselineMs: number | null;
	warmUp: () => Promise<ProbeResult[]>;
	send: () => Promise<ProbeResult[]>;
};

/** Checks the probe before any call, and sends it through the run's provider under the run's timeout. */
export function probeSender(
	provider: Provider,
	probe: Probe | undefined,
	timeoutMs: number,
): ProbeSender | undefined {
	if (!probe) return undefined;
	checkProbe(probe);
	return {
		baselineMs: probe.baselineMs,
		warmUp: () =>
			sendProbes(provider, { ...probe, times: probe.warmUp }, timeoutMs),
		send: () => sendProbes(provider, probe, timeoutMs),
	};
}

/** Sends the probe `times` times, one after another, as `ask` would call the provider. */
async function sendProbes(
	provider: Provider,
	{ input, times }: Probe,
	timeoutMs: number,
): Promise<ProbeResult[]> {
	const results: ProbeResult[] = [];
	for (let i = 0; i < times; i++) {
		const started = performance.now();
		const outcome = await answer(provider, input, timeoutMs, { retry: false });
		const latencyMs = performance.now() - started;
		results.push(
			"error" in outcome
				? { latencyMs, error: outcome.error.kind }
				: { latencyMs },
		);
	}
	return results;
}

/**
 * The median over every measured probe of the runs given, the warm-up
 * left out. A timed out probe counts at
 * its wait, since the provider was at least that slow; one that failed fast
 * says nothing about latency and is left out. Null when none is left.
 */
export function probeMedian(runs: Probes[]): number | null {
	const waits = runs
		.flatMap(({ before, after = [] }) => [...before, ...after])
		.filter(({ error }) => error !== "provider")
		.map(({ latencyMs }) => latencyMs)
		.sort((a, b) => a - b);
	if (waits.length === 0) return null;
	const middle = Math.floor(waits.length / 2);
	return waits.length % 2
		? (waits[middle] as number)
		: ((waits[middle - 1] as number) + (waits[middle] as number)) / 2;
}

/** A run's window; null for a run saved before probes. */
export function probeWindow(probes: Probes | undefined): ProbeWindow | null {
	if (!probes) return null;
	const medianMs = probeMedian([probes]);
	const { baselineMs } = probes;
	return {
		medianMs,
		baselineMs,
		// Every probe failing is no normal window either: the latency is measured again.
		slow:
			baselineMs !== null && (medianMs === null || medianMs > 2 * baselineMs),
	};
}

/** Reads the probes of a run log written by any flow's run; null for one saved before probes. */
export async function readProbes(log: string): Promise<Probes | null> {
	const { header } = await readRunLog(log);
	return (header?.probes as Probes | undefined) ?? null;
}
