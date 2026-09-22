import type { Facts, Probabilities, Provider, Question } from "./provider.ts";

export type AskInput = {
	request: string;
	facts: Facts;
	provider: Provider;
	questions: Question[];
};

export type Pick = {
	label: string;
	probability: number;
	probabilities: Probabilities;
};

export type AskResult = {
	picks: Record<string, Pick>;
};

/** Asks every question in one provider call and reads the winning label of each. */
export async function ask({
	request,
	facts,
	provider,
	questions,
}: AskInput): Promise<AskResult> {
	const answer = await provider.answer({ request, facts, questions });
	const picks: Record<string, Pick> = {};
	for (const question of questions) {
		const probabilities = answer[question.id] ?? {};
		let winner: Pick | undefined;
		for (const [label, probability] of Object.entries(probabilities)) {
			if (!winner || probability > winner.probability) {
				winner = { label, probability, probabilities };
			}
		}
		if (winner) picks[question.id] = winner;
	}
	return { picks };
}
