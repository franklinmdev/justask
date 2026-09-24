import { defineConfig } from "vitest/config";

// Tests import the package by its own name. The `source` condition points
// `justask`, `justask/react` and `justask/jev` at src/ instead of dist/.
export default defineConfig({
	resolve: {
		// jsdom tests run as web code: Vite's client conditions, plus `source`.
		conditions: ["source", "module", "browser", "development|production"],
	},
	ssr: {
		// Node tests run as SSR. Left external, the self-import would reach Node's
		// own loader, which strips types from .ts but cannot load .tsx.
		noExternal: ["justask"],
		resolve: {
			conditions: ["source", "module", "node", "development|production"],
		},
	},
	test: {
		include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
		// Four workers, not one per core: the whole-App tests are CPU-bound, and
		// under other sessions' load a worker per core ran them past their 5 s.
		// Measured on #83 under 8 busy loops: 2 failures a run at the default,
		// none at 4; about a second slower idle.
		maxWorkers: 4,
	},
});
