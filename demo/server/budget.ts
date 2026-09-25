import { APIError } from "@typesafe-ai/sdk";
import type { Provider } from "justask";

/**
 * The owner's key spends at most this much a UTC day, give or take the last
 * call, whose cost is known only once it returns (#29, #109).
 */
export const DAILY_BUDGET_USD = 1;

/**
 * Where the demo keeps what outlives a request: the day's spend so far. In
 * memory for `pnpm demo` and the tests, a Durable Object with SQLite on the
 * Worker (demo/worker/ledger.ts). The per-visitor limits and the answer cache
 * join it later (#110, #112).
 */
export type Ledger = {
	/** The US dollars spent on `day`, a UTC date as YYYY-MM-DD. */
	spent(day: string): Promise<number>;
	add(day: string, usd: number): Promise<void>;
};

/** The dev server's real ledger, and the tests': it lasts as long as the process. */
export function memoryLedger(): Ledger {
	const days = new Map<string, number>();
	return {
		async spent(day) {
			return days.get(day) ?? 0;
		},
		async add(day, usd) {
			days.set(day, (days.get(day) ?? 0) + usd);
		},
	};
}

/** The UTC day `now` falls on, as YYYY-MM-DD: the budget's day. */
export function utcDay(now: Date): string {
	return now.toISOString().slice(0, 10);
}

/**
 * One request's provider: each call's cost is added to the day's spend as
 * soon as the call returns, before the answer is used, so a Worker stopped on
 * its CPU limit afterwards still counted the call it paid for (#107). Marks
 * `refused` when TypeSafe refused the owner's key.
 */
export function counted(
	provider: Provider,
	ledger: Ledger,
): Provider & { refused: boolean } {
	const request = {
		refused: false,
		async answer(input: Parameters<Provider["answer"]>[0]) {
			const result = await provider.answer(input).catch((error: unknown) => {
				if (keyRefused(error)) request.refused = true;
				throw error;
			});
			if (result.costUsd !== undefined) {
				await ledger.add(utcDay(new Date()), result.costUsd);
			}
			return result;
		},
	};
	return request;
}

/**
 * A 4xx other than 429 refuses the key or the account itself, whatever status
 * TypeSafe uses for being out of credit (unverified, #29). A 429 is a pace,
 * and a 5xx or a lost connection is the service, both left to the usual error.
 */
function keyRefused(error: unknown): boolean {
	return (
		error instanceof APIError &&
		error.status >= 400 &&
		error.status < 500 &&
		error.status !== 429
	);
}
