import { describe, expect, it } from "vitest";
import { diagnosticsOf } from "./typecheck.ts";

describe("a card or filter declared as a plain const", () => {
	it("fails on the kind it widened to a string, not on a missing several", () => {
		const output = diagnosticsOf({
			"plain.ts": `
import { createCardHandler, type Provider, type Shortlist } from "@justask/core";
declare const provider: Provider;
declare const shortlist: Shortlist<{ name: string }>;
const expense = {
	description: "expense the person paid",
	gate: 0.9,
	fields: {
		vendor: { kind: "catalog", description: "the vendor who was paid", gate: 0.8, shortlist },
		total: { kind: "amount", description: "the amount paid", gate: 0.8 },
	},
};
export const handler = createCardHandler({ provider, timeoutMs: 2000, card: expense });
`,
		});

		expect(output).toContain(
			`Type 'string' is not assignable to type '"catalog"'`,
		);
		expect(output).not.toContain("'several' is missing");
	});
});
