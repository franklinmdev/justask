// The showcase's recorded runs, by hand with the key in .env, never in CI:
// every recording is a real Jev call through the demo's handler.
//
//   node --conditions=justask-source demo/recordings/record.ts [table|search|form ...]
//
// Writes demo/recordings/<case>-<language>.json for the named cases, every
// case when none is named, in English and Spanish, each case's sentence taken
// from a frozen eval row. The eval runners' warm-up goes first, discarded,
// so a cold start never falls on a recorded call. A call whose result is not
// the row's expected one writes nothing, and neither do the others, so every
// recording shows the gates passing its row. Nothing in a recording is
// edited by hand: after a change to the gates, run this again for the cases
// they serve.

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import type { AmountRange, DateRange, FieldValue, Usage } from "@justask/core";
import {
	type CardEvalRow,
	type EvalRow,
	type FilterEvalRow,
	HELD,
	parseCardEvalSet,
	parseEvalSet,
	parseFilterEvalSet,
} from "@justask/core/eval";
import { jevProvider } from "@justask/core/jev";
import { loadKeyEnv } from "../../scripts/load-env.ts";
import { createDemoHandler } from "../server/handler.ts";
import { warmUp } from "../server/warm-up.ts";
import { cardEndpoint, filterEndpoint, searchEndpoint } from "../src/api.ts";
import type {
	ExpenseName,
	Language,
	TransactionFields,
} from "../src/content/types.ts";
import type {
	FormRecording,
	Recording,
	SearchRecording,
	TableRecording,
} from "../src/recording.ts";

/**
 * Each case's row per language: the same sentence in both. The table's sets
 * every field but one. The form's names no vendor and no day, so both stay
 * empty, and no relative day, so a rerun on another day expects the same
 * card; both round 4 runs filled its fields at least 0.1 above their gates in
 * both languages (#53).
 */
const ROWS = {
	table: { set: "filter", suffix: "", en: "en-f-26", es: "es-f-26" },
	search: { set: "search", suffix: ".round3", en: "en-r3-01", es: "es-r3-01" },
	form: { set: "card", suffix: ".round4", en: "en-r4-20", es: "es-r4-20" },
} as const;
type Case = keyof typeof ROWS;

const named = process.argv.slice(2);
for (const name of named) {
	if (!Object.hasOwn(ROWS, name)) {
		console.error(
			"Usage: node --conditions=justask-source demo/recordings/record.ts [table|search|form ...]",
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

loadKeyEnv();
const provider = jevProvider();
const handler = createDemoHandler(provider, {
	onError(error) {
		console.error(`justask: ${error.message}`);
	},
});
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * One real call through the handler for a row, as the recording it writes,
 * timed from the request to the response.
 */
async function recordRow<R extends Usage>(
	set: string,
	{ id, request }: { id: string; request: string },
	endpoint: string,
): Promise<Recording<R>> {
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
		set,
		row: id,
		recordedAt,
		timeZone,
		request,
		latencyMs,
		response: await response.json(),
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
const written: { file: string; recording: Recording<Usage> }[] = [];

/**
 * Records a case's row in a language: its eval set's row, one real call, and
 * what `check` finds wrong with the response against the row's expected
 * result. A failed call is a problem whatever the case.
 */
async function record<
	Row extends { id: string; request: string },
	R extends Usage & { error?: { message: string } },
>(
	name: Case,
	language: Language,
	{
		parse,
		endpoint,
		check,
	}: {
		parse: (text: string) => Row[];
		endpoint: (language: Language) => string;
		check: (row: Row, response: R) => string[];
	},
) {
	const { file, text } = await evalSet(name, language);
	const row = parse(text).find(({ id }) => id === ROWS[name][language]);
	if (!row) throw new Error(`No row ${ROWS[name][language]}`);
	const recording = await recordRow<R>(file, row, endpoint(language));
	const { error } = recording.response;
	if (error) problems.push(`${row.id}: ${error.message}`);
	problems.push(...check(row, recording.response));
	written.push({ file: `${name}-${language}.json`, recording });
}

/** Each field as the row expects it: a catalog field by its pick's label, a range bound for bound. */
function checkTable(
	row: FilterEvalRow,
	{ filter }: TableRecording["response"],
): string[] {
	const expected = row.expected as Record<string, unknown>;
	return (Object.keys(filter.fields) as (keyof TransactionFields)[]).flatMap(
		(name) => {
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
			return same
				? []
				: [
						`${row.id} ${name}: expected ${JSON.stringify(expected[name])}, got ${JSON.stringify(value)}`,
					];
		},
	);
}

function checkSearch(
	row: EvalRow,
	{ search }: SearchRecording["response"],
): string[] {
	const item = search.item?.id ?? null;
	return item === row.expected
		? []
		: [`${row.id}: expected ${row.expected}, got ${item}`];
}

/**
 * Each field as the eval set writes it: a catalog field by its ids, a held
 * or unmentioned one as nothing.
 */
function checkForm(
	row: CardEvalRow,
	{ card }: FormRecording["response"],
): string[] {
	const { vendor, tags, spent_on, total } = card.value;
	const got: Record<ExpenseName, unknown> = {
		vendor: vendor?.id,
		tags: tags && [...tags].sort(),
		spent_on,
		total: total && { value: total.value, currency: total.currency },
	};
	return (Object.keys(got) as ExpenseName[]).flatMap((name) => {
		const value = row.expected[name];
		const want =
			value === undefined || value === HELD
				? undefined
				: Array.isArray(value)
					? [...value].sort()
					: value;
		return JSON.stringify(got[name]) === JSON.stringify(want)
			? []
			: [
					`${row.id} ${name}: expected ${JSON.stringify(value)}, got ${JSON.stringify(got[name])}`,
				];
	});
}

const recorders: Record<Case, (language: Language) => Promise<void>> = {
	table: (language) =>
		record("table", language, {
			parse: parseFilterEvalSet,
			endpoint: filterEndpoint,
			check: checkTable,
		}),
	search: (language) =>
		record("search", language, {
			parse: parseEvalSet,
			endpoint: searchEndpoint,
			check: checkSearch,
		}),
	form: (language) =>
		record("form", language, {
			parse: parseCardEvalSet,
			endpoint: cardEndpoint,
			check: checkForm,
		}),
};
await warmUp(provider);
for (const language of ["en", "es"] as Language[]) {
	for (const name of cases) await recorders[name](language);
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
