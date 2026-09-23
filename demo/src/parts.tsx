import type { Usage } from "justask";
import type { SearchError } from "justask/react";
import type { Content, HeldReason } from "./content/types.ts";
import { formats } from "./format.ts";
import { dayOf, type Recording } from "./recording.ts";
import type { Cost } from "./saved.ts";

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

/** The label on a case while its display is the recorded run's, with the day it ran. */
export function RecordedLabel({
	content,
	recording,
}: {
	content: Content;
	recording: Recording<Usage>;
}) {
	const day = formats(content.locale).date(dayOf(recording));
	return <p className="recorded">{content.copy.recorded(day)}</p>;
}

/**
 * Beside the box: the one sentence against the clicks and menus the controls
 * the answer set take by hand. Nothing while the answer set none; dimmed
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
