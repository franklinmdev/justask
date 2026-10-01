import type { CardResult, FieldAnswer } from "@justask/core";
import type { UseCard } from "@justask/core/react";
import type {
	CardHeldReason,
	Content,
	ExpenseFields,
	ExpenseName,
	IntentReason,
} from "./content/types.ts";
import { answersOf, MISSING, Question, type Readout } from "./filter-panel.tsx";
import { formats } from "./format.ts";
import { failureOf } from "./parts.tsx";
import type { Trace } from "./trace.ts";

type Format = ReturnType<typeof formats>;
type Result = CardResult<ExpenseFields>;

/** Why the intent question let the fields fill, or held them all. */
function intentReasonOf(
	result: Result,
	failed: boolean,
	format: Format,
): IntentReason {
	const { pick, probabilities, gate, command, marker } = result.intent;
	if (failed || Object.keys(probabilities).length === 0) {
		return { kind: "failed" };
	}
	if (command) return { kind: "command", ...command };
	if (marker) return { kind: "marker", text: marker };
	if (!pick) return { kind: "tie" };
	if (pick.label === "not_mentioned") return { kind: "not-mentioned" };
	if (pick.label === "not_available") return { kind: "not-available" };
	const figures = {
		probability: format.probability(pick.probability),
		gate: format.probability(gate),
	};
	return pick.probability >= gate
		? { kind: "passed", ...figures }
		: { kind: "below-gate", ...figures };
}

/**
 * Why a card field is held, read the way the code holds it: no candidates,
 * a request that asks for no new expense, a named pair, a pick the request
 * names only negated, no answer, a tie, a missing label, then a picked
 * reading the code refuses (two ways to read it, a currency that is not the
 * local one, a period, a day after today), and last a pick below the gate.
 */
function heldReasonOf(
	name: ExpenseName,
	result: Result,
	format: Format,
): CardHeldReason {
	const field = result.fields[name];
	if (field.candidates.length === 0) return { kind: "no-candidates" };
	if (!result.intent.passes) return { kind: "not-a-record" };
	if ("pair" in field && field.pair) {
		return { kind: "pair", text: field.pair.text };
	}
	if ("negated" in field) {
		const negated = field.negated?.find(({ id }) => id === field.pick?.label);
		if (negated) return { kind: "negated", text: negated.text };
	}
	const belowGate = (probability: number) => ({
		kind: "below-gate" as const,
		probability: format.probability(probability),
		gate: format.probability(field.gate),
	});

	if ("answers" in field) {
		const answers = Object.values(field.answers);
		if (answers.length === 0) return { kind: "failed" };
		const picks = answers.map(({ pick }) => pick);
		if (picks.some((pick) => pick === null)) return { kind: "tie" };
		if (picks.some((pick) => pick?.label === "not_available")) {
			return { kind: "not-available" };
		}
		const lowest = Math.min(...picks.map((pick) => pick?.probability ?? 0));
		return lowest < field.gate ? belowGate(lowest) : { kind: "not-mentioned" };
	}

	const { pick, probabilities } = field;
	if (!pick) {
		return Object.keys(probabilities).length > 0
			? { kind: "tie" }
			: { kind: "failed" };
	}
	if (pick.label === "not_mentioned") return { kind: "not-mentioned" };
	if (pick.label === "not_available") return { kind: "not-available" };
	const picked = ({ id }: { id: string }) => id === pick.label;
	if (name === "spent_on") {
		const day = result.fields.spent_on.candidates.find(picked)?.value;
		if (day?.ambiguous) return { kind: "ambiguous", text: day.text };
		if (day && day.from !== day.to) return { kind: "period", text: day.text };
		if (day?.afterToday) return { kind: "after-today", text: day.text };
	}
	if (name === "total") {
		const amount = result.fields.total.candidates.find(picked)?.value;
		if (amount?.unresolved !== undefined) {
			return { kind: "foreign-currency", mark: amount.unresolved };
		}
	}
	return pick.probability < field.gate
		? belowGate(pick.probability)
		: { kind: "conflict" };
}

/**
 * The vendor whose every sale takes the tags the card filled, in a gap their
 * answers left (ADR 0012); undefined for any other field, or tags the request
 * filled.
 */
export function impliedByOf(
	name: ExpenseName,
	result: Result,
): string | undefined {
	const implied = name === "tags" ? result.fields.tags.implied : undefined;
	if (!implied) return undefined;
	return result.fields.vendor.candidates.find(({ id }) => id === implied.id)
		?.value.name;
}

