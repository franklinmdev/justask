import type { CardEvalKind } from "justask/eval";

/** A shape's kind and its rows per language: at most two (#86). */
export type Shape = { kind: CardEvalKind; rows: 1 | 2 };

/**
 * Round 7's shapes (#88), as the owner approved them on 2026-09-24 before any
 * row was drafted (docs/card-eval.md, Round 7: shapes): each shape's kind and
 * its rows per language. A plain record's shape is the item of the tag cover
 * that decides its tags. The set test holds every row of round 7 to this list.
 */
export const ROUND7_SHAPES: Record<string, Shape> = {
	// Records, plain, by the item of the tag cover.
	"meals: lunch": { kind: "record", rows: 1 },
	"meals: dinner": { kind: "record", rows: 1 },
	"meals: coffee or tea": { kind: "record", rows: 1 },
	"meals: drinks": { kind: "record", rows: 1 },
	"meals: snacks": { kind: "record", rows: 1 },
	"meals: catering": { kind: "record", rows: 2 },
	"meals: a cake": { kind: "record", rows: 1 },
	"meals: pantry stock": { kind: "record", rows: 1 },
	"travel: flight": { kind: "record", rows: 1 },
	"travel: hotel": { kind: "record", rows: 1 },
	"travel: taxi": { kind: "record", rows: 2 },
	"travel: rideshare": { kind: "record", rows: 1 },
	"travel: train": { kind: "record", rows: 1 },
	"travel: bus": { kind: "record", rows: 1 },
	"travel: parking": { kind: "record", rows: 2 },
	"travel: tolls": { kind: "record", rows: 1 },
	"office: supplies": { kind: "record", rows: 2 },
	"office: equipment": { kind: "record", rows: 2 },
	"office: software": { kind: "record", rows: 2 },
	"office: hosting": { kind: "record", rows: 2 },
	"office: repairs": { kind: "record", rows: 2 },
	"office: cleaning or window washing": { kind: "record", rows: 2 },
	"office: printing": { kind: "record", rows: 2 },
	"office: couriers": { kind: "record", rows: 2 },
	"office: payroll": { kind: "record", rows: 1 },
	"office: HR": { kind: "record", rows: 1 },
	"office: legal work": { kind: "record", rows: 1 },
	"office: insurance": { kind: "record", rows: 1 },
	// Records, the vendor.
	"typo, a letter dropped": { kind: "record", rows: 2 },
	"typo, a letter doubled": { kind: "record", rows: 2 },
	"typo, a sound spelled another way": { kind: "record", rows: 2 },
	"typo, two letters swapped": { kind: "record", rows: 2 },
	"paraphrase by the service": { kind: "record", rows: 2 },
	"paraphrase by the people": { kind: "record", rows: 2 },
	"paraphrase as our trade": { kind: "record", rows: 2 },
	"paraphrase as the trade's shop": { kind: "record", rows: 2 },
	"a third vendor beside an or pair": { kind: "record", rows: 2 },
	"a third vendor beside an and pair": { kind: "record", rows: 1 },
	"no catalog vendor: a named business": { kind: "record", rows: 1 },
	"no catalog vendor: a kind of shop": { kind: "record", rows: 1 },
	"no catalog vendor: a store selling what a catalog vendor sells": {
		kind: "record",
		rows: 2,
	},
	// Records, the tags.
	"an office purchase billed to a client": { kind: "record", rows: 2 },
	"a meal billable to a client": { kind: "record", rows: 2 },
	"a trip billable to a client": { kind: "record", rows: 2 },
	"a meal with a client present": { kind: "record", rows: 2 },
	"a ride with a client present": { kind: "record", rows: 1 },
	"an event with a client present": { kind: "record", rows: 1 },
	"a trip whose purpose names a client": { kind: "record", rows: 2 },
	"another purchase whose purpose names a client, not billed": {
		kind: "record",
		rows: 1,
	},
	"a maybe billable": { kind: "record", rows: 2 },
	"a client named as a place": { kind: "record", rows: 1 },
	"two purchases in two tags": { kind: "record", rows: 2 },
	"a meal on a trip": { kind: "record", rows: 2 },
	"the coffee machine, rented or serviced": { kind: "record", rows: 2 },
	"a restock at the vendor that sells in two tags": { kind: "record", rows: 2 },
	"an office service in words its label does not list": {
		kind: "record",
		rows: 2,
	},
	// Records, the day.
	"a day of the month alone": { kind: "record", rows: 2 },
	"a numeric date": { kind: "record", rows: 1 },
	"days counted back": { kind: "record", rows: 2 },
	"a weekday with its date": { kind: "record", rows: 1 },
	"a time of day": { kind: "record", rows: 1 },
	"this and a weekday": { kind: "record", rows: 1 },
	"a month abbreviated": { kind: "record", rows: 1 },
	// Records, the amount.
	"a foreign currency": { kind: "record", rows: 2 },
	cents: { kind: "record", rows: 2 },
	"a thousands separator": { kind: "record", rows: 1 },
	"the word for dollars": { kind: "record", rows: 2 },
	"a count beside the amount": { kind: "record", rows: 2 },
	"a currency code": { kind: "record", rows: 1 },
	// Records, the intent.
	"told as a story": { kind: "record", rows: 1 },
	"asked to be logged": { kind: "record", rows: 1 },
	"a command word inside a record": { kind: "record", rows: 2 },
	"asked as a question": { kind: "record", rows: 1 },
	// Ambiguous, two each.
	"vendor held: a named pair with and": { kind: "ambiguous", rows: 2 },
	"vendor held: a named pair with or": { kind: "ambiguous", rows: 2 },
	"vendor held: a service both cleaning vendors sell": {
		kind: "ambiguous",
		rows: 2,
	},
	"vendor held: a paraphrase both cleaning vendors fit": {
		kind: "ambiguous",
		rows: 2,
	},
	"tags held: the vendor that sells in two tags, nothing named": {
		kind: "ambiguous",
		rows: 2,
	},
	"tags held: the vendor that sells in two tags, a place named": {
		kind: "ambiguous",
		rows: 2,
	},
	"tags held: a store across tags, nothing named": {
		kind: "ambiguous",
		rows: 2,
	},
	"tags held: a store across tags, a place named": {
		kind: "ambiguous",
		rows: 2,
	},
	"day held: last and a weekday": { kind: "ambiguous", rows: 2 },
	"day held: a week": { kind: "ambiguous", rows: 2 },
	"day held: a named month": { kind: "ambiguous", rows: 2 },
	"day held: a month counted from today": { kind: "ambiguous", rows: 2 },
	"amount held: a currency not resolved": { kind: "ambiguous", rows: 2 },
	"amount held: two amounts with or": { kind: "ambiguous", rows: 2 },
	"amount held: a range": { kind: "ambiguous", rows: 2 },
	"amount held: an amount and a tip": { kind: "ambiguous", rows: 2 },
	// Nothing, two each.
	"a question about spending": { kind: "nothing", rows: 2 },
	"a question about tags": { kind: "nothing", rows: 2 },
	"a request to show expenses": { kind: "nothing", rows: 2 },
	"a delete": { kind: "nothing", rows: 2 },
	"a change with a listed verb": { kind: "nothing", rows: 2 },
	"a change that sets a value, no list word": { kind: "nothing", rows: 2 },
	"a move or an undo": { kind: "nothing", rows: 2 },
	"a send with a listed verb": { kind: "nothing", rows: 2 },
	"a send no list names": { kind: "nothing", rows: 2 },
	"a thank-you": { kind: "nothing", rows: 2 },
	"a reminder to pay a vendor": { kind: "nothing", rows: 2 },
	"a greeting or a question about the demo": { kind: "nothing", rows: 2 },
};
