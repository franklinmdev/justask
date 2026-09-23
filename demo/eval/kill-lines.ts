import type { KillLines } from "justask/eval";

/**
 * The search's kill lines, the same in both languages; the verdict passes only
 * when both do. Why each line sits where it does: docs/search-eval.md.
 */
export const KILL_LINES: KillLines = {
	exact: 0.9,
	coverage: 0.8,
	invented: 0,
	heldAmbiguous: 0.75,
	p95Ms: 800,
	errors: 0,
};

/**
 * The filter's kill lines, the same in both languages; the verdict passes only
 * when both do. The lab's filter lines, approved by the owner on 2026-09-22
 * (#17). Why each sits where it does: docs/filter-eval.md.
 */
export const FILTER_KILL_LINES: KillLines = {
	exact: 0.9,
	coverage: 0.7,
	invented: 0,
	heldAmbiguous: 0.75,
	p95Ms: 800,
	errors: 0,
};
