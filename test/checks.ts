import { screen, type within } from "@testing-library/react";
import axe from "axe-core";
import { expect } from "vitest";

/** No axe violation in the rendered piece. */
export async function expectNoAxeViolations(container: Element) {
	// jsdom paints nothing: contrast is checked in the browser, and the
	// package's pieces ship unstyled, so theirs is the host's.
	const { violations } = await axe.run(container, {
		rules: { "color-contrast": { enabled: false } },
	});
	expect(violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
}

/** The demo's saved counter beside the box, in either language; null while it shows none. */
export function counter() {
	return screen.queryByText(/^1 (sentence|frase) /)?.textContent ?? null;
}

/** The figure a panel shows under a term, once the call has returned. */
export async function figure(panel: ReturnType<typeof within>, term: string) {
	const dt = await panel.findByText(term, { selector: "dt" });
	return dt.nextElementSibling?.textContent;
}
