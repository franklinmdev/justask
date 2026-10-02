import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "@justask/core";
import * as evals from "@justask/core/eval";
import * as jev from "@justask/core/jev";
import * as react from "@justask/core/react";
import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { diagnosticsOf } from "./typecheck.ts";

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

/** What the four entry points export at run time: functions, hooks and pieces. */
const exported: Record<string, unknown> = {
	...core,
	...evals,
	...jev,
	...react,
};

/**
 * The package names the skill writes in backticks: its functions and hooks
 * (`ask`, `create...`, `use...`, `run...`, `jevProvider`) and its types and
 * pieces (any capitalised name), the web platform's own left out. A piece is
 * checked at run time; a type leaves nothing there, so it is typechecked as
 * an import from the core, where every type the skill names lives.
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

/** The ADRs the skill cites by number, as `ADR 0005, 0007` names two. */
const adrs = [
	...new Set(
		[...skill.matchAll(/ADR (\d{4}(?:, \d{4})*)/g)].flatMap(
			([, numbers = ""]) => numbers.split(", "),
		),
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

	it("finds names and ADRs to check", () => {
		expect(names).toEqual(
			expect.arrayContaining(["createCardHandler", "useCard", "Card"]),
		);
		expect(adrs).toEqual(expect.arrayContaining(["0002", "0003", "0008"]));
	});

	it.each(names.filter((name) => !/^[A-Z]/.test(name) || name in exported))(
		"teaches %s, which the package still exports",
		(name) => {
			expect(exported[name]).toBeDefined();
		},
	);

	it("teaches types the core still exports", () => {
		const types = names.filter(
			(name) => /^[A-Z]/.test(name) && !(name in exported),
		);
		expect(types).toEqual(expect.arrayContaining(["Card", "Filter", "Search"]));
		expect(
			diagnosticsOf({
				"types.ts": `import type { ${types.join(", ")} } from "@justask/core";\nexport type { ${types.join(", ")} };\n`,
			}),
		).toBe("");
	});

	it.each(adrs)("cites ADR %s, which exists", (number) => {
		expect(
			readdirSync(join(root, "docs/adr")).some((file) =>
				file.startsWith(`${number}-`),
			),
		).toBe(true);
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
