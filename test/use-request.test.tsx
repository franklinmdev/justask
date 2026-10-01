// @vitest-environment jsdom

import {
	type Candidate,
	createFilterHandler,
	createSearchHandler,
} from "@justask/core";
import {
	type SearchTiming,
	type UseSearch,
	useCard,
	useSearch,
} from "@justask/core/react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Activity, type ReactNode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeProvider } from "./fake-provider.ts";

/*
 * The timing every hook shares, driven through `useSearch`, the thinnest of
 * them: which request a call is for, when it goes, where, and what the hook
 * says while it waits. Each call waits at a gate the test opens, so a stale
 * answer can land exactly when a newer request is pending.
 */

type Vendor = { id: number; name: string };

const acme: Candidate<Vendor> = {
	id: "acme",
	description: "Acme Supplies, office paper and toner",
	value: { id: 1, name: "Acme Supplies" },
};

const handler = createSearchHandler<Vendor>({
	provider: fakeProvider({
		search: { acme: 0.93, none: 0.07, several: 0 },
	}),
	timeoutMs: 1_000,
	search: {
		description: "the vendor the request means",
		gate: 0.5,
		shortlist: () => [acme],
	},
});

// Real, as the provider timeout is; see the hook tests.
const DEBOUNCE_MS = 200;
const typing: SearchTiming = { on: "type", debounceMs: DEBOUNCE_MS };
const enter: SearchTiming = { on: "enter" };

type Call = { url: string; request: string; open: () => void };

/** A `fetch` to the handler whose every call waits until the test opens it. */
function gatedFetch() {
	const calls: Call[] = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		const url = String(input);
		const { request } = JSON.parse(String(init?.body)) as { request: string };
		const signal = init?.signal ?? undefined;
		await new Promise<void>((resolve, reject) => {
			calls.push({ url, request, open: resolve });
			signal?.addEventListener("abort", () => reject(signal.reason));
		});
		return handler(new Request(new URL(url, location.href), init));
	};
	return { calls, fetchImpl };
}

function renderSearch(props: {
	endpoint?: string;
	timing?: SearchTiming;
	fetch: typeof fetch;
}) {
	return renderHook(
		(current: typeof props): UseSearch<Vendor> =>
			useSearch<Vendor>({
				endpoint: current.endpoint ?? "/api/search",
				timing: current.timing ?? typing,
				onChoose: () => {},
				fetch: current.fetch,
			}),
		{ initialProps: props },
	);
}

/** The hook inside an <Activity> the test hides and shows, as a host's tabs would. */
function renderInActivity(
	fetchImpl: typeof fetch,
	{ timing = typing, strict = false } = {},
) {
	const host = { setMode: (_mode: "visible" | "hidden") => {} };
	function Tabs({ children }: { children: ReactNode }) {
		const [mode, setMode] = useState<"visible" | "hidden">("visible");
		host.setMode = setMode;
		return <Activity mode={mode}>{children}</Activity>;
	}
	const rendered = renderHook(
		() =>
			useSearch<Vendor>({
				endpoint: "/api/search",
				timing,
				onChoose: () => {},
				fetch: fetchImpl,
			}),
		{ wrapper: Tabs, reactStrictMode: strict },
	);
	return {
		...rendered,
		hide: () => act(() => host.setMode("hidden")),
		show: () => act(() => host.setMode("visible")),
	};
}

/**
 * Types "acme", lets its call go out, types "acme toner", and lands the
 * "acme" answer while the pause for "acme toner" is still running.
 */
async function staleAnswerDuringPause(
	result: { current: UseSearch<Vendor> },
	calls: Call[],
) {
	act(() => result.current.setRequest("acme"));
	await waitFor(() => expect(calls).toHaveLength(1));
	act(() => result.current.setRequest("acme toner"));
	calls[0]?.open();
	await waitFor(() => expect(result.current.result).not.toBeNull());
}

