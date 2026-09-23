// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import axe from "axe-core";
import { type Candidate, createSearchHandler, type Provider } from "justask";
import {
	SearchBox,
	SearchEmpty,
	SearchItem,
	type SearchTiming,
	type UseSearch,
	useSearch,
} from "justask/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	failingProvider,
	fakeProvider,
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

const picksAcme = { search: { acme: 0.93, northwind: 0.05, none: 0.02 } };
const picksNone = { search: { acme: 0.1, northwind: 0.05, none: 0.85 } };

const typing: SearchTiming = { on: "type", debounceMs: 30 };

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
	const seen: { search: UseSearch<Vendor> | null } = { search: null };

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

	const { container } = render(<Page />);
	return { container, onChoose, seen, user: userEvent.setup() };
}

async function expectNoAxeViolations(container: Element) {
	// jsdom paints nothing, and the pieces ship unstyled: contrast is the host's.
	const { violations } = await axe.run(container, {
		rules: { "color-contrast": { enabled: false } },
	});
	expect(violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
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
			probabilities: { acme: 0.93, northwind: 0.05, none: 0.02 },
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
		await pause(60);

		expect(screen.queryByRole("button")).toBeNull();
		expect(screen.queryByText("No vendor matches")).toBeNull();
		expect(provider.calls).toHaveLength(1);
	});

	it("shows the answer to the latest request, never a slower earlier one", async () => {
		const provider = slowFirstProvider(picksNone, picksAcme, 80);
		const { user } = renderSearch({ provider });
		const box = screen.getByRole("searchbox");

		await user.type(box, "globex");
		await waitFor(() => expect(provider.calls).toHaveLength(1));
		await user.clear(box);
		await user.type(box, "acme");

		await screen.findByRole("button", { name: "Acme Supplies" });
		await pause(100);
		expect(screen.getByRole("button", { name: "Acme Supplies" })).toBeDefined();
		expect(screen.queryByText("No vendor matches")).toBeNull();
	});
});
