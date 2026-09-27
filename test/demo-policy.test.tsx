// @vitest-environment jsdom
// @module-tag page
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoHandler } from "../demo/server/handler.ts";
import { REQUEST_LIMIT, searchEndpoint } from "../demo/src/api.ts";
import { App } from "../demo/src/app.tsx";
import { english } from "../demo/src/content/en.ts";
import { expectNoAxeViolations } from "./checks.ts";
import { failingProvider, fakeProvider } from "./fake-provider.ts";

const DEMO = "http://localhost:5173";

/** Every English vendor at zero and none certain, so any search is answered. */
const provider = fakeProvider({
	search: {
		...Object.fromEntries(english.vendors.map(({ id }) => [id, 0])),
		none: 1,
		several: 0,
	},
});

const handler = createDemoHandler(provider);

/** The boxes' tests need no answer: the provider fails, as the showcase's does. */
const boxHandler = createDemoHandler(failingProvider(new Error("no call")));

/** A search posted to the demo's English route, from `origin` when given. */
function search(request: string, origin?: string): Promise<Response> {
	return handler(
		new Request(new URL(searchEndpoint("en"), DEMO), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(origin && { origin }),
			},
			body: JSON.stringify({ request, timeZone: "America/Santo_Domingo" }),
		}),
	);
}

afterEach(() => {
	cleanup();
	provider.calls.length = 0;
});

describe("the demo's server policy", () => {
	it("refuses a request from another origin, with no provider call", async () => {
		const response = await search("the caterers", "https://elsewhere.example");

		expect(response.status).toBe(403);
		expect(provider.calls).toHaveLength(0);
	});

	it("answers a request from the demo's own origin", async () => {
		const response = await search("the caterers", DEMO);

		expect(response.status).toBe(200);
		expect(provider.calls).toHaveLength(1);
	});

	it("answers a request that names no origin, as a script's does", async () => {
		const response = await search("the caterers");

		expect(response.status).toBe(200);
		expect(provider.calls).toHaveLength(1);
	});

	it(`refuses a request over ${REQUEST_LIMIT} characters, with no provider call`, async () => {
		const response = await search("a".repeat(REQUEST_LIMIT + 1), DEMO);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: {
				kind: "request",
				message: `The request is over ${REQUEST_LIMIT} characters`,
			},
		});
		expect(provider.calls).toHaveLength(0);
	});

	it(`answers a request of exactly ${REQUEST_LIMIT} characters`, async () => {
		const response = await search("a".repeat(REQUEST_LIMIT), DEMO);

		expect(response.status).toBe(200);
		expect(provider.calls).toHaveLength(1);
	});

	it("leaves a body that is not JSON to the core handler's own answer", async () => {
		const response = await handler(
			new Request(new URL(searchEndpoint("en"), DEMO), {
				method: "POST",
				headers: { "content-type": "application/json", origin: DEMO },
				body: "not json",
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: { kind: "request", message: "The body is not JSON" },
		});
	});
});

describe.each([
	["table", english.copy.filter.boxLabel],
	["form", english.copy.card.boxLabel],
	["search", english.copy.boxLabel],
])("the %s case's request box", (shownCase, label) => {
	it(`stops at ${REQUEST_LIMIT} characters`, async () => {
		history.replaceState(null, "", `/?case=${shownCase}`);
		const { container } = render(
			<App
				fetch={(input, init) =>
					boxHandler(new Request(new URL(String(input), location.href), init))
				}
				recordings={null}
			/>,
		);
		const user = userEvent.setup();
		const box = screen.getByRole("searchbox", { name: label });

		await user.click(box);
		await user.paste("a".repeat(REQUEST_LIMIT + 50));

		expect(box).toHaveProperty("value", "a".repeat(REQUEST_LIMIT));
		await expectNoAxeViolations(container);
	});
});
