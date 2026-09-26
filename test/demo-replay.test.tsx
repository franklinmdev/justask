// @vitest-environment jsdom
import {
	act,
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
import type { Language } from "../demo/src/content/types.ts";
import { formats } from "../demo/src/format.ts";
import { dayOf, type Recording, recordings } from "../demo/src/recording.ts";
import { applyTo, matches, transactionsOn } from "../demo/src/transactions.ts";
import { expectNoAxeViolations as expectNoAxe, warmUp } from "./checks.ts";
import { failingProvider, fakeProvider } from "./fake-provider.ts";

// The recording files themselves: a rerun of the script changes their
// figures and day, never what these tests check.
const table = recordings.table.en;
const search = recordings.search.es;
const form = recordings.form.en;
const formEs = recordings.form.es;

/**
 * A desktop's width; `reduced` is the visitor's motion setting, on by
 * default so the sentence appears whole.
 */
function setMedia({ reduced }: { reduced: boolean }) {
	window.matchMedia = (query: string) => ({
		matches: query.includes("reduced-motion")
			? reduced
			: 1280 >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	});
}

/**
 * The demo with its recordings, its handler served in process. The default
 * provider fails: a replay never reaches it, and a live call shows in its
 * `calls`.
 */
function renderDemo({
	url = "/",
	reduced = true,
	provider = failingProvider(new Error("the replay makes no call")),
	killSwitch = false,
}: {
	url?: string;
	reduced?: boolean;
	provider?: Provider & { calls: unknown[] };
	/** Every live request gets the budget's 402, paused (#109). */
	killSwitch?: boolean;
} = {}) {
	setMedia({ reduced });
	history.replaceState(null, "", url);
	const handler = createDemoHandler(provider, { killSwitch });
	const { container } = render(
		<App
			fetch={(input, init) =>
				handler(new Request(new URL(String(input), location.href), init))
			}
		/>,
	);
	return {
		container,
		provider,
		user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }),
	};
}

const contents = { en: english, es: spanish };

/** The day a recording ran, as the page writes it. */
function day(language: Language, recording: Recording<object>) {
	return formats(contents[language].locale).date(dayOf(recording));
}

/** The label on a case showing its recording. */
function label(language: Language, recording: Recording<object>) {
	return contents[language].copy.recorded(day(language, recording));
}

/** One question's answer: `pick` near certain, every other label near zero. */
function picking(candidates: { id: string }[], pick: string): Probabilities {
	return Object.fromEntries(
		[...candidates.map(({ id }) => id), "not_mentioned", "not_available"].map(
			(label) => [label, label === pick ? 0.97 : 0.005],
		),
	);
}

/**
 * Past the whole replay, on the faked clock: a start pause, the sentence,
 * then the box's pause or Enter.
 */
const REPLAY = { timeout: 4_000 };

/** The notice's heading once a live request meets the kill switch. */
const PAUSED = "The live demo is paused";

/** Everything the page's live regions say, together. */
function announced() {
	return screen
		.getAllByRole("status")
		.map((region) => region.textContent)
		.join(" | ");
}

function control(name: string) {
	return screen.getByRole("combobox", { name }) as HTMLSelectElement;
}

function textbox(name: string) {
	return screen.getByRole("textbox", { name }) as HTMLInputElement;
}

function searchbox(name: string) {
	return screen.getByRole("searchbox", { name }) as HTMLInputElement;
}

/** The figure the hood's strip shows under a term. */
function figure(term: string, strip = "This call") {
	return within(screen.getByRole("region", { name: strip })).getByText(term, {
		selector: "dt",
	}).nextElementSibling?.textContent;
}

function replayApplied() {
	return waitFor(
		() => expect(control("Vendor").value).toBe("fixbright"),
		REPLAY,
	);
}

function expectNoAxeViolations(container: Element) {
	// axe paces its own work with timers: the real clock runs it.
	vi.useRealTimers();
	return expectNoAxe(container);
}

