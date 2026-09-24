import type { CardFlip, CardReport } from "./card-score.ts";
import type { CardExpectedValue } from "./card-set.ts";
import type { FilterFlip, FilterReport } from "./filter-score.ts";
import type { ExpectedValue } from "./filter-set.ts";
import { HELD } from "./held.ts";
import type { ProbeWindow } from "./probe.ts";
import type { Flip, Report, Side, Verdict } from "./score.ts";

const number = (value: number | null) =>
	value === null ? "not measured" : String(Number(value.toFixed(3)));
const cell = (text: string) => text.replace(/\|/g, "\\|");
/** A log saved before ADR 0007 has no several, so it is left out. */
const probability = (none: number | null, several: number | null) =>
	none === null
		? "no answer"
		: `none ${none.toFixed(2)}${several === null ? "" : `, several ${several.toFixed(2)}`}`;

/** A count of error rows, and how many of them were transport failures (#93). */
const errorCount = (errors: number | null, transport = 0) =>
	`${number(errors)}${transport ? ` (${transport} transport)` : ""}`;

/** Each way a verdict can wait, in the order its outcome names them. */
const PENDING = [
	{
		kind: "latencyPending",
		line: "LATENCY",
		why: "slow window: the latency line is measured again in a normal one",
	},
	{
		kind: "errorsPending",
		line: "ERRORS",
		why: "transport failures: those rows are sent again in a normal window",
	},
] as const satisfies { kind: keyof Verdict; line: string; why: string }[];

/**
 * The verdict and its lines. A run in a slow window whose quality lines
 * pass waits on its latency line, measured again in a normal window, and
 * one over its errors line only by transport failures waits on those rows,
 * sent again (#93).
 */
function verdictLines(verdict: Verdict): string[] {
	const waiting = PENDING.filter(({ kind }) => verdict[kind]);
	const outcome = verdict.pass
		? "PASS"
		: waiting.length === 0
			? "FAIL"
			: `${waiting.map(({ line }) => line).join(" AND ")} PENDING (${waiting.map(({ why }) => why).join("; ")})`;
	return [
		`## Verdict: ${outcome}`,
		"",
		"| Measure | Kill line | Actual | |",
		"|---|---|---|---|",
		...verdict.lines.map(
			({ measure, line, atLeast, actual, transport, pass, pending }) =>
				`| ${measure} | ${atLeast ? "at least" : "at most"} ${line} | ${measure === "errors" ? errorCount(actual, transport) : number(actual)} | ${pending ? "pending" : pass ? "pass" : "FAIL"} |`,
		),
		"",
	];
}

/** The measures' first line: the rows, their errors and retries, latency and cost. */
function callsLine({
	rows,
	measures,
	transport,
	retried,
	costPerCallUsd: cost,
}: Pick<
	Report,
	"rows" | "measures" | "transport" | "retried" | "costPerCallUsd"
>): string {
	return `- Rows: ${rows} · errors: ${errorCount(measures.errors, transport)}${retried ? ` · retried ${retried}` : ""} · p95 ${number(measures.p95Ms)} ms · cost per call ${cost === null ? "unknown" : `$${cost.toFixed(7)}`}`;
}

/** The probes' line of the measures; none for a run saved before probes. */
function windowLines(window: ProbeWindow | null): string[] {
	if (!window) return [];
	const { medianMs, baselineMs, slow } = window;
	if (medianMs === null) {
		return [
			`- Probes: every probe failed${baselineMs === null ? "" : " · slow window"}`,
		];
	}
	const median = `- Probes: median ${number(medianMs)} ms`;
	return [
		baselineMs === null
			? `${median} · no baseline yet`
			: `${median} against a baseline of ${number(baselineMs)} ms · ${slow ? "slow window" : "normal"}`,
	];
}

/**
 * A report as Markdown: the verdict first when there is one, then the
 * measures, the misses and, given a second run, the flips against the first.
 * A second run's report has no verdict: the first run gives it.
 */
