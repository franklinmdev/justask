import {
	type LoggedError,
	mergeRemeasure,
	type Probes,
	transportFailures,
} from "@justask/core/eval";

type Run = { rows: { id: string; error?: LoggedError }[]; probes?: Probes };

/**
 * `remeasure` and `merge`, the same in every eval CLI. Merges into run
 * <first> the remeasures named before the last, in order, which leaves only
 * the rows still failing on transport (#93); `send`, given for a remeasure,
 * sends those rows again into the last run named, and a merge reads that run
 * instead. Prints run <first>'s report with every answer in place.
 */
export async function printRemeasure<R extends Run>({
	first,
	later,
	read,
	send,
	report,
}: {
	first: string;
	/** The remeasures' run numbers, in order; the last is the one sent or read. */
	later: string[];
	read: (n: string) => Promise<R>;
	send?: (merged: R, n: string) => Promise<R>;
	report: (run: R) => string;
}): Promise<void> {
	const n = later.at(-1) as string;
	const firstRun = await read(first);
	const merged = mergeRemeasure(
		firstRun,
		...(await Promise.all(later.slice(0, -1).map(read))),
	);
	const again = send ? await send(merged, n) : await read(n);
	console.log(
		`Run ${first}, its transport failures (${transportFailures(firstRun.rows)
			.map(({ id }) => id)
			.join(", ")}) answered by run ${later.join(", then ")}\n`,
	);
	console.log(report(mergeRemeasure(merged, again)));
}