// The page's cold start, before the clock is faked: its replay runs on the
// real one until the page is dropped.
beforeAll(async () => {
	await warmUp(() => renderDemo());
	// @ts-expect-error jsdom has no matchMedia of its own.
	delete window.matchMedia;
});

// A replay is paced by timers, which run on a faked clock: under load, real
// ones ran past the test's time and let a replay step overtake the person's.
// Testing Library steps that clock only for Jest's fake timers, so `jest`
// here is Vitest's. The date control's year reads today, fixed here.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
	vi.stubGlobal("jest", { advanceTimersByTime: vi.advanceTimersByTime });
	vi.setSystemTime(new Date("2026-09-23T15:00:00Z"));
	// A new browser tab: no replay has played in it yet.
	sessionStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	// @ts-expect-error jsdom has no matchMedia of its own.
	delete window.matchMedia;
});

describe("the Table case's recorded run", () => {
	it("replays with no call and no click: the sentence, then the answer sets each control in field order", async () => {
		const { container, provider } = renderDemo();

		expect(screen.getByText(label("en", table))).toBeDefined();
		const box = searchbox("Filter the transactions");
		await waitFor(() => expect(box.value).toBe(table.request), REPLAY);
		expect(announced()).toContain(
			`Replaying a recorded run from ${day("en", table)}: “${table.request}”`,
		);

		await replayApplied();
		expect(control("Status").value).toBe("");
		expect(
			screen.getByRole("button", { name: "Start date Jul 1" }),
		).toBeDefined();
		expect(textbox("Minimum amount").value).toBe("200");
		expect(textbox("Maximum amount").value).toBe("600");
		expect(announced()).toContain(
			"Set: Vendor, Fixbright IT; Date, since Jul 1, 2026; Amount, $200.00 to $600.00. Held: Status.",
		);
		// The vendor's menu, the start day's calendar and both bounds; the held status counts nothing.
		expect(screen.getByText(/^1 sentence /).textContent).toBe(
			"1 sentence vs 6 clicks in 2 menus",
		);
		// Each control the answer set settles in after the one before; the held one stays still.
		expect(
			[...container.querySelectorAll<HTMLElement>("[data-settle]")].map(
				(filter) => [
					filter.querySelector(".entry-label")?.textContent,
					filter.style.getPropertyValue("--settle-at"),
				],
			),
		).toEqual([
			["Vendor", "0"],
			["Date", "1"],
			["Amount", "2"],
		]);

		expect(figure("Latency")).toBe(`${table.latencyMs} ms`);
		expect(figure("Input tokens")).toBe(
			formats("en").count(table.response.inputTokens ?? Number.NaN),
		);
		expect(figure("Cost")).toBe(
			formats("en").cost(table.response.costUsd ?? Number.NaN),
		);
		expect(provider.calls).toHaveLength(0);
	});

	// Its own test, apart from the replay's steps: a whole-page axe run was
	// about half of that test's time under load, and ran it past its 5 s (#120).
	it("passes axe once the replay has set the controls", async () => {
		const { container } = renderDemo();

		await replayApplied();

		await expectNoAxeViolations(container);
	});

	it("shows the recorded result in the hood's JSON tab, as a live call's", async () => {
		const { user } = renderDemo();
		await replayApplied();

		await user.click(screen.getByRole("tab", { name: "JSON" }));

		const json = screen.getByRole("figure", { name: "filter.result" });
		expect(JSON.parse(json.querySelector("code")?.textContent ?? "")).toEqual(
			table.response.filter,
		);
	});

	it("types the sentence in a character at a time when motion is allowed", async () => {
		renderDemo({ reduced: false });
		const box = searchbox("Filter the transactions");

		await waitFor(
			() => {
				expect(box.value.length).toBeGreaterThan(0);
				expect(box.value.length).toBeLessThan(table.request.length);
			},
			{ ...REPLAY, interval: 5 },
		);
		expect(table.request.startsWith(box.value)).toBe(true);
		await waitFor(() => expect(box.value).toBe(table.request), REPLAY);
	});

	it("gives way to the person: what they type is a live call that replaces the recording's display", async () => {
		const { user, provider } = renderDemo({
			provider: fakeProvider(
				() => ({
					vendor: picking(english.vendors, "not_mentioned"),
					status: picking(english.statuses, "overdue"),
				}),
				{ costUsd: 0.000005, inputTokens: 120 },
			),
		});
		await replayApplied();
		const box = searchbox("Filter the transactions");

		await user.clear(box);
		await user.type(box, "overdue invoices");

		await waitFor(() => expect(figure("Input tokens")).toBe("120"), REPLAY);
		expect(screen.queryByText(label("en", table))).toBeNull();
		expect(provider.calls).toHaveLength(1);
		// The live answer applies itself and starts over: nothing the replay set sticks (#123).
		await waitFor(() => expect(control("Status").value).toBe("overdue"));
		expect(control("Vendor").value).toBe("");
		expect(
			screen.getByRole("button", { name: "Start date Start" }),
		).toBeDefined();
		expect(textbox("Minimum amount").value).toBe("");
	});

	it("drops the label once the person edits the box, even when an empty box makes no call", async () => {
		const { user, provider } = renderDemo();
		await replayApplied();

		await user.clear(searchbox("Filter the transactions"));

		expect(screen.queryByText(label("en", table))).toBeNull();
		expect(provider.calls).toHaveLength(0);
	});

	it("stops when the person sets a table control before the answer, and keeps their choice", async () => {
		const { user } = renderDemo();
		const box = searchbox("Filter the transactions");
		// The sentence is in; the box's pause has not run out.
		await waitFor(() => expect(box.value).toBe(table.request), REPLAY);

		await user.selectOptions(control("Status"), "paid");
		await act(() => vi.advanceTimersByTimeAsync(1_500));

		expect(control("Status").value).toBe("paid");
		expect(control("Vendor").value).toBe("");
		expect(announced()).not.toContain("Replaying a recorded run");
	});

	it("stops when the person types first, and applies nothing", async () => {
		const { user, provider } = renderDemo();
		const box = searchbox("Filter the transactions");

		await user.type(box, "x");
		// Past the whole replay: nothing more types in, and nothing is applied.
		await act(() => vi.advanceTimersByTimeAsync(2_500));

		expect(box.value).toBe("x");
		expect(screen.queryByText(label("en", table))).toBeNull();
		expect(control("Vendor").value).toBe("");
		// "x" went live, to the provider that fails.
		expect(provider.calls).toHaveLength(1);
	});

	it("shows the rows it ran on a year later, then today's once the person takes over (#122)", async () => {
		vi.setSystemTime(new Date("2027-09-24T15:00:00Z"));
		const { user } = renderDemo();
		const date = formats("en").date;
		/** The dates the table shows, in its order. */
		const shown = () =>
			within(screen.getByRole("table", { name: "Transactions" }))
				.getAllByRole("row")
				.slice(1)
				.map((row) => within(row).getAllByRole("cell")[2]?.textContent);
		await replayApplied();

		const applied = applyTo({}, table.response.filter.value);
		const ranOn = transactionsOn(english.transactions, dayOf(table)).filter(
			(row) => matches(row, applied),
		);
		expect(ranOn.length).toBeGreaterThan(0);
		expect(shown()).toEqual(ranOn.map((row) => date(row.date)));

		await user.click(screen.getByRole("button", { name: "Clear filters" }));

		// The first page of today's rows, ten a page (#134).
		const firstPage = (rows: typeof english.transactions) =>
			rows.slice(0, 10).map((row) => date(row.date));
		expect(shown()).toEqual(
			firstPage(transactionsOn(english.transactions, "2027-09-24")),
		);
		expect(shown()).not.toEqual(firstPage(english.transactions));
	});
});

