// @vitest-environment jsdom
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { Provider } from "justask";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoHandler } from "../demo/server/handler.ts";
import { App } from "../demo/src/app.tsx";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
import { counter, expectNoAxeViolations, figure } from "./checks.ts";
import {
	type FakeAnswers,
	failingProvider,
	fakeProvider,
	perRequest,
} from "./fake-provider.ts";

/** Every vendor of both sets and several at zero, so the fake answers any shortlist. */
const nobody = {
	...Object.fromEntries(
		[...english.vendors, ...spanish.vendors].map(({ id }) => [id, 0]),
	),
	several: 0,
};

function answer(probabilities: Record<string, number>): FakeAnswers {
	return { search: { ...nobody, ...probabilities } };
}

const answers: Record<string, FakeAnswers> = {
	"the catering people": answer({
		larkspur: 0.94,
		papergrove: 0.03,
		none: 0.01,
	}),
	"the cleaners": answer({
		brightmop: 0.3,
		glasswell: 0.25,
		none: 0.02,
		several: 0.43,
	}),
	"how much do we owe in total?": answer({
		none: 0.61,
		papergrove: 0.2,
		larkspur: 0.19,
	}),
	// A named pair: Papergrove wins outright, and the code holds it anyway.
	"the Papergrove or Larkspur invoice": answer({
		papergrove: 0.9,
		larkspur: 0.07,
		none: 0.01,
		several: 0.02,
	}),
	// Several wins, below the demo's gate of 0.15, spread over the catalog.
	"the paper or the catering invoice": answer({
		several: 0.13,
		none: 0.03,
		papergrove: 0.12,
		larkspur: 0.12,
		brightmop: 0.12,
		glasswell: 0.12,
		fixbright: 0.12,
		cloudberth: 0.12,
		swiftlane: 0.12,
	}),
	"los del catering": answer({ cazuela: 0.92, none: 0.02 }),
	// None wins, below the demo's gate of 0.15, spread over the catalog.
	"the plumber who fixed the leak": answer({
		none: 0.13,
		brightmop: 0.12,
		glasswell: 0.12,
		fixbright: 0.12,
		papergrove: 0.12,
		cloudberth: 0.12,
		swiftlane: 0.12,
		larkspur: 0.12,
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
	url = "/?case=search",
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

/** One of the hood's tabs, and the panel it shows once chosen. */
async function hoodView(
	user: ReturnType<typeof userEvent.setup>,
	name: string,
) {
	await user.click(screen.getByRole("tab", { name }));
	return within(screen.getByRole("tabpanel", { name }));
}

afterEach(() => {
	cleanup();
	byRequest.calls.length = 0;
});

describe("the demo's Search case", () => {
	it("finds the vendor a suggested request names, and shows why in the state panel", async () => {
		const { container, user } = renderDemo();

		await user.click(
			screen.getByRole("button", { name: "the catering people" }),
		);

		expect(
			await screen.findByRole("button", { name: /Larkspur Catering/ }),
		).toBeDefined();
		expect(screen.getByRole("searchbox").getAttribute("value")).toBe(
			"the catering people",
		);
		const state = panel();
		expect(state.getByText("Filled")).toBeDefined();
		expect(
			state.getByText(
				"Larkspur Catering won, and none (0.01) and several (0.00) stayed below the gate (0.15).",
			),
		).toBeDefined();
		const row = state.getByRole("row", { name: /Larkspur Catering/ });
		expect(within(row).getByText("0.94")).toBeDefined();
		expect(within(row).getByText("pick")).toBeDefined();
		expect(state.getByRole("row", { name: /none/ })).toBeDefined();
		expect(state.getByRole("row", { name: /several/ })).toBeDefined();
		// The shortlist is the whole catalog of 14, plus none and several.
		expect(state.getAllByRole("row")).toHaveLength(1 + 14 + 2);
		await expectNoAxeViolations(container);
	});

	it("shows the call's latency, input tokens and cost in the hood's strip, when the provider reports them", async () => {
		const { container, user } = renderDemo({ provider: priced });

		await user.click(
			screen.getByRole("button", { name: "the catering people" }),
		);

		const state = panel("This call");
		expect(await figure(state, "Input tokens")).toBe("120");
		expect(await figure(state, "Cost")).toBe("$0.000005");
		expect(await figure(state, "Latency")).toMatch(/^\d+ ms$/);
		await expectNoAxeViolations(container);
	});

	it("says in the strip when the provider did not report tokens or cost", async () => {
		const { user } = renderDemo();

		await user.click(
			screen.getByRole("button", { name: "the catering people" }),
		);

		const state = panel("This call");
		expect(await figure(state, "Latency")).toMatch(/^\d+ ms$/);
		expect(await figure(state, "Input tokens")).toBe("Not reported");
		expect(await figure(state, "Cost")).toBe("Not reported");
	});

	it("shows the strip in Spanish", async () => {
		const { user } = renderDemo({
			provider: priced,
			url: "/?case=search&lang=es",
		});

		await user.click(screen.getByRole("button", { name: "los del catering" }));

		const state = within(screen.getByRole("region", { name: "Esta llamada" }));
		expect(await figure(state, "Tokens de entrada")).toBe("120");
		expect(await figure(state, "Costo")).toBe("0,000005\u00a0US$");
	});

	it("shows the displayed call's result in the JSON tab, as the hook hands it to the app", async () => {
		const { container, user } = renderDemo();

		const json = await hoodView(user, "JSON");
		// The JSON tab's result, parsed.
		const shown = () =>
			JSON.parse(
				json.getByRole("figure", { name: "search.result" }).querySelector("pre")
					?.textContent ?? "",
			);
		expect(
			json.getByText("The result shows here after the first call."),
		).toBeDefined();

		await user.click(
			screen.getByRole("button", { name: "the catering people" }),
		);
		await screen.findByRole("button", { name: /Larkspur Catering/ });

		const result = shown();
		expect(result.item.name).toBe("Larkspur Catering");
		expect(result.pick).toEqual({ label: "larkspur", probability: 0.94 });
		expect(result.gate).toBe(0.15);
		await expectNoAxeViolations(container);

		await user.click(screen.getByRole("button", { name: "the cleaners" }));
		await screen.findByText("No vendor fits that request.");

		const next = shown();
		expect(next.item).toBeNull();
		expect(next.probabilities.several).toBe(0.43);
	});

	it("keeps the latency of a call that never reached the handler, with no tokens or cost", async () => {
		history.replaceState(null, "", "/?case=search");
		render(
			<App
				fetch={() => Promise.reject(new TypeError("offline"))}
				recordings={null}
			/>,
		);
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: "the catering people" }),
		);

		const state = panel("This call");
		expect(await figure(state, "Latency")).toMatch(/^\d+ ms$/);
		expect(await figure(state, "Input tokens")).toBe("Not reported");
		const json = await hoodView(user, "JSON");
		expect(
			json.getByRole("figure", { name: "search.result" }).textContent,
		).toContain("null");
	});

	it("holds a request that could mean two vendors, and says several reached the gate", async () => {
		const { container, user } = renderDemo();

		await user.click(screen.getByRole("button", { name: "the cleaners" }));

		expect(
			await screen.findByText("No vendor fits that request."),
		).toBeDefined();
		const state = panel();
		expect(state.getByText("Held")).toBeDefined();
		expect(
			state.getByText(
				"several (0.43) reached the gate (0.15), so nothing is shown.",
			),
		).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /Brightmop Cleaning/ }),
		).toBeNull();
		await expectNoAxeViolations(container);
	});

	it("holds a request with nothing to find, and says none reached the gate", async () => {
		const { user } = renderDemo();

		await user.click(
			screen.getByRole("button", { name: "how much do we owe in total?" }),
		);

		expect(
			await screen.findByText("No vendor fits that request."),
		).toBeDefined();
		expect(
			panel().getByText(
				"none (0.61) reached the gate (0.15), so nothing is shown.",
			),
		).toBeDefined();
	});

	it("holds a request that names two vendors whatever the pick, and names them (ADR 0010)", async () => {
		const { user } = renderDemo();

		await user.click(
			screen.getByRole("button", {
				name: "the Papergrove or Larkspur invoice",
			}),
		);

		expect(
			await screen.findByText("No vendor fits that request."),
		).toBeDefined();
		expect(
			panel().getByText(
				"The request names two candidates (“Papergrove or Larkspur”), so the code shows nothing, whatever the pick.",
			),
		).toBeDefined();
	});

	it("says the provider picked several when several wins below the gate", async () => {
		const { user } = renderDemo();

		await user.type(
			screen.getByRole("searchbox"),
			"the paper or the catering invoice",
		);

		expect(
			await screen.findByText("No vendor fits that request."),
		).toBeDefined();
		expect(
			panel().getByText(
				"The provider picked several (0.13), so nothing is shown.",
			),
		).toBeDefined();
	});

	it("says the provider picked none when none wins below the gate", async () => {
		const { user } = renderDemo();

		await user.click(
			screen.getByRole("button", { name: "the plumber who fixed the leak" }),
		);

		expect(
			await screen.findByText("No vendor fits that request."),
		).toBeDefined();
		const state = panel();
		expect(state.getByText("Held")).toBeDefined();
		expect(
			state.getByText("The provider picked none (0.13), so nothing is shown."),
		).toBeDefined();
	});

	it("offers requests with nothing to find beside the ambiguous ones", () => {
		renderDemo();

		for (const group of [
			"Names one vendor",
			"Could mean two",
			"Nothing to find",
		]) {
			const list = screen.getByRole("list", { name: group });
			expect(within(list).getAllByRole("button").length).toBeGreaterThan(0);
		}
	});

	it("shows the found vendor's transactions at once, and choosing the vendor goes to them", async () => {
		const { user } = renderDemo();

		await user.click(
			screen.getByRole("button", { name: "the catering people" }),
		);

		const table = await screen.findByRole("table", {
			name: "Transactions with Larkspur Catering",
		});
		expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
		await user.click(screen.getByRole("button", { name: /Larkspur Catering/ }));
		expect(document.activeElement).toBe(table);
	});

	it("switches the UI text, the suggested requests and the data to Spanish", async () => {
		const { container, user } = renderDemo();

		await user.click(screen.getByRole("link", { name: "Español" }));

		expect(document.documentElement.lang).toBe("es");
		expect(location.search).toBe("?case=search&lang=es");
		expect(screen.getByRole("heading", { name: "Proveedores" })).toBeDefined();
		await user.click(screen.getByRole("button", { name: "los del catering" }));

		expect(
			await screen.findByRole("button", { name: /Banquetes Cazuela Azul/ }),
		).toBeDefined();
		const state = within(screen.getByRole("region", { name: "Qué pasó" }));
		expect(state.getByText("Completado")).toBeDefined();
		const labels = byRequest.calls[0]?.questions[0]?.labels.map(
			({ label }) => label,
		);
		expect(labels).toContain("cazuela");
		expect(labels).not.toContain("larkspur");
		await expectNoAxeViolations(container);
	});

	it("opens in Spanish from the link", () => {
		renderDemo({ url: "/?case=search&lang=es" });

		expect(screen.getByRole("heading", { name: "Proveedores" })).toBeDefined();
		expect(
			screen
				.getByRole("link", { name: "Español" })
				.getAttribute("aria-current"),
		).toBe("true");
	});

	it("calls after a pause in typing", async () => {
		const { user } = renderDemo();

		await user.type(screen.getByRole("searchbox"), "the cleaners");

		expect(
			await screen.findByText("No vendor fits that request."),
		).toBeDefined();
		expect(byRequest.calls.map(({ request }) => request)).toEqual([
			"the cleaners",
		]);
	});

	it("counts the vendor found as a pick from the vendor list, and shows no comparison when the item is held", async () => {
		const { user } = renderDemo();
		expect(counter()).toBeNull();

		await user.click(
			screen.getByRole("button", { name: "the catering people" }),
		);
		await screen.findByRole("button", { name: /Larkspur Catering/ });
		expect(counter()).toBe("1 sentence vs 2 clicks in 1 menu");

		await user.click(screen.getByRole("button", { name: "the cleaners" }));
		await screen.findByText("No vendor fits that request.");
		expect(counter()).toBeNull();
	});

	it("says the count in Spanish", async () => {
		const { user } = renderDemo({ url: "/?case=search&lang=es" });

		await user.click(screen.getByRole("button", { name: "los del catering" }));
		await screen.findByRole("button", { name: /Banquetes Cazuela Azul/ });
		expect(counter()).toBe("1 frase frente a 2 clics en 1 menú");
	});

	it("says the provider failed, and holds the item", async () => {
		const { container, user } = renderDemo({
			provider: failingProvider(new Error("no key")),
		});

		await user.click(
			screen.getByRole("button", { name: "the catering people" }),
		);

		const state = panel();
		expect(await state.findByText("Failed")).toBeDefined();
		expect(
			state.getByText(
				"The provider failed, so nothing is shown. The server log has the details.",
			),
		).toBeDefined();
		// No answer came back, so no candidate shows a probability, not even zero.
		expect(state.getAllByRole("row")).toHaveLength(1 + 14 + 2);
		expect(state.queryByText("0.00")).toBeNull();
		await waitFor(() =>
			expect(screen.getByText("No vendor fits that request.")).toBeDefined(),
		);
		await expectNoAxeViolations(container);
	});
});
