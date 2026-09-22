export { formatReport } from "./format.ts";
export type { KillLines, Measure } from "./kill-lines.ts";
export {
	type Run,
	type RunEvalInput,
	type RunRow,
	readRun,
	runEval,
} from "./run.ts";
export {
	compareRuns,
	type Flip,
	type Measures,
	type Miss,
	type Report,
	type Side,
	scoreRun,
	type Verdict,
	type VerdictLine,
} from "./score.ts";
export { type EvalKind, type EvalRow, parseEvalSet } from "./set.ts";
