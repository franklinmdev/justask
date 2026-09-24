import {
	APIConnectionError,
	APIError,
	type ChoiceQuestion,
	type Questions,
	type RequestOptions,
	type SystemOneRequest,
	type SystemOneResult,
	TypeSafeClient,
} from "@typesafe-ai/sdk";
import {
	type Provider,
	type ProviderAnswer,
	type ProviderInput,
	ProviderUnavailableError,
} from "../provider.ts";

/** The Jev model every call names, so a gate measured on it stays measured. */
export const JEV_MODEL = "jev-1.13.0";

/**
 * jev-1.13.0 is charged per input token, output tokens free: $0.042 per
 * million, read from https://docs.typesafe.ai/models.md on 2026-09-22.
 */
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

/**
 * The SDK times each attempt out after 10 s by default. The adapter sets
 * setTimeout's ceiling instead, since a larger value would fire at once, so
 * the developer's timeout, through the signal, is what ends a call.
 */
const NO_SDK_TIMEOUT_MS = 2 ** 31 - 1;

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
	 * The default client also reads `TYPESAFE_BASE_URL` and `TYPESAFE_LOG_LEVEL`;
	 * at `debug` the SDK logs request bodies, which hold the request and facts.
	 */
	client?: JevClient;
};

/**
 * Jev as a provider (ADR 0001): all of a request's questions in one
 * `systemOne` call, each a `choice` question with every label, and a
 * probability back for every label, with the call's input tokens and cost.
 * No retries of the SDK's own: a 5xx, 529 included, or a lost connection is
 * thrown as ProviderUnavailableError, and the core calls once more (ADR 0013).
 */
export function jevProvider({ client }: JevProviderOptions = {}): Provider {
	let jev = client;
	return {
		async answer({ request, facts, questions, signal }: ProviderInput) {
			// The SDK refuses to run in a browser, so the key stays on the server.
			jev ??= new TypeSafeClient();
			const { answers, usage } = await Promise.resolve(
				jev.systemOne(
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
										labels.map(({ label, description }) => [
											label,
											description,
										]),
									),
								} satisfies ChoiceQuestion,
							]),
						),
					},
					{ signal, timeout: NO_SDK_TIMEOUT_MS, retry: { maxRetries: 0 } },
				),
			).catch((error: unknown) => {
				throw unavailable(error)
					? new ProviderUnavailableError(error.message, { cause: error })
					: error;
			});
			// Copied as Jev gave them; the core rejects an answer that misses a label.
			const answer: ProviderAnswer = {};
			for (const { id } of questions) {
				const response = answers[id];
				if (response?.type === "choice") {
					answer[id] = { ...response.probabilities };
				}
			}
			return {
				answers: answer,
				costUsd: usage.input_tokens * USD_PER_INPUT_TOKEN,
				inputTokens: usage.input_tokens,
			};
		},
	};
}

/** The service failed to answer, not the answer: a 5xx or no connection. */
function unavailable(error: unknown): error is APIError | APIConnectionError {
	return (
		(error instanceof APIError && error.status >= 500) ||
		error instanceof APIConnectionError
	);
}