export function formatReport(report: Report, flips?: Flip[]): string {
	const { counts, measures } = report;
	const note = flips
		? " (second run, no verdict: the first run keeps it)"
		: report.retuned
			? " (retuned after the run: no verdict)"
			: "";
	const lines = [`# Eval report at gate ${report.gate}${note}`, ""];
	if (report.verdict && !flips) lines.push(...verdictLines(report.verdict));
	lines.push(
		"## Measures",
		"",
		callsLine(report),
		...windowLines(report.window),
		`- Item rows: ${counts.items} · filled: ${counts.covered} · coverage ${number(measures.coverage)}`,
		`- Filled with the expected item: ${counts.right} of ${counts.covered} · exact ${number(measures.exact)}`,
		`- Nothing rows: ${counts.nothing} · invented an item: ${measures.invented}${report.invented.length ? ` (${report.invented.join(", ")})` : ""}`,
		`- Ambiguous rows: ${counts.ambiguous} · held: ${counts.held} · held ambiguous ${number(measures.heldAmbiguous)}${report.leaked.length ? ` · filled: ${report.leaked.join(", ")}` : ""}`,
		"",
	);
	if (report.misses.length) {
		lines.push(
			"## Misses",
			"",
			"Filled and wrong first, surest first; then held and wrong.",
			"",
			"| Row | Request | Expected | Got | none | several | Whose |",
			"|---|---|---|---|---|---|---|",
			...report.misses.map(
				(miss) =>
					`| ${miss.id} | ${cell(miss.request)} | ${miss.expected ?? miss.kind} | ${miss.item ?? "held"} | ${number(miss.none)} | ${miss.several === null ? "" : number(miss.several)} | ${miss.blame} |`,
			),
			"",
		);
	}
	if (flips) {
		const side = ({ item, none, several }: Side) =>
			`${item ?? "held"}, ${probability(none, several)}`;
		lines.push(
			"## Flips",
			"",
			`${flips.length} ${flips.length === 1 ? "flip" : "flips"} against the first run, which keeps the verdict.`,
			"",
			"| Row | Request | First run | This run |",
			"|---|---|---|---|",
			...flips.map(
				({ id, request, before, after }) =>
					`| ${id} | ${cell(request)} | ${side(before)} | ${side(after)} |`,
			),
			"",
		);
	}
	return lines.join("\n");
}

/** A filter field's value as one short cell: an id, a range or bounds, or held. */
function shown(value: ExpectedValue | null): string {
	if (value === null) return "held";
	if (typeof value === "string") return value;
	return Object.entries(value)
		.map(([key, v]) => `${key} ${v}`)
		.join(", ");
}

/**
 * A filter report as Markdown: the verdict first when there is one, then the
 * measures, each field at its gate, the misses and, given a second run, the
 * flips against the first. A second run's report has no verdict.
 */
export function formatFilterReport(
	report: FilterReport,
	flips?: FilterFlip[],
): string {
	const { counts, measures } = report;
	const note = flips
		? " (second run, no verdict: the first run keeps it)"
		: report.retuned
			? " (retuned after the run: no verdict)"
			: "";
	const lines = [`# Filter eval report${note}`, ""];
	if (report.verdict && !flips) lines.push(...verdictLines(report.verdict));
	lines.push(
		"## Measures",
		"",
		callsLine(report),
		...windowLines(report.window),
		`- Filterable rows: ${counts.filterable} · every expected field filled: ${counts.covered} · coverage ${number(measures.coverage)}`,
		`- Filled with the exact filter object: ${counts.exact} of ${counts.covered} · exact ${number(measures.exact)}`,
		`- Nothing rows: ${counts.nothing} · filled a field: ${measures.invented}${report.invented.length ? ` (${report.invented.join(", ")})` : ""}`,
		`- Ambiguous rows: ${counts.ambiguous} · held: ${counts.held} · held ambiguous ${number(measures.heldAmbiguous)}${report.leaked.length ? ` · filled: ${report.leaked.join(", ")}` : ""}`,
		"",
		"## Fields",
		"",
		"Right and wrong picks are read with no gate; a field's pick is its weakest.",
		"",
		"| Field | Gate | Expected | Filled | Right | Wrong | Lowest right | Highest wrong |",
		"|---|---|---|---|---|---|---|---|",
		...Object.entries(report.fields).map(
			([name, f]) =>
				`| ${name} | ${f.gate} | ${f.expected} | ${f.filled} | ${f.right} | ${f.wrong} | ${f.lowestRight === null ? "" : number(f.lowestRight)} | ${f.highestWrong === null ? "" : number(f.highestWrong)} |`,
		),
		"",
	);
	if (report.misses.length) {
		lines.push(
			"## Misses",
			"",
			"Filled and wrong first, surest first; then held and wrong.",
			"",
			"| Row | Request | Field | Expected | Got | Pick | Whose |",
			"|---|---|---|---|---|---|---|",
			...report.misses.map(
				(miss) =>
					`| ${miss.id} | ${cell(miss.request)} | ${miss.field} | ${miss.expected === null ? "not mentioned" : shown(miss.expected === HELD ? null : miss.expected)} | ${shown(miss.got)} | ${miss.label === null ? "" : `${miss.label} `}${number(miss.probability)} | ${miss.blame} |`,
			),
			"",
		);
	}
	if (flips) {
		lines.push(
			"## Flips",
			"",
			`${flips.length} ${flips.length === 1 ? "flip" : "flips"} against the first run, which keeps the verdict.`,
			"",
			"| Row | Request | Field | First run | This run |",
			"|---|---|---|---|---|",
			...flips.map(
				({ id, request, field, before, after }) =>
					`| ${id} | ${cell(request)} | ${field} | ${shown(before)} | ${shown(after)} |`,
			),
			"",
		);
	}
	return lines.join("\n");
}

