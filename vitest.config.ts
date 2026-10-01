import { defineConfig } from "vitest/config";

// Tests import the package by its own name. The `justask-source` condition points
// `@justask/core`, `@justask/core/react` and `@justask/core/jev` at src/ instead of dist/.
export default defineConfig({
	resolve: {
		// jsdom tests run as web code: Vite's client conditions, plus `justask-source`.
		conditions: [
			"justask-source",
			"module",
			"browser",
			"development|production",
		],
	},
	ssr: {
		// Node tests run as SSR. Left external, the self-import would reach Node's
		// own loader, which strips types from .ts but cannot load .tsx.
		noExternal: ["@justask/core"],
		resolve: {
			conditions: [
				"justask-source",
				"module",
				"node",
				"development|production",
			],
		},
	},
	test: {
		include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
		// Half the cores, not one per core less one: the whole-App tests are
		// CPU-bound, and under other sessions' load more workers ran them past
		// their 5 s. Measured on #83 on 8 cores under 8 busy loops: 2 failures a
		// run at the default, none at half; about a second slower idle. A share,
		// not a count: 4 workers on CI's 4 cores failed the same tests.
		maxWorkers: "50%",
		tags: [
			{
				// A whole-page axe run was 0.2 to 1.4 s a test at load average 11,
				// and at 21 ran a test to 5.6 s even with its file warmed up and the
				// run in a test of its own (#161). Each file that renders the demo's
				// App carries `// @module-tag page`; test/page-tag.test.ts checks it.
				name: "page",
				description: "Renders the demo's whole page and runs axe on it.",
				timeout: 15_000,
			},
		],
	},
});
