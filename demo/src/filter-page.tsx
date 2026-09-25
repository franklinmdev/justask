import type { AmountRange, DateRange, FieldValue } from "justask";
import { FilterBox, FilterEmpty, useFilter } from "justask/react";
import { useEffect, useState } from "react";
import { filterEndpoint, REQUEST_LIMIT } from "./api.ts";
import type {
	Content,
	FieldName,
	Transaction,
	TransactionFields,
} from "./content/types.ts";
import { DayPicker } from "./day-picker.tsx";
import { FilterPanel } from "./filter-panel.tsx";
import { formats, LOCAL_CURRENCY, parseAmount } from "./format.ts";
import {
	CaseHead,
	DEBOUNCE_MS,
	Saved,
	type Settle,
	Suggestions,
	settleAt,
	useTypedText,
} from "./parts.tsx";
import { dayShown, type TableRecording } from "./recording.ts";
import { useReplay } from "./replay.ts";
import { costOf, tableControls } from "./saved.ts";
import { CaseLayout } from "./showcase.tsx";
import { useSuggest } from "./trace.ts";
import {
	type Applied,
	answerOver,
	matches,
	setByHand,
	type Table,
	transactionsOn,
} from "./transactions.ts";

/** The table's controls in the order they show, which an answer sets them in. */
const fieldOrder: FieldName[] = ["vendor", "status", "date", "amount"];

/** How many rows a page of the table holds (#134). */
const PAGE_ROWS = 10;

/**
 * The page the table is on, for the controls it was turned under: any change
 * to them goes back to the first. `turned` counts the steps, so a turn
 * swaps the rows at once, with no row motion.
 */
type Paging = { for: Applied; page: number; turned: number };

/** The controls one answer set, in field order; the round restarts their motion. */
type Settling = { round: number; names: FieldName[] };

/** One field's filter in the page's own words, as a screen reader hears what an answer set. */
function fieldWords(content: Content) {
	const { copy } = content;
	const format = formats(content.locale);
	const words: {
		[K in FieldName]: (value: FieldValue<TransactionFields[K]>) => string;
	} = {
		vendor: (vendor) => vendor.name,
		status: (status) => copy.statuses[status],
		date: (range) => copy.filter.dateRange(range, format.date),
		amount: (range) => copy.filter.amountRange(range, format.amount),
	};
	return words;
}

/** A copy with `key` set to `value`, or left out when `value` is undefined. */
function withKey<R extends object, K extends keyof R>(
	record: R,
	key: K,
	value: R[K] | undefined,
): R {
	const next = { ...record };
	delete next[key];
	if (value !== undefined) next[key] = value;
	return next;
}

/** A range's two ends: a date range's days, an amount range's bounds. */
const ends = {
	from: ["from", "to"],
	to: ["from", "to"],
	min: ["min", "max"],
	max: ["min", "max"],
} as const;

/** The range with one end changed, or no filter once neither end is left. */
function withEnd<R extends DateRange | AmountRange>(
	range: R | undefined,
	end: keyof typeof ends & keyof R,
	value: R[keyof R] | undefined,
): R | undefined {
	const next = withKey({ ...range } as R, end, value);
	return ends[end].some((name) => next[name as keyof R] !== undefined)
		? next
		: undefined;
}

/** A set field's value in the page's own words. */
function valueWords<K extends FieldName>(
	words: ReturnType<typeof fieldWords>,
	name: K,
	value: Applied,
): string {
	return words[name](value[name] as FieldValue<TransactionFields[K]>);
}

/**
 * The fictional invoicing app's transactions table, filtered from a request,
 * beside the state panel. Each answer applies itself: filtering is
 * reversible, so nothing asks first, and Clear filters undoes it (#123). The
 * controls it set light up in field order and the rows that enter or leave
 * move, after the answer, never before it. With a recording, the case opens
 * on it replayed: the sentence, then the table filtering.
 */
