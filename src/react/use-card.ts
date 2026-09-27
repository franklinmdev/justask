import { useState } from "react";
import type {
	CardFields,
	CardFieldValue,
	CardResult,
	CardValue,
} from "../card.ts";
import {
	type Answered,
	type RequestError,
	type RequestTiming,
	useRequest,
} from "./use-request.ts";

/**
 * When the hook calls the handler: when the person presses Enter, by default,
 * or after a pause in typing.
 */
export type CardTiming = RequestTiming;

export type UseCardOptions<F extends CardFields> = {
	/** Where the card handler is mounted, such as `/api/card`. */
	endpoint: string;
	/** Enter when left out, as the lab measured a card. */
	timing?: CardTiming;
	/**
	 * Receives the card the person confirmed, to save in the host app's own
	 * way; nothing reaches the app before that.
	 */
	onConfirm: (value: CardValue<F>) => void;
	/** Replaces the global `fetch`, to add headers or to serve a handler in process. */
	fetch?: typeof fetch;
};

/**
 * Why the last answer filled nothing: the provider's error as the handler
 * sends it, a request the handler refused, or a handler that could not be
 * reached or answered something else.
 */
export type CardError = RequestError;

/** Who put a field's value on the card: the answer, or the person since. */
export type FilledBy = "answer" | "person";

export type UseCard<F extends CardFields> = {
	/** What the person has typed. */
	request: string;
	setRequest: (request: string) => void;
	/** Calls the handler now. */
	submit: () => void;
	/** True while a call is on its way, or waiting out the pause. */
	loading: boolean;
	/**
	 * The last answer, with the intent and every field's candidates, picks,
	 * probabilities and gate, for an inspector. It may be for an earlier
	 * request; null before one, or when the box is emptied.
	 */
	result: CardResult<F> | null;
	/** Why the last answer failed, beside `result`. */
	error: CardError | null;
	/**
	 * True when the last answer, or error, is for the request in the box and
	 * the card has not been confirmed since; `restore` does not bring it back,
	 * since the card may have changed after that answer.
	 */
	answered: boolean;
	/**
	 * The card as it stands: what the last successful answer filled, with the
	 * person's changes since. A held field's key is left out, exactly as one
	 * the request never mentioned. A successful answer starts the card over,
	 * but for the fields the person set or emptied after its request was sent
	 * or its pause began,
	 * which keep what the person gave them; a failed one leaves the card as it
	 * was, the person's changes included, and says why in `error`.
	 */
	value: CardValue<F>;
	/** Who filled a field, or null while it is empty. */
	filledBy: (name: keyof F & string) => FilledBy | null;
	/**
	 * What the last successful answer did to the card as it landed: the
	 * fields it filled, and the fields holding a value the person set since
	 * its pause or call began, which it left as they were (#213); each in the order
	 * they are declared. Both empty before an answer. Later changes by the
	 * person leave it as it was.
	 */
	landed: {
		filled: (keyof F & string)[];
		kept: (keyof F & string)[];
	};
	/** Fills or changes one field for the person; undefined empties it. */
	set: <K extends keyof F & string>(
		name: K,
		value: CardFieldValue<F[K]> | undefined,
	) => void;
	/** True when the card holds a field to confirm and no answer is on its way. */
	ready: boolean;
	/**
	 * Hands the card to `onConfirm`, then empties the box and the card for the
	 * next record and opens the undo slot. The answer stays for an inspector.
	 */
	confirm: () => void;
	/**
	 * The card just confirmed, while the undo slot is open: until the person
	 * types or fills a field again, or `restore` is called. Null otherwise.
	 */
	saved: CardValue<F> | null;
	/**
	 * Puts the card just confirmed back in the box and on the card, as it was
	 * before Confirm, and closes the undo slot. The host app calls it from its
	 * own undo control once it has taken the record back.
	 */
	restore: () => void;
};

/**
 * The card: its values, who filled each one, the answer it started from,
 * and, for each field the person set or emptied, how many calls had gone
 * out when they last did.
 */
type Draft = {
	answer: Answered<unknown> | null;
	value: Record<string, unknown>;
	by: Record<string, FilledBy>;
	touched: Record<string, number>;
	// Kept, not derived: the person's later changes must not alter it.
	landed: { filled: string[]; kept: string[] };
};

