// @vitest-environment jsdom

import {
	type Candidate,
	createSearchHandler,
	type Provider,
} from "@justask/core";
import {
	SearchBox,
	SearchEmpty,
	SearchItem,
	type SearchTiming,
	type UseSearch,
	useSearch,
} from "@justask/core/react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { Activity, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "./checks.ts";
import {
	failingProvider,
	fakeProvider,
	heldLaterProvider,
	slowFirstProvider,
} from "./fake-provider.ts";

type Vendor = { id: number; name: string };

const acme: Candidate<Vendor> = {
	id: "acme",
	description: "Acme Supplies, office paper and toner",
	value: { id: 1, name: "Acme Supplies" },
};
const northwind: Candidate<Vendor> = {
	id: "northwind",
	description: "Northwind Traders, catering",
	value: { id: 2, name: "Northwind Traders" },
};

const picksAcme = {
	search: { acme: 0.93, northwind: 0.05, none: 0.02, several: 0 },
};
const picksNone = {
	search: { acme: 0.1, northwind: 0.05, none: 0.85, several: 0 },
};

// Real, as the provider timeout is, and well past the gap between two keys
// under other sessions' load: at 30 ms a loaded run called on the first key
// of a sentence (#120).
const DEBOUNCE_MS = 200;
const typing: SearchTiming = { on: "type", debounceMs: DEBOUNCE_MS };

/**
 * The page a host app would write, served by the real handler in process: the
 * hook's `fetch` hands each request to the handler, whose provider is the fake.
 */
function renderSearch({
	provider,
	timing = typing,
}: {
	provider: Provider;
	timing?: SearchTiming;
}) {
	const handler = createSearchHandler<Vendor>({
		provider,
		timeoutMs: 1_000,
		search: {
			description: "the vendor the request means",
			gate: 0.5,
			shortlist: () => [acme, northwind],
		},
	});
	const onChoose = vi.fn<(vendor: Vendor) => void>();
	const seen: {
		search: UseSearch<Vendor> | null;
		setMode: (mode: "visible" | "hidden") => void;
	} = { search: null, setMode: () => {} };

	function Page() {
		const search = useSearch<Vendor>({
			endpoint: "/api/search",
			timing,
			onChoose,
			fetch: (input, init) =>
				handler(new Request(new URL(String(input), location.href), init)),
		});
		seen.search = search;
		return (
			<main>
				<SearchBox search={search} label="Find a vendor" />
				<SearchItem search={search}>{(vendor) => vendor.name}</SearchItem>
				<SearchEmpty search={search}>No vendor matches</SearchEmpty>
			</main>
		);
	}

	/** Lets a test hide and show the page the way a host app's tabs would. */
	function Host() {
		const [mode, setMode] = useState<"visible" | "hidden">("visible");
		seen.setMode = setMode;
		return (
			<Activity mode={mode}>
				<Page />
			</Activity>
		);
	}

	const { container } = render(<Host />);
	return { container, onChoose, seen, user: userEvent.setup() };
}

/** What the live regions hold, which is what a screen reader announces. */
function announced() {
	return screen.getAllByRole("status").map((region) => region.textContent);
}

