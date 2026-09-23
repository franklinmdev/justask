// The demo's filter eval, by hand with the key in .env, never in CI: every
// row is a real Jev call.
//
//   node --conditions=source demo/eval/filter.ts run <en|es> <eval|round2|dev|pair> <n>
//   node --conditions=source demo/eval/filter.ts compare <en|es> <eval|round2> <first n> <second n>
//   node --conditions=source demo/eval/filter.ts gates <dev n>
//
// `run` writes demo/eval/runs/filter-<language>[-round2|-dev|-pair]-<n>.jsonl,
// which it never overwrites, and prints its report. `eval` is round 1's set,
// `round2` the fresh set of round 2, the first with the named-pair hold
// (ADR 0011), and `pair` the probes of #75: two statuses named with "and" or
// "or", as a pair, beside a vendor pair, or with one of them negated. A dev
// or pair run gets no verdict: it tunes, it never decides. `compare`
// reads two saved runs of one set and prints the second one's measures and
// flips, with no call. `gates` reads dev run <n> of
// both languages and prints each field's gate by the rule in gates.ts,
// with no call.

import { readFile } from "node:fs/promises";
import {
	compareFilterRuns,
	formatFilterReport,
	parseFilterEvalSet,
	readFilterRun,
	runFilterEval,
	scoreFilterRun,
} from "justask/eval";
import { jevProvider } from "justask/jev";
import { loadKeyEnv } from "../../scripts/load-env.ts";
import { contents, demoFilter, FACTS, TIMEOUT_MS } from "../server/handler.ts";
import type { Language } from "../src/content/types.ts";
import { fixGate, poolFields } from "./gates.ts";
import { FILTER_KILL_LINES } from "./kill-lines.ts";
import { needBaseline, probe } from "./probe.ts";

/** Fixed, so every run reads the same day. */
const TODAY = "Today is Tuesday 2026-09-22 (martes 22 de septiembre de 2026).";

const SETS = {
	eval: { file: "", log: "" },
	round2: { file: ".round2", log: "-round2" },
	dev: { file: ".dev", log: "-dev" },
	pair: { file: ".pair", log: "-pair" },
} as const;
type SetKind = keyof typeof SETS;
const isSet = (set: string | undefined): set is SetKind =>
	set !== undefined && Object.hasOwn(SETS, set);

/** The sets that tune or probe: their runs never give a verdict. */
const NO_VERDICT = new Set<SetKind>(["dev", "pair"]);

const here = (path: string) => new URL(path, import.meta.url).pathname;
const setPath = (language: Language, set: SetKind) =>
	here(`filter-${language}${SETS[set].file}.jsonl`);
const runLogPath = (language: Language, set: SetKind, n: string) =>
	here(`runs/filter-${language}${SETS[set].log}-${n}.jsonl`);

const [command, ...rest] = process.argv.slice(2);

if (command === "run") {
	const [language, set, n] = rest;
	const content = contents[language as Language];
	if (!content || !isSet(set) || !n) usage();
	if (!NO_VERDICT.has(set)) needBaseline();
	loadKeyEnv(process.cwd());
	const run = await runFilterEval({
		set: parseFilterEvalSet(
			await readFile(setPath(content.language, set), "utf8"),
		),
		filter: demoFilter(content),
		provider: jevProvider(),
		facts: { today: TODAY, ...FACTS },
		timeoutMs: TIMEOUT_MS,
		killLines: FILTER_KILL_LINES,
		log: runLogPath(content.language, set, n),
		probe: probe(),
	});
	const report = scoreFilterRun(run);
	console.log(
		formatFilterReport(
			NO_VERDICT.has(set) ? { ...report, verdict: null } : report,
		),
	);
} else if (command === "compare") {
	const [language, set, first, second] = rest;
	const content = contents[language as Language];
	if (!content || !isSet(set) || NO_VERDICT.has(set) || !first || !second)
		usage();
	const before = await readFilterRun(runLogPath(content.language, set, first));
	const after = await readFilterRun(runLogPath(content.language, set, second));
	console.log(
		formatFilterReport(scoreFilterRun(after), compareFilterRuns(before, after)),
	);
} else if (command === "gates") {
	const [n] = rest;
	if (!n) usage();
	const reports = await Promise.all(
		Object.values(contents).map(async ({ language }) =>
			scoreFilterRun(await readFilterRun(runLogPath(language, "dev", n))),
		),
	);
	for (const [name, pooled] of Object.entries(poolFields(reports))) {
		console.log(
			`${name}: lowest right ${pooled.lowestRight ?? "none"}, highest wrong ${pooled.highestWrong ?? "none"}, gate ${fixGate(pooled)}`,
		);
	}
} else {
	usage();
}

function usage(): never {
	console.error(
		"usage: filter.ts run <en|es> <eval|round2|dev|pair> <n> | compare <en|es> <eval|round2> <first n> <second n> | gates <dev n>",
	);
	process.exit(1);
}