describe("the Search case's recorded run", () => {
	it("replays in Spanish with no call: the sentence, then the vendor and its transactions", async () => {
		const { container, provider } = renderDemo({
			url: "/?case=search&lang=es",
		});
		const vendor = search.response.search.item;
		if (!vendor) throw new Error("The recording found no vendor");

		expect(screen.getByText(label("es", search))).toBeDefined();
		expect(
			await screen.findByRole(
				"table",
				{ name: `Transacciones con ${vendor.name}` },
				REPLAY,
			),
		).toBeDefined();
		expect(searchbox("Buscar un proveedor").value).toBe(search.request);
		expect(announced()).toContain(
			`Reproduciendo una ejecución grabada del ${day("es", search)}: “${search.request}”`,
		);
		expect(announced()).toContain(vendor.name);
		expect(screen.getByText(/^1 frase /).textContent).toBe(
			"1 frase frente a 2 clics en 1 menú",
		);
		expect(figure("Latencia", "Esta llamada")).toBe(`${search.latencyMs} ms`);
		expect(provider.calls).toHaveLength(0);
		await expectNoAxeViolations(container);
	});

	it("shows the vendor's rows of the day it ran on a year later (#122)", async () => {
		vi.setSystemTime(new Date("2027-09-24T15:00:00Z"));
		renderDemo({ url: "/?case=search&lang=es" });
		const vendor = search.response.search.item;
		if (!vendor) throw new Error("The recording found no vendor");

		const table = await screen.findByRole(
			"table",
			{ name: `Transacciones con ${vendor.name}` },
			REPLAY,
		);

		const date = formats(spanish.locale).date;
		const ranOn = transactionsOn(spanish.transactions, dayOf(search)).filter(
			(row) => row.vendorId === vendor.id,
		);
		expect(ranOn.length).toBeGreaterThan(0);
		expect(
			within(table)
				.getAllByRole("row")
				.slice(1)
				.map((row) => within(row).getAllByRole("cell")[1]?.textContent),
		).toEqual(ranOn.map((row) => date(row.date)));
	});
});

