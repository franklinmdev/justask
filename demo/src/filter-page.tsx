import type { AmountRange, DateRange, FieldValue, FilterValue } from "justask";
import {
	FilterBox,
	FilterConfirm,
	FilterEmpty,
	FilterFields,
	useFilter,
} from "justask/react";
import { type CSSProperties, useState } from "react";
import { filterEndpoint } from "./api.ts";
import type {
	Content,
	FieldName,
	Transaction,
	TransactionFields,
} from "./content/types.ts";
import { DayPicker } from "./day-picker.tsx";
import { FilterPanel } from "./filter-panel.tsx";
import { formats, LOCAL_CURRENCY, parseAmount } from "./format.ts";
import { DEBOUNCE_MS, RecordedLabel, Suggestions } from "./parts.tsx";
import { dayOf, type TableRecording } from "./recording.ts";
import { useReplay } from "./replay.ts";
import { CaseLayout } from "./showcase.tsx";
import { useSuggest } from "./trace.ts";

type Applied = FilterValue<TransactionFields>;

/** The table's controls in the order they show, which Apply sets them in. */
const fieldOrder: FieldName[] = ["vendor", "status", "date", "amount"];

/** The controls one Apply set, in field order; the round restarts their motion. */
type Settling = { round: number; names: FieldName[] };

/** Every row the table's controls keep. The table's amounts are in the local currency, so another one keeps none. */
function matches(row: Transaction, filter: Applied): boolean {
	const { vendor, status, date, amount } = filter;
	if (vendor && row.vendorId !== vendor.id) return false;
	if (status && row.status !== status) return false;
	if (date?.from && row.date < date.from) return false;
	if (date?.to && row.date > date.to) return false;
	if (amount) {
		if (amount.currency && amount.currency !== LOCAL_CURRENCY) return false;
		if (amount.min !== undefined && row.amount < amount.min) return false;
		if (amount.max !== undefined && row.amount > amount.max) return false;
	}
	return true;
}

/** One field's filter in the page's own words, for the proposed and the applied filters alike. */
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

/**
 * The table's controls once Apply is pressed: a filled field replaces its
 * control's value, a held one leaves it as it was. The amount control is two
 * bounds, so an exact amount sets both.
 */
function applyTo(table: Applied, value: Applied): Applied {
	const next = { ...table, ...value };
	if (value.amount?.exact !== undefined) {
		const { exact, ...rest } = value.amount;
		next.amount = { ...rest, min: exact, max: exact };
	}
	return next;
}

/** The range with one end changed, or no filter once neither end is left. */
function withEnd<R extends DateRange | AmountRange>(
	range: R | undefined,
	end: keyof R,
	value: R[keyof R] | undefined,
	ends: (keyof R)[],
): R | undefined {
	const next = { ...range } as R;
	delete next[end];
	if (value !== undefined) next[end] = value;
	return ends.some((name) => next[name] !== undefined) ? next : undefined;
}

/** A set field's value in the page's own words. */
function valueWords<K extends FieldName>(
	words: ReturnType<typeof fieldWords>,
	name: K,
	value: Applied,
): string {
	return words[name](value[name] as FieldValue<TransactionFields[K]>);
}

function FieldChip({ name, text }: { name: string; text: string }) {
	return (
		<>
			<span className="filter-name">{name}</span>
			<span className="filter-value">{text}</span>
		</>
	);
}

/**
 * The fictional invoicing app's transactions table, filtered from a request,
 * beside the state panel. The proposed filters stay in justask until the
 * person applies them; only then does the table change, its controls
 * settling in field order. With a recording, the case opens on it replayed:
 * the sentence, the proposal, then Apply pressed on screen.
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
	// What the table's own controls hold: Apply sets them, and so does the person.
	const [applied, setApplied] = useState<Applied>({});
	// Clear filters renews the controls, so text in a box that set no bound goes too.
	const [cleared, setCleared] = useState(0);
	const [settling, setSettling] = useState<Settling>({ round: 0, names: [] });
	// What Apply set and held, for a screen reader.
	const [appliedWords, setAppliedWords] = useState("");
	const replay = useReplay({ recording, fetch: fetchImpl });
	const { trace } = replay;

	const filter = useFilter<TransactionFields>({
		endpoint: filterEndpoint(content.language),
		timing: { on: "type", debounceMs: DEBOUNCE_MS },
		onConfirm: (value) => {
			setApplied((table) => applyTo(table, value));
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
	replay.follow(filter, { ready: filter.ready, press: filter.confirm });
	const box = replay.take(filter);
	const suggest = useSuggest(box);
	const announcement =
		appliedWords ||
		(recording && replay.started
			? copy.replaying(
					formats(content.locale).date(dayOf(recording)),
					recording.request,
				)
			: "");

	const chip =
		<K extends FieldName>(name: K) =>
		(value: FieldValue<TransactionFields[K]>) => (
			<FieldChip name={copy.filter.fields[name]} text={words[name](value)} />
		);
	const rows = content.transactions.filter((row) => matches(row, applied));

	return (
		<CaseLayout
			content={content}
			shownCase="table"
			call={{ trace, result: filter.result, loading: filter.loading }}
			labelledBy="transactions-title"
			hood={<FilterPanel content={content} filter={filter} trace={trace} />}
		>
			<div className="case-head">
				<h2 id="transactions-title">{copy.filter.transactions}</h2>
				{recording && replay.recorded && (
					<RecordedLabel content={content} recording={recording} />
				)}
			</div>
			<p className="visually-hidden" role="status">
				{announcement}
			</p>
			<FilterBox
				filter={box}
				label={copy.filter.boxLabel}
				placeholder={copy.filter.placeholder}
				className="box"
				autoComplete="off"
				spellCheck={false}
			/>
			<FilterFields
				filter={filter}
				label={copy.filter.proposed}
				className="proposed"
				itemProps={{ className: "filter" }}
				removeProps={{ className: "filter-remove" }}
				render={{
					vendor: chip("vendor"),
					status: chip("status"),
					date: chip("date"),
					amount: chip("amount"),
				}}
				removeLabel={(name) =>
					copy.filter.removeLabel(copy.filter.fields[name])
				}
				removeContent={copy.filter.remove}
				removedLabel={(name) => copy.filter.removed(copy.filter.fields[name])}
				announcementProps={{ className: "visually-hidden" }}
			/>
			<FilterEmpty filter={filter} className="result">
				<p className="empty">{copy.filter.empty}</p>
			</FilterEmpty>
			<div className="confirm-row">
				<FilterConfirm
					filter={filter}
					className="confirm"
					data-pressed={replay.pressing || undefined}
				>
					{copy.filter.confirm}
				</FilterConfirm>
			</div>

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

			<section className="table-section" aria-labelledby="applied-title">
				<div className="applied">
					<h3 id="applied-title" className="label">
						{copy.filter.applied}
					</h3>
					<p className="applied-count" role="status">
						{copy.filter.showing(rows.length, content.transactions.length)}
					</p>
					{Object.keys(applied).length > 0 && (
						<button
							type="button"
							className="clear"
							onClick={() => {
								setApplied({});
								setCleared((count) => count + 1);
							}}
						>
							{copy.filter.clear}
						</button>
					)}
				</div>
				<TableFilters
					key={cleared}
					content={content}
					value={applied}
					onChange={setApplied}
					settling={settling}
				/>
				<Transactions content={content} rows={rows} />
			</section>
		</CaseLayout>
	);
}

/**
 * The table's own filter controls: vendor, status, a date range and an
 * amount range. Apply sets them from the request, and the person fills or
 * changes any of them here, never through justask's pieces.
 */
