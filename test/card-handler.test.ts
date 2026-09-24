import {
	type Candidate,
	type CardHandlerConfig,
	createCardHandler,
} from "justask";
import { afterEach, describe, expect, it, vi } from "vitest";
import { failingProvider, fakeProvider, rawProvider } from "./fake-provider.ts";

type Vendor = { name: string };

const northwind: Candidate<Vendor> = {
	id: "northwind",
	description: "Northwind Catering",
	value: { name: "Northwind" },
};

const card = {
	description: "expense the person paid",
	gate: 0.8,
	fields: {
		vendor: {
			kind: "catalog" as const,
			description: "the vendor who was paid",
			gate: 0.8,
			shortlist: () => [northwind],
		},
		spent_on: {
			kind: "date" as const,
			reads: "past" as const,
			description: "the day the money was spent",
			gate: 0.8,
		},
	},
};

type Fields = typeof card.fields;

const picks = {
	intent: { new_record: 0.96, not_mentioned: 0.02, not_available: 0.02 },
	vendor: { northwind: 0.93, not_mentioned: 0.04, not_available: 0.03 },
	spent_on: { d0: 0.95, not_mentioned: 0.03, not_available: 0.02 },
};

function handler(overrides: Partial<CardHandlerConfig<Fields>> = {}) {
	return createCardHandler<Fields>({
		provider: fakeProvider(picks),
		timeoutMs: 1_000,
		facts: { local_currency: "USD" },
		card,
		...overrides,
	});
}

function post(body: unknown) {
	return new Request("https://app.test/api/card", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

const asked = { request: "lunch with Northwind yesterday", timeZone: "UTC" };

// The clock is the one stub beside the provider, faked for Date alone.
afterEach(() => {
	vi.useRealTimers();
});

describe("createCardHandler", () => {
	it("answers a card request with the record, the intent and every field's result as JSON", async () => {
		vi.setSystemTime(new Date("2026-09-22T15:00:00Z"));

		const response = await handler()(post(asked));

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.error).toBeUndefined();
		expect(body.card.value).toEqual({
			vendor: { name: "Northwind" },
			spent_on: "2026-09-21",
		});
		expect(body.card.intent).toEqual({
			pick: { label: "new_record", probability: 0.96 },
			probabilities: picks.intent,
			gate: 0.8,
			passes: true,
		});
		expect(body.card.fields.vendor.candidates).toEqual([northwind]);
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
		expect(body.card.value).toEqual({});
		expect(body.error.kind).toBe("provider");
		expect(body.costUsd).toBe(0.000005);
		expect(body.inputTokens).toBe(120);
	});

	it("leaves cost and tokens out, never zero, when the provider reports neither", async () => {
		const body = await (await handler()(post(asked))).json();

		expect(body.card).toBeDefined();
		expect(body).not.toHaveProperty("costUsd");
		expect(body).not.toHaveProperty("inputTokens");
	});

	it("reads yesterday from today in the browser's time zone", async () => {
		// 22:30 on 21 September in Santo Domingo is already 22 September in UTC.
		vi.setSystemTime(new Date("2026-09-22T02:30:00Z"));

		const response = await handler()(
			post({ ...asked, timeZone: "America/Santo_Domingo" }),
		);

		expect((await response.json()).card.value.spent_on).toBe("2026-09-20");
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
		expect(body.card.value).toEqual({});
		expect(body.error).toEqual({
			kind: "provider",
			message: "The provider failed",
		});
		expect(onError).toHaveBeenCalledOnce();
	});

	it("refuses a body without a time zone, as the other handlers do", async () => {
		const response = await handler()(post({ request: "lunch" }));

		expect(response.status).toBe(400);
		expect((await response.json()).error.kind).toBe("request");
	});
});
