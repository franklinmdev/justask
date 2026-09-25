import type { Candidate } from "justask";
import { SearchBox, SearchEmpty, SearchItem, useSearch } from "justask/react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { REQUEST_LIMIT, searchEndpoint } from "./api.ts";
import type { Content, Vendor } from "./content/types.ts";
import { formats } from "./format.ts";
import { type Offer, offerOf } from "./offer.ts";
import {
	answerKey,
	CaseHead,
	DEBOUNCE_MS,
	Saved,
	Suggestions,
} from "./parts.tsx";
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
 * what a host app would write; the panel reads the same hook. A held answer
 * never ends empty (#134): a request that could mean more than one vendor
 * offers them as choices, and one that matched none says so, then offers the
 * closest; the person's click shows that vendor's transactions, as a
 * confident pick does, and nothing is picked for them. With a recording, the
 * case opens on it replayed: the sentence, then the vendor.
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
		onChoose: focusTransactions,
		fetch: replay.fetch,
	});
	replay.follow(search);
	const box = replay.stoppedBy(search);
	const suggest = useSuggest(box);
	// The vendor the person picked from the offer, for the answer it was offered on.
	const [chosen, setChosen] = useState<{
		result: object;
		vendor: Vendor;
	} | null>(null);
	const offer = search.answered ? offerOf(search.result) : null;
	const picked =
		offer && chosen?.result === search.result ? chosen.vendor : null;
	const vendor = search.item ?? picked;

	function choose(next: Vendor) {
		if (!search.result) return;
		const { result } = search;
		replay.stop();
		// The table shows before it takes the focus, as a confident pick's does.
		flushSync(() => setChosen({ result, vendor: next }));
		focusTransactions();
	}

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
			{/* Keyed by the answer, so each one's pick settles in and lights again. */}
			<SearchItem
				key={answerKey(search.result)}
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
				{offer?.kind === "choices" && offer.candidates.length === 0 ? (
					<p className="empty">{copy.severalFit}</p>
				) : offer?.kind === "choices" ? (
					<OfferList
						id="choices"
						title={copy.choices}
						offer={offer}
						picked={picked}
						onPick={choose}
					/>
				) : (
					<>
						<p className="empty">{copy.empty}</p>
						{offer && offer.candidates.length > 0 && (
							<OfferList
								id="closest"
								title={copy.closest}
								offer={offer}
								picked={picked}
								onPick={choose}
							/>
						)}
					</>
				)}
			</SearchEmpty>
			{vendor && (
				<Transactions
					content={content}
					vendor={vendor}
					day={dayShown(recording, replay.recorded)}
				/>
			)}

			<section
				className="suggestions"
				aria-labelledby="search-suggestions-title"
			>
				<h3 id="search-suggestions-title">{copy.suggestions}</h3>
				<Suggestions
					id="search-one-vendor"
					title={copy.oneVendor}
					requests={content.suggestions.oneVendor}
					onPick={suggest}
				/>
				<Suggestions
					id="search-ambiguous"
					title={copy.ambiguous}
					requests={content.suggestions.ambiguous}
					onPick={suggest}
				/>
				<Suggestions
					id="search-nothing"
					title={copy.nothing}
					requests={content.suggestions.nothing}
					onPick={suggest}
				/>
			</section>
		</CaseLayout>
	);
}

function focusTransactions() {
	document.getElementById("vendor-transactions")?.focus();
}

/**
 * The vendors a held answer offers, each a button the person picks. The
 * choices are the answer's equals; the closest sit under the message,
 * smaller, so they never read as the answer. Neither lights as a fill: the
 * person picked, not justask.
 */
function OfferList({
	id,
	title,
	offer,
	picked,
	onPick,
}: {
	id: string;
	title: string;
	offer: Offer<Vendor>;
	picked: Vendor | null;
	onPick: (vendor: Vendor) => void;
}) {
	return (
		<div className="offer" data-kind={offer.kind}>
			<p id={`${id}-title`} className="label">
				{title}
			</p>
			<ul className="offer-list" aria-labelledby={`${id}-title`}>
				{offer.candidates.map(({ id: vendorId, value }: Candidate<Vendor>) => (
					<li key={vendorId}>
						<button
							type="button"
							className="choice"
							aria-pressed={picked?.id === vendorId}
							onClick={() => onPick(value)}
						>
							<span className="item-name">{value.name}</span>{" "}
							<span className="item-supplies">{value.supplies}</span>
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
