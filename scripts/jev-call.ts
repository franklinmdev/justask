// One real Jev call through ask, by hand, never in CI. Reads TYPESAFE_API_KEY
// from the environment or from .env, and prints the result, latency and cost.
//
//   node --conditions=source scripts/jev-call.ts ["a request"]

import { TypeSafeClient, type Usage } from "@typesafe-ai/sdk";
import { ask, type Candidate, type Provider } from "justask";
import { JEV_MODEL, jevProvider } from "justask/jev";
import { loadKeyEnv } from "./load-env.ts";

loadKeyEnv();

const vendors: Candidate<string>[] = [
	{
		id: "acme",
		description: "Acme Supplies, office paper and toner",
		value: "Acme Supplies",
	},
	{
		id: "northwind",
		description: "Northwind Traders, catering",
		value: "Northwind Traders",
	},
	{
		id: "contoso",
		description: "Contoso Cloud, hosting",
		value: "Contoso Cloud",
	},
];

const sdk = new TypeSafeClient();
let usage: Usage | undefined;
let model: string | undefined;
const jev = jevProvider({
	client: {
		systemOne: (request, options) =>
			sdk.systemOne(request, options).then((result) => {
				usage = result.usage;
				model = result.model;
				return result;
			}),
	},
});

// The adapter prices the call itself (ADR 0006).
let costUsd: number | undefined;
const provider: Provider = {
	async answer(input) {
		const result = await jev.answer(input);
		costUsd = result.costUsd;
		return result;
	},
};

const request = process.argv[2] ?? "the invoices for our catering last week";
const started = performance.now();
const result = await ask({
	request,
	facts: { today: new Date().toISOString().slice(0, 10) },
	provider,
	timeoutMs: 5_000,
	search: {
		description: "the vendor the request means",
		gate: 0.5,
		shortlist: () => vendors,
	},
});
const latencyMs = Math.round(performance.now() - started);

console.log(
	JSON.stringify(
		{
			request,
			asked: JEV_MODEL,
			answered: model,
			item: result.search.item,
			pick: result.search.pick,
			probabilities: result.search.probabilities,
			error: result.error?.message,
			latencyMs,
			inputTokens: usage?.input_tokens,
			costUsd,
		},
		null,
		2,
	),
);
