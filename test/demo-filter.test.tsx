// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import axe from "axe-core";
import type { Probabilities, Provider } from "justask";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoHandler } from "../demo/server/handler.ts";
import { App } from "../demo/src/app.tsx";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
import {
	type FakeAnswers,
	failingProvider,
	fakeProvider,
} from "./fake-provider.ts";

const vendors = [...english.vendors, ...spanish.vendors].map(({ id }) => id);
const statuses = english.statuses.map(({ id }) => id);

/** One question's answer: `pick` at `p`, every other label near zero. */
function question(
	labels: string[],
	pick: string | null,
	p = 0.96,
): Probabilities {
	const answer: Probabilities = Object.fromEntries(
		labels.map((label) => [label, 0.01]),
	);
	answer.not_mentioned = pick ? 0.01 : 0.96;
	answer.not_available = 0.01;
	if (pick) answer[pick] = p;
	return answer;
}

const dates = ["d0", "d1", "d2", "d3"];
const roles = ["min", "max", "exact"];

/**
 * Every question the demo's filter can ask, answered: the vendor and the
 * status, where the period starts and ends, and what each number does.
 */
function answer({
	vendor = question(vendors, null),
	status = null,
	date = null,
	amounts = [],
}: {
	vendor?: Probabilities;
	status?: string | null;
	date?: string | null;
	amounts?: string[];
}): FakeAnswers {
	return {
		vendor,
		status: question(statuses, status),
		date_from: question(dates, date),
		date_to: question(dates, date),
		...Object.fromEntries(
			amounts.map((role, i) => [`amount_a${i}`, question(roles, role)]),
		),
	};
}

const answers: Record<string, FakeAnswers> = {
	"Larkspur invoices over $1,000": answer({
		vendor: question(vendors, "larkspur"),
		amounts: ["min"],
	}),
	// Two cleaners split the vendor below the gate, so only the date fills.
	"the cleaners' invoices from last month": answer({
		vendor: { ...question(vendors, "brightmop", 0.52), glasswell: 0.44 },
		date: "d0",
	}),
	"how much do we owe in total?": answer({}),
	"facturas vencidas": answer({ status: "overdue" }),
	// The local currency is USD, so "pesos" resolves to none: the amount is never asked.
	"facturas de más de 500 pesos": answer({}),
};

const byRequest = fakeProvider((request) => {
	const fixture = answers[request];
	if (!fixture) throw new Error(`no fixture for "${request}"`);
	return fixture;
});

/** The demo as the browser runs it, its handler served in process. */
function renderDemo({
	provider = byRequest,
	url = "/?page=filter",
}: {
	provider?: Provider;
	url?: string;
} = {}) {
	history.replaceState(null, "", url);
	const handler = createDemoHandler(provider);
	const { container } = render(
		<App
			fetch={(input, init) =>
				handler(new Request(new URL(String(input), location.href), init))
			}
		/>,
	);
	return { container, user: userEvent.setup() };
}

function panel(name = "What happened") {
	return within(screen.getByRole("region", { name }));
}

function proposed(name = "Filters to apply") {
	const list = screen.queryByRole("list", { name });
	return list
		? within(list)
				.getAllByRole("listitem")
				.map((item) => item.textContent)
		: [];
}

/** The transactions the table shows. */
function rows(name = "Transactions") {
	const table = screen.queryByRole("table", { name });
	// The header row, then one per transaction.
	return table ? within(table).getAllByRole("row").length - 1 : 0;
}

function waitForProposal() {
	return screen.findByRole("list", { name: "Filters to apply" });
}

