// The demo's card eval, by hand with the key in .env, never in CI: every
// row is a real Jev call.
//
//   node --conditions=source demo/eval/card.ts run <en|es> <eval|round2|round3|round4|round5|dev|diag|pair> <n>
//   node --conditions=source demo/eval/card.ts run <en|es> office <n> <label>
//   node --conditions=source demo/eval/card.ts office <en|es> <label> <n>
//   node --conditions=source demo/eval/card.ts compare <en|es> <eval|round2|round3|round4|round5> <first n> <second n>
//   node --conditions=source demo/eval/card.ts gates <dev n>
//
// `run` writes
// demo/eval/runs/card-<language>[-round2|-round3|-round4|-round5|-dev|-diag|-pair|-office-<label>]-<n>.jsonl,
// which it never overwrites, and prints its report. `eval` is round 1's
// set, `round2` to `round5` the fresh sets of rounds 2 to 5,
// `diag` the probes of #57: commands on a recorded expense, and records with
// the command words in them, and `pair` the probes of #63: two vendors named
// with "and" or "or", as a pair or beside the vendor paid, and `office` the
// probes of #77: office services, run with the office tag read by one of
// #77's labels (office.ts). A dev, diag, pair or office run gets no verdict:
// it tunes or diagnoses, it never decides. `office` reads a saved office run
// and prints the office tag's picks, with no call. `compare` reads two
// saved eval runs and prints the second one's measures and flips, with no
// call. `gates` reads dev run <n> of both
// languages and prints the intent's and each field's gate by the rule in
// gates.ts, with no call.

import { readFile } from "node:fs/promises";
import {
	type CardRun,
	compareCardRuns,
	formatCardReport,
	parseCardEvalSet,
	readCardRun,
	runCardEval,
	scoreCardRun,
} from "justask/eval";
import { jevProvider } from "justask/jev";
import { loadKeyEnv } from "../../scripts/load-env.ts";
import { contents, demoCard, FACTS, TIMEOUT_MS } from "../server/handler.ts";
import type { Language } from "../src/content/types.ts";
import { fixGate, poolFields } from "./gates.ts";
import { CARD_KILL_LINES } from "./kill-lines.ts";
import { officePicks, withOfficeLabel } from "./office.ts";
import { needBaseline, probe } from "./probe.ts";

/** Fixed, so every run reads the same day. */
const TODAY =
	"Today is Wednesday 2026-09-23 (miércoles 23 de septiembre de 2026).";

const SETS = {
	eval: { file: "", log: "" },
	round2: { file: ".round2", log: "-round2" },
	round3: { file: ".round3", log: "-round3" },
	round4: { file: ".round4", log: "-round4" },
	round5: { file: ".round5", log: "-round5" },
	dev: { file: ".dev", log: "-dev" },
	diag: { file: ".diag", log: "-diag" },
	pair: { file: ".pair", log: "-pair" },
	office: { file: ".office", log: "-office" },
} as const;
type SetKind = keyof typeof SETS;
const isSet = (set: string | undefined): set is SetKind =>
	set !== undefined && Object.hasOwn(SETS, set);
/** The sets that tune or diagnose: their runs never give a verdict. */
const NO_VERDICT = new Set<SetKind>(["dev", "diag", "pair", "office"]);

const here = (path: string) => new URL(path, import.meta.url).pathname;
const setPath = (language: Language, set: SetKind) =>
	here(`card-${language}${SETS[set].file}.jsonl`);
const runLogPath = (
	language: Language,
	set: SetKind,
	n: string,
	label?: string,
) =>
	here(
		`runs/card-${language}${SETS[set].log}${label ? `-${label}` : ""}-${n}.jsonl`,
	);

const [command, ...rest] = process.argv.slice(2);

if (command === "run") {
	const [language, set, n, label] = rest;
	const served = contents[language as Language];
	if (!served || !isSet(set) || !n || (set === "office") !== Boolean(label))
		usage();
	if (!NO_VERDICT.has(set)) needBaseline();
	const content = label ? withOfficeLabel(served, label) : served;
	loadKeyEnv(process.cwd());
	const run = await runCardEval({
		set: parseCardEvalSet(
			await readFile(setPath(content.language, set), "utf8"),
		),
		card: demoCard(content),
		provider: jevProvider(),
		facts: { today: TODAY, ...FACTS },
		timeoutMs: TIMEOUT_MS,
		killLines: CARD_KILL_LINES,
		log: runLogPath(content.language, set, n, label),
		probe: probe(),
	});
	const report = scoreCardRun(run);
	console.log(
		formatCardReport(
			NO_VERDICT.has(set) ? { ...report, verdict: null } : report,
		),
	);
	if (label) printOfficePicks(run);
} else if (command === "office") {
	const [language, label, n] = rest;
	const content = contents[language as Language];
	if (!content || !label || !n) usage();
	printOfficePicks(
		await readCardRun(runLogPath(content.language, "office", n, label)),
	);
} else if (command === "compare") {
	const [language, set, first, second] = rest;
	const content = contents[language as Language];
	if (!content || !isSet(set) || NO_VERDICT.has(set) || !first || !second)
		usage();
	const before = await readCardRun(runLogPath(content.language, set, first));
	const after = await readCardRun(runLogPath(content.language, set, second));
	console.log(
		formatCardReport(scoreCardRun(after), compareCardRuns(before, after)),
	);
} else if (command === "gates") {
	const [n] = rest;
	if (!n) usage();
	const reports = await Promise.all(
		Object.values(contents).map(async ({ language }) => {
			const { intent, fields } = scoreCardRun(
				await readCardRun(runLogPath(language, "dev", n)),
			);
			return { fields: { intent, ...fields } };
		}),
	);
	for (const [name, pooled] of Object.entries(poolFields(reports))) {
		console.log(
			`${name}: lowest right ${pooled.lowestRight ?? "none"}, highest wrong ${pooled.highestWrong ?? "none"}, gate ${fixGate(pooled)}`,
		);
	}
} else {
	usage();
}

function printOfficePicks(run: CardRun) {
	const { asked, yes, won, rows } = officePicks(run);
	console.log(
		`\nOffice tag, at the tags gate ${run.gates.tags}: yes ${yes} of ${asked}; won ${Object.entries(
			won,
		)
			.map(([pick, count]) => `${pick} ${count}`)
			.join(", ")}`,
	);
	for (const row of rows) {
		console.log(
			`  ${row.id}  ${row.pick} ${row.p.toFixed(2)}  new_record ${row.newRecord?.toFixed(2) ?? "none"}  ${row.request}`,
		);
	}
}

function usage(): never {
	console.error(
		"usage: card.ts run <en|es> <eval|round2|round3|round4|round5|dev|diag|pair> <n> | run <en|es> office <n> <label> | office <en|es> <label> <n> | compare <en|es> <eval|round2|round3|round4|round5> <first n> <second n> | gates <dev n>",
	);
	process.exit(1);
}
