import type { Amount, CardValue } from "justask";
import {
	CardBox,
	CardConfirm,
	CardEntry,
	CardStatus,
	CardUndo,
	type FilledBy,
	useCard,
} from "justask/react";
import { type ReactNode, useRef, useState } from "react";
import { cardEndpoint } from "./api.ts";
import { CardPanel } from "./card-panel.tsx";
import type { Content, ExpenseFields, ExpenseName } from "./content/types.ts";
import { DayPicker } from "./day-picker.tsx";
import { formats, LOCAL_CURRENCY, parseAmount } from "./format.ts";
import { Saved, Suggestions } from "./parts.tsx";
import { costOf, formControls } from "./saved.ts";
import { CaseLayout } from "./showcase.tsx";
import { type Trace, timed, useSuggest } from "./trace.ts";

type Expense = CardValue<ExpenseFields> & { id: number };

/**
 * The fictional invoicing app's new-expense card, filled from a request,
 * beside the state panel. The person fills what was held, or changes what
 * was filled, and saves; the page keeps saved expenses in memory and takes
 * the last one back on Undo, as a host app's own storage would.
 */
export function CardPage({
	content,
	fetch: fetchImpl = fetch,
}: {
	content: Content;
	fetch?: typeof fetch;
}) {
	const { copy } = content;
	const format = formats(content.locale);
	const [expenses, setExpenses] = useState<Expense[]>([]);
	const [trace, setTrace] = useState<Trace | null>(null);
	const nextId = useRef(1);

	const card = useCard<ExpenseFields>({
		endpoint: cardEndpoint(content.language),
		onConfirm: (value) => {
			const id = nextId.current++;
			setExpenses((saved) => [{ ...value, id }, ...saved]);
		},
		fetch: timed(fetchImpl, setTrace),
	});
	const suggest = useSuggest(card);

	function undo() {
		setExpenses((saved) => saved.slice(1));
		card.restore();
		// The undo control is gone with the slot; the restored request takes the focus.
		document.getElementById("card-box")?.focus();
	}

	const label = (name: ExpenseName) => `card-${name}-label`;
	const head = (
		name: ExpenseName,
		filledBy: FilledBy | null,
		htmlFor?: string,
	) => (
		<div className="entry-head">
			{htmlFor ? (
				<label id={label(name)} htmlFor={htmlFor} className="entry-label">
					{copy.card.fields[name]}
				</label>
			) : (
				<span id={label(name)} className="entry-label">
					{copy.card.fields[name]}
				</span>
			)}
			{filledBy === "answer" && (
				<span className="entry-source">{copy.card.fromRequest}</span>
			)}
		</div>
	);

	return (
		<CaseLayout
			content={content}
			shownCase="form"
			call={{ trace, result: card.result, loading: card.loading }}
			labelledBy="card-title"
			hood={<CardPanel content={content} card={card} trace={trace} />}
		>
			<h2 id="card-title">{copy.card.title}</h2>
			<CardBox
				card={card}
				id="card-box"
				label={copy.card.boxLabel}
				placeholder={copy.card.placeholder}
				className="box"
				autoComplete="off"
				spellCheck={false}
			/>
			<Saved
				content={content}
				cost={costOf(formControls(card.result?.value ?? {}))}
				stale={card.loading}
			/>
			<CardStatus
				card={card}
				className="hint card-status"
				announce={({ filled, waiting }) =>
					copy.card.announce(
						filled.map((name) => copy.card.fields[name]),
						waiting.map((name) => copy.card.fields[name]),
					)
				}
				unanswered={copy.card.unanswered}
			/>

			<div className="card">
				<CardEntry card={card} name="vendor" className="entry">
					{({ value, set, filledBy }) => (
						<>
							{head("vendor", filledBy, "card-vendor")}
							<select
								id="card-vendor"
								className="control"
								value={value?.id ?? ""}
								onChange={(event) =>
									set(
										content.vendors.find(({ id }) => id === event.target.value)
											?.value,
									)
								}
							>
								<option value="">{copy.card.chooseVendor}</option>
								{content.vendors.map(({ id, value: vendor }) => (
									<option key={id} value={id}>
										{vendor.name}
									</option>
								))}
							</select>
						</>
					)}
				</CardEntry>
				<CardEntry card={card} name="tags" className="entry">
					{({ value = [], set, filledBy }) => (
						<fieldset className="tags" aria-labelledby={label("tags")}>
							{head("tags", filledBy)}
							<div className="tag-list">
								{content.tags.map(({ id, value: tag }) => (
									<label key={id} className="tag">
										<input
											type="checkbox"
											checked={value.includes(tag)}
											onChange={(event) => {
												const next = event.target.checked
													? [...value, tag]
													: value.filter((other) => other !== tag);
												set(next.length > 0 ? next : undefined);
											}}
										/>
										{copy.card.tags[tag]}
									</label>
								))}
							</div>
						</fieldset>
					)}
				</CardEntry>
				<CardEntry card={card} name="spent_on" className="entry">
					{({ value, set, filledBy }) => (
						<>
							{head("spent_on", filledBy)}
							<DayPicker
								labelId={label("spent_on")}
								value={value}
								onChange={set}
								copy={copy.card}
								locale={content.locale}
								format={format.date}
							/>
						</>
					)}
				</CardEntry>
				<CardEntry card={card} name="total" className="entry">
					{({ value, set, filledBy }) => (
						<>
							{head("total", filledBy, "card-total")}
							<AmountInput
								key={answerKey(card.result)}
								id="card-total"
								value={value}
								onChange={set}
							/>
						</>
					)}
				</CardEntry>
			</div>

			<div className="confirm-row">
				<CardConfirm card={card} className="confirm">
					{copy.card.confirm}
				</CardConfirm>
				<CardUndo card={card} className="undo">
					<span>{copy.card.saved}</span>
					<button type="button" className="clear" onClick={undo}>
						{copy.card.undo}
					</button>
				</CardUndo>
			</div>

			<section className="suggestions" aria-labelledby="suggestions-title">
				<h3 id="suggestions-title">{copy.suggestions}</h3>
				<Suggestions
					id="fills"
					title={copy.card.fills}
					requests={content.cardSuggestions.fills}
					onPick={suggest}
				/>
				<Suggestions
					id="holds"
					title={copy.card.holds}
					requests={content.cardSuggestions.holds}
					onPick={suggest}
				/>
				<Suggestions
					id="nothing"
					title={copy.card.nothing}
					requests={content.cardSuggestions.nothing}
					onPick={suggest}
				/>
			</section>

			<section className="table-section" aria-labelledby="expenses-title">
				<h3 id="expenses-title" className="label">
					{copy.card.expenses}
				</h3>
				{expenses.length === 0 ? (
					<p className="muted">{copy.card.noExpenses}</p>
				) : (
					<ul className="expenses" aria-labelledby="expenses-title">
						{expenses.map((expense) => (
							<SavedExpense
								key={expense.id}
								expense={expense}
								content={content}
							/>
						))}
					</ul>
				)}
			</section>
		</CaseLayout>
	);
}