export function FilterPage({
	content,
	recording = null,
	fetch: fetchImpl = fetch,
}: {
	content: Content;
	recording?: TableRecording | null;
	fetch?: typeof fetch;
}) {
	const { copy } = content;
	const words = fieldWords(content);
	// What the table's own controls hold: an answer sets them, and so does the person.
	const [table, setTable] = useState<Table>({ applied: {}, byAnswer: [] });
	const { applied } = table;
	// Clear filters renews the controls, so text in a box that set no bound goes too.
	const [cleared, setCleared] = useState(0);
	const [settling, setSettling] = useState<Settling>({ round: 0, names: [] });
	// What the answer set and held, for a screen reader.
	const [appliedWords, setAppliedWords] = useState("");
	const replay = useReplay({ recording, fetch: fetchImpl });
	const { trace } = replay;

	const filter = useFilter<TransactionFields>({
		endpoint: filterEndpoint(content.language),
		timing: { on: "type", debounceMs: DEBOUNCE_MS },
		onConfirm: (value) => {
			setTable((now) => answerOver(now, value));
			const names = fieldOrder.filter((name) => value[name] !== undefined);
			setSettling(({ round }) => ({ round: round + 1, names }));
			const held = fieldOrder.filter(
				(name) => filter.result?.value[name] === undefined,
			);
			setAppliedWords(
				copy.filter.appliedFields(
					names.map((name) => [
						copy.filter.fields[name],
						valueWords(words, name, value),
					]),
					held.map((name) => copy.filter.fields[name]),
				),
			);
		},
		fetch: replay.fetch,
	});
	// An answer that fills a field applies at once, typed or suggested. No
	// dependencies: confirm spends the answer, so `ready` stays false until the
	// next one, and a render for anything else confirms nothing. An answer that
	// fills nothing still starts over, dropping the last answer's fields; a
	// failed call is no answer, so its `value` is null and the table stays.
	useEffect(() => {
		if (filter.ready) filter.confirm();
		else if (filter.value !== null) {
			setTable((now) => (now.byAnswer.length > 0 ? answerOver(now, {}) : now));
		}
	});
	replay.follow(filter);
	const box = replay.stoppedBy(filter);
	const suggest = useSuggest(box);
	const transactions = transactionsOn(
		content.transactions,
		dayShown(recording, replay.recorded),
	);
	const rows = transactions.filter((row) => matches(row, applied));
	const [paging, setPaging] = useState<Paging>({
		for: applied,
		page: 0,
		turned: 0,
	});
	const pages = Math.max(1, Math.ceil(rows.length / PAGE_ROWS));
	const page = paging.for === applied ? Math.min(paging.page, pages - 1) : 0;
	const turn = (to: number) =>
		setPaging(({ turned }) => ({ for: applied, page: to, turned: turned + 1 }));

	return (
		<CaseLayout
			content={content}
			shownCase="table"
			call={{ trace, result: filter.result, loading: filter.loading }}
			labelledBy="transactions-title"
			hood={<FilterPanel content={content} filter={filter} trace={trace} />}
		>
			<CaseHead
				content={content}
				id="transactions-title"
				title={copy.filter.transactions}
				recording={recording}
				replay={replay}
				said={appliedWords}
			/>
			<FilterBox
				filter={box}
				label={copy.filter.boxLabel}
				placeholder={copy.filter.placeholder}
				className="box"
				autoComplete="off"
				spellCheck={false}
				maxLength={REQUEST_LIMIT}
			/>
			<Saved
				content={content}
				cost={costOf(tableControls(filter.result?.value ?? {}))}
				stale={filter.loading}
			/>
			<FilterEmpty filter={filter} className="result">
				<p className="empty">{copy.filter.empty}</p>
			</FilterEmpty>

			<section className="table-section" aria-labelledby="applied-title">
				<div className="applied">
					<h3 id="applied-title" className="label">
						{copy.filter.applied}
					</h3>
					<p className="applied-count" role="status">
						{copy.filter.showing(rows.length, transactions.length)}
					</p>
					{Object.keys(applied).length > 0 && (
						<button
							type="button"
							className="clear"
							onClick={() => {
								replay.stop();
								setTable({ applied: {}, byAnswer: [] });
								setCleared((count) => count + 1);
							}}
						>
							{copy.filter.clear}
						</button>
					)}
					{/* Over the table, beside the count, so the case's suggestions stay in the first viewport (#134). */}
					{rows.length > PAGE_ROWS && (
						<Pages
							content={content}
							page={page}
							pages={pages}
							total={rows.length}
							onTurn={turn}
						/>
					)}
				</div>
				<TableFilters
					key={cleared}
					content={content}
					value={applied}
					onChange={(value, name) => {
						// The person's choice stands: the replay never applies over it,
						// and a later answer keeps it.
						replay.stop();
						setTable((now) => setByHand(now, name, value));
					}}
					settling={settling}
				/>
				<Transactions
					key={`page-${paging.turned}`}
					content={content}
					rows={rows.slice(page * PAGE_ROWS, (page + 1) * PAGE_ROWS)}
					all={transactions}
				/>
			</section>

			<section className="suggestions" aria-labelledby="suggestions-title">
				<h3 id="suggestions-title">{copy.suggestions}</h3>
				<Suggestions
					id="fills"
					title={copy.filter.fills}
					requests={content.filterSuggestions.fills}
					onPick={suggest}
				/>
				<Suggestions
					id="holds"
					title={copy.filter.holds}
					requests={content.filterSuggestions.holds}
					onPick={suggest}
				/>
				<Suggestions
					id="nothing"
					title={copy.filter.nothing}
					requests={content.filterSuggestions.nothing}
					onPick={suggest}
				/>
			</section>
		</CaseLayout>
	);
}