describe("the Form case's recorded run", () => {
	const box = () => searchbox("Describe the expense");
	const checkbox = (name: string) =>
		screen.getByRole("checkbox", { name }) as HTMLInputElement;
	const replayFilled = () =>
		waitFor(() => expect(textbox("Amount").value).toBe("156.00"), REPLAY);

	it("replays with no call and no click: the sentence, then the fields fill in order and the held vendor and day stay empty, the hood saying why", async () => {
		const { container, provider } = renderDemo({ url: "/?case=form" });

		expect(screen.getByText(label("en", form))).toBeDefined();
		await replayFilled();
		expect(box().value).toBe(form.request);
		expect(announced()).toContain(
			`Replaying a recorded run from ${day("en", form)}: “${form.request}”`,
		);
		expect(announced()).toContain(
			"Filled: tags and amount. For you to fill: vendor and day.",
		);
		expect(checkbox("Travel").checked).toBe(true);
		expect(checkbox("Office").checked).toBe(false);
		// The held vendor and day stay empty, for the person to choose.
		expect(control("Vendor").value).toBe("");
		expect(
			screen.getByRole("button", { name: "Day Pick a day" }),
		).toBeDefined();
		// Each field the answer filled settles in after the one before; the held one stays still.
		expect(
			[...container.querySelectorAll<HTMLElement>("[data-settle]")].map(
				(entry) => [
					entry.querySelector(".entry-label")?.textContent,
					entry.style.getPropertyValue("--settle-at"),
				],
			),
		).toEqual([
			["Tags", "0"],
			["Amount", "1"],
		]);

		const hood = within(screen.getByRole("region", { name: "What happened" }));
		const vendor = within(hood.getByRole("region", { name: "Vendor" }));
		expect(vendor.getByText("Held")).toBeDefined();
		expect(
			vendor.getByText("The provider says the request does not mention it."),
		).toBeDefined();
		const spentOn = within(hood.getByRole("region", { name: "Day" }));
		expect(spentOn.getByText("Held")).toBeDefined();
		expect(
			spentOn.getByText(
				"The code found no candidates, so the provider was not asked.",
			),
		).toBeDefined();
		expect(figure("Latency")).toBe(`${form.latencyMs} ms`);
		expect(figure("Cost")).toBe(
			formats("en").cost(form.response.costUsd ?? Number.NaN),
		);
		// The replay fills the card and saves nothing: Save is the person's.
		expect(screen.getByText(english.copy.card.noExpenses)).toBeDefined();
		expect(provider.calls).toHaveLength(0);
		await expectNoAxeViolations(container);
	});

	it("shows Enter pressed on the Fill button, which then reads as sent (#147)", async () => {
		renderDemo({ url: "/?case=form" });
		const fill = () => screen.getByRole("button", { name: "Fill the card" });

		await waitFor(
			() => expect(fill().hasAttribute("data-pressed")).toBe(true),
			REPLAY,
		);
		expect(fill().hasAttribute("data-next")).toBe(false);
		await replayFilled();
		await waitFor(() =>
			expect(fill().hasAttribute("data-pressed")).toBe(false),
		);
		expect(fill().hasAttribute("data-next")).toBe(false);
		expect(box().getAttribute("aria-describedby")).toBeTruthy();
		expect(
			document.getElementById(box().getAttribute("aria-describedby") ?? "")
				?.textContent,
		).toBe("");
	});

	it("replays in Spanish with no call", async () => {
		const { provider } = renderDemo({ url: "/?case=form&lang=es" });

		expect(screen.getByText(label("es", formEs))).toBeDefined();
		await waitFor(() => expect(textbox("Monto").value).toBe("156.00"), REPLAY);
		expect(checkbox("Viajes").checked).toBe(true);
		expect(control("Proveedor").value).toBe("");
		expect(searchbox("Describa el gasto").value).toBe(formEs.request);
		expect(announced()).toContain(
			`Reproduciendo una ejecución grabada del ${day("es", formEs)}: “${formEs.request}”`,
		);
		expect(
			screen.getByRole("button", { name: "Día Elija un día" }),
		).toBeDefined();
		expect(provider.calls).toHaveLength(0);
	});

	it("gives way to the person: a request they type and send is a live call that replaces the recording's display", async () => {
		const { user, provider } = renderDemo({
			url: "/?case=form",
			provider: fakeProvider(
				() => ({
					intent: picking([{ id: "new_record" }], "new_record"),
					vendor: picking(english.vendors, "papergrove"),
					...Object.fromEntries(
						english.tags.map(({ id }) => [
							`tags_${id}`,
							picking(
								[{ id: "yes" }],
								id === "office" ? "yes" : "not_mentioned",
							),
						]),
					),
				}),
				{ costUsd: 0.000005, inputTokens: 120 },
			),
		});
		await replayFilled();

		await user.clear(box());
		await user.type(box(), "Papergrove toner{Enter}");

		await waitFor(() => expect(figure("Input tokens")).toBe("120"), REPLAY);
		expect(screen.queryByText(label("en", form))).toBeNull();
		expect(provider.calls).toHaveLength(1);
		expect(control("Vendor").value).toBe("papergrove");
	});

	it("gives way to a suggestion, which is a live call", async () => {
		const { user, provider } = renderDemo({ url: "/?case=form" });
		await replayFilled();

		await user.click(
			screen.getByRole("button", {
				name: "lunch with Larkspur yesterday, $86.40",
			}),
		);

		await waitFor(() => expect(provider.calls).toHaveLength(1), REPLAY);
		expect(screen.queryByText(label("en", form))).toBeNull();
	});

	it("stops when the person sets a field before Enter, and keeps their choice", async () => {
		const { user } = renderDemo({ url: "/?case=form" });

		await user.selectOptions(control("Vendor"), "papergrove");
		// Past the whole replay: Enter is never pressed, so nothing fills.
		await act(() => vi.advanceTimersByTimeAsync(2_500));

		expect(control("Vendor").value).toBe("papergrove");
		expect(textbox("Amount").value).toBe("");
		expect(screen.queryByText(label("en", form))).toBeNull();
		expect(announced()).not.toContain("Replaying a recorded run");
	});

	it("stops when the person types first, and fills nothing", async () => {
		const { user, provider } = renderDemo({ url: "/?case=form" });

		await user.type(box(), "x");
		// Past the whole replay: nothing more types in, and nothing fills.
		await act(() => vi.advanceTimersByTimeAsync(2_500));

		expect(box().value).toBe("x");
		expect(screen.queryByText(label("en", form))).toBeNull();
		expect(textbox("Amount").value).toBe("");
		expect(provider.calls).toHaveLength(0);
	});
});

