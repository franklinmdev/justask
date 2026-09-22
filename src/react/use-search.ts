import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "../ask.ts";
import type {
	HandlerBadRequest,
	HandlerError,
	HandlerRequest,
	SearchHandlerResponse,
} from "../handler.ts";

/**
 * When the hook calls the handler: after a pause in typing, or only when the
 * person presses Enter. The pause has no default; the demo measures it.
 */
export type SearchTiming = { on: "type"; debounceMs: number } | { on: "enter" };

export type UseSearchOptions<T> = {
	/** Where the search handler is mounted, such as `/api/search`. */
	endpoint: string;
	timing: SearchTiming;
	/** Receives the item the person chose; nothing reaches the app before that. */
	onChoose: (item: T) => void;
	/** Replaces the global `fetch`, to add headers or to serve a handler in process. */
	fetch?: typeof fetch;
};

/**
 * Why the last answer has no item beyond the search itself: the provider's
 * error as the handler sends it, a request the handler refused, or a handler
 * that could not be reached or answered something else.
 */
export type SearchError =
	| HandlerError
	| HandlerBadRequest["error"]
	| { kind: "network"; message: string };

export type UseSearch<T> = {
	/** What the person has typed. */
	request: string;
	setRequest: (request: string) => void;
	/** Calls the handler now, skipping the pause. */
	submit: () => void;
	/** True from the moment the shown answer stops matching the typed request until the new one arrives. */
	loading: boolean;
	/** The last answer, with candidates, pick, probabilities and gate; null before one, or when the box is empty. */
	result: SearchResult<T> | null;
	/** The item to show, or null when held, failed or not asked yet. */
	item: T | null;
	error: SearchError | null;
	/** True once the current request has an answer or an error, so an empty state can show. */
	answered: boolean;
	/** Hands the shown item to `onChoose`. */
	choose: () => void;
};

type Answer<T> = { result: SearchResult<T> | null; error: SearchError | null };

/**
 * Drives a search from the host app's own markup: posts what the person types
 * to the search handler, keeps only the answer to the latest request, and
 * hands the item to the app when the person chooses it.
 */
export function useSearch<T>({
	endpoint,
	timing,
	onChoose,
	fetch: fetchImpl,
}: UseSearchOptions<T>): UseSearch<T> {
	const [request, setRequestState] = useState("");
	const [answer, setAnswer] = useState<Answer<T> | null>(null);
	const [loading, setLoading] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const inFlight = useRef<AbortController | null>(null);

	useEffect(
		() => () => {
			clearTimeout(timer.current);
			inFlight.current?.abort();
		},
		[],
	);

	/** Starts a call for `text`, dropping any pending or earlier one. */
	function call(text: string) {
		clearTimeout(timer.current);
		inFlight.current?.abort();
		inFlight.current = null;
		if (isBlank(text)) {
			setAnswer(null);
			setLoading(false);
			return;
		}
		const controller = new AbortController();
		inFlight.current = controller;
		setLoading(true);
		post<T>(fetchImpl ?? fetch, endpoint, text, controller.signal).then(
			(next) => {
				if (controller.signal.aborted) return;
				inFlight.current = null;
				setAnswer(next);
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
			setLoading(true);
			timer.current = setTimeout(() => call(text), timing.debounceMs);
		}
	}

	const item = answer?.result?.item ?? null;
	return {
		request,
		setRequest,
		submit: () => call(request),
		loading,
		result: answer?.result ?? null,
		item,
		error: answer?.error ?? null,
		answered: answer !== null,
		choose: () => {
			if (item !== null) onChoose(item);
		},
	};
}

function isBlank(text: string): boolean {
	return text.trim() === "";
}

async function post<T>(
	fetchImpl: typeof fetch,
	endpoint: string,
	request: string,
	signal: AbortSignal,
): Promise<Answer<T>> {
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
			const { search, error } =
				(await response.json()) as SearchHandlerResponse<T>;
			return { result: search, error: error ?? null };
		}
		if (response.status === 400) {
			const { error } = (await response.json()) as HandlerBadRequest;
			return { result: null, error };
		}
		return {
			result: null,
			error: {
				kind: "network",
				message: `The search handler answered ${response.status}`,
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
