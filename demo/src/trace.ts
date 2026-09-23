import type { Usage } from "justask";
import { useEffect, useState } from "react";

/**
 * The last call as the page timed it: what it asked, how long it took, and
 * what it used when the provider reported it.
 */
export type Trace = Usage & { request: string; ms: number };

/**
 * A `fetch` that times each call for the hood, reads what the call used from
 * a copy of the response, and drops the trace of a call the hook dropped. A
 * call that never reached the handler is timed too, with nothing used, so
 * the hood never shows the call before it.
 */
export function timed(
	fetchImpl: typeof fetch,
	onTrace: (trace: Trace) => void,
): typeof fetch {
	return async (input, init) => {
		const started = performance.now();
		const trace = (usage: Usage) => {
			if (init?.signal?.aborted) return;
			const { request } = JSON.parse(String(init?.body)) as {
				request: string;
			};
			onTrace({
				request,
				ms: Math.round(performance.now() - started),
				...usage,
			});
		};
		let response: Response;
		try {
			response = await fetchImpl(input, init);
		} catch (error) {
			trace({});
			throw error;
		}
		// Read before the hook sees the response, so the hood never shows a
		// new answer beside the last call's figures.
		trace(await usageOf(response.clone()));
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
