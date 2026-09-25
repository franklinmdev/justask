import { VISITOR_DAY_LIMIT, VISITOR_MINUTE_LIMIT } from "../src/api.ts";

/** Which of a visitor's limits refused a call (#110). */
export type VisitorLimit = "minute" | "day";

/**
 * Who a request counts against, from the address Cloudflare names it by
 * (`CF-Connecting-IP`): an IPv4 address as it is, an IPv6 address by its /64,
 * since one home or office is handed a whole /64 and would otherwise get a
 * fresh count per address. An IPv4 address inside an IPv4-mapped IPv6 one is
 * that IPv4 address, as Node names a local visitor. None when the request
 * names no address.
 */
export function visitorAddress(address: string | null): string | null {
	if (!address) return null;
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
	if (mapped?.[1]) return mapped[1];
	if (!address.includes(":")) return address;
	const [head = "", tail] = address.toLowerCase().split("::");
	const left = head ? head.split(":") : [];
	const right = tail ? tail.split(":") : [];
	const groups =
		tail === undefined
			? left
			: [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
	const prefix = groups
		.slice(0, 4)
		.map((group) => group.replace(/^0+(?=.)/, ""))
		.join(":");
	return `${prefix}::/64`;
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

/**
 * The limits' one rule, which both ledgers keep: past the day's calls, or the
 * minute's, the call is refused and counts nothing; otherwise it counts
 * against both. The day's limit is named first, since it lasts longer.
 */
export function countCall(
	count: VisitorCount | undefined,
	minute: string,
): { limit: VisitorLimit } | { count: VisitorCount } {
	// A call stamped before the visitor's latest minute, by another isolate's clock, counts in that minute.
	const at = count && count.minute > minute ? count.minute : minute;
	const dayCalls = count?.dayCalls ?? 0;
	const minuteCalls = count?.minute === at ? count.minuteCalls : 0;
	if (dayCalls >= VISITOR_DAY_LIMIT) return { limit: "day" };
	if (minuteCalls >= VISITOR_MINUTE_LIMIT) return { limit: "minute" };
	return {
		count: { minute: at, minuteCalls: minuteCalls + 1, dayCalls: dayCalls + 1 },
	};
}
