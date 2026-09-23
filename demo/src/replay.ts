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

/** How long the proposal shows before Confirm is pressed, then how long it looks pressed. */
const PROPOSAL_MS = 900;
const PRESS_MS = 150;

type Timers = { current: ReturnType<typeof setTimeout>[] };

/** Runs `step` after `ms`, kept in `timers` so the replay can drop it. */
function later(timers: Timers, ms: number, step: () => void) {
	timers.current.push(setTimeout(step, ms));
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
	/**
	 * Hands the replay the flow's hook on every render, with Confirm for a
	 * flow that has it, pressed once the recorded proposal is ready.
	 */
	follow: (flow: Flow, confirm?: { ready: boolean; press: () => void }) => void;
	/** The hook's `fetch`: the recorded answer for the replayed sentence, a timed live call for anything else. */
	fetch: typeof fetch;
	/** The flow for the box and the suggestions: anything the person types or picks ends the replay. */
	take: <F extends Flow>(flow: F) => F;
	/** Ends the replay, for anything else the person does, such as setting a control. */
	stop: () => void;
	/** The trace of the call on display, recorded or live. */
	trace: Trace | null;
	/** True while the display is the recording's, so it is labelled with its date. */
	recorded: boolean;
	/** True while the replay presses Confirm, so it looks pressed. */
	pressing: boolean;
	/** True from the sentence's first character until the person takes over, so the replay is announced. */
	started: boolean;
};

/**
 * Opens a case on its recorded run at no cost: the sentence types into the
 * box, the hook's call is answered with the recorded response and the hood
 * shows the recorded latency and use, then, where the flow has one, Confirm
 * is pressed on screen. A box that calls only on Enter, `enter`, has Enter
 * pressed once the sentence is in. Typing or picking a suggestion ends it,
 * and the next answer is a live call that replaces the recording's display.
 * With no recording the case opens idle.
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
	const [pressing, setPressing] = useState(false);
	const [started, setStarted] = useState(false);
	// Set once the person takes over, once the recorded answer is served, and once Confirm is due.
	const stopped = useRef(recording === null);
	const served = useRef(false);
	const pressed = useRef(false);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	// The latest render's flow and Confirm, for the steps that run later.
	const latest = useRef<{
		flow: Flow | null;
		confirm: { ready: boolean; press: () => void } | undefined;
	}>({ flow: null, confirm: undefined });

	useEffect(() => {
		if (recording === null) return;
		const { request } = recording;
		later(timers, START_MS, () => setStarted(true));
		const typing = reducedMotion() ? 0 : request.length * TYPE_MS;
		if (typing === 0) {
			later(timers, START_MS, () => latest.current.flow?.setRequest(request));
		} else {
			for (let typed = 1; typed <= request.length; typed++) {
				later(timers, START_MS + typed * TYPE_MS, () =>
					latest.current.flow?.setRequest(request.slice(0, typed)),
				);
			}
		}
		// The box's own pause then calls, or Enter does, and `fetch` answers from the recording.
		if (enter) {
			later(timers, START_MS + typing + ENTER_MS, () =>
				latest.current.flow?.submit(),
			);
		}
		return () => {
			for (const timer of timers.current) clearTimeout(timer);
			timers.current = [];
		};
	}, [recording, enter]);

	// Once the recorded proposal is ready, Confirm is pressed on screen.
	useEffect(() => {
		const ready = latest.current.confirm?.ready ?? false;
		if (!ready || !served.current || stopped.current || pressed.current) {
			return;
		}
		pressed.current = true;
		later(timers, PROPOSAL_MS, () => {
			// The person may have pressed it first.
			if (!latest.current.confirm?.ready) return;
			setPressing(true);
			later(timers, PRESS_MS, () => {
				setPressing(false);
				latest.current.confirm?.press();
			});
		});
	});

	/**
	 * The person took over: the replay ends, and the label and its
	 * announcement go with it, even when an empty box makes no call to
	 * replace the rest.
	 */
	function stop() {
		setRecorded(false);
		setStarted(false);
		if (stopped.current) return;
		stopped.current = true;
		for (const timer of timers.current) clearTimeout(timer);
		timers.current = [];
		setPressing(false);
	}

	const live = timed(fetchImpl, (next) => {
		setTrace(next);
		setRecorded(false);
	});

	return {
		follow: (flow, confirm) => {
			latest.current = { flow, confirm };
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
		take: (taken) => ({
			...taken,
			setRequest: (request: string) => {
				stop();
				taken.setRequest(request);
			},
		}),
		stop,
		trace,
		recorded,
		pressing,
		started,
	};
}
