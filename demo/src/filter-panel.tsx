import type {
	AmountRange,
	CatalogFieldResult,
	FieldAnswer,
	FilterResult,
	NamedPair,
	ParsedFieldResult,
	Pick,
} from "justask";
import type { UseFilter } from "justask/react";
import type {
	Content,
	FieldHeldReason,
	FieldName,
	TransactionFields,
} from "./content/types.ts";
import { formats } from "./format.ts";
import { Bar, failureOf } from "./parts.tsx";
import type { Trace } from "./trace.ts";

type Format = ReturnType<typeof formats>;

export const MISSING = ["not_mentioned", "not_available"];

/** What a number can do in an amount, in the panel's order: the bounds, then the exact amount. */
const ROLES = ["min", "max", "exact"] as const satisfies readonly Exclude<
	keyof AmountRange,
	"currency"
>[];

/** How many of a catalog's candidates the panel lists, the likeliest first. */
const SHOWN = 3;

/** One question as the panel shows it: its labels, ranked, and its pick. */
export type Readout = {
	/** The question's id within its field. */
	id: string;
	title?: string;
	rows: { label: string; name: string; detail?: string }[];
	answer: FieldAnswer;
};

/** The answers a field's result holds, one per question. */
export function answersOf(
	result: CatalogFieldResult<unknown> | ParsedFieldResult<unknown>,
): FieldAnswer[] {
	return "answers" in result
		? Object.values(result.answers)
		: Object.keys(result.probabilities).length > 0
			? [{ pick: result.pick, probabilities: result.probabilities }]
			: [];
}

/** The currency an amount names that the local one does not resolve, which holds the field unasked. */
function unresolvedOf(
	name: FieldName,
	result: FilterResult<TransactionFields>,
): string | undefined {
	if (name !== "amount") return undefined;
	return result.fields.amount.candidates.find(
		({ value }) => value.unresolved !== undefined,
	)?.value.unresolved;
}

/**
 * Why a field is held, read the way the code holds it: no candidates, a named
 * pair, no answer, a tie, a missing label, a pick below the gate, and last the
 * picks that do not make one filter, such as two numbers both claiming the
 * minimum.
 */
function heldReasonOf(
	result:
		| (CatalogFieldResult<unknown> & { pair?: NamedPair })
		| ParsedFieldResult<unknown>,
	unresolved: string | undefined,
	format: Format,
): FieldHeldReason {
	if (result.candidates.length === 0) return { kind: "no-candidates" };
	if ("pair" in result && result.pair) {
		return { kind: "pair", text: result.pair.text };
	}
	if (unresolved !== undefined) {
		return { kind: "unresolved-currency", mark: unresolved };
	}
	const answers = answersOf(result);
	if (answers.length === 0) return { kind: "failed" };
	const picks = answers.map(({ pick }) => pick);
	if (picks.some((pick) => pick === null)) return { kind: "tie" };
	const picked = picks as Pick[];
	if (picked.some(({ label }) => label === "not_available")) {
		return { kind: "not-available" };
	}
	const lowest = Math.min(...picked.map(({ probability }) => probability));
	if (lowest < result.gate) {
		return {
			kind: "below-gate",
			probability: format.probability(lowest),
			gate: format.probability(result.gate),
		};
	}
	if (picked.every(({ label }) => label === "not_mentioned")) {
		return { kind: "not-mentioned" };
	}
	return { kind: "conflict" };
}

function readoutsOf(
	name: FieldName,
	result: FilterResult<TransactionFields>,
	content: Content,
	format: Format,
): Readout[] {
	const { copy } = content;
	// A field with no candidates, or held for its currency, was never asked.
	if (
		result.fields[name].candidates.length === 0 ||
		unresolvedOf(name, result) !== undefined
	) {
		return [];
	}
	const missing = MISSING.map((label) => ({ label, name: label }));
	if (name === "vendor" || name === "status") {
		const field = result.fields[name];
		const rows =
			name === "status"
				? result.fields.status.candidates.map(({ id, value }) => ({
						label: id,
						name: copy.statuses[value],
					}))
				: result.fields.vendor.candidates.map(({ id, value }) => ({
						label: id,
						name: value.name,
					}));
		return [
			{
				id: name,
				rows: [...rows, ...missing],
				answer: { pick: field.pick, probabilities: field.probabilities },
			},
		];
	}
	if (name === "date") {
		const field = result.fields.date;
		const rows = field.candidates.map(({ id, value }) => ({
			label: id,
			name: `“${value.text}”`,
			detail: copy.filter.dateRange(value, format.date),
		}));
		return (["from", "to"] as const).map((end) => ({
			id: end,
			title: end === "from" ? copy.filter.start : copy.filter.end,
			rows: [...rows, ...missing],
			answer: field.answers[end] ?? { pick: null, probabilities: {} },
		}));
	}
	const field = result.fields.amount;
	return field.candidates.map(({ id, value }) => ({
		id,
		title: copy.filter.number(value.text),
		rows: [
			...ROLES.map((role) => ({
				label: role,
				name: role,
				detail: copy.filter.roles[role],
			})),
			...missing,
		],
		answer: field.answers[id] ?? { pick: null, probabilities: {} },
	}));
}

/** How many questions went to the provider, all in one call. */
function questionsOf(result: FilterResult<TransactionFields>): number {
	const { vendor, status, date, amount } = result.fields;
	return (
		(vendor.candidates.length > 0 ? 1 : 0) +
		(status.candidates.length > 0 ? 1 : 0) +
		(date.candidates.length > 0 ? 2 : 0) +
		(unresolvedOf("amount", result) === undefined
			? amount.candidates.length
			: 0)
	);
}