const EMPTY: Draft = {
	answer: null,
	value: {},
	by: {},
	touched: {},
	landed: { filled: [], kept: [] },
};

/**
 * The card once `answer` lands: a new card from its filled fields, with the
 * person's own word on any field they set or emptied since its pause or call began
 * (#213), or, when it failed, the card as it was.
 */
function draftOf(
	answer: Answered<CardResult<CardFields>>,
	current: Draft,
): Draft {
	if (answer.error) return { ...current, answer };
	const value: Record<string, unknown> = { ...(answer.result?.value ?? {}) };
	const by: Record<string, FilledBy> = Object.fromEntries(
		Object.keys(value).map((name) => [name, "answer" as const]),
	);
	for (const [name, sent] of Object.entries(current.touched)) {
		if (sent < answer.call) continue;
		if (name in current.value) {
			value[name] = current.value[name];
			by[name] = "person";
		} else {
			delete value[name];
			delete by[name];
		}
	}
	const names = Object.keys(answer.result?.fields ?? {});
	return {
		answer,
		value,
		by,
		touched: current.touched,
		landed: {
			filled: names.filter((name) => by[name] === "answer"),
			kept: names.filter((name) => by[name] === "person"),
		},
	};
}

/**
 * Drives a card from the host app's own markup: posts the request to the card
 * handler when the person presses Enter, puts the answer on the card, lets the
 * person fill or change any field, and hands the card to the app only when
 * the person confirms it. Saving and undo are the host app's; the hook keeps
 * the confirmed card so the host's undo control can put it back.
 */
export function useCard<F extends CardFields>({
	endpoint,
	timing = { on: "enter" },
	onConfirm,
	fetch,
}: UseCardOptions<F>): UseCard<F> {
	const flow = useRequest<CardResult<F>>({
		endpoint,
		timing,
		fetch,
		flow: "card",
	});
	const { answer, current } = flow;
	const [kept, setKept] = useState<Draft>(EMPTY);
	// The answer whose card was confirmed; it is not announced again.
	const [spent, setSpent] = useState<typeof answer>(null);
	const [saved, setSaved] = useState<{
		request: string;
		draft: Draft;
	} | null>(null);

	// An answer that landed since the card was last touched is read at once,
	// and kept, so an emptied box, which drops the answer, keeps the card.
	let draft = kept;
	if (answer !== null && answer !== kept.answer) {
		draft = draftOf(answer as Answered<CardResult<CardFields>>, kept);
		setKept(draft);
	}
	const value = draft.value as CardValue<F>;
	const ready = Object.keys(draft.value).length > 0 && !flow.loading;

	return {
		request: flow.request,
		setRequest: (request) => {
			setSaved(null);
			flow.setRequest(request);
		},
		submit: flow.submit,
		loading: flow.loading,
		result: answer?.result ?? null,
		error: answer?.error ?? null,
		answered: current && answer !== spent,
		value,
		filledBy: (name) => (name in draft.value ? (draft.by[name] ?? null) : null),
		landed: draft.landed as UseCard<F>["landed"],
		set: (name, next) => {
			setSaved(null);
			const sent = flow.latestCall();
			// From the latest card, so two sets in one event both apply (#212).
			setKept((latest) => {
				const nextValue = { ...latest.value };
				const by = { ...latest.by };
				if (next === undefined) {
					delete nextValue[name];
					delete by[name];
				} else {
					nextValue[name] = next;
					by[name] = "person";
				}
				return {
					...latest,
					value: nextValue,
					by,
					touched: { ...latest.touched, [name]: sent },
				};
			});
		},
		ready,
		confirm: () => {
			if (!ready) return;
			onConfirm(value);
			setSpent(answer);
			setSaved({ request: flow.request, draft });
			setKept({ ...EMPTY, answer });
			flow.replaceRequest("");
		},
		saved: saved ? (saved.draft.value as CardValue<F>) : null,
		restore: () => {
			if (!saved) return;
			setKept({ ...saved.draft, answer });
			flow.replaceRequest(saved.request);
			setSaved(null);
		},
	};
}
