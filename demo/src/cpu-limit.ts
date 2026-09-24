/**
 * The demo's `fetch`, sending a request once more when Cloudflare stopped the
 * Worker on its CPU limit, and never a third time. The demo runs on Workers'
 * free plan, where the card now and then runs over 10 ms on an isolate still
 * warming up; the owner chose that plan with the rare stop accepted
 * (docs/workers.md, Verdict). A second stop shows the page's usual error.
 */
export function retryOnCpuLimit(fetchImpl: typeof fetch): typeof fetch {
	return async (input, init) => {
		const response = await fetchImpl(input, init);
		return (await stoppedOnCpuLimit(response))
			? fetchImpl(input, init)
			: response;
	};
}

/**
 * Error 1102 is Cloudflare's own answer, never the handler's JSON. Its
 * status and page are not documented, so the code in its text decides
 * (docs/workers.md, The CPU limit's retry).
 */
async function stoppedOnCpuLimit(response: Response): Promise<boolean> {
	if (response.status < 500) return false;
	if (response.headers.get("content-type")?.includes("application/json")) {
		return false;
	}
	return /\b1102\b/.test(await response.clone().text());
}
