import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("./", import.meta.url);

/** Every test file that renders the demo's whole page. */
const pageFiles = readdirSync(dir)
	.filter((name) => name.endsWith(".test.tsx"))
	.filter((name) =>
		readFileSync(new URL(name, dir), "utf8").includes(
			'from "../demo/src/app.tsx"',
		),
	);

// A whole-page axe run under other sessions' load ran a test past 5 s even
// after its file had warmed up and the run had a test of its own (#161): the
// page tag's timeout, in vitest.config.ts, is the rule, and no page file is
// left out of it.
describe("the page tag", () => {
	it("finds the page files", () => {
		expect(pageFiles.length).toBeGreaterThan(0);
	});

	it.each(pageFiles)("tags %s", (name) => {
		expect(readFileSync(new URL(name, dir), "utf8")).toMatch(
			/^\/\/ @module-tag page$/m,
		);
	});
});
