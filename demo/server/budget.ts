import { APIError } from "@typesafe-ai/sdk";
import type { Provider } from "justask";
import {
	countCall,
	newSalt,
	utcMinute,
	type VisitorCount,
	type VisitorLimit,
	visitorKey,
} from "./visitors.ts";

/**
 * The owner's key spends at most this much a UTC day, give or take the last
 * call, whose cost is known only once it returns (#29, #109).
 */
export const DAILY_BUDGET_USD = 1;

/**
 * Where the demo keeps what outlives a request: the day's spend so far and
 * each visitor's calls (#110). In memory for `pnpm demo` and the tests, a
 * Durable Object with SQLite on the Worker (demo/worker/ledger.ts). The
 * answer cache joins it later (#112).
 */
export type Ledger = {
	/** The US dollars spent on `day`, a UTC date as YYYY-MM-DD. */
	spent(day: string): Promise<number>;
	add(day: string, usd: number): Promise<void>;
	/**
	 * Counts one call from `addresses` (visitorAddresses) at `now`, against
	 * each, or answers which limit refuses it, counting nothing. Holds only a
	 * hash of each address with the UTC day's salt, and drops the earlier
	 * days' counts and salt on a new day's first call.
	 */
	visit(addresses: string[], now: Date): Promise<VisitorLimit | null>;
};

/** The dev server's real ledger, and the tests': it lasts as long as the process. */
export function memoryLedger(): Ledger {
	const days = new Map<string, number>();
	let visitors: {
		day: string;
		salt: string;
		counts: Map<string, VisitorCount>;
	} = { day: "", salt: "", counts: new Map() };
	return {
		async spent(day) {
			return days.get(day) ?? 0;
		},
		async add(day, usd) {
			days.set(day, (days.get(day) ?? 0) + usd);
		},
		async visit(addresses, now) {
			const day = utcDay(now);
			if (visitors.day < day) {
				visitors = { day, salt: newSalt(), counts: new Map() };
			}
			// Held across the hash, so a new day meanwhile cannot take this call.
			const { salt, counts } = visitors;
			const keys = await Promise.all(
				addresses.map((address) => visitorKey(salt, address)),
			);
			const counted = countCall(
				addresses.map((address, i) => ({
					address,
					count: counts.get(keys[i] ?? ""),
				})),
				utcMinute(now),
			);
			if ("limit" in counted) return counted.limit;
			keys.forEach((key, i) => {
				const count = counted.counts[i];
				if (count) counts.set(key, count);
			});
			return null;
		},
	};
}

/** The UTC day `now` falls on, as YYYY-MM-DD: the budget's day. */
export function utcDay(now: Date): string {
	return now.toISOString().slice(0, 10);
}

/**
 * What each call reserves on the day's spend before it is sent (#250): the
 * dearest call in the eval run logs of 2026-09-23 to 2026-09-27, $0.0000985
 * (a Spanish card; a card ran $0.0000894 to $0.0000985, a filter $0.0000550
 * to $0.0000942, a search $0.0000315 to $0.0000342), rounded up. A call that
 * returns settles it to its own cost; one that never returns keeps it.
 */
export const RESERVED_USD = 0.0001;

/**
 * One request's provider: each call reserves RESERVED_USD on the day's spend
 * before it is sent, so a call cancelled by the visitor hanging up or by the
 * timeout, which TypeSafe may still bill (unverified), is counted too (#250).
 * A call that returns settles the reservation to its cost, before the answer
 * is used, so a Worker stopped on its CPU limit afterwards still counted the
 * call it paid for (#107); one that fails, or reports no cost, keeps it.
 * One TypeSafe refused with the owner's key gives it back, and marks
 * `refused`.
 */
export function counted(
	provider: Provider,
	ledger: Ledger,
): Provider & { refused: boolean } {
	const request = {
		refused: false,
		async answer(input: Parameters<Provider["answer"]>[0]) {
			// Settled on the day it was reserved, even past midnight.
			const day = utcDay(new Date());
			await ledger.add(day, RESERVED_USD);
			const result = await provider
				.answer(input)
				.catch(async (error: unknown) => {
					if (keyRefused(error)) {
						// Refused, so never run: nothing to bill.
						request.refused = true;
						await ledger.add(day, -RESERVED_USD);
					}
					throw error;
				});
			if (result.costUsd !== undefined) {
				await ledger.add(day, result.costUsd - RESERVED_USD);
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
export function keyRefused(error: unknown): boolean {
	return (
		error instanceof APIError &&
		error.status >= 400 &&
		error.status < 500 &&
		error.status !== 429
	);
}
