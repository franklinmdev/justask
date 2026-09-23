import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { CardFields, CardFieldValue } from "../card.ts";
import { RequestBox, type RequestBoxProps } from "./request-box.tsx";
import type { FilledBy, UseCard } from "./use-card.ts";

export type CardBoxProps = RequestBoxProps & {
	card: Pick<UseCard<CardFields>, "request" | "setRequest" | "submit">;
};

/**
 * The request box: a search input the person types into. Enter calls the
 * handler, and never submits a surrounding form.
 */
export function CardBox({ card, ...props }: CardBoxProps) {
	return <RequestBox flow={card} {...props} />;
}

/** What a field's control needs: its value, how to change it, and who filled it. */
export type CardEntryControl<V> = {
	/** Undefined while the field is empty, held or never mentioned alike. */
	value: V | undefined;
	/** Fills or changes the field for the person; undefined empties it. */
	set: (value: V | undefined) => void;
	filledBy: FilledBy | null;
};

export type CardEntryProps<
	F extends CardFields,
	K extends keyof F & string,
> = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
	card: UseCard<F>;
	name: K;
	/** Renders the host app's own control for the field, with its label. */
	children: (control: CardEntryControl<CardFieldValue<F[K]>>) => ReactNode;
};

/**
 * One field of the card, around the host app's own control. An empty field
 * carries `data-empty`, whether it was held or never mentioned, so both look
 * the same and the person simply fills it. A filled one carries
 * `data-filled-by`, `answer` or `person`, so the host can tell the answer's
 * values from the person's. Place the entries after the box and before
 * Confirm, so Tab moves from the box through the fields to Confirm.
 */
export function CardEntry<F extends CardFields, K extends keyof F & string>({
	card,
	name,
	children,
	...props
}: CardEntryProps<F, K>) {
	const value = card.value[name] as CardFieldValue<F[K]> | undefined;
	const filledBy = card.filledBy(name);
	return (
		<div
			{...props}
			data-empty={value === undefined ? "" : undefined}
			data-filled-by={filledBy ?? undefined}
		>
			{children({ value, set: (next) => card.set(name, next), filledBy })}
		</div>
	);
}

export type CardStatusProps<F extends CardFields> = Omit<
	ComponentPropsWithoutRef<"p">,
	"role" | "children"
> & {
	card: Pick<UseCard<F>, "answered" | "error" | "loading" | "result">;
	/**
	 * What is announced once an answer comes back, in the host app's own
	 * words: the fields it filled and the fields that wait for the person, each
	 * in the order they are declared.
	 */
	announce: (fields: {
		filled: (keyof F & string)[];
		waiting: (keyof F & string)[];
	}) => string;
	/**
	 * What is announced when the answer failed: the provider failed or ran out
	 * of time, the handler refused the request or could not be reached. The
	 * card stays as it was, and the person fills it by hand.
	 */
	unanswered: string;
};

/**
 * A polite live region that says, once per answer, which fields were filled
 * and which wait for the person, or `unanswered` when the answer failed.
 * The person filling the card does not change it. Empty before an answer,
 * while the box holds another request, and after Confirm; pass a class that
 * hides it visually, or show it as a hint.
 */
export function CardStatus<F extends CardFields>({
	card,
	announce,
	unanswered,
	...props
}: CardStatusProps<F>) {
	const { result } = card;
	let text = "";
	if (card.answered && (card.error || !result)) {
		text = unanswered;
	} else if (card.answered && result) {
		const names = Object.keys(result.fields) as (keyof F & string)[];
		const filled = names.filter((name) => name in result.value);
		text = announce({
			filled,
			waiting: names.filter((name) => !filled.includes(name)),
		});
	}
	return (
		<p {...props} role="status" aria-busy={card.loading}>
			{text}
		</p>
	);
}

export type CardConfirmProps = Omit<
	ComponentPropsWithoutRef<"button">,
	"type" | "onClick" | "disabled" | "aria-disabled"
> & {
	card: Pick<UseCard<CardFields>, "ready" | "confirm">;
};

/**
 * Confirm: hands the card to the app. With nothing to confirm it stays
 * focusable and says so with `aria-disabled`, so a keyboard user who just
 * confirmed keeps their place, one Tab from the undo slot.
 */
export function CardConfirm({ card, ...props }: CardConfirmProps) {
	return (
		<button
			{...props}
			type="button"
			aria-disabled={!card.ready}
			onClick={card.confirm}
		/>
	);
}

export type CardUndoProps = Omit<ComponentPropsWithoutRef<"div">, "role"> & {
	card: Pick<UseCard<CardFields>, "saved">;
};

/**
 * The undo slot: a polite live region that shows its children, the host
 * app's own message and undo control, right after Confirm, until the person
 * starts the next card. The host's control takes the record back its own way
 * and calls `card.restore()`. Place it right after Confirm.
 */
export function CardUndo({ card, children, ...props }: CardUndoProps) {
	return (
		<div {...props} role="status">
			{card.saved !== null && children}
		</div>
	);
}
