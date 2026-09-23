// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import axe from "axe-core";
import {
	type Candidate,
	type CardValue,
	createCardHandler,
	type Probabilities,
	type Provider,
} from "justask";
import {
	CardBox,
	CardConfirm,
	CardEntry,
	CardStatus,
	type CardTiming,
	CardUndo,
	type UseCard,
	useCard,
} from "justask/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { failingProvider, fakeProvider } from "./fake-provider.ts";

type Vendor = { id: string; name: string };
type Tag = "meals" | "travel";

const vendors: Candidate<Vendor>[] = [
	{
		id: "northwind",
		description: "Northwind Catering",
		value: { id: "northwind", name: "Northwind" },
	},
	{
		id: "acme",
		description: "Acme Office Supply",
		value: { id: "acme", name: "Acme" },
	},
];
const tags: Candidate<Tag>[] = [
	{ id: "meals", description: "Meals: lunch, dinner, coffee", value: "meals" },
	{ id: "travel", description: "Travel: taxi, flight, hotel", value: "travel" },
];

const expense = {
	description: "expense the person paid",
	gate: 0.8,
	fields: {
		vendor: {
			kind: "catalog" as const,
			description: "the vendor who was paid",
			gate: 0.8,
			shortlist: () => vendors,
		},
		tags: {
			kind: "catalog" as const,
			several: true as const,
			description: "the expense's tags",
			gate: 0.8,
			shortlist: () => tags,
		},
		spent_on: {
			kind: "date" as const,
			reads: "past" as const,
			description: "the day the money was spent",
			gate: 0.8,
		},
		total: {
			kind: "amount" as const,
			description: "the amount paid",
			gate: 0.8,
		},
	},
};

type Fields = typeof expense.fields;

const MISSING = ["not_mentioned", "not_available"];

/** Every label near zero, and `winner` at `p`. */
function answer(labels: string[], winner: string, p = 0.95): Probabilities {
	return Object.fromEntries(
		labels.map((label) => [label, label === winner ? p : 0.01]),
	);
}

const yes = ["yes", ...MISSING];

/** A lunch with Northwind yesterday for $42, its tags said. */
const fills = {
	intent: answer(["new_record", ...MISSING], "new_record"),
	vendor: answer(["northwind", "acme", ...MISSING], "northwind"),
	tags_meals: answer(yes, "yes"),
	tags_travel: answer(yes, "not_mentioned"),
	spent_on: answer(["d0", ...MISSING], "d0"),
	total: answer(["a0", ...MISSING], "a0"),
};
/** The vendor below its gate: held, and shown exactly as an empty field. */
const holdsVendor = {
	...fills,
	vendor: { ...fills.vendor, northwind: 0.55, acme: 0.41 },
};
/** A question about expenses, not a new one: every field held. */
const notARecord = {
	...fills,
	intent: answer(["new_record", ...MISSING], "not_available"),
};

const lunch = "lunch with Northwind yesterday, $42";

/**
 * The page a host app would write, served by the real card handler in
 * process: the hook's `fetch` hands each request to the handler, whose
 * provider is the fake. The host saves and owns undo.
 */
function renderCard({
	provider,
	timing,
}: {
	provider: Provider;
	timing?: CardTiming;
}) {
	vi.setSystemTime(new Date("2026-09-22T15:00:00Z"));
	const handler = createCardHandler<Fields>({
		provider,
		timeoutMs: 1_000,
		facts: { local_currency: "USD" },
		card: expense,
	});
	const onConfirm = vi.fn<(value: CardValue<Fields>) => void>();
	const onUndo = vi.fn();
	const seen: { card: UseCard<Fields> | null } = { card: null };

	function Page() {
		const card = useCard<Fields>({
			endpoint: "/api/card",
			...(timing && { timing }),
			onConfirm,
			fetch: (input, init) =>
				handler(new Request(new URL(String(input), location.href), init)),
		});
		seen.card = card;
		return (
			<main>
				<CardBox card={card} label="Describe the expense" />
				<CardStatus
					card={card}
					announce={({ filled, waiting }) =>
						`Filled: ${filled.join(", ") || "nothing"}. Waiting for you: ${waiting.join(", ") || "nothing"}.`
					}
				/>
				<CardEntry card={card} name="vendor">
					{({ value, set }) => (
						<label>
							Vendor
							<select
								value={value?.id ?? ""}
								onChange={(event) =>
									set(
										vendors.find(({ id }) => id === event.target.value)?.value,
									)
								}
							>
								<option value="">Choose a vendor</option>
								{vendors.map(({ id, value: vendor }) => (
									<option key={id} value={id}>
										{vendor.name}
									</option>
								))}
							</select>
						</label>
					)}
				</CardEntry>
				<CardEntry card={card} name="tags">
					{({ value = [], set }) => (
						<fieldset>
							<legend>Tags</legend>
							{tags.map(({ id, value: tag }) => (
								<label key={id}>
									<input
										type="checkbox"
										checked={value.includes(tag)}
										onChange={(event) =>
											set(
												event.target.checked
													? [...value, tag]
													: value.filter((other) => other !== tag),
											)
										}
									/>
									{id}
								</label>
							))}
						</fieldset>
					)}
				</CardEntry>
				<CardEntry card={card} name="spent_on">
					{({ value, set }) => (
						<label>
							Day
							<input
								value={value ?? ""}
								onChange={(event) => set(event.target.value || undefined)}
							/>
						</label>
					)}
				</CardEntry>
				<CardEntry card={card} name="total">
					{({ value, set }) => (
						<label>
							Amount
							<input
								inputMode="decimal"
								value={value?.value ?? ""}
								onChange={(event) =>
									set(
										event.target.value === ""
											? undefined
											: { value: Number(event.target.value) },
									)
								}
							/>
						</label>
					)}
				</CardEntry>
				<CardConfirm card={card}>Save expense</CardConfirm>
				<CardUndo card={card}>
					Expense saved.{" "}
					<button
						type="button"
						onClick={() => {
							onUndo();
							card.restore();
						}}
					>
						Undo
					</button>
				</CardUndo>
			</main>
		);
	}

	const { container } = render(<Page />);
	return {
		container,
		onConfirm,
		onUndo,
		seen,
		user: userEvent.setup(),
	};
}

