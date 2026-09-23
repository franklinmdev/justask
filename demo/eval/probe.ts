import type { Probe } from "justask/eval";

/**
 * The fixed request every eval run sends straight to the provider, three
 * times before its rows and three after, so the run log holds the
 * provider's latency apart from the flow's (#65). The same for search,
 * filter and card, in both languages, so one baseline reads them all. Frozen
 * by value in test/demo-probe.test.ts.
 */
export const PROBE: Probe["input"] = {
	request: "the invoices for our catering last week",
	facts: { today: "Today is Tuesday 2026-09-22." },
	questions: [
		{
			id: "vendor",
			instruction: "Which vendor does the request mean?",
			labels: [
				{ label: "acme", description: "Acme Supplies, office paper and toner" },
				{ label: "northwind", description: "Northwind Traders, catering" },
				{ label: "contoso", description: "Contoso Cloud, hosting" },
			],
		},
	],
};

export const PROBE_TIMES = 3;

/**
 * The probes' median from the most recent normal runs, written here before
 * a verdict run and frozen by value in test/demo-probe.test.ts. Null until
 * the first is measured: a dev run may run without it, a verdict run may
 * not. How it is measured: docs/card-eval.md, Latency.
 */
export const PROBE_BASELINE_MS: number | null = null;

/** The probe a run sends, under the baseline declared before it. */
export const probe = (): Probe => ({
	input: PROBE,
	times: PROBE_TIMES,
	baselineMs: PROBE_BASELINE_MS,
});

/** Stops a verdict run before any call while no baseline is written. */
export function needBaseline(): void {
	if (PROBE_BASELINE_MS !== null) return;
	console.error(
		"no probe baseline yet: write PROBE_BASELINE_MS in demo/eval/probe.ts from the latest normal runs (demo/eval/baseline.ts) before a verdict run",
	);
	process.exit(1);
}
