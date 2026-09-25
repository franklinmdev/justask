// The few pieces of the Workers runtime the demo's Worker uses, declared by
// hand: the repo's tsconfig is Node's and the DOM's, and the runtime's own
// types (`wrangler types`) would redeclare both. Read from
// https://developers.cloudflare.com/durable-objects/ on 2026-09-25.
declare module "cloudflare:workers" {
	/** A Durable Object class; its public methods are callable over RPC from a stub. */
	export abstract class DurableObject<Env = unknown> {
		protected ctx: DurableObjectState;
		protected env: Env;
		constructor(ctx: DurableObjectState, env: Env);
	}

	/** The Worker's bindings, vars and secrets, readable at the top level. */
	export const env: Record<string, unknown>;

	export type DurableObjectState = {
		storage: {
			/** One alarm per object; a new one replaces it, and `alarm()` runs at its time. */
			setAlarm(scheduledTimeMs: number): void;
			sql: {
				/** Each call runs in its own transaction. */
				exec(
					query: string,
					...bindings: unknown[]
				): { toArray(): Record<string, unknown>[] };
			};
		};
	};
}