describe("a replay plays once per browser tab (#135)", () => {
	it("opens a reload on the recorded run's end state at once, with no typing", async () => {
		renderDemo({ reduced: false });
		await replayApplied();
		cleanup();

		const { provider } = renderDemo({ reduced: false });
		// No clock steps: the end state is in before the replay's first pause.
		await act(async () => {});

		expect(searchbox("Filter the transactions").value).toBe(table.request);
		expect(control("Vendor").value).toBe("fixbright");
		expect(screen.getByText(label("en", table))).toBeDefined();
		expect(announced()).not.toContain("Replaying a recorded run");
		expect(figure("Latency")).toBe(`${table.latencyMs} ms`);
		expect(provider.calls).toHaveLength(0);
	});

	it.each([
		["table", "Filter the transactions", table.request],
		["form", "Describe the expense", form.request],
		["search", "Find a vendor", recordings.search.en.request],
	])(
		"opens the %s case's end state still on a reload: nothing settles in or fades (#139)",
		async (shownCase, box, request) => {
			const url = `/?case=${shownCase}`;
			const moving = (container: Element) =>
				container.querySelectorAll(
					"[data-settle], tr[data-motion], .item:not([data-still])",
				).length;
			const first = renderDemo({ url });
			await waitFor(() => expect(searchbox(box).value).toBe(request), REPLAY);
			// Past the box's pause or Enter: what the answer filled settles in.
			await act(() => vi.advanceTimersByTimeAsync(1_000));
			expect(moving(first.container)).toBeGreaterThan(0);
			cleanup();

			const { container, provider } = renderDemo({ url });
			await act(async () => {});
			await act(async () => {});

			expect(searchbox(box).value).toBe(request);
			expect(moving(container)).toBe(0);
			expect(provider.calls).toHaveLength(0);
		},
	);

	it("keeps a reloaded card's filled fields still once the person edits one (#139)", async () => {
		const url = "/?case=form";
		renderDemo({ url });
		await waitFor(
			() => expect(searchbox("Describe the expense").value).toBe(form.request),
			REPLAY,
		);
		await act(() => vi.advanceTimersByTimeAsync(1_000));
		cleanup();

		const { container, user } = renderDemo({ url });
		await act(async () => {});
		await act(async () => {});
		await user.type(textbox("Amount"), "5");

		// Settling in now would start on fields that were already on screen.
		expect(container.querySelectorAll("[data-settle]")).toHaveLength(0);
	});

	it("fades rows in again once the person acts on a reloaded end state (#139)", async () => {
		renderDemo();
		await replayApplied();
		cleanup();

		const { container, user } = renderDemo();
		await act(async () => {});
		expect(control("Vendor").value).toBe("fixbright");
		await user.click(screen.getByRole("button", { name: "Clear filters" }));

		expect(
			container.querySelectorAll('tr[data-motion="enter"]').length,
		).toBeGreaterThan(0);
	});

	it("replays again in a new tab", async () => {
		renderDemo();
		await replayApplied();
		cleanup();
		sessionStorage.clear();

		renderDemo();
		await act(async () => {});

		expect(searchbox("Filter the transactions").value).toBe("");
		await waitFor(
			() => expect(announced()).toContain("Replaying a recorded run"),
			REPLAY,
		);
		await replayApplied();
	});

	it("replays on every load when the browser blocks storage, and the page still works", async () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		try {
			renderDemo();
			await replayApplied();
			cleanup();

			renderDemo();
			await act(async () => {});
			expect(searchbox("Filter the transactions").value).toBe("");
			await replayApplied();
		} finally {
			vi.restoreAllMocks();
		}
	});

	it("keeps each case's played run when the person leaves it and comes back, with no call", async () => {
		const { user, provider } = renderDemo();
		await replayApplied();
		await user.selectOptions(control("Status"), "paid");

		await user.click(screen.getByRole("tab", { name: "Search" }));
		await waitFor(
			() =>
				expect(searchbox("Find a vendor").value).toBe(
					recordings.search.en.request,
				),
			REPLAY,
		);
		await user.click(screen.getByRole("tab", { name: "Table" }));
		// Past a whole replay: nothing types in again.
		await act(() => vi.advanceTimersByTimeAsync(2_500));

		expect(searchbox("Filter the transactions").value).toBe(table.request);
		expect(control("Vendor").value).toBe("fixbright");
		expect(control("Status").value).toBe("paid");
		expect(provider.calls).toHaveLength(0);
	});

	it("ends a replay the person left halfway on its recorded run when they come back", async () => {
		const { user, provider } = renderDemo({ reduced: false });
		const box = searchbox("Filter the transactions");
		await waitFor(
			() => {
				expect(box.value.length).toBeGreaterThan(0);
				expect(box.value.length).toBeLessThan(table.request.length);
			},
			{ ...REPLAY, interval: 5 },
		);

		await user.click(screen.getByRole("tab", { name: "Form" }));
		await user.click(screen.getByRole("tab", { name: "Table" }));
		await act(async () => {});

		expect(searchbox("Filter the transactions").value).toBe(table.request);
		expect(control("Vendor").value).toBe("fixbright");
		expect(provider.calls).toHaveLength(0);
	});
});