function TableFilters({
	content,
	value,
	onChange,
	settling,
}: {
	content: Content;
	value: Applied;
	onChange: (value: Applied) => void;
	settling: Settling;
}) {
	const { copy } = content;
	const { fields, controls } = copy.filter;
	const format = formats(content.locale);

	function set<K extends FieldName>(name: K, field: Applied[K] | undefined) {
		const next = { ...value };
		delete next[name];
		if (field !== undefined) next[name] = field;
		onChange(next);
	}
	const day = (end: "from" | "to") => (iso: string | undefined) =>
		set("date", withEnd(value.date, end, iso, ["from", "to"]));
	// A bound typed here is in the table's own currency, so one the request named goes.
	const bound = (end: "min" | "max") => (amount: number | undefined) => {
		const { currency: _, ...range } = value.amount ?? {};
		set("amount", withEnd(range, end, amount, ["min", "max"]));
	};
	const currency = value.amount?.currency;
	// A control Apply just set remounts, so it settles in again, after the ones before it.
	const at = (name: FieldName) => settling.names.indexOf(name);
	const keyOf = (name: FieldName) =>
		at(name) === -1 ? name : `${name}-${settling.round}`;
	const settle = (name: FieldName) =>
		at(name) === -1
			? {}
			: {
					"data-settle": "",
					style: { "--settle-at": at(name) } as CSSProperties,
				};

	return (
		<div className="table-filters">
			<div key={keyOf("vendor")} className="table-filter" {...settle("vendor")}>
				<label htmlFor="table-vendor" className="entry-label">
					{fields.vendor}
				</label>
				<select
					id="table-vendor"
					className="control"
					value={value.vendor?.id ?? ""}
					onChange={(event) =>
						set(
							"vendor",
							content.vendors.find(({ id }) => id === event.target.value)
								?.value,
						)
					}
				>
					<option value="">{controls.allVendors}</option>
					{content.vendors.map(({ id, value: vendor }) => (
						<option key={id} value={id}>
							{vendor.name}
						</option>
					))}
				</select>
			</div>
			<div key={keyOf("status")} className="table-filter" {...settle("status")}>
				<label htmlFor="table-status" className="entry-label">
					{fields.status}
				</label>
				<select
					id="table-status"
					className="control"
					value={value.status ?? ""}
					onChange={(event) =>
						set(
							"status",
							content.statuses.find(({ id }) => id === event.target.value)
								?.value,
						)
					}
				>
					<option value="">{controls.allStatuses}</option>
					{content.statuses.map(({ id, value: status }) => (
						<option key={id} value={id}>
							{copy.statuses[status]}
						</option>
					))}
				</select>
			</div>
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
	// The text the person typed, kept only while the bound holds what it read.
	const [typed, setTyped] = useState<{ for: number | undefined; text: string }>(
		{ for: undefined, text: "" },
	);
	const shown =
		value === undefined
			? ""
			: Number.isInteger(value)
				? String(value)
				: value.toFixed(2);
	return (
		<input
			id={id}
			className="control data"
			inputMode="decimal"
			autoComplete="off"
			placeholder={placeholder}
			value={typed.for === value ? typed.text : shown}
			onChange={(event) => {
				// Only a number's characters: digits, separators and spaces.
				const text = event.target.value.replace(/[^\d.,\s]/g, "");
				const number = parseAmount(text);
				setTyped({ for: number, text });
				onChange(number);
			}}
		/>
	);
}

function Transactions({
	content,
	rows,
}: {
	content: Content;
	rows: Transaction[];
}) {
	const { copy } = content;
	const format = formats(content.locale);
	const vendorName = new Map(
		content.vendors.map(({ id, value }) => [id, value.name]),
	);
	if (rows.length === 0) {
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
				{rows.map((row) => (
					<tr key={row.number}>
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
