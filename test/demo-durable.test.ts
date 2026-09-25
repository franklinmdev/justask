import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	createTestHarness,
	type TestHarness,
	unstable_readConfig,
} from "wrangler";
import { BUDGET_EXCEEDED, DEMO_PAUSED } from "../demo/src/api.ts";

// The Worker in local workerd, through wrangler's own test harness: what only
// the Durable Object has, its SQL and its one object for every isolate, is
// tested against the real runtime, never a stand-in (docs/workers.md). The
// entry is the deployed one's shape over the fake provider, each call $0.4.

// wrangler bundles `justask` from src/, as `pnpm demo:worker` does.
process.env.WRANGLER_BUILD_CONDITIONS = "source,workerd,worker,browser";

/** The deployed Worker's runtime and bindings, read from wrangler.jsonc so the two cannot drift. */
function config(vars: Record<string, string> = {}) {
	const {
		compatibility_date,
		compatibility_flags,
		durable_objects,
		migrations,
	} = unstable_readConfig({ config: "wrangler.jsonc" });
	return {
		name: "justask-demo-test",
		main: "test/worker/entry.ts",
		compatibility_flags,
		durable_objects,
		migrations,
		vars,
		...(compatibility_date && { compatibility_date }),
	};
}

function search(server: TestHarness) {
	return server.fetch("/api/search/en", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ request: "the caterers", timeZone: "UTC" }),
	});
}

/** Searches until the first that is not a 200, the budget's 402 with `body`, and answers how many were. */
async function answeredUntilRefused(
	server: TestHarness,
	body: typeof BUDGET_EXCEEDED | typeof DEMO_PAUSED = BUDGET_EXCEEDED,
): Promise<number> {
	for (let answered = 0; answered < 10; answered++) {
		const response = await search(server);
		if (response.status !== 200) {
			expect(response.status).toBe(402);
			expect(await response.json()).toEqual(body);
			return answered;
		}
	}
	throw new Error("The budget never refused a search");
}

describe("the Worker's ledger, a Durable Object with SQLite", () => {
	const server = createTestHarness({ workers: [{ config: config() }] });

	beforeAll(() => server.listen(), 60_000);
	// Fresh storage per test.
	beforeEach(() => server.reset(), 30_000);
	afterAll(() => server.close());

	it("adds each call's cost until the day's $1 is crossed, then answers 402", async () => {
		// $0.4 each: the third call crosses $1 and is answered, the fourth is refused.
		expect(await answeredUntilRefused(server)).toBe(3);
	});

	it("keeps the day's spend when the object is evicted", async () => {
		await search(server);
		await search(server);
		await search(server);

		await server.getWorker().evictDurableObject("DemoLedger", {
			name: "budget",
		});

		expect((await search(server)).status).toBe(402);
	});
});

describe("the Worker's kill switch", () => {
	const server = createTestHarness({
		workers: [{ config: config({ DEMO_KILL_SWITCH: "on" }) }],
	});

	beforeAll(() => server.listen(), 60_000);
	afterAll(() => server.close());

	it("gives the budget's 402, paused, to the first request", async () => {
		expect(await answeredUntilRefused(server, DEMO_PAUSED)).toBe(0);
	});
});
