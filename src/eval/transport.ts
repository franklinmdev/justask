import type { AskError } from "../ask.ts";
import { type Probes, probeWindow } from "./probe.ts";

/**
 * A row's error as its run log saves it. `transport` marks a provider
 * transport failure (#93): a timeout, or a provider unavailable on both of
 * `ask`'s calls (ADR 0013). It is absent on any other error, an answer that
 * broke the contract or an adapter that threw otherwise, and on every error
 * of a log saved before the rule, which scores as it did.
 */
export type LoggedError = {
	kind: "provider" | "timeout";
	message: string;
	transport?: true;
};

export function loggedError(error: AskError): LoggedError {
	const transport = error.kind === "timeout" || error.transport === true;
	return {
		kind: error.kind,
		message: error.message,
		...(transport && { transport }),
	};
}

type Row = { id: string; error?: LoggedError };

/** The rows a provider transport failure left unanswered. */
export function transportFailures<R extends Row>(rows: R[]): R[] {
	return rows.filter(({ error }) => error?.transport === true);
}

/**
 * The eval rows a remeasure sends again: those of the first run's rows that
 * failed on transport, in the set's order. Throws before any call when none
 * did, or when the set no longer holds one of them.
 */
export function remeasureSet<S extends { id: string }>(
	first: { rows: Row[] },
	set: S[],
): S[] {
	const ids = new Set(transportFailures(first.rows).map(({ id }) => id));
	if (ids.size === 0) {
		throw new Error(
			"justask: no row failed on transport in that run, so there is nothing to remeasure",
		);
	}
	const again = set.filter(({ id }) => ids.has(id));
	if (again.length !== ids.size) {
		throw new Error(
			"justask: the eval set no longer holds every row that failed on transport in that run",
		);
	}
	return again;
}

/**
 * The first run with each row that failed on transport replaced by its
 * remeasure's, so the first run's report decides every line (#93). Each
 * remeasure is merged in order and sends exactly the rows still failing on
 * transport after the ones before it, so a row that fails again waits for
 * the next. The first run keeps its header, probes included, so a latency
 * line pending in its slow window stays pending. A remeasure decides
 * nothing without probes, with no baseline, in a slow window, under other
 * kill lines or gates, or on any other rows.
 */
export function mergeRemeasure<
	R extends Row,
	T extends { rows: R[]; probes?: Probes },
>(first: T, ...remeasures: T[]): T {
	return remeasures.reduce((merged, again) => mergeOne(merged, again), first);
}

function mergeOne<R extends Row, T extends { rows: R[]; probes?: Probes }>(
	first: T,
	again: T,
): T {
	const window = probeWindow(again.probes);
	if (!window) {
		throw new Error(
			"justask: the remeasure has no probes, so it decides nothing",
		);
	}
	if (window.baselineMs === null || window.slow) {
		throw new Error(
			`justask: the remeasure ran ${window.slow ? "in a slow window" : "with no baseline"}, so it decides nothing; wait and run again`,
		);
	}
	if (settings(again) !== settings(first)) {
		throw new Error(
			"justask: the remeasure ran under other kill lines or gates than the first run, so it decides nothing",
		);
	}
	const expected = transportFailures(first.rows)
		.map(({ id }) => id)
		.sort();
	if (expected.length === 0) {
		throw new Error(
			"justask: no row failed on transport in the first run, so no remeasure applies to it",
		);
	}
	const sent = again.rows.map(({ id }) => id).sort();
	if (expected.join("\n") !== sent.join("\n")) {
		throw new Error(
			`justask: a remeasure sends exactly the rows that failed on transport in the first run: ${expected.join(", ")}`,
		);
	}
	const answered = new Map(again.rows.map((row) => [row.id, row]));
	return {
		...first,
		rows: first.rows.map((row) => answered.get(row.id) ?? row),
	};
}

/** What a run was run under: its header, the kill lines and gates, without its time, probes or rows. */
function settings(run: object): string {
	return JSON.stringify(
		Object.entries(run)
			.filter(([key]) => !["startedAt", "probes", "rows"].includes(key))
			.sort(([a], [b]) => a.localeCompare(b)),
	);
}
