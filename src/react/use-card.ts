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
	 * the request never mentioned. A successful answer starts the card over; a
	 * failed one leaves it as it was, the person's changes included, and says
	 * why in `error`.
	 */
	value: CardValue<F>;
	/** Who filled a field, or null while it is empty. */
	filledBy: (name: keyof F & string) => FilledBy | null;
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

/** The card: its values, who filled each one, and the answer it started from. */
type Draft = {
	answer: Answered<unknown> | null;
	value: Record<string, unknown>;
	by: Record<string, FilledBy>;
};

const EMPTY: Draft = { answer: null, value: {}, by: {} };

/**
 * The card once `answer` lands: a new card from its filled fields, or, when
 * it failed, the card as it was.
 */
function draftOf(
	answer: Answered<CardResult<CardFields>>,
	current: Draft,
): Draft {
	if (answer.error) return { ...current, answer };
	const value = { ...(answer.result?.value ?? {}) };
	const by = Object.fromEntries(
		Object.keys(value).map((name) => [name, "answer" as const]),
	);
	return { answer, value, by };
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
		set: (name, next) => {
			setSaved(null);
			const nextValue = { ...draft.value };
			const by = { ...draft.by };
			if (next === undefined) {
				delete nextValue[name];
				delete by[name];
			} else {
				nextValue[name] = next;
				by[name] = "person";
			}
			setKept({ answer, value: nextValue, by });
		},
		ready,
		confirm: () => {
			if (!ready) return;
			onConfirm(value);
			setSpent(answer);
			setSaved({ request: flow.request, draft });
			setKept({ answer, value: {}, by: {} });
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
