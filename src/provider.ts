/** Written as facts: today in the person's time zone, local currency, catalog descriptions. */
export type Facts = Record<string, string>;

export type Label = {
	label: string;
	description: string;
};

/** One decision put to the provider as a single choice among labelled candidates. */
export type Question = {
	id: string;
	instruction: string;
	labels: Label[];
};

export type ProviderInput = {
	request: string;
	facts: Facts;
	questions: Question[];
	/** Aborted when the developer's timeout runs out; an adapter passes it to its SDK. */
	signal: AbortSignal;
};

/** A probability for every label of one question. */
export type Probabilities = Record<string, number>;

/** Per question id, a probability for every label (ADR 0001). */
export type ProviderAnswer = Record<string, Probabilities>;

/** What one call used, each figure only when the adapter knows it (ADR 0006). */
export type Usage = {
	/** The call's cost in US dollars. */
	costUsd?: number;
	inputTokens?: number;
};

/** One call's answer, and what the call used when the adapter knows (ADR 0006). */
export type ProviderResult = Usage & {
	answers: ProviderAnswer;
};

/** The model service that answers questions. It picks; it never writes a value (ADR 0002). */
export type Provider = {
	answer(input: ProviderInput): Promise<ProviderResult>;
};
