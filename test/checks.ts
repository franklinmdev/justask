import { cleanup, screen, type within } from "@testing-library/react";
import axe from "axe-core";
import { expect } from "vitest";

// jsdom paints nothing: contrast is checked in the browser, and the package's
// pieces ship unstyled, so theirs is the host's. Every rule still runs and
// every violation keeps its nodes; `resultTypes` only cuts passes, incomplete
// and inapplicable to one node each, sparing a selector for the rest, a third
// to a half of a run on the demo's card page (#116).
const AXE: axe.RunOptions = {
	rules: { "color-contrast": { enabled: false } },
	resultTypes: ["violations"],
};

/** No axe violation in the rendered piece. */
export async function expectNoAxeViolations(container: Element) {
	const { violations } = await axe.run(container, AXE);
	expect(violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
}

/** The demo's saved counter beside the box, in either language; null while it shows none. */
export function counter() {
	return screen.queryByText(/^1 (sentence|frase) /)?.textContent ?? null;
}

/** The text an element is described by, or "" with none. */
export function description(element: Element) {
	return (element.getAttribute("aria-describedby") ?? "")
		.split(" ")
		.map((id) => document.getElementById(id)?.textContent ?? "")
		.join("");
}

/** The figure a panel shows under a term, once the call has returned. */
export async function figure(panel: ReturnType<typeof within>, term: string) {
	const dt = await panel.findByText(term, { selector: "dt" });
	return dt.nextElementSibling?.textContent;
}

/**
 * A page file's cold start, paid in its `beforeAll` rather than by its first
 * test: a worker's first render of the page and first axe run cost that test
 * about 0.3 s idle, and under other sessions' load ran it past its 5 s (#120).
 * The page it renders is dropped, and it checks nothing.
 */
export async function warmUp(renderPage: () => { container: Element }) {
	const { container } = renderPage();
	await axe.run(container, AXE);
	cleanup();
}