/**
 * The table's own filter controls: vendor, status, a date range and an
 * amount range. An answer sets them from the request, and the person fills
 * or changes any of them here, never through justask's pieces.
 */
function TableFilters({
	content,
	value,
	onChange,
	settling,
}: {
	content: Content;
	value: Applied;
	/** The controls' new value, and the field the person changed. */
	onChange: (value: Applied, name: FieldName) => void;
	settling: Settling;
}) {
	const { copy } = content;
	const { fields, controls } = copy.filter;
	const format = formats(content.locale);

	function set<K extends FieldName>(name: K, field: Applied[K] | undefined) {
		onChange(withKey(value, name, field), name);
	}
	const day = (end: "from" | "to") => (iso: string | undefined) =>
		set("date", withEnd(value.date, end, iso));
	// A bound typed here is in the table's own currency, so one the request named goes.
	const bound = (end: "min" | "max") => (amount: number | undefined) => {
		const { currency: _, ...range } = value.amount ?? {};
		set("amount", withEnd(range, end, amount));
	};
	const currency = value.amount?.currency;
	// A control an answer just set remounts, so it settles in again, after the ones before it.
	const at = (name: FieldName) => settling.names.indexOf(name);
	const keyOf = (name: FieldName) =>
		at(name) === -1 ? name : `${name}-${settling.round}`;
	const settle = (name: FieldName) => settleAt(at(name));

	return (
		<div className="table-filters">
			<CatalogSelect
				key={keyOf("vendor")}
				id="table-vendor"
				label={fields.vendor}
				all={controls.allVendors}
				options={content.vendors.map(({ id, value: vendor }) => ({
					id,
					value: vendor,
					name: vendor.name,
				}))}
				chosen={value.vendor?.id}
				onChange={(vendor) => set("vendor", vendor)}
				settle={settle("vendor")}
			/>
			<CatalogSelect
				key={keyOf("status")}
				id="table-status"
				label={fields.status}
				all={controls.allStatuses}
				options={content.statuses.map(({ id, value: status }) => ({
					id,
					value: status,
					name: copy.statuses[status],
				}))}
				chosen={value.status}
				onChange={(status) => set("status", status)}
				settle={settle("status")}
			/>
			<fieldset
				key={keyOf("date")}
				className="table-filter"
				{...settle("date")}
			>
				<legend className="entry-label">{fields.date}</legend>
				<div className="range">
					<span id="table-from" className="visually-hidden">
						{controls.from}
					</span>
					<DayPicker
						labelId="table-from"
						value={value.date?.from}
						onChange={day("from")}
						copy={{ pickDay: controls.fromEmpty, calendar: controls.calendar }}
						locale={content.locale}
						format={format.day}
					/>
					<span id="table-to" className="visually-hidden">
						{controls.to}
					</span>
					<DayPicker
						labelId="table-to"
						value={value.date?.to}
						onChange={day("to")}
						copy={{ pickDay: controls.toEmpty, calendar: controls.calendar }}
						locale={content.locale}
						format={format.day}
					/>
				</div>
			</fieldset>
			<fieldset
				key={keyOf("amount")}
				className="table-filter"
				{...settle("amount")}
			>
				<legend className="entry-label">
					{fields.amount}
					{/* Another currency keeps no row, so the controls say which one the request named. */}
					{currency && currency !== LOCAL_CURRENCY && (
						<span className="entry-source"> {currency}</span>
					)}
				</legend>
				<div className="range">
					<label htmlFor="table-min" className="visually-hidden">
						{controls.min}
					</label>
					<BoundInput
						id="table-min"
						value={value.amount?.min}
						onChange={bound("min")}
						placeholder={controls.minEmpty}
					/>
					<label htmlFor="table-max" className="visually-hidden">
						{controls.max}
					</label>
					<BoundInput
						id="table-max"
						value={value.amount?.max}
						onChange={bound("max")}
						placeholder={controls.maxEmpty}
					/>
				</div>
			</fieldset>
		</div>
	);
}

