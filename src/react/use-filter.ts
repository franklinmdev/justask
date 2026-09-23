import { useState } from "react";
import type { Fields, FilterResult, FilterValue } from "../filter.ts";
import {
	type RequestError,
	type RequestTiming,
	useRequest,
} from "./use-request.ts";

/**
 * When the hook calls the handler: after a pause in typing, or only when the
 * person presses Enter. The pause has no default; the demo measures it.
 */
export type FilterTiming = RequestTiming;

export type UseFilterOptions<F extends Fields> = {
	/** Where the filter handler is mounted, such as `/api/filter`. */
	endpoint: string;
	timing: FilterTiming;
	/** Receives the filter object the person confirmed; nothing reaches the app before that. */
	onConfirm: (value: FilterValue<F>) => void;
	/** Replaces the global `fetch`, to add headers or to serve a handler in process. */
	fetch?: typeof fetch;
};

/**
 * Why the last answer filled nothing beyond the filter itself: the provider's
 * error as the handler sends it, a request the handler refused, or a handler
 * that could not be reached or answered something else.
 */
export type FilterError = RequestError;

export type UseFilter<F extends Fields> = {
	/** What the person has typed. */
	request: string;
	setRequest: (request: string) => void;
	/** Calls the handler now, skipping the pause. */
	submit: () => void;
	/** True while a call is waiting out the pause or on its way. */
	loading: boolean;
	/**
	 * The last answer, with every field's candidates, picks, probabilities and
	 * gate, for an inspector. It may be for an earlier request; null before
	 * one, or when the box is empty.
	 */
	result: FilterResult<F> | null;
	/**
	 * The filters proposed for the request in the box, without the ones the
	 * person removed. A held field is left out, exactly as one the request never
	 * mentioned. Null when failed, not answered yet, or already confirmed.
	 */
	value: FilterValue<F> | null;
	/** Why the last answer failed, beside `result`. */
	error: FilterError | null;
	/** True when the last answer, or error, is for the request in the box, so an empty state can show. */
	answered: boolean;
	/** Drops one proposed filter before Confirm. */
	remove: (name: keyof F & string) => void;
	/** True when at least one proposed filter is left to confirm. */
	ready: boolean;
	/**
	 * Hands the proposed filters to `onConfirm`. The request and its answer
	 * stay, for the box and an inspector; the proposal is spent until the
	 * person types again.
	 */
	confirm: () => void;
};

/**
 * Drives a filter from the host app's own markup: posts what the person types
 * to the filter handler, keeps only the answer to the latest request, lets the
 * person drop a proposed filter, and hands the filter object to the app only
 * when the person confirms it.
 */
export function useFilter<F extends Fields>({
	endpoint,
	timing,
	onConfirm,
	fetch,
}: UseFilterOptions<F>): UseFilter<F> {
	const { request, setRequest, submit, loading, answer, current } = useRequest<
		FilterResult<F>
	>({ endpoint, timing, fetch, flow: "filter" });
	// Keyed by the answer it edits, so a new answer starts with nothing removed.
	const [removed, setRemoved] = useState<{
		answer: typeof answer;
		names: string[];
	}>({ answer: null, names: [] });
	const [confirmed, setConfirmed] = useState<typeof answer>(null);

	const proposed =
		current && !answer?.error && answer !== confirmed
			? answer?.result?.value
			: null;
	const dropped = removed.answer === answer ? removed.names : [];
	const value = proposed
		? (Object.fromEntries(
				Object.entries(proposed).filter(([name]) => !dropped.includes(name)),
			) as FilterValue<F>)
		: null;
	const ready = value !== null && Object.keys(value).length > 0;

	return {
		request,
		setRequest,
		submit,
		loading,
		result: answer?.result ?? null,
		value,
		error: answer?.error ?? null,
		answered: current,
		remove: (name) => setRemoved({ answer, names: [...dropped, name] }),
		ready,
		confirm: () => {
			if (!ready) return;
			onConfirm(value);
			setConfirmed(answer);
		},
	};
}
