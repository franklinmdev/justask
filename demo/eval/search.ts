// The demo's search eval, by hand with the key in .env, never in CI: every
// row is a real Jev call.
//
//   node --conditions=justask-source demo/eval/search.ts run <en|es> <eval|round2|round3|round4|dev> <n>
//   node --conditions=justask-source demo/eval/search.ts compare <en|es> <eval|round2|round3|round4> <first n> <second n>
//   node --conditions=justask-source demo/eval/search.ts remeasure <en|es> <eval|round2|round3|round4> <first n> <n>...
//   node --conditions=justask-source demo/eval/search.ts merge <en|es> <eval|round2|round3|round4> <first n> <n>...
//
// `run` writes demo/eval/runs/search-<language>[-round2|-round3|-round4|-dev]-<n>.jsonl,
// which it never overwrites, and prints its report. `eval` is round 1's set,
// `round2`, `round3` and `round4` the fresh sets of rounds 2 to 4, round 4
// the first with the named-pair hold (ADR 0011). A dev run gets no
// verdict: it tunes, it never decides. `compare` reads two saved runs of one set
// and prints the second one's measures and flips, with no call.
// `remeasure` sends again only the rows run <first n> left pending on
// transport failures (#93), into the last run named, after merging the
// remeasures named before it, which leaves only the rows still failing, and
// prints run <first n>'s report with every answer in place; `merge` prints
// that report again, with no call.

import { readFile } from "node:fs/promises";
import {
	compareRuns,
	type EvalRow,
	formatReport,
	parseEvalSet,
	type Run,
	readRun,
	remeasureSet,
	runEval,
	scoreRun,
} from "@justask/core/eval";
import { jevProvider } from "@justask/core/jev";
import { loadKeyEnv } from "../../scripts/load-env.ts";
import { contents, demoSearch, FACTS, TIMEOUT_MS } from "../server/handler.ts";
import type { Content, Language } from "../src/content/types.ts";
import { KILL_LINES } from "./kill-lines.ts";
import { needBaseline, probe } from "./probe.ts";
import { printRemeasure } from "./remeasure.ts";
import { evalSets } from "./sets.ts";

/** Fixed, so every run reads the same day. */
const TODAY = "Today is Tuesday 2026-09-22 (martes 22 de septiembre de 2026).";

const SETS = evalSets("search", {
	/** Round 1's set. */
	eval: { verdict: true },
	/** The fresh sets of rounds 2 to 4. */
	round2: { verdict: true },
	round3: { verdict: true },
	round4: { verdict: true },
	/** It tunes, it never decides. */
	dev: { verdict: false },
});
type SetKind = (typeof SETS.names)[number];

const here = (path: string) => new URL(path, import.meta.url).pathname;
const readSet = async (language: Language, set: SetKind) =>
	parseEvalSet(await readFile(here(SETS.file(language, set)), "utf8"));
const runLogPath = (language: Language, set: SetKind, n: string) =>
	here(SETS.runLog(language, set, n));
/** Sends the rows through the demo's search, into run log `log`. */
const sendRows = (content: Content, set: EvalRow[], log: string) =>
	runEval({
		set,
		search: demoSearch(content),
		provider: jevProvider(),
		facts: { today: TODAY, ...FACTS },
		timeoutMs: TIMEOUT_MS,
		killLines: KILL_LINES,
		log,
		probe: probe(),
	});

const [command, language, ...rest] = process.argv.slice(2);
const content = contents[language as Language];
if (!content) usage();

if (command === "run") {
	const [set, n] = rest;
	if (!SETS.isSet(set) || !n) usage();
	if (SETS.givesVerdict(set)) needBaseline();
	loadKeyEnv();
	const run = await sendRows(
		content,
		await readSet(content.language, set),
		runLogPath(content.language, set, n),
	);
	const report = scoreRun(run);
	console.log(
		formatReport(
			SETS.givesVerdict(set) ? report : { ...report, verdict: null },
		),
	);
} else if (command === "compare") {
	const [set, first, second] = rest;
	if (!SETS.isSet(set) || !SETS.givesVerdict(set) || !first || !second) usage();
	const before = await readRun(runLogPath(content.language, set, first));
	const after = await readRun(runLogPath(content.language, set, second));
	console.log(formatReport(scoreRun(after), compareRuns(before, after)));
} else if (command === "remeasure" || command === "merge") {
	const [set, first, ...later] = rest;
	if (!SETS.isSet(set) || !SETS.givesVerdict(set) || !first || !later.at(-1))
		usage();
	await printRemeasure<Run>({
		first,
		later,
		read: (n) => readRun(runLogPath(content.language, set, n)),
		...(command === "remeasure" && {
			send: async (merged, n) => {
				needBaseline();
				loadKeyEnv();
				return sendRows(
					content,
					remeasureSet(merged, await readSet(content.language, set)),
					runLogPath(content.language, set, n),
				);
			},
		}),
		report: (run) => formatReport(scoreRun(run)),
	});
} else {
	usage();
}

function usage(): never {
	const sets = (keep: (set: SetKind) => boolean) =>
		SETS.names.filter(keep).join("|");
	console.error(
		`usage: search.ts run <en|es> <${sets(() => true)}> <n> | compare <en|es> <${sets(SETS.givesVerdict)}> <first n> <second n> | remeasure|merge <en|es> <${sets(SETS.givesVerdict)}> <first n> <n>...`,
	);
	process.exit(1);
}
