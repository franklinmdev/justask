import type { Flip, Report, Side } from "./score.ts";

const number = (value: number | null) =>
	value === null ? "not measured" : String(Number(value.toFixed(3)));
const cell = (text: string) => text.replace(/\|/g, "\\|");
const probability = (none: number | null) =>
	none === null ? "no answer" : `none ${none.toFixed(2)}`;

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
	if (report.verdict && !flips) {
		lines.push(
			`## Verdict: ${report.verdict.pass ? "PASS" : "FAIL"}`,
			"",
			"| Measure | Kill line | Actual | |",
			"|---|---|---|---|",
			...report.verdict.lines.map(
				({ measure, line, atLeast, actual, pass }) =>
					`| ${measure} | ${atLeast ? "at least" : "at most"} ${line} | ${number(actual)} | ${pass ? "pass" : "FAIL"} |`,
			),
			"",
		);
	}
	const cost = report.costPerCallUsd;
	lines.push(
		"## Measures",
		"",
		`- Rows: ${report.rows} · errors: ${measures.errors} · p95 ${number(measures.p95Ms)} ms · cost per call ${cost === null ? "unknown" : `$${cost.toFixed(7)}`}`,
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
			"| Row | Request | Expected | Got | none | Whose |",
			"|---|---|---|---|---|---|",
			...report.misses.map(
				(miss) =>
					`| ${miss.id} | ${cell(miss.request)} | ${miss.expected ?? miss.kind} | ${miss.item ?? "held"} | ${number(miss.none)} | ${miss.blame} |`,
			),
			"",
		);
	}
	if (flips) {
		const side = ({ item, none }: Side) =>
			`${item ?? "held"}, ${probability(none)}`;
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
