import { SearchBox, SearchEmpty, SearchItem, useSearch } from "justask/react";
import { REQUEST_LIMIT, searchEndpoint } from "./api.ts";
import type { Content, Vendor } from "./content/types.ts";
import { formats } from "./format.ts";
import { CaseHead, DEBOUNCE_MS, Saved, Suggestions } from "./parts.tsx";
import { dayShown, type SearchRecording } from "./recording.ts";
import { useReplay } from "./replay.ts";
import { costOf, searchControls } from "./saved.ts";
import { CaseLayout } from "./showcase.tsx";
import { StatePanel } from "./state-panel.tsx";
import { useSuggest } from "./trace.ts";
import { transactionsOn } from "./transactions.ts";

/**
 * The fictional invoicing app's vendor search, with the state panel under
 * the hood. The vendor found shows its transactions at once. The app side is
 * what a host app would write; the panel reads the same hook. With a
 * recording, the case opens on it replayed: the sentence, then the vendor.
 */
export function SearchPage({
	content,
	recording = null,
	fetch: fetchImpl = fetch,
}: {
	content: Content;
	recording?: SearchRecording | null;
	fetch?: typeof fetch;
}) {
	const { copy } = content;
	const replay = useReplay({ recording, fetch: fetchImpl });
	const { trace } = replay;

	const search = useSearch<Vendor>({
		endpoint: searchEndpoint(content.language),
		timing: { on: "type", debounceMs: DEBOUNCE_MS },
		// The transactions already show; choosing the vendor takes the person to them.
		onChoose: () => document.getElementById("vendor-transactions")?.focus(),
		fetch: replay.fetch,
	});
	replay.follow(search);
	const box = replay.stoppedBy(search);
	const suggest = useSuggest(box);

	return (
		<CaseLayout
			content={content}
			shownCase="search"
			call={{ trace, result: search.result, loading: search.loading }}
			labelledBy="vendors-title"
			hood={<StatePanel content={content} search={search} trace={trace} />}
		>
			<CaseHead
				content={content}
				id="vendors-title"
				title={copy.vendors}
				recording={recording}
				replay={replay}
			/>
			<SearchBox
				search={box}
				label={copy.boxLabel}
				placeholder={copy.placeholder}
				className="box"
				autoComplete="off"
				spellCheck={false}
				maxLength={REQUEST_LIMIT}
			/>
			<Saved
				content={content}
				cost={costOf(searchControls(search.result?.item ?? null))}
				stale={search.loading}
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
			{search.item && (
				<Transactions
					content={content}
					vendor={search.item}
					day={dayShown(recording, replay.recorded)}
				/>
			)}

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
		</CaseLayout>
	);
}

function Transactions({
	content,
	vendor,
	day,
}: {
	content: Content;
	vendor: Vendor;
	/** The day the app is on, which dates its transactions. */
	day: string;
}) {
	const { copy } = content;
	const format = formats(content.locale);
	const rows = transactionsOn(content.transactions, day).filter(
		({ vendorId }) => vendorId === vendor.id,
	);
	return (
		<table id="vendor-transactions" className="transactions" tabIndex={-1}>
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
