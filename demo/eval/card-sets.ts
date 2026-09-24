import type { Language } from "../src/content/types.ts";

type SetInfo = { verdict: boolean; labelled?: true };

/**
 * The card eval's sets, listed once: the runner, its usage line and the set
 * tests read them here, so a new round's set is named in this file alone
 * (its checksum is still frozen by hand in the test). A set named `<set>`
 * lives in demo/eval/card-<language>.<set>.jsonl, round 1's `eval` in
 * card-<language>.jsonl, and its runs log to
 * demo/eval/runs/card-<language>-<set>-<n>.jsonl, `eval`'s with no `-<set>`.
 * A set with no verdict tunes or diagnoses, it never decides; a labelled one
 * is run under one of #77's office labels (office.ts), which its log names.
 */
export const CARD_SETS = {
	/** Round 1's set. */
	eval: { verdict: true },
	/** The fresh sets of rounds 2 to 6. */
	round2: { verdict: true },
	round3: { verdict: true },
	round4: { verdict: true },
	round5: { verdict: true },
	round6: { verdict: true },
	/** The gates are fixed from its runs. */
	dev: { verdict: false },
	/** #57's probes: commands on a recorded expense, and records with the command words in them. */
	diag: { verdict: false },
	/** #63's probes: two vendors named with "and" or "or", as a pair or beside the vendor paid. */
	pair: { verdict: false },
	/** #77's probes: office services, run with the office tag read by one of #77's labels. */
	office: { verdict: false, labelled: true },
	/** #79's probes: records at an office vendor that bought something else. */
	notoffice: { verdict: false },
} satisfies Record<string, SetInfo>;

export type CardSet = keyof typeof CARD_SETS;

export const CARD_SET_NAMES = Object.keys(CARD_SETS) as CardSet[];

export const isCardSet = (set: string | undefined): set is CardSet =>
	set !== undefined && Object.hasOwn(CARD_SETS, set);

export const givesVerdict = (set: CardSet): boolean => CARD_SETS[set].verdict;

export function isLabelled(set: CardSet): boolean {
	const info: SetInfo = CARD_SETS[set];
	return info.labelled === true;
}

/** The set's file, relative to demo/eval. */
export const cardSetFile = (language: Language, set: CardSet) =>
	`card-${language}${set === "eval" ? "" : `.${set}`}.jsonl`;

/** Run <n>'s log, relative to demo/eval. */
export const cardRunLog = (
	language: Language,
	set: CardSet,
	n: string,
	label?: string,
) =>
	`runs/card-${language}${set === "eval" ? "" : `-${set}`}${label ? `-${label}` : ""}-${n}.jsonl`;
