import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
	HandlerBadRequest,
	HandlerError,
	HandlerRequest,
} from "../handler.ts";

/**
 * When a hook calls its handler: after a pause in typing, or only when the
 * person presses Enter. The pause has no default; the demo measures it.
 */
export type RequestTiming =
	| { on: "type"; debounceMs: number }
	| { on: "enter" };

/**
 * Why the last answer has nothing beyond the flow's own result: the
 * provider's error as the handler sends it, a request the handler refused, or
 * a handler that could not be reached or answered something else.
 */
export type RequestError =
	| HandlerError
	| HandlerBadRequest["error"]
	| { kind: "network"; message: string };

/** The key of the handler's 200 body that holds the result. */
type Flow = "search" | "filter" | "card";

type Outcome<R> = { result: R | null; error: RequestError | null };

/** An outcome with the request it answers, so an edit in the box retires it. */
export type Answered<R> = Outcome<R> & { request: string };

/**
 * What every flow's hook shares: the box's text, the pause, one call
 * at a time, and only the answer to the latest request kept. `flow` names the
 * key of the handler's 200 body that holds the result.
 */
export function useRequest<R>({
	endpoint,
	timing,
	fetch: fetchImpl,
	flow,
}: {
	endpoint: string;
	timing: RequestTiming;
	fetch: typeof fetch | undefined;
	flow: Flow;
}) {
	const [request, setRequestState] = useState("");
	const [answer, setAnswer] = useState<Answered<R> | null>(null);
	const [loading, setLoading] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	// The request the running pause will call for, or null.
	const paused = useRef<string | null>(null);
	const inFlight = useRef<{
		controller: AbortController;
		text: string;
	} | null>(null);
	// The request whose pause or call a hidden <Activity> cut short.
	const pending = useRef<string | null>(null);
	// The latest render's options, for a call a pause or an effect makes later.
	// A ref rather than `useEffectEvent`, which React 19.0 and 19.1 lack (#175).
	const latest = useRef({ endpoint, timing, fetchImpl, flow });
	useLayoutEffect(() => {
		latest.current = { endpoint, timing, fetchImpl, flow };
	});

	/**
	 * The newest request still waiting for its answer: the running pause's,
	 * else the call's on its way. A stale answer landing leaves a pause due.
	 */
	function due(): string | null {
		return paused.current ?? inFlight.current?.text ?? null;
	}

	function stopPause() {
		clearTimeout(timer.current);
		paused.current = null;
	}

	function abortCall() {
		inFlight.current?.controller.abort();
		inFlight.current = null;
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs on mount and when a hidden <Activity> shows again, never per render; `call` reads the latest options from `latest`.
	useEffect(() => {
		// A hidden <Activity> shown again runs this: the call it cut short is
		// made, unless an earlier effect already started a newer one. It waits a
		// pause of 0, so StrictMode's cleanup and second run, straight after
		// this one, cancel it and make it once (#215).
		const cut = pending.current;
		pending.current = null;
		if (cut !== null && due() === null) {
			pause(cut, 0, () => call(cut));
		}
		return () => {
			pending.current = due();
			stopPause();
			abortCall();
			// A hidden <Activity> keeps this state, and its aborted call never lands.
			setLoading(false);
		};
	}, []);

	/** Starts a call for `text`, dropping any pending or earlier one. */
	function call(text: string) {
		stopPause();
		abortCall();
		if (isBlank(text)) {
			setAnswer(null);
			setLoading(false);
			return;
		}
		const controller = new AbortController();
		inFlight.current = { controller, text };
		setLoading(true);
		const { endpoint, fetchImpl, flow } = latest.current;
		post<R>(fetchImpl ?? fetch, endpoint, flow, text, controller.signal).then(
			(next) => {
				if (controller.signal.aborted) return;
				inFlight.current = null;
				setAnswer({ ...next, request: text });
				setLoading(due() !== null);
			},
		);
	}

	function setRequest(text: string) {
		setRequestState(text);
		if (isBlank(text)) {
			call(text);
		} else if (timing.on === "type") {
			pause(text, timing.debounceMs, () => {
				// A host that turned to Enter during the pause wants no call now.
				if (latest.current.timing.on === "type") call(text);
				else setLoading(due() !== null);
			});
		}
	}

	/** Waits `ms` for `text`, replacing any running pause, then runs `end`. */
	function pause(text: string, ms: number, end: () => void) {
		clearTimeout(timer.current);
		paused.current = text;
		setLoading(true);
		timer.current = setTimeout(() => {
			paused.current = null;
			end();
		}, ms);
	}

	/** Puts `text` in the box with no call, dropping any pending one; the last answer stays. */
	function replaceRequest(text: string) {
		stopPause();
		abortCall();
		setRequestState(text);
		setLoading(false);
	}

	return {
		request,
		setRequest,
		replaceRequest,
		submit: () => call(request),
		loading,
		answer,
		/** True when `answer` is for the request in the box. */
		current: answer !== null && answer.request === request,
	};
}

function isBlank(text: string): boolean {
	return text.trim() === "";
}

async function post<R>(
	fetchImpl: typeof fetch,
	endpoint: string,
	flow: Flow,
	request: string,
	signal: AbortSignal,
): Promise<Outcome<R>> {
	const body: HandlerRequest = {
		request,
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	};
	try {
		const response = await fetchImpl(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			signal,
		});
		if (response.status === 200) {
			const answer = (await response.json()) as Record<string, unknown> & {
				error?: HandlerError;
			};
			return { result: answer[flow] as R, error: answer.error ?? null };
		}
		if (response.status === 400) {
			const { error } = (await response.json()) as HandlerBadRequest;
			return { result: null, error };
		}
		return {
			result: null,
			error: {
				kind: "network",
				message: `The ${flow} handler answered ${response.status}`,
			},
		};
	} catch (cause) {
		return {
			result: null,
			error: {
				kind: "network",
				message: cause instanceof Error ? cause.message : String(cause),
			},
		};
	}
}
