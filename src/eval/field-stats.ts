import type { Pick } from "../pick.ts";

/** One field over a run, at its gate, with what its gate is fixed from. */
export type FieldStats = {
	gate: number;
	/** Rows that expect a value in this field. */
	expected: number;
	/** Of those, the ones the field filled at its gate. */
	filled: number;
	/** Of those, the ones it filled with the expected value. */
	right: number;
	/** Rows the field filled at its gate with anything but the expected value, or where none belongs. */
	wrong: number;
	/**
	 * Read with no gate: the lowest probability behind a right value, and the
	 * highest behind a wrong one. A field's probability is its weakest pick.
	 * Null when there was none.
	 */
	lowestRight: number | null;
	highestWrong: number | null;
};

/** A field at its gate before any row is counted. */
export function emptyStats(gate: number): FieldStats {
	return {
		gate,
		expected: 0,
		filled: 0,
		right: 0,
		wrong: 0,
		lowestRight: null,
		highestWrong: null,
	};
}

/** Counts one pick read with no gate toward the lowest right or the highest wrong. */
export function notePick(
	stats: FieldStats,
	right: boolean,
	probability: number,
): void {
	if (right) {
		stats.lowestRight = Math.min(stats.lowestRight ?? probability, probability);
	} else {
		stats.highestWrong = Math.max(
			stats.highestWrong ?? probability,
			probability,
		);
	}
}

/** The least sure of a field's picks, or null when any of them tied. */
export function weakestPick(picks: (Pick | null)[]): Pick | null {
	if (picks.length === 0 || picks.some((pick) => pick === null)) return null;
	return (picks as Pick[]).reduce((a, b) =>
		b.probability < a.probability ? b : a,
	);
}
