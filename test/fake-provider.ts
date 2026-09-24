import type {
	ChoiceResponse,
	Questions,
	RequestOptions,
	SystemOneRequest,
	SystemOneResult,
} from "@typesafe-ai/sdk";
import type {
	Probabilities,
	Provider,
	ProviderAnswer,
	ProviderInput,
	ProviderResult,
	Usage,
} from "justask";
import type { JevClient } from "justask/jev";

/** Fixed probabilities per question id, then per label. */
export type FakeAnswers = Record<string, Probabilities>;

/**
 * The single test seam: a provider with no network and no cost that answers
 * every question from fixed probabilities. It throws when a question or one of
 * its labels has no fixture, so a test cannot pass on an answer it never set.
 * Pass a function to answer each request differently, as over an eval set.
 * `costUsd` and `inputTokens`, when given, are reported for each call.
 */
export function fakeProvider(
	fixtures: FakeAnswers | ((request: string) => FakeAnswers),
	{ costUsd, inputTokens }: { costUsd?: number; inputTokens?: number } = {},
): Provider & {
	calls: Parameters<Provider["answer"]>[0][];
} {
	const calls: Parameters<Provider["answer"]>[0][] = [];
	return {
		calls,
		async answer(input) {
			calls.push(input);
			const answers =
				typeof fixtures === "function" ? fixtures(input.request) : fixtures;
			const answer: ProviderAnswer = {};
			for (const question of input.questions) {
				const fixture = answers[question.id];
				if (!fixture) {
					throw new Error(
						`fakeProvider: no answer for question "${question.id}"`,
					);
				}
				const probabilities: Probabilities = {};
				for (const { label } of question.labels) {
					const probability = fixture[label];
					if (probability === undefined) {
						throw new Error(
							`fakeProvider: no probability for label "${label}" of question "${question.id}"`,
						);
					}
					probabilities[label] = probability;
				}
				answer[question.id] = probabilities;
			}
			return {
				answers: answer,
				...(costUsd !== undefined && { costUsd }),
				...(inputTokens !== undefined && { inputTokens }),
			};
		},
	};
}

/** Each request's fixtures, for `fakeProvider`; a request with none throws, as an unset question does. */
export function perRequest(
	answers: Record<string, FakeAnswers>,
): (request: string) => FakeAnswers {
	return (request) => {
		const fixture = answers[request];
		if (!fixture) throw new Error(`no fixture for "${request}"`);
		return fixture;
	};
}

type RecordingProvider = Provider & { calls: ProviderInput[] };

function recording(answer: Provider["answer"]): RecordingProvider {
	const calls: ProviderInput[] = [];
	return {
		calls,
		answer(input) {
			calls.push(input);
			return answer(input);
		},
	};
}

/**
 * Returns `answer` as is, unchecked, for answers that break the contract or
 * tie, with `usage` reported beside it when given.
 */
export function rawProvider(
	answer: ProviderAnswer,
	usage: Usage = {},
): RecordingProvider {
	return recording(
		async (): Promise<ProviderResult> => ({ answers: answer, ...usage }),
	);
}

/** Rejects with `cause`, or throws it before returning a promise when `synchronous`. */
export function failingProvider(
	cause: unknown,
	{ synchronous = false } = {},
): RecordingProvider {
	return recording(() => {
		if (synchronous) throw cause;
		return Promise.reject(cause);
	});
}

/** Never answers, so the developer's timeout is what ends the call. */
export function hangingProvider(): RecordingProvider {
	return recording(() => new Promise(() => {}));
}

type JevCall = {
	request: SystemOneRequest;
	options: RequestOptions | undefined;
};

/**
 * A fake of the TypeSafe SDK client, for the Jev adapter's tests only: it
 * records each `systemOne` call and answers through `respond`, with no network.
 */
export function fakeJevClient(
	respond: (call: JevCall) => Promise<SystemOneResult<Questions>>,
): JevClient & { calls: JevCall[] } {
	const calls: JevCall[] = [];
	return {
		calls,
		systemOne(request, options) {
			const call = { request, options };
			calls.push(call);
			return respond(call);
		},
	};
}

/** Jev's answer to `choice` questions: per question id, a probability for every label. */
export function jevResult(
	probabilities: Record<string, Probabilities>,
): SystemOneResult<Questions> {
	const answers: Record<string, ChoiceResponse> = {};
	for (const [id, byLabel] of Object.entries(probabilities)) {
		const [choice = ""] =
			Object.entries(byLabel).sort(([, a], [, b]) => b - a)[0] ?? [];
		answers[id] = {
			type: "choice",
			choice,
			confidence: byLabel[choice] ?? 0,
			probabilities: byLabel,
		};
	}
	return {
		model: "jev-1.13.0",
		answers,
		usage: { input_tokens: 120, output_tokens: 0 },
	};
}

/**
 * Answers its first call from `first` after `delayMs`, and every later call
 * from `then` at once, so a later request's answer arrives before the first's.
 */
export function slowFirstProvider(
	first: FakeAnswers,
	then: FakeAnswers,
	delayMs: number,
): RecordingProvider {
	const slow = fakeProvider(first);
	const fast = fakeProvider(then);
	return recording(async (input) => {
		if (slow.calls.length > 0) return fast.answer(input);
		const answer = slow.answer(input);
		await new Promise((resolve) => setTimeout(resolve, delayMs));
		return answer;
	});
}
