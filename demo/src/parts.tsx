import type { Usage } from "justask";
import type { SearchError } from "justask/react";
import {
	type CSSProperties,
	createContext,
	use,
	useEffect,
	useRef,
	useState,
} from "react";
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
		case "request":
			return { kind: "refused", message: error.message };
		case "too-large":
		case "unsupported":
			return { kind: error.kind };
		case "rate-limited":
			return { kind: "rate-limited", retryAfterMs: error.retryAfterMs };
		case "server":
			return { kind: "server", status: error.status };
		case "network":
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
 * A number box's text: what the person typed, kept while the value is still
 * the one it read, so "86." stays on screen while it is typed; otherwise the
 * value's own text, as when an answer or Clear filters set it.
 */
export function useTypedText<V>(
	value: V | undefined,
	text: (value: V | undefined) => string,
): [shown: string, type: (typed: string, read: V | undefined) => void] {
	const [typed, setTyped] = useState<{ for: V | undefined; text: string }>({
		for: undefined,
		text: "",
	});
	return [
		typed.for === value ? typed.text : text(value),
		(next, read) => setTyped({ for: read, text: next }),
	];
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

/** The answer key while there is no answer. */
const NO_ANSWER = 0;

const answerIds = new WeakMap<object, number>();
let lastAnswerId = 0;

/**
 * A key that changes with each answer, so what the answer filled remounts
 * and settles in again, and the card's amount box drops text the person
 * typed that no longer stands for its amount.
 */
export function answerKey(result: object | null): number {
	if (result === null) return NO_ANSWER;
	let id = answerIds.get(result);
	if (id === undefined) {
		id = ++lastAnswerId;
		answerIds.set(result, id);
	}
	return id;
}

/**
 * True for an answer a replay's end state opened with nothing typed in, so
 * what it filled shows still (#139). It stays still once the person takes
 * over, so nothing on screen settles in late; the next answer settles in.
 */
export function useStillAnswer(answer: number, still: boolean): boolean {
	const [stillAnswer, setStillAnswer] = useState(NO_ANSWER);
	if (still && answer !== NO_ANSWER && answer !== stillAnswer) {
		setStillAnswer(answer);
	}
	return answer !== NO_ANSWER && (still || answer === stillAnswer);
}

/**
 * True while the shown case was opened from the stopped notice's replay: its
 * heading takes the focus the notice held, as the notice took the box's (#222).
 */
export const FocusCaseContext = createContext(false);

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
	const focus = use(FocusCaseContext);
	const heading = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		if (focus) heading.current?.focus();
	}, [focus]);
	return (
		<>
			<div className="case-head">
				<h2 id={id} ref={heading} tabIndex={-1}>
					{title}
				</h2>
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
