import type { SearchResult } from "justask";
import type { UseSearch } from "justask/react";
import type { Content, HeldReason, Vendor } from "./content/types.ts";
import { formats } from "./format.ts";
import { Bar, failureOf } from "./parts.tsx";
import type { Trace } from "./trace.ts";

/** The search question's own labels, asked beside the candidates (ADR 0005, 0007). */
const NONE = "none";
const SEVERAL = "several";

type Verdict =
	| { kind: "idle" }
	| { kind: "filled"; name: string; none: number; several: number }
	| { kind: "held"; reason: HeldReason }
	| { kind: "failed"; reason: HeldReason };

/**
 * Reads the last answer the way the search gate does (ADR 0005, 0007): the
 * item fills only when a candidate wins outright and none and several stay
 * below the gate.
 */
function verdictOf(
	search: UseSearch<Vendor>,
	format: ReturnType<typeof formats>,
): Verdict {
	const { result, error } = search;
	if (error) return { kind: "failed", reason: failureOf(error) };
	if (!result) return { kind: "idle" };
	if (result.candidates.length === 0) {
		return { kind: "held", reason: { kind: "no-candidates" } };
	}
	const none = result.probabilities[NONE] ?? 1;
	const several = result.probabilities[SEVERAL] ?? 0;
	if (result.item) {
		return { kind: "filled", name: result.item.name, none, several };
	}
	if (!result.pick) return { kind: "held", reason: { kind: "tie" } };
	if (none >= result.gate) {
		return {
			kind: "held",
			reason: {
				kind: "none-reached-gate",
				none: format.probability(none),
				gate: format.probability(result.gate),
			},
		};
	}
	if (several >= result.gate) {
		return {
			kind: "held",
			reason: {
				kind: "several-reached-gate",
				several: format.probability(several),
				gate: format.probability(result.gate),
			},
		};
	}
	// Below the gate, a none or several pick still holds, like a tie (ADR 0005, 0007).
	return result.pick.label === SEVERAL
		? {
				kind: "held",
				reason: {
					kind: "several-picked",
					several: format.probability(several),
				},
			}
		: {
				kind: "held",
				reason: { kind: "none-picked", none: format.probability(none) },
			};
}

export function StatePanel({
	content,
	search,
	trace,
}: {
	content: Content;
	search: UseSearch<Vendor>;
	trace: Trace | null;
}) {
	const { copy } = content;
	const format = formats(content.locale);
	const verdict = verdictOf(search, format);
	const { result } = search;

	const status = search.loading
		? { tone: "waiting", text: copy.waiting }
		: verdict.kind === "filled"
			? { tone: "filled", text: copy.filled }
			: verdict.kind === "held"
				? { tone: "held", text: copy.held }
				: verdict.kind === "failed"
					? { tone: "failed", text: copy.failed }
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

			{verdict.kind === "idle" ? (
				!search.loading && <p className="muted">{copy.idle}</p>
			) : (
				<div className="readout" data-stale={search.loading || undefined}>
					<p className="reason">
						{verdict.kind === "filled"
							? copy.filledBecause(
									verdict.name,
									format.probability(verdict.none),
									format.probability(verdict.several),
									format.probability(result?.gate ?? 0),
								)
							: copy.heldBecause(verdict.reason)}
					</p>
					<dl className="facts">
						{trace && (
							<div>
								<dt>{copy.request}</dt>
								<dd className="request">{trace.request}</dd>
							</div>
						)}
						{result && (
							<>
								<div>
									<dt>{copy.gate}</dt>
									<dd className="data">{format.probability(result.gate)}</dd>
								</div>
								<div>
									<dt>{copy.shortlistLabel}</dt>
									<dd className="count">
										{copy.shortlist(
											result.candidates.length,
											content.vendors.length,
										)}
									</dd>
								</div>
							</>
						)}
					</dl>
					{result && result.candidates.length > 0 && (
						<Candidates content={content} result={result} />
					)}
				</div>
			)}
		</section>
	);
}

function Candidates({
	content,
	result,
}: {
	content: Content;
	result: SearchResult<Vendor>;
}) {
	const { copy } = content;
	const format = formats(content.locale);
	// A failed call has no probabilities: its figures stay blank, not zero.
	const probability = (label: string) => result.probabilities[label] ?? 0;
	const figure = (label: string) => {
		const value = result.probabilities[label];
		return value === undefined ? "" : format.probability(value);
	};
	const ranked = [...result.candidates].sort(
		(a, b) => probability(b.id) - probability(a.id),
	);

	return (
		<table className="candidates">
			<thead>
				<tr>
					<th scope="col">{copy.candidate}</th>
					<th scope="col" className="numeric">
						{copy.probability}
					</th>
				</tr>
			</thead>
			<tbody>
				{ranked.map(({ id, value }) => {
					const picked = result.pick?.label === id;
					return (
						<tr key={id} data-picked={picked || undefined}>
							<th scope="row">
								<span className="candidate-name">{value.name}</span>
								{picked && <span className="pick">{copy.pick}</span>}
							</th>
							<td>
								<div className="probability">
									<Bar value={probability(id)} />
									<span className="data">{figure(id)}</span>
								</div>
							</td>
						</tr>
					);
				})}
			</tbody>
			<tbody className="own-labels">
				{[NONE, SEVERAL].map((label) => {
					const picked = result.pick?.label === label;
					return (
						<tr key={label} data-picked={picked || undefined}>
							<th scope="row">
								<span className="data">{label}</span>
								{picked && <span className="pick">{copy.pick}</span>}
							</th>
							<td>
								<div className="probability">
									<Bar value={probability(label)} gate={result.gate} />
									<span className="data">{figure(label)}</span>
								</div>
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}
