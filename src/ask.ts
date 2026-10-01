import {
	type CandidateReadings,
	type Card,
	type CardDateReading,
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
import { checkNegations, findNegated } from "./negation.ts";
import {
	type DateReading,
	type Parser,
	parseRequest,
	type Reads,
} from "./parse.ts";
import type { Pick } from "./pick.ts";
import {
	type Facts,
	type Probabilities,
	type Provider,
	type ProviderAnswer,
	ProviderUnavailableError,
	type Question,
	type Usage,
	usageOf,
} from "./provider.ts";
import { findRoleMarker } from "./role-marker.ts";
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
	/**
	 * Aborts the provider call when the caller no longer wants the answer, such
	 * as a browser that went away; `ask` then rejects with the signal's reason.
	 */
	signal?: AbortSignal;
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

/**
 * Why the provider gave no usable answer. Every field is held when present.
 * `transport` marks a provider that was unavailable on both calls (ADR 0013),
 * not one whose answer broke the contract or that threw otherwise.
 */
export type AskError =
	| { kind: "provider"; message: string; cause: unknown; transport?: true }
	| { kind: "timeout"; message: string; timeoutMs: number };

/**
 * Set when `ask` called the provider twice, the first call unavailable (ADR
 * 0013), whether or not the second answered; left out otherwise.
 */
export type Retried = { retried?: true };

/**
 * What a result carries of its provider call: the figures the provider
 * reported (ADR 0006) and the retry mark (ADR 0013), each left out when unset.
 */
export type Spent = Usage & Retried;

/**
 * Each result carries what the provider call used, when the provider reports
 * it: left out when there was no call, when the call failed or timed out, or
 * when the adapter cannot know (ADR 0006). A retried call's figures are the
 * second call's, since the first threw and reported none.
 */
export type AskResult<T> = Spent & {
	search: SearchResult<T>;
	error?: AskError;
};

export type AskFilterResult<F extends Fields> = Spent & {
	filter: FilterResult<F>;
	error?: AskError;
};

export type AskCardResult<F extends CardFields> = Spent & {
	card: CardResult<F>;
	error?: AskError;
};

const SEARCH = "search";

/**
 * Resolves a request through the host app's own state: code finds the
 * candidates, the provider picks in one call, code builds the result (ADR
 * 0002). A search resolves to one item or none; a filter to the filter
 * object its table understands; a card to a new record, or to nothing when
 * the request asks for none. A blank request holds everything with no call.
 * A failed or late provider holds everything; an unavailable one is called
 * once more within the same timeout (ADR 0013).
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
 * Throws on a search the flow cannot run: a gate outside 0 to 1, or a joiner
 * that is not one word. `ask` checks on every call, a handler once, when
 * created.
 */
export function checkSearch(search: Search<unknown>): void {
	checkGate(search.gate, "the search's gate");
	checkJoiners(search.joiners, "search");
}

/** Throws on a filter the flow cannot run, as `checkSearch` does, or two fields whose question ids clash. */
export function checkFilter(filter: Filter<Fields>): void {
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
}

/** Throws on a card the flow cannot run, as `checkFilter` does, or a blank command. */
export function checkCard(card: Card<CardFields>): void {
	checkGate(card.gate, "the card's gate");
	checkCommands(card.commands);
	checkJoiners(card.joiners, "card");
	checkNegations(card.negations);
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
	signal,
	search,
}: AskInput<T>): Promise<AskResult<T>> {
	checkTimeout(timeoutMs);
	checkSearch(search);
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
	if (candidates.length === 0 || isBlank(request)) return { search: held };

	const questions = [searchQuestion(SEARCH, search, candidates)];
	const outcome = await answer(
		provider,
		{ request, facts, questions },
		timeoutMs,
		{ signal },
	);
	if ("error" in outcome) {
		return { search: held, ...spent(outcome), error: outcome.error };
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
		...spent(outcome),
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
	signal,
	filter,
}: AskFilterInput<F>): Promise<AskFilterResult<F>> {
	checkTimeout(timeoutMs);
	checkFilter(filter);
	const names = Object.keys(filter.fields);
	const field = (name: string) => filter.fields[name] as Field;
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
	const marker = findRoleMarker(request);
	const held = () =>
		({
			value: {},
			fields: Object.fromEntries(
				names.map((name) => [name, planOf(name).held]),
			),
			...(marker && { marker }),
		}) as FilterResult<F>;

	const questions = names.flatMap((name) => planOf(name).questions);
	if (questions.length === 0 || isBlank(request)) return { filter: held() };

	const outcome = await answer(
		provider,
		{ request, facts, questions },
		timeoutMs,
		{ signal },
	);
	if ("error" in outcome) {
		return { filter: held(), ...spent(outcome), error: outcome.error };
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
		if (!marker && "value" in read) value[name] = read.value;
	}
	return {
		filter: { value, fields, ...(marker && { marker }) } as FilterResult<F>,
		...spent(outcome),
	};
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
	signal,
	card,
}: AskCardInput<F>): Promise<AskCardResult<F>> {
	checkTimeout(timeoutMs);
	checkCard(card);
	const names = Object.keys(card.fields);
	const field = (name: string) => card.fields[name] as CardFields[string];
	const parsed = new Map<Reads, CandidateReadings>();
	const readingsFor = (reads: Reads) => {
		let readings = parsed.get(reads);
		if (!readings) {
			readings = readCandidates(request, facts, card.parsers ?? [], reads, {
				bareIsLocal: facts.local_currency !== undefined,
			});
			if (reads === "past") {
				readings = { ...readings, dates: markAfter(readings.dates, facts) };
			}
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
				const several = declared.several === true;
				const negated = several
					? []
					: findNegated(request, candidates, card.negations);
				const pair = findPair(request, candidates, card.joiners, { several });
				plans[name] = cardPlan(
					name,
					card,
					declared,
					candidates,
					NO_READINGS,
					// A negated item is no choice: "not Acme, Northwind" names one (ADR 0016).
					negated.some(({ id }) => pair?.ids.includes(id)) ? undefined : pair,
					negated,
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

	if (isBlank(request)) return { card: held() };
	const questions = [
		intentQuestion(card),
		...names.flatMap((name) => planOf(name).questions),
	];
	const outcome = await answer(
		provider,
		{ request, facts, questions },
		timeoutMs,
		{ signal },
	);
	if ("error" in outcome) {
		return { card: held(), ...spent(outcome), error: outcome.error };
	}

	const intent = readIntent(
		outcome.answer[INTENT] ?? {},
		card.gate,
		findCommand(request, card.commands),
		findRoleMarker(request),
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
		...spent(outcome),
	};
}

/**
 * Marks each day after today, which a field that reads the past never fills,
 * explicit words included (ADR 0008). The candidate stays, so its pick is
 * still asked and reported.
 */
function markAfter(
	dates: Candidate<DateReading>[],
	facts: Facts,
): Candidate<CardDateReading>[] {
	const today = todayOf(facts);
	return dates.map((candidate) =>
		candidate.value.from > today
			? { ...candidate, value: { ...candidate.value, afterToday: true } }
			: candidate,
	);
}

/** A request with nothing in it asks for nothing, so it makes no call. */
function isBlank(request: string): boolean {
	return request.trim() === "";
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
			value[target] = filled.map(({ value }) => value);
			fields[target] = { ...held, implied: { field: name, id: winner.id } };
		}
	}
}

/**
 * The most readings of one kind a field weighs. A request with more, such as
 * a pasted list of numbers, has no one reading to pick, and each would add
 * labels to the call and its cost; that kind is left with none, so its fields
 * are held without a question.
 */
const MAX_READINGS = 10;

/** Today's date from the "today" fact, which the handler writes as a sentence. */
function todayOf(facts: Facts): string {
	const today = /\d{4}-\d{2}-\d{2}/.exec(facts.today ?? "")?.[0];
	if (!today) {
		throw new TypeError(
			'justask: a date or amount field needs the "today" fact, with today\'s date as YYYY-MM-DD',
		);
	}
	return today;
}

/**
 * The parsers' readings as candidates: dates d0, d1..., times t0, t1...,
 * amounts a0, a1..., in the order they appear in the request. A kind with
 * more than MAX_READINGS has none.
 */
function readCandidates(
	request: string,
	facts: Facts,
	parsers: readonly Parser[],
	reads: Reads,
	{ bareIsLocal = false }: { bareIsLocal?: boolean } = {},
): CandidateReadings {
	const today = todayOf(facts);
	const { dates, times, amounts } = parseRequest(
		request,
		{ today, reads, facts },
		parsers,
	);
	const weighed = <R>(readings: R[]) =>
		readings.length > MAX_READINGS ? [] : readings;
	return {
		dates: weighed(dates).map((value, i) => ({
			id: `d${i}`,
			description: describeDate(value),
			value,
		})),
		times: weighed(times).map((value, i) => ({
			id: `t${i}`,
			description: describeTime(value),
			value,
		})),
		amounts: weighed(amounts).map((value, i) => ({
			id: `a${i}`,
			description: describeAmount(value, bareIsLocal),
			value,
		})),
		...(bareIsLocal && { bareIsLocal: true as const }),
	};
}

/**
 * One call to the provider under the timeout, and one more within it when
 * the provider was unavailable (ADR 0013). The eval's probes make theirs
 * through it too, with `retry` off, since they time the provider's one call.
 * The caller's `signal` aborts the call and rejects with its reason.
 */
export async function answer(
	provider: Provider,
	input: { request: string; facts: Facts; questions: Question[] },
	timeoutMs: number,
	{
		retry = true,
		signal,
	}: { retry?: boolean; signal?: AbortSignal | undefined } = {},
): Promise<({ answer: ProviderAnswer } | { error: AskError }) & Spent> {
	signal?.throwIfAborted();
	const controller = new AbortController();
	let stop: (() => void) | undefined;
	const aborted = new Promise<never>((_, reject) => {
		stop = () => {
			controller.abort(signal?.reason);
			reject(signal?.reason);
		};
		signal?.addEventListener("abort", stop, { once: true });
	});
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
	const once = () =>
		Promise.resolve()
			.then(() => provider.answer({ ...input, signal: controller.signal }))
			.then(
				(result) => {
					const { answers } = result;
					// A call that broke the contract was still made, and still cost.
					const usage = usageOf(result);
					const breach = contractBreach(input.questions, answers);
					return breach
						? { error: providerError(new Error(breach)), ...usage }
						: { answer: answers, ...usage };
				},
				(cause: unknown) => ({ error: providerError(cause) }),
			);
	// Each call races the one timeout, so a second call cut short is still marked.
	const timed = () => Promise.race([once(), timeout, aborted]);
	try {
		const first = await timed();
		return retry &&
			"error" in first &&
			first.error.kind === "provider" &&
			first.error.transport &&
			!controller.signal.aborted
			? { ...(await timed()), retried: true }
			: first;
	} finally {
		clearTimeout(timer);
		if (stop) signal?.removeEventListener("abort", stop);
	}
}

/** setTimeout's ceiling: a longer timeout, or none, would fire at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Throws unless the timeout is a number of milliseconds setTimeout keeps:
 * any other, Infinity included, would end every call at once.
 */
export function checkTimeout(timeoutMs: number): void {
	if (!(timeoutMs >= 1 && timeoutMs <= MAX_TIMEOUT_MS)) {
		throw new TypeError(
			`justask: the timeout must be a number of milliseconds from 1 to ${MAX_TIMEOUT_MS}, not ${timeoutMs}`,
		);
	}
}

/** Of an outcome or a result, only what it spent: the figures reported, and the retry mark. */
export function spent(from: Spent): Spent {
	return { ...usageOf(from), ...(from.retried && { retried: true }) };
}

function providerError(cause: unknown): AskError {
	return {
		kind: "provider",
		message: cause instanceof Error ? cause.message : String(cause),
		cause,
		...(cause instanceof ProviderUnavailableError && { transport: true }),
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
