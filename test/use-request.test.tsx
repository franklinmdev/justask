// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { type Candidate, createSearchHandler } from "justask";
import { type SearchTiming, type UseSearch, useSearch } from "justask/react";
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
});