describe("the recorded runs while the kill switch is on (#109)", () => {
	it.each([
		["table", "Filter the transactions", table.request],
		["form", "Describe the expense", form.request],
		["search", "Find a vendor", recordings.search.en.request],
	])(
		"still open the %s case, with no call",
		async (shownCase, box, request) => {
			const { provider } = renderDemo({
				url: `/?case=${shownCase}`,
				killSwitch: true,
			});

			await waitFor(() => expect(searchbox(box).value).toBe(request), REPLAY);
			// Past the box's pause or Enter: the recorded answer is in, and nothing was stopped.
			await act(() => vi.advanceTimersByTimeAsync(1_000));
			expect(screen.queryByRole("heading", { name: PAUSED })).toBeNull();
			expect(provider.calls).toHaveLength(0);
		},
	);

	it("replays the case again from the notice a live request brought", async () => {
		const { user } = renderDemo({ killSwitch: true });
		await replayApplied();
		const box = searchbox("Filter the transactions");

		await user.clear(box);
		await user.type(box, "overdue invoices");
		await screen.findByRole("heading", { name: PAUSED }, REPLAY);
		await user.click(
			screen.getByRole("button", { name: "Replay the recorded run" }),
		);

		expect(screen.queryByRole("heading", { name: PAUSED })).toBeNull();
		// Asked for, the replay types in again, though this tab has played it.
		await waitFor(
			() => expect(announced()).toContain("Replaying a recorded run"),
			REPLAY,
		);
		await replayApplied();
		expect(searchbox("Filter the transactions").value).toBe(table.request);
	});
});
