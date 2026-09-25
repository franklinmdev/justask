import { DurableObject } from "cloudflare:workers";
import { type Ledger, utcDay } from "../server/budget.ts";
import {
	countCall,
	newSalt,
	utcMinute,
	type VisitorLimit,
	visitorKey,
} from "../server/visitors.ts";

/**
 * The Worker's ledger (#109): one Durable Object with SQLite for the whole
 * demo, so every isolate, anywhere, reads and adds to the same day's spend
 * and the same visitor's calls (#110). One spend row a UTC day; one salt row
 * for today and one row per visitor today, keyed by the salted hash of their
 * address, both dropped on the next day's first call. Its methods are called
 * over RPC (durableLedger).
 */
export class DemoLedger extends DurableObject {
	constructor(...args: ConstructorParameters<typeof DurableObject>) {
		super(...args);
		const { sql } = this.ctx.storage;
		sql.exec(
			"CREATE TABLE IF NOT EXISTS spend (day TEXT PRIMARY KEY, usd REAL NOT NULL)",
		);
		sql.exec(
			"CREATE TABLE IF NOT EXISTS visitor_salt (day TEXT PRIMARY KEY, salt TEXT NOT NULL)",
		);
		sql.exec(
			"CREATE TABLE IF NOT EXISTS visitors (visitor TEXT PRIMARY KEY, minute TEXT NOT NULL, minute_calls INTEGER NOT NULL, day_calls INTEGER NOT NULL)",
		);
	}

	spent(day: string): number {
		const [row] = this.ctx.storage.sql
			.exec("SELECT usd FROM spend WHERE day = ?", day)
			.toArray();
		return row ? Number(row.usd) : 0;
	}

	add(day: string, usd: number): void {
		this.ctx.storage.sql.exec(
			"INSERT INTO spend (day, usd) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET usd = usd + excluded.usd",
			day,
			usd,
		);
	}

	/**
	 * One visitor's call (Ledger.visit). Every read and write is synchronous
	 * around the one await, the hash, so no other request's call on this
	 * object runs between reading a visitor's count and writing it.
	 */
	async visit(address: string, now: Date): Promise<VisitorLimit | null> {
		const { sql } = this.ctx.storage;
		const day = utcDay(now);
		// One row: the latest day's. A call stamped just before a midnight another call has passed counts on the new day.
		const [latest] = sql.exec("SELECT day, salt FROM visitor_salt").toArray();
		let salt = latest ? String(latest.salt) : "";
		if (!latest || String(latest.day) < day) {
			// The day's first call: the earlier days' counts and salt go, so no visitor outlives the day.
			salt = newSalt();
			sql.exec("DELETE FROM visitors");
			sql.exec("DELETE FROM visitor_salt");
			sql.exec("INSERT INTO visitor_salt (day, salt) VALUES (?, ?)", day, salt);
		}
		const visitor = await visitorKey(salt, address);
		const [row] = sql
			.exec(
				"SELECT minute, minute_calls, day_calls FROM visitors WHERE visitor = ?",
				visitor,
			)
			.toArray();
		const counted = countCall(
			row && {
				minute: String(row.minute),
				minuteCalls: Number(row.minute_calls),
				dayCalls: Number(row.day_calls),
			},
			utcMinute(now),
		);
		if ("limit" in counted) return counted.limit;
		const { minute, minuteCalls, dayCalls } = counted.count;
		sql.exec(
			"INSERT INTO visitors (visitor, minute, minute_calls, day_calls) VALUES (?, ?, ?, ?) ON CONFLICT (visitor) DO UPDATE SET minute = excluded.minute, minute_calls = excluded.minute_calls, day_calls = excluded.day_calls",
			visitor,
			minute,
			minuteCalls,
			dayCalls,
		);
		return null;
	}
}

/** The binding's side of DemoLedger: a stub by name, whose methods answer over RPC. */
export type LedgerNamespace = {
	getByName(name: string): {
		spent(day: string): Promise<number>;
		add(day: string, usd: number): Promise<void>;
		visit(address: string, now: Date): Promise<VisitorLimit | null>;
	};
};

/**
 * The demo's Ledger over the one DemoLedger object. The stub is taken on each
 * call, inside the request: a Worker may make no call to a Durable Object
 * outside one.
 */
export function durableLedger(namespace: LedgerNamespace): Ledger {
	const ledger = () => namespace.getByName("budget");
	return {
		spent: (day) => ledger().spent(day),
		add: (day, usd) => ledger().add(day, usd),
		visit: (address, now) => ledger().visit(address, now),
	};
}
