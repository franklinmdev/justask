import { useEffect, useEffectEvent, useRef, useState } from "react";
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
	const inFlight = useRef<AbortController | null>(null);
	// The request whose pause or call a hidden <Activity> cut short.
	const pending = useRef<string | null>(null);
	// The request of the pause or call now pending, for the cleanup to keep.
	const due = useRef<string | null>(null);

	// This render's `call`, with its `fetch` and endpoint, for the effect below.
	const resend = useEffectEvent((text: string) => call(text));

	useEffect(() => {
		// A hidden <Activity> shown again runs this: the call it cut short is
		// made, unless an earlier effect already started a newer one.
		if (pending.current !== null && due.current === null) {
			resend(pending.current);
		}
		pending.current = null;
		return () => {
			pending.current = due.current;
			due.current = null;
			clearTimeout(timer.current);
			inFlight.current?.abort();
			// A hidden <Activity> keeps this state, and its aborted call never lands.
			setLoading(false);
		};
	}, []);

	/** Starts a call for `text`, dropping any pending or earlier one. */
	function call(text: string) {
		clearTimeout(timer.current);
		inFlight.current?.abort();
		inFlight.current = null;
		due.current = null;
		if (isBlank(text)) {
			setAnswer(null);
			setLoading(false);
			return;
		}
		const controller = new AbortController();
		inFlight.current = controller;
		due.current = text;
		setLoading(true);
		post<R>(fetchImpl ?? fetch, endpoint, flow, text, controller.signal).then(
			(next) => {
				if (controller.signal.aborted) return;
				inFlight.current = null;
				due.current = null;
				setAnswer({ ...next, request: text });
				setLoading(false);
			},
		);
	}

	function setRequest(text: string) {
		setRequestState(text);
		if (isBlank(text)) {
			call(text);
		} else if (timing.on === "type") {
			clearTimeout(timer.current);
			due.current = text;
			setLoading(true);
			timer.current = setTimeout(() => call(text), timing.debounceMs);
		}
	}

	/** Puts `text` in the box with no call, dropping any pending one; the last answer stays. */
	function replaceRequest(text: string) {
		clearTimeout(timer.current);
		inFlight.current?.abort();
		inFlight.current = null;
		due.current = null;
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
