import { SearchBox, SearchEmpty, SearchItem, useSearch } from "justask/react";
import { useEffect, useState } from "react";
import { searchEndpoint } from "./api.ts";
import type { Content, Vendor } from "./content/types.ts";
import { formats } from "./format.ts";
import { StatePanel, type Trace } from "./state-panel.tsx";

/**
 * Not measured yet: the demo is where the pause gets measured, so the round
 * trip it shows is part of the point.
 */
const DEBOUNCE_MS = 300;

/**
 * The fictional invoicing app's vendor search beside the state panel. The app
 * side is what a host app would write; the panel reads the same hook.
 */
export function SearchPage({
	content,
	fetch: fetchImpl = fetch,
}: {
	content: Content;
	fetch?: typeof fetch;
}) {
	const { copy } = content;
	const [chosen, setChosen] = useState<Vendor | null>(null);
	const [trace, setTrace] = useState<Trace | null>(null);
	const [suggested, setSuggested] = useState<string | null>(null);

	const search = useSearch<Vendor>({
		endpoint: searchEndpoint(content.language),
		timing: { on: "type", debounceMs: DEBOUNCE_MS },
		onChoose: setChosen,
		// Times each call for the panel, and drops the time of one the hook dropped.
		fetch: async (input, init) => {
			const started = performance.now();
			const response = await fetchImpl(input, init);
			if (!init?.signal?.aborted) {
				const { request } = JSON.parse(String(init?.body)) as {
					request: string;
				};
				setTrace({ request, ms: Math.round(performance.now() - started) });
			}
			return response;
		},
	});

	// A suggestion calls at once, once the box holds it.
	useEffect(() => {
		if (suggested !== null && search.request === suggested) {
			setSuggested(null);
			search.submit();
		}
	});

	function suggest(request: string) {
		search.setRequest(request);
		setSuggested(request);
	}

	return (
		<main id="search" className="layout">
			<section className="app" aria-labelledby="vendors-title">
				<h2 id="vendors-title">{copy.vendors}</h2>
				<SearchBox
					search={search}
					label={copy.boxLabel}
					placeholder={copy.placeholder}
					className="box"
					autoComplete="off"
					spellCheck={false}
				/>
				<SearchItem
					search={search}
					className="result"
					itemProps={{ className: "item" }}
				>
					{(vendor) => (
						<>
							<span className="item-name">{vendor.name}</span>
							<span className="item-supplies">{vendor.supplies}</span>
						</>
					)}
				</SearchItem>
				<SearchEmpty search={search} className="result">
					<p className="empty">{copy.empty}</p>
				</SearchEmpty>
				{search.item && chosen?.id !== search.item.id && (
					<p className="hint">{copy.chooseHint}</p>
				)}

				{chosen && <Transactions content={content} vendor={chosen} />}

				<section className="suggestions" aria-labelledby="suggestions-title">
					<h3 id="suggestions-title">{copy.suggestions}</h3>
					<Suggestions
						id="one-vendor"
						title={copy.oneVendor}
						requests={content.suggestions.oneVendor}
						onPick={suggest}
					/>
					<Suggestions
						id="ambiguous"
						title={copy.ambiguous}
						requests={content.suggestions.ambiguous}
						onPick={suggest}
					/>
					<Suggestions
						id="nothing"
						title={copy.nothing}
						requests={content.suggestions.nothing}
						onPick={suggest}
					/>
				</section>
			</section>

			<StatePanel content={content} search={search} trace={trace} />
		</main>
	);
}

function Suggestions({
	id,
	title,
	requests,
	onPick,
}: {
	id: string;
	title: string;
	requests: string[];
	onPick: (request: string) => void;
}) {
	return (
		<div className="suggestion-group">
			<p id={`${id}-title`} className="label">
				{title}
			</p>
			<ul aria-labelledby={`${id}-title`}>
				{requests.map((request) => (
					<li key={request}>
						<button
							type="button"
							className="chip"
							onClick={() => onPick(request)}
						>
							{request}
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

function Transactions({
	content,
	vendor,
}: {
	content: Content;
	vendor: Vendor;
}) {
	const { copy } = content;
	const format = formats(content.locale);
	const rows = content.transactions.filter(
		({ vendorId }) => vendorId === vendor.id,
	);
	return (
		<table className="transactions">
			<caption>{copy.transactionsWith(vendor.name)}</caption>
			<thead>
				<tr>
					<th scope="col">{copy.columns.number}</th>
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
						<td className="data">{format.date(row.date)}</td>
						<td className="data numeric">{format.amount(row.amount)}</td>
						<td data-status={row.status}>{copy.statuses[row.status]}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
