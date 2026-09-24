import {
	type CandidateReadings,
	type Card,
	type CardFields,
	type CardResult,
	cardPlan,
	cardQuestionIds,
	checkCommands,
	checkImplies,
	fillGap,
	findCommand,
	INTENT,
	type IntentResult,
	intentQuestion,
	NO_READINGS,
	readIntent,
} from "./card.ts";
import {
	amountPlan,
	type CatalogFieldResult,
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
	type Paired,
	type ParsedFieldResult,
	questionIds,
} from "./filter.ts";
import { checkGate } from "./gate.ts";
import { checkJoiners, findPair, type NamedPair } from "./named-pair.ts";
import { type Parser, parseRequest, type Reads } from "./parse.ts";
import type { Pick } from "./pick.ts";
import {
	type Facts,
	type Probabilities,
	type Provider,
	type ProviderAnswer,
	type Question,
	type Usage,
	usageOf,
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
	/** The named pair that held the item whatever its pick (ADR 0011). */
	pair?: NamedPair;
};

/** Why the provider gave no usable answer. Every field is held when present. */
export type AskError =
	| { kind: "provider"; message: string; cause: unknown }
	| { kind: "timeout"; message: string; timeoutMs: number };

/**
 * Each result carries what the provider call used, when the provider reports
 * it: left out when there was no call, when the call failed or timed out, or
 * when the adapter cannot know (ADR 0006).
 */
export type AskResult<T> = Usage & {
	search: SearchResult<T>;
	error?: AskError;
};

export type AskFilterResult<F extends Fields> = Usage & {
	filter: FilterResult<F>;
	error?: AskError;
};

export type AskCardResult<F extends CardFields> = Usage & {
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
 * below the gate (ADR 0005, 0007), and the request names no pair of
 * candidates (ADR 0011).
 */
async function askSearch<T>({
	request,
	facts,
	provider,
	timeoutMs,
	search,
}: AskInput<T>): Promise<AskResult<T>> {
	checkGate(search.gate, "the search's gate");
	checkJoiners(search.joiners, "search");
	const candidates = await search.shortlist(request);
	checkShortlist(candidates, SEARCH_LABELS);
	const pair = findPair(request, candidates, search.joiners, {
		several: false,
	});
	const held: SearchResult<T> = {
		item: null,
		candidates,
		pick: null,
		probabilities: {},
		gate: search.gate,
		...(pair && { pair }),
	};
	if (candidates.length === 0) return { search: held };

	const questions = [searchQuestion(SEARCH, search, candidates)];
	const outcome = await answer(
		provider,
		{ request, facts, questions },
		timeoutMs,
	);
	if ("error" in outcome) {
		return { search: held, ...outcome.usage, error: outcome.error };
	}

	const probabilities = outcome.answer[SEARCH] ?? {};
	const { pick, filled } = gateSearch(probabilities, search.gate, pair);
	const winner = candidates.find(({ id }) => id === filled);
	return {
		search: {
			...held,
			item: winner ? winner.value : null,
			pick,
			probabilities,
		},
		...outcome.usage,
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
	checkJoiners(filter.joiners, "filter");
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
		: NO_READINGS;

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
				plans[name] = catalogPlan(
					name,
					filter,
					declared,
					candidates,
					declared.heldByPair === false
						? undefined
						: findPair(request, candidates, filter.joiners, {
								several: false,
							}),
				);
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
	if ("error" in outcome) {
		return { filter: held(), ...outcome.usage, error: outcome.error };
	}

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
	return { filter: { value, fields } as FilterResult<F>, ...outcome.usage };
}

/**
 * The intent question and all fields' questions in one call. A field's
 * candidates come as a filter's do; a date field reads its own way, so each
 * way any field reads is parsed once. Below the intent gate, every field is
 * held, though its picks are still reported.
 */
async function askCard<F extends CardFields>({
	request,
	facts,
	provider,
	timeoutMs,
	card,
}: AskCardInput<F>): Promise<AskCardResult<F>> {
	checkGate(card.gate, "the card's gate");
	checkCommands(card.commands);
	checkJoiners(card.joiners, "card");
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
	const parsed = new Map<Reads, CandidateReadings>();
	const readingsFor = (reads: Reads) => {
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
				checkImplies(name, declared, candidates, card.fields);
				plans[name] = cardPlan(
					name,
					card,
					declared,
					candidates,
					NO_READINGS,
					findPair(request, candidates, card.joiners, {
						several: "several" in declared,
					}),
				);
			} else {
				const readings = readingsFor(
					declared.kind === "date" ? declared.reads : "past",
				);
				plans[name] = cardPlan(name, card, declared, [], readings);
			}
		}),
	);
	const planOf = (name: string) => plans[name] as FieldPlan;
	const intentHeld: IntentResult = {
		pick: null,
		probabilities: {},
		gate: card.gate,
		passes: false,
	};
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
	if ("error" in outcome) {
		return { card: held(), ...outcome.usage, error: outcome.error };
	}

	const intent = readIntent(
		outcome.answer[INTENT] ?? {},
		card.gate,
		findCommand(request, card.commands),
	);
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
	if (intent.passes) fillImplied(names, fields, value);
	return {
		card: { intent, value, fields } as CardResult<F>,
		...outcome.usage,
	};
}

/**
 * Fills, in field order, what each filled item of a field that takes one
 * implies for another field, where that field's questions left a gap (ADR
 * 0012). The first item to fill a field wins.
 */
function fillImplied(
	names: string[],
	fields: Record<string, unknown>,
	value: Record<string, unknown>,
): void {
	for (const name of names) {
		if (!(name in value)) continue;
		// A field where several items may apply has no single pick, and its
		// items imply nothing (checkImplies).
		const { candidates, pick } = fields[name] as CatalogFieldResult<unknown>;
		const winner = candidates.find(({ id }) => id === pick?.label);
		if (!winner?.implies) continue;
		for (const [target, ids] of Object.entries(winner.implies)) {
			if (target in value) continue;
			const held = fields[target] as ParsedFieldResult<unknown> & Paired;
			const filled = fillGap(held.candidates, held.answers, ids, held.pair);
			if (!filled) continue;
			value[target] = filled;
			fields[target] = { ...held, implied: { field: name, id: winner.id } };
		}
	}
}

/**
 * The parsers' readings as candidates: dates d0, d1..., times t0, t1...,
 * amounts a0, a1..., in the order they appear in the request.
 */
function readCandidates(
	request: string,
	facts: Facts,
	parsers: readonly Parser[],
	reads: Reads,
): CandidateReadings {
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

/** One call to the provider under the timeout; the eval's probes make theirs through it too. */
export async function answer(
	provider: Provider,
	input: { request: string; facts: Facts; questions: Question[] },
	timeoutMs: number,
): Promise<
	{ answer: ProviderAnswer; usage: Usage } | { error: AskError; usage?: Usage }
> {
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
			(result) => {
				const { answers } = result;
				// A call that broke the contract was still made, and still cost.
				const usage = usageOf(result);
				const breach = contractBreach(input.questions, answers);
				return breach
					? { error: providerError(new Error(breach)), usage }
					: { answer: answers, usage };
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
