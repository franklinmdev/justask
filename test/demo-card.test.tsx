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
import { useState } from "react";
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
import { DayPicker } from "../demo/src/day-picker.tsx";
import {
	counter,
	description,
	expectNoAxeViolations,
	figure,
	warmUp,
} from "./checks.ts";
import {
	type FakeAnswers,
	failingProvider,
	fakeProvider,
	perRequest,
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
	// "last week" is a period, not one day, so the day is held whatever its probability, on any day.
	"Papergrove toner last week, $120": answer({
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
	// Copying someone on a recorded expense, read as a new one: the code holds it (#99).
	"cópiale a contabilidad la factura de $210 de Lindero": answer({
		vendor: question(vendors, "lindero"),
		tagged: ["office"],
		amount: "a0",
	}),
	// A named pair, its vendor picked above the gate: the code holds it.
	"Tallyroot or Cloudberth, $75 yesterday": answer({
		vendor: question(vendors, "tallyroot"),
		tagged: ["office"],
		day: "d0",
		amount: "a0",
	}),
	// A vendor that sells office services alone, and no tag asked for: the
	// vendor fills office (ADR 0012).
	"Brightmop carpet shampoo yesterday, $140": answer({
		vendor: question(vendors, "brightmop"),
		day: "d0",
		amount: "a0",
	}),
	"champú de alfombras de Brisamar ayer, $140": answer({
		vendor: question(vendors, "brisamar"),
		day: "d0",
		amount: "a0",
	}),
	// The same vendor, but the provider tagged it meals: the vendor adds nothing.
	"lunch with the Brightmop crew yesterday, $60": answer({
		vendor: question(vendors, "brightmop"),
		tagged: ["meals"],
		day: "d0",
		amount: "a0",
	}),
	"almuerzo con el equipo de Brisamar ayer, $60": answer({
		vendor: question(vendors, "brisamar"),
		tagged: ["meals"],
		day: "d0",
		amount: "a0",
	}),
	"airport taxi yesterday, 42 euros": answer({
		tagged: ["travel"],
		day: "d0",
		amount: "a0",
	}),
	"taxi al aeropuerto ayer, 42 euros": answer({
		tagged: ["travel"],
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

const vendor = (name = "Vendor") =>
	screen.getByRole("combobox", { name }) as HTMLSelectElement;
/** The amount box, by its name: its label and its currency (#164). */
const amount = (name = "Amount, US Dollar") =>
	screen.getByRole("textbox", { name }) as HTMLInputElement;
const checkbox = (name: string) =>
	screen.getByRole("checkbox", { name }) as HTMLInputElement;
/** The calendar day the focus is on, by its full name. */
const focusedDay = () => document.activeElement?.getAttribute("aria-label");
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

async function suggest(user: ReturnType<typeof userEvent.setup>, name: string) {
	await user.click(screen.getByRole("button", { name }));
	await screen.findByText(
		/^(Filled:|Nothing filled\.|The request could not|Completado:|Nada completado\.|No se pudo leer)/,
	);
}

beforeAll(() => warmUp(() => renderDemo()));

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
		const { user } = renderDemo();

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

		await user.click(save());

		expect(saved()).toEqual(["Larkspur CateringSep 21, 2026 · Meals$86.40"]);
		expect(screen.getByText("Expense saved.")).toBeDefined();
		expect(vendor().value).toBe("");
		expect(save().getAttribute("aria-disabled")).toBe("true");
	});

	// Its own test, apart from the fill and the Save: a whole-page axe run was about
	// half of that test's time under load, and ran it past its 5 s (#120).
	it("passes axe once a request has filled the card", async () => {
		const { container, user } = renderDemo();

		await suggest(user, "lunch with Larkspur yesterday, $86.40");

		await expectNoAxeViolations(container);
	});

	it("settles the fields an answer filled in field order, again with the next answer (#123)", async () => {
		const { user } = renderDemo();
		/** Each settling field's label and its place in the order. */
		const settling = () =>
			[...document.querySelectorAll<HTMLElement>(".entry[data-settle]")].map(
				(entry) => [
					entry.querySelector(".entry-label")?.textContent,
					entry.style.getPropertyValue("--settle-at"),
				],
			);

		await suggest(user, "lunch with Larkspur yesterday, $86.40");
		expect(settling()).toEqual([
			["Vendor", "0"],
			["Tags", "1"],
			["Day", "2"],
			["Amount", "3"],
		]);
		const first = vendor().closest(".entry");

		await user.click(
			screen.getByRole("button", {
				name: "Papergrove toner last week, $120",
			}),
		);
		await waitFor(() => expect(vendor().value).toBe("papergrove"));

		// A new field, so its motion runs again; the held day stays still.
		expect(vendor().closest(".entry")).not.toBe(first);
		expect(settling()).toEqual([
			["Vendor", "0"],
			["Tags", "1"],
			["Amount", "2"],
		]);
	});

	// One axe run per test: two in one test ran past its 5 s under load (#116).
	it("passes axe once the expense is saved, its list and Undo on the page", async () => {
		const { container, user } = renderDemo();

		await suggest(user, "lunch with Larkspur yesterday, $86.40");
		await user.click(save());

		expect(saved()).toEqual(["Larkspur CateringSep 21, 2026 · Meals$86.40"]);
		expect(screen.getByRole("button", { name: "Undo" })).toBeDefined();
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
		expect(await figure(state, "Latency")).toMatch(/^\d+\u00a0ms$/);
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

	it("holds the day for 'last week', a period, whatever its probability", async () => {
		const { user } = renderDemo();

		await suggest(user, "Papergrove toner last week, $120");

		expect(
			screen.getByRole("button", { name: "Day Pick a day" }),
		).toBeDefined();
		const day = within(panel().getByRole("region", { name: "Day" }));
		expect(
			day.getByText(
				"“last week” is a period, not one day, so the code held the field.",
			),
		).toBeDefined();
	});

	it("lets the person pick the day from a calendar", async () => {
		const { user } = renderDemo();

		await suggest(user, "Papergrove toner last week, $120");
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

		await suggest(user, "Papergrove toner last week, $120");
		await user.click(screen.getByRole("button", { name: "Day Pick a day" }));
		// With no day chosen, the calendar opens on today.
		expect(focusedDay()).toBe("Tuesday, September 22, 2026");
		await user.keyboard("{ArrowLeft}{ArrowUp}");
		expect(focusedDay()).toBe("Monday, September 14, 2026");
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

	it("holds the card on copying someone on an expense already recorded, a send the label alone left open (#99)", async () => {
		const { user } = renderDemo({ url: "/?case=form&lang=es" });

		await user.type(
			screen.getByRole("searchbox", { name: "Describa el gasto" }),
			"cópiale a contabilidad la factura de $210 de Lindero{Enter}",
		);
		await screen.findByText(/^Nada completado\./);

		expect(vendor("Proveedor").value).toBe("");
		expect(
			within(
				panel("Qué pasó").getByRole("region", { name: "¿Gasto nuevo?" }),
			).getByText(/\(“cópiale”, “la factura”\)/),
		).toBeDefined();
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

	it.each([
		{
			language: "English",
			url: "/?case=form",
			request: "Brightmop carpet shampoo yesterday, $140",
			office: "Office",
			hood: "What happened",
			tags: "Tags",
			reason:
				"Filled from the vendor: every sale at Brightmop Cleaning is tagged office, and no tag's answer said otherwise.",
			source: "from the vendor",
			fromRequest: "from the request",
		},
		{
			language: "Spanish",
			url: "/?case=form&lang=es",
			request: "champú de alfombras de Brisamar ayer, $140",
			office: "Oficina",
			hood: "Qué pasó",
			tags: "Etiquetas",
			reason:
				"Completado desde el proveedor: toda venta de Limpiezas Brisamar lleva la etiqueta oficina, y ninguna respuesta de las etiquetas decía otra cosa.",
			source: "del proveedor",
			fromRequest: "de la solicitud",
		},
	])(
		"tags office from a vendor that sells office services alone, where no tag's answer said otherwise, and says so, in $language",
		async ({
			url,
			request,
			office,
			hood,
			tags,
			reason,
			source,
			fromRequest,
		}) => {
			const { container, user } = renderDemo({ url });

			await user.type(screen.getByRole("searchbox"), `${request}{Enter}`);
			await screen.findByText(/^(Filled:|Completado:)/);

			expect(checkbox(office).checked).toBe(true);
			// The field names the vendor as its source, as the panel does.
			const group = within(screen.getByRole("group", { name: tags }));
			expect(group.getByText(source)).toBeDefined();
			expect(group.queryByText(fromRequest)).toBeNull();
			expect(
				within(panel(hood).getByRole("region", { name: tags })).getByText(
					reason,
				),
			).toBeDefined();
			await expectNoAxeViolations(container);
		},
	);

	it.each([
		{
			language: "English",
			url: "/?case=form",
			request: "lunch with the Brightmop crew yesterday, $60",
			meals: "Meals",
			office: "Office",
			hood: "What happened",
			tags: "Tags",
			reason: /^Every pick cleared the gate/,
			fromRequest: "from the request",
		},
		{
			language: "Spanish",
			url: "/?case=form&lang=es",
			request: "almuerzo con el equipo de Brisamar ayer, $60",
			meals: "Comidas",
			office: "Oficina",
			hood: "Qué pasó",
			tags: "Etiquetas",
			reason: /^Cada elección superó el umbral/,
			fromRequest: "de la solicitud",
		},
	])(
		"adds nothing from the vendor when the provider tagged the expense, in $language",
		async ({
			url,
			request,
			meals,
			office,
			hood,
			tags,
			reason,
			fromRequest,
		}) => {
			const { user } = renderDemo({ url });

			await user.type(screen.getByRole("searchbox"), `${request}{Enter}`);
			await screen.findByText(/^(Filled:|Completado:)/);

			expect(checkbox(meals).checked).toBe(true);
			expect(checkbox(office).checked).toBe(false);
			expect(
				within(screen.getByRole("group", { name: tags })).getByText(
					fromRequest,
				),
			).toBeDefined();
			expect(
				within(panel(hood).getByRole("region", { name: tags })).getByText(
					reason,
				),
			).toBeDefined();
		},
	);

	it("keeps only a number's characters in the amount box, and empties it when a new answer holds the amount", async () => {
		const { user } = renderDemo();

		await user.type(amount(), "abc");
		expect(amount().value).toBe("");
		await user.type(amount(), ".");
		expect(amount().value).toBe(".");

		await suggest(user, "delete yesterday's taxi");

		expect(amount().value).toBe("");
	});

	it.each([
		{
			url: "/?case=form",
			box: "Describe the expense",
			request: "airport taxi yesterday, 42 euros",
			total: "Amount, EUR",
			local: "Amount, US Dollar",
			confirm: "Save expense",
			list: "Saved expenses",
			undo: "Undo",
		},
		{
			url: "/?case=form&lang=es",
			box: "Describa el gasto",
			request: "taxi al aeropuerto ayer, 42 euros",
			total: "Monto, EUR",
			local: "Monto, dólar estadounidense",
			confirm: "Guardar gasto",
			list: "Gastos guardados",
			undo: "Deshacer",
		},
	])(
		"keeps the amount's currency, shown and in the box's name, while its box is emptied, until Save starts the card over ($url)",
		async ({ url, box, request, total, local, confirm, list, undo }) => {
			const { container, user } = renderDemo({ url });
			await user.type(
				screen.getByRole("searchbox", { name: box }),
				`${request}{Enter}`,
			);
			await waitFor(() => expect(amount(total).value).toBe("42.00"));
			expect(screen.getByText("EUR")).toBeDefined();
			await expectNoAxeViolations(container);

			// Emptied, the box holds no amount and still shows its currency.
			await user.clear(amount(total));
			expect(amount(total).value).toBe("");
			expect(screen.getByText("EUR")).toBeDefined();

			await user.type(amount(total), "50");
			await user.click(save(confirm));
			expect(saved(list)).toEqual([expect.stringContaining("50 EUR")]);

			// Saving starts the card over: the box is empty, in the local currency.
			expect(amount(local).value).toBe("");
			expect(screen.queryByText("EUR")).toBeNull();

			// Undo brings the saved amount back, currency and all.
			await user.click(screen.getByRole("button", { name: undo }));
			expect(amount(total).value).toBe("50.00");
			expect(screen.getByText("EUR")).toBeDefined();
		},
	);

	it("drops an emptied box's currency on the next answer, one with no amount or one in the local currency (#160, #164)", async () => {
		const { user } = renderDemo();
		await user.type(
			screen.getByRole("searchbox", { name: "Describe the expense" }),
			"airport taxi yesterday, 42 euros{Enter}",
		);
		await waitFor(() => expect(amount("Amount, EUR").value).toBe("42.00"));
		await user.clear(amount("Amount, EUR"));

		await suggest(user, "delete yesterday's taxi");
		await waitFor(() => expect(amount().value).toBe(""));
		expect(screen.queryByText("EUR")).toBeNull();

		await suggest(user, "lunch with Larkspur yesterday, $86.40");

		await waitFor(() => expect(amount().value).toBe("86.40"));
		expect(screen.queryByText("EUR")).toBeNull();
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
		expect(amount("Monto, dólar estadounidense").value).toBe("");
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

describe("the demo's day picker, alone", () => {
	it("moves the focus with a key that lands before another render's effects run (#153)", async () => {
		let setNote: (note: string) => void = () => {};
		function Field() {
			const [note, changeNote] = useState("");
			// Leaked out of render: act would flush the effects this test must outrun.
			setNote = changeNote;
			return (
				<>
					<span id="day-label">Day{note}</span>
					<DayPicker
						labelId="day-label"
						value={undefined}
						onChange={() => {}}
						copy={english.copy.card}
						locale="en-US"
						format={(iso) => iso}
					/>
				</>
			);
		}
		render(<Field />);
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "Day Pick a day" }));
		await user.keyboard("{ArrowLeft}");
		expect(focusedDay()).toBe("Monday, September 21, 2026");

		// A render the keys did not ask for commits, as a person's page does
		// when an answer arrives, and a key lands before that render's effects
		// run. Outside act, so React schedules the render as a browser would.
		const wasActEnvironment = Reflect.get(
			globalThis,
			"IS_REACT_ACT_ENVIRONMENT",
		);
		Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", false);
		try {
			const observer = new MutationObserver(() => {
				observer.disconnect();
				document.activeElement?.dispatchEvent(
					new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
				);
			});
			observer.observe(document.body, {
				subtree: true,
				childList: true,
				characterData: true,
			});
			setNote(" (edited)");
			await waitFor(() =>
				expect(focusedDay()).toBe("Monday, September 14, 2026"),
			);
		} finally {
			Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", wasActEnvironment);
		}
	});
});

describe("the demo's Fill button and its hint (#147)", () => {
	const box = (name = "Describe the expense") =>
		screen.getByRole("searchbox", { name }) as HTMLInputElement;
	const fill = (name = "Fill the card") => screen.getByRole("button", { name });
	/** The hint the box is described by, or "" with none. */
	const hint = (name?: string) => description(box(name));

	it("fills the card from the button, with one call", async () => {
		const { user } = renderDemo();

		await user.type(box(), "lunch with Larkspur yesterday, $86.40");
		expect(byRequest.calls).toHaveLength(0);
		await user.click(fill());

		await waitFor(() => expect(vendor().value).toBe("larkspur"));
		expect(byRequest.calls).toHaveLength(1);
	});

	it("does nothing on a blank box, and says it is off while still focusable", async () => {
		const { user } = renderDemo();

		expect(fill().getAttribute("aria-disabled")).toBe("true");
		await user.type(box(), "   ");
		expect(fill().getAttribute("aria-disabled")).toBe("true");
		await user.click(fill());
		fill().focus();
		expect(document.activeElement).toBe(fill());
		expect(byRequest.calls).toHaveLength(0);
		expect(hint()).toBe("");
		expect(fill().hasAttribute("data-next")).toBe(false);
	});

	it("hints Enter for a sentence not sent, drops it once sent, and brings it back on a change", async () => {
		const { user } = renderDemo();
		expect(hint()).toBe("");

		await user.type(box(), "lunch with Larkspur yesterday, $86.40");
		expect(hint()).toBe("Press Enter to fill the card");
		expect(fill().getAttribute("aria-disabled")).toBe("false");
		expect(fill().hasAttribute("data-next")).toBe(true);

		await user.keyboard("{Enter}");
		expect(hint()).toBe("");
		expect(fill().hasAttribute("data-next")).toBe(false);
		await waitFor(() => expect(vendor().value).toBe("larkspur"));
		expect(hint()).toBe("");

		await user.type(box(), " again");
		expect(hint()).toBe("Press Enter to fill the card");
		expect(fill().hasAttribute("data-next")).toBe(true);
	});

	it("is no live region, so a keystroke announces nothing", async () => {
		const { user } = renderDemo();

		await user.type(box(), "lunch");
		const described = document.getElementById(
			box().getAttribute("aria-describedby") ?? "",
		);
		expect(described?.closest("[role=status], [aria-live]")).toBeNull();
	});

	it("says nothing unsent once the saved expense is put back on Undo", async () => {
		const { user } = renderDemo();

		await suggest(user, "lunch with Larkspur yesterday, $86.40");
		await user.click(save());
		expect(hint()).toBe("");
		await user.click(screen.getByRole("button", { name: "Undo" }));

		expect(box().value).toBe("lunch with Larkspur yesterday, $86.40");
		expect(hint()).toBe("");
		expect(fill().hasAttribute("data-next")).toBe(false);
	});

	it("hints again for the same sentence typed for the next expense, once the last is saved", async () => {
		const { user } = renderDemo();

		await suggest(user, "lunch with Larkspur yesterday, $86.40");
		await user.click(save());
		await user.type(box(), "lunch with Larkspur yesterday, $86.40");

		expect(hint()).toBe("Press Enter to fill the card");
		expect(fill().hasAttribute("data-next")).toBe(true);
	});

	it("names the button and the hint in Spanish", async () => {
		const { user } = renderDemo({ url: "/?case=form&lang=es" });
		const caja = () => box("Describa el gasto");
		expect(fill("Completar la tarjeta").getAttribute("aria-disabled")).toBe(
			"true",
		);

		await user.type(caja(), "almuerzo con Cazuela Azul ayer, $86.40");
		expect(hint("Describa el gasto")).toBe(
			"Presione Enter para completar la tarjeta",
		);
		await user.click(fill("Completar la tarjeta"));

		await waitFor(() => expect(vendor("Proveedor").value).toBe("cazuela"));
		expect(byRequest.calls).toHaveLength(1);
		expect(hint("Describa el gasto")).toBe("");
	});

	it("names Go on a phone keyboard's key", () => {
		renderDemo();

		expect(box().getAttribute("enterkeyhint")).toBe("go");
	});
});

describe("the demo's card page on Cloudflare's CPU limit", () => {
	/**
	 * The demo as the browser runs it, where Cloudflare answers the first
	 * `pages` requests itself with `status` and `body`, as it does when the
	 * Worker runs out of CPU (error 1102), and the handler after that.
	 */
	function renderLimited(pages: number, status: number, body: string) {
		history.replaceState(null, "", "/?case=form");
		const handler = createDemoHandler(byRequest);
		const sent: string[] = [];
		render(
			<App
				fetch={async (input, init) => {
					sent.push(String(input));
					if (sent.length <= pages) {
						return new Response(body, {
							status,
							headers: { "content-type": "text/plain; charset=UTF-8" },
						});
					}
					return handler(
						new Request(new URL(String(input), location.href), init),
					);
				}}
				recordings={null}
			/>,
		);
		return { sent, user: userEvent.setup() };
	}

	it("sends a request Cloudflare stopped on the CPU limit once more, and fills the card", async () => {
		const { sent, user } = renderLimited(1, 503, "error code: 1102");

		await suggest(user, "lunch with Larkspur yesterday, $86.40");

		expect(vendor().value).toBe("larkspur");
		expect(sent).toEqual(["/api/card/en", "/api/card/en"]);
		expect(byRequest.calls).toHaveLength(1);
	});

	it("shows the usual error when the second try is stopped too, with no third", async () => {
		const { sent, user } = renderLimited(2, 503, "error code: 1102");

		await suggest(user, "lunch with Larkspur yesterday, $86.40");

		expect(
			screen.getByText(
				"The request could not be read, so the card stays as it was. Fill it in by hand.",
			),
		).toBeDefined();
		expect(sent).toHaveLength(2);
		expect(byRequest.calls).toHaveLength(0);
	});

	it("sends any other failure of Cloudflare's once, as before", async () => {
		const { sent, user } = renderLimited(1, 503, "error code: 1027");

		await suggest(user, "lunch with Larkspur yesterday, $86.40");

		expect(sent).toHaveLength(1);
		expect(vendor().value).toBe("");
	});
});
