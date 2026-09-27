import { ProviderUnavailableError } from "justask";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DAILY_BUDGET_USD,
	type Ledger,
	memoryLedger,
	utcDay,
} from "../demo/server/budget.ts";
import { createDemoHandler } from "../demo/server/handler.ts";
import { nextUtcMidnight, visitorAddress } from "../demo/server/visitors.ts";
import {
	BUDGET_EXCEEDED,
	searchEndpoint,
	VISITOR_DAY_LIMIT,
	VISITOR_MINUTE_LIMIT,
} from "../demo/src/api.ts";
import { english } from "../demo/src/content/en.ts";
import { fakeProvider, unavailableFirstProvider } from "./fake-provider.ts";

const DEMO = "http://localhost:5173";

/** Every English vendor at zero and none certain, so any search is answered. */
const answers = {
	search: {
		...Object.fromEntries(english.vendors.map(({ id }) => [id, 0])),
		none: 1,
		several: 0,
	},
};

/** The demo's handler on a ledger of its own, each call free, so only the visitor's limits refuse. */
function demo(ledger: Ledger = memoryLedger()) {
	const provider = fakeProvider(answers, { costUsd: 0 });
	return { provider, ledger, handler: createDemoHandler(provider, { ledger }) };
}

/** A search from `address`, as Cloudflare names the visitor; none, as the local scripts send. */
function search(
	handler: (request: Request) => Promise<Response>,
	address: string | null = "203.0.113.7",
): Promise<Response> {
	return handler(
		new Request(new URL(searchEndpoint("en"), DEMO), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: DEMO,
				...(address !== null && { "cf-connecting-ip": address }),
			},
			body: JSON.stringify({ request: "the caterers", timeZone: "UTC" }),
		}),
	);
}

/** Sends `times` searches from `address` and answers each status. */
async function statuses(
	handler: (request: Request) => Promise<Response>,
	times: number,
	address?: string | null,
): Promise<number[]> {
	const answered: number[] = [];
	for (let i = 0; i < times; i++) {
		answered.push((await search(handler, address)).status);
	}
	return answered;
}

afterEach(() => {
	vi.useRealTimers();
});

