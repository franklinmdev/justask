import {
	type ChoiceQuestion,
	type Questions,
	type RequestOptions,
	type SystemOneRequest,
	type SystemOneResult,
	TypeSafeClient,
} from "@typesafe-ai/sdk";
import type { Provider, ProviderAnswer, ProviderInput } from "../provider.ts";

/** The Jev model every call names, so a gate measured on it stays measured. */
export const JEV_MODEL = "jev-1.13.0";

/** The part of the TypeSafe SDK client the adapter uses. */
export type JevClient = {
	systemOne(
		request: SystemOneRequest,
		options?: RequestOptions,
	): PromiseLike<SystemOneResult<Questions>>;
};

export type JevProviderOptions = {
	/**
	 * Defaults to a TypeSafe client that reads `TYPESAFE_API_KEY` from the
	 * server environment, created on the first call so a missing key surfaces as
	 * a provider error from `ask`. Pass one for tests or a custom transport.
	 */
	client?: JevClient;
};

/**
 * Jev as a provider (ADR 0001): all of a request's questions in one
 * `systemOne` call, each a `choice` question with every label, and a
 * probability back for every label. No retries, as the core asks.
 */
export function jevProvider({ client }: JevProviderOptions = {}): Provider {
	let jev = client;
	return {
		async answer({ request, facts, questions, signal }: ProviderInput) {
			// The SDK refuses to run in a browser, so the key stays on the server.
			jev ??= new TypeSafeClient();
			const { answers } = await jev.systemOne(
				{
					model: JEV_MODEL,
					state: { request, facts },
					questions: Object.fromEntries(
						questions.map(({ id, instruction, labels }) => [
							id,
							{
								type: "choice",
								instructions: instruction,
								criteria: Object.fromEntries(
									labels.map(({ label, description }) => [label, description]),
								),
							} satisfies ChoiceQuestion,
						]),
					),
				},
				{ signal, retry: { maxRetries: 0 } },
			);
			// Copied as Jev gave them; the core rejects an answer that misses a label.
			const answer: ProviderAnswer = {};
			for (const { id } of questions) {
				const response = answers[id];
				if (response?.type === "choice") {
					answer[id] = { ...response.probabilities };
				}
			}
			return answer;
		},
	};
}
