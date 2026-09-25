# A card's date field declares which way it reads

Amends the spec, which read every card date forward, as the lab's salon appointments did. A card's date field declares `reads: "past"` or `reads: "future"`, with no default, as a gate has none (ADR 0003). The direction only resolves what the request leaves undated: a bare weekday ("Friday"), a day with no year ("March 3", "03/04", "el día 28"), a month, a quarter. Explicit words read the same both ways: "yesterday" is yesterday and "tomorrow" is tomorrow on either field. A filter always reads the past.

The demo's card is an expense, not an appointment. "Lunch with Northwind on Friday" means the Friday just gone; read forward it would fill a day that has not happened, which is an invented value, the one thing the product promises not to produce. A due date or an appointment on the same app reads forward. One card can hold both, so the direction belongs to the field, not the card.

## Consequences

- The parser gets `reads` in its input, host parsers included. Every rule matches the same text in both directions and only the resolution differs, so a card with a past and a future field parses once per direction and both parses find the same times and amounts.
- "next Friday" and "last Friday" read the same whichever way the field reads, and the parser computes two readings: the closest Friday that way (never today), and the Friday of the week after or before this one, weeks starting on Monday. When they are the same day, the request says which and the one reading fills like any other. When they differ, both readings are marked `ambiguous`. On a Saturday "last Friday" is yesterday or eight days back, and held; on a Wednesday both readings are the Friday five days back, and it fills. A pick that lands on an ambiguous reading holds the field whatever its probability, on a card and on a filter. This is the lab's open fix: its "next X" picks sat at 0.86 to 0.91, right on a 0.9 gate. Amended on 2026-09-25 (#140): until then both readings were marked `ambiguous` on every day of the week, even where they were the same day.
- The week starts on Monday, fixed, the same week "last week" and "Friday of last week" already name (the owner's decision, 2026-09-25, #140). A host app that wants Sunday weeks registers its own parser, which wins where their text overlaps. No option or fact sets it: nothing needs one yet.
- A part of the day reads as its day, both ways, as "yesterday" does: "this morning", "this afternoon", "this evening", "tonight", "esta mañana", "esta tarde", "esta noche" are today; "last night" and "anoche" are yesterday whatever the hour, as Duckling and Microsoft Recognizers-Text read them. A date field holds one day, so no hours are read from them and nothing configures them (#140).
- A card date field fills with one day. A picked period ("next week") is held.

## Considered Options

- Every card date forward, as the spec said: wrong for the demo's own expense card. Rejected.
- Every card date backward, like a filter: no due date or appointment card could be built. Rejected.
- A direction per card: one record can hold an expense's day and its due date. Rejected.
- "last X" and "next X" always ambiguous, the rule until #140: every "last Friday" held, even on the days when both readings are the same day, so a card held a field the words decide. Replaced.
- "last X" always the closest one that way, as chrono-node (95f3b4f) and Duckling (59a13ff) read it: on a Saturday "last Friday" would fill yesterday, a day the person may not mean. Rejected.
- "last X" always that weekday in the previous calendar week, as Microsoft Recognizers-Text (da7edcf) reads it: the same guess the other way, on a Saturday eight days back. Rejected. None of the three tools flags the ambiguity (research of 2026-09-25, #140).
- The week's first day from a locale (`Intl.Locale` week info) or a fact such as `local_currency`: implicit, the same request read differently by runtime or host, and the week rules that exist already take Monday. Rejected for now.
