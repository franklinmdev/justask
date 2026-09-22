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
	NONE,
	type Search,
	searchQuestion,
} from "./search.ts";

export type AskInput<T> = {
	request: string;
	facts: Facts;
	provider: Provider;
	/** How long the provider call may take before everything is held. No default. */
	timeoutMs: number;
	search: Search<T>;
};

/** The label the provider chose for one question, with its probability. */
export type Pick = {
	label: string;
	probability: number;
};

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

const SEARCH = "search";

/**
 * Resolves a request to one item of the host app's catalog, or to none: code
 * shortlists the candidates, the provider picks in one call, code builds the
 * result (ADR 0002). A failed or late provider holds everything; no retries.
 */
export async function ask<T>({
	request,
	facts,
	provider,
	timeoutMs,
	search,
}: AskInput<T>): Promise<AskResult<T>> {
	const candidates = await search.shortlist(request);
	checkShortlist(candidates);
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
	const pick = readPick(probabilities);
	const winner =
		pick && pick.label !== NONE && pick.probability >= search.gate
			? candidates.find(({ id }) => id === pick.label)
			: undefined;
	return {
		search: {
			...held,
			item: winner ? winner.value : null,
			pick,
			probabilities,
		},
	};
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
			(answer) => {
				const breach = contractBreach(input.questions, answer);
				return breach
					? { error: providerError(new Error(breach)) }
					: { answer };
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

/** The label with the highest probability, or null on a tie, so key order never decides. */
function readPick(probabilities: Probabilities): Pick | null {
	let pick: Pick | null = null;
	let tied = false;
	for (const [label, probability] of Object.entries(probabilities)) {
		if (!pick || probability > pick.probability) {
			pick = { label, probability };
			tied = false;
		} else if (probability === pick.probability) {
			tied = true;
		}
	}
	return tied ? null : pick;
}
