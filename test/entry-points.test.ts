import { describe, expect, it } from "vitest";

describe("entry points", () => {
	it.each([
		"@justask/core",
		"@justask/core/react",
		"@justask/core/jev",
		"@justask/core/eval",
	])("%s can be imported", async (entry) => {
		await expect(import(entry)).resolves.toBeDefined();
	});
});
