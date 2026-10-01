import { VISITOR_DAY_LIMIT, VISITOR_MINUTE_LIMIT } from "../src/api.ts";

/** Which of a visitor's limits refused a call (#110). */
export type VisitorLimit = "minute" | "day";

/**
 * Each IPv6 /48's calls, beside each of its /64s' own (#250): a /56 holds 256
 * /64s, and at 200 calls a day each would spend the day's budget in minutes.
 * A /48 is one site's whole allocation, so it is looser than a visitor's: three
 * busy visitors at once, and five days' worth of one, about $0.10 a day at the
 * budget's reservation. Several visitors of one carrier's pool may share a
 * /48 and its limits.
 */
export const NETWORK_MINUTE_LIMIT = 60;
export const NETWORK_DAY_LIMIT = 1_000;

/**
 * Who a request counts against, from the address Cloudflare names it by
 * (`CF-Connecting-IP`): an IPv4 address as it is; an IPv6 address by its /64,
 * since one home or office is handed a whole /64 and would otherwise get a
 * fresh count per address, and by its /48, so many /64s of one site share a
 * looser limit too. An IPv4 address inside an IPv4-mapped IPv6 one is that
 * IPv4 address, as Node names a local visitor. None when the request names no
 * address. A call counts against every one, or none.
 */
export function visitorAddresses(address: string | null): string[] {
	if (!address) return [];
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
	if (mapped?.[1]) return [mapped[1]];
	if (!address.includes(":")) return [address];
	const [head = "", tail] = address.toLowerCase().split("::");
	const left = head ? head.split(":") : [];
	const right = tail ? tail.split(":") : [];
	const groups = (
		tail === undefined
			? left
			: [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
	).map((group) => group.replace(/^0+(?=.)/, ""));
	return [
		`${groups.slice(0, 4).join(":")}::/64`,
		`${groups.slice(0, 3).join(":")}::/48`,
	];
}

/**
 * The name a visitor is counted under: a hash of their address with the day's
 * salt, so the ledger never holds an address, and yesterday's counts, once
 * their salt is dropped at UTC midnight, name no one.
 */
export async function visitorKey(
	salt: string,
	address: string,
): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`${salt}\n${address}`),
	);
	return Array.from(new Uint8Array(digest).slice(0, 16), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

/** A fresh salt for a UTC day's visitor keys. */
export function newSalt(): string {
	return crypto.randomUUID();
}

/** The next UTC midnight after `now`, in ms: when the day's counts and salt go. */
export function nextUtcMidnight(now: Date): number {
	return Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate() + 1,
	);
}

/** One visitor's counts: the day's calls, and the calls in the UTC minute named. */
export type VisitorCount = {
	minute: string;
	minuteCalls: number;
	dayCalls: number;
};

/** The UTC minute `now` falls on, as YYYY-MM-DDTHH:MM: the minute limit's window. */
export function utcMinute(now: Date): string {
	return now.toISOString().slice(0, 16);
}

/** The limits an address counts under: a /48's, or a visitor's. */
function limitsOf(address: string): { minute: number; day: number } {
	return address.endsWith("::/48")
		? { minute: NETWORK_MINUTE_LIMIT, day: NETWORK_DAY_LIMIT }
		: { minute: VISITOR_MINUTE_LIMIT, day: VISITOR_DAY_LIMIT };
}

/**
 * The limits' one rule, which both ledgers keep, over a request's addresses
 * (visitorAddresses) and their counts so far: past any one's calls in the
 * day, or in the minute, the call is refused and counts nothing; otherwise it
 * counts against each, in both. The day's limit is named first, since it
 * lasts longer.
 */
export function countCall(
	addresses: { address: string; count: VisitorCount | undefined }[],
	minute: string,
): { limit: VisitorLimit } | { counts: VisitorCount[] } {
	const counted = addresses.map(({ address, count }) =>
		countOne(count, minute, limitsOf(address)),
	);
	for (const limit of ["day", "minute"] as const) {
		if (counted.some((one) => one === limit)) return { limit };
	}
	return { counts: counted as VisitorCount[] };
}

function countOne(
	count: VisitorCount | undefined,
	minute: string,
	limits: { minute: number; day: number },
): VisitorLimit | VisitorCount {
	// A call stamped before the latest minute, by another isolate's clock, counts in that minute.
	const at = count && count.minute > minute ? count.minute : minute;
	const dayCalls = count?.dayCalls ?? 0;
	const minuteCalls = count?.minute === at ? count.minuteCalls : 0;
	if (dayCalls >= limits.day) return "day";
	if (minuteCalls >= limits.minute) return "minute";
	return { minute: at, minuteCalls: minuteCalls + 1, dayCalls: dayCalls + 1 };
}
