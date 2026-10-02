import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const skill = read("skills/justask/SKILL.md");

/** The frontmatter's fields, one `key: value` per line as SKILL.md writes them. */
const frontmatter = Object.fromEntries(
	(/^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? "")
		.split("\n")
		.map((line) => /^(\w+): (.*)$/.exec(line))
		.filter((match) => match !== null)
		.map(([, key, value]) => [key, value]),
);

/** The four entry points' sources, where every name the skill teaches must still be exported. */
const entries = [
	"src/index.ts",
	"src/react/index.ts",
	"src/jev/index.ts",
	"src/eval/index.ts",
]
	.map(read)
	.join("\n");

/**
 * The package names the skill writes in backticks: its functions and hooks
 * (`ask`, `create...`, `use...`, `run...`, `jevProvider`) and its types and
 * pieces (any capitalised name), the web platform's own left out.
 */
const names = [
	...new Set(
		[...skill.matchAll(/`([A-Za-z]\w*)`/g)]
			.map(([, name = ""]) => name)
			.filter(
				(name) =>
					/^(ask|create\w+|use[A-Z]\w*|run\w+|jevProvider)$/.test(name) ||
					/^[A-Z][a-z]\w*$/.test(name),
			)
			.filter((name) => !["Request", "Response"].includes(name)),
	),
];

/** The repository paths the skill links on GitHub's main branch. */
const links = [
	...skill.matchAll(
		/https:\/\/github\.com\/franklinmdev\/justask\/(?:blob|tree)\/main\/([^)\s#]+)/g,
	),
].map(([, path = ""]) => path);

// The skill npx skills installs and the package ships (#173).
describe("the agent skill", () => {
	it("names itself as its directory and keeps its description in the spec's 1,024 characters", () => {
		expect(frontmatter.name).toBe("justask");
		expect(frontmatter.description?.length).toBeGreaterThan(0);
		expect(frontmatter.description?.length).toBeLessThanOrEqual(1024);
	});

	it("finds names to check", () => {
		expect(names).toEqual(
			expect.arrayContaining(["createCardHandler", "useCard", "Card"]),
		);
	});

	it.each(names)("teaches %s, which the package still exports", (name) => {
		expect(entries).toMatch(new RegExp(`\\b${name}\\b`));
	});

	it.each(links)("links %s, which exists", (path) => {
		expect(existsSync(join(root, path))).toBe(true);
	});

	it("ships in the npm package", () => {
		expect(pkg.files).toContain("skills");
	});

	it("is installed by the README's command", () => {
		expect(read("README.md")).toContain(
			"npx skills add franklinmdev/justask --skill justask",
		);
	});
});
