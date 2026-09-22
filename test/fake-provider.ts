import type { Probabilities, Provider, ProviderAnswer } from "justask";

/** Fixed probabilities per question id, then per label. */
export type FakeAnswers = Record<string, Probabilities>;

/**
 * The single test seam: a provider with no network and no cost that answers
 * every question from fixed probabilities. It throws when a question or one of
 * its labels has no fixture, so a test cannot pass on an answer it never set.
 */
export function fakeProvider(answers: FakeAnswers): Provider & {
	calls: Parameters<Provider["answer"]>[0][];
} {
	const calls: Parameters<Provider["answer"]>[0][] = [];
	return {
		calls,
		async answer(input) {
			calls.push(input);
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
			return answer;
		},
	};
}
