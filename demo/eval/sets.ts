import type { Language } from "../src/content/types.ts";

/** A set's one fact every flow shares: whether its runs give a verdict. */
export type SetInfo = { verdict: boolean };

/**
 * A flow's eval sets, from the one list its runner reads (card-sets.ts for
 * the card). A set named `<set>` lives in demo/eval/<flow>-<language>.<set>.jsonl,
 * round 1's `eval` in <flow>-<language>.jsonl, and its runs log to
 * demo/eval/runs/<flow>-<language>-<set>-<n>.jsonl, `eval`'s with no
 * `-<set>` and a labelled run's with its label before `-<n>`. A set with no
 * verdict tunes or diagnoses, it never decides.
 */
export function evalSets<S extends Record<string, SetInfo>>(
	flow: "search" | "filter" | "card",
	sets: S,
) {
	type Set = keyof S & string;
	const info: Record<Set, SetInfo> = sets;
	const suffix = (set: Set, separator: string) =>
		set === "eval" ? "" : `${separator}${set}`;
	return {
		names: Object.keys(sets) as Set[],
		isSet: (set: string | undefined): set is Set =>
			set !== undefined && Object.hasOwn(sets, set),
		givesVerdict: (set: Set): boolean => info[set].verdict,
		/** The set's file, relative to demo/eval. */
		file: (language: Language, set: Set) =>
			`${flow}-${language}${suffix(set, ".")}.jsonl`,
		/** Run <n>'s log, relative to demo/eval. */
		runLog: (language: Language, set: Set, n: string, label?: string) =>
			`runs/${flow}-${language}${suffix(set, "-")}${label ? `-${label}` : ""}-${n}.jsonl`,
	};
}
