import { ask } from "justask";
import { describe, expect, it } from "vitest";
import { fakeProvider } from "./fake-provider.ts";

describe("ask", () => {
	it("sends every question in one provider call and returns the pick with every label's probability", async () => {
		const provider = fakeProvider({
			vendor: { acme: 0.93, northwind: 0.05, none: 0.02 },
		});

		const result = await ask({
			request: "invoices from Acme",
			facts: { today: "2026-09-22" },
			provider,
			questions: [
				{
					id: "vendor",
					instruction: "Which vendor does the request mean?",
					labels: [
						{ label: "acme", description: "Acme Supplies" },
						{ label: "northwind", description: "Northwind Traders" },
						{ label: "none", description: "None of these vendors" },
					],
				},
			],
		});

		expect(provider.calls).toHaveLength(1);
		expect(provider.calls[0]?.facts).toEqual({ today: "2026-09-22" });
		expect(result.picks).toEqual({
			vendor: {
				label: "acme",
				probability: 0.93,
				probabilities: { acme: 0.93, northwind: 0.05, none: 0.02 },
			},
		});
	});
});
