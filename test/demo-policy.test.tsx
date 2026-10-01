// @vitest-environment jsdom
// @module-tag page
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoHandler } from "../demo/server/handler.ts";
import { REQUEST_LIMIT, searchEndpoint } from "../demo/src/api.ts";
import { App } from "../demo/src/app.tsx";
import { english } from "../demo/src/content/en.ts";
import { spanish } from "../demo/src/content/es.ts";
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

	it("refuses a Worker's subrequest, which can name any visitor address, with no provider call (#263)", async () => {
		const response = await handler(
			new Request(new URL(searchEndpoint("en"), DEMO), {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"cf-worker": "elsewhere.workers.dev",
					"cf-connecting-ip": "203.0.113.1",
				},
				body: JSON.stringify({
					request: "the caterers",
					timeZone: "America/Santo_Domingo",
				}),
			}),
		);

		expect(response.status).toBe(403);
		expect(provider.calls).toHaveLength(0);
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

	it("stops reading a body that never ends once it passes the handler's 16 KiB, as the dev server streams it", async () => {
		let pulled = 0;
		let cancelled = false;
		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled += 1024;
				// A policy that reads it all errors here, rather than holding the test forever.
				if (pulled > 1024 * 1024) controller.error(new Error("read it all"));
				else controller.enqueue(new Uint8Array(1024).fill(0x20));
			},
			cancel() {
				cancelled = true;
			},
		});

		const response = await handler(
			new Request(new URL(searchEndpoint("en"), DEMO), {
				method: "POST",
				headers: { "content-type": "application/json", origin: DEMO },
				body: endless,
				duplex: "half",
			} as RequestInit),
		);

		expect(response.status).toBe(413);
		expect(cancelled).toBe(true);
		expect(pulled).toBeLessThanOrEqual(40 * 1024);
		expect(provider.calls).toHaveLength(0);
	});
});

describe.each([
	["table", "en", english.copy.filter.boxLabel],
	["form", "en", english.copy.card.boxLabel],
	["search", "en", english.copy.boxLabel],
	["form", "es", spanish.copy.card.boxLabel],
])("the %s case's request box (%s)", (shownCase, lang, label) => {
	const cut =
		lang === "en"
			? `Requests stop at ${REQUEST_LIMIT} characters, so the rest was left out.`
			: `Las solicitudes llegan hasta ${REQUEST_LIMIT} caracteres, así que el resto quedó fuera.`;

	function renderBox() {
		history.replaceState(null, "", `/?case=${shownCase}&lang=${lang}`);
		const { container } = render(
			<App
				fetch={(input, init) =>
					boxHandler(new Request(new URL(String(input), location.href), init))
				}
				recordings={null}
			/>,
		);
		return {
			container,
			user: userEvent.setup(),
			box: screen.getByRole("searchbox", { name: label }),
		};
	}

	it(`stops at ${REQUEST_LIMIT} characters, and says the rest was left out (#225)`, async () => {
		const { container, user, box } = renderBox();

		await user.click(box);
		await user.paste("a".repeat(REQUEST_LIMIT + 50));

		expect(box).toHaveProperty("value", "a".repeat(REQUEST_LIMIT));
		expect(screen.getByText(cut)).toBeDefined();
		expect(box.getAttribute("aria-describedby")?.split(" ")).toContain(
			screen.getByText(cut).id,
		);
		await expectNoAxeViolations(container);
	});

	it("says so when a key is pressed at the limit, and stops saying it once the request is shorter (#225)", async () => {
		const { user, box } = renderBox();
		await user.click(box);
		await user.paste("a".repeat(REQUEST_LIMIT));
		expect(screen.queryByText(cut)).toBeNull();

		await user.keyboard("b");
		expect(screen.getByText(cut)).toBeDefined();

		await user.keyboard("{Backspace}");
		expect(screen.queryByText(cut)).toBeNull();
	});
});
