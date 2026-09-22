import {
	APIConnectionError,
	APIUserAbortError,
	RateLimitError,
} from "@typesafe-ai/sdk";
import { ask, type Question } from "justask";
import { JEV_MODEL, jevProvider } from "justask/jev";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeJevClient, jevResult } from "./fake-provider.ts";

const vendor: Question = {
	id: "vendor",
	instruction: "Which vendor does the request mean?",
	labels: [
		{ label: "acme", description: "Acme Supplies, office paper" },
		{ label: "northwind", description: "Northwind Traders, catering" },
		{ label: "none", description: "None of these vendors" },
	],
};
const paid: Question = {
	id: "paid",
	instruction: "Does the request ask for paid invoices only?",
	labels: [
		{ label: "yes", description: "Only paid invoices" },
		{ label: "not_mentioned", description: "The request does not say" },
		{
			label: "not_available",
			description: "The request asks for something else",
		},
	],
};

const input = {
	request: "paid invoices from Acme",
	facts: { today: "2026-09-22", currency: "USD" },
	questions: [vendor, paid],
	signal: new AbortController().signal,
};

const answers = {
	vendor: { acme: 0.93, northwind: 0.05, none: 0.02 },
	paid: { yes: 0.8, not_mentioned: 0.15, not_available: 0.05 },
};

const base = {
	request: "invoices from Acme",
	facts: {},
	timeoutMs: 1_000,
	search: {
		description: "the vendor the request means",
		gate: 0.5,
		shortlist: () => [
			{ id: "acme", description: "Acme Supplies", value: 1 },
			{ id: "northwind", description: "Northwind Traders", value: 2 },
		],
	},
};

describe("jevProvider", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("sends every question in one systemOne call, as choice questions with every label, on jev-1.13.0", async () => {
		const client = fakeJevClient(async () => jevResult(answers));

		await jevProvider({ client }).answer(input);

		expect(JEV_MODEL).toBe("jev-1.13.0");
		expect(client.calls).toHaveLength(1);
		expect(client.calls[0]?.request).toEqual({
			model: "jev-1.13.0",
			state: {
				request: "paid invoices from Acme",
				facts: { today: "2026-09-22", currency: "USD" },
			},
			questions: {
				vendor: {
					type: "choice",
					instructions: "Which vendor does the request mean?",
					criteria: {
						acme: "Acme Supplies, office paper",
						northwind: "Northwind Traders, catering",
						none: "None of these vendors",
					},
				},
				paid: {
					type: "choice",
					instructions: "Does the request ask for paid invoices only?",
					criteria: {
						yes: "Only paid invoices",
						not_mentioned: "The request does not say",
						not_available: "The request asks for something else",
					},
				},
			},
		});
	});

	it("passes the caller's signal and turns the SDK's retries off", async () => {
		const client = fakeJevClient(async () => jevResult(answers));

		await jevProvider({ client }).answer(input);

		expect(client.calls[0]?.options?.signal).toBe(input.signal);
		expect(client.calls[0]?.options?.retry).toEqual({ maxRetries: 0 });
	});

	it("leaves the call's length to the developer's timeout, not the SDK's 10 s default", async () => {
		const client = fakeJevClient(async () => jevResult(answers));

		await jevProvider({ client }).answer(input);

		// setTimeout's ceiling: a larger value would fire at once.
		expect(client.calls[0]?.options?.timeout).toBe(2 ** 31 - 1);
	});

	it("returns a probability for every label of every question, and the call's cost from its input tokens", async () => {
		const client = fakeJevClient(async () => jevResult(answers));

		const result = await jevProvider({ client }).answer(input);

		expect(result.answers).toEqual(answers);
		// 120 input tokens at $0.042 per million; output tokens are free.
		expect(result.costUsd).toBeCloseTo(120 * 0.042e-6, 12);
	});

	it("resolves a search through ask", async () => {
		const client = fakeJevClient(async () =>
			jevResult({ search: { acme: 0.9, northwind: 0.08, none: 0.02 } }),
		);

		const result = await ask({
			...base,
			provider: jevProvider({ client }),
		});

		expect(result.error).toBeUndefined();
		expect(result.search.item).toBe(1);
		expect(result.search.pick).toEqual({ label: "acme", probability: 0.9 });
	});

	it.each([
		[
			"a rate limit",
			new RateLimitError(429, { error: "slow down" }, new Headers()),
		],
		["a lost connection", new APIConnectionError("socket hang up")],
	])(
		"maps %s to the typed provider error, keeping the SDK's error as the cause",
		async (_, cause) => {
			const client = fakeJevClient(() => Promise.reject(cause));

			const result = await ask({
				...base,
				provider: jevProvider({ client }),
			});

			expect(client.calls).toHaveLength(1);
			expect(result.error).toEqual({
				kind: "provider",
				message: cause.message,
				cause,
			});
			expect(result.search.item).toBeNull();
		},
	);

	it("maps an answer that leaves a label out to the typed provider error", async () => {
		const client = fakeJevClient(async () =>
			jevResult({ search: { acme: 0.98, none: 0.02 } }),
		);

		const result = await ask({
			...base,
			provider: jevProvider({ client }),
		});

		expect(result.error?.kind).toBe("provider");
		expect(result.search.item).toBeNull();
	});

	it("aborts the SDK call when the developer's timeout runs out", async () => {
		const client = fakeJevClient(
			({ options }) =>
				new Promise((_, reject) => {
					options?.signal?.addEventListener("abort", () =>
						reject(new APIUserAbortError()),
					);
				}),
		);

		const result = await ask({
			...base,
			timeoutMs: 20,
			provider: jevProvider({ client }),
		});

		expect(result.error).toMatchObject({ kind: "timeout", timeoutMs: 20 });
		expect(client.calls[0]?.options?.signal?.aborted).toBe(true);
	});

	it("maps a missing TYPESAFE_API_KEY to the typed provider error, not a crash at setup", async () => {
		vi.stubEnv("TYPESAFE_API_KEY", "");
		const provider = jevProvider();

		const result = await ask({ ...base, provider });

		expect(result.error?.kind).toBe("provider");
		expect(result.error?.message).toContain("TYPESAFE_API_KEY");
	});

	it("sends the key from TYPESAFE_API_KEY and makes one attempt, without retries", async () => {
		vi.stubEnv("TYPESAFE_API_KEY", "key-from-the-server-environment");
		vi.stubEnv("TYPESAFE_BASE_URL", "");
		const sent: Request[] = [];
		vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
			sent.push(new Request(url, init));
			return new Response("unavailable", { status: 503 });
		});

		const result = await ask({
			...base,
			provider: jevProvider(),
		});

		expect(sent).toHaveLength(1);
		expect(sent[0]?.url).toBe("https://api.typesafe.ai/v1/systemone");
		expect(sent[0]?.headers.get("authorization")).toBe(
			"Bearer key-from-the-server-environment",
		);
		expect(await sent[0]?.json()).toMatchObject({ model: "jev-1.13.0" });
		expect(result.error?.kind).toBe("provider");
	});
});
