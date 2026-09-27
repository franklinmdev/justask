// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { type Candidate, createSearchHandler } from "justask";
import { type SearchTiming, type UseSearch, useSearch } from "justask/react";
import { Activity, type ReactNode, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
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
function renderInActivity(fetchImpl: typeof fetch, timing = typing) {
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
		{ wrapper: Tabs },
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
});