export function FilterPanel({
	content,
	filter,
	trace,
}: {
	content: Content;
	filter: UseFilter<TransactionFields>;
	trace: Trace | null;
}) {
	const { copy } = content;
	const format = formats(content.locale);
	const { result, error } = filter;
	const names = result ? (Object.keys(result.fields) as FieldName[]) : [];
	const filled = result && !error ? Object.keys(result.value).length : 0;

	const status = filter.loading
		? { tone: "waiting", text: copy.waiting }
		: error
			? { tone: "failed", text: copy.failed }
			: result
				? filled > 0
					? { tone: "filled", text: copy.filled }
					: { tone: "held", text: copy.held }
				: null;

	return (
		<section className="panel" aria-labelledby="panel-title">
			<header className="panel-head">
				<h2 id="panel-title">{copy.panel}</h2>
				{status && (
					<span className="status" data-tone={status.tone}>
						{status.text}
					</span>
				)}
			</header>

			{!result && !error ? (
				!filter.loading && <p className="muted">{copy.idle}</p>
			) : (
				<div className="readout" data-stale={filter.loading || undefined}>
					<p className="reason">
						{error
							? copy.heldBecause(failureOf(error))
							: copy.filter.summary(filled, names.length)}
					</p>
					<dl className="facts">
						{trace && (
							<div>
								<dt>{copy.request}</dt>
								<dd className="request">{trace.request}</dd>
							</div>
						)}
						{result && (
							<div>
								<dt>{copy.filter.questions}</dt>
								<dd className="data">{questionsOf(result)}</dd>
							</div>
						)}
					</dl>
					{result &&
						names.map((name) => (
							<FieldReadout
								key={name}
								name={name}
								result={result}
								failed={error !== null}
								content={content}
								format={format}
							/>
						))}
				</div>
			)}
		</section>
	);
}

function FieldReadout({
	name,
	result,
	failed,
	content,
	format,
}: {
	name: FieldName;
	result: FilterResult<TransactionFields>;
	failed: boolean;
	content: Content;
	format: Format;
}) {
	const { copy } = content;
	const field = result.fields[name];
	const filled = !failed && name in result.value;
	const lowest = Math.min(
		...answersOf(field).map(({ pick }) => pick?.probability ?? 0),
	);
	const readouts = readoutsOf(name, result, content, format);
	const heading = `field-${name}`;

	return (
		<section className="field" aria-labelledby={heading}>
			<div className="field-head">
				<h3 id={heading}>{copy.filter.fields[name]}</h3>
				<span className="field-gate">
					{copy.filter.gate}{" "}
					<span className="data">{format.probability(field.gate)}</span>
				</span>
				<span className="status" data-tone={filled ? "filled" : "held"}>
					{filled ? copy.filled : copy.held}
				</span>
			</div>
			<p className="field-reason">
				{filled
					? copy.filter.filledBecause(
							format.probability(lowest),
							format.probability(field.gate),
						)
					: copy.filter.heldBecause(
							failed
								? { kind: "failed" }
								: heldReasonOf(field, unresolvedOf(name, result), format),
						)}
			</p>
			{readouts.map((readout) => (
				<Question
					key={readout.id}
					readout={readout}
					gate={field.gate}
					labelledBy={readout.title ? undefined : heading}
					content={content}
					format={format}
				/>
			))}
		</section>
	);
}

/** One question's table: the likeliest candidates, then not_mentioned and not_available. */
export function Question({
	readout,
	gate,
	labelledBy,
	content,
	format,
}: {
	readout: Readout;
	gate: number;
	labelledBy: string | undefined;
	content: Content;
	format: Format;
}) {
	const { copy } = content;
	const { probabilities, pick } = readout.answer;
	// A failed call has no probabilities: its figures stay blank, not zero.
	const probability = (label: string) => probabilities[label] ?? 0;
	const figure = (label: string) => {
		const value = probabilities[label];
		return value === undefined ? "" : format.probability(value);
	};
	const candidates = readout.rows
		.filter(({ label }) => !MISSING.includes(label))
		.sort((a, b) => probability(b.label) - probability(a.label));
	const shown = candidates.slice(0, SHOWN);
	const hidden = candidates.length - shown.length;
	const missing = readout.rows.filter(({ label }) => MISSING.includes(label));

	const row = ({ label, name, detail }: Readout["rows"][number]) => {
		const picked = pick?.label === label;
		const code = MISSING.includes(label) || name === label;
		return (
			<tr key={label} data-picked={picked || undefined}>
				<th scope="row">
					<span className={code ? "candidate-name data" : "candidate-name"}>
						{name}
					</span>
					{picked && <span className="pick">{copy.pick}</span>}
					{detail && <span className="candidate-detail">{detail}</span>}
				</th>
				<td>
					<div className="probability">
						<Bar value={probability(label)} {...(picked && { gate })} />
						<span className="data">{figure(label)}</span>
					</div>
				</td>
			</tr>
		);
	};

	return (
		<table className="candidates" aria-labelledby={labelledBy}>
			{readout.title && <caption>{readout.title}</caption>}
			<thead>
				<tr>
					<th scope="col">{copy.candidate}</th>
					<th scope="col" className="numeric">
						{copy.probability}
					</th>
				</tr>
			</thead>
			<tbody>
				{shown.map(row)}
				{hidden > 0 && (
					<tr>
						<td colSpan={2} className="more">
							{copy.filter.more(hidden)}
						</td>
					</tr>
				)}
			</tbody>
			<tbody className="own-labels">{missing.map(row)}</tbody>
		</table>
	);
}
