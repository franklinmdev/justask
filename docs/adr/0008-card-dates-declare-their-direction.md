# A card's date field declares which way it reads

Amends the spec, which read every card date forward, as the lab's salon appointments did. A card's date field declares `reads: "past"` or `reads: "future"`, with no default, as a gate has none (ADR 0003). The direction only resolves what the request leaves undated: a bare weekday ("Friday"), a day with no year ("March 3", "03/04", "el día 28"), a month, a quarter. Explicit words read the same both ways: "yesterday" is yesterday and "tomorrow" is tomorrow on either field. A filter always reads the past. A field that reads the past holds a day after today whatever the words (Amendment, #187).

The demo's card is an expense, not an appointment. "Lunch with Northwind on Friday" means the Friday just gone; read forward it would fill a day that has not happened, which is an invented value, the one thing the product promises not to produce. A due date or an appointment on the same app reads forward. One card can hold both, so the direction belongs to the field, not the card.

## Consequences

- The parser gets `reads` in its input, host parsers included. Every rule matches the same text in both directions and only the resolution differs, so a card with a past and a future field parses once per direction and both parses find the same times and amounts.
- "next Friday" and "last Friday" read the same whichever way the field reads, and the parser computes two readings: the closest Friday that way (never today), and the Friday of the week after or before this one, weeks starting on Monday. When they are the same day, the request says which and the one reading fills like any other. When they differ, both readings are marked `ambiguous`. On a Saturday "last Friday" is yesterday or eight days back, and held; on a Wednesday both readings are the Friday five days back, and it fills. A pick that lands on an ambiguous reading holds the field whatever its probability, on a card and on a filter. This is the lab's open fix: its "next X" picks sat at 0.86 to 0.91, right on a 0.9 gate. Amended on 2026-09-25 (#140): until then both readings were marked `ambiguous` on every day of the week, even where they were the same day.
- The week starts on Monday, fixed, the same week "last week" and "Friday of last week" already name (the owner's decision, 2026-09-25, #140). A host app that wants Sunday weeks registers its own parser, which wins where their text overlaps. No option or fact sets it: nothing needs one yet.
- A part of the day reads as its day, both ways, as "yesterday" does: "this morning", "this afternoon", "this evening", "tonight", "esta mañana", "esta tarde", "esta noche" are today; "last night", "last evening" (#146) and "anoche" are yesterday whatever the hour, as Duckling and Microsoft Recognizers-Text read "last night". A date field holds one day, so no hours are read from them and nothing configures them (#140).
- A card date field fills with one day. A picked period ("next week") is held.

## Amendment (#187): a field that reads the past never fills a day after today

The pre-launch QA (#172, finding F7) found the demo's expense card filling its day with tomorrow: "Beanhaven $6 tomorrow" at 0.97, "Cafetal mañana, 5 dólares" at 0.94, and "Beanhaven coffee next Friday $5" said on a Saturday, where both readings of "next Friday" are the same day, at 0.90. The intent passed each time, and nothing on the card said the day lay ahead. The owner decided on 2026-09-26 that such a day is held: a date field that reads the past never fills a day after today, explicit words included. It is the promise above, never an invented day: an expense is spent on a day that has happened.

- **The rule is the card's, not the parser's.** The parser reads "tomorrow" as tomorrow on either field, as above. The card marks a candidate that starts after today with `afterToday: true` on a field that reads the past, and a pick that lands on it holds the field whatever its probability, as an `ambiguous` reading does. The candidate stays, so its pick is still asked and reported, and the question is unchanged.
- **A field that reads the future is unchanged**, and so is the filter, which reads the past for periods and has no day to fill.
- **The eval log keeps the mark** with the candidate it saves, so a run rescores as it was held; a log from before this amendment has no mark and rescores as it ran.
- Today is the date in the `today` fact, the day the rest of the card reads from.

## Amendment (#190): the question says what a bare weekday names

The pre-launch QA (#172, finding F11) found this ADR's own example held: "Beanhaven coffee on Friday $5", said on a Monday or a Wednesday, offered the one candidate `"Friday": the single day Fri 2026-09-18 (the most recent one before today)`, and the provider picked it at 0.66 to 0.68 or answered `not_available`, under the 0.8 gate, in 8 of 8 calls. Round 9's rows with a bare weekday filled their day in 39 of 77 per language, against 42 or 43 of 43 for every other day. The candidate was right; the provider doubted the reading.

- **The card's date question now says it.** On a field that reads the past: a weekday named alone, with no "last" or "next", means the most recent one before today, so its candidate is the day the request names; on a field that reads the future, the first one after today. The parser and the candidates are unchanged, and so is the filter's question.
- **Measured before it landed**, in card round 10 (docs/card-eval.md), approved by the owner on 2026-09-26 before any call.
- **Left as it was:** a numeric date such as "3/9" keeps its two readings and is held when the provider does not choose; telling the provider which language writes day/month would state a place's convention as a language's.

## Considered Options

- Every card date forward, as the spec said: wrong for the demo's own expense card. Rejected.
- Every card date backward, like a filter: no due date or appointment card could be built. Rejected.
- A direction per card: one record can hold an expense's day and its due date. Rejected.
- "last X" and "next X" always ambiguous, the rule until #140: every "last Friday" held, even on the days when both readings are the same day, so a card held a field the words decide. Replaced.
- "last X" always the closest one that way, as chrono-node (95f3b4f) and Duckling (59a13ff) read it: on a Saturday "last Friday" would fill yesterday, a day the person may not mean. Rejected.
- "last X" always that weekday in the previous calendar week, as Microsoft Recognizers-Text (da7edcf) reads it: the same guess the other way, on a Saturday eight days back. Rejected. None of the three tools flags the ambiguity (research of 2026-09-25, #140).
- The week's first day from a locale (`Intl.Locale` week info) or a fact such as `local_currency`: implicit, the same request read differently by runtime or host, and the week rules that exist already take Monday. Rejected for now.
