import type { Usage } from "@justask/core";
import type { SearchError } from "@justask/core/react";
import {
	type ClipboardEvent,
	type CSSProperties,
	createContext,
	type InputEvent,
	type KeyboardEvent,
	use,
	useEffect,
	useRef,
	useState,
} from "react";
import { REQUEST_LIMIT } from "./api.ts";
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
 * The request box's limit, and whether a paste or a key ran into it: the
 * box's maxLength cuts what does not fit and says nothing, and what was cut
 * may be the amount or the date (#225). It stops saying so once the request
 * is under the limit again. Spread `box` on the box, and render `LimitNote`.
 */
export function useRequestLimit(request: string, id: string) {
	// The request when a paste or a key ran into the limit; a paste's own text lands after it.
	const [cutAt, setCutAt] = useState<string | null>(null);
	if (cutAt !== null && request !== cutAt && request.length < REQUEST_LIMIT) {
		setCutAt(null);
	}
	const cut = cutAt !== null;
	const kept = (input: HTMLInputElement) =>
		input.value.length -
		((input.selectionEnd ?? 0) - (input.selectionStart ?? 0));
	return {
		cut,
		id,
		box: {
			maxLength: REQUEST_LIMIT,
			...(cut && { "aria-describedby": id }),
			onPaste: (event: ClipboardEvent<HTMLInputElement>) => {
				const pasted = event.clipboardData.getData("text/plain");
				if (kept(event.currentTarget) + pasted.length > REQUEST_LIMIT) {
					setCutAt(request);
				}
			},
			onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
				const typed =
					event.key.length === 1 && !event.ctrlKey && !event.metaKey;
				if (typed && kept(event.currentTarget) >= REQUEST_LIMIT) {
					setCutAt(request);
				}
			},
			// A phone's keyboard names no key ("Unidentified"), so its text is caught as it goes in.
			onBeforeInput: (event: InputEvent<HTMLInputElement>) => {
				if (event.data && kept(event.currentTarget) >= REQUEST_LIMIT) {
					setCutAt(request);
				}
			},
		},
	};
}

/** Under the box: what `useRequestLimit` found, empty until a paste or a key ran into the limit. */
export function LimitNote({
	content,
	limit,
}: {
	content: Content;
	limit: ReturnType<typeof useRequestLimit>;
}) {
	return (
		<p id={limit.id} className="hint limit-note" role="status">
			{limit.cut ? content.copy.cut(REQUEST_LIMIT) : ""}
		</p>
	);
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
