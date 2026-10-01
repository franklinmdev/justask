import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules");

/**
 * The files typechecked by the repo's own tsc under its strict options, as
 * an app with a bundler would resolve them, in a fresh temp directory that
 * goes afterwards. `@justask/core` resolves to the repo's source, as an installed
 * package would to its types.
 */
export function diagnosticsOf(files: Record<string, string>): string {
	const temp = mkdtempSync(join(tmpdir(), "justask-typecheck-"));
	try {
		for (const [name, code] of Object.entries(files)) {
			mkdirSync(dirname(join(temp, name)), { recursive: true });
			writeFileSync(join(temp, name), code);
		}
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
					types: ["node"],
					typeRoots: [join(modules, "@types")],
					paths: {
						"@justask/core": [join(root, "src/index.ts")],
						"@justask/core/react": [join(root, "src/react/index.ts")],
						"@justask/core/jev": [join(root, "src/jev/index.ts")],
						"@justask/core/eval": [join(root, "src/eval/index.ts")],
						react: [join(modules, "@types/react/index.d.ts")],
						"react/*": [join(modules, "@types/react/*")],
					},
				},
				files: Object.keys(files).map((name) => join(temp, name)),
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
