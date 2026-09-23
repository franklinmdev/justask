import {
	type Card,
	type CardFields,
	type CardResult,
	cardPlan,
	cardQuestionIds,
	INTENT,
	intentQuestion,
	readIntent,
} from "./card.ts";
import {
	amountPlan,
	catalogPlan,
	datePlan,
	describeAmount,
	describeDate,
	describeTime,
	type Field,
	type FieldPlan,
	type Fields,
	type Filter,
	type FilterResult,
	MISSING,
	questionIds,
} from "./filter.ts";
import { checkGate } from "./gate.ts";
import {
	type AmountReading,
	type DateReading,
	type Parser,
	parseRequest,
	type TimeReading,
} from "./parse.ts";
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
	SEARCH_LABELS,
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

export type AskCardInput<F extends CardFields> = AskBase & { card: Card<F> };

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

export type AskCardResult<F extends CardFields> = {
	card: CardResult<F>;
	error?: AskError;
};

const SEARCH = "search";

/**
 * Resolves a request through the host app's own state: code finds the
 * candidates, the provider picks in one call, code builds the result (ADR
 * 0002). A search resolves to one item or none; a filter to the filter object
 * its table understands; a card to a new record, or to nothing when the
 * request asks for none. A failed or late provider holds everything; no retries.
 */
export function ask<T>(input: AskInput<T>): Promise<AskResult<T>>;
// The filter's overload stays last: a call that matches none reports against it.
export function ask<F extends CardFields>(
	input: AskCardInput<F>,
): Promise<AskCardResult<F>>;
export function ask<F extends Fields>(
	input: AskFilterInput<F>,
): Promise<AskFilterResult<F>>;
export function ask(
	input: AskInput<unknown> | AskFilterInput<Fields> | AskCardInput<CardFields>,
): Promise<
	AskResult<unknown> | AskFilterResult<Fields> | AskCardResult<CardFields>
> {
	if ("card" in input) return askCard(input);
	return "filter" in input ? askFilter(input) : askSearch(input);
}

/**
 * The item fills when a candidate wins outright and none and several stay
 * below the gate (ADR 0005, 0007).
 */
