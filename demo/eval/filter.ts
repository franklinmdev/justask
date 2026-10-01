// The demo's filter eval, by hand with the key in .env, never in CI: every
// row is a real Jev call.
//
//   node --conditions=justask-source demo/eval/filter.ts run <en|es> <eval|round2|round3|dev|pair> <n>
//   node --conditions=justask-source demo/eval/filter.ts compare <en|es> <eval|round2|round3> <first n> <second n>
//   node --conditions=justask-source demo/eval/filter.ts remeasure <en|es> <eval|round2|round3> <first n> <n>...
//   node --conditions=justask-source demo/eval/filter.ts merge <en|es> <eval|round2|round3> <first n> <n>...
//   node --conditions=justask-source demo/eval/filter.ts gates <dev n>
//
// `run` writes demo/eval/runs/filter-<language>[-round2|-round3|-dev|-pair]-<n>.jsonl,
// which it never overwrites, and prints its report. `eval` is round 1's set,
// `round2` the fresh set of round 2, the first with the named-pair hold
// (ADR 0011), `round3` the fresh set of round 3, the first with status
// pairs, and `pair` the probes of #75: two statuses named with "and" or
// "or", as a pair, beside a vendor pair, or with one of them negated. A dev
// or pair run gets no verdict: it tunes, it never decides. `compare`
// reads two saved runs of one set and prints the second one's measures and
// flips, with no call. `remeasure` sends again only the rows run <first n>
// left pending on transport failures (#93), into the last run named, after
// merging the remeasures named before it, which leaves only the rows still
// failing, and prints run <first n>'s report with every answer in place;
// `merge` prints that report again, with no call. `gates` reads dev run <n> of
// both languages and prints each field's gate by the rule in gates.ts,
// with no call.

import { readFile } from "node:fs/promises";
import {
	compareFilterRuns,
	type FilterEvalRow,
	type FilterRun,
	formatFilterReport,
	parseFilterEvalSet,
	readFilterRun,
	remeasureSet,
	runFilterEval,
	scoreFilterRun,
} from "@justask/core/eval";
import { jevProvider } from "@justask/core/jev";
import { loadKeyEnv } from "../../scripts/load-env.ts";
import { contents, demoFilter, FACTS, TIMEOUT_MS } from "../server/handler.ts";
import type { Content, Language } from "../src/content/types.ts";
import { fixGate, poolFields } from "./gates.ts";
import { FILTER_KILL_LINES } from "./kill-lines.ts";
import { needBaseline, probe } from "./probe.ts";
import { printRemeasure } from "./remeasure.ts";
import { evalSets } from "./sets.ts";

/** Fixed, so every run reads the same day. */
const TODAY = "Today is Tuesday 2026-09-22 (martes 22 de septiembre de 2026).";

const SETS = evalSets("filter", {
	/** Round 1's set. */
	eval: { verdict: true },
	/** The fresh sets of rounds 2 and 3. */
	round2: { verdict: true },
	round3: { verdict: true },
	/** The gates are fixed from its runs. */
	dev: { verdict: false },
	/** #75's probes. */
	pair: { verdict: false },
});
type SetKind = (typeof SETS.names)[number];

const here = (path: string) => new URL(path, import.meta.url).pathname;
const readSet = async (language: Language, set: SetKind) =>
	parseFilterEvalSet(await readFile(here(SETS.file(language, set)), "utf8"));
const runLogPath = (language: Language, set: SetKind, n: string) =>
	here(SETS.runLog(language, set, n));
/** Sends the rows through the demo's filter, into run log `log`. */
const sendRows = (content: Content, set: FilterEvalRow[], log: string) =>
	runFilterEval({
		set,
		filter: demoFilter(content),
		provider: jevProvider(),
		facts: { today: TODAY, ...FACTS },
		timeoutMs: TIMEOUT_MS,
		killLines: FILTER_KILL_LINES,
		log,
		probe: probe(),
	});

const [command, ...rest] = process.argv.slice(2);

if (command === "run") {
	const [language, set, n] = rest;
	const content = contents[language as Language];
	if (!content || !SETS.isSet(set) || !n) usage();
	if (SETS.givesVerdict(set)) needBaseline();
	loadKeyEnv();
	const run = await sendRows(
		content,
		await readSet(content.language, set),
		runLogPath(content.language, set, n),
	);
	const report = scoreFilterRun(run);
	console.log(
		formatFilterReport(
			SETS.givesVerdict(set) ? report : { ...report, verdict: null },
		),
	);
} else if (command === "compare") {
	const [language, set, first, second] = rest;
	const content = contents[language as Language];
	if (
		!content ||
		!SETS.isSet(set) ||
		!SETS.givesVerdict(set) ||
		!first ||
		!second
	)
		usage();
	const before = await readFilterRun(runLogPath(content.language, set, first));
	const after = await readFilterRun(runLogPath(content.language, set, second));
	console.log(
		formatFilterReport(scoreFilterRun(after), compareFilterRuns(before, after)),
	);
} else if (command === "remeasure" || command === "merge") {
	const [language, set, first, ...later] = rest;
	const content = contents[language as Language];
	if (
		!content ||
		!SETS.isSet(set) ||
		!SETS.givesVerdict(set) ||
		!first ||
		!later.at(-1)
	)
		usage();
	await printRemeasure<FilterRun>({
		first,
		later,
		read: (n) => readFilterRun(runLogPath(content.language, set, n)),
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
		report: (run) => formatFilterReport(scoreFilterRun(run)),
	});
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
	const sets = (keep: (set: SetKind) => boolean) =>
		SETS.names.filter(keep).join("|");
	console.error(
		`usage: filter.ts run <en|es> <${sets(() => true)}> <n> | compare <en|es> <${sets(SETS.givesVerdict)}> <first n> <second n> | remeasure|merge <en|es> <${sets(SETS.givesVerdict)}> <first n> <n>... | gates <dev n>`,
	);
	process.exit(1);
}
