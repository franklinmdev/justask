// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { APIError } from "@typesafe-ai/sdk";
import type { Provider } from "justask";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDemoHandler } from "../demo/server/handler.ts";
import { App } from "../demo/src/app.tsx";
import { english } from "../demo/src/content/en.ts";
import { expectNoAxeViolations, warmUp } from "./checks.ts";
import { failingProvider } from "./fake-provider.ts";

/** Where the notice sends a visitor to run justask on their own key. */
const REPO = "https://github.com/franklinmdev/justask";

/**
 * The demo on its handler served in process, opening idle on `url`. With the
 * kill switch on, every live request gets the budget's answer; the provider
 * is never reached then.
 */
function renderDemo({
	url = "/?case=search",
	killSwitch = false,
	provider = failingProvider(new Error("no call")),
}: {
	url?: string;
	killSwitch?: boolean;
	provider?: Provider;
} = {}) {
	history.replaceState(null, "", url);
	const handler = createDemoHandler(provider, { killSwitch });
	const { container } = render(
		<App
			fetch={(input, init) =>
				handler(new Request(new URL(String(input), location.href), init))
			}
			recordings={null}
		/>,
	);
	return { container, user: userEvent.setup() };
}

beforeAll(() => warmUp(() => renderDemo()));

afterEach(cleanup);

describe("a live request past the day's budget", () => {
	it("says the budget is spent, in place of the case, and offers the clone link", async () => {
		const { user } = renderDemo({ killSwitch: true });

		await user.type(
			screen.getByRole("searchbox", { name: english.copy.boxLabel }),
			"the caterers",
		);

		const heading = await screen.findByRole("heading", {
			name: "The demo's budget for today is spent",
		});
		// Focus follows the page that replaced the box, so a keyboard is not left on nothing.
		expect(document.activeElement).toBe(heading);
		expect(
			screen.getByRole("link", {
				name: "Clone justask and run it with your own key",
			}),
		).toHaveProperty("href", REPO);
		// Never a result with everything held: the case is gone.
		expect(screen.queryByRole("searchbox")).toBeNull();
	});

	it("passes axe", async () => {
		const { container, user } = renderDemo({ killSwitch: true });
		await user.type(
			screen.getByRole("searchbox", { name: english.copy.boxLabel }),
			"the caterers",
		);
		await screen.findByRole("heading", {
			name: "The demo's budget for today is spent",
		});

		await expectNoAxeViolations(container);
	});

	it("gives the case back when the visitor opens another", async () => {
		const { user } = renderDemo({ killSwitch: true });
		await user.type(
			screen.getByRole("searchbox", { name: english.copy.boxLabel }),
			"the caterers",
		);
		await screen.findByRole("heading", {
			name: "The demo's budget for today is spent",
		});

		await user.click(screen.getByRole("tab", { name: "Table" }));

		expect(
			screen.getByRole("searchbox", { name: english.copy.filter.boxLabel }),
		).toBeDefined();
		expect(
			screen.queryByRole("heading", {
				name: "The demo's budget for today is spent",
			}),
		).toBeNull();
	});

	it("says so in Spanish", async () => {
		const { user } = renderDemo({
			url: "/?case=search&lang=es",
			killSwitch: true,
		});

		await user.type(
			screen.getByRole("searchbox", { name: "Buscar un proveedor" }),
			"los del catering",
		);

		expect(
			await screen.findByRole("heading", {
				name: "Se agotó el presupuesto de hoy de la demostración",
			}),
		).toBeDefined();
		expect(
			screen.getByRole("link", {
				name: "Clonar justask y usarlo con su propia clave",
			}),
		).toHaveProperty("href", REPO);
	});
});

describe("a refusal of the owner's key", () => {
	it("says the demo's own key is out of service, not a misread request", async () => {
		const { user } = renderDemo({
			provider: failingProvider(
				APIError.fromResponse(401, { error: "invalid key" }, new Headers()),
			),
		});

		await user.type(
			screen.getByRole("searchbox", { name: english.copy.boxLabel }),
			"the caterers",
		);

		expect(
			await screen.findByRole("heading", {
				name: "The demo's own key is out of service right now",
			}),
		).toBeDefined();
		expect(
			screen.getByText("This is not justask misreading your request.", {
				exact: false,
			}),
		).toBeDefined();
		expect(
			screen.getByRole("link", {
				name: "Clone justask and run it with your own key",
			}),
		).toHaveProperty("href", REPO);
	});
});
