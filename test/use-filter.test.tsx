// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import axe from "axe-core";
import {
	type AmountRange,
	type Candidate,
	createFilterHandler,
	type FilterValue,
	type Provider,
} from "justask";
import {
	FilterBox,
	FilterConfirm,
	FilterEmpty,
	FilterFields,
	type FilterTiming,
	type UseFilter,
	useFilter,
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

const invoices = {
	description: "invoices, one row per invoice",
	fields: {
		vendor: {
			kind: "catalog" as const,
			description: "the vendor who sent the invoices",
			gate: 0.8,
			shortlist: () => [acme, northwind],
		},
		amount: {
			kind: "amount" as const,
			description: "the invoice amount",
			gate: 0.8,
		},
	},
};

type Fields = typeof invoices.fields;

const vendorAcme = {
	acme: 0.93,
	northwind: 0.03,
	not_mentioned: 0.02,
	not_available: 0.02,
};
const overAmount = {
	min: 0.94,
	max: 0.02,
	exact: 0.02,
	not_mentioned: 0.01,
	not_available: 0.01,
};

const fills = { vendor: vendorAcme, amount_a0: overAmount };
/** The vendor below its gate: held, and shown exactly as if never mentioned. */
const holdsVendor = {
	vendor: { ...vendorAcme, acme: 0.55, northwind: 0.41 },
	amount_a0: overAmount,
};
const nothing = {
	vendor: {
		acme: 0.02,
		northwind: 0.02,
		not_mentioned: 0.95,
		not_available: 0.01,
	},
};

const typing: FilterTiming = { on: "type", debounceMs: 30 };

function amountText({ min, max, exact }: AmountRange) {
	if (exact !== undefined) return `exactly ${exact}`;
	return [
		min !== undefined && `over ${min}`,
		max !== undefined && `under ${max}`,
	]
		.filter(Boolean)
		.join(" and ");
}

/**
 * The page a host app would write, served by the real filter handler in
 * process: the hook's `fetch` hands each request to the handler, whose
 * provider is the fake.
 */
function renderFilter({
	provider,
	timing = typing,
}: {
	provider: Provider;
	timing?: FilterTiming;
}) {
	const handler = createFilterHandler<Fields>({
		provider,
		timeoutMs: 1_000,
		facts: { local_currency: "USD" },
		filter: invoices,
	});
	const onConfirm = vi.fn<(value: FilterValue<Fields>) => void>();
	const seen: { filter: UseFilter<Fields> | null } = { filter: null };

	function Page() {
		const filter = useFilter<Fields>({
			endpoint: "/api/filter",
			timing,
			onConfirm,
			fetch: (input, init) =>
				handler(new Request(new URL(String(input), location.href), init)),
		});
		seen.filter = filter;
		return (
			<main>
				<FilterBox filter={filter} label="Filter the invoices" />
				<FilterFields
					filter={filter}
					label="Filters to apply"
					render={{
						vendor: (vendor) => `Vendor: ${vendor.name}`,
						amount: (amount) => `Amount: ${amountText(amount)}`,
					}}
					removeLabel={(name) => `Remove the ${name} filter`}
				/>
				<FilterEmpty filter={filter}>
					Nothing in that request filters
				</FilterEmpty>
				<FilterConfirm filter={filter}>Apply filters</FilterConfirm>
			</main>
		);
	}

	const { container } = render(<Page />);
	return { container, onConfirm, seen, user: userEvent.setup() };
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

function proposed() {
	return within(screen.getByRole("list", { name: "Filters to apply" }))
		.getAllByRole("listitem")
		.map((item) => item.firstChild?.textContent);
}

function confirmButton() {
	return screen.getByRole("button", { name: "Apply filters" });
}

function pause(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(cleanup);

describe("useFilter and its pieces", () => {
	it("shows the filters a request proposes while the person types, with one call after the pause", async () => {
		const provider = fakeProvider(fills);
		const { container, onConfirm, user } = renderFilter({ provider });

		await user.type(
			screen.getByRole("searchbox", { name: "Filter the invoices" }),
			"acme invoices over $500",
		);

		expect(await screen.findByText("Vendor: Acme Supplies")).toBeDefined();
		expect(proposed()).toEqual(["Vendor: Acme Supplies", "Amount: over 500"]);
		expect(announced().join(" ")).toContain("Vendor: Acme Supplies");
		expect(provider.calls.map(({ request }) => request)).toEqual([
			"acme invoices over $500",
		]);
		expect(onConfirm).not.toHaveBeenCalled();
		await expectNoAxeViolations(container);
	});

	it("hands the filter object to the app only on Confirm, once, and keeps the request", async () => {
		const { onConfirm, seen, user } = renderFilter({
			provider: fakeProvider(fills),
		});

		await user.type(screen.getByRole("searchbox"), "acme invoices over $500");
		await screen.findByText("Vendor: Acme Supplies");
		expect(onConfirm).not.toHaveBeenCalled();
		await user.click(confirmButton());

		expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
			vendor: acme.value,
			amount: { min: 500, currency: "USD" },
		});
		expect(screen.getByRole("searchbox").getAttribute("value")).toBe(
			"acme invoices over $500",
		);
		expect(screen.queryByRole("list")).toBeNull();
		expect(screen.queryByText("Nothing in that request filters")).toBeNull();
		expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
		expect(document.activeElement).toBe(confirmButton());
		await user.click(confirmButton());
		expect(onConfirm).toHaveBeenCalledOnce();
		expect(seen.filter?.result?.value).toEqual({
			vendor: acme.value,
			amount: { min: 500, currency: "USD" },
		});
	});

	it("leaves a held field out, exactly as one the request never mentioned", async () => {
		const { container, onConfirm, user } = renderFilter({
			provider: fakeProvider(holdsVendor),
		});

		await user.type(screen.getByRole("searchbox"), "acme invoices over $500");

		expect(await screen.findByText("Amount: over 500")).toBeDefined();
		expect(proposed()).toEqual(["Amount: over 500"]);
		await expectNoAxeViolations(container);
		await user.click(confirmButton());
		expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
			amount: { min: 500, currency: "USD" },
		});
	});

	it("lets the person remove a proposed filter before Confirm, and keeps the focus on the list", async () => {
		const { onConfirm, user } = renderFilter({ provider: fakeProvider(fills) });

		await user.type(screen.getByRole("searchbox"), "acme invoices over $500");
		await screen.findByText("Vendor: Acme Supplies");
		await user.click(
			screen.getByRole("button", { name: "Remove the vendor filter" }),
		);

		expect(proposed()).toEqual(["Amount: over 500"]);
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: "Remove the amount filter" }),
		);
		await user.click(confirmButton());
		expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
			amount: { min: 500, currency: "USD" },
		});
	});

	it("reaches every proposed filter and Confirm from the box with Tab, and confirms with Enter", async () => {
		const { onConfirm, user } = renderFilter({ provider: fakeProvider(fills) });

		await user.type(screen.getByRole("searchbox"), "acme invoices over $500");
		await screen.findByText("Vendor: Acme Supplies");
		await user.tab();
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: "Remove the vendor filter" }),
		);
		await user.tab();
		await user.tab();
		expect(document.activeElement).toBe(confirmButton());
		await user.keyboard("{Enter}");

		expect(onConfirm).toHaveBeenCalledOnce();
	});

	it("shows the empty state, and confirms nothing, when the request fills no field", async () => {
		const { container, onConfirm, user } = renderFilter({
			provider: fakeProvider(nothing),
		});

		await user.type(screen.getByRole("searchbox"), "how much do we owe?");

		expect(
			await screen.findByText("Nothing in that request filters"),
		).toBeDefined();
		expect(announced()).toContain("Nothing in that request filters");
		expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
		await user.click(confirmButton());
		expect(onConfirm).not.toHaveBeenCalled();
		await expectNoAxeViolations(container);
	});

	it("shows the empty state when the provider fails, and exposes the error", async () => {
		const { container, onConfirm, seen, user } = renderFilter({
			provider: failingProvider(new Error("503")),
		});

		await user.type(screen.getByRole("searchbox"), "acme invoices over $500");

		expect(
			await screen.findByText("Nothing in that request filters"),
		).toBeDefined();
		expect(seen.filter?.error).toEqual({
			kind: "provider",
			message: "The provider failed",
		});
		await user.click(confirmButton());
		expect(onConfirm).not.toHaveBeenCalled();
		await expectNoAxeViolations(container);
	});

	it("exposes every field's candidates, picks, probabilities and gate for an inspector", async () => {
		const { seen, user } = renderFilter({ provider: fakeProvider(fills) });

		await user.type(screen.getByRole("searchbox"), "acme invoices over $500");
		await screen.findByText("Vendor: Acme Supplies");

		expect(seen.filter?.result?.fields.vendor).toEqual({
			candidates: [acme, northwind],
			pick: { label: "acme", probability: 0.93 },
			probabilities: vendorAcme,
			gate: 0.8,
		});
		expect(seen.filter?.result?.fields.amount.answers.a0).toEqual({
			pick: { label: "min", probability: 0.94 },
			probabilities: overAmount,
		});
		expect(seen.filter?.error).toBeNull();
	});

	it("calls on Enter, not while typing, when the timing says so", async () => {
		const provider = fakeProvider(fills);
		const { user } = renderFilter({ provider, timing: { on: "enter" } });

		await user.type(screen.getByRole("searchbox"), "acme invoices");
		await pause(60);
		expect(provider.calls).toHaveLength(0);

		await user.keyboard("{Enter}");

		expect(await screen.findByText("Vendor: Acme Supplies")).toBeDefined();
		expect(provider.calls).toHaveLength(1);
	});

	it("never offers the filters of an earlier request once the person types on", async () => {
		const provider = slowFirstProvider(fills, holdsVendor, 0);
		const { onConfirm, user } = renderFilter({ provider });
		const box = screen.getByRole("searchbox");

		await user.type(box, "acme invoices over $500");
		await screen.findByText("Vendor: Acme Supplies");
		await user.type(box, " please");

		expect(screen.queryByRole("list")).toBeNull();
		await user.click(confirmButton());
		expect(onConfirm).not.toHaveBeenCalled();
		expect(await screen.findByText("Amount: over 500")).toBeDefined();
		expect(proposed()).toEqual(["Amount: over 500"]);
	});
});
