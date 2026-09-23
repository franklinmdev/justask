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
const tags = english.tags.map(({ id }) => id);

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

/**
 * Every question the demo's card can ask, answered: whether it is a new
 * expense, the vendor, each tag, the day and the amount.
 */
function answer({
	intent = "new_record",
	vendor = question(vendors, null),
	tagged = [],
	day = null,
	amount = null,
}: {
	intent?: string;
	vendor?: Probabilities;
	tagged?: string[];
	day?: string | null;
	amount?: string | null;
}): FakeAnswers {
	return {
		intent: question(["new_record"], intent),
		vendor,
		...Object.fromEntries(
			tags.map((id) => [
				`tags_${id}`,
				question(["yes"], tagged.includes(id) ? "yes" : null),
			]),
		),
		spent_on: question(["d0", "d1", "d2"], day),
		total: question(["a0", "a1"], amount),
	};
}

const answers: Record<string, FakeAnswers> = {
	"lunch with Larkspur yesterday, $86.40": answer({
		vendor: question(vendors, "larkspur"),
		tagged: ["meals"],
		day: "d0",
		amount: "a0",
	}),
	// Two cleaners split the vendor below the gate, so the rest fills.
	"lunch with the cleaners yesterday, $40": answer({
		vendor: { ...question(vendors, "brightmop", 0.48), glasswell: 0.44 },
		tagged: ["meals"],
		day: "d0",
		amount: "a0",
	}),
	// "last Friday" reads two ways, so the day is held whatever its probability.
	"Papergrove toner last Friday, $120": answer({
		vendor: question(vendors, "papergrove"),
		tagged: ["office"],
		day: "d0",
		amount: "a0",
	}),
	"delete yesterday's taxi": answer({ intent: "not_available" }),
	// A command on a recorded expense, read as a new one: the code holds it.
	"quite el gasto de $58 del Cafetal": answer({
		vendor: question(vendors, "cafetal"),
		tagged: ["meals"],
		amount: "a0",
	}),
	// A named pair, its vendor picked above the gate: the code holds it.
	"Tallyroot or Cloudberth, $75 yesterday": answer({
		vendor: question(vendors, "tallyroot"),
		tagged: ["office"],
		day: "d0",
		amount: "a0",
	}),
	"almuerzo con Cazuela Azul ayer, $86.40": answer({
		vendor: question(vendors, "cazuela"),
		tagged: ["meals"],
		day: "d0",
		amount: "a0",
	}),
};

function fixtureFor(request: string): FakeAnswers {
	const fixture = answers[request];
	if (!fixture) throw new Error(`no fixture for "${request}"`);
	return fixture;
}

const byRequest = fakeProvider(fixtureFor);

/** The same answers, from a provider that reports what each call used. */
const priced = fakeProvider(fixtureFor, {
	costUsd: 0.000005,
	inputTokens: 120,
});

/** The demo as the browser runs it, its handler served in process. */
function renderDemo({
	provider = byRequest,
	url = "/?case=form",
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
			recordings={null}
		/>,
	);
	return { container, user: userEvent.setup() };
}

function panel(name = "What happened") {
	return within(screen.getByRole("region", { name }));
}

/** The figure the state panel shows under a term, once the call has returned. */
async function figure(state: ReturnType<typeof panel>, term: string) {
	const dt = await state.findByText(term, { selector: "dt" });
	return dt.nextElementSibling?.textContent;
}

const vendor = (name = "Vendor") =>
	screen.getByRole("combobox", { name }) as HTMLSelectElement;
const amount = (name = "Amount") =>
	screen.getByRole("textbox", { name }) as HTMLInputElement;
const checkbox = (name: string) =>
	screen.getByRole("checkbox", { name }) as HTMLInputElement;
const save = (name = "Save expense") => screen.getByRole("button", { name });

/** The expenses saved in memory, as the page lists them. */
function saved(name = "Saved expenses") {
	const list = screen.queryByRole("list", { name });
	return list
		? within(list)
				.getAllByRole("listitem")
				.map((item) => item.textContent)
		: [];
}

/** What the sentence saved, as the counter beside the box says it; null when it shows none. */
function counter() {
	return screen.queryByText(/^1 (sentence|frase) /)?.textContent ?? null;
}