/** A catalog field's control: one of its items, or all of them while none is chosen. */
function CatalogSelect<T>({
	id,
	label,
	all,
	options,
	chosen,
	onChange,
	settle,
}: {
	id: string;
	label: string;
	all: string;
	options: { id: string; value: T; name: string }[];
	chosen: string | undefined;
	onChange: (value: T | undefined) => void;
	settle: Settle;
}) {
	return (
		<div className="table-filter" {...settle}>
			<label htmlFor={id} className="entry-label">
				{label}
			</label>
			<select
				id={id}
				className="control"
				value={chosen ?? ""}
				onChange={(event) =>
					onChange(
						options.find((option) => option.id === event.target.value)?.value,
					)
				}
			>
				<option value="">{all}</option>
				{options.map((option) => (
					<option key={option.id} value={option.id}>
						{option.name}
					</option>
				))}
			</select>
		</div>
	);
}

/** A bound as its box shows it: whole, or to the cent. */
function boundText(bound: number | undefined): string {
	if (bound === undefined) return "";
	return Number.isInteger(bound) ? String(bound) : bound.toFixed(2);
}

/**
 * One bound of the amount range: a text box that keeps what the person
 * types, so "86." stays on screen while it is typed, and sets the bound to
 * the number it reads.
 */
function BoundInput({
	id,
	value,
	onChange,
	placeholder,
}: {
	id: string;
	value: number | undefined;
	onChange: (value: number | undefined) => void;
	placeholder: string;
}) {
	const [shown, type] = useTypedText(value, boundText);
	return (
		<input
			id={id}
			className="control data"
			inputMode="decimal"
			autoComplete="off"
			placeholder={placeholder}
			value={shown}
			onChange={(event) => {
				// Only a number's characters: digits, separators and spaces.
				const text = event.target.value.replace(/[^\d.,\s]/g, "");
				const number = parseAmount(text);
				type(text, number);
				onChange(number);
			}}
		/>
	);
}

/** How long a row that left stays on screen: its exit, 25 percent faster than an entrance. */
const LEAVE_MS = 150;

/** The row numbers the table holds, and the ones the last change brought in and took out. */
type Shown = { numbers: Set<string>; entered: Set<string>; left: Set<string> };

/** A row on screen and how it moves: in, out, or not at all. */
type ShownRow = { row: Transaction; motion?: "enter" | "leave" };

/**
 * The table's rows as they show: the kept ones, the ones the last change
 * brought in, marked to enter, and the ones it took out, kept for their exit
 * then dropped. A change mid-exit drops the rows still leaving, so motion
 * never queues. The table's first rows show still.
 */
