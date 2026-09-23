/**
 * A pass or fail threshold on each measure, written and frozen before the
 * first scored run on an eval set. Every line is required: there is no
 * default, as there is no default gate (ADR 0003).
 */
export type KillLines = {
	/** Share of filled items that are the expected one: at least this. */
	exact: number;
	/** Share of item rows whose item filled: at least this. */
	coverage: number;
	/** Nothing rows that got an item anyway: at most this many. */
	invented: number;
	/** Share of ambiguous rows whose item stayed held: at least this. */
	heldAmbiguous: number;
	/** 95th percentile latency of answered rows, in ms: at most this. */
	p95Ms: number;
	/** Rows the provider failed or timed out on: at most this many. */
	errors: number;
};

export type Measure = keyof KillLines;

/** Every measure in report order, whether higher is better, and whether it is a rate. */
export const MEASURES: { measure: Measure; atLeast: boolean; rate: boolean }[] =
	[
		{ measure: "exact", atLeast: true, rate: true },
		{ measure: "coverage", atLeast: true, rate: true },
		{ measure: "invented", atLeast: false, rate: false },
		{ measure: "heldAmbiguous", atLeast: true, rate: true },
		{ measure: "p95Ms", atLeast: false, rate: false },
		{ measure: "errors", atLeast: false, rate: false },
	];

/** Throws before any call when a kill line is missing or cannot be met by any run. */
export function checkKillLines(killLines: KillLines): void {
	for (const { measure, rate } of MEASURES) {
		const line = killLines[measure];
		const valid =
			typeof line === "number" &&
			Number.isFinite(line) &&
			line >= 0 &&
			(!rate || line <= 1);
		if (!valid) {
			throw new TypeError(
				`justask: the kill line "${measure}" must be ${rate ? "a rate from 0 to 1" : "a number of at least 0"}, declared before the run`,
			);
		}
	}
}
