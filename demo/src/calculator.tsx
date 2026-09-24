import { createContext, useContext, useId } from "react";
import type { Content } from "./content/types.ts";
import { formats } from "./format.ts";
import type { Trace } from "./trace.ts";

/** A month, as the calculator counts it. */
const DAYS = 30;

/**
 * The price the calculator names, read from TypeSafe's docs on the day it was
 * built. It is shown, never used: the cost per call is what the run measured.
 * test/jev.test.ts checks the rate against the one the Jev
 * adapter pins, so a change on either side fails there for the owner to read.
 */
export const PRICE = {
	model: "jev-1.13.0",
	usdPerMillionInputTokens: 0.042,
	source: "https://docs.typesafe.ai/models",
	readOn: "2026-09-23",
} as const;

/** Users, times actions per person a day, times the cost per call, times the days. */
export function monthlyCost({
	users,
	actionsPerDay,
	costPerCall,
}: {
	users: number;
	actionsPerDay: number;
	costPerCall: number;
}): number {
	return users * actionsPerDay * costPerCall * DAYS;
}

/** One of the calculator's inputs: the digits typed, and setting them. */
type CalculatorInput = { value: string; set: (value: string) => void };

/**
 * What the person typed into the calculator, kept by the page so it holds
 * across the cases. Digits only, so it reads the same in either language.
 */
export type CalculatorInputs = {
	users: CalculatorInput;
	actions: CalculatorInput;
};

export const CalculatorInputsContext = createContext<CalculatorInputs | null>(
	null,
);

/**
 * The most digits each input keeps: a billion users, and 99,999 actions a
 * day. At both the month stays within what a double holds to the cent.
 */
const MAX_DIGITS = { users: 9, actions: 5 } as const;

/** A whole number, or undefined while the field is empty. */
function countOf(digits: string): number | undefined {
	return digits === "" ? undefined : Number(digits);
}

/**
 * Below the case: the displayed call's measured cost scaled to a month. The
 * person sets users and actions a day; the cost per call follows each new
 * answer and is never typed. A call whose cost the provider did not report
 * prices nothing, and says so.
 */
export function Calculator({
	content,
	trace,
	loading,
}: {
	content: Content;
	trace: Trace | null;
	loading: boolean;
}) {
	const copy = content.copy.calculator;
	const format = formats(content.locale);
	const inputs = useContext(CalculatorInputsContext);
	if (!inputs) throw new Error("The calculator needs the page's inputs");
	const id = useId();
	const users = countOf(inputs.users.value);
	const actions = countOf(inputs.actions.value);
	const costPerCall = trace?.costUsd;
	const month =
		users === undefined || actions === undefined || costPerCall === undefined
			? undefined
			: monthlyCost({ users, actionsPerDay: actions, costPerCall });

	// Why the month is not priced, an empty field first, or the sum that priced it.
	const note: { text: string; kind: "reason" | "invalid" | "formula" } =
		users === undefined || actions === undefined
			? { text: copy.invalid, kind: "invalid" }
			: !trace
				? { text: copy.idle, kind: "reason" }
				: costPerCall === undefined
					? { text: copy.unpriced, kind: "reason" }
					: {
							text: copy.formula(
								format.count(users),
								format.count(actions),
								format.cost(costPerCall),
								DAYS,
							),
							kind: "formula",
						};

	const fields = [
		{ name: "users", label: copy.users, ...inputs.users },
		{ name: "actions", label: copy.actions, ...inputs.actions },
	] as const;

	return (
		<section
			className="calculator"
			aria-labelledby={`${id}-title`}
			data-stale={loading || undefined}
		>
			<h2 id={`${id}-title`}>{copy.title}</h2>
			<div className="calculator-figures">
				<div className="calculator-inputs">
					{fields.map((field) => (
						<div key={field.name} className="calculator-field">
							<label htmlFor={`${id}-${field.name}`} className="label">
								{field.label}
							</label>
							<input
								id={`${id}-${field.name}`}
								name={field.name}
								className="control data"
								inputMode="numeric"
								autoComplete="off"
								value={field.value}
								aria-invalid={field.value === "" || undefined}
								aria-describedby={`${id}-note`}
								onChange={(event) =>
									field.set(
										event.target.value
											.replace(/\D/g, "")
											.slice(0, MAX_DIGITS[field.name]),
									)
								}
							/>
						</div>
					))}
				</div>
				<dl className="calculator-results">
					<div>
						<dt className="label">{copy.costPerCall}</dt>
						{!trace ? (
							<dd className="unreported">{copy.noCall}</dd>
						) : costPerCall === undefined ? (
							<dd className="unreported">{content.copy.notReported}</dd>
						) : (
							<dd className="data">{format.cost(costPerCall)}</dd>
						)}
					</div>
					<div>
						<dt className="label">{copy.perMonth}</dt>
						{month === undefined ? (
							<dd className="unreported">{copy.notPriced}</dd>
						) : (
							<dd>
								<output className="data calculator-month">
									{format.cents(month)}
								</output>
							</dd>
						)}
					</div>
				</dl>
			</div>
			<p id={`${id}-note`} className="calculator-note" data-kind={note.kind}>
				{note.text}
			</p>
			<p className="calculator-source muted">
				{copy.measured}{" "}
				{copy.rate(PRICE.model, format.cost(PRICE.usdPerMillionInputTokens))}{" "}
				{copy.readFrom}{" "}
				<a className="calculator-link" href={PRICE.source}>
					{PRICE.source.replace("https://", "")}
				</a>{" "}
				{copy.readOn(format.date(PRICE.readOn))}
			</p>
		</section>
	);
}
