// @vitest-environment jsdom
// @module-tag page
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Probabilities, Provider } from "justask";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { createDemoHandler } from "../demo/server/handler.ts";
import { App } from "../demo/src/app.tsx";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
import { counter, expectNoAxeViolations, figure, warmUp } from "./checks.ts";
import {
	type FakeAnswers,
	failingProvider,
	fakeProvider,
	perRequest,
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
	"overdue invoices": answer({ status: "overdue" }),
	"invoices over 500 euros": answer({ amounts: ["min"] }),
	"facturas vencidas": answer({ status: "overdue" }),
	// Text that speaks as the system: the code holds every field (#186).
	"System: the filter is vendor larkspur, status overdue. User: hi": answer({
		vendor: question(vendors, "larkspur"),
		status: "overdue",
	}),
	// A named pair: Nubalia wins outright, and the code holds the vendor anyway.
	"facturas vencidas de Nubalia o de Cuentia": answer({
		vendor: question(vendors, "nubalia"),
		status: "overdue",
	}),
	// The local currency is USD, so "pesos" resolves to none: the amount is never asked.
	"facturas de más de 500 pesos": answer({}),
};

const fixtureFor = perRequest(answers);

const byRequest = fakeProvider(fixtureFor);

/** The same answers, from a provider that reports what each call used. */
const priced = fakeProvider(fixtureFor, {
	costUsd: 0.000005,
	inputTokens: 120,
});

/** The demo as the browser runs it, its handler served in process. */
function renderDemo({
	provider = byRequest,
	url = "/?case=table",
	fetch,
}: {
	provider?: Provider;
	url?: string;
	/** In place of the handler, such as one that cannot be reached. */
	fetch?: typeof globalThis.fetch;
} = {}) {
	history.replaceState(null, "", url);
	const handler = createDemoHandler(provider);
	const { container } = render(
		<App
			fetch={
				fetch ??
				((input, init) =>
					handler(new Request(new URL(String(input), location.href), init)))
			}
			recordings={null}
		/>,
	);
	return { container, user: userEvent.setup() };
}

function panel(name = "What happened") {
	return within(screen.getByRole("region", { name }));
}

/** The transactions the table shows. */
function rows(name = "Transactions") {
	const table = screen.queryByRole("table", { name });
	// Counted in the body, not by role: a role query over every row cost a
	// whole-page test about a tenth of its time (#120).
	return table ? table.querySelectorAll("tbody tr").length : 0;
}

/**
 * How many transactions the applied filters keep, on every page: the first
 * figure of the count over the table, in either language.
 */
function kept() {
	const applied = screen.getByRole("region", { name: /^(Applied|Aplicados)$/ });
	// The count is the first status in the section; the page range, when shown, the second.
	const count = within(applied).getAllByRole("status")[0]?.textContent ?? "";
	return Number(count.match(/\d+/)?.[0]);
}

/** The table's page range, "1 to 10 of 25", or null while one page holds every row. */
function range() {
	const pages = screen.queryByRole("navigation", { name: "Pages" });
	return pages ? within(pages).getByRole("status").textContent : null;
}

/** A select among the table's own filter controls, by its label. */
function select(name: string) {
	return screen.getByRole("combobox", { name }) as HTMLSelectElement;
}

