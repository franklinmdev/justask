import { APIError } from "@typesafe-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DAILY_BUDGET_USD,
	type Ledger,
	memoryLedger,
	utcDay,
} from "../demo/server/budget.ts";
import { createDemoHandler } from "../demo/server/handler.ts";
import {
	BUDGET_EXCEEDED,
	cardEndpoint,
	filterEndpoint,
	KEY_OUT_OF_SERVICE,
	searchEndpoint,
} from "../demo/src/api.ts";
import { english } from "../demo/src/content/en.ts";
import { failingProvider, fakeProvider } from "./fake-provider.ts";

const DEMO = "http://localhost:5173";

/** Every English vendor at zero and none certain, so any search is answered. */
const answers = {
	search: {
		...Object.fromEntries(english.vendors.map(({ id }) => [id, 0])),
		none: 1,
		several: 0,
	},
};

/** A search posted to the demo's English route. */
function search(
	handler: (request: Request) => Promise<Response>,
	request = "the caterers",
	endpoint = searchEndpoint("en"),
): Promise<Response> {
	return handler(
		new Request(new URL(endpoint, DEMO), {
			method: "POST",
			headers: { "content-type": "application/json", origin: DEMO },
			body: JSON.stringify({ request, timeZone: "America/Santo_Domingo" }),
		}),
	);
}

/** The demo's handler on a ledger of its own, each call costing `costUsd`. */
function demo({
	costUsd = 0.25,
	ledger = memoryLedger(),
	killSwitch = false,
}: {
	costUsd?: number;
	ledger?: Ledger;
	killSwitch?: boolean;
} = {}) {
	const provider = fakeProvider(answers, { costUsd });
	return {
		provider,
		ledger,
		handler: createDemoHandler(provider, { ledger, killSwitch }),
	};
}

const today = () => utcDay(new Date());

afterEach(() => {
	vi.useRealTimers();
});

describe("the demo's daily budget", () => {
	it("adds each call's cost to the UTC day's spend", async () => {
		const { handler, ledger } = demo({ costUsd: 0.25 });

		await search(handler);
		await search(handler);

		expect(await ledger.spent(today())).toBe(0.5);
	});

	it.each([
		["search", searchEndpoint("en")],
		["filter", filterEndpoint("en")],
		["card", cardEndpoint("en")],
	])(
		"answers the %s route 402 past the day's budget, with no provider call",
		async (_, endpoint) => {
			const ledger = memoryLedger();
			await ledger.add(today(), DAILY_BUDGET_USD);
			const { handler, provider } = demo({ ledger });

			const response = await search(handler, "the caterers", endpoint);

			expect(response.status).toBe(402);
			expect(await response.json()).toEqual(BUDGET_EXCEEDED);
			expect(provider.calls).toHaveLength(0);
		},
	);

	it("lets the call that crosses the budget through, then refuses the next", async () => {
		const ledger = memoryLedger();
		await ledger.add(today(), 0.9);
		const { handler, provider } = demo({ ledger, costUsd: 0.25 });

		expect((await search(handler)).status).toBe(200);
		expect((await search(handler)).status).toBe(402);
		expect(provider.calls).toHaveLength(1);
		expect(await ledger.spent(today())).toBeCloseTo(1.15);
	});

	it("starts over at UTC midnight", async () => {
		vi.setSystemTime(new Date("2026-09-25T23:59:59Z"));
		const ledger = memoryLedger();
		await ledger.add(today(), DAILY_BUDGET_USD);
		const { handler } = demo({ ledger });
		expect((await search(handler)).status).toBe(402);

		vi.setSystemTime(new Date("2026-09-26T00:00:00Z"));

		expect((await search(handler)).status).toBe(200);
	});

	it("counts nothing for a call whose provider reports no cost", async () => {
		const provider = fakeProvider(answers);
		const ledger = memoryLedger();
		const handler = createDemoHandler(provider, { ledger });

		await search(handler);

		expect(await ledger.spent(today())).toBe(0);
	});
});

describe("the demo's kill switch", () => {
	it("gives the budget's answer, with nothing spent and no provider call", async () => {
		const { handler, provider } = demo({ killSwitch: true });

		const response = await search(handler);

		expect(response.status).toBe(402);
		expect(await response.json()).toEqual(BUDGET_EXCEEDED);
		expect(provider.calls).toHaveLength(0);
	});
});

describe("a refusal of the owner's key", () => {
	/** TypeSafe's answer with `status`, as the SDK throws it. */
	function refused(status: number) {
		return APIError.fromResponse(status, { error: "refused" }, new Headers());
	}

	it.each([401, 402, 403, 422])(
		"answers %i as the key being out of service, never a held answer",
		async (status) => {
			const onError = vi.fn();
			const handler = createDemoHandler(failingProvider(refused(status)), {
				ledger: memoryLedger(),
				onError,
			});

			const response = await search(handler);

			expect(response.status).toBe(503);
			expect(await response.json()).toEqual(KEY_OUT_OF_SERVICE);
			// The server log still has TypeSafe's own answer.
			expect(onError).toHaveBeenCalledOnce();
		},
	);

	it.each([
		["a 429", refused(429)],
		["a 500", refused(500)],
		["an error with no status", new Error("lost")],
	])("leaves %s to the usual provider error", async (_, cause) => {
		const handler = createDemoHandler(failingProvider(cause), {
			ledger: memoryLedger(),
		});

		const response = await search(handler);

		expect(response.status).toBe(200);
		expect(((await response.json()) as { error: unknown }).error).toEqual({
			kind: "provider",
			message: "The provider failed",
		});
	});
});
