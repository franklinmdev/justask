import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	createTestHarness,
	type TestHarness,
	unstable_readConfig,
} from "wrangler";
import {
	BUDGET_EXCEEDED,
	DEMO_PAUSED,
	VISITOR_MINUTE_LIMIT,
	VISITOR_MINUTE_USED,
} from "../demo/src/api.ts";

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

/** A search, from `address` when named, as Cloudflare names the visitor. */
function search(server: TestHarness, address?: string) {
	return server.fetch("/api/search/en", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(address && { "cf-connecting-ip": address }),
		},
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

// Room for a wait past a minute's edge (clearOfMinuteEdge).
describe("the Worker's per-visitor limits, in the same Durable Object", {
	timeout: 20_000,
}, () => {
	// Free calls, so only the visitor's limits refuse.
	const server = createTestHarness({
		workers: [{ config: config({ TEST_COST_USD: "0" }) }],
	});

	beforeAll(() => server.listen(), 60_000);
	beforeEach(() => server.reset(), 30_000);
	afterAll(() => server.close());

	/**
	 * The Worker reads the real clock, and a UTC minute's edge between a
	 * test's calls would start the minute's count over: in a minute's last
	 * 10 s, waits for the next. The calls take well under that.
	 */
	async function clearOfMinuteEdge() {
		const left = 60_000 - (Date.now() % 60_000);
		if (left < 10_000) await new Promise((done) => setTimeout(done, left));
	}

	/** Sends `times` searches from `address` and answers each status. */
	async function statuses(times: number, address: string) {
		const answered: number[] = [];
		for (let i = 0; i < times; i++) {
			answered.push((await search(server, address)).status);
		}
		return answered;
	}

	it(`answers one IP's ${VISITOR_MINUTE_LIMIT + 1}st call in a minute 402, naming the visitor, and another IP 200`, async () => {
		await clearOfMinuteEdge();
		expect(await statuses(VISITOR_MINUTE_LIMIT, "203.0.113.7")).toEqual(
			Array(VISITOR_MINUTE_LIMIT).fill(200),
		);

		const refused = await search(server, "203.0.113.7");

		expect(refused.status).toBe(402);
		expect(await refused.json()).toEqual(VISITOR_MINUTE_USED);
		expect((await search(server, "203.0.113.8")).status).toBe(200);
	});

	it("counts two IPv6 addresses in one /64 as one visitor, and keeps the count when the object is evicted", async () => {
		await clearOfMinuteEdge();
		await statuses(VISITOR_MINUTE_LIMIT, "2001:db8:1:2::a");

		await server.getWorker().evictDurableObject("DemoLedger", {
			name: "budget",
		});

		expect((await search(server, "2001:db8:1:2:ffff::b")).status).toBe(402);
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