async function expectNoAxeViolations(container: Element) {
	// jsdom paints nothing: contrast is checked in the browser.
	const { violations } = await axe.run(container, {
		rules: { "color-contrast": { enabled: false } },
	});
	expect(violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
}

// The data's months are relative to today, fixed here; Date alone is faked.
beforeEach(() => {
	vi.setSystemTime(new Date("2026-09-22T15:00:00Z"));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	byRequest.calls.length = 0;
});

describe("the demo's filter page", () => {
	it("proposes the filters a suggested request names, and filters the table only on Apply", async () => {
		const { container, user } = renderDemo();
		const total = english.transactions.length;
		expect(rows()).toBe(total);

		await user.click(
			screen.getByRole("button", { name: "Larkspur invoices over $1,000" }),
		);

		await waitForProposal();
		expect(proposed()).toEqual([
			"VendorLarkspur CateringRemove",
			"Amount$1,000.00 or moreRemove",
		]);
		expect(screen.getByText(`All ${total} transactions`)).toBeDefined();
		expect(rows()).toBe(total);
		expect(
			panel().getByText("2 of 4 fields filled, the rest held."),
		).toBeDefined();
		await expectNoAxeViolations(container);

		await user.click(screen.getByRole("button", { name: "Apply filters" }));

		expect(screen.getByText(`2 of ${total} transactions`)).toBeDefined();
		expect(rows()).toBe(2);
		const table = within(screen.getByRole("table", { name: "Transactions" }));
		expect(
			table.getAllByRole("cell", { name: "Larkspur Catering" }),
		).toHaveLength(2);
		expect(proposed()).toEqual([]);
	});

	it("shows why each field filled or was held in the state panel", async () => {
		const { container, user } = renderDemo();

		await user.click(
			screen.getByRole("button", {
				name: "the cleaners' invoices from last month",
			}),
		);

		await waitForProposal();
		expect(proposed()).toEqual(["DateAug 1, 2026 to Aug 31, 2026Remove"]);
		// The demo's table has no filter controls of its own, so it says who fills a held field.
		expect(
			screen.getByText(
				"A held field stays out of the filters. A real app fills it with its own table controls.",
			),
		).toBeDefined();
		const vendor = within(panel().getByRole("region", { name: "Vendor" }));
		expect(vendor.getByText("Held")).toBeDefined();
		expect(
			vendor.getByText(
				"A pick (0.52) fell below the gate (0.60), so the field is held.",
			),
		).toBeDefined();
		const pick = vendor.getByRole("row", { name: /Brightmop Cleaning/ });
		expect(within(pick).getByText("0.52")).toBeDefined();
		expect(vendor.getByText("11 more candidates, not shown")).toBeDefined();
		const date = within(panel().getByRole("region", { name: "Date" }));
		expect(date.getByText("Filled")).toBeDefined();
		expect(date.getByRole("table", { name: "Where it starts" })).toBeDefined();
		expect(date.getByRole("table", { name: "Where it ends" })).toBeDefined();
		const amount = within(panel().getByRole("region", { name: "Amount" }));
		expect(
			amount.getByText(
				"The code found no candidates, so the provider was not asked.",
			),
		).toBeDefined();
		await expectNoAxeViolations(container);

		await user.click(screen.getByRole("button", { name: "Apply filters" }));
		const august = english.transactions.filter(({ date }) =>
			date.startsWith("2026-08"),
		);
		expect(rows()).toBe(august.length);
	});

	it("fills nothing from a request with nothing to filter, and offers nothing to apply", async () => {
		const { user } = renderDemo();

		await user.click(
			screen.getByRole("button", { name: "how much do we owe in total?" }),
		);

		expect(
			await screen.findByText(
				"Nothing in that request filters the transactions.",
			),
		).toBeDefined();
		expect(panel().getByText("No field filled, all 4 held.")).toBeDefined();
		const apply = screen.getByRole("button", { name: "Apply filters" });
		expect(apply.getAttribute("aria-disabled")).toBe("true");
		await user.click(apply);
		expect(rows()).toBe(english.transactions.length);
	});

	it("lets the person remove a proposed filter before applying", async () => {
		const { user } = renderDemo();

		await user.click(
			screen.getByRole("button", { name: "Larkspur invoices over $1,000" }),
		);
		await user.click(
			await screen.findByRole("button", { name: "Remove the amount filter" }),
		);
		expect(
			screen.getAllByRole("status").map(({ textContent }) => textContent),
		).toContain("Removed: amount");
		await user.click(screen.getByRole("button", { name: "Apply filters" }));

		expect(rows()).toBe(
			english.transactions.filter(({ vendorId }) => vendorId === "larkspur")
				.length,
		);
		await user.click(screen.getByRole("button", { name: "Clear filters" }));
		expect(rows()).toBe(english.transactions.length);
	});

	it("filters the Spanish data from a Spanish request, with USD as the local currency", async () => {
		const { container, user } = renderDemo({ url: "/?page=filter&lang=es" });

		expect(
			screen.getByRole("heading", { name: "Transacciones" }),
		).toBeDefined();
		await user.click(screen.getByRole("button", { name: "facturas vencidas" }));

		await screen.findByRole("list", { name: "Filtros por aplicar" });
		expect(proposed("Filtros por aplicar")).toEqual(["EstadoVencidaQuitar"]);
		expect(byRequest.calls[0]?.facts.local_currency).toBe("USD");
		const labels = byRequest.calls[0]?.questions
			.find(({ id }) => id === "vendor")
			?.labels.map(({ label }) => label);
		expect(labels).toContain("cazuela");
		expect(labels).not.toContain("larkspur");
		await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
		expect(rows("Transacciones")).toBe(
			spanish.transactions.filter(({ status }) => status === "overdue").length,
		);
		// The panel still reads the answer that was applied.
		expect(
			panel("Qué pasó").getByText(
				"1 de 4 campos completados, el resto retenido.",
			),
		).toBeDefined();
		await expectNoAxeViolations(container);
	});

	it("holds the amount when the request names pesos, since the local currency is USD", async () => {
		const { container, user } = renderDemo({ url: "/?page=filter&lang=es" });

		await user.type(
			screen.getByRole("searchbox", { name: "Filtrar las transacciones" }),
			"facturas de más de 500 pesos",
		);

		expect(
			await screen.findByText(
				"Nada en esa solicitud filtra las transacciones.",
			),
		).toBeDefined();
		expect(byRequest.calls[0]?.questions.map(({ id }) => id)).toEqual([
			"vendor",
			"status",
		]);
		const amount = within(
			panel("Qué pasó").getByRole("region", { name: "Monto" }),
		);
		expect(amount.getByText("Retenido")).toBeDefined();
		expect(
			amount.getByText(
				"La solicitud nombra “pesos”, que no es la moneda local, así que el código retuvo el campo sin consultar al modelo.",
			),
		).toBeDefined();
		expect(
			screen
				.getByRole("button", { name: "Aplicar filtros" })
				.getAttribute("aria-disabled"),
		).toBe("true");
		await expectNoAxeViolations(container);
	});

	it("announces a removed filter in Spanish", async () => {
		const { user } = renderDemo({ url: "/?page=filter&lang=es" });

		await user.click(screen.getByRole("button", { name: "facturas vencidas" }));
		await user.click(
			await screen.findByRole("button", { name: "Quitar el filtro de estado" }),
		);

		expect(
			screen.getAllByRole("status").map(({ textContent }) => textContent),
		).toContain("Se quitó: estado");
	});

	it("says the provider failed, holds every field and offers nothing to apply", async () => {
		const { container, user } = renderDemo({
			provider: failingProvider(new Error("no key")),
		});

		await user.click(
			screen.getByRole("button", { name: "Larkspur invoices over $1,000" }),
		);

		const state = panel();
		expect(await state.findByText("Failed")).toBeDefined();
		expect(
			state.getByText(
				"The provider failed, so nothing is shown. The server log has the details.",
			),
		).toBeDefined();
		expect(
			screen.getByText("Nothing in that request filters the transactions."),
		).toBeDefined();
		expect(
			screen
				.getByRole("button", { name: "Apply filters" })
				.getAttribute("aria-disabled"),
		).toBe("true");
		await expectNoAxeViolations(container);
	});

	it("is its own page, linked from the header, with the language kept", async () => {
		const { user } = renderDemo({ url: "/?lang=es" });

		await user.click(screen.getByRole("link", { name: "Filtro" }));

		expect(location.search).toBe("?page=filter&lang=es");
		expect(
			screen.getByRole("heading", { name: "Transacciones" }),
		).toBeDefined();
		expect(
			screen.getByRole("link", { name: "Filtro" }).getAttribute("aria-current"),
		).toBe("page");
		await user.click(screen.getByRole("link", { name: "English" }));
		expect(location.search).toBe("?page=filter");
	});
});
