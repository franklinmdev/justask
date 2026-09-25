import { DurableObject } from "cloudflare:workers";
import type { Ledger } from "../server/budget.ts";

/**
 * The Worker's ledger (#109): one Durable Object with SQLite for the whole
 * demo, so every isolate, anywhere, reads and adds to the same day's spend.
 * One row a UTC day. Its methods are called over RPC (durableLedger).
 */
export class DemoLedger extends DurableObject {
	constructor(...args: ConstructorParameters<typeof DurableObject>) {
		super(...args);
		this.ctx.storage.sql.exec(
			"CREATE TABLE IF NOT EXISTS spend (day TEXT PRIMARY KEY, usd REAL NOT NULL)",
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
}

/** The binding's side of DemoLedger: a stub by name, whose methods answer over RPC. */
export type LedgerNamespace = {
	getByName(name: string): {
		spent(day: string): Promise<number>;
		add(day: string, usd: number): Promise<void>;
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
	};
}