async function askSearch<T>({
	request,
	facts,
	provider,
	timeoutMs,
	search,
}: AskInput<T>): Promise<AskResult<T>> {
	checkGate(search.gate, "the search's gate");
	const candidates = await search.shortlist(request);
	checkShortlist(candidates, SEARCH_LABELS);
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
 * All fields' questions in one call. A catalog field's candidates come from
 * its shortlist, a date or amount field's from the parsers. A field with no
 * candidates is held without a question, and none at all means no call.
 */
async function askFilter<F extends Fields>({
	request,
	facts,
	provider,
	timeoutMs,
	filter,
}: AskFilterInput<F>): Promise<AskFilterResult<F>> {
	const names = Object.keys(filter.fields);
	const field = (name: string) => filter.fields[name] as Field;
	for (const name of names) {
		checkGate(field(name).gate, `the gate of field "${name}"`);
		const ids = questionIds(name, field(name));
		const clash = names.find((other) => other !== name && ids.test(other));
		if (clash) {
			throw new TypeError(
				`justask: field "${clash}" takes the id of one of field "${name}"'s questions; rename one of them`,
			);
		}
	}
	const parsed = names.some((name) => field(name).kind !== "catalog")
		? readCandidates(request, facts, filter.parsers ?? [], "past")
		: { dates: [], times: [], amounts: [] };

	const plans: Record<string, FieldPlan> = {};
	await Promise.all(
		names.map(async (name) => {
			const declared = field(name);
			if (declared.kind === "date") {
				plans[name] = datePlan(name, filter, declared, parsed.dates);
			} else if (declared.kind === "amount") {
				plans[name] = amountPlan(name, filter, declared, parsed.amounts);
			} else {
				const candidates = await declared.shortlist(request);
				checkShortlist(candidates, MISSING);
				plans[name] = catalogPlan(name, filter, declared, candidates);
			}
		}),
	);
	const planOf = (name: string) => plans[name] as FieldPlan;
	const held = () =>
		({
			value: {},
			fields: Object.fromEntries(
				names.map((name) => [name, planOf(name).held]),
			),
		}) as FilterResult<F>;

	const questions = names.flatMap((name) => planOf(name).questions);
	if (questions.length === 0) return { filter: held() };

	const outcome = await answer(
		provider,
		{ request, facts, questions },
		timeoutMs,
	);
	if ("error" in outcome) return { filter: held(), error: outcome.error };

	const value: Record<string, unknown> = {};
	const fields: Record<string, unknown> = {};
	for (const name of names) {
		const plan = planOf(name);
		if (plan.questions.length === 0) {
			fields[name] = plan.held;
			continue;
		}
		const read = plan.read(outcome.answer);
		fields[name] = read.result;
		if ("value" in read) value[name] = read.value;
	}
	return { filter: { value, fields } as FilterResult<F> };
}

/**
 * The intent question and all fields' questions in one call. A field's
 * candidates come as a filter's do; a date field reads its own way, so each
 * way any field reads is parsed once. Below the intent gate, every field is
 * held, though its answers are still reported.
 */
async function askCard<F extends CardFields>({
	request,
	facts,
	provider,
	timeoutMs,
	card,
}: AskCardInput<F>): Promise<AskCardResult<F>> {
	checkGate(card.gate, "the card's gate");
	const names = Object.keys(card.fields);
	const field = (name: string) => card.fields[name] as CardFields[string];
	for (const name of names) {
		checkGate(field(name).gate, `the gate of field "${name}"`);
		const ids = cardQuestionIds(name, field(name));
		const clash = [INTENT, ...names.filter((other) => other !== name)].find(
			(other) => ids.test(other),
		);
		if (clash) {
			throw new TypeError(
				`justask: "${clash}" takes the id of one of field "${name}"'s questions; rename the field`,
			);
		}
	}
	const parsed = new Map<
		"past" | "future",
		ReturnType<typeof readCandidates>
	>();
	const readingsFor = (reads: "past" | "future") => {
		let readings = parsed.get(reads);
		if (!readings) {
			readings = readCandidates(request, facts, card.parsers ?? [], reads);
			parsed.set(reads, readings);
		}
		return readings;
	};

	const plans: Record<string, FieldPlan> = {};
	await Promise.all(
		names.map(async (name) => {
			const declared = field(name);
			if (declared.kind === "catalog") {
				const candidates = await declared.shortlist(request);
				checkShortlist(candidates, MISSING);
				plans[name] = cardPlan(name, card, declared, candidates, {
					dates: [],
					times: [],
					amounts: [],
				});
			} else {
				const readings = readingsFor(
					declared.kind === "date" ? declared.reads : "past",
				);
				plans[name] = cardPlan(name, card, declared, [], readings);
			}
		}),
	);
	const planOf = (name: string) => plans[name] as FieldPlan;
	const intentHeld = { pick: null, probabilities: {}, gate: card.gate };
	const held = () =>
		({
			intent: intentHeld,
			value: {},
			fields: Object.fromEntries(
				names.map((name) => [name, planOf(name).held]),
			),
		}) as CardResult<F>;

	const questions = [
		intentQuestion(card),
		...names.flatMap((name) => planOf(name).questions),
	];
	const outcome = await answer(
		provider,
		{ request, facts, questions },
		timeoutMs,
	);
	if ("error" in outcome) return { card: held(), error: outcome.error };

	const intent = readIntent(outcome.answer[INTENT] ?? {}, card.gate);
	const value: Record<string, unknown> = {};
	const fields: Record<string, unknown> = {};
	for (const name of names) {
		const plan = planOf(name);
		if (plan.questions.length === 0) {
			fields[name] = plan.held;
			continue;
		}
		const read = plan.read(outcome.answer);
		fields[name] = read.result;
		if (intent.passes && "value" in read) value[name] = read.value;
	}
	return {
		card: { intent: intent.result, value, fields } as CardResult<F>,
	};
}

/**
 * The parsers' readings as candidates: dates d0, d1..., times t0, t1...,
 * amounts a0, a1..., in the order they appear in the request.
 */
function readCandidates(
	request: string,
	facts: Facts,
	parsers: readonly Parser[],
	reads: "past" | "future",
): {
	dates: Candidate<DateReading>[];
	times: Candidate<TimeReading>[];
	amounts: Candidate<AmountReading>[];
} {
	const today = /\d{4}-\d{2}-\d{2}/.exec(facts.today ?? "")?.[0];
	if (!today) {
		throw new TypeError(
			'justask: a date or amount field needs the "today" fact, with today\'s date as YYYY-MM-DD',
		);
	}
	const { dates, times, amounts } = parseRequest(
		request,
		{ today, reads, facts },
		parsers,
	);
	return {
		dates: dates.map((value, i) => ({
			id: `d${i}`,
			description: describeDate(value),
			value,
		})),
		times: times.map((value, i) => ({
			id: `t${i}`,
			description: describeTime(value),
			value,
		})),
		amounts: amounts.map((value, i) => ({
			id: `a${i}`,
			description: describeAmount(value),
			value,
		})),
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