async function suggest(user: ReturnType<typeof userEvent.setup>, name: string) {
	await user.click(screen.getByRole("button", { name }));
	await screen.findByText(
		/^(Filled:|Nothing filled\.|The request could not|Completado:|Nada completado\.|No se pudo leer)/,
	);
}

async function expectNoAxeViolations(container: Element) {
	// jsdom paints nothing: contrast is checked in the browser.
	const { violations } = await axe.run(container, {
		rules: { "color-contrast": { enabled: false } },
	});
	expect(violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
}

// A Tuesday; "yesterday" is Monday 21 September. Date alone is faked.
beforeEach(() => {
	vi.setSystemTime(new Date("2026-09-22T15:00:00Z"));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	byRequest.calls.length = 0;
});

describe("the demo's card page", () => {
	it("fills the expense card from a suggested request, and saves it only on Save", async () => {
		const { container, user } = renderDemo();

		await suggest(user, "lunch with Larkspur yesterday, $86.40");

		expect(vendor().value).toBe("larkspur");
		expect(checkbox("Meals").checked).toBe(true);
		expect(checkbox("Client").checked).toBe(false);
		expect(
			screen.getByRole("button", { name: "Day Sep 21, 2026" }),
		).toBeDefined();
		expect(amount().value).toBe("86.40");
		expect(
			screen.getByText(
				"Filled: vendor, tags, day, and amount. Nothing left to fill.",
			),
		).toBeDefined();
		expect(saved()).toEqual([]);
		expect(panel().getByText("All 4 fields filled.")).toBeDefined();
		await expectNoAxeViolations(container);

		await user.click(save());

		expect(saved()).toEqual(["Larkspur CateringSep 21, 2026 · Meals$86.40"]);
		expect(screen.getByText("Expense saved.")).toBeDefined();
		expect(vendor().value).toBe("");
		expect(save().getAttribute("aria-disabled")).toBe("true");
		await expectNoAxeViolations(container);
	});

	it("shows the call's latency, input tokens and cost in the hood's strip, when the provider reports them", async () => {
		const { user } = renderDemo({ provider: priced });

		await suggest(user, "lunch with Larkspur yesterday, $86.40");

		const state = panel("This call");
		expect(await figure(state, "Input tokens")).toBe("120");
		expect(await figure(state, "Cost")).toBe("$0.000005");
	});

	it("says in the strip when the provider did not report tokens or cost", async () => {
		const { user } = renderDemo();

		await suggest(user, "lunch with Larkspur yesterday, $86.40");

		const state = panel("This call");
		expect(await figure(state, "Latency")).toMatch(/^\d+ ms$/);
		expect(await figure(state, "Input tokens")).toBe("Not reported");
		expect(await figure(state, "Cost")).toBe("Not reported");
	});

	it("shows the strip in Spanish", async () => {
		const { user } = renderDemo({
			provider: priced,
			url: "/?case=form&lang=es",
		});

		await suggest(user, "almuerzo con Cazuela Azul ayer, $86.40");

		const state = panel("Esta llamada");
		expect(await figure(state, "Tokens de entrada")).toBe("120");
		expect(await figure(state, "Costo")).toBe("0,000005\u00a0US$");
	});

	it("takes the expense back on Undo and puts it on the card again", async () => {
		const { user } = renderDemo();

		await suggest(user, "lunch with Larkspur yesterday, $86.40");
		await user.click(save());
		await user.click(screen.getByRole("button", { name: "Undo" }));

		expect(saved()).toEqual([]);
		expect(vendor().value).toBe("larkspur");
		expect(amount().value).toBe("86.40");
		const box = screen.getByRole("searchbox", { name: "Describe the expense" });
		expect(box.getAttribute("value")).toBe(
			"lunch with Larkspur yesterday, $86.40",
		);
		expect(document.activeElement).toBe(box);
	});

	it("leaves the vendor empty when the request could mean two, for the person to choose", async () => {
		const { container, user } = renderDemo();

		await suggest(user, "lunch with the cleaners yesterday, $40");

		expect(vendor().value).toBe("");
		expect(
			screen.getByText(
				"Filled: tags, day, and amount. For you to fill: vendor.",
			),
		).toBeDefined();
		const held = within(panel().getByRole("region", { name: "Vendor" }));
		expect(held.getByText("Held")).toBeDefined();
		expect(
			held.getByText(
				"A pick (0.48) fell below the gate (0.70), so the field is held.",
			),
		).toBeDefined();
		await expectNoAxeViolations(container);

		await user.selectOptions(vendor(), "brightmop");
		await user.click(save());
		expect(saved()).toEqual(["Brightmop CleaningSep 21, 2026 · Meals$40.00"]);
	});

	it("holds the day for 'last Friday', which reads two ways, whatever its probability", async () => {
		const { user } = renderDemo();

		await suggest(user, "Papergrove toner last Friday, $120");

		expect(
			screen.getByRole("button", { name: "Day Pick a day" }),
		).toBeDefined();
		const day = within(panel().getByRole("region", { name: "Day" }));
		expect(
			day.getByText(
				"“last Friday” reads two ways, so the code held the field whatever its probability.",
			),
		).toBeDefined();
	});

	it("lets the person pick the day from a calendar", async () => {
		const { user } = renderDemo();

		await suggest(user, "Papergrove toner last Friday, $120");
		await user.click(screen.getByRole("button", { name: "Day Pick a day" }));
		const calendar = within(
			screen.getByRole("dialog", { name: "Choose the day" }),
		);
		await user.click(calendar.getByRole("button", { name: "Previous month" }));
		await user.click(calendar.getByRole("button", { name: "Next month" }));
		await user.click(
			calendar.getByRole("button", { name: "Friday, September 18, 2026" }),
		);

		expect(screen.queryByRole("dialog")).toBeNull();
		const day = screen.getByRole("button", { name: "Day Sep 18, 2026" });
		expect(document.activeElement).toBe(day);
		await user.click(save());
		expect(saved()).toEqual([
			"Papergrove SuppliesSep 18, 2026 · Office$120.00",
		]);
	});

	it("moves through the calendar's days with the arrow keys, and closes on Escape", async () => {
		const { user } = renderDemo();

		await suggest(user, "Papergrove toner last Friday, $120");
		await user.click(screen.getByRole("button", { name: "Day Pick a day" }));
		// With no day chosen, the calendar opens on today.
		expect(document.activeElement?.getAttribute("aria-label")).toBe(
			"Tuesday, September 22, 2026",
		);
		await user.keyboard("{ArrowLeft}{ArrowUp}");
		expect(document.activeElement?.getAttribute("aria-label")).toBe(
			"Monday, September 14, 2026",
		);
		await user.keyboard("{Escape}");

		expect(screen.queryByRole("dialog")).toBeNull();
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: "Day Pick a day" }),
		);
	});

	it("fills nothing from a request that is not a new expense, and says why", async () => {
		const { container, user } = renderDemo();

		await suggest(user, "delete yesterday's taxi");

		expect(vendor().value).toBe("");
		expect(
			screen.getByText(
				"Nothing filled. For you to fill: vendor, tags, day, and amount.",
			),
		).toBeDefined();
		const intent = within(
			panel().getByRole("region", { name: "New expense?" }),
		);
		expect(
			intent.getByText(
				"The provider says the request is about an expense but adds none, so every field is held.",
			),
		).toBeDefined();
		expect(
			within(panel().getByRole("region", { name: "Vendor" })).getByText(
				"The request asks for no new expense, so the field is held with the rest.",
			),
		).toBeDefined();
		expect(save().getAttribute("aria-disabled")).toBe("true");
		await expectNoAxeViolations(container);
	});

	it("holds the whole card on a command to an expense already recorded, whatever the pick, and says which words", async () => {
		const { container, user } = renderDemo({ url: "/?case=form&lang=es" });

		await user.type(
			screen.getByRole("searchbox", { name: "Describa el gasto" }),
			"quite el gasto de $58 del Cafetal{Enter}",
		);
		await screen.findByText(/^Nada completado\./);

		expect(vendor("Proveedor").value).toBe("");
		const intent = within(
			panel("Qué pasó").getByRole("region", { name: "¿Gasto nuevo?" }),
		);
		expect(
			intent.getByText(
				"La solicitud actúa sobre un gasto ya registrado (“quite”, “el gasto”), así que el código retuvo todos los campos sin importar la elección.",
			),
		).toBeDefined();
		expect(save("Guardar gasto").getAttribute("aria-disabled")).toBe("true");
		await expectNoAxeViolations(container);
	});

	it("holds the vendor on a named pair, whatever its pick, says which words, and fills the rest", async () => {
		const { container, user } = renderDemo();

		await user.type(
			screen.getByRole("searchbox", { name: "Describe the expense" }),
			"Tallyroot or Cloudberth, $75 yesterday{Enter}",
		);
		await screen.findByText(/^Filled:/);

		expect(vendor().value).toBe("");
		expect(amount().value).toBe("75.00");
		expect(
			within(panel().getByRole("region", { name: "Vendor" })).getByText(
				"The request names two candidates (“Tallyroot or Cloudberth”), so the code held the field whatever the pick.",
			),
		).toBeDefined();
		await expectNoAxeViolations(container);
	});

	it("keeps only a number's characters in the amount box, and empties it when a new answer holds the amount", async () => {
		const { user } = renderDemo();

		await user.type(amount(), "abc");
		expect(amount().value).toBe("");
		await user.type(amount(), ".");
		expect(amount().value).toBe(".");

		await suggest(user, "delete yesterday's taxi");

		expect(amount().value).toBe("");
	});

	it("fills the Spanish card from a Spanish request", async () => {
		const { container, user } = renderDemo({ url: "/?case=form&lang=es" });

		expect(screen.getByRole("heading", { name: "Nuevo gasto" })).toBeDefined();
		await suggest(user, "almuerzo con Cazuela Azul ayer, $86.40");

		expect(vendor("Proveedor").value).toBe("cazuela");
		expect(checkbox("Comidas").checked).toBe(true);
		expect(
			screen.getByText(
				"Completado: proveedor, etiquetas, día y monto. Nada por completar.",
			),
		).toBeDefined();
		const labels = byRequest.calls[0]?.questions
			.find(({ id }) => id === "vendor")
			?.labels.map(({ label }) => label);
		expect(labels).toContain("cazuela");
		expect(labels).not.toContain("larkspur");
		await user.click(save("Guardar gasto"));
		expect(saved("Gastos guardados")).toHaveLength(1);
		expect(screen.getByText("Gasto guardado.")).toBeDefined();
		await expectNoAxeViolations(container);
	});

	it("counts the clicks and menus the filled fields take, a held field none, and shows no comparison when nothing fills", async () => {
		const { user } = renderDemo();
		expect(counter()).toBeNull();

		// The vendor's menu, one tag, the day's calendar and the amount's box.
		await suggest(user, "lunch with Larkspur yesterday, $86.40");
		expect(counter()).toBe("1 sentence vs 6 clicks in 2 menus");

		// The vendor is held: the person still picks it, so it counts nothing.
		await suggest(user, "lunch with the cleaners yesterday, $40");
		expect(counter()).toBe("1 sentence vs 4 clicks in 1 menu");

		// What the person changes afterwards leaves the answer's count as it was.
		await user.click(checkbox("Travel"));
		expect(counter()).toBe("1 sentence vs 4 clicks in 1 menu");

		await suggest(user, "delete yesterday's taxi");
		expect(counter()).toBeNull();
	});

	it("says the count in Spanish", async () => {
		const { user } = renderDemo({ url: "/?case=form&lang=es" });

		await suggest(user, "almuerzo con Cazuela Azul ayer, $86.40");
		expect(counter()).toBe("1 frase frente a 6 clics en 2 menús");
	});

	it("keeps working when the provider fails: the person fills the card by hand", async () => {
		const { container, user } = renderDemo({
			provider: failingProvider(new Error("no key")),
		});

		await suggest(user, "lunch with Larkspur yesterday, $86.40");

		expect(await panel().findByText("Failed")).toBeDefined();
		expect(
			panel().getByText(
				"The provider failed, so nothing is shown. The server log has the details.",
			),
		).toBeDefined();
		expect(
			screen.getByText(
				"The request could not be read, so the card stays as it was. Fill it in by hand.",
			),
		).toBeDefined();
		await expectNoAxeViolations(container);
		await user.selectOptions(vendor(), "larkspur");
		await user.type(amount(), "86.4");
		await user.click(save());
		expect(saved()).toEqual(["Larkspur Catering$86.40"]);
	});
});
