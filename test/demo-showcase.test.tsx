// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
	createDemoHandler,
	demoCard,
	demoFilter,
	demoSearch,
	SHORTLIST_LIMIT,
} from "../demo/server/handler.ts";
import { App } from "../demo/src/app.tsx";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
import { expectNoAxeViolations } from "./checks.ts";
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
			recordings={null}
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

afterEach(() => {
	cleanup();
	// @ts-expect-error jsdom has no matchMedia of its own.
	delete window.matchMedia;
});

/** Back or Forward, as the browser's buttons do, once the page has heard it. */
async function go(way: "back" | "forward") {
	await act(async () => {
		history[way]();
		await new Promise((resolve) =>
			addEventListener("popstate", resolve, { once: true }),
		);
	});
}

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

		await go("back");
		expect(tab("Búsqueda").getAttribute("aria-selected")).toBe("true");

		await go("back");
		expect(tab("Formulario").getAttribute("aria-selected")).toBe("true");

		await go("forward");
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

	it("leaves one history entry however many cases the arrow keys pass", async () => {
		const { user } = renderDemo();
		const entries = history.length;

		tab("Table").focus();
		await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{End}");

		expect(tab("Search").getAttribute("aria-selected")).toBe("true");
		expect(location.search).toBe("?case=search");
		expect(history.length).toBe(entries);
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
		).toEqual(["Aplicación", "Qué pasó por dentro"]);
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

	it("moves between the hood's Trace, JSON and Code tabs by keyboard, one tab stop for all three", async () => {
		const { container, user } = renderDemo();
		const under = within(hood());
		const view = (name: string) => under.getByRole("tab", { name });

		expect(
			within(under.getByRole("tablist", { name: "Views" }))
				.getAllByRole("tab")
				.map((option) => option.textContent),
		).toEqual(["Trace", "JSON", "Code"]);
		expect(view("Trace").tabIndex).toBe(0);
		expect(view("JSON").tabIndex).toBe(-1);
		expect(view("Code").tabIndex).toBe(-1);

		view("Trace").focus();
		await user.keyboard("{ArrowRight}");
		expect(document.activeElement).toBe(view("JSON"));
		expect(view("JSON").getAttribute("aria-selected")).toBe("true");
		expect(under.getByRole("tabpanel", { name: "JSON" })).toBeDefined();
		expect(under.queryByRole("tabpanel", { name: "Trace" })).toBeNull();

		await user.keyboard("{End}");
		expect(document.activeElement).toBe(view("Code"));
		await user.keyboard("{ArrowRight}");
		expect(document.activeElement).toBe(view("Trace"));
		await user.keyboard("{Tab}");
		expect(document.activeElement).toBe(
			under.getByRole("tabpanel", { name: "Trace" }),
		);
		view("Trace").focus();
		await user.keyboard("{ArrowLeft}{Home}{ArrowRight}{ArrowRight}");
		expect(view("Code").getAttribute("aria-selected")).toBe("true");
		expect(view("Code").tabIndex).toBe(0);
		await expectNoAxeViolations(container);
	});

	it("keeps the hood's tab across the cases", async () => {
		const { user } = renderDemo();

		await user.click(within(hood()).getByRole("tab", { name: "Code" }));
		await user.click(tab("Form"));

		expect(
			within(hood())
				.getByRole("tab", { name: "Code" })
				.getAttribute("aria-selected"),
		).toBe("true");
	});

	it("says in the strip, before any call, what it will show", () => {
		renderDemo();

		const strip = within(screen.getByRole("region", { name: "This call" }));
		expect(
			strip.getByText("Latency, tokens and cost show after the first call."),
		).toBeDefined();
	});

	/** The Code tab's two files, as the page shows them. */
	async function snippet(url: string, files: [string, string]) {
		const { container, user } = renderDemo({ url });
		await user.click(
			within(hood()).getByRole("tab", { name: /^(Code|Código)$/ }),
		);
		const [server, client] = files.map(
			(name) =>
				screen.getByRole("figure", { name }).querySelector("pre")
					?.textContent ?? "",
		);
		return { container, server: server ?? "", client: client ?? "" };
	}

	/** Each declared field as the snippet must write it. */
	function expectFields(
		code: string,
		fields: Record<string, { kind: string; description: string; gate: number }>,
	) {
		for (const [name, field] of Object.entries(fields)) {
			expect(code).toContain(`${name}: {`);
			expect(code).toContain(`kind: "${field.kind}"`);
			expect(code).toContain(
				`description: ${JSON.stringify(field.description)}`,
			);
			expect(code).toContain(`gate: ${field.gate}`);
		}
	}

	it.each([
		["en", english],
		["es", spanish],
	] as const)(
		"writes the Table case's code from the demo's own filter, in %s",
		async (language, content) => {
			const { container, server, client } = await snippet(
				`/?lang=${language}`,
				["handler.ts", "Transactions.tsx"],
			);
			const declared = demoFilter(content);

			expect(server).toContain("createFilterHandler<TransactionFields>(");
			expect(server).toContain(JSON.stringify(declared.description));
			expectFields(server, declared.fields);
			expect(server).toContain("shortlist: () => vendors");
			expect(server).toContain("shortlist: () => statuses");
			expect(client).toContain("useFilter<TransactionFields>(");
			expect(client).toContain(`endpoint: "/api/filter/${language}"`);
			expect(client).toContain('timing: { on: "type", debounceMs: 300 }');
			expect(client).toContain(JSON.stringify(content.copy.filter.boxLabel));
			await expectNoAxeViolations(container);
		},
	);

	it.each([
		["en", english],
		["es", spanish],
	] as const)(
		"writes the Form case's code from the demo's own card, in %s",
		async (language, content) => {
			const { server, client } = await snippet(`/?case=form&lang=${language}`, [
				"handler.ts",
				"NewExpense.tsx",
			]);
			const declared = demoCard(content);

			expect(server).toContain("createCardHandler<ExpenseFields>(");
			expect(server).toContain(`gate: ${declared.gate}`);
			expectFields(server, declared.fields);
			expect(server).toContain("several: true");
			expect(server).toContain('reads: "past"');
			expect(server).toContain("shortlist: () => tags");
			expect(client).toContain("useCard<ExpenseFields>(");
			expect(client).toContain(`endpoint: "/api/card/${language}"`);
		},
	);

	it.each([
		["en", english],
		["es", spanish],
	] as const)(
		"writes the Search case's code from the demo's own search, in %s",
		async (language, content) => {
			const { server, client } = await snippet(
				`/?case=search&lang=${language}`,
				["handler.ts", "VendorSearch.tsx"],
			);
			const declared = demoSearch(content);

			expect(server).toContain("createSearchHandler<Vendor>(");
			expect(server).toContain(JSON.stringify(declared.description));
			expect(server).toContain(`gate: ${declared.gate}`);
			expect(server).toContain(
				`shortlist: fuzzyShortlist(vendors, { limit: ${SHORTLIST_LIMIT} })`,
			);
			expect(client).toContain("useSearch<Vendor>(");
			expect(client).toContain(`endpoint: "/api/search/${language}"`);
		},
	);
});
