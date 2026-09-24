// The demo's card eval, by hand with the key in .env, never in CI: every
// row is a real Jev call.
//
//   node --conditions=source demo/eval/card.ts run <en|es> <set> <n>
//   node --conditions=source demo/eval/card.ts run <en|es> office <n> <label>
//   node --conditions=source demo/eval/card.ts office <en|es> <n> <label>
//   node --conditions=source demo/eval/card.ts gaps <en|es> <n>
//   node --conditions=source demo/eval/card.ts compare <en|es> <set> <first n> <second n>
//   node --conditions=source demo/eval/card.ts gates <dev n>
//
// The sets, where each one's file and logs live, and which give a verdict
// are in card-sets.ts. `run` writes its set's log, which it never
// overwrites, and prints its report; a labelled set, `office`, also takes
// one of #77's office labels (office.ts). `office` reads a saved office run
// and prints the office tag's picks, and `gaps` a saved notoffice run and
// prints where the tags left the gap the vendor fills (ADR 0012), both with
// no call; a run of either set prints the same after its report. `compare`
// reads two saved runs of a set with a verdict and prints the second one's
// measures and flips, with no call. `gates` reads dev run <n> of both
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
import {
	CARD_SET_NAMES,
	type CardSet,
	cardRunLog,
	cardSetFile,
	givesVerdict,
	isCardSet,
	isLabelled,
} from "./card-sets.ts";
import { fixGate, poolFields } from "./gates.ts";
import { CARD_KILL_LINES } from "./kill-lines.ts";
import { officePicks, tagGaps, withOfficeLabel } from "./office.ts";
import { needBaseline, probe } from "./probe.ts";

/** Fixed, so every run reads the same day. */
const TODAY =
	"Today is Wednesday 2026-09-23 (miércoles 23 de septiembre de 2026).";

const here = (path: string) => new URL(path, import.meta.url).pathname;
const runLogPath = (...args: Parameters<typeof cardRunLog>) =>
	here(cardRunLog(...args));

/** What a run of a probe set prints after its report. */
const AFTER_REPORT: Partial<Record<CardSet, (run: CardRun) => void>> = {
	office: printOfficePicks,
	notoffice: printTagGaps,
};

const [command, ...rest] = process.argv.slice(2);

if (command === "run") {
	const [language, set, n, label] = rest;
	const served = contents[language as Language];
	if (!served || !isCardSet(set) || !n || isLabelled(set) !== Boolean(label))
		usage();
	if (givesVerdict(set)) needBaseline();
	const content = label ? withOfficeLabel(served, label) : served;
	loadKeyEnv(process.cwd());
	const run = await runCardEval({
		set: parseCardEvalSet(
			await readFile(here(cardSetFile(content.language, set)), "utf8"),
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
		formatCardReport(givesVerdict(set) ? report : { ...report, verdict: null }),
	);
	AFTER_REPORT[set]?.(run);
} else if (command === "gaps") {
	const [language, n] = rest;
	const content = contents[language as Language];
	if (!content || !n) usage();
	printTagGaps(await readCardRun(runLogPath(content.language, "notoffice", n)));
} else if (command === "office") {
	const [language, n, label] = rest;
	const content = contents[language as Language];
	if (!content || !n || !label) usage();
	printOfficePicks(
		await readCardRun(runLogPath(content.language, "office", n, label)),
	);
} else if (command === "compare") {
	const [language, set, first, second] = rest;
	const content = contents[language as Language];
	if (!content || !isCardSet(set) || !givesVerdict(set) || !first || !second)
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
			`  ${row.id}  ${row.pick} ${row.probability.toFixed(2)}  new_record ${row.newRecord?.toFixed(2) ?? "none"}  ${row.request}`,
		);
	}
}

function printTagGaps(run: CardRun) {
	const { rows, gaps, filled } = tagGaps(run);
	console.log(
		`\nTags left a gap on ${gaps} of ${rows.length} rows; the vendor filled office on ${filled}`,
	);
	for (const row of rows) {
		console.log(
			`  ${row.id}  ${row.gap ? "gap" : "no gap"}${row.filled ? ", office filled" : ""}  ${row.picks}  ${row.request}`,
		);
	}
}

function usage(): never {
	const sets = (keep: (set: CardSet) => boolean) =>
		CARD_SET_NAMES.filter(keep).join("|");
	console.error(
		`usage: card.ts run <en|es> <${sets((set) => !isLabelled(set))}> <n> | run <en|es> <${sets(isLabelled)}> <n> <label> | office <en|es> <n> <label> | gaps <en|es> <n> | compare <en|es> <${sets(givesVerdict)}> <first n> <second n> | gates <dev n>`,
	);
	process.exit(1);
}
