import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		// Tests import the package by its own name. The `source` condition points
		// `justask`, `justask/react` and `justask/jev` at src/ instead of dist/.
		// Vite resolves a bare self-import with the external conditions in SSR,
		// which is where tests run, so `resolve.conditions` alone would not reach it.
		externalConditions: ["source"],
	},
	test: {
		include: ["src/**/*.test.ts", "test/**/*.test.ts"],
	},
});