function useRowMotion(rows: Transaction[], all: Transaction[]): ShownRow[] {
	const numbers = new Set(rows.map(({ number }) => number));
	const [shown, setShown] = useState<Shown>({
		numbers,
		entered: new Set(),
		left: new Set(),
	});
	const changed =
		numbers.size !== shown.numbers.size ||
		[...numbers].some((number) => !shown.numbers.has(number));
	if (changed) {
		setShown({
			numbers,
			entered: new Set([...numbers].filter((n) => !shown.numbers.has(n))),
			left: new Set([...shown.numbers].filter((n) => !numbers.has(n))),
		});
	}
	const { left } = shown;
	useEffect(() => {
		if (left.size === 0) return;
		const timer = setTimeout(
			() => setShown((now) => ({ ...now, left: new Set() })),
			LEAVE_MS,
		);
		return () => clearTimeout(timer);
	}, [left]);
	return all.flatMap((row): ShownRow[] => {
		if (left.has(row.number)) return [{ row, motion: "leave" }];
		if (!numbers.has(row.number)) return [];
		return [{ row, ...(shown.entered.has(row.number) && { motion: "enter" }) }];
	});
}

/**
 * The table's pages: which rows show, of every row the filters keep, then
 * the steps. A step at either end stays focusable and does nothing, so the
 * focus never drops to the page.
 */
function Pages({
	content,
	page,
	pages,
	total,
	onTurn,
}: {
	content: Content;
	page: number;
	pages: number;
	total: number;
	onTurn: (page: number) => void;
}) {
	const words = content.copy.filter.pages;
	const first = page * PAGE_ROWS + 1;
	const last = Math.min(total, (page + 1) * PAGE_ROWS);
	const step = (to: number) => (to < 0 || to >= pages ? undefined : to);
	const steps = [
		{ name: words.previous, to: step(page - 1) },
		{ name: words.next, to: step(page + 1) },
	];
	return (
		<nav className="pages" aria-label={words.label}>
			<p className="page-range data" aria-live="polite">
				{words.range(first, last, total)}
			</p>
			<div className="page-steps">
				{steps.map(({ name, to }) => (
					<button
						key={name}
						type="button"
						className="page-step"
						aria-disabled={to === undefined}
						onClick={() => {
							if (to !== undefined) onTurn(to);
						}}
					>
						{name}
					</button>
				))}
			</div>
		</nav>
	);
}

function Transactions({
	content,
	rows,
	all,
}: {
	content: Content;
	rows: Transaction[];
	/** Every transaction, in the table's order, which a leaving row keeps. */
	all: Transaction[];
}) {
	const { copy } = content;
	const format = formats(content.locale);
	const vendorName = new Map(
		content.vendors.map(({ id, value }) => [id, value.name]),
	);
	const shown = useRowMotion(rows, all);
	// Rows still leaving keep the table up until their exit ends.
	if (shown.length === 0) {
		return <p className="empty">{copy.filter.none}</p>;
	}
	return (
		<table className="transactions all">
			<caption className="visually-hidden">{copy.filter.transactions}</caption>
			<thead>
				<tr>
					<th scope="col">{copy.columns.number}</th>
					<th scope="col">{copy.filter.vendorColumn}</th>
					<th scope="col">{copy.columns.date}</th>
					<th scope="col" className="numeric">
						{copy.columns.amount}
					</th>
					<th scope="col">{copy.columns.status}</th>
				</tr>
			</thead>
			<tbody>
				{shown.map(({ row, motion }) => (
					<tr
						key={row.number}
						data-motion={motion}
						// A leaving row is gone for a screen reader already.
						aria-hidden={motion === "leave" || undefined}
					>
						<td className="data">{row.number}</td>
						<td className="vendor">{vendorName.get(row.vendorId)}</td>
						<td className="data">{format.date(row.date)}</td>
						<td className="data numeric">{format.amount(row.amount)}</td>
						<td data-status={row.status}>{copy.statuses[row.status]}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
