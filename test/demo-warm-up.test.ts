import { describe, expect, it } from "vitest";
import { PROBE, PROBE_WARM_UP } from "../demo/eval/probe.ts";
import { warmUp } from "../demo/server/warm-up.ts";
import {
	failingProvider,
	fakeProvider,
	hangingProvider,
} from "./fake-provider.ts";

/** The probe's one question, answered. */
const answers = {
	vendor: {
		acme: 0.01,
		northwind: 0.97,
		contoso: 0.01,
		not_mentioned: 0.005,
		not_available: 0.005,
	},
};

describe("the warm-up before a recording or a visitor's first request", () => {
	it("sends the eval's probe request straight to the provider, as many times as the eval runners do", async () => {
		const provider = fakeProvider(answers);

		await warmUp(provider);

		expect(provider.calls).toHaveLength(PROBE_WARM_UP);
		for (const call of provider.calls) {
			expect(call).toMatchObject(PROBE);
		}
	});

	it("sends one when asked for one, as the demo's dev server does on start", async () => {
		const provider = fakeProvider(answers);

		await warmUp(provider, { times: 1 });

		expect(provider.calls).toHaveLength(1);
	});

	it("discards a failed call and goes on, since a warm-up only has to reach the provider", async () => {
		const provider = failingProvider(new Error("cold"));

		await expect(warmUp(provider)).resolves.toBeUndefined();
		expect(provider.calls).toHaveLength(PROBE_WARM_UP);
	});

	it("gives up on a call that never answers once the timeout runs out", async () => {
		const provider = hangingProvider();

		await expect(
			warmUp(provider, { times: 2, timeoutMs: 20 }),
		).resolves.toBeUndefined();
		expect(provider.calls).toHaveLength(2);
	});
});
