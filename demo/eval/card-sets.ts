import { ROUND7_SHAPES, type Shape } from "./card-shapes.ts";
import { evalSets, type SetInfo } from "./sets.ts";

type CardSetInfo = SetInfo & {
	/** How many of rounds 1 to 6's 42-row mixes a verdict set holds: round 7's holds 4. */
	mixes?: number;
	/** Every row names one of the listed shapes, as many rows as it lists (#86, #88). */
	shapes?: Record<string, Shape>;
};

/**
 * The card eval's sets, listed once: the runner, its usage line and the set
 * tests read them here, so a new round's set is named in this file alone
 * (its checksum is still frozen by hand in the test). Where each set and
 * its runs live: sets.ts. `office` is run under one of #77's office labels
 * (office.ts), which its log names.
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
	/** Round 7's, four times the size, every row named by one approved shape (#86, #88). */
	round7: { verdict: true, mixes: 4, shapes: ROUND7_SHAPES },
	/** Round 8's, fresh rows on round 7's shapes, the first under #93's retry and errors rule (#97). */
	round8: { verdict: true, mixes: 4, shapes: ROUND7_SHAPES },
	/** The gates are fixed from its runs. */
	dev: { verdict: false },
	/** #57's probes: commands on a recorded expense, and records with the command words in them. */
	diag: { verdict: false },
	/** #63's probes: two vendors named with "and" or "or", as a pair or beside the vendor paid. */
	pair: { verdict: false },
	/** #77's probes: office services, run with the office tag read by one of #77's labels. */
	office: { verdict: false },
	/** #79's probes: records at an office vendor that bought something else. */
	notoffice: { verdict: false },
} satisfies Record<string, CardSetInfo>;

export type CardSet = keyof typeof CARD_SETS;

export const {
	names: CARD_SET_NAMES,
	isSet: isCardSet,
	givesVerdict,
	file: cardSetFile,
	runLog: cardRunLog,
} = evalSets("card", CARD_SETS);

const info = (set: CardSet): CardSetInfo => CARD_SETS[set];

/** How many of rounds 1 to 6's 42-row mixes the verdict set holds. */
export const mixesOf = (set: CardSet): number => info(set).mixes ?? 1;

/** The shapes every row of the set names, when it names them. */
export const shapesOf = (set: CardSet) => info(set).shapes;