function pause(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(cleanup);

describe("the hooks' request timing", () => {
	it("sends a paused call to the endpoint and fetch of the latest render (#217)", async () => {
		const first = gatedFetch();
		const second = gatedFetch();
		const { result, rerender } = renderSearch({
			endpoint: "/old",
			fetch: first.fetchImpl,
		});

		act(() => result.current.setRequest("acme"));
		rerender({ endpoint: "/new", fetch: second.fetchImpl });
		await waitFor(() => expect(second.calls).toHaveLength(1));

		expect(first.calls).toEqual([]);
		expect(second.calls[0]?.url).toBe("/new");
	});

	it("makes no call when the timing turns to Enter during the pause (#217)", async () => {
		const { calls, fetchImpl } = gatedFetch();
		const { result, rerender } = renderSearch({ fetch: fetchImpl });

		act(() => result.current.setRequest("acme"));
		rerender({ fetch: fetchImpl, timing: enter });
		await act(() => pause(DEBOUNCE_MS * 2));

		expect(calls).toEqual([]);
		expect(result.current.loading).toBe(false);
	});

	it("stays loading when a stale answer lands during the next request's pause (#210)", async () => {
		const { calls, fetchImpl } = gatedFetch();
		const { result } = renderSearch({ fetch: fetchImpl });

		await staleAnswerDuringPause(result, calls);

		expect(result.current.loading).toBe(true);
		expect(result.current.answered).toBe(false);
		await waitFor(() => expect(calls).toHaveLength(2));
		expect(calls[1]?.request).toBe("acme toner");
	});

	it("makes the newer request's call when a tab hidden in that pause shows again (#211)", async () => {
		const { calls, fetchImpl } = gatedFetch();
		const { result, hide, show } = renderInActivity(fetchImpl);

		await staleAnswerDuringPause(result, calls);
		hide();
		await act(() => pause(DEBOUNCE_MS * 2));
		expect(calls).toHaveLength(1);
		show();

		await waitFor(() => expect(calls).toHaveLength(2));
		expect(calls[1]?.request).toBe("acme toner");
		expect(result.current.loading).toBe(true);
	});

	it("makes the call a hidden tab cut short once again under StrictMode (#215)", async () => {
		const { calls, fetchImpl } = gatedFetch();
		const { result, hide, show } = renderInActivity(fetchImpl, {
			timing: enter,
			strict: true,
		});

		act(() => result.current.setRequest("acme"));
		act(() => result.current.submit());
		await waitFor(() => expect(calls).toHaveLength(1));
		hide();
		show();
		await waitFor(() => expect(calls).toHaveLength(2));
		await act(() => pause(DEBOUNCE_MS));

		expect(calls.map((call) => call.request)).toEqual(["acme", "acme"]);
		calls[1]?.open();
		await waitFor(() => expect(result.current.answered).toBe(true));
	});

	it("keeps the item and makes no call when only surrounding spaces change (#216)", async () => {
		const { calls, fetchImpl } = gatedFetch();
		const { result } = renderSearch({ fetch: fetchImpl });
		act(() => result.current.setRequest("acme"));
		await waitFor(() => expect(calls).toHaveLength(1));
		calls[0]?.open();
		await waitFor(() =>
			expect(result.current.item?.name).toBe("Acme Supplies"),
		);

		act(() => result.current.setRequest("acme "));
		expect(result.current.item?.name).toBe("Acme Supplies");
		expect(result.current.loading).toBe(false);
		await act(() => pause(DEBOUNCE_MS * 2));
		expect(calls).toHaveLength(1);

		// Back to the answered text mid pause: the pause is dropped.
		act(() => result.current.setRequest("acme t"));
		act(() => result.current.setRequest(" acme"));
		await act(() => pause(DEBOUNCE_MS * 2));
		expect(calls).toHaveLength(1);
		expect(result.current.item?.name).toBe("Acme Supplies");
		expect(result.current.loading).toBe(false);
	});

	it("makes no second call when the box returns to the words already on their way (#216)", async () => {
		const { calls, fetchImpl } = gatedFetch();
		const { result } = renderSearch({ fetch: fetchImpl });
		act(() => result.current.setRequest("acme"));
		await waitFor(() => expect(calls).toHaveLength(1));

		act(() => result.current.setRequest("acme t"));
		act(() => result.current.setRequest("acme"));
		await act(() => pause(DEBOUNCE_MS * 2));
		expect(calls).toHaveLength(1);
		expect(result.current.loading).toBe(true);

		calls[0]?.open();
		await waitFor(() =>
			expect(result.current.item?.name).toBe("Acme Supplies"),
		);
	});

	it("retries a failed answer when the same words are typed again (#216)", async () => {
		let failing = true;
		const { result } = renderSearch({
			fetch: async (input, init) =>
				failing
					? new Response(null, { status: 503 })
					: handler(new Request(new URL(String(input), location.href), init)),
		});
		act(() => result.current.setRequest("acme"));
		await waitFor(() => expect(result.current.error?.kind).toBe("server"));

		failing = false;
		act(() => result.current.setRequest("acme "));
		await waitFor(() =>
			expect(result.current.item?.name).toBe("Acme Supplies"),
		);
	});
});

/** A `fetch` that hands each request to `serve`, as the host's server. */
function serving(
	serve: (request: Request) => Response | Promise<Response>,
): typeof fetch {
	return async (input, init) =>
		serve(new Request(new URL(String(input), location.href), init));
}

/** Sends `request` through a search hook on Enter, and waits for its answer. */
async function answerOf(fetchImpl: typeof fetch, request = "acme") {
	const { result } = renderSearch({ fetch: fetchImpl, timing: enter });
	act(() => result.current.setRequest(request));
	act(() => result.current.submit());
	await waitFor(() => expect(result.current.answered).toBe(true));
	return result.current;
}

describe("the hooks' reading of an answer", () => {
	it("says a 200 from another flow's handler is something else, not an empty answer (#214)", async () => {
		const filterHandler = createFilterHandler({
			provider: fakeProvider({}),
			timeoutMs: 1_000,
			filter: { description: "an invoice", fields: {} },
		});
		const search = await answerOf(serving(filterHandler));

		expect(search.error).toEqual({
			kind: "network",
			message: "The search handler answered something else",
		});
		expect(search.result).toBeNull();
		expect(search.item).toBeNull();
	});

	it("keeps the person's card when the handler answers something else (#214)", async () => {
		const { result } = renderHook(() =>
			useCard<{
				vendor: {
					kind: "catalog";
					description: string;
					gate: number;
					shortlist: () => [];
				};
			}>({
				endpoint: "/api/card",
				onConfirm: () => {},
				fetch: serving(handler),
			}),
		);
		act(() => result.current.set("vendor", "Larkspur"));
		act(() => result.current.setRequest("lunch at Larkspur"));
		act(() => result.current.submit());
		await waitFor(() => expect(result.current.answered).toBe(true));

		expect(result.current.error?.kind).toBe("network");
		expect(result.current.value).toEqual({ vendor: "Larkspur" });
		expect(result.current.filledBy("vendor")).toBe("person");
	});

	it("says a page that is not JSON is something else, not a parse error (#179)", async () => {
		const search = await answerOf(
			serving(
				() =>
					new Response("<!doctype html><title>Sign in</title>", {
						headers: { "content-type": "text/html" },
					}),
			),
		);

		expect(search.error).toEqual({
			kind: "network",
			message: "The search handler answered something else",
		});
	});

	it("tells a request too large for the handler, with its message (#233)", async () => {
		const search = await answerOf(serving(handler), "acme ".repeat(4_000));

		expect(search.error).toEqual({
			kind: "too-large",
			message: "The body is over 16384 bytes",
		});
	});

	it("tells a body the handler refused as not JSON, with its message (#233)", async () => {
		// A proxy that rewrites the content type, the one way the hook's own
		// JSON post reaches the handler as something else.
		const search = await answerOf(
			serving(async (request) =>
				handler(
					new Request(request.url, {
						method: "POST",
						headers: { "content-type": "text/plain" },
						body: await request.text(),
					}),
				),
			),
		);

		expect(search.error).toEqual({
			kind: "unsupported",
			message: "The body must be sent as application/json",
		});
	});

	it("tells a rate limit, with the host's message and when to retry (#179)", async () => {
		const search = await answerOf(
			serving(
				() =>
					new Response("Too many requests", {
						status: 429,
						headers: { "content-type": "text/plain", "retry-after": "30" },
					}),
			),
		);

		expect(search.error).toEqual({
			kind: "rate-limited",
			message: "Too many requests",
			retryAfterMs: 30_000,
		});
	});

	it("reads a Retry-After given as a date, and a 429 with neither (#179)", async () => {
		vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
		try {
			const dated = await answerOf(
				serving(
					() =>
						new Response(null, {
							status: 429,
							headers: { "retry-after": "Sat, 26 Sep 2026 12:01:00 GMT" },
						}),
				),
			);
			expect(dated.error).toEqual({
				kind: "rate-limited",
				message: "The search handler answered 429",
				retryAfterMs: 60_000,
			});
		} finally {
			vi.useRealTimers();
		}
		cleanup();

		const bare = await answerOf(
			serving(() => new Response(null, { status: 429 })),
		);
		expect(bare.error).toEqual({
			kind: "rate-limited",
			message: "The search handler answered 429",
			retryAfterMs: null,
		});
	});

	it("tells a server error with its status and the host's message (#179)", async () => {
		const json = await answerOf(
			serving(() =>
				Response.json(
					{ error: { message: "The vendors database is down" } },
					{ status: 500 },
				),
			),
		);
		expect(json.error).toEqual({
			kind: "server",
			status: 500,
			message: "The vendors database is down",
		});
		cleanup();

		const page = await answerOf(
			serving(
				() =>
					new Response("<html>Bad gateway</html>", {
						status: 502,
						headers: { "content-type": "text/html" },
					}),
			),
		);
		expect(page.error).toEqual({
			kind: "server",
			status: 502,
			message: "The search handler answered 502",
		});
	});
});
