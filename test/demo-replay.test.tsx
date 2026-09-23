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
import type { Probabilities, Provider } from "justask";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoHandler } from "../demo/server/handler.ts";
import { App } from "../demo/src/app.tsx";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
import type { Language } from "../demo/src/content/types.ts";
import { formats } from "../demo/src/format.ts";
import { dayOf, type Recording, recordings } from "../demo/src/recording.ts";
import { failingProvider, fakeProvider } from "./fake-provider.ts";

// The recording files themselves: a rerun of the script changes their
// figures and day, never what these tests check.
const table = recordings.table.en;
const search = recordings.search.es;

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
}: {
	url?: string;
	reduced?: boolean;
	provider?: Provider & { calls: unknown[] };
} = {}) {
	setMedia({ reduced });
	history.replaceState(null, "", url);
	const handler = createDemoHandler(provider);
	const { container } = render(
		<App
			fetch={(input, init) =>
				handler(new Request(new URL(String(input), location.href), init))
			}
		/>,
	);
	return { container, provider, user: userEvent.setup() };
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

/** A replay runs on real timers: a start pause, the box's pause, the proposal, the press. */
const REPLAY = { timeout: 4_000 };

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

async function expectNoAxeViolations(container: Element) {
	// jsdom paints nothing: contrast is checked in the browser.
	const { violations } = await axe.run(container, {
		rules: { "color-contrast": { enabled: false } },
	});
	expect(violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
}

// The date control's year reads today, fixed here; Date alone is faked.
beforeEach(() => {
	vi.setSystemTime(new Date("2026-09-23T15:00:00Z"));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	// @ts-expect-error jsdom has no matchMedia of its own.
	delete window.matchMedia;
});

describe("the Table case's recorded run", () => {
	it("replays with no call and no click: the sentence, then Apply sets each control in field order", async () => {
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
		// Each control Apply set settles in after the one before; the held one stays still.
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
		expect(
			await screen.findByRole("list", { name: "Filters to apply" }),
		).toBeDefined();
		// The table keeps what the replay applied until the person applies more.
		expect(control("Vendor").value).toBe("fixbright");
	});

	it("drops the label once the person edits the box, even when an empty box makes no call", async () => {
		const { user, provider } = renderDemo();
		await replayApplied();

		await user.clear(searchbox("Filter the transactions"));

		expect(screen.queryByText(label("en", table))).toBeNull();
		expect(provider.calls).toHaveLength(0);
	});

	it("stops when the person types first, and applies nothing", async () => {
		const { user, provider } = renderDemo();
		const box = searchbox("Filter the transactions");

		await user.type(box, "x");
		// Past the whole replay: nothing more types in, and nothing is applied.
		await new Promise((resolve) => setTimeout(resolve, 2_500));

		expect(box.value).toBe("x");
		expect(screen.queryByText(label("en", table))).toBeNull();
		expect(control("Vendor").value).toBe("");
		// "x" went live, to the provider that fails.
		expect(provider.calls).toHaveLength(1);
	}, 6_000);
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
		expect(figure("Latencia", "Esta llamada")).toBe(`${search.latencyMs} ms`);
		expect(provider.calls).toHaveLength(0);
		await expectNoAxeViolations(container);
	});
});
