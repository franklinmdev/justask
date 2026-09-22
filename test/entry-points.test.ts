import { describe, expect, it } from "vitest";

describe("entry points", () => {
	it.each(["justask", "justask/react", "justask/jev"])(
		"%s can be imported",
		async (entry) => {
			await expect(import(entry)).resolves.toBeDefined();
		},
	);
});
