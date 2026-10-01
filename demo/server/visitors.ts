import {
	NETWORK_DAY_LIMIT,
	NETWORK_MINUTE_LIMIT,
	VISITOR_DAY_LIMIT,
	VISITOR_MINUTE_LIMIT,
} from "../src/api.ts";

/** Which limit refused a call: the visitor's own (#110), or its IPv6 /48's (#250). */
export type VisitorLimit = "minute" | "day" | "networkMinute" | "networkDay";

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

/** Whether an address (visitorAddresses) is an IPv6 /48, counted under the network's limits. */
function isNetwork(address: string): boolean {
	return address.endsWith("::/48");
}

/**
 * The limits' one rule, which both ledgers keep, over a request's addresses
 * (visitorAddresses) and their counts so far: past any one's calls in the
 * day, or in the minute, the call is refused and counts nothing; otherwise it
 * counts against each, in both. A day's limit is named before a minute's,
 * since it lasts longer, and the visitor's own before its network's.
 */
export function countCall(
	addresses: { address: string; count: VisitorCount | undefined }[],
	minute: string,
): { limit: VisitorLimit } | { counts: VisitorCount[] } {
	const counted = addresses.map(({ address, count }) => {
		const network = isNetwork(address);
		const one = countOne(
			count,
			minute,
			network
				? { minute: NETWORK_MINUTE_LIMIT, day: NETWORK_DAY_LIMIT }
				: { minute: VISITOR_MINUTE_LIMIT, day: VISITOR_DAY_LIMIT },
		);
		if (typeof one !== "string" || !network) return one;
		return one === "day" ? "networkDay" : "networkMinute";
	});
	for (const limit of [
		"day",
		"networkDay",
		"minute",
		"networkMinute",
	] as const) {
		if (counted.includes(limit)) return { limit };
	}
	return { counts: counted as VisitorCount[] };
}

function countOne(
	count: VisitorCount | undefined,
	minute: string,
	limits: { minute: number; day: number },
): "minute" | "day" | VisitorCount {
	// A call stamped before the latest minute, by another isolate's clock, counts in that minute.
	const at = count && count.minute > minute ? count.minute : minute;
	const dayCalls = count?.dayCalls ?? 0;
	const minuteCalls = count?.minute === at ? count.minuteCalls : 0;
	if (dayCalls >= limits.day) return "day";
	if (minuteCalls >= limits.minute) return "minute";
	return { minute: at, minuteCalls: minuteCalls + 1, dayCalls: dayCalls + 1 };
}
