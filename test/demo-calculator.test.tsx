// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import axe from "axe-core";
import type { Provider } from "justask";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoHandler } from "../demo/server/handler.ts";
import { App } from "../demo/src/app.tsx";
import { monthlyCost, PRICE } from "../demo/src/calculator.tsx";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
import { type FakeAnswers, fakeProvider } from "./fake-provider.ts";

/** Every vendor of both sets and several at zero, so the fake answers any shortlist. */
const nobody = {
	...Object.fromEntries(
		[...english.vendors, ...spanish.vendors].map(({ id }) => [id, 0]),
	),
	several: 0,
};

const answers: Record<string, FakeAnswers> = {
	"the catering people": {
		search: { ...nobody, larkspur: 0.94, papergrove: 0.03, none: 0.01 },
	},
	"los del catering": { search: { ...nobody, cazuela: 0.92, none: 0.02 } },
};

function fixtureFor(request: string): FakeAnswers {
	const fixture = answers[request];
	if (!fixture) throw new Error(`no fixture for "${request}"`);
	return fixture;
}

/** A provider that reports what each call cost. */
const priced = fakeProvider(fixtureFor, {
	costUsd: 0.000005,
	inputTokens: 120,
});

/** The same answers, from a provider that reports neither figure. */
const unpriced = fakeProvider(fixtureFor);

/** The demo as the browser runs it, its handler served in process. */
function renderDemo({
	provider = priced,
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

function calculator(name = "Cost per month") {
	return within(screen.getByRole("region", { name }));
}

/** Intl puts a no-break space between a Spanish amount and its currency. */
function text(element: Element | null | undefined) {
	return element?.textContent?.replace(/\s/g, " ");
}

/** The figure the calculator shows under a term. */
function figure(term: string, name?: string) {
	return text(
		calculator(name).getByText(term, { selector: "dt" }).nextElementSibling,
	);
}

function month(name?: string) {
	return text(calculator(name).getByRole("status"));
}

async function expectNoAxeViolations(container: Element) {
	// jsdom paints nothing: contrast is checked in the browser.
	const { violations } = await axe.run(container, {
		rules: { "color-contrast": { enabled: false } },
	});
	expect(violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
}

afterEach(cleanup);

describe("the showcase's cost calculator", () => {
	it("scales one call to a month: users, times actions a day, times the cost per call, times 30 days", () => {
		expect(
			monthlyCost({ users: 1000, actionsPerDay: 10, costPerCall: 0.000005 }),
		).toBeCloseTo(1.5, 12);
		expect(
			monthlyCost({ users: 250, actionsPerDay: 4, costPerCall: 0.0002 }),
		).toBeCloseTo(6, 12);
		expect(
			monthlyCost({ users: 0, actionsPerDay: 10, costPerCall: 0.0002 }),
		).toBe(0);
	});

	it("says, before any call, that the month is priced after it", async () => {
		const { container } = renderDemo();

		expect(figure("Cost per call")).toBe("No call yet");
		expect(figure("Per month")).toBe("Not priced");
		expect(
			calculator().getByText("The month is priced after the first call."),
		).toBeDefined();
		expect(calculator().queryByRole("status")).toBeNull();
		await expectNoAxeViolations(container);
	});

	it("prices a month from the displayed run's measured cost, and updates as users and actions change", async () => {
		const { container, user } = renderDemo();

		await user.click(
			screen.getByRole("button", { name: "the catering people" }),
		);

		await calculator().findByRole("status");
		expect(figure("Cost per call")).toBe("$0.000005");
		// 1,000 users, times 10 actions a day, times $0.000005, times 30 days.
		expect(month()).toBe("$1.50");
		expect(
			calculator().getByText("1,000 × 10 × $0.000005 × 30 days"),
		).toBeDefined();

		const users = calculator().getByRole("textbox", { name: "Users" });
		await user.clear(users);
		await user.type(users, "20000");
		expect(month()).toBe("$30.00");

		const actions = calculator().getByRole("textbox", {
			name: "Actions per person a day",
		});
		await user.clear(actions);
		await user.type(actions, "3");
		expect(month()).toBe("$9.00");
		expect(
			calculator().getByText("20,000 × 3 × $0.000005 × 30 days"),
		).toBeDefined();
		await expectNoAxeViolations(container);
	});

	it("takes users and actions from the person, never the cost per call", () => {
		renderDemo();

		expect(
			calculator()
				.getAllByRole("textbox")
				.map((input) => input.getAttribute("name")),
		).toEqual(["users", "actions"]);
	});

	it("keeps only digits in the inputs, and prices nothing while one is empty", async () => {
		const { user } = renderDemo();
		await user.click(
			screen.getByRole("button", { name: "the catering people" }),
		);
		await calculator().findByRole("status");

		const users = calculator().getByRole("textbox", { name: "Users" });
		await user.clear(users);
		await user.type(users, "2,5a0");
		expect((users as HTMLInputElement).value).toBe("250");

		await user.clear(users);
		expect(calculator().queryByRole("status")).toBeNull();
		expect(users.getAttribute("aria-invalid")).toBe("true");
		expect(
			calculator().getByText("Enter a whole number to price the month."),
		).toBeDefined();
	});

	it("says the month cannot be priced when the provider did not report the call's cost", async () => {
		const { container, user } = renderDemo({ provider: unpriced });

		await user.click(
			screen.getByRole("button", { name: "the catering people" }),
		);

		expect(
			await calculator().findByText(
				"The provider did not report this call's cost, so the month cannot be priced.",
			),
		).toBeDefined();
		expect(figure("Cost per call")).toBe("Not reported");
		expect(calculator().queryByRole("status")).toBeNull();
		await expectNoAxeViolations(container);
	});

	it("shows where the price comes from and the day it was read", () => {
		renderDemo();

		expect(
			calculator().getByText(
				/The cost per call is the displayed run's measured cost\./,
			),
		).toBeDefined();
		const source = calculator().getByRole("link", {
			name: "docs.typesafe.ai/models",
		});
		expect(source.getAttribute("href")).toBe(PRICE.source);
		expect(
			calculator().getByText(/\$0\.042 per million input tokens/),
		).toBeDefined();
		expect(calculator().getByText(/Sep 23, 2026/)).toBeDefined();
	});

	it("keeps users and actions across the cases", async () => {
		const { user } = renderDemo();

		const users = calculator().getByRole("textbox", { name: "Users" });
		await user.clear(users);
		await user.type(users, "42");
		await user.click(screen.getByRole("tab", { name: "Form" }));

		expect(
			(calculator().getByRole("textbox", { name: "Users" }) as HTMLInputElement)
				.value,
		).toBe("42");
	});

	it("formats the month in Spanish", async () => {
		const { container, user } = renderDemo({ url: "/?case=search&lang=es" });

		await user.click(screen.getByRole("button", { name: "los del catering" }));

		const region = "Costo por mes";
		await calculator(region).findByRole("status");
		expect(figure("Costo por llamada", region)).toBe("0,000005 US$");
		expect(month(region)).toBe("1,50 US$");
		expect(
			calculator(region).getByText("1000 × 10 × 0,000005 US$ × 30 días"),
		).toBeDefined();
		expect(
			calculator(region).getByRole("textbox", { name: "Usuarios" }),
		).toBeDefined();
		expect(calculator(region).getByText(/23 sept 2026/)).toBeDefined();
		await expectNoAxeViolations(container);
	});
});
