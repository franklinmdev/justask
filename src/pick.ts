import type { Probabilities } from "./provider.ts";

/** The label the provider chose for one question, with its probability. */
export type Pick = {
	label: string;
	probability: number;
};

/** The label with the highest probability, or null on a tie, so key order never decides. */
export function readPick(probabilities: Probabilities): Pick | null {
	let pick: Pick | null = null;
	let tied = false;
	for (const [label, probability] of Object.entries(probabilities)) {
		if (!pick || probability > pick.probability) {
			pick = { label, probability };
			tied = false;
		} else if (probability === pick.probability) {
			tied = true;
		}
	}
	return tied ? null : pick;
}
