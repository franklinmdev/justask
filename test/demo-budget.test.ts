import { APIError } from "@typesafe-ai/sdk";
import { ProviderUnavailableError } from "justask";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DAILY_BUDGET_USD,
	type Ledger,
	memoryLedger,
	RESERVED_USD,
	utcDay,
} from "../demo/server/budget.ts";
import { createDemoHandler } from "../demo/server/handler.ts";
import {
	BUDGET_EXCEEDED,
	cardEndpoint,
	DEMO_PAUSED,
	filterEndpoint,
	KEY_OUT_OF_SERVICE,
	searchEndpoint,
} from "../demo/src/api.ts";
import { english } from "../demo/src/content/en.ts";
import {
	failingProvider,
	fakeProvider,
	hangingProvider,
	unavailableFirstProvider,
} from "./fake-provider.ts";

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

		// Each call's reservation settled to its cost.
		expect(await ledger.spent(today())).toBeCloseTo(0.5, 12);
	});

	it("reserves a call's cost before it returns, and keeps it when the visitor hangs up (#250)", async () => {
		const provider = hangingProvider();
		const ledger = memoryLedger();
		const handler = createDemoHandler(provider, { ledger });
		const visitor = new AbortController();

		const answered = handler(
			new Request(new URL(searchEndpoint("en"), DEMO), {
				method: "POST",
				headers: { "content-type": "application/json", origin: DEMO },
				body: JSON.stringify({
					request: "the caterers",
					timeZone: "America/Santo_Domingo",
				}),
				signal: visitor.signal,
			}),
		);
		await expect.poll(() => provider.calls.length).toBe(1);
		expect(await ledger.spent(today())).toBe(RESERVED_USD);
		visitor.abort();

		expect((await answered).status).toBe(499);
		expect(await ledger.spent(today())).toBe(RESERVED_USD);
	});

	it("keeps the reservation for a call that fails, which may still be billed (#250)", async () => {
		const ledger = memoryLedger();
		const handler = createDemoHandler(
			failingProvider(new Error("connection reset")),
			{ ledger, onError: () => {} },
		);

		await search(handler);

		// The core calls an unavailable provider once more (ADR 0013); a plain error, once.
		expect(await ledger.spent(today())).toBe(RESERVED_USD);
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

	it("keeps the first call's reservation when an unavailable provider is called again, and settles the second (#250)", async () => {
		const ledger = memoryLedger();
		const provider = unavailableFirstProvider(
			[new ProviderUnavailableError("lost")],
			answers,
			{ costUsd: 0.25 },
		);
		const handler = createDemoHandler(provider, { ledger });

		await search(handler);

		// The core calls once more (ADR 0013); the first call may still be billed.
		expect(provider.calls).toHaveLength(2);
		expect(await ledger.spent(today())).toBeCloseTo(RESERVED_USD + 0.25, 12);
	});

	it("keeps the reservation for a call whose provider reports no cost, since it was still made", async () => {
		const provider = fakeProvider(answers);
		const ledger = memoryLedger();
		const handler = createDemoHandler(provider, { ledger });

		await search(handler);

		expect(await ledger.spent(today())).toBe(RESERVED_USD);
	});
});

describe("the demo's kill switch", () => {
	it("gives the budget's 402, its cause the pause, with nothing spent and no provider call", async () => {
		const { handler, provider } = demo({ killSwitch: true });

		const response = await search(handler);

		expect(response.status).toBe(402);
		expect(await response.json()).toEqual(DEMO_PAUSED);
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

	it("gives back the reservation of a call TypeSafe refused, which ran nothing (#250)", async () => {
		const ledger = memoryLedger();
		const handler = createDemoHandler(failingProvider(refused(401)), {
			ledger,
			onError: () => {},
		});

		await search(handler);

		expect(await ledger.spent(today())).toBe(0);
	});

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
