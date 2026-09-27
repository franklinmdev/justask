import {
	type Candidate,
	createSearchHandler,
	ProviderUnavailableError,
	type SearchHandlerConfig,
} from "justask";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	failingProvider,
	fakeProvider,
	hangingProvider,
	rawProvider,
	unavailableFirstProvider,
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

const picksAcme = {
	search: { acme: 0.93, northwind: 0.05, none: 0.02, several: 0 },
};

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

// The clock is the one stub beside the provider: today must be fixed to test
// midnight. setSystemTime alone fakes Date and leaves the timers real.
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
				probabilities: { acme: 0.93, northwind: 0.05, none: 0.02, several: 0 },
				gate: 0.5,
			},
		});
	});

	it("reports the call's cost in US dollars and its input tokens when the provider does", async () => {
		const response = await handler({
			provider: fakeProvider(picksAcme, {
				costUsd: 0.000005,
				inputTokens: 120,
			}),
		})(post(asked));

		const body = await response.json();
		expect(body.costUsd).toBe(0.000005);
		expect(body.inputTokens).toBe(120);
	});

	it("keeps the cost of a call whose answer broke the contract, since it was still made", async () => {
		const response = await handler({
			provider: rawProvider({}, { costUsd: 0.000005, inputTokens: 120 }),
		})(post(asked));

		const body = await response.json();
		expect(body.search.item).toBeNull();
		expect(body.error.kind).toBe("provider");
		expect(body.costUsd).toBe(0.000005);
		expect(body.inputTokens).toBe(120);
	});

	it("leaves cost and tokens out, never zero, when the provider reports neither", async () => {
		const body = await (await handler()(post(asked))).json();

		expect(body.search).toBeDefined();
		expect(body).not.toHaveProperty("costUsd");
		expect(body).not.toHaveProperty("inputTokens");
		expect(body).not.toHaveProperty("retried");
	});

	it("leaves out a cost or token count that is not a finite number, as an unknown one", async () => {
		const response = await handler({
			provider: fakeProvider(picksAcme, {
				costUsd: Number.NaN,
				inputTokens: Number.POSITIVE_INFINITY,
			}),
		})(post(asked));

		const body = await response.json();
		expect(body.search.item).not.toBeNull();
		expect(body).not.toHaveProperty("costUsd");
		expect(body).not.toHaveProperty("inputTokens");
	});

	it("says when ask called the provider twice, with the cost of the call that answered (ADR 0013)", async () => {
		const response = await handler({
			provider: unavailableFirstProvider(
				[new ProviderUnavailableError("529 high traffic")],
				picksAcme,
				{ costUsd: 0.000005, inputTokens: 120 },
			),
		})(post(asked));

		const body = await response.json();
		expect(body.error).toBeUndefined();
		expect(body.retried).toBe(true);
		// The first call threw, so it reported nothing to add.
		expect(body.costUsd).toBe(0.000005);
		expect(body.inputTokens).toBe(120);
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

	it.each([Number.POSITIVE_INFINITY, Number.NaN, 0, 2 ** 31])(
		"refuses a timeout of %s when it is created",
		(timeoutMs) => {
			expect(() => handler({ timeoutMs })).toThrow(/the timeout must be/);
		},
	);

	it.each([
		["a gate outside 0 to 1", { ...search, gate: 1.5 }, /gate/],
		[
			"a joiner of two words",
			{ ...search, joiners: { or: ["or else"], and: ["and"] } },
			/joiner/,
		],
	])(
		"refuses %s when it is created, not on each request",
		(_, bad, message) => {
			expect(() => handler({ search: bad })).toThrow(message);
		},
	);

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

	it("logs the full error to the server's console when no onError is passed, so a missing key is not silent", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const cause = new Error("No API key was provided");

		const response = await handler({ provider: failingProvider(cause) })(
			post(asked),
		);

		expect((await response.json()).error.kind).toBe("provider");
		expect(log).toHaveBeenCalledWith("justask: No API key was provided", cause);
		log.mockRestore();
	});

	it("still answers the held result when onError throws, and logs what it threw", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const broke = new Error("logger broke");

		const response = await handler({
			provider: failingProvider(new Error("down")),
			onError: () => {
				throw broke;
			},
		})(post(asked));

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			search: { item: null },
			error: { kind: "provider", message: "The provider failed" },
		});
		expect(log).toHaveBeenCalledWith("justask: onError threw", broke);
		log.mockRestore();
	});

	it("rejects when the host's shortlist throws, for the host's server to answer as its own error", async () => {
		const provider = fakeProvider(picksAcme);

		await expect(
			handler({
				provider,
				search: {
					...search,
					shortlist: () => {
						throw new Error("db down");
					},
				},
			})(post(asked)),
		).rejects.toThrow("db down");
		expect(provider.calls).toHaveLength(0);
	});

	it("leaves the console alone when onError is passed", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});

		await handler({
			provider: failingProvider(new Error("down")),
			onError: () => {},
		})(post(asked));

		expect(log).not.toHaveBeenCalled();
		log.mockRestore();
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

	it("aborts the provider call when the browser goes away, and answers nobody", async () => {
		const provider = hangingProvider();
		const browser = new AbortController();

		const pending = handler({ provider, timeoutMs: 5_000 })(
			new Request(post(asked), { signal: browser.signal }),
		);
		await expect.poll(() => provider.calls.length).toBe(1);
		browser.abort();

		expect((await pending).status).toBe(499);
		expect(provider.calls[0]?.signal.aborted).toBe(true);
	});

	it("rejects with the shortlist's own error when it throws as the browser goes away", async () => {
		const browser = new AbortController();

		await expect(
			handler({
				search: {
					...search,
					shortlist: () => {
						browser.abort();
						throw new Error("db down");
					},
				},
			})(new Request(post(asked), { signal: browser.signal })),
		).rejects.toThrow("db down");
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

	it.each([
		["text/plain;charset=UTF-8"],
		["application/x-www-form-urlencoded"],
		["multipart/form-data; boundary=x"],
		[null],
	])(
		"answers 415 without calling the provider for a body sent as %s, which another site can post without asking",
		async (type) => {
			const provider = fakeProvider(picksAcme);
			const request = post(asked);
			if (type === null) request.headers.delete("content-type");
			else request.headers.set("content-type", type);

			const response = await handler({ provider })(request);

			expect(response.status).toBe(415);
			expect(await response.json()).toEqual({
				error: {
					kind: "request",
					message: "The body must be sent as application/json",
				},
			});
			expect(provider.calls).toHaveLength(0);
		},
	);

	it("takes application/json with a charset, in any case", async () => {
		const request = post(asked);
		request.headers.set("content-type", "Application/JSON; charset=utf-8");

		expect((await handler()(request)).status).toBe(200);
	});

	it("names a short time zone it refuses, and does not echo a long one", async () => {
		const short = await handler()(post({ ...asked, timeZone: "Mars/Olympus" }));
		const long = await handler()(
			post({ ...asked, timeZone: "A".repeat(5_000) }),
		);

		expect((await short.json()).error.message).toBe(
			'"Mars/Olympus" is not a time zone',
		);
		expect((await long.json()).error.message).toBe(
			'"timeZone" is not a time zone',
		);
	});

	it("replaces a lone surrogate, which the provider refuses, before the call", async () => {
		const provider = fakeProvider(picksAcme);

		await handler({ provider })(
			post({ ...asked, request: "invoices from Acme \ud800 and \udc00 12" }),
		);

		expect(provider.calls[0]?.request).toBe(
			"invoices from Acme \ufffd and \ufffd 12",
		);
	});

	it("keeps a pair of surrogates, an emoji, as it is", async () => {
		const provider = fakeProvider(picksAcme);

		await handler({ provider })(
			post({ ...asked, request: "invoices from Acme 🧾" }),
		);

		expect(provider.calls[0]?.request).toBe("invoices from Acme 🧾");
	});

	it("answers 400 without calling the provider for a request over 1000 characters", async () => {
		const provider = fakeProvider(picksAcme);

		const response = await handler({ provider })(
			post({ ...asked, request: "a".repeat(1_001) }),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: {
				kind: "request",
				message: "The request is over 1000 characters",
			},
		});
		expect(provider.calls).toHaveLength(0);
	});

	it("takes a request of exactly 1000 characters", async () => {
		const provider = fakeProvider(picksAcme);

		const response = await handler({ provider })(
			post({ ...asked, request: "a".repeat(1_000) }),
		);

		expect(response.status).toBe(200);
		expect(provider.calls).toHaveLength(1);
	});

	it("answers 413 for a body over 16 KiB, without calling the provider", async () => {
		const provider = fakeProvider(picksAcme);
		const body = JSON.stringify({ ...asked, pad: "x".repeat(16 * 1024) });

		const response = await handler({ provider })(post(body));

		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({
			error: { kind: "request", message: "The body is over 16384 bytes" },
		});
		expect(provider.calls).toHaveLength(0);
	});

	it("stops reading a body that never ends once it passes 16 KiB", async () => {
		let pulled = 0;
		let cancelled = false;
		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled += 1024;
				controller.enqueue(new Uint8Array(1024).fill(0x20));
			},
			cancel() {
				cancelled = true;
			},
		});

		const response = await handler()(
			new Request("https://app.test/api/justask", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: endless,
				duplex: "half",
			} as RequestInit),
		);

		expect(response.status).toBe(413);
		expect(cancelled).toBe(true);
		expect(pulled).toBeLessThanOrEqual(20 * 1024);
	});

	it("answers 413 from a declared length over 16 KiB before reading the body", async () => {
		let pulled = 0;
		// No high-water mark, so the stream is pulled only when read.
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					pulled += 1;
					controller.close();
				},
			},
			{ highWaterMark: 0 },
		);

		const response = await handler()(
			new Request("https://app.test/api/justask", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"content-length": String(50 * 1024 * 1024),
				},
				body,
				duplex: "half",
			} as RequestInit),
		);

		expect(response.status).toBe(413);
		expect(pulled).toBe(0);
	});
});
