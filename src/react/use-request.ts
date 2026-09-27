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
 * provider's error as the handler sends it (`provider`, `timeout`), a request
 * the handler refused (`request`, its 400), a body over its 16 KiB
 * (`too-large`, its 413) or not sent as JSON (`unsupported`, its 415), the
 * host's server pacing the browser (`rate-limited`, a 429, with its
 * `Retry-After` in ms when it sends one) or failing (`server`, a 5xx), or a
 * handler that could not be reached or answered something else (`network`).
 * `rate-limited` and `server` carry the host's own message when its body has
 * one, as `{ error: { message } }`, `{ message }` or plain text.
 */
export type RequestError =
	| HandlerError
	| HandlerBadRequest["error"]
	| { kind: "too-large"; message: string }
	| { kind: "unsupported"; message: string }
	| { kind: "rate-limited"; message: string; retryAfterMs: number | null }
	| { kind: "server"; status: number; message: string }
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
	// The request `answer` is for, read by a `setRequest` in the same event.
	const answered = useRef<string | null>(null);
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
			answered.current = null;
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
				answered.current = text;
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
			// Surrounding spaces ask nothing new (#216): the pause or call already
			// due for the same words goes on, and back at the answered words no
			// call is needed.
			const asked = due() ?? answered.current;
			if (asked !== null && sameRequest(asked, text)) return;
			if (answered.current !== null && sameRequest(answered.current, text)) {
				stopPause();
				abortCall();
				setLoading(false);
				return;
			}
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
		/** True when `answer` is for the request in the box, surrounding spaces aside. */
		current: answer !== null && sameRequest(answer.request, request),
	};
}

function isBlank(text: string): boolean {
	return text.trim() === "";
}

/** Two requests that differ only in surrounding spaces ask the same. */
function sameRequest(a: string, b: string): boolean {
	return a.trim() === b.trim();
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
	const failed = (error: RequestError): Outcome<R> => ({ result: null, error });
	const answered = `The ${flow} handler answered`;
	const somethingElse = failed({
		kind: "network",
		message: `${answered} something else`,
	});
	try {
		const response = await fetchImpl(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			signal,
		});
		const { status } = response;
		if (status === 200) {
			const answer = await readJson(response);
			// Another flow's handler, or a page, answers 200 too (#214).
			if (!isRecord(answer) || !isRecord(answer[flow])) return somethingElse;
			return {
				result: answer[flow] as R,
				error: (answer.error as HandlerError | undefined) ?? null,
			};
		}
		if (status === 400 || status === 413 || status === 415) {
			const answer = await readJson(response);
			if (!isRecord(answer) || !isRecord(answer.error)) return somethingElse;
			const { message } = answer.error as HandlerBadRequest["error"];
			const kind =
				status === 413
					? "too-large"
					: status === 415
						? "unsupported"
						: "request";
			return failed({ kind, message: String(message) });
		}
		if (status === 429) {
			return failed({
				kind: "rate-limited",
				message: (await hostMessage(response)) ?? `${answered} 429`,
				retryAfterMs: retryAfterMs(response.headers.get("retry-after")),
			});
		}
		if (status >= 500 && status < 600) {
			return failed({
				kind: "server",
				status,
				message: (await hostMessage(response)) ?? `${answered} ${status}`,
			});
		}
		return failed({ kind: "network", message: `${answered} ${status}` });
	} catch (cause) {
		return failed({
			kind: "network",
			message: cause instanceof Error ? cause.message : String(cause),
		});
	}
}

/** The body as JSON, or undefined when it is not JSON. */
async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The host server's own words for a failure: `{ error: { message } }`,
 * `{ error: "..." }` or `{ message }` in JSON, or a plain text body. Null for
 * anything else, such as an HTML error page.
 */
async function hostMessage(response: Response): Promise<string | null> {
	let text: string;
	try {
		text = (await response.text()).trim();
	} catch {
		return null;
	}
	if (text === "") return null;
	if (response.headers.get("content-type")?.startsWith("text/plain")) {
		return text;
	}
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isRecord(body)) return null;
	const message = isRecord(body.error)
		? body.error.message
		: (body.error ?? body.message);
	return typeof message === "string" && message.trim() !== ""
		? message.trim()
		: null;
}

/**
 * A `Retry-After` header in ms: whole seconds, or an HTTP date from now. Null
 * when there is none or it is neither. A cross-origin host exposes the header
 * with `Access-Control-Expose-Headers`, or the browser hides it.
 */
function retryAfterMs(header: string | null): number | null {
	if (header === null) return null;
	const value = header.trim();
	if (/^\d+$/.test(value)) return Number(value) * 1_000;
	const at = Date.parse(value);
	return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}
