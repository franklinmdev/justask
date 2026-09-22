import {
	type Candidate,
	createSearchHandler,
	type SearchHandlerConfig,
} from "justask";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	failingProvider,
	fakeProvider,
	hangingProvider,
} from "./fake-provider.ts";

type Vendor = { id: number; name: string };

const acme: Candidate<Vendor> = {
	id: "acme",
	description: "Acme Supplies, office paper and toner",
	value: { id: 1, name: "Acme Supplies" },
};
const northwind: Candidate<Vendor> = {
	id: "northwind",
	description: "Northwind Traders, catering",
	value: { id: 2, name: "Northwind Traders" },
};

const search = {
	description: "the vendor the request means",
	gate: 0.5,
	shortlist: () => [acme, northwind],
};

const picksAcme = { search: { acme: 0.93, northwind: 0.05, none: 0.02 } };

function handler(overrides: Partial<SearchHandlerConfig<Vendor>> = {}) {
	return createSearchHandler<Vendor>({
		provider: fakeProvider(picksAcme),
		timeoutMs: 1_000,
		facts: { local_currency: "USD" },
		search,
		...overrides,
	});
}

function post(body: unknown) {
	return new Request("https://app.test/api/justask", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

const asked = { request: "invoices from Acme", timeZone: "UTC" };

afterEach(() => {
	vi.useRealTimers();
});

describe("createSearchHandler", () => {
	it("answers a search request with the result as JSON", async () => {
		const response = await handler()(post(asked));

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toMatch(/^application\/json/);
		expect(await response.json()).toEqual({
			search: {
				item: { id: 1, name: "Acme Supplies" },
				candidates: [acme, northwind],
				pick: { label: "acme", probability: 0.93 },
				probabilities: { acme: 0.93, northwind: 0.05, none: 0.02 },
				gate: 0.5,
			},
		});
	});

	it("writes today in the browser's time zone and the configured facts, in one provider call", async () => {
		vi.setSystemTime(new Date("2026-09-22T15:00:00Z"));
		const provider = fakeProvider(picksAcme);

		await handler({ provider })(post(asked));

		expect(provider.calls).toHaveLength(1);
		expect(provider.calls[0]?.request).toBe("invoices from Acme");
		expect(provider.calls[0]?.facts).toEqual({
			today: "Today is Tuesday 2026-09-22 (martes 22 de septiembre de 2026).",
			local_currency: "USD",
		});
	});

	it.each([
		// 22:30 on Monday in Santo Domingo is already Tuesday in UTC.
		[
			"America/Santo_Domingo",
			"Today is Monday 2026-09-21 (lunes 21 de septiembre de 2026).",
		],
		["UTC", "Today is Tuesday 2026-09-22 (martes 22 de septiembre de 2026)."],
		// And in Auckland it is Tuesday afternoon.
		[
			"Pacific/Auckland",
			"Today is Tuesday 2026-09-22 (martes 22 de septiembre de 2026).",
		],
	])("near midnight, reads today in %s", async (timeZone, today) => {
		vi.setSystemTime(new Date("2026-09-22T02:30:00Z"));
		const provider = fakeProvider(picksAcme);

		await handler({ provider })(post({ ...asked, timeZone }));

		expect(provider.calls[0]?.facts.today).toBe(today);
	});

	it("reads a date ahead of UTC just before UTC midnight", async () => {
		vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
		const provider = fakeProvider(picksAcme);

		await handler({ provider })(post({ ...asked, timeZone: "Asia/Tokyo" }));

		expect(provider.calls[0]?.facts.today).toBe(
			"Today is Friday 2027-01-01 (viernes 1 de enero de 2027).",
		);
	});

	it("ignores facts the browser sends, so only the server's configuration becomes facts", async () => {
		const provider = fakeProvider(picksAcme);

		await handler({ provider })(
			post({
				...asked,
				facts: { local_currency: "EUR", today: "Today is 1999-01-01." },
			}),
		);

		expect(provider.calls[0]?.facts.local_currency).toBe("USD");
		expect(provider.calls[0]?.facts.today).not.toContain("1999");
	});

	it("works with no configured facts", async () => {
		const provider = fakeProvider(picksAcme);
		await createSearchHandler<Vendor>({ provider, timeoutMs: 1_000, search })(
			post(asked),
		);

		expect(Object.keys(provider.calls[0]?.facts ?? {})).toEqual(["today"]);
	});

	it("refuses a configured today fact, which the handler writes itself", () => {
		expect(() => handler({ facts: { today: "Today is 2026-09-22." } })).toThrow(
			TypeError,
		);
	});

	it("holds everything and sends a typed error without the cause when the provider fails", async () => {
		const secret = "sk-server-only-123";
		const cause = Object.assign(new Error(`401 for key ${secret}`), {
			key: secret,
		});
		const onError = vi.fn();

		const response = await handler({
			provider: failingProvider(cause),
			onError,
		})(post(asked));

		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).not.toContain(secret);
		expect(JSON.parse(text)).toEqual({
			search: {
				item: null,
				candidates: [acme, northwind],
				pick: null,
				probabilities: {},
				gate: 0.5,
			},
			error: { kind: "provider", message: "The provider failed" },
		});
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "provider", cause }),
		);
	});

	it("holds everything and sends a timeout error when the provider outlasts the timeout", async () => {
		const response = await handler({
			provider: hangingProvider(),
			timeoutMs: 20,
		})(post(asked));

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.search.item).toBeNull();
		expect(body.error).toEqual({
			kind: "timeout",
			message: "The provider did not answer within 20 ms",
			timeoutMs: 20,
		});
	});

	it("refuses anything but POST", async () => {
		const response = await handler()(
			new Request("https://app.test/api/justask"),
		);

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("POST");
	});

	it.each([
		["a body that is not JSON", "request=acme"],
		["a body that is not an object", "[]"],
		["no request", { timeZone: "UTC" }],
		["a request that is not text", { request: 42, timeZone: "UTC" }],
		["no time zone", { request: "acme" }],
		[
			"a time zone that does not exist",
			{ request: "acme", timeZone: "Mars/Olympus" },
		],
	])("answers 400 without calling the provider for %s", async (_, body) => {
		const provider = fakeProvider(picksAcme);

		const response = await handler({ provider })(post(body));

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: { kind: "request", message: expect.any(String) },
		});
		expect(provider.calls).toHaveLength(0);
	});
});
