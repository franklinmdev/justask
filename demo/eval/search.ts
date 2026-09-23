// The demo's search eval, by hand with the key in .env, never in CI: every
// row is a real Jev call.
//
//   node --conditions=source demo/eval/search.ts run <en|es> <eval|dev> <n>
//   node --conditions=source demo/eval/search.ts compare <en|es> <first n> <second n>
//
// `run` writes demo/eval/runs/search-<language>[-dev]-<n>.jsonl, which it
// never overwrites, and prints its report. A dev run gets no verdict: it tunes,
// it never decides. `compare` reads two saved eval runs and prints the second
// one's measures and flips, with no call.

import { readFile } from "node:fs/promises";
import {
	compareRuns,
	formatReport,
	parseEvalSet,
	readRun,
	runEval,
	scoreRun,
} from "justask/eval";
import { jevProvider } from "justask/jev";
import { demoSearch, FACTS, TIMEOUT_MS } from "../server/handler.ts";
import { english } from "../src/content/en.ts";
import { spanish } from "../src/content/es.ts";
import type { Content, Language } from "../src/content/types.ts";
import { KILL_LINES } from "./kill-lines.ts";

/** Fixed, so every run reads the same day. */
const TODAY = "Today is Tuesday 2026-09-22 (martes 22 de septiembre de 2026).";

const contents: Record<Language, Content> = { en: english, es: spanish };
const here = (path: string) => new URL(path, import.meta.url).pathname;
const logOf = (language: Language, set: "eval" | "dev", n: string) =>
	here(`runs/search-${language}${set === "dev" ? "-dev" : ""}-${n}.jsonl`);

const [command, language, ...rest] = process.argv.slice(2);
const content = contents[language as Language];
if (!content) usage();

if (command === "run") {
	const [set, n] = rest;
	if ((set !== "eval" && set !== "dev") || !n) usage();
	try {
		process.loadEnvFile(".env");
	} catch {
		// Fine when TYPESAFE_API_KEY is already in the environment.
	}
	const file = `search-${content.language}${set === "dev" ? ".dev" : ""}.jsonl`;
	const run = await runEval({
		set: parseEvalSet(await readFile(here(file), "utf8")),
		search: demoSearch(content),
		provider: jevProvider(),
		facts: { today: TODAY, ...FACTS },
		timeoutMs: TIMEOUT_MS,
		killLines: KILL_LINES,
		log: logOf(content.language, set, n),
	});
	const report = scoreRun(run);
	console.log(
		formatReport(set === "dev" ? { ...report, verdict: null } : report),
	);
} else if (command === "compare") {
	const [first, second] = rest;
	if (!first || !second) usage();
	const before = await readRun(logOf(content.language, "eval", first));
	const after = await readRun(logOf(content.language, "eval", second));
	console.log(formatReport(scoreRun(after), compareRuns(before, after)));
} else {
	usage();
}

function usage(): never {
	console.error(
		"usage: search.ts run <en|es> <eval|dev> <n> | compare <en|es> <first n> <second n>",
	);
	process.exit(1);
}
