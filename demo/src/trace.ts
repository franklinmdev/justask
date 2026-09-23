import { useEffect, useState } from "react";

/** The last call as the page timed it: what it asked and how long it took. */
export type Trace = { request: string; ms: number };

/**
 * A `fetch` that times each call for the state panel, and drops the time of
 * one the hook dropped.
 */
export function timed(
	fetchImpl: typeof fetch,
	onTrace: (trace: Trace) => void,
): typeof fetch {
	return async (input, init) => {
		const started = performance.now();
		const response = await fetchImpl(input, init);
		if (!init?.signal?.aborted) {
			const { request } = JSON.parse(String(init?.body)) as {
				request: string;
			};
			onTrace({ request, ms: Math.round(performance.now() - started) });
		}
		return response;
	};
}

/** A suggested request goes into the box and calls at once, once the box holds it. */
export function useSuggest(flow: {
	request: string;
	setRequest: (request: string) => void;
	submit: () => void;
}): (request: string) => void {
	const [suggested, setSuggested] = useState<string | null>(null);

	useEffect(() => {
		if (suggested !== null && flow.request === suggested) {
			setSuggested(null);
			flow.submit();
		}
	});

	return (request) => {
		flow.setRequest(request);
		setSuggested(request);
	};
}
