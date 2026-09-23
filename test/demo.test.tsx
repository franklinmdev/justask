// @vitest-environment jsdom
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import axe from "axe-core";
import type { Provider } from "justask";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoHandler } from "../demo/server/handler.ts";
import { App } from "../demo/src/app.tsx";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
import {
	type FakeAnswers,
	failingProvider,
	fakeProvider,
} from "./fake-provider.ts";

/** Every vendor of both sets at zero, so the fake answers any shortlist. */
const nobody = Object.fromEntries(
	[...english.vendors, ...spanish.vendors].map(({ id }) => [id, 0]),
);

function answer(probabilities: Record<string, number>): FakeAnswers {
	return { search: { ...nobody, ...probabilities } };
}

const answers: Record<string, FakeAnswers> = {
	"the catering people": answer({
		larkspur: 0.94,
		papergrove: 0.03,
		none: 0.01,
	}),
	"the cleaners": answer({ brightmop: 0.21, glasswell: 0.15, none: 0.61 }),
	"los del catering": answer({ cazuela: 0.92, none: 0.02 }),
	"the plumber who fixed the leak": answer({
		none: 0.45,
		brightmop: 0.3,
		glasswell: 0.25,
	}),
};

const byRequest = fakeProvider((request) => {
	const fixture = answers[request];
	if (!fixture) throw new Error(`no fixture for "${request}"`);
	return fixture;
});

/** The demo as the browser runs it, its handler served in process. */
function renderDemo({
	provider = byRequest,
	url = "/",
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

function panel() {
	return within(screen.getByRole("region", { name: "What happened" }));
}

async function expectNoAxeViolations(container: Element) {
	// jsdom paints nothing: contrast is checked in the browser.
	const { violations } = await axe.run(container, {
		rules: { "color-contrast": { enabled: false } },
	});
	expect(violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
}

afterEach(() => {
	cleanup();
	byRequest.calls.length = 0;
});

describe("the demo's search page", () => {
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
				"Larkspur Catering won, and none (0.01) stayed below the gate (0.50).",
			),
		).toBeDefined();
		const row = state.getByRole("row", { name: /Larkspur Catering/ });
		expect(within(row).getByText("0.94")).toBeDefined();
		expect(within(row).getByText("pick")).toBeDefined();
		expect(state.getByRole("row", { name: /none/ })).toBeDefined();
		// The shortlist, not the whole catalog, reaches the provider.
		expect(state.getAllByRole("row")).toHaveLength(1 + 10 + 1);
		await expectNoAxeViolations(container);
	});

	it("holds a request that could mean two vendors, and says none reached the gate", async () => {
		const { container, user } = renderDemo();

		await user.click(screen.getByRole("button", { name: "the cleaners" }));

		expect(
			await screen.findByText("No vendor fits that request."),
		).toBeDefined();
		const state = panel();
		expect(state.getByText("Held")).toBeDefined();
		expect(
			state.getByText(
				"none (0.61) reached the gate (0.50), so nothing is shown.",
			),
		).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /Brightmop Cleaning/ }),
		).toBeNull();
		await expectNoAxeViolations(container);
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
			state.getByText("The provider picked none (0.45), so nothing is shown."),
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

	it("hands the chosen vendor to the app, which lists its transactions", async () => {
		const { user } = renderDemo();

		await user.click(
			screen.getByRole("button", { name: "the catering people" }),
		);
		await user.click(
			await screen.findByRole("button", { name: /Larkspur Catering/ }),
		);

		const table = screen.getByRole("table", {
			name: "Transactions with Larkspur Catering",
		});
		expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
	});

	it("switches the UI text, the suggested requests and the data to Spanish", async () => {
		const { container, user } = renderDemo();

		await user.click(screen.getByRole("link", { name: "Español" }));

		expect(document.documentElement.lang).toBe("es");
		expect(location.search).toBe("?lang=es");
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
		renderDemo({ url: "/?lang=es" });

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
		expect(state.getAllByRole("row")).toHaveLength(1 + 10 + 1);
		expect(state.queryByText("0.00")).toBeNull();
		await waitFor(() =>
			expect(screen.getByText("No vendor fits that request.")).toBeDefined(),
		);
		await expectNoAxeViolations(container);
	});
});