function SavedExpense({
	expense,
	content,
}: {
	expense: Expense;
	content: Content;
}) {
	const { copy } = content;
	const format = formats(content.locale);
	const details = [
		expense.spent_on && format.date(expense.spent_on),
		expense.tags?.map((tag) => copy.card.tags[tag]).join(", "),
	].filter(Boolean);
	let total: ReactNode = null;
	if (expense.total) {
		const { value, currency } = expense.total;
		total = format.amount(value, currency);
	}
	return (
		<li className="expense">
			<span className="expense-vendor">{expense.vendor?.name}</span>
			{details.length > 0 && (
				<span className="expense-details">{details.join(" · ")}</span>
			)}
			<span className="expense-total data">{total}</span>
		</li>
	);
}

const answerIds = new WeakMap<object, number>();
let lastAnswerId = 0;

/**
 * A key that changes with each answer, so the amount box drops text the
 * person typed that no longer stands for the card's amount.
 */
function answerKey(result: object | null): number {
	if (result === null) return 0;
	let id = answerIds.get(result);
	if (id === undefined) {
		id = ++lastAnswerId;
		answerIds.set(result, id);
	}
	return id;
}

/** How an amount shows in its box: two decimals, as money is written. */
function amountText(amount: Amount | undefined): string {
	return amount === undefined ? "" : amount.value.toFixed(2);
}

/**
 * The amount's control: a text box that keeps what the person types, so
 * "86." stays on screen while it is being typed, and fills the field with
 * the number it reads. The currency the request gave stays with it.
 */
function AmountInput({
	id,
	value,
	onChange,
}: {
	id: string;
	value: Amount | undefined;
	onChange: (value: Amount | undefined) => void;
}) {
	// The text the person typed, kept only while the field holds what it read.
	const [typed, setTyped] = useState<{ for: Amount | undefined; text: string }>(
		{
			for: undefined,
			text: "",
		},
	);
	const text = typed.for === value ? typed.text : amountText(value);
	const currency = value?.currency;
	return (
		<div className="amount">
			<span className="amount-mark" aria-hidden="true">
				{currency && currency !== LOCAL_CURRENCY ? currency : "$"}
			</span>
			<input
				id={id}
				className="control amount-input data"
				inputMode="decimal"
				autoComplete="off"
				value={text}
				onChange={(event) => {
					// Only a number's characters: digits, separators and spaces.
					const next = event.target.value.replace(/[^\d.,\s]/g, "");
					const number = parseAmount(next);
					const amount =
						number === undefined
							? undefined
							: { value: number, ...(currency && { currency }) };
					setTyped({ for: amount, text: next });
					onChange(amount);
				}}
			/>
		</div>
	);
}
