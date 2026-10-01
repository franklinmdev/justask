import type { FieldStats } from "@justask/core/eval";

/** Gates sit on multiples of 0.05; the lab's 0.9 is the highest a field gets with no wrong pick. */
const STEP = 0.05;
const HIGHEST = 0.9;

const down = (x: number) => Math.floor(x / STEP + 1e-9) * STEP;
const nearest = (x: number) => Math.round(x / STEP) * STEP;
/** The first multiple of 0.05 strictly above x. */
const above = (x: number) => down(x) + STEP;
const tidy = (x: number) => Number(x.toFixed(2));

/** What a field's gate is fixed from. */
type Picks = Pick<FieldStats, "lowestRight" | "highestWrong">;

/**
 * The rule the owner fixed on 2026-09-22 (#17), before any dev run, that
 * turns one field's dev picks into its gate. A wrong filter shown as right is
 * worse than an empty field, so every tie goes to held:
 *
 * - the midpoint between the highest wrong pick and the lowest right one,
 *   rounded to 0.05, when that sits above every wrong pick;
 * - no wrong pick: the lowest right pick rounded down to 0.05, at most 0.9;
 * - overlap, or a midpoint that rounds onto a wrong pick: the first 0.05
 *   above the highest wrong pick.
 *
 * Throws when no gate strictly between 0 and 1 fits: the owner decides.
 */
export function fixGate({ lowestRight, highestWrong }: Picks): number {
	if (lowestRight === null) {
		throw new Error("no right pick on the dev runs, so the rule sets no gate");
	}
	let gate: number;
	if (highestWrong === null) {
		gate = Math.min(down(lowestRight), HIGHEST);
	} else {
		const midpoint = nearest((lowestRight + highestWrong) / 2);
		gate =
			highestWrong < lowestRight && midpoint > highestWrong
				? midpoint
				: above(highestWrong);
	}
	gate = tidy(gate);
	if (!(gate > 0 && gate < 1)) {
		throw new Error(`the rule gives ${gate}, not a gate: the owner decides`);
	}
	return gate;
}

/**
 * Each field's lowest right and highest wrong pick over several dev runs, the
 * two languages together, since the demo serves one gate per field.
 */
export function poolFields(
	reports: { fields: Record<string, Picks> }[],
): Record<string, Picks> {
	const pooled: Record<string, Picks> = {};
	for (const { fields } of reports) {
		for (const [name, { lowestRight, highestWrong }] of Object.entries(
			fields,
		)) {
			const seen = pooled[name] ?? { lowestRight: null, highestWrong: null };
			pooled[name] = {
				lowestRight:
					lowestRight === null
						? seen.lowestRight
						: Math.min(seen.lowestRight ?? lowestRight, lowestRight),
				highestWrong:
					highestWrong === null
						? seen.highestWrong
						: Math.max(seen.highestWrong ?? highestWrong, highestWrong),
			};
		}
	}
	return pooled;
}
