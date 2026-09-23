// The showcase's recorded runs, by hand with the key in .env, never in CI:
// every recording is a real Jev call through the demo's handler.
//
//   node --conditions=source demo/recordings/record.ts
//
// Writes demo/recordings/<case>-<language>.json for the Table and Search
// cases in English and Spanish, each case's sentence taken from a frozen eval
// row. A call whose result is not the row's expected one writes nothing, and
// neither do the others, so every recording shows the gates passing its row.
// Nothing in a recording is edited by hand: after a change to the gates, run
// this again.

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import type { AmountRange, DateRange, FieldValue } from "justask";
import { parseEvalSet, parseFilterEvalSet } from "justask/eval";
import { jevProvider } from "justask/jev";
import { loadKeyEnv } from "../../scripts/load-env.ts";
import { createDemoHandler } from "../server/handler.ts";
import { filterEndpoint, searchEndpoint } from "../src/api.ts";
import type { Language, TransactionFields } from "../src/content/types.ts";
import type { SearchRecording, TableRecording } from "../src/recording.ts";

/** Each case's row per language: the same sentence in both, and every field the table has but one. */
const ROWS = {
	table: { set: "filter", en: "en-f-26", es: "es-f-26" },
	search: { set: "search", suffix: ".round3", en: "en-r3-01", es: "es-r3-01" },
} as const;

const here = (path: string) => new URL(path, import.meta.url).pathname;
const evalSet = (file: string) => here(`../eval/${file}`);

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

const problems: string[] = [];
const written: { file: string; recording: TableRecording | SearchRecording }[] =
	[];

for (const language of ["en", "es"] as Language[]) {
	const tableFile = `${ROWS.table.set}-${language}.jsonl`;
	const tableRow = parseFilterEvalSet(
		await readFile(evalSet(tableFile), "utf8"),
	).find(({ id }) => id === ROWS.table[language]);
	if (!tableRow) throw new Error(`No row ${ROWS.table[language]}`);
	const table = await call(filterEndpoint(language), tableRow.request);
	const recording: TableRecording = {
		set: tableFile,
		row: tableRow.id,
		recordedAt: table.recordedAt,
		timeZone: table.timeZone,
		request: table.request,
		latencyMs: table.latencyMs,
		response: table.body,
	};
	const { filter, error } = recording.response;
	if (error) problems.push(`${tableRow.id}: ${error.message}`);
	const expected = tableRow.expected as Record<string, unknown>;
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
				`${tableRow.id} ${name}: expected ${JSON.stringify(expected[name])}, got ${JSON.stringify(value)}`,
			);
		}
	}
	written.push({ file: `table-${language}.json`, recording });

	const searchFile = `${ROWS.search.set}-${language}${ROWS.search.suffix}.jsonl`;
	const searchRow = parseEvalSet(
		await readFile(evalSet(searchFile), "utf8"),
	).find(({ id }) => id === ROWS.search[language]);
	if (!searchRow) throw new Error(`No row ${ROWS.search[language]}`);
	const search = await call(searchEndpoint(language), searchRow.request);
	const searched: SearchRecording = {
		set: searchFile,
		row: searchRow.id,
		recordedAt: search.recordedAt,
		timeZone: search.timeZone,
		request: search.request,
		latencyMs: search.latencyMs,
		response: search.body,
	};
	const item = searched.response.search.item?.id ?? null;
	if (searched.response.error) {
		problems.push(`${searchRow.id}: ${searched.response.error.message}`);
	}
	if (item !== searchRow.expected) {
		problems.push(
			`${searchRow.id}: expected ${searchRow.expected}, got ${item}`,
		);
	}
	written.push({ file: `search-${language}.json`, recording: searched });
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