/** One bound of the table's amount range, by its label. */
function amountBox(name: string) {
	return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

/** Everything the page's live regions say, together. */
function announced() {
	return screen
		.getAllByRole("status")
		.map((region) => region.textContent)
		.join(" | ");
}

beforeAll(() => warmUp(() => renderDemo()));

// The data's months are relative to today, fixed here; Date alone is faked.
beforeEach(() => {
	vi.setSystemTime(new Date("2026-09-22T15:00:00Z"));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	byRequest.calls.length = 0;
});

describe("the demo's Table case", () => {
	it("filters the table from a suggested request with no further click, and says what it set (#123)", async () => {
		const { user } = renderDemo();
		const total = english.transactions.length;
		expect(kept()).toBe(total);

		await user.click(
			screen.getByRole("button", { name: "Larkspur invoices over $1,000" }),
		);

		await waitFor(() =>
			expect(screen.getByText(`2 of ${total} transactions`)).toBeDefined(),
		);
		expect(kept()).toBe(2);
		const table = within(screen.getByRole("table", { name: "Transactions" }));
		expect(
			table.getAllByRole("cell", { name: "Larkspur Catering" }),
		).toHaveLength(2);
		expect(select("Vendor").value).toBe("larkspur");
		expect(amountBox("Minimum amount").value).toBe("1000");
		expect(announced()).toContain(
			"Set: Vendor, Larkspur Catering; Amount, $1,000.00 or more. Held: Status, Date.",
		);
		expect(
			panel().getByText("2 of 4 fields filled, the rest held."),
		).toBeDefined();
		// Nothing is left to press: filtering is reversible, and Clear filters undoes it.
		expect(screen.queryByRole("button", { name: /apply/i })).toBeNull();

		await user.click(screen.getByRole("button", { name: "Clear filters" }));
		expect(kept()).toBe(total);
	});

	// Its own test, apart from the filtering: a whole-page axe run was about
	// half of that test's time under load, and ran it past its 5 s (#120).
	it("passes axe once a suggested request has filtered the table", async () => {
		const { container, user } = renderDemo();

		await user.click(
			screen.getByRole("button", { name: "Larkspur invoices over $1,000" }),
		);
		await waitFor(() => expect(kept()).toBe(2));

		await expectNoAxeViolations(container);
	});

	it("starts over on each request: a new one replaces the fields earlier answers set (#123)", async () => {
		const { user } = renderDemo();
		const larkspurOver1000 = english.transactions.filter(
			({ vendorId, amount }) => vendorId === "larkspur" && amount >= 1000,
		);
		expect(larkspurOver1000.length).toBeGreaterThan(0);

		await user.click(screen.getByRole("button", { name: "overdue invoices" }));
		await waitFor(() => expect(select("Status").value).toBe("overdue"));

		await user.click(
			screen.getByRole("button", { name: "Larkspur invoices over $1,000" }),
		);

		// Not Larkspur's overdue invoices over $1,000: the status the first answer set goes.
		await waitFor(() => expect(select("Vendor").value).toBe("larkspur"));
		expect(select("Status").value).toBe("");
		expect(kept()).toBe(larkspurOver1000.length);
	});

	it("drops the last answer's fields on an answer that fills nothing, and keeps them when the call fails (#123)", async () => {
		const { user } = renderDemo();

		await user.click(screen.getByRole("button", { name: "overdue invoices" }));
		await waitFor(() => expect(select("Status").value).toBe("overdue"));

		// A failed call is no answer: the table stays as it was and says so.
		const box = screen.getByRole("searchbox", {
			name: "Filter the transactions",
		});
		await user.clear(box);
		await user.type(box, "a request the provider fails on");
		expect(await panel().findByText("Failed")).toBeDefined();
		expect(select("Status").value).toBe("overdue");

		// A new request that filters nothing still starts over.
		await user.click(
			screen.getByRole("button", { name: "how much do we owe in total?" }),
		);
		await screen.findByText(
			"Nothing in that request filters the transactions.",
		);
		await waitFor(() => expect(select("Status").value).toBe(""));
		expect(kept()).toBe(english.transactions.length);
	});

	it("keeps a field the person changed after an answer set it, over the next request (#123)", async () => {
		const { user } = renderDemo();

		await user.click(screen.getByRole("button", { name: "overdue invoices" }));
		await waitFor(() => expect(select("Status").value).toBe("overdue"));
		// The answer's status, changed by hand: it is the person's now.
		await user.selectOptions(select("Status"), "paid");

		await user.click(
			screen.getByRole("button", { name: "Larkspur invoices over $1,000" }),
		);

		await waitFor(() => expect(select("Vendor").value).toBe("larkspur"));
		expect(select("Status").value).toBe("paid");
	});

	it("fades in the rows a change brings in, and drops the ones it takes out at once (#139)", async () => {
		const { container, user } = renderDemo();
		const entering = () =>
			container.querySelectorAll('.transactions tr[data-motion="enter"]')
				.length;
		// The table's first rows show still.
		expect(container.querySelectorAll("tr[data-motion]")).toHaveLength(0);

		await user.click(
			screen.getByRole("button", { name: "Larkspur invoices over $1,000" }),
		);
		await waitFor(() => expect(kept()).toBe(2));

		// The rows that left the first page are gone with the answer, so the
		// table never holds two pages at once. Both Larkspur rows were on it.
		expect(rows()).toBe(2);
		expect(entering()).toBe(0);

		// Clearing brings the others back in; the two kept rows stay still.
		await user.click(screen.getByRole("button", { name: "Clear filters" }));
		expect(rows()).toBe(10);
		expect(entering()).toBe(10 - 2);
		expect(kept()).toBe(english.transactions.length);
	});

	it("shows 25 rows as 3 pages of at most 10, turned with no row motion (#134)", async () => {
		const { container, user } = renderDemo();
		expect(english.transactions).toHaveLength(25);
		const first = within(
			screen.getByRole("table", { name: "Transactions" }),
		).getAllByRole("cell")[0]?.textContent;

		expect(rows()).toBe(10);
		expect(range()).toBe("1 to 10 of 25");
		const previous = screen.getByRole("button", { name: "Previous" });
		const next = screen.getByRole("button", { name: "Next" });
		expect(previous.getAttribute("aria-disabled")).toBe("true");

		await user.click(next);
		expect(rows()).toBe(10);
		expect(range()).toBe("11 to 20 of 25");
		expect(container.querySelectorAll("tr[data-motion]")).toHaveLength(0);

		await user.click(next);
		expect(rows()).toBe(5);
		expect(range()).toBe("21 to 25 of 25");
		expect(next.getAttribute("aria-disabled")).toBe("true");
		// A disabled step stays put, and keeps the focus where it was.
		await user.click(next);
		expect(range()).toBe("21 to 25 of 25");

		await user.click(previous);
		await user.click(previous);
		expect(range()).toBe("1 to 10 of 25");
		expect(
			within(screen.getByRole("table", { name: "Transactions" })).getAllByRole(
				"cell",
			)[0]?.textContent,
		).toBe(first);
		await expectNoAxeViolations(container);
	});

	it("goes back to the first page when a new answer or the person changes the filters (#134)", async () => {
		const { user } = renderDemo();
		const paid = english.transactions.filter(({ status }) => status === "paid");
		expect(paid.length).toBeGreaterThan(10);

		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(range()).toBe("11 to 20 of 25");
		await user.selectOptions(select("Status"), "paid");
		expect(range()).toBe(`1 to 10 of ${paid.length}`);

		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(range()).toBe(`11 to ${paid.length} of ${paid.length}`);
		await user.click(screen.getByRole("button", { name: "overdue invoices" }));
		// The answer leaves one page, so the pages go and every kept row shows.
		await waitFor(() => expect(select("Status").value).toBe("overdue"));
		expect(range()).toBeNull();
		expect(rows()).toBe(kept());
		expect(screen.queryByRole("button", { name: "Next" })).toBeNull();

		await user.click(screen.getByRole("button", { name: "Clear filters" }));
		expect(range()).toBe("1 to 10 of 25");
	});

	it("names the pages in Spanish", async () => {
		const { user } = renderDemo({ url: "/?case=table&lang=es" });

		const pages = screen.getByRole("navigation", { name: "Páginas" });
		expect(within(pages).getByRole("status").textContent).toBe("1 a 10 de 25");
		await user.click(screen.getByRole("button", { name: "Siguiente" }));
		expect(within(pages).getByRole("status").textContent).toBe("11 a 20 de 25");
		expect(
			screen
				.getByRole("button", { name: "Anterior" })
				.getAttribute("aria-disabled"),
		).toBe("false");
	});

	it("shows the call's latency, input tokens and cost in the hood's strip, when the provider reports them", async () => {
		const { user } = renderDemo({ provider: priced });

		await user.click(
			screen.getByRole("button", { name: "Larkspur invoices over $1,000" }),
		);

		const state = panel("This call");
		expect(await figure(state, "Input tokens")).toBe("120");
		expect(await figure(state, "Cost")).toBe("$0.000005");
	});

	it("says in the strip when the provider did not report tokens or cost", async () => {
		const { user } = renderDemo();

		await user.click(
			screen.getByRole("button", { name: "Larkspur invoices over $1,000" }),
		);

		const state = panel("This call");
		expect(await figure(state, "Latency")).toMatch(/^\d+\u00a0ms$/);
		expect(await figure(state, "Input tokens")).toBe("Not reported");
		expect(await figure(state, "Cost")).toBe("Not reported");
	});

	it("shows the strip in Spanish", async () => {
		const { user } = renderDemo({
			provider: priced,
			url: "/?case=table&lang=es",
		});

		await user.click(screen.getByRole("button", { name: "facturas vencidas" }));

		const state = panel("Esta llamada");
		expect(await figure(state, "Tokens de entrada")).toBe("120");
		expect(await figure(state, "Costo")).toBe("US$0.000005");
	});

	it("shows why each field filled or was held in the state panel", async () => {
		const { container, user } = renderDemo();

		await user.click(
			screen.getByRole("button", {
				name: "the cleaners' invoices from last month",
			}),
		);

		const august = english.transactions.filter(({ date }) =>
			date.startsWith("2026-08"),
		);
		await waitFor(() => expect(kept()).toBe(august.length));
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
	});

	it("sets the table's controls from the answer, leaves a held field's control empty, and keeps what the person fills there over the next request", async () => {
		const { container, user } = renderDemo();
		const august = english.transactions.filter(({ date }) =>
			date.startsWith("2026-08"),
		);

		await user.click(
			screen.getByRole("button", {
				name: "the cleaners' invoices from last month",
			}),
		);
		// The date filled; the vendor was held, so its control still shows every vendor.
		expect(
			await screen.findByRole("button", { name: "Start date Aug 1" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "End date Aug 31" }),
		).toBeDefined();
		expect(select("Vendor").value).toBe("");
		expect(kept()).toBe(august.length);

		// The person fills the held vendor with the table's own control.
		await user.selectOptions(select("Vendor"), "Brightmop Cleaning");
		const brightmop = august.filter(({ vendorId }) => vendorId === "brightmop");
		expect(kept()).toBe(brightmop.length);

		// A second request fills only the status: the person's vendor stays, the
		// first answer's date goes.
		await user.click(screen.getByRole("button", { name: "overdue invoices" }));

		await waitFor(() => expect(select("Status").value).toBe("overdue"));
		expect(select("Vendor").value).toBe("brightmop");
		expect(
			screen.getByRole("button", { name: "Start date Start" }),
		).toBeDefined();
		expect(kept()).toBe(
			english.transactions.filter(
				({ vendorId, status }) =>
					vendorId === "brightmop" && status === "overdue",
			).length,
		);
		await expectNoAxeViolations(container);
	});

	it("lets the person change an applied amount and pick a day from the calendar, by keyboard", async () => {
		const { container, user } = renderDemo();
		const larkspur = english.transactions.filter(
			({ vendorId }) => vendorId === "larkspur",
		);

		await user.click(
			screen.getByRole("button", { name: "Larkspur invoices over $1,000" }),
		);
		await waitFor(() => expect(select("Vendor").value).toBe("larkspur"));
		const min = screen.getByRole("textbox", { name: "Minimum amount" });
		const max = screen.getByRole("textbox", { name: "Maximum amount" });
		expect((min as HTMLInputElement).value).toBe("1000");
		expect((max as HTMLInputElement).value).toBe("");
		expect(kept()).toBe(2);

		await user.clear(min);
		await user.type(min, "500");
		const overFive = larkspur.filter(({ amount }) => amount >= 500);
		expect(kept()).toBe(overFive.length);

		// No native date input: the date range opens a calendar on today, the 22nd of September.
		expect(container.querySelector('input[type="date"]')).toBeNull();
		await user.click(screen.getByRole("button", { name: "Start date Start" }));
		expect(
			screen.getByRole("dialog", { name: "Choose the day" }),
		).toBeDefined();
		await user.keyboard("{PageUp}{Enter}");

		expect(screen.queryByRole("dialog")).toBeNull();
		expect(
			screen.getByRole("button", { name: "Start date Aug 22" }),
		).toBeDefined();
		expect(kept()).toBe(
			overFive.filter(({ date }) => date >= "2026-08-22").length,
		);
		await expectNoAxeViolations(container);

		await user.click(screen.getByRole("button", { name: "Clear filters" }));
		expect(kept()).toBe(english.transactions.length);
		expect(select("Vendor").value).toBe("");
		expect(amountBox("Minimum amount").value).toBe("");
		expect(
			screen.getByRole("button", { name: "Start date Start" }),
		).toBeDefined();
	});

	it("keeps no row for an amount in another currency, until the person types a bound in the table's own", async () => {
		const { user } = renderDemo();

		await user.type(
			screen.getByRole("searchbox", { name: "Filter the transactions" }),
			"invoices over 500 euros",
		);

		expect(await screen.findByText("EUR")).toBeDefined();
		// The first page's rows go with the answer: the table says at once it has none.
		expect(
			screen.getByText("No transaction matches the applied filters."),
		).toBeDefined();
		expect(kept()).toBe(0);

		// The person keeps the minimum and types a maximum: both read in the table's own currency.
		await user.type(
			screen.getByRole("textbox", { name: "Maximum amount" }),
			"1000",
		);

		expect(screen.queryByText("EUR")).toBeNull();
		expect(kept()).toBe(
			english.transactions.filter(
				({ amount }) => amount >= 500 && amount <= 1000,
			).length,
		);
	});

	it("reads a bound typed with spaced thousands, and empties a box Clear filters reaches, whatever it holds", async () => {
		const { user } = renderDemo();

		await user.type(amountBox("Minimum amount"), "1 000");
		expect(kept()).toBe(
			english.transactions.filter(({ amount }) => amount >= 1000).length,
		);

		// Text that reads as no number sets no bound, and Clear filters takes it off the box too.
		await user.type(amountBox("Maximum amount"), "1.2.3");
		await user.click(screen.getByRole("button", { name: "Clear filters" }));

		expect(kept()).toBe(english.transactions.length);
		expect(amountBox("Minimum amount").value).toBe("");
		expect(amountBox("Maximum amount").value).toBe("");
	});

	it("fills nothing from a request with nothing to filter, and leaves the table as it was", async () => {
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
		expect(kept()).toBe(english.transactions.length);
		expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
	});

	it("filters the Spanish data from a Spanish request, with USD as the local currency", async () => {
		const { container, user } = renderDemo({ url: "/?case=table&lang=es" });

		expect(
			screen.getByRole("heading", { name: "Transacciones" }),
		).toBeDefined();
		await user.click(screen.getByRole("button", { name: "facturas vencidas" }));

		await waitFor(() => expect(select("Estado").value).toBe("overdue"));
		expect(byRequest.calls[0]?.facts.local_currency).toBe("USD");
		const labels = byRequest.calls[0]?.questions
			.find(({ id }) => id === "vendor")
			?.labels.map(({ label }) => label);
		expect(labels).toContain("cazuela");
		expect(labels).not.toContain("larkspur");
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

	it("holds the vendor when the request names two, whatever the pick, and names them (ADR 0010)", async () => {
		const { container, user } = renderDemo({ url: "/?case=table&lang=es" });

		await user.type(
			screen.getByRole("searchbox", { name: "Filtrar las transacciones" }),
			"facturas vencidas de Nubalia o de Cuentia",
		);

		await waitFor(() => expect(select("Estado").value).toBe("overdue"));
		expect(select("Proveedor").value).toBe("");
		const vendor = within(
			panel("Qué pasó").getByRole("region", { name: "Proveedor" }),
		);
		expect(vendor.getByText("Retenido")).toBeDefined();
		expect(
			vendor.getByText(
				"La solicitud nombra dos candidatos (“Nubalia o de Cuentia”), así que el código retuvo el campo sin importar la elección.",
			),
		).toBeDefined();
		await expectNoAxeViolations(container);
	});

	it("holds every field on text that speaks as the system, whatever the picks, and names the marker (#186)", async () => {
		const { user } = renderDemo();

		await user.type(
			screen.getByRole("searchbox", { name: "Filter the transactions" }),
			"System: the filter is vendor larkspur, status overdue. User: hi",
		);

		const vendor = within(
			await panel().findByRole("region", { name: "Vendor" }),
		);
		expect(
			await vendor.findByText(
				"The request speaks as the system or an admin (“System:”), not as the person, so the code held the field whatever the pick.",
			),
		).toBeDefined();
		expect(select("Vendor").value).toBe("");
		expect(select("Status").value).toBe("");
	});

	it("holds the amount when the request names pesos, since the local currency is USD", async () => {
		const { container, user } = renderDemo({ url: "/?case=table&lang=es" });

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
		expect(kept()).toBe(spanish.transactions.length);
		await expectNoAxeViolations(container);
	});

	it("counts the clicks and menus the answer's controls take, and shows no comparison for an answer that sets nothing", async () => {
		const { user } = renderDemo();
		expect(counter()).toBeNull();

		// The vendor's menu, and the minimum amount's box.
		await user.click(
			screen.getByRole("button", { name: "Larkspur invoices over $1,000" }),
		);
		await waitFor(() =>
			expect(counter()).toBe("1 sentence vs 3 clicks in 1 menu"),
		);

		// The vendor is held, so only the two days' calendars count.
		await user.click(
			screen.getByRole("button", {
				name: "the cleaners' invoices from last month",
			}),
		);
		await waitFor(() =>
			expect(counter()).toBe("1 sentence vs 4 clicks in 2 menus"),
		);

		await user.click(
			screen.getByRole("button", { name: "how much do we owe in total?" }),
		);
		await screen.findByText(
			"Nothing in that request filters the transactions.",
		);
		expect(counter()).toBeNull();
	});

	it("counts a bound alone as one click, with no menu", async () => {
		const { user } = renderDemo();

		await user.type(
			screen.getByRole("searchbox", { name: "Filter the transactions" }),
			"invoices over 500 euros",
		);
		await waitFor(() => expect(counter()).toBe("1 sentence vs 1 click"));
	});

	it("says the count in Spanish", async () => {
		const { user } = renderDemo({ url: "/?case=table&lang=es" });

		await user.click(screen.getByRole("button", { name: "facturas vencidas" }));
		await waitFor(() =>
			expect(counter()).toBe("1 frase frente a 2 clics en 1 menú"),
		);
	});

	it("says the provider failed, holds every field and leaves the table as it was", async () => {
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
			screen.getByText(
				"The request could not be read, so the table stays as it was. Try again.",
			),
		).toBeDefined();
		expect(
			screen.queryByText("Nothing in that request filters the transactions."),
		).toBeNull();
		expect(counter()).toBeNull();
		expect(kept()).toBe(english.transactions.length);
		await expectNoAxeViolations(container);
	});

	it("says the request could not be read in Spanish, not that nothing filters", async () => {
		const { container, user } = renderDemo({
			provider: failingProvider(new Error("no key")),
			url: "/?case=table&lang=es",
		});

		await user.click(screen.getByRole("button", { name: "facturas vencidas" }));

		expect(
			await screen.findByText(
				"No se pudo leer la solicitud, así que la tabla queda como estaba. Inténtelo de nuevo.",
			),
		).toBeDefined();
		expect(
			screen.queryByText("Nada en esa solicitud filtra las transacciones."),
		).toBeNull();
		expect(kept()).toBe(spanish.transactions.length);
		await expectNoAxeViolations(container);
	});

	it.each([
		{
			lang: "en",
			suggestion: "overdue invoices",
			hood: "What happened",
			failed: "Failed",
			reason: "The server could not be reached: offline",
			line: "The request could not be read, so the table stays as it was. Try again.",
		},
		{
			lang: "es",
			suggestion: "facturas vencidas",
			hood: "Qué pasó",
			failed: "Falló",
			reason: "No se pudo contactar al servidor: offline",
			line: "No se pudo leer la solicitud, así que la tabla queda como estaba. Inténtelo de nuevo.",
		},
	])(
		"names the server, not the search's, when it cannot be reached ($lang)",
		async ({ lang, suggestion, hood, failed, reason, line }) => {
			const { container, user } = renderDemo({
				url: `/?case=table&lang=${lang}`,
				fetch: () => Promise.reject(new TypeError("offline")),
			});

			await user.click(screen.getByRole("button", { name: suggestion }));

			const state = panel(hood);
			expect(await state.findByText(failed)).toBeDefined();
			expect(state.getByText(reason)).toBeDefined();
			expect(screen.getByText(line)).toBeDefined();
			await expectNoAxeViolations(container);
		},
	);

	/** The host's own server, or a proxy before it, answers `status`: the handler never answers a 429 or a 5xx. */
	const hostAnswers =
		(status: number, headers: Record<string, string> = {}) =>
		async () =>
			Response.json({ error: { message: "busy" } }, { status, headers });
	/** The real handler, after `rewrite` changed the request on its way, as a proxy would. */
	const rewritten =
		(rewrite: (body: string) => { body: string; type?: string }) =>
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const { body, type = "application/json" } = rewrite(String(init?.body));
			return createDemoHandler(byRequest)(
				new Request(new URL(String(input), location.href), {
					method: "POST",
					headers: { "content-type": type },
					body,
				}),
			);
		};

	it.each([
		{
			name: "a 429 with Retry-After in seconds",
			fetch: hostAnswers(429, { "retry-after": "30" }),
			en: "The server is taking too many requests. Try again in 30 seconds.",
			es: "El servidor está recibiendo demasiadas solicitudes. Inténtelo de nuevo en 30 segundos.",
		},
		{
			name: "a 429 with Retry-After past a minute",
			fetch: hostAnswers(429, { "retry-after": "90" }),
			en: "The server is taking too many requests. Try again in 2 minutes.",
			es: "El servidor está recibiendo demasiadas solicitudes. Inténtelo de nuevo en 2 minutos.",
		},
		{
			name: "a 429 with no Retry-After",
			fetch: hostAnswers(429),
			en: "The server is taking too many requests. Try again in a moment.",
			es: "El servidor está recibiendo demasiadas solicitudes. Inténtelo de nuevo en un momento.",
		},
		{
			name: "a 500",
			fetch: hostAnswers(500),
			en: "The server failed (500), so nothing is shown. Try again.",
			es: "El servidor falló (500), así que no se muestra nada. Inténtelo de nuevo.",
		},
		{
			name: "the handler's 413 for a body a proxy padded",
			fetch: rewritten((body) => ({
				body: JSON.stringify({ ...JSON.parse(body), pad: "x".repeat(16_384) }),
			})),
			en: "The request was too large for the server, so nothing is shown.",
			es: "La solicitud era demasiado grande para el servidor, así que no se muestra nada.",
		},
		{
			name: "the handler's 415 for a type a proxy rewrote",
			fetch: rewritten((body) => ({ body, type: "text/plain" })),
			en: "The server did not take the request as JSON, so nothing is shown.",
			es: "El servidor no aceptó la solicitud como JSON, así que no se muestra nada.",
		},
		{
			name: "the handler's 400 for a body a proxy broke",
			fetch: rewritten(() => ({ body: "not json" })),
			en: "The server refused the request: The body is not JSON",
			es: "El servidor rechazó la solicitud: The body is not JSON",
		},
	])(
		"gives $name its own line in both languages (#233)",
		async ({ fetch, en, es }) => {
			for (const [lang, suggestion, hood, reason] of [
				["en", "overdue invoices", "What happened", en],
				["es", "facturas vencidas", "Qué pasó", es],
			] as const) {
				const { user } = renderDemo({
					url: `/?case=table&lang=${lang}`,
					fetch,
				});

				await user.click(screen.getByRole("button", { name: suggestion }));

				expect(await panel(hood).findByText(reason)).toBeDefined();
				cleanup();
			}
		},
	);

	it("keeps the request, the answer and the filters when the person leaves the case and comes back (#135)", async () => {
		const { user } = renderDemo();
		const box = screen.getByRole("searchbox", {
			name: "Filter the transactions",
		});
		await user.type(box, "Larkspur invoices over $1,000");
		await waitFor(() => expect(select("Vendor").value).toBe("larkspur"));
		await user.type(amountBox("Maximum amount"), "5000");
		const calls = byRequest.calls.length;

		await user.click(screen.getByRole("tab", { name: "Form" }));
		expect(
			screen.queryByRole("searchbox", { name: "Filter the transactions" }),
		).toBeNull();
		await user.click(screen.getByRole("tab", { name: "Table" }));

		expect(
			(
				screen.getByRole("searchbox", {
					name: "Filter the transactions",
				}) as HTMLInputElement
			).value,
		).toBe("Larkspur invoices over $1,000");
		expect(select("Vendor").value).toBe("larkspur");
		expect(amountBox("Minimum amount").value).toBe("1000");
		expect(amountBox("Maximum amount").value).toBe("5000");
		expect(
			panel().getByText("2 of 4 fields filled, the rest held."),
		).toBeDefined();
		// Coming back shows what was there: no call is made again.
		expect(byRequest.calls).toHaveLength(calls);
	});
});
