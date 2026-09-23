# A card's date field declares which way it reads

Amends the spec, which read every card date forward, as the lab's salon appointments did. A card's date field declares `reads: "past"` or `reads: "future"`, with no default, as a gate has none (ADR 0003). The direction only resolves what the request leaves undated: a bare weekday ("Friday"), a day with no year ("March 3", "03/04", "el día 28"), a month, a quarter. Explicit words read the same both ways: "yesterday" is yesterday and "tomorrow" is tomorrow on either field. A filter always reads the past.

The demo's card is an expense, not an appointment. "Lunch with Northwind on Friday" means the Friday just gone; read forward it would fill a day that has not happened, which is an invented value, the one thing the product promises not to produce. A due date or an appointment on the same app reads forward. One card can hold both, so the direction belongs to the field, not the card.

## Consequences

- The parser gets `reads` in its input, host parsers included. Every rule matches the same text in both directions and only the resolution differs, so a card with a past and a future field parses once per direction and both parses find the same times and amounts.
- "next Friday" reads two ways (the first Friday after today, or the one a week later) whichever way the field reads, and both readings are marked `ambiguous`, on every day of the week. So does "last Friday" (the most recent one, or the one a week earlier). A pick that lands on an ambiguous reading holds the field whatever its probability, on a card and on a filter. This is the lab's open fix: its "next X" picks sat at 0.86 to 0.91, right on a 0.9 gate.
- A card date field fills with one day. A picked period ("next week") is held.

## Considered Options

- Every card date forward, as the spec said: wrong for the demo's own expense card. Rejected.
- Every card date backward, like a filter: no due date or appointment card could be built. Rejected.
- A direction per card: one record can hold an expense's day and its due date. Rejected.
