import type { FieldValue, FilterValue } from "justask";
import {
	FilterBox,
	FilterConfirm,
	FilterEmpty,
	FilterFields,
	useFilter,
} from "justask/react";
import { useState } from "react";
import { filterEndpoint } from "./api.ts";
import type {
	Content,
	FieldName,
	Transaction,
	TransactionFields,
} from "./content/types.ts";
import { FilterPanel } from "./filter-panel.tsx";
import { formats } from "./format.ts";
import { DEBOUNCE_MS, Suggestions } from "./parts.tsx";
import { type Trace, timed, useSuggest } from "./trace.ts";

type Applied = FilterValue<TransactionFields>;

/** Every row the confirmed filter keeps. The table's amounts are in USD, so another currency keeps none. */
function matches(row: Transaction, filter: Applied): boolean {
	const { vendor, status, date, amount } = filter;
	if (vendor && row.vendorId !== vendor.id) return false;
	if (status && row.status !== status) return false;
	if (date?.from && row.date < date.from) return false;
	if (date?.to && row.date > date.to) return false;
	if (amount) {
		if (amount.currency && amount.currency !== "USD") return false;
		if (amount.exact !== undefined && row.amount !== amount.exact) return false;
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
 * person applies them; only then does the table change.
 */
export function FilterPage({
	content,
	fetch: fetchImpl = fetch,
}: {
	content: Content;
	fetch?: typeof fetch;
}) {
	const { copy } = content;
	const words = fieldWords(content);
	const [applied, setApplied] = useState<Applied>({});
	const [trace, setTrace] = useState<Trace | null>(null);

	const filter = useFilter<TransactionFields>({
		endpoint: filterEndpoint(content.language),
		timing: { on: "type", debounceMs: DEBOUNCE_MS },
		onConfirm: setApplied,
		fetch: timed(fetchImpl, setTrace),
	});
	const suggest = useSuggest(filter);

	const chip =
		<K extends FieldName>(name: K) =>
		(value: FieldValue<TransactionFields[K]>) => (
			<FieldChip name={copy.filter.fields[name]} text={words[name](value)} />
		);
	const appliedNames = (Object.keys(applied) as FieldName[]).flatMap((name) => {
		const value = applied[name];
		return value === undefined ? [] : [{ name, value }];
	});
	const rows = content.transactions.filter((row) => matches(row, applied));

	return (
		<main id="main" className="layout">
			<section className="app" aria-labelledby="transactions-title">
				<h2 id="transactions-title">{copy.filter.transactions}</h2>
				<FilterBox
					filter={filter}
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
					<FilterConfirm filter={filter} className="confirm">
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
						{appliedNames.length > 0 && (
							<>
								<ul className="applied-list">
									{appliedNames.map(({ name, value }) => (
										<li key={name} className="filter">
											{chip(name)(value)}
										</li>
									))}
								</ul>
								<button
									type="button"
									className="clear"
									onClick={() => setApplied({})}
								>
									{copy.filter.clear}
								</button>
							</>
						)}
					</div>
					<Transactions content={content} rows={rows} />
				</section>
			</section>

			<FilterPanel content={content} filter={filter} trace={trace} />
		</main>
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
