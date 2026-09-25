// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { APIError } from "@typesafe-ai/sdk";
import type { Provider } from "justask";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
	DAILY_BUDGET_USD,
	memoryLedger,
	utcDay,
} from "../demo/server/budget.ts";
import { createDemoHandler } from "../demo/server/handler.ts";
import { App } from "../demo/src/app.tsx";
import { english } from "../demo/src/content/en.ts";
import { expectNoAxeViolations, warmUp } from "./checks.ts";
import { failingProvider } from "./fake-provider.ts";

/** Where the notice sends a visitor to run justask on their own key. */
const REPO = "https://github.com/franklinmdev/justask";

/**
 * The demo on its handler served in process, opening idle on `url`. With the
 * day's budget `spent`, or the kill switch on, every live request gets the
 * budget's 402; the provider is never reached then.
 */
async function renderDemo({
	url = "/?case=search",
	spent = false,
	killSwitch = false,
	provider = failingProvider(new Error("no call")),
}: {
	url?: string;
	spent?: boolean;
	killSwitch?: boolean;
	provider?: Provider;
} = {}) {
	history.replaceState(null, "", url);
	const ledger = memoryLedger();
	if (spent) await ledger.add(utcDay(new Date()), DAILY_BUDGET_USD);
	const handler = createDemoHandler(provider, { ledger, killSwitch });
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

beforeAll(() =>
	warmUp(() => {
		history.replaceState(null, "", "/?case=search");
		return render(<App recordings={null} />);
	}),
);

/** Types `request` in the Search case's box, a live request. */
async function typeRequest(
	user: ReturnType<typeof userEvent.setup>,
	label: string,
	request: string,
) {
	await user.type(screen.getByRole("searchbox", { name: label }), request);
}

afterEach(cleanup);

describe("a live request past the day's budget", () => {
	it("says the budget is spent, in place of the case, and offers the clone link", async () => {
		const { user } = await renderDemo({ spent: true });

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
		expect(
			screen.getByText("It starts over at midnight UTC.", { exact: false }),
		).toBeDefined();
	});

	it("passes axe", async () => {
		const { container, user } = await renderDemo({ spent: true });
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
		const { user } = await renderDemo({ spent: true });
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
		const { user } = await renderDemo({
			url: "/?case=search&lang=es",
			spent: true,
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
		const { user } = await renderDemo({
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

describe("a live request while the kill switch is on", () => {
	it.each([
		{
			language: "en",
			box: english.copy.boxLabel,
			title: "The live demo is paused",
			clone: "Clone justask and run it with your own key",
		},
		{
			language: "es",
			box: "Buscar un proveedor",
			title: "La demostración en vivo está en pausa",
			clone: "Clonar justask y usarlo con su propia clave",
		},
	])(
		"says in $language the live demo is paused, and never when it comes back",
		async ({ language, box, title, clone }) => {
			const { user } = await renderDemo({
				url: `/?case=search&lang=${language}`,
				killSwitch: true,
			});

			await typeRequest(user, box, "the caterers");

			const heading = await screen.findByRole("heading", { name: title });
			const notice = heading.closest("section");
			expect(screen.getByRole("link", { name: clone })).toHaveProperty(
				"href",
				REPO,
			);
			// The owner ends the pause; no hour, midnight or UTC promises a return.
			expect(notice?.textContent).not.toMatch(
				/midnight|medianoche|UTC|tomorrow|mañana|\d{1,2}(:\d{2})? ?(a\.?m|p\.?m|h)\b/i,
			);
		},
	);
});
