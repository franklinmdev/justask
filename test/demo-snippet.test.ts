import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
import type { Case } from "../demo/src/content/types.ts";
import { type Snippet, snippetOf } from "../demo/src/snippet.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contents = { en: english, es: spanish };
const cases: Case[] = ["table", "form", "search"];

/** Every case's snippet in both languages, each as its own copied project. */
const projects = cases.flatMap((shown) =>
	(["en", "es"] as const).map((language) => ({
		shown,
		language,
		snippet: snippetOf(shown, contents[language]),
	})),
);

/**
 * The snippets as copied React apps would hold them, each in its own folder
 * under a fresh temp directory, typechecked by the repo's own tsc under its
 * strict options with a bundler's resolution. `@justask/core` and React resolve to
 * the repo's, as an installed package would; the directory goes afterwards.
 */
function diagnosticsOf(snippets: { dir: string; snippet: Snippet }[]): string {
	const temp = mkdtempSync(join(tmpdir(), "justask-snippet-"));
	try {
		const files = snippets.flatMap(({ dir, snippet }) =>
			[snippet.server, snippet.client].map(({ name, code }) => {
				const path = join(temp, dir, name);
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, code);
				return path;
			}),
		);
		const modules = join(root, "node_modules");
		writeFileSync(
			join(temp, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					target: "es2023",
					jsx: "react-jsx",
					lib: ["es2023", "dom", "dom.iterable"],
					module: "esnext",
					moduleResolution: "bundler",
					strict: true,
					noUncheckedIndexedAccess: true,
					exactOptionalPropertyTypes: true,
					verbatimModuleSyntax: true,
					isolatedModules: true,
					allowImportingTsExtensions: true,
					skipLibCheck: true,
					noEmit: true,
					types: [],
					paths: {
						"@justask/core": [join(root, "src/index.ts")],
						"@justask/core/react": [join(root, "src/react/index.ts")],
						"@justask/core/jev": [join(root, "src/jev/index.ts")],
						react: [join(modules, "@types/react/index.d.ts")],
						"react/*": [join(modules, "@types/react/*")],
					},
				},
				files,
			}),
		);
		const tsc = spawnSync(
			join(modules, ".bin/tsc"),
			["-p", join(temp, "tsconfig.json"), "--pretty", "false"],
			{ encoding: "utf8" },
		);
		return `${tsc.stdout}${tsc.stderr}`.replaceAll(temp, "").trim();
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}

describe("the showcase's Code tab snippets", () => {
	it("typecheck as copied, with nothing imported but React, justask and each other", () => {
		expect(
			diagnosticsOf(
				projects.map(({ shown, language, snippet }) => ({
					dir: `${shown}-${language}`,
					snippet,
				})),
			),
		).toBe("");
		for (const { snippet } of projects) {
			for (const { code } of [snippet.server, snippet.client]) {
				const imported = [...code.matchAll(/from "([^"]+)"/g)].map(
					([, from]) => from,
				);
				for (const from of imported) {
					expect([
						"react",
						"@justask/core",
						"@justask/core/jev",
						"@justask/core/react",
						"./handler",
					]).toContain(from);
				}
			}
		}
	}, 30_000);

	it.each([
		["en", english],
		["es", spanish],
	] as const)(
		"write the catalogs the demo serves in %s",
		(language, content) => {
			const table = snippetOf("table", content).server.code;
			const form = snippetOf("form", content).server.code;
			const search = snippetOf("search", content).server.code;

			for (const code of [table, form, search]) {
				for (const vendor of content.vendors) {
					expect(code).toContain(`id: ${JSON.stringify(vendor.id)}`);
					expect(code).toContain(
						`description: ${JSON.stringify(vendor.description)}`,
					);
					expect(code).toContain(`name: ${JSON.stringify(vendor.value.name)}`);
				}
			}
			for (const status of content.statuses) {
				expect(table).toContain(`value: ${JSON.stringify(status.value)}`);
				expect(table).toContain(
					`description: ${JSON.stringify(status.description)}`,
				);
			}
			for (const tag of content.tags) {
				expect(form).toContain(
					`description: ${JSON.stringify(tag.description)}`,
				);
			}
			expect(language).toBe(content.language);
		},
	);

	it.each([
		["en", english],
		["es", spanish],
	] as const)(
		"write the status out of the pair hold as the demo declares it, in %s (#80)",
		(_, content) => {
			const table = snippetOf("table", content).server.code;
			expect(table.match(/heldByPair: false/g)).toHaveLength(1);
		},
	);

	it.each([
		["en", english],
		["es", spanish],
	] as const)(
		"show the Form's held-field pattern with one CardEntry around the host's own input, in %s",
		(_language, content) => {
			const client = snippetOf("form", content).client.code;

			expect(client).toContain('<CardEntry card={card} name="total">');
			expect(client).toContain("{({ value, set, filledBy }) => (");
			expect(client).toContain(content.copy.card.fields.total);
			expect(client).toContain(content.copy.card.fromRequest);
		},
	);
});