describe("a visitor's address", () => {
	it("is an IPv4 address as it is", () => {
		expect(visitorAddress("203.0.113.7")).toBe("203.0.113.7");
	});

	it("is an IPv6 address's /64, however it is written", () => {
		expect(visitorAddress("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe(
			"2001:db8:85a3:8d3::/64",
		);
		expect(visitorAddress("2001:DB8:0:0::1")).toBe("2001:db8:0:0::/64");
		expect(visitorAddress("2001:db8::")).toBe("2001:db8:0:0::/64");
		expect(visitorAddress("::1")).toBe("0:0:0:0::/64");
	});

	it("is the IPv4 address inside an IPv4-mapped IPv6 one, as Node names a local visitor", () => {
		expect(visitorAddress("::ffff:127.0.0.1")).toBe("127.0.0.1");
	});

	it("is none when the request names none", () => {
		expect(visitorAddress(null)).toBeNull();
		expect(visitorAddress("")).toBeNull();
	});
});

describe("when a day's visitor counts go", () => {
	it("is the next UTC midnight", () => {
		expect(nextUtcMidnight(new Date("2026-09-25T23:59:59.999Z"))).toBe(
			Date.parse("2026-09-26T00:00:00Z"),
		);
		expect(nextUtcMidnight(new Date("2026-09-30T00:00:00Z"))).toBe(
			Date.parse("2026-10-01T00:00:00Z"),
		);
	});
});

describe("the demo's per-visitor limits", () => {
	it(`answers the ${VISITOR_MINUTE_LIMIT + 1}st call in a minute from one IP 402, naming the visitor's minute, with no provider call`, async () => {
		vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
		const { handler, provider } = demo();

		expect(await statuses(handler, VISITOR_MINUTE_LIMIT)).toEqual(
			Array(VISITOR_MINUTE_LIMIT).fill(200),
		);
		const response = await search(handler);

		expect(response.status).toBe(402);
		expect(await response.json()).toEqual({
			error: {
				kind: "budget_exceeded",
				cause: "visitor",
				limit: "minute",
				message: "This visitor's 20 calls a minute are used",
			},
		});
		expect(provider.calls).toHaveLength(VISITOR_MINUTE_LIMIT);
	});

	it("lets the visitor call again the next minute", async () => {
		vi.setSystemTime(new Date("2026-09-25T12:00:30Z"));
		const { handler } = demo();
		await statuses(handler, VISITOR_MINUTE_LIMIT);
		expect((await search(handler)).status).toBe(402);

		vi.setSystemTime(new Date("2026-09-25T12:01:30Z"));

		expect((await search(handler)).status).toBe(200);
	});

	it(`answers the ${VISITOR_DAY_LIMIT + 1}st call in a day from one IP 402, naming the visitor's day`, async () => {
		const { handler, provider } = demo();
		// 10 a minute, under the minute's limit, for 20 minutes.
		for (let minute = 0; minute < 20; minute++) {
			vi.setSystemTime(new Date(Date.UTC(2026, 8, 25, 12, minute)));
			expect(await statuses(handler, 10)).toEqual(Array(10).fill(200));
		}
		vi.setSystemTime(new Date("2026-09-25T12:30:00Z"));

		const response = await search(handler);

		expect(response.status).toBe(402);
		expect(await response.json()).toEqual({
			error: {
				kind: "budget_exceeded",
				cause: "visitor",
				limit: "day",
				message: "This visitor's 200 calls a day are used",
			},
		});
		expect(provider.calls).toHaveLength(VISITOR_DAY_LIMIT);
	});

	it("starts the visitor's day over at UTC midnight", async () => {
		const ledger = memoryLedger();
		// One call every 10 s from midday, under the minute's limit.
		for (let i = 0; i < VISITOR_DAY_LIMIT; i++) {
			expect(
				await ledger.visit(
					"203.0.113.7",
					new Date(Date.UTC(2026, 8, 25, 12, 0, i * 10)),
				),
			).toBeNull();
		}
		const { handler } = demo(ledger);
		vi.setSystemTime(new Date("2026-09-25T23:59:00Z"));
		expect((await search(handler)).status).toBe(402);

		vi.setSystemTime(new Date("2026-09-26T00:00:00Z"));

		expect((await search(handler)).status).toBe(200);
	});

	it("counts a call stamped before the visitor's latest minute in that minute, across midnight too", async () => {
		const ledger = memoryLedger();
		const address = "203.0.113.7";
		for (let second = 0; second < VISITOR_MINUTE_LIMIT; second++) {
			await ledger.visit(
				address,
				new Date(Date.UTC(2026, 8, 26, 0, 0, second)),
			);
		}

		// Yesterday's last second starts nothing over: it lands in the new day's full minute.
		expect(await ledger.visit(address, new Date("2026-09-25T23:59:59Z"))).toBe(
			"minute",
		);
		expect(await ledger.visit(address, new Date("2026-09-26T00:00:30Z"))).toBe(
			"minute",
		);
	});

	it("counts two IPv6 addresses in one /64 as one visitor", async () => {
		vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
		const { handler } = demo();
		await statuses(handler, VISITOR_MINUTE_LIMIT, "2001:db8:1:2::a");

		expect((await search(handler, "2001:db8:1:2:ffff::b")).status).toBe(402);
		// Another /64 is another visitor.
		expect((await search(handler, "2001:db8:1:3::a")).status).toBe(200);
	});

	it("counts each IPv4 address as its own visitor", async () => {
		vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
		const { handler } = demo();
		await statuses(handler, VISITOR_MINUTE_LIMIT, "203.0.113.7");

		expect((await search(handler, "203.0.113.8")).status).toBe(200);
	});

	it("does not count a refused call against the visitor", async () => {
		vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
		const ledger = memoryLedger();
		const { handler } = demo(ledger);
		await statuses(handler, VISITOR_MINUTE_LIMIT + 5);

		vi.setSystemTime(new Date("2026-09-25T12:01:00Z"));

		// 20 counted, not 25: the rest of the day's 200 are still there.
		expect(await statuses(handler, VISITOR_MINUTE_LIMIT)).toEqual(
			Array(VISITOR_MINUTE_LIMIT).fill(200),
		);
	});

	it("counts only a request that calls the provider: an empty request, a malformed body or a GET counts nothing (#219)", async () => {
		vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
		const { handler, provider } = demo();
		const post = (body: string) =>
			handler(
				new Request(new URL(searchEndpoint("en"), DEMO), {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: DEMO,
						"cf-connecting-ip": "203.0.113.7",
					},
					body,
				}),
			);
		const refused: number[] = [];
		for (let i = 0; i < VISITOR_MINUTE_LIMIT; i++) {
			refused.push(
				(await post(JSON.stringify({ request: "", timeZone: "UTC" }))).status,
				(await post(JSON.stringify({ request: "   ", timeZone: "UTC" })))
					.status,
				(await post("garbage")).status,
				(
					await post(
						JSON.stringify({ request: "the caterers", timeZone: "Mars/Base" }),
					)
				).status,
				(
					await handler(
						new Request(new URL(searchEndpoint("en"), DEMO), {
							headers: { "cf-connecting-ip": "203.0.113.7" },
						}),
					)
				).status,
			);
		}
		expect(new Set(refused)).toEqual(new Set([200, 400, 405]));
		expect(provider.calls).toHaveLength(0);

		// The minute's 20 are all still there.
		expect(await statuses(handler, VISITOR_MINUTE_LIMIT)).toEqual(
			Array(VISITOR_MINUTE_LIMIT).fill(200),
		);
		expect((await search(handler)).status).toBe(402);
	});

	it("logs no failed call when the visitor's limit refuses one", async () => {
		vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
		const onError = vi.fn();
		const handler = createDemoHandler(fakeProvider(answers, { costUsd: 0 }), {
			ledger: memoryLedger(),
			onError,
		});
		await statuses(handler, VISITOR_MINUTE_LIMIT);

		expect((await search(handler)).status).toBe(402);
		expect(onError).not.toHaveBeenCalled();
	});

	it("counts a request once when its call is retried (#219)", async () => {
		vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
		const ledger = memoryLedger();
		const visit = vi.spyOn(ledger, "visit");
		const provider = unavailableFirstProvider(
			[new ProviderUnavailableError("reset")],
			answers,
			{ costUsd: 0 },
		);
		const handler = createDemoHandler(provider, { ledger });

		expect((await search(handler)).status).toBe(200);

		expect(provider.calls).toHaveLength(2);
		expect(visit).toHaveBeenCalledTimes(1);
	});

	it("names the day's budget, not the visitor, once the budget is spent", async () => {
		vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
		const ledger = memoryLedger();
		const { handler } = demo(ledger);
		await statuses(handler, VISITOR_MINUTE_LIMIT);
		await ledger.add(utcDay(new Date()), DAILY_BUDGET_USD);

		const response = await search(handler);

		expect(await response.json()).toEqual(BUDGET_EXCEEDED);
	});

	it("leaves a request that names no visitor uncounted, as the local recording script sends", async () => {
		vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
		const { handler } = demo();

		expect(await statuses(handler, VISITOR_MINUTE_LIMIT + 1, null)).toEqual(
			Array(VISITOR_MINUTE_LIMIT + 1).fill(200),
		);
	});

	it("sets no cookie, on an answer or on the limit's 402", async () => {
		vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
		const { handler } = demo();
		const responses: Response[] = [];
		for (let i = 0; i <= VISITOR_MINUTE_LIMIT; i++) {
			responses.push(await search(handler));
		}

		expect(responses.at(-1)?.status).toBe(402);
		for (const response of responses) {
			expect(response.headers.get("set-cookie")).toBeNull();
		}
	});
});