/** A card field's value as one short cell: an id, ids, a day, a time, an amount, or held. */
function shownCard(value: CardExpectedValue | null): string {
	if (value === null) return "held";
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.join(" + ");
	return value.currency
		? `${value.value} ${value.currency}`
		: String(value.value);
}

/**
 * A card report as Markdown: the verdict first when there is one, then the
 * measures, the intent and each field at its gate, the misses and, given a
 * second run, the flips against the first. A second run's report has no
 * verdict.
 */
export function formatCardReport(
	report: CardReport,
	flips?: CardFlip[],
): string {
	const { counts, measures } = report;
	const note = flips
		? " (second run, no verdict: the first run keeps it)"
		: report.retuned
			? " (retuned after the run: no verdict)"
			: "";
	const lines = [`# Card eval report${note}`, ""];
	if (report.verdict && !flips) lines.push(...verdictLines(report.verdict));
	const stats = { intent: report.intent, ...report.fields };
	lines.push(
		"## Measures",
		"",
		callsLine(report),
		...windowLines(report.window),
		`- Cards (record and ambiguous rows): ${counts.cards} · fields expected: ${counts.fieldsExpected} · filled: ${counts.fieldsFilled} · coverage ${number(measures.coverage)}`,
		`- Cards that filled a field: ${counts.filled} · nothing to correct: ${counts.exact} · exact ${number(measures.exact)}`,
		`- Nothing rows: ${counts.nothing} · filled a field: ${measures.invented}${report.invented.length ? ` (${report.invented.join(", ")})` : ""}`,
		`- Ambiguous rows: ${counts.ambiguous} · held: ${counts.held} · held ambiguous ${number(measures.heldAmbiguous)}${report.leaked.length ? ` · filled: ${report.leaked.join(", ")}` : ""}`,
		"",
		"## Intent and fields",
		"",
		"Right and wrong picks are read with no gate; a field's pick is its weakest, and the intent's is new_record's.",
		"",
		"| Field | Gate | Expected | Filled | Right | Wrong | Lowest right | Highest wrong |",
		"|---|---|---|---|---|---|---|---|",
		...Object.entries(stats).map(
			([name, f]) =>
				`| ${name} | ${f.gate} | ${f.expected} | ${f.filled} | ${f.right} | ${f.wrong} | ${f.lowestRight === null ? "" : number(f.lowestRight)} | ${f.highestWrong === null ? "" : number(f.highestWrong)} |`,
		),
		"",
	);
	if (report.misses.length) {
		lines.push(
			"## Misses",
			"",
			"Filled and wrong first, surest first; then held and wrong. A card its intent held lists the intent alone.",
			"",
			"| Row | Request | Field | Expected | Got | Pick | Whose |",
			"|---|---|---|---|---|---|---|",
			...report.misses.map(
				(miss) =>
					`| ${miss.id} | ${cell(miss.request)} | ${miss.field} | ${miss.expected === null ? "not mentioned" : shownCard(miss.expected === HELD ? null : miss.expected)} | ${shownCard(miss.got)} | ${miss.label === null ? "" : `${miss.label} `}${number(miss.probability)} | ${miss.blame} |`,
			),
			"",
		);
	}
	if (flips) {
		lines.push(
			"## Flips",
			"",
			`${flips.length} ${flips.length === 1 ? "flip" : "flips"} against the first run, which keeps the verdict.`,
			"",
			"| Row | Request | Field | First run | This run |",
			"|---|---|---|---|---|",
			...flips.map(
				({ id, request, field, before, after }) =>
					`| ${id} | ${cell(request)} | ${field} | ${shownCard(before)} | ${shownCard(after)} |`,
			),
			"",
		);
	}
	return lines.join("\n");
}
