import type { Usage } from "justask";
import { useEffect, useRef, useState } from "react";
import { type Recording, traceOf } from "./recording.ts";
import { type Trace, timed } from "./trace.ts";

/** The pause before the sentence starts, so the page has painted. */
const START_MS = 400;

/** One character per step, about a fast typist. */
const TYPE_MS = 35;

/** The pause after the last character before Enter, for a box that calls only on Enter. */
const ENTER_MS = 300;

type Timers = { current: ReturnType<typeof setTimeout>[] };

/** Runs `step` after `ms`, kept in `timers` so the replay can drop it. */
function later(timers: Timers, ms: number, step: () => void) {
	timers.current.push(setTimeout(step, ms));
}

/** Drops every step still due. */
function drop(timers: Timers) {
	for (const timer of timers.current) clearTimeout(timer);
	timers.current = [];
}

/** Where a tab remembers that a recording's replay played in it. */
function playedKey({ set, row }: Recording<Usage>): string {
	return `justask-demo:played:${set}:${row}`;
}

/** True when this browser tab already played the recording's replay. Blocked storage never has. */
function playedBefore(recording: Recording<Usage>): boolean {
	try {
		return sessionStorage.getItem(playedKey(recording)) !== null;
	} catch {
		return false;
	}
}

/** Remembers for the tab's life that the recording's replay played. Blocked storage forgets. */
function markPlayed(recording: Recording<Usage>) {
	try {
		sessionStorage.setItem(playedKey(recording), "1");
	} catch {}
}

/** Forgets the recording's replay played, so the next one types in again. */
export function forgetPlayed(recording: Recording<Usage>) {
	try {
		sessionStorage.removeItem(playedKey(recording));
	} catch {}
}

/** Under reduced motion the sentence appears whole instead of typing in. */
function reducedMotion(): boolean {
	return (
		typeof matchMedia !== "function" ||
		matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/** What the replay needs from a flow's hook: the box. */
type Flow = {
	request: string;
	setRequest: (request: string) => void;
	submit: () => void;
};

export type Replay = {
	/** Hands the replay the flow's hook on every render. */
	follow: (flow: Flow) => void;
	/** The hook's `fetch`: the recorded response for the replayed sentence, a timed live call for anything else. */
	fetch: typeof fetch;
	/** The flow for the box and the suggestions: anything the person types or picks ends the replay. */
	stoppedBy: <F extends Flow>(flow: F) => F;
	/** Ends the replay, for anything else the person does, such as setting a control. */
	stop: () => void;
	/** The trace of the call on display, recorded or live. */
	trace: Trace | null;
	/** True while the display is the recording's, so it is labelled with its date. */
	recorded: boolean;
	/** True from the sentence's first character until the person takes over, so the replay is announced. */
	started: boolean;
	/**
	 * True while the display is an end state opened with nothing typed in, so
	 * what its answer filled shows still: it settles in only when the replay
	 * types in (#139).
	 */
	still: boolean;
};

/**
 * Opens a case on its recorded run at no cost: the sentence types into the
 * box, the hook's call is answered with the recorded response and the hood
 * shows the recorded latency and use. A box that calls only on Enter,
 * `enter`, has Enter pressed once the sentence is in. It never presses
 * Save: that stays the person's. Typing or picking a suggestion ends it,
 * and the next call is a live one that replaces the recording's display.
 * With no recording the case opens idle.
 *
 * A replay plays once per browser tab (#135): once it has started, a reload
 * opens the case on its end state at once, the sentence in the box and the
 * recorded answer shown, with no typing. The case keeps what it showed while
 * another case is on screen: a hidden <Activity> runs this hook's effect
 * again when it shows, so whether the replay started lives in a ref, never
 * in the effect, and a replay left halfway ends on its end state too.
 * Either end state opens still, until the person takes over or a live call
 * replaces it.
 */
export function useReplay({
	recording,
	fetch: fetchImpl,
	enter = false,
}: {
	recording: Recording<Usage> | null;
	fetch: typeof fetch;
	enter?: boolean;
}): Replay {
	const [trace, setTrace] = useState<Trace | null>(null);
	const [recorded, setRecorded] = useState(recording !== null);
	const [started, setStarted] = useState(false);
	const [still, setStill] = useState(false);
	// Set once the person takes over, and once the recorded response is served.
	const stopped = useRef(recording === null);
	const served = useRef(false);
	// Set once the replay has typed in, here or earlier in this browser tab.
	const played = useRef(recording !== null && playedBefore(recording));
	// Set while the end state waits for its sentence to render, to call on it.
	const ending = useRef(false);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	// The latest render's flow, for the steps that run later.
	const latest = useRef<Flow | null>(null);

	useEffect(() => {
		if (recording === null || stopped.current || served.current) return;
		const { request } = recording;
		if (played.current) {
			// The end state at once: the sentence, then its call, on the next render.
			latest.current?.setRequest(request);
			ending.current = true;
			setStill(true);
			return;
		}
		later(timers, START_MS, () => {
			played.current = true;
			markPlayed(recording);
			setStarted(true);
		});
		const typingMs = reducedMotion() ? 0 : request.length * TYPE_MS;
		if (typingMs === 0) {
			later(timers, START_MS, () => latest.current?.setRequest(request));
		} else {
			for (let typed = 1; typed <= request.length; typed++) {
				later(timers, START_MS + typed * TYPE_MS, () =>
					latest.current?.setRequest(request.slice(0, typed)),
				);
			}
		}
		// The box's own pause then calls, or Enter does, and `fetch` answers from the recording.
		if (enter) {
			later(timers, START_MS + typingMs + ENTER_MS, () =>
				latest.current?.submit(),
			);
		}
		return () => drop(timers);
	}, [recording, enter]);

	// The end state's call, once the box holds the sentence: the recording answers it.
	useEffect(() => {
		if (!ending.current || latest.current?.request !== recording?.request) {
			return;
		}
		ending.current = false;
		latest.current?.submit();
	});

	/**
	 * The person took over: the replay ends, and the label and its
	 * announcement go with it, even when an empty box makes no call to
	 * replace the rest.
	 */
	function stop() {
		setRecorded(false);
		setStarted(false);
		setStill(false);
		if (stopped.current) return;
		stopped.current = true;
		ending.current = false;
		drop(timers);
	}

	const live = timed(fetchImpl, (next) => {
		setTrace(next);
		setRecorded(false);
		setStill(false);
	});

	return {
		follow: (flow) => {
			latest.current = flow;
		},
		fetch: async (input, init) => {
			const { request } = JSON.parse(String(init?.body)) as {
				request: string;
			};
			if (
				recording &&
				!stopped.current &&
				!served.current &&
				request === recording.request
			) {
				served.current = true;
				setTrace(traceOf(recording));
				return Response.json(recording.response);
			}
			return live(input, init);
		},
		stoppedBy: (flow) => ({
			...flow,
			setRequest: (request: string) => {
				stop();
				flow.setRequest(request);
			},
		}),
		stop,
		trace,
		recorded,
		started,
		still,
	};
}
