import { describe, expect, it } from "vitest";
import { unstable_readConfig } from "wrangler";
import { english } from "../demo/src/content/en.ts";
import { createWorker } from "../demo/worker/index.ts";
import { fakeProvider } from "./fake-provider.ts";

/** "the catering people" read as Larkspur Catering, every other vendor at nothing. */
const answers = {
	search: {
		...Object.fromEntries(english.vendors.map(({ id }) => [id, 0])),
		several: 0,
		larkspur: 0.94,
		none: 0.01,
	},
};

function post(path: string, request: string): Request {
	return new Request(`https://demo.example${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ request, timeZone: "America/Santo_Domingo" }),
	});
}

describe("the demo's Worker", () => {
	it("answers a flow's route through the demo's handler", async () => {
		const provider = fakeProvider(answers);
		const worker = createWorker(provider);

		const response = await worker.fetch(
			post("/api/search/en", "the catering people"),
		);

		expect(response.status).toBe(200);
		expect(provider.calls).toHaveLength(1);
	});

	it("answers 404 with no provider call for a path that is no flow's route", async () => {
		const provider = fakeProvider(answers);
		const worker = createWorker(provider);

		const response = await worker.fetch(
			post("/api/nothing/en", "the catering people"),
		);

		expect(response.status).toBe(404);
		expect(provider.calls).toHaveLength(0);
	});

	it("runs with request.signal on, so the handler stops the provider call when the browser leaves (#176)", () => {
		// No default-on date, and local workerd cannot show it: see docs/workers.md, The browser's abort.
		const { compatibility_flags } = unstable_readConfig({
			config: "wrangler.jsonc",
		});

		expect(compatibility_flags).toContain("enable_request_signal");
	});
});
