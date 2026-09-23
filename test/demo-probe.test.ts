import { describe, expect, it } from "vitest";
import {
	PROBE,
	PROBE_BASELINE_MS,
	PROBE_TIMES,
	PROBE_WARM_UP,
	probe,
} from "../demo/eval/probe.ts";

/**
 * Frozen on the owner's triage of #65, 2026-09-23, before any probe was
 * sent. The probe is one fixed request for every flow and language, so a
 * baseline measured on one run reads the others. A failure here means a
 * verdict's latency inputs changed: revert the edit, or log the owner's
 * call in docs/card-eval.md, Latency, with the new value.
 */
describe("the frozen provider probe", () => {
	it("keeps the probe request as approved", () => {
		expect(PROBE).toEqual({
			request: "the invoices for our catering last week",
			facts: { today: "Today is Tuesday 2026-09-22." },
			questions: [
				{
					id: "vendor",
					instruction: "Which vendor does the request mean?",
					labels: [
						{
							label: "acme",
							description: "Acme Supplies, office paper and toner",
						},
						{ label: "northwind", description: "Northwind Traders, catering" },
						{ label: "contoso", description: "Contoso Cloud, hosting" },
					],
				},
			],
		});
		expect(PROBE_TIMES).toBe(3);
		expect(PROBE_WARM_UP).toBe(3);
	});

	// Null until the first normal runs measure it; written before a verdict run.
	it("keeps the baseline as written", () => {
		expect(PROBE_BASELINE_MS).toBeNull();
		expect(probe()).toEqual({
			input: PROBE,
			warmUp: 3,
			times: 3,
			baselineMs: PROBE_BASELINE_MS,
		});
	});
});
