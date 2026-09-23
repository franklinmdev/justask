import type { Usage } from "justask";
import { useEffect, useState } from "react";

/**
 * The last call as the page timed it: what it asked, how long it took, and
 * what it used when the provider reported it.
 */
export type Trace = Usage & { request: string; ms: number };

/**
 * A `fetch` that times each call for the state panel, reads what the call
 * used from a copy of the response, and drops the trace of a call the hook
 * dropped.
 */
export function timed(
	fetchImpl: typeof fetch,
	onTrace: (trace: Trace) => void,
): typeof fetch {
	return async (input, init) => {
		const started = performance.now();
		const response = await fetchImpl(input, init);
		const ms = Math.round(performance.now() - started);
		// Read before the hook sees the response, so the panel never shows a
		// new answer beside the last call's figures.
		const usage = await usageOf(response.clone());
		if (!init?.signal?.aborted) {
			const { request } = JSON.parse(String(init?.body)) as {
				request: string;
			};
			onTrace({ request, ms, ...usage });
		}
		return response;
	};
}

/** Each figure the handler sent, and none it left out. */
async function usageOf(response: Response): Promise<Usage> {
	const body: unknown = await response.json().catch(() => null);
	if (typeof body !== "object" || body === null) return {};
	const { costUsd, inputTokens } = body as Record<string, unknown>;
	return {
		...(typeof costUsd === "number" && { costUsd }),
		...(typeof inputTokens === "number" && { inputTokens }),
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
