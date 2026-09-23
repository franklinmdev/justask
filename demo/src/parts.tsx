import type { SearchError } from "justask/react";
import type { Content, HeldReason } from "./content/types.ts";
import { formats } from "./format.ts";
import type { Trace } from "./trace.ts";

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
 * The last call's round trip, then its input tokens and cost when the
 * provider reported them: an unknown figure is left out, never shown as zero.
 */
export function TraceFigures({
	content,
	trace,
}: {
	content: Content;
	trace: Trace;
}) {
	const { copy } = content;
	const format = formats(content.locale);
	return (
		<>
			<div>
				<dt>{copy.roundTrip}</dt>
				<dd className="data">{trace.ms} ms</dd>
			</div>
			{trace.inputTokens !== undefined && (
				<div>
					<dt>{copy.inputTokens}</dt>
					<dd className="data">{format.count(trace.inputTokens)}</dd>
				</div>
			)}
			{trace.costUsd !== undefined && (
				<div>
					<dt>{copy.cost}</dt>
					<dd className="data">{format.cost(trace.costUsd)}</dd>
				</div>
			)}
		</>
	);
}