async function expectNoAxeViolations(container: Element) {
	// jsdom paints nothing, and the pieces ship unstyled: contrast is the host's.
	const { violations } = await axe.run(container, {
		rules: { "color-contrast": { enabled: false } },
	});
	expect(violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
}

/** What the live regions hold, which is what a screen reader announces. */
function announced() {
	return screen.getAllByRole("status").map((region) => region.textContent);
}

const box = () =>
	screen.getByRole("searchbox", { name: "Describe the expense" });
const vendor = () =>
	screen.getByRole("combobox", { name: "Vendor" }) as HTMLSelectElement;
const day = () =>
	screen.getByRole("textbox", { name: "Day" }) as HTMLInputElement;
const amount = () =>
	screen.getByRole("textbox", { name: "Amount" }) as HTMLInputElement;
const meals = () =>
	screen.getByRole("checkbox", { name: "meals" }) as HTMLInputElement;
const confirmButton = () =>
	screen.getByRole("button", { name: "Save expense" });
const filledBy = (control: Element) =>
	control.closest("[data-filled-by]")?.getAttribute("data-filled-by");

async function ask(user: ReturnType<typeof userEvent.setup>, text = lunch) {
	await user.type(box(), `${text}{Enter}`);
	await screen.findByText(/^Filled:/);
}

function pause(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("useCard and its pieces", () => {
	it("calls on Enter, not while typing, and fills the card from the answer", async () => {
		const provider = fakeProvider(fills);
		const { container, onConfirm, user } = renderCard({ provider });

		await user.type(box(), lunch);
		await pause(60);
		expect(provider.calls).toHaveLength(0);
		await user.keyboard("{Enter}");
		await screen.findByText(/^Filled:/);

		expect(provider.calls).toHaveLength(1);
		expect(vendor().value).toBe("northwind");
		expect(meals().checked).toBe(true);
		expect(day().value).toBe("2026-09-21");
		expect(amount().value).toBe("42");
		expect(onConfirm).not.toHaveBeenCalled();
		await expectNoAxeViolations(container);
	});

	it("announces which fields were filled and which wait for the person", async () => {
		const { user } = renderCard({ provider: fakeProvider(holdsVendor) });

		await ask(user);

		expect(announced()).toContain(
			"Filled: tags, spent_on, total. Waiting for you: vendor.",
		);
	});

	it("leaves a held field empty, exactly as one the request never mentioned, for the person to fill", async () => {
		const { container, onConfirm, user } = renderCard({
			provider: fakeProvider(holdsVendor),
		});

		await ask(user);

		expect(vendor().value).toBe("");
		expect(vendor().closest("[data-empty]")).not.toBeNull();
		expect(day().closest("[data-empty]")).toBeNull();
		await expectNoAxeViolations(container);

		await user.selectOptions(vendor(), "acme");
		await user.click(confirmButton());

		expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
			vendor: { id: "acme", name: "Acme" },
			tags: ["meals"],
			spent_on: "2026-09-21",
			total: { value: 42, currency: "USD" },
		});
	});

	it("tells what the answer filled from what the person filled, for the host's styling", async () => {
		const { user } = renderCard({ provider: fakeProvider(holdsVendor) });

		await ask(user);
		await user.selectOptions(vendor(), "acme");
		await user.clear(day());
		await user.type(day(), "2026-09-20");

		expect(filledBy(vendor())).toBe("person");
		expect(filledBy(day())).toBe("person");
		expect(filledBy(amount())).toBe("answer");
	});

	it("does not announce again while the person fills the card", async () => {
		const { user } = renderCard({ provider: fakeProvider(holdsVendor) });

		await ask(user);
		const before = announced();
		await user.selectOptions(vendor(), "acme");

		expect(announced()).toEqual(before);
	});

	it("hands the card to the app only on Confirm, once, then empties it and opens the undo slot", async () => {
		const { onConfirm, user } = renderCard({ provider: fakeProvider(fills) });

		await ask(user);
		expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
		await user.click(confirmButton());

		expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
			vendor: { id: "northwind", name: "Northwind" },
			tags: ["meals"],
			spent_on: "2026-09-21",
			total: { value: 42, currency: "USD" },
		});
		expect(box().getAttribute("value")).toBe("");
		expect(vendor().value).toBe("");
		expect(amount().value).toBe("");
		expect(announced().join(" ")).toContain("Expense saved.");
		expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
		expect(document.activeElement).toBe(confirmButton());
		await user.click(confirmButton());
		expect(onConfirm).toHaveBeenCalledOnce();
	});

	it("puts the card back as it was when the host undoes the save, and closes the slot", async () => {
		const { onConfirm, onUndo, user } = renderCard({
			provider: fakeProvider(holdsVendor),
		});

		await ask(user);
		await user.selectOptions(vendor(), "acme");
		await user.click(confirmButton());
		await user.click(screen.getByRole("button", { name: "Undo" }));

		expect(onUndo).toHaveBeenCalledOnce();
		expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
		expect(box().getAttribute("value")).toBe(lunch);
		expect(vendor().value).toBe("acme");
		expect(filledBy(vendor())).toBe("person");
		expect(amount().value).toBe("42");
		await user.clear(amount());
		await user.type(amount(), "24");
		await user.click(confirmButton());
		expect(onConfirm).toHaveBeenLastCalledWith({
			vendor: { id: "acme", name: "Acme" },
			tags: ["meals"],
			spent_on: "2026-09-21",
			total: { value: 24 },
		});
	});

	it("closes the undo slot once the person starts the next card", async () => {
		const { user } = renderCard({ provider: fakeProvider(fills) });

		await ask(user);
		await user.click(confirmButton());
		expect(screen.getByRole("button", { name: "Undo" })).toBeDefined();
		await user.type(box(), "t");

		expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
	});

	it("fills nothing from a request that asks for no new record, and exposes the intent", async () => {
		const { container, onConfirm, seen, user } = renderCard({
			provider: fakeProvider(notARecord),
		});

		await ask(user, "how much did we spend on lunch?");

		expect(vendor().value).toBe("");
		expect(amount().value).toBe("");
		expect(announced()).toContain(
			"Filled: nothing. Waiting for you: vendor, tags, spent_on, total.",
		);
		expect(seen.card?.result?.intent.pick).toEqual({
			label: "not_available",
			probability: 0.95,
		});
		expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
		await user.click(confirmButton());
		expect(onConfirm).not.toHaveBeenCalled();
		await expectNoAxeViolations(container);
	});

	it("keeps working when the provider fails: every field waits, and the person fills and confirms by hand", async () => {
		const { container, onConfirm, seen, user } = renderCard({
			provider: failingProvider(new Error("503")),
		});

		await ask(user);

		expect(seen.card?.error).toEqual({
			kind: "provider",
			message: "The provider failed",
		});
		expect(announced()).toContain(
			"Filled: nothing. Waiting for you: vendor, tags, spent_on, total.",
		);
		await expectNoAxeViolations(container);
		await user.type(amount(), "42");
		await user.click(confirmButton());
		expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ total: { value: 42 } });
	});

	it("reaches the fields, Confirm and Undo from the box with Tab", async () => {
		const { user } = renderCard({ provider: fakeProvider(fills) });

		await ask(user);
		await user.tab();
		expect(document.activeElement).toBe(vendor());
		await user.tab();
		expect(document.activeElement).toBe(meals());
		await user.tab();
		await user.tab();
		expect(document.activeElement).toBe(day());
		await user.tab();
		await user.tab();
		expect(document.activeElement).toBe(confirmButton());
		await user.keyboard("{Enter}");
		await user.tab();
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: "Undo" }),
		);
	});

	it("calls while typing, after the pause, when the timing says so", async () => {
		const provider = fakeProvider(fills);
		const { user } = renderCard({
			provider,
			timing: { on: "type", debounceMs: 30 },
		});

		await user.type(box(), lunch);
		await screen.findByText(/^Filled:/);

		expect(provider.calls.map(({ request }) => request)).toEqual([lunch]);
	});

	it("exposes the intent and every field's picks and gate for an inspector", async () => {
		const { seen, user } = renderCard({ provider: fakeProvider(fills) });

		await ask(user);

		expect(seen.card?.result?.intent.gate).toBe(0.8);
		expect(seen.card?.result?.fields.vendor).toMatchObject({
			pick: { label: "northwind", probability: 0.95 },
			gate: 0.8,
		});
	});
});
