// The demo's card eval, by hand with the key in .env, never in CI: every
// row is a real Jev call.
//
//   node --conditions=source demo/eval/card.ts run <en|es> <eval|round2|round3|dev|diag> <n>
//   node --conditions=source demo/eval/card.ts compare <en|es> <eval|round2|round3> <first n> <second n>
//   node --conditions=source demo/eval/card.ts gates <dev n>
//
// `run` writes demo/eval/runs/card-<language>[-round2|-round3|-dev|-diag]-<n>.jsonl,
// which it never overwrites, and prints its report. `eval` is round 1's set,
// `round2` and `round3` the fresh sets of rounds 2 and 3, `diag` the probes
// of #57: commands on a recorded expense, and records with the command
// words in them. A dev or diag run gets no verdict: it tunes, it never
// decides. `compare` reads two saved eval runs and prints the second one's
// measures and flips, with no call. `gates` reads dev run <n> of both
// languages and prints the intent's and each field's gate by the rule in
// gates.ts, with no call.

import { readFile } from "node:fs/promises";
import {
	compareCardRuns,
	formatCardReport,
	parseCardEvalSet,
	readCardRun,
	runCardEval,
	scoreCardRun,
} from "justask/eval";
import { jevProvider } from "justask/jev";
import { contents, demoCard, FACTS, TIMEOUT_MS } from "../server/handler.ts";
import type { Language } from "../src/content/types.ts";
import { fixGate, poolFields } from "./gates.ts";
import { CARD_KILL_LINES } from "./kill-lines.ts";

/** Fixed, so every run reads the same day. */
const TODAY =
	"Today is Wednesday 2026-09-23 (miércoles 23 de septiembre de 2026).";

const SETS = {
	eval: { file: "", log: "" },
	round2: { file: ".round2", log: "-round2" },
	round3: { file: ".round3", log: "-round3" },
	dev: { file: ".dev", log: "-dev" },
	diag: { file: ".diag", log: "-diag" },
} as const;
type SetKind = keyof typeof SETS;
const isSet = (set: string | undefined): set is SetKind =>
	set !== undefined && Object.hasOwn(SETS, set);

const here = (path: string) => new URL(path, import.meta.url).pathname;
const setPath = (language: Language, set: SetKind) =>
	here(`card-${language}${SETS[set].file}.jsonl`);
const runLogPath = (language: Language, set: SetKind, n: string) =>
	here(`runs/card-${language}${SETS[set].log}-${n}.jsonl`);

const [command, ...rest] = process.argv.slice(2);

if (command === "run") {
	const [language, set, n] = rest;
	const content = contents[language as Language];
	if (!content || !isSet(set) || !n) usage();
	try {
		process.loadEnvFile(".env");
	} catch {
		// Fine when TYPESAFE_API_KEY is already in the environment.
	}
	const run = await runCardEval({
		set: parseCardEvalSet(
			await readFile(setPath(content.language, set), "utf8"),
		),
		card: demoCard(content),
		provider: jevProvider(),
		facts: { today: TODAY, ...FACTS },
		timeoutMs: TIMEOUT_MS,
		killLines: CARD_KILL_LINES,
		log: runLogPath(content.language, set, n),
	});
	const report = scoreCardRun(run);
	console.log(
		formatCardReport(
			set === "dev" || set === "diag" ? { ...report, verdict: null } : report,
		),
	);
} else if (command === "compare") {
	const [language, set, first, second] = rest;
	const content = contents[language as Language];
	if (
		!content ||
		!isSet(set) ||
		set === "dev" ||
		set === "diag" ||
		!first ||
		!second
	)
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

function usage(): never {
	console.error(
		"usage: card.ts run <en|es> <eval|round2|round3|dev|diag> <n> | compare <en|es> <eval|round2|round3> <first n> <second n> | gates <dev n>",
	);
	process.exit(1);
}
