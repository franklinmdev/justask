// The showcase's recorded runs, by hand with the key in .env, never in CI:
// every recording is a real Jev call through the demo's handler.
//
//   node --conditions=source demo/recordings/record.ts [table|search|form ...]
//
// Writes demo/recordings/<case>-<language>.json for the named cases, every
// case when none is named, in English and Spanish, each case's sentence taken
// from a frozen eval row. A call whose result is not the row's expected one
// writes nothing, and neither do the others, so every recording shows the
// gates passing its row. Nothing in a recording is edited by hand: after a
// change to the gates, run this again for the cases they serve.

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import type { AmountRange, DateRange, FieldValue } from "justask";
import {
	parseCardEvalSet,
	parseEvalSet,
	parseFilterEvalSet,
} from "justask/eval";
import { jevProvider } from "justask/jev";
import { loadKeyEnv } from "../../scripts/load-env.ts";
import { createDemoHandler } from "../server/handler.ts";
import { cardEndpoint, filterEndpoint, searchEndpoint } from "../src/api.ts";
import type {
	ExpenseName,
	Language,
	TransactionFields,
} from "../src/content/types.ts";
import type {
	FormRecording,
	SearchRecording,
	TableRecording,
} from "../src/recording.ts";

/**
 * Each case's row per language: the same sentence in both. The table's sets
 * every field but one; the form's holds its day, since "in August" names no
 * single day, and names no relative day, so a rerun on another day expects
 * the same card.
 */
const ROWS = {
	table: { set: "filter", suffix: "", en: "en-f-26", es: "es-f-26" },
	search: { set: "search", suffix: ".round3", en: "en-r3-01", es: "es-r3-01" },
	form: { set: "card", suffix: ".round4", en: "en-r4-34", es: "es-r4-34" },
} as const;
type Case = keyof typeof ROWS;

const named = process.argv.slice(2);
for (const name of named) {
	if (!Object.hasOwn(ROWS, name)) {
		console.error(
			"Usage: node --conditions=source demo/recordings/record.ts [table|search|form ...]",
		);
		process.exit(1);
	}
}
const cases = (named.length > 0 ? named : Object.keys(ROWS)) as Case[];

const here = (path: string) => new URL(path, import.meta.url).pathname;

/** The case's eval set file in a language, and its text. */
async function evalSet(name: Case, language: Language) {
	const { set, suffix } = ROWS[name];
	const file = `${set}-${language}${suffix}.jsonl`;
	return { file, text: await readFile(here(`../eval/${file}`), "utf8") };
}

loadKeyEnv(process.cwd());
const handler = createDemoHandler(jevProvider(), {
	onError(error) {
		console.error(`justask: ${error.message}`);
	},
});
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** One real call through the handler, timed from the request to the response. */
async function call(endpoint: string, request: string) {
	const recordedAt = new Date().toISOString();
	const started = performance.now();
	const response = await handler(
		new Request(new URL(endpoint, "http://localhost"), {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ request, timeZone }),
		}),
	);
	const latencyMs = Math.round(performance.now() - started);
	if (response.status !== 200) {
		throw new Error(`${endpoint} answered ${response.status}`);
	}
	return {
		recordedAt,
		timeZone,
		request,
		latencyMs,
		body: await response.json(),
	};
}

/** Whether a filled range is the expected one, bound for bound. */
function sameRange(
	actual: DateRange | AmountRange | undefined,
	expected: unknown,
): boolean {
	if (actual === undefined || expected === undefined) {
		return actual === expected;
	}
	const keys = ["from", "to", "min", "max", "exact", "currency"] as const;
	return keys.every(
		(key) =>
			(actual as Record<string, unknown>)[key] ===
			(expected as Record<string, unknown>)[key],
	);
}

type Recorded = TableRecording | SearchRecording | FormRecording;

const problems: string[] = [];
const written: { file: string; recording: Recorded }[] = [];

