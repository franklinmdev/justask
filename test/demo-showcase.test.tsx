// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoHandler } from "../demo/server/handler.ts";
import { App } from "../demo/src/app.tsx";
import { failingProvider } from "./fake-provider.ts";

/** The width the page reads: desktop unless a test narrows it to a phone. */
function setWidth(width: number) {
	window.matchMedia = (query: string) => {
		const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
		return {
			matches: width >= min,
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		};
	};
}

/** The shell needs no answer: the provider fails, and nothing here calls it. */
function renderDemo({ url = "/", width = 1280 } = {}) {
	setWidth(width);
	history.replaceState(null, "", url);
	const handler = createDemoHandler(failingProvider(new Error("no call")));
	const { container } = render(
		<App
			fetch={(input, init) =>
				handler(new Request(new URL(String(input), location.href), init))
			}
		/>,
	);
	return { container, user: userEvent.setup() };
}

function tab(name: string) {
	return screen.getByRole("tab", { name });
}

/** The hood, found by role alone: a hidden element has no accessible name. */
function hood() {
	return screen.getByRole("complementary", { hidden: true });
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
	// @ts-expect-error jsdom has no matchMedia of its own.
	delete window.matchMedia;
});

describe("the demo's showcase page", () => {
	it("opens on the Table case, with the three cases as tabs", async () => {
		const { container } = renderDemo();

		const cases = screen.getByRole("tablist", { name: "Cases" });
		expect(
			within(cases)
				.getAllByRole("tab")
				.map((option) => option.textContent),
		).toEqual(["Table", "Form", "Search"]);
		expect(tab("Table").getAttribute("aria-selected")).toBe("true");
		expect(
			screen.getByRole("tabpanel", { name: "Table" }).textContent,
		).toContain("Transactions");
		expect(document.title).toBe("Table · justask demo");
		await expectNoAxeViolations(container);
	});

	it("keeps the case and the language in the URL, and back and forward move between them", async () => {
		const { user } = renderDemo({ url: "/?lang=es" });

		await user.click(tab("Formulario"));
		expect(location.search).toBe("?case=form&lang=es");
		expect(screen.getByRole("heading", { name: "Nuevo gasto" })).toBeDefined();

		await user.click(tab("Búsqueda"));
		expect(location.search).toBe("?case=search&lang=es");
		expect(screen.getByRole("heading", { name: "Proveedores" })).toBeDefined();

		await user.click(screen.getByRole("link", { name: "English" }));
		expect(location.search).toBe("?case=search");
		expect(tab("Search").getAttribute("aria-selected")).toBe("true");

		await act(async () => {
			history.back();
			await new Promise((resolve) =>
				addEventListener("popstate", resolve, { once: true }),
			);
		});
		expect(tab("Búsqueda").getAttribute("aria-selected")).toBe("true");

		await act(async () => {
			history.back();
			await new Promise((resolve) =>
				addEventListener("popstate", resolve, { once: true }),
			);
		});
		expect(tab("Formulario").getAttribute("aria-selected")).toBe("true");

		await act(async () => {
			history.forward();
			await new Promise((resolve) =>
				addEventListener("popstate", resolve, { once: true }),
			);
		});
		expect(tab("Búsqueda").getAttribute("aria-selected")).toBe("true");
	});

	it("opens the case the link names", () => {
		renderDemo({ url: "/?case=form" });

		expect(tab("Form").getAttribute("aria-selected")).toBe("true");
		expect(screen.getByRole("heading", { name: "New expense" })).toBeDefined();
	});

	it("moves between the tabs with the arrow keys, Home and End, one tab stop for all three", async () => {
		const { user } = renderDemo();

		expect(tab("Table").tabIndex).toBe(0);
		expect(tab("Form").tabIndex).toBe(-1);
		expect(tab("Search").tabIndex).toBe(-1);

		tab("Table").focus();
		await user.keyboard("{ArrowRight}");
		expect(document.activeElement).toBe(tab("Form"));
		expect(tab("Form").getAttribute("aria-selected")).toBe("true");
		expect(location.search).toBe("?case=form");

		await user.keyboard("{End}");
		expect(document.activeElement).toBe(tab("Search"));
		await user.keyboard("{ArrowRight}");
		expect(document.activeElement).toBe(tab("Table"));
		await user.keyboard("{ArrowLeft}");
		expect(document.activeElement).toBe(tab("Search"));
		await user.keyboard("{Home}");
		expect(document.activeElement).toBe(tab("Table"));
		expect(location.search).toBe("");
	});

	it("shows the hood beside the app on desktop, open, and the toggle hides and shows it", async () => {
		const { container, user } = renderDemo();

		const toggle = screen.getByRole("button", { name: "Under the hood" });
		expect(toggle.getAttribute("aria-expanded")).toBe("true");
		expect(hood().hidden).toBe(false);
		expect(screen.queryByRole("group", { name: "Show" })).toBeNull();

		await user.click(toggle);
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(hood().hidden).toBe(true);

		await user.click(toggle);
		expect(hood().hidden).toBe(false);
		await expectNoAxeViolations(container);
	});

	it("keeps the hood's place across the cases", async () => {
		const { user } = renderDemo();

		await user.click(screen.getByRole("button", { name: "Under the hood" }));
		await user.click(tab("Search"));

		expect(
			screen
				.getByRole("button", { name: "Under the hood" })
				.getAttribute("aria-expanded"),
		).toBe("false");
	});

	it("switches between the app and the hood on a phone, the app first", async () => {
		const { container, user } = renderDemo({ width: 390 });

		const show = screen.getByRole("group", { name: "Show" });
		const app = within(show).getByRole("button", { name: "App" });
		const under = within(show).getByRole("button", { name: "Under the hood" });
		expect(app.getAttribute("aria-pressed")).toBe("true");
		expect(under.getAttribute("aria-pressed")).toBe("false");
		expect(hood().hidden).toBe(true);
		expect(screen.getByRole("region", { name: "Transactions" }).hidden).toBe(
			false,
		);

		await user.click(under);
		expect(under.getAttribute("aria-pressed")).toBe("true");
		expect(hood().hidden).toBe(false);
		expect(
			screen
				.getByRole("heading", { name: "Transactions", hidden: true })
				.closest("section")?.hidden,
		).toBe(true);
		await expectNoAxeViolations(container);

		await user.click(app);
		expect(hood().hidden).toBe(true);
	});

	it("names the switch in Spanish", () => {
		renderDemo({ url: "/?lang=es", width: 390 });

		const show = screen.getByRole("group", { name: "Mostrar" });
		expect(
			within(show)
				.getAllByRole("button")
				.map((option) => option.textContent),
		).toEqual(["Aplicación", "Bajo el capó"]);
	});

	it.each([
		["table", "Table"],
		["form", "Form"],
		["search", "Search"],
	])("puts the %s case's state panel in the hood's Trace tab", (id, name) => {
		renderDemo({ url: `/?case=${id}` });

		expect(tab(name).getAttribute("aria-selected")).toBe("true");
		const under = within(hood());
		expect(
			under.getByRole("tab", { name: "Trace" }).getAttribute("aria-selected"),
		).toBe("true");
		const trace = within(under.getByRole("tabpanel", { name: "Trace" }));
		expect(trace.getByRole("region", { name: "What happened" })).toBeDefined();
	});
});
