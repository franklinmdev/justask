import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const testDir = new URL("./", import.meta.url);

/** Every test file that renders the demo's whole page, however it imports it, with its source. */
const pageFiles = readdirSync(testDir, { recursive: true, encoding: "utf8" })
	.filter((name) => name.endsWith(".test.tsx"))
	.map((name) => ({
		name,
		source: readFileSync(new URL(name, testDir), "utf8"),
	}))
	.filter(({ source }) => /<App\b/.test(source));

// The page tag's timeout, and why, is in vitest.config.ts (#161).
describe("the page tag", () => {
	it("finds the page files", () => {
		expect(pageFiles.length).toBeGreaterThan(0);
	});

	it.each(pageFiles)("tags $name", ({ source }) => {
		expect(source).toMatch(/^\/\/ @module-tag page$/m);
	});
});
