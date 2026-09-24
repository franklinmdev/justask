import {
	type Candidate,
	createFilterHandler,
	type FilterHandlerConfig,
	ProviderUnavailableError,
} from "justask";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	failingProvider,
	fakeProvider,
	rawProvider,
	unavailableFirstProvider,
} from "./fake-provider.ts";

type Status = "paid" | "open";

const paid: Candidate<Status> = {
	id: "paid",
	description: "paid invoices",
	value: "paid",
};
const open: Candidate<Status> = {
	id: "open",
	description: "open invoices, not paid yet",
	value: "open",
};

const filter = {
	description: "invoices, one row per invoice",
	fields: {
		status: {
			kind: "catalog" as const,
			description: "the status of the invoices",
			gate: 0.8,
			shortlist: () => [paid, open],
		},
		date: {
			kind: "date" as const,
			description: "the invoice date",
			gate: 0.8,
		},
	},
};

type Fields = typeof filter.fields;

const picks = {
	status: { paid: 0.93, open: 0.03, not_mentioned: 0.02, not_available: 0.02 },
	date_from: { d0: 0.95, not_mentioned: 0.03, not_available: 0.02 },
	date_to: { d0: 0.94, not_mentioned: 0.04, not_available: 0.02 },
};

function handler(overrides: Partial<FilterHandlerConfig<Fields>> = {}) {
	return createFilterHandler<Fields>({
		provider: fakeProvider(picks),
		timeoutMs: 1_000,
		facts: { local_currency: "USD" },
		filter,
		...overrides,
	});
}

function post(body: unknown) {
	return new Request("https://app.test/api/filter", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

const asked = { request: "paid invoices from last month", timeZone: "UTC" };

// The clock is the one stub beside the provider, faked for Date alone.
afterEach(() => {
	vi.useRealTimers();
});

describe("createFilterHandler", () => {
	it("answers a filter request with the filter object and every field's result as JSON", async () => {
		vi.setSystemTime(new Date("2026-09-22T15:00:00Z"));

		const response = await handler()(post(asked));

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.error).toBeUndefined();
		expect(body.filter.value).toEqual({
			status: "paid",
			date: { from: "2026-08-01", to: "2026-08-31" },
		});
		expect(body.filter.fields.status).toEqual({
			candidates: [paid, open],
			pick: { label: "paid", probability: 0.93 },
			probabilities: picks.status,
			gate: 0.8,
		});
		expect(Object.keys(body.filter.fields.date.answers)).toEqual([
			"from",
			"to",
		]);
	});

	it("reports the call's cost in US dollars and its input tokens when the provider does", async () => {
		const response = await handler({
			provider: fakeProvider(picks, { costUsd: 0.000005, inputTokens: 120 }),
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
		expect(body.filter.value).toEqual({});
		expect(body.error.kind).toBe("provider");
		expect(body.costUsd).toBe(0.000005);
		expect(body.inputTokens).toBe(120);
	});

	it("leaves cost and tokens out, never zero, when the provider reports neither", async () => {
		const body = await (await handler()(post(asked))).json();

		expect(body.filter).toBeDefined();
		expect(body).not.toHaveProperty("costUsd");
		expect(body).not.toHaveProperty("inputTokens");
		expect(body).not.toHaveProperty("retried");
	});

	it("says when ask called the provider twice, with the cost of the call that answered (ADR 0013)", async () => {
		const response = await handler({
			provider: unavailableFirstProvider(
				[new ProviderUnavailableError("529 high traffic")],
				picks,
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

	it("reads last month from today in the browser's time zone", async () => {
		// 22:30 on 31 August in Santo Domingo is already 1 September in UTC.
		vi.setSystemTime(new Date("2026-09-01T02:30:00Z"));
		const provider = fakeProvider(picks);

		const response = await handler({ provider })(
			post({ ...asked, timeZone: "America/Santo_Domingo" }),
		);

		expect(provider.calls[0]?.facts).toEqual({
			today: "Today is Monday 2026-08-31 (lunes 31 de agosto de 2026).",
			local_currency: "USD",
		});
		expect((await response.json()).filter.value.date).toEqual({
			from: "2026-07-01",
			to: "2026-07-31",
		});
	});

	it("holds every field and sends a typed error without the cause when the provider fails", async () => {
		const onError = vi.fn();

		const response = await handler({
			provider: failingProvider(new Error("401: key sk-secret is invalid")),
			onError,
		})(post(asked));

		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).not.toContain("sk-secret");
		const body = JSON.parse(text);
		expect(body.filter.value).toEqual({});
		expect(body.error).toEqual({
			kind: "provider",
			message: "The provider failed",
		});
		expect(onError).toHaveBeenCalledOnce();
	});

	it("refuses a body without a request, as the search handler does", async () => {
		const response = await handler()(post({ timeZone: "UTC" }));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: { kind: "request", message: '"request" must be a string' },
		});
	});

	it("refuses a configured today fact, which the handler writes itself", () => {
		expect(() => handler({ facts: { today: "2026-09-22" } })).toThrow(/today/);
	});
});