function readoutsOf(
	name: ExpenseName,
	result: Result,
	content: Content,
	format: Format,
): Readout[] {
	const { copy } = content;
	const missing = MISSING.map((label) => ({ label, name: label }));
	const one = (rows: Readout["rows"], answer: FieldAnswer): Readout => ({
		id: name,
		rows: [...rows, ...missing],
		answer,
	});
	switch (name) {
		case "vendor": {
			const field = result.fields.vendor;
			if (field.candidates.length === 0) return [];
			return [
				one(
					field.candidates.map(({ id, value }) => ({
						label: id,
						name: value.name,
					})),
					field,
				),
			];
		}
		case "tags": {
			const field = result.fields.tags;
			return field.candidates.map(({ id, value }) => ({
				id,
				title: copy.card.tagQuestion(copy.card.tags[value]),
				rows: [
					{ label: "yes", name: "yes", detail: copy.card.yes },
					...missing,
				],
				answer: field.answers[id] ?? { pick: null, probabilities: {} },
			}));
		}
		case "spent_on": {
			const field = result.fields.spent_on;
			if (field.candidates.length === 0) return [];
			return [
				one(
					field.candidates.map(({ id, value }) => {
						const day = copy.filter.dateRange(value, format.date);
						return {
							label: id,
							name: `“${value.text}”`,
							detail: value.ambiguous ? `${day} · ${copy.card.ambiguous}` : day,
						};
					}),
					field,
				),
			];
		}
		case "total": {
			const field = result.fields.total;
			if (field.candidates.length === 0) return [];
			return [
				one(
					field.candidates.map(({ id, value }) => ({
						label: id,
						name: `“${value.text}”`,
						detail:
							value.unresolved !== undefined
								? copy.card.unresolved(value.unresolved)
								: format.amount(value.value, value.currency),
					})),
					field,
				),
			];
		}
	}
}

/** How many questions went to the provider, all in one call: the intent's first. */
function questionsOf({ fields }: Result): number {
	const asked = (count: number) => (count > 0 ? 1 : 0);
	return (
		1 +
		asked(fields.vendor.candidates.length) +
		fields.tags.candidates.length +
		asked(fields.spent_on.candidates.length) +
		asked(fields.total.candidates.length)
	);
}

/**
 * The card's state panel: whether the request asks for a new expense, then
 * each field's candidates, picks and gate, and why it filled or was held.
 */
export function CardPanel({
	content,
	card,
	trace,
}: {
	content: Content;
	card: UseCard<ExpenseFields>;
	trace: Trace | null;
}) {
	const { copy } = content;
	const format = formats(content.locale);
	const { result, error } = card;
	const names = result ? (Object.keys(result.fields) as ExpenseName[]) : [];
	const filled = result && !error ? Object.keys(result.value).length : 0;

	const status = card.loading
		? { tone: "waiting", text: copy.waiting }
		: error
			? { tone: "failed", text: copy.failed }
			: result
				? filled > 0
					? { tone: "filled", text: copy.filled }
					: { tone: "held", text: copy.held }
				: null;

	return (
		<section className="panel" aria-labelledby="card-panel-title">
			<header className="panel-head">
				<h2 id="card-panel-title">{copy.panel}</h2>
				{status && (
					<span className="status" data-tone={status.tone}>
						{status.text}
					</span>
				)}
			</header>

			{!result && !error ? (
				!card.loading && <p className="muted">{copy.idle}</p>
			) : (
				<div className="readout" data-stale={card.loading || undefined}>
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
					{result && (
						<IntentReadout
							result={result}
							failed={error !== null}
							content={content}
							format={format}
						/>
					)}
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

function IntentReadout({
	result,
	failed,
	content,
	format,
}: {
	result: Result;
	failed: boolean;
	content: Content;
	format: Format;
}) {
	const { copy } = content;
	const { intent } = result;
	const labels = ["new_record", "not_mentioned", "not_available"] as const;
	return (
		<section className="field" aria-labelledby="field-intent">
			<div className="field-head">
				<h3 id="field-intent">{copy.card.intent}</h3>
				<span className="field-gate">
					{copy.filter.gate}{" "}
					<span className="data">{format.probability(intent.gate)}</span>
				</span>
			</div>
			<p className="field-reason">
				{copy.card.intentBecause(intentReasonOf(result, failed, format))}
			</p>
			{!failed && (
				<Question
					readout={{
						id: "intent",
						rows: labels.map((label) => ({
							label,
							name: label,
							detail: copy.card.intentLabels[label],
						})),
						answer: intent,
					}}
					gate={intent.gate}
					labelledBy="field-intent"
					content={content}
					format={format}
				/>
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
	name: ExpenseName;
	result: Result;
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
	const readouts = failed ? [] : readoutsOf(name, result, content, format);
	const impliedBy = impliedByOf(name, result);
	const heading = `field-${name}`;

	return (
		<section className="field" aria-labelledby={heading}>
			<div className="field-head">
				<h3 id={heading}>{copy.card.fields[name]}</h3>
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
					? impliedBy
						? copy.card.impliedBecause(
								impliedBy,
								result.value.tags
									?.map((tag) => copy.card.tags[tag])
									.join(", ") ?? "",
							)
						: copy.filter.filledBecause(
								format.probability(lowest),
								format.probability(field.gate),
							)
					: copy.card.heldBecause(
							failed ? { kind: "failed" } : heldReasonOf(name, result, format),
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
