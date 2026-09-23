import type { SearchResult } from "../ask.ts";
import {
	type RequestError,
	type RequestTiming,
	useRequest,
} from "./use-request.ts";

/**
 * When the hook calls the handler: after a pause in typing, or only when the
 * person presses Enter. The pause has no default; the demo measures it.
 */
export type SearchTiming = RequestTiming;

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
export type SearchError = RequestError;

export type UseSearch<T> = {
	/** What the person has typed. */
	request: string;
	setRequest: (request: string) => void;
	/** Calls the handler now, skipping the pause. */
	submit: () => void;
	/** True while a call is waiting out the pause or on its way. */
	loading: boolean;
	/**
	 * The last answer, with candidates, pick, probabilities and gate, for an
	 * inspector. It may be for an earlier request; null before one, or when the
	 * box is empty.
	 */
	result: SearchResult<T> | null;
	/** The item to show for the request in the box, or null when held, failed or not answered yet. */
	item: T | null;
	/** Why the last answer failed, beside `result`. */
	error: SearchError | null;
	/** True when the last answer, or error, is for the request in the box, so an empty state can show. */
	answered: boolean;
	/** Hands the shown item to `onChoose`. */
	choose: () => void;
};

/**
 * Drives a search from the host app's own markup: posts what the person types
 * to the search handler, keeps only the answer to the latest request, and
 * hands the item to the app when the person chooses it.
 */
export function useSearch<T>({
	endpoint,
	timing,
	onChoose,
	fetch,
}: UseSearchOptions<T>): UseSearch<T> {
	const { request, setRequest, submit, loading, answer, current } = useRequest<
		SearchResult<T>
	>({ endpoint, timing, fetch, flow: "search" });

	const item = current ? (answer?.result?.item ?? null) : null;
	return {
		request,
		setRequest,
		submit,
		loading,
		result: answer?.result ?? null,
		item,
		error: answer?.error ?? null,
		answered: current,
		choose: () => {
			if (item !== null) onChoose(item);
		},
	};
}
