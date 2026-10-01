import { ProviderUnavailableError } from "@justask/core";
import { APIError } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";
import { PROBE, PROBE_WARM_UP } from "../demo/eval/probe.ts";
import { warmOnStart, warmUp } from "../demo/server/warm-up.ts";
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

		const results = await warmUp(provider);
		expect(results.map(({ error }) => error)).toEqual(
			Array(PROBE_WARM_UP).fill("provider"),
		);
		expect(provider.calls).toHaveLength(PROBE_WARM_UP);
	});

	it("gives up on a call that never answers once the timeout runs out", async () => {
		const provider = hangingProvider();

		const results = await warmUp(provider, { times: 2, timeoutMs: 20 });
		expect(results.map(({ error }) => error)).toEqual(["timeout", "timeout"]);
		expect(provider.calls).toHaveLength(2);
	});
});

describe("the dev server's warm-up on start (#224)", () => {
	it("says how long the call took when it was answered", async () => {
		const provider = fakeProvider(answers);

		const said = await warmOnStart(provider, { killSwitch: false });

		expect(said.level).toBe("info");
		expect(said.message).toMatch(/^justask: provider warmed up in \d+ ms$/);
		expect(provider.calls).toHaveLength(1);
	});

	it("warns that TypeSafe refused the key, as the first live request would find", async () => {
		const provider = failingProvider(
			APIError.fromResponse(401, { error: "refused" }, new Headers()),
		);

		expect(await warmOnStart(provider, { killSwitch: false })).toEqual({
			level: "warn",
			message:
				"justask: warm-up failed: TypeSafe refused the key in TYPESAFE_API_KEY, so every request will answer that the key is out of service",
		});
	});

	it("warns that the provider could not be reached", async () => {
		const provider = failingProvider(
			new ProviderUnavailableError("connect ECONNREFUSED"),
		);

		expect(await warmOnStart(provider, { killSwitch: false })).toEqual({
			level: "warn",
			message:
				"justask: warm-up failed: the provider call failed (connect ECONNREFUSED)",
		});
	});

	it("warns that the provider did not answer in time", async () => {
		const provider = hangingProvider();

		expect(
			await warmOnStart(provider, { killSwitch: false, timeoutMs: 20 }),
		).toEqual({
			level: "warn",
			message:
				"justask: warm-up failed: the provider did not answer within 20 ms",
		});
	});

	it("sends no call with the kill switch on, which stops every call", async () => {
		const provider = fakeProvider(answers);

		expect(await warmOnStart(provider, { killSwitch: true })).toEqual({
			level: "info",
			message: "justask: the kill switch is on, so no warm-up call is sent",
		});
		expect(provider.calls).toHaveLength(0);
	});
});