async function recordTable(language: Language) {
	const { file, text } = await evalSet("table", language);
	const row = parseFilterEvalSet(text).find(
		({ id }) => id === ROWS.table[language],
	);
	if (!row) throw new Error(`No row ${ROWS.table[language]}`);
	const table = await call(filterEndpoint(language), row.request);
	const recording: TableRecording = {
		set: file,
		row: row.id,
		recordedAt: table.recordedAt,
		timeZone: table.timeZone,
		request: table.request,
		latencyMs: table.latencyMs,
		response: table.body,
	};
	const { filter, error } = recording.response;
	if (error) problems.push(`${row.id}: ${error.message}`);
	const expected = row.expected as Record<string, unknown>;
	for (const name of Object.keys(
		filter.fields,
	) as (keyof TransactionFields)[]) {
		const value = filter.value[name];
		const same =
			name === "vendor" || name === "status"
				? (value === undefined
						? undefined
						: filter.fields[name].pick?.label) === expected[name]
				: sameRange(
						value as FieldValue<TransactionFields["date" | "amount"]>,
						expected[name],
					);
		if (!same) {
			problems.push(
				`${row.id} ${name}: expected ${JSON.stringify(expected[name])}, got ${JSON.stringify(value)}`,
			);
		}
	}
	written.push({ file: `table-${language}.json`, recording });
}

async function recordSearch(language: Language) {
	const { file, text } = await evalSet("search", language);
	const row = parseEvalSet(text).find(({ id }) => id === ROWS.search[language]);
	if (!row) throw new Error(`No row ${ROWS.search[language]}`);
	const search = await call(searchEndpoint(language), row.request);
	const recording: SearchRecording = {
		set: file,
		row: row.id,
		recordedAt: search.recordedAt,
		timeZone: search.timeZone,
		request: search.request,
		latencyMs: search.latencyMs,
		response: search.body,
	};
	const item = recording.response.search.item?.id ?? null;
	if (recording.response.error) {
		problems.push(`${row.id}: ${recording.response.error.message}`);
	}
	if (item !== row.expected) {
		problems.push(`${row.id}: expected ${row.expected}, got ${item}`);
	}
	written.push({ file: `search-${language}.json`, recording });
}

async function recordForm(language: Language) {
	const { file, text } = await evalSet("form", language);
	const row = parseCardEvalSet(text).find(
		({ id }) => id === ROWS.form[language],
	);
	if (!row) throw new Error(`No row ${ROWS.form[language]}`);
	const form = await call(cardEndpoint(language), row.request);
	const recording: FormRecording = {
		set: file,
		row: row.id,
		recordedAt: form.recordedAt,
		timeZone: form.timeZone,
		request: form.request,
		latencyMs: form.latencyMs,
		response: form.body,
	};
	const { card, error } = recording.response;
	if (error) problems.push(`${row.id}: ${error.message}`);
	// Each field as the eval set writes it: a catalog field by its ids, a held
	// or unmentioned one as nothing.
	const { vendor, tags, spent_on, total } = card.value;
	const got: Record<ExpenseName, unknown> = {
		vendor: vendor?.id,
		tags: tags && [...tags].sort(),
		spent_on,
		total: total && { value: total.value, currency: total.currency },
	};
	for (const name of Object.keys(got) as ExpenseName[]) {
		const value = row.expected[name];
		const want =
			value === undefined || value === "held"
				? undefined
				: Array.isArray(value)
					? [...value].sort()
					: value;
		if (JSON.stringify(got[name]) !== JSON.stringify(want)) {
			problems.push(
				`${row.id} ${name}: expected ${JSON.stringify(value)}, got ${JSON.stringify(got[name])}`,
			);
		}
	}
	written.push({ file: `form-${language}.json`, recording });
}

const record = { table: recordTable, search: recordSearch, form: recordForm };
for (const language of ["en", "es"] as Language[]) {
	for (const name of cases) await record[name](language);
}

if (problems.length > 0) {
	console.error(`Nothing written:\n${problems.join("\n")}`);
	process.exit(1);
}
for (const { file, recording } of written) {
	await writeFile(here(file), `${JSON.stringify(recording, null, "\t")}\n`);
	const cost = recording.response.costUsd;
	console.log(
		`${file}: ${recording.row}, ${recording.latencyMs} ms, ${recording.response.inputTokens ?? "?"} input tokens, $${cost ?? "?"}`,
	);
}
// The repo's formatter lays the JSON out as the lint check expects, so a
// fresh recording needs no hand at all.
execFileSync(
	"pnpm",
	[
		"exec",
		"biome",
		"format",
		"--write",
		...written.map(({ file }) => here(file)),
	],
	{ stdio: "inherit" },
);
