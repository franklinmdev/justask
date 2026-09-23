import {
	catalogQuestion,
	type FieldResult,
	type Fields,
	type Filter,
	type FilterResult,
	gateField,
	MISSING,
} from "./filter.ts";
import type { Pick } from "./pick.ts";
import type {
	Facts,
	Probabilities,
	Provider,
	ProviderAnswer,
	Question,
} from "./provider.ts";
import {
	type Candidate,
	checkShortlist,
	gateSearch,
	NONE,
	type Search,
	searchQuestion,
} from "./search.ts";

export type { Pick } from "./pick.ts";

type AskBase = {
	request: string;
	facts: Facts;
	provider: Provider;
	/** How long the provider call may take before everything is held. No default. */
	timeoutMs: number;
};

export type AskInput<T> = AskBase & { search: Search<T> };

export type AskFilterInput<F extends Fields> = AskBase & { filter: Filter<F> };

export type SearchResult<T> = {
	/** The picked candidate's value, or null when held. */
	item: T | null;
	candidates: Candidate<T>[];
	/** Null when there was no answer, or on a tie for first place. */
	pick: Pick | null;
	/** Every label's probability, `none` included; empty when there was no answer. */
	probabilities: Probabilities;
	gate: number;
};

/** Why the provider gave no usable answer. Every field is held when present. */
export type AskError =
	| { kind: "provider"; message: string; cause: unknown }
	| { kind: "timeout"; message: string; timeoutMs: number };

export type AskResult<T> = {
	search: SearchResult<T>;
	error?: AskError;
};

export type AskFilterResult<F extends Fields> = {
	filter: FilterResult<F>;
	error?: AskError;
};

const SEARCH = "search";

/**
 * Resolves a request through the host app's own state: code finds the
 * candidates, the provider picks in one call, code builds the result (ADR
 * 0002). A search resolves to one item or none; a filter to the filter object
 * its table understands. A failed or late provider holds everything; no retries.
 */
export function ask<T>(input: AskInput<T>): Promise<AskResult<T>>;
export function ask<F extends Fields>(
	input: AskFilterInput<F>,
): Promise<AskFilterResult<F>>;
export function ask(
	input: AskInput<unknown> | AskFilterInput<Fields>,
): Promise<AskResult<unknown> | AskFilterResult<Fields>> {
	return "filter" in input ? askFilter(input) : askSearch(input);
}

/**
 * The item fills when a candidate wins outright and none stays below the gate
 * (ADR 0005).
 */
async function askSearch<T>({
	request,
	facts,
	provider,
	timeoutMs,
	search,
}: AskInput<T>): Promise<AskResult<T>> {
	const candidates = await search.shortlist(request);
	checkShortlist(candidates, [NONE]);
	const held: SearchResult<T> = {
		item: null,
		candidates,
		pick: null,
		probabilities: {},
		gate: search.gate,
	};
	if (candidates.length === 0) return { search: held };

	const questions = [searchQuestion(SEARCH, search, candidates)];
	const outcome = await answer(
		provider,
		{ request, facts, questions },
		timeoutMs,
	);
	if ("error" in outcome) return { search: held, error: outcome.error };

	const probabilities = outcome.answer[SEARCH] ?? {};
	const { pick, filled } = gateSearch(probabilities, search.gate);
	const winner = candidates.find(({ id }) => id === filled);
	return {
		search: {
			...held,
			item: winner ? winner.value : null,
			pick,
			probabilities,
		},
	};
}

/**
 * One question per field, all in one call. A field fills when its pick is a
 * candidate that clears the field's own gate; a field with no candidates is
 * held without a question, and none at all means no call.
 */
async function askFilter<F extends Fields>({
	request,
	facts,
	provider,
	timeoutMs,
	filter,
}: AskFilterInput<F>): Promise<AskFilterResult<F>> {
	const names = Object.keys(filter.fields);
	const fields: Record<string, FieldResult<unknown>> = {};
	await Promise.all(
		names.map(async (name) => {
			const field = filter.fields[name] as Fields[string];
			const candidates = await field.shortlist(request);
			checkShortlist(candidates, MISSING);
			fields[name] = {
				candidates,
				pick: null,
				probabilities: {},
				gate: field.gate,
			};
		}),
	);
	const held = () => ({ value: {}, fields }) as FilterResult<F>;

	const questions = names.flatMap((name) => {
		const { candidates = [] } = fields[name] ?? {};
		const field = filter.fields[name] as Fields[string];
		return candidates.length > 0
			? [catalogQuestion(name, filter, field, candidates)]
			: [];
	});
	if (questions.length === 0) return { filter: held() };

	const outcome = await answer(
		provider,
		{ request, facts, questions },
		timeoutMs,
	);
	if ("error" in outcome) return { filter: held(), error: outcome.error };

	const value: Record<string, unknown> = {};
	for (const { id } of questions) {
		const result = fields[id] as FieldResult<unknown>;
		const probabilities = outcome.answer[id] ?? {};
		const { pick, filled } = gateField(probabilities, result.gate);
		const winner = result.candidates.find(
			(candidate) => candidate.id === filled,
		);
		fields[id] = { ...result, pick, probabilities };
		if (winner) value[id] = winner.value;
	}
	return { filter: { value, fields } as FilterResult<F> };
}

async function answer(
	provider: Provider,
	input: { request: string; facts: Facts; questions: Question[] },
	timeoutMs: number,
): Promise<{ answer: ProviderAnswer } | { error: AskError }> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<{ error: AskError }>((resolve) => {
		timer = setTimeout(() => {
			controller.abort();
			resolve({
				error: {
					kind: "timeout",
					message: `The provider did not answer within ${timeoutMs} ms`,
					timeoutMs,
				},
			});
		}, timeoutMs);
	});
	// Started inside a promise so an adapter that throws synchronously is caught too.
	const call = Promise.resolve()
		.then(() => provider.answer({ ...input, signal: controller.signal }))
		.then(
			({ answers }) => {
				const breach = contractBreach(input.questions, answers);
				return breach
					? { error: providerError(new Error(breach)) }
					: { answer: answers };
			},
			(cause: unknown) => ({ error: providerError(cause) }),
		);
	try {
		return await Promise.race([call, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

function providerError(cause: unknown): AskError {
	return {
		kind: "provider",
		message: cause instanceof Error ? cause.message : String(cause),
		cause,
	};
}

/** ADR 0001: per question, a probability for every label and for nothing else. */
function contractBreach(
	questions: Question[],
	answer: ProviderAnswer,
): string | null {
	for (const question of questions) {
		const probabilities = answer[question.id];
		if (!probabilities) {
			return `The provider left out question "${question.id}"`;
		}
		const labels = new Set(question.labels.map(({ label }) => label));
		for (const label of labels) {
			const probability = probabilities[label];
			if (
				typeof probability !== "number" ||
				!(probability >= 0 && probability <= 1)
			) {
				return `The provider gave no probability between 0 and 1 for label "${label}" of question "${question.id}"`;
			}
		}
		for (const label of Object.keys(probabilities)) {
			if (!labels.has(label)) {
				return `The provider answered label "${label}", which question "${question.id}" does not have`;
			}
		}
	}
	return null;
}