function pause(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(cleanup);

describe("useSearch and its pieces", () => {
	it("shows the item the person meant while they type, with one call after the pause", async () => {
		const provider = fakeProvider(picksAcme);
		const { container, onChoose, user } = renderSearch({ provider });

		await user.type(
			screen.getByRole("searchbox", { name: "Find a vendor" }),
			"invoices from acme",
		);

		expect(
			await screen.findByRole("button", { name: "Acme Supplies" }),
		).toBeDefined();
		expect(announced()).toContain("Acme Supplies");
		expect(provider.calls.map(({ request }) => request)).toEqual([
			"invoices from acme",
		]);
		expect(onChoose).not.toHaveBeenCalled();
		await expectNoAxeViolations(container);
	});

	it("hands the item to the app only when the person chooses it", async () => {
		const { onChoose, user } = renderSearch({
			provider: fakeProvider(picksAcme),
		});

		await user.type(screen.getByRole("searchbox"), "acme");
		await user.click(
			await screen.findByRole("button", { name: "Acme Supplies" }),
		);

		expect(onChoose).toHaveBeenCalledExactlyOnceWith(acme.value);
	});

	it("reaches the item from the box with Tab and chooses it with Enter", async () => {
		const { onChoose, user } = renderSearch({
			provider: fakeProvider(picksAcme),
		});

		await user.type(screen.getByRole("searchbox"), "acme");
		const item = await screen.findByRole("button", { name: "Acme Supplies" });
		await user.tab();
		expect(document.activeElement).toBe(item);
		await user.keyboard("{Enter}");

		expect(onChoose).toHaveBeenCalledExactlyOnceWith(acme.value);
	});

	it("shows the empty state, and no item, when no candidate fits", async () => {
		const { container, onChoose, user } = renderSearch({
			provider: fakeProvider(picksNone),
		});

		await user.type(screen.getByRole("searchbox"), "invoices from Globex");

		expect(await screen.findByText("No vendor matches")).toBeDefined();
		expect(announced()).toContain("No vendor matches");
		expect(screen.queryByRole("button")).toBeNull();
		expect(onChoose).not.toHaveBeenCalled();
		await expectNoAxeViolations(container);
	});

	it("shows the empty state when the provider fails, and exposes the error", async () => {
		const { container, seen, user } = renderSearch({
			provider: failingProvider(new Error("503")),
		});

		await user.type(screen.getByRole("searchbox"), "acme");

		expect(await screen.findByText("No vendor matches")).toBeDefined();
		expect(screen.queryByRole("button")).toBeNull();
		expect(seen.search?.error).toEqual({
			kind: "provider",
			message: "The provider failed",
		});
		await expectNoAxeViolations(container);
	});

	it("exposes the candidates, pick, probabilities and gate for an inspector", async () => {
		const { seen, user } = renderSearch({ provider: fakeProvider(picksAcme) });

		await user.type(screen.getByRole("searchbox"), "acme");
		await screen.findByRole("button", { name: "Acme Supplies" });

		expect(seen.search?.result).toEqual({
			item: acme.value,
			candidates: [acme, northwind],
			pick: { label: "acme", probability: 0.93 },
			probabilities: { acme: 0.93, northwind: 0.05, none: 0.02, several: 0 },
			gate: 0.5,
		});
		expect(seen.search?.error).toBeNull();
	});

	it("calls on Enter, not while typing, when the timing says so", async () => {
		const provider = fakeProvider(picksAcme);
		const { user } = renderSearch({ provider, timing: { on: "enter" } });

		await user.type(screen.getByRole("searchbox"), "acme");
		await pause(60);
		expect(provider.calls).toHaveLength(0);

		await user.keyboard("{Enter}");

		expect(
			await screen.findByRole("button", { name: "Acme Supplies" }),
		).toBeDefined();
		expect(provider.calls).toHaveLength(1);
	});

	it("clears the answer, without a call, when the box is emptied", async () => {
		const provider = fakeProvider(picksAcme);
		const { user } = renderSearch({ provider });
		const box = screen.getByRole("searchbox");

		await user.type(box, "acme");
		await screen.findByRole("button", { name: "Acme Supplies" });
		await user.clear(box);
		await pause(DEBOUNCE_MS * 2);

		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.queryByText("No vendor matches")).toBeNull();
		expect(provider.calls).toHaveLength(1);
	});

	it("shows the answer to the latest request, never a slower earlier one", async () => {
		// The first answer lands after the second request's debounce and answer.
		const provider = slowFirstProvider(picksNone, picksAcme, DEBOUNCE_MS * 2);
		const { user } = renderSearch({ provider });
		const box = screen.getByRole("searchbox");

		await user.type(box, "globex");
		await waitFor(() => expect(provider.calls).toHaveLength(1));
		await user.clear(box);
		await user.type(box, "acme");

		await screen.findByRole("button", { name: "Acme Supplies" });
		await pause(DEBOUNCE_MS * 2);
		expect(screen.getByRole("button", { name: "Acme Supplies" })).toBeDefined();
		expect(screen.queryByText("No vendor matches")).toBeNull();
	});

	it("never offers the item for an earlier request once the person types on", async () => {
		const provider = heldLaterProvider(picksAcme, picksAcme);
		const { onChoose, user } = renderSearch({ provider });
		const box = screen.getByRole("searchbox");

		await user.type(box, "acme");
		await screen.findByRole("button", { name: "Acme Supplies" });
		await user.type(box, " invoices");

		expect(screen.queryByRole("button")).toBeNull();
		expect(onChoose).not.toHaveBeenCalled();
		provider.release();
		expect(
			await screen.findByRole("button", { name: "Acme Supplies" }),
		).toBeDefined();
	});

	it("under Enter timing, drops the answer as soon as the request changes", async () => {
		const { user } = renderSearch({
			provider: fakeProvider(picksNone),
			timing: { on: "enter" },
		});
		const box = screen.getByRole("searchbox");

		await user.type(box, "globex{Enter}");
		await screen.findByText("No vendor matches");
		await user.type(box, " inc");

		expect(screen.queryByText("No vendor matches")).toBeNull();
		expect(
			screen
				.getAllByRole("status")
				.map((region) => region.getAttribute("aria-busy")),
		).toEqual(["false", "false"]);
	});

	it("is not left busy when the page is hidden during a call and shown again", async () => {
		const provider = slowFirstProvider(picksAcme, picksAcme, 80);
		const { seen, user } = renderSearch({ provider });

		await user.type(screen.getByRole("searchbox"), "acme");
		await waitFor(() => expect(provider.calls).toHaveLength(1));
		act(() => seen.setMode("hidden"));
		act(() => seen.setMode("visible"));
		await pause(120);

		expect(seen.search?.loading).toBe(false);
		expect(
			screen
				.getAllByRole("status")
				.map((region) => region.getAttribute("aria-busy")),
		).toEqual(["false", "false"]);
	});

	it("calls again when the page is shown after a hide cut its call short, so the answer is there (#135)", async () => {
		const provider = slowFirstProvider(picksAcme, picksAcme, 80);
		const { seen, user } = renderSearch({ provider });

		await user.type(screen.getByRole("searchbox"), "acme");
		await waitFor(() => expect(provider.calls).toHaveLength(1));
		act(() => seen.setMode("hidden"));
		act(() => seen.setMode("visible"));

		expect(
			await screen.findByRole("button", { name: "Acme Supplies" }),
		).toBeDefined();
		expect(provider.calls.map(({ request }) => request)).toEqual([
			"acme",
			"acme",
		]);
	});

	it("calls when the page is shown after a hide during the pause in typing (#135)", async () => {
		const provider = fakeProvider(picksAcme);
		const { seen, user } = renderSearch({ provider });

		await user.type(screen.getByRole("searchbox"), "acme");
		act(() => seen.setMode("hidden"));
		await pause(DEBOUNCE_MS + 50);
		expect(provider.calls).toHaveLength(0);
		act(() => seen.setMode("visible"));

		expect(
			await screen.findByRole("button", { name: "Acme Supplies" }),
		).toBeDefined();
		expect(provider.calls).toHaveLength(1);
	});

	it("makes no call when the page is shown after a hide with nothing cut short", async () => {
		const provider = fakeProvider(picksAcme);
		const { seen, user } = renderSearch({ provider });
		await user.type(screen.getByRole("searchbox"), "acme");
		await screen.findByRole("button", { name: "Acme Supplies" });

		act(() => seen.setMode("hidden"));
		act(() => seen.setMode("visible"));
		await pause(DEBOUNCE_MS + 50);

		expect(provider.calls).toHaveLength(1);
		expect(screen.getByRole("button", { name: "Acme Supplies" })).toBeDefined();
	});
});
