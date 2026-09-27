import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	parseCardEvalSet,
	parseEvalSet,
	parseFilterEvalSet,
} from "justask/eval";
import { describe, expect, it } from "vitest";
import { diagnosticsOf } from "./typecheck.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(join(root, "README.md"), "utf8");

/**
 * The README's ts and tsx blocks as a person copies them. A block whose first
 * line names a file (`// catalog.ts, ...`) is that file, and the others import
 * it by that name; a block that starts `// in ` is an excerpt of one of them,
 * never compiled alone; any other block is a module of its own.
 */
const blocks = [...readme.matchAll(/```(tsx?)\n([\s\S]*?)```/g)].map(
	([, lang, code = ""], i) => ({
		name: /^\/\/ ([\w-]+\.tsx?)\b/.exec(code)?.[1] ?? `block-${i}.${lang}`,
		code,
		excerpt: code.startsWith("// in "),
	}),
);

/**
 * What the README leaves to the host app, declared once: its Express app, its
 * table's filter setter and formatters, its own storage and its vendor select.
 */
const host = `
declare const app: {
	post(
		path: string,
		handler: (
			req: import("node:http").IncomingMessage,
			res: import("node:http").ServerResponse,
			next: (error?: unknown) => void,
		) => void,
	): void;
};
declare function setTableFilter(filter: unknown): void;
declare function formatRange(range: import("justask").DateRange): string;
declare function formatAmount(amount: import("justask").AmountRange): string;
declare function saveExpense(expense: unknown): void;
declare function undoSave(): void;
declare function VendorSelect(props: {
	value: import("./catalog.ts").Vendor | undefined;
	onChange: (vendor: import("./catalog.ts").Vendor | undefined) => void;
}): import("react").ReactNode;
`;

describe("the README", () => {
	it("typechecks every code block as copied, with only the host's own names declared", () => {
		const files = Object.fromEntries(
			blocks
				.filter(({ excerpt }) => !excerpt)
				.map(({ name, code }) => [
					name,
					// A block with no import or export is a module all the same.
					name.startsWith("block-") ? `${code}\nexport {};\n` : code,
				]),
		);

		expect(diagnosticsOf({ ...files, "host.d.ts": host })).toBe("");
	});

	it("builds the provider and installs its SDK before the first handler", () => {
		const first = (text: string) => readme.indexOf(text);

		expect(first("npm i justask @typesafe-ai/sdk")).toBeGreaterThan(-1);
		expect(first("jevProvider()")).toBeGreaterThan(-1);
		expect(first("TYPESAFE_API_KEY")).toBeLessThan(
			first("createSearchHandler({"),
		);
		expect(first("jevProvider()")).toBeLessThan(first("createSearchHandler({"));
	});

	it("shows eval sets that parse, the search's, the filter's and the card's in turn", () => {
		const sets = [...readme.matchAll(/```jsonl\n([\s\S]*?)```/g)].map(
			([, text = ""]) => text,
		);
		const parsers = [parseEvalSet, parseFilterEvalSet, parseCardEvalSet];

		expect(sets).toHaveLength(parsers.length);
		sets.forEach((text, i) => {
			expect(parsers[i]?.(text)).toHaveLength(3);
		});
	});

	it("names excerpts only after the block they are part of", () => {
		for (const { code, excerpt } of blocks) {
			if (!excerpt) continue;
			const [, of] = /^\/\/ in (\S+?)[,\s]/.exec(code) ?? [];
			expect(blocks.map(({ name }) => name)).toContain(of);
		}
	});
});
