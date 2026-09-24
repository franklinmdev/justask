import type { Usage } from "justask";
import type { SearchError } from "justask/react";
import type { CSSProperties } from "react";
import type { Content, Cost, HeldReason } from "./content/types.ts";
import { formats } from "./format.ts";
import { dayOf, type Recording } from "./recording.ts";
import type { Replay } from "./replay.ts";

/**
 * Not measured yet: the demo is where the pause gets measured, so the round
 * trip it shows is part of the point.
 */
export const DEBOUNCE_MS = 300;

/** Why a call failed, as both panels explain it; the filter's error is the same type. */
export function failureOf(error: SearchError): HeldReason {
	switch (error.kind) {
		case "provider":
			return { kind: "provider" };
		case "timeout":
			return { kind: "timeout", timeoutMs: error.timeoutMs };
		default:
			return { kind: "unreachable", message: error.message };
	}
}

export function Suggestions({
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

/** A probability as a bar, with the gate marked on none's. Decorative: the figure beside it is the text. */
export function Bar({ value, gate }: { value: number; gate?: number }) {
	return (
		<span className="bar" aria-hidden="true">
			<span className="bar-fill" style={{ transform: `scaleX(${value})` }} />
			{gate !== undefined && (
				<span className="bar-gate" style={{ left: `${gate * 100}%` }} />
			)}
		</span>
	);
}

/**
 * What makes a control settle in `at` places after the first one an answer
 * set; nothing for -1, a control it did not set.
 */
export function settleAt(at: number): Settle {
	if (at === -1) return {};
	return { "data-settle": "", style: { "--settle-at": at } as CSSProperties };
}

/** A settling control's props, spread on its outermost element. */
export type Settle = { "data-settle"?: ""; style?: CSSProperties };

/**
 * A case's heading, labelled with the day its recorded run ran while the
 * display is the recording's, then the live region that says the replay
 * started. `said` goes first when the page has something newer to say.
 */
export function CaseHead({
	content,
	id,
	title,
	recording,
	replay,
	said = "",
}: {
	content: Content;
	id: string;
	title: string;
	recording: Recording<Usage> | null;
	replay: Pick<Replay, "recorded" | "started">;
	said?: string;
}) {
	const { copy } = content;
	const day = recording ? formats(content.locale).date(dayOf(recording)) : "";
	return (
		<>
			<div className="case-head">
				<h2 id={id}>{title}</h2>
				{recording && replay.recorded && (
					<p className="recorded">{copy.recorded(day)}</p>
				)}
			</div>
			<p className="visually-hidden" role="status">
				{said ||
					(recording && replay.started
						? copy.replaying(day, recording.request)
						: "")}
			</p>
		</>
	);
}

/**
 * Beside the box: the one sentence against the clicks and menus it takes to
 * fill by hand the controls the answer filled. Nothing while it filled none; dimmed
 * while the next answer is on its way.
 */
export function Saved({
	content,
	cost,
	stale,
}: {
	content: Content;
	cost: Cost | null;
	stale: boolean;
}) {
	if (cost === null) return null;
	return (
		<p className="saved" data-stale={stale || undefined}>
			{content.copy.saved(cost)}
		</p>
	);
}
