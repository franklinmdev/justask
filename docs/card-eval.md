# Card eval: sets, kill lines and verdict

**Status: sets, measures, kill lines and gate rule approved and frozen by the owner on 2026-09-23 (#20), before any provider call. The eval sets are frozen by checksum and the kill lines by value in `test/demo-card-eval.test.ts`.**

**Hypothesis:** on the demo's fictional vendors, the expense card turns a typed expense into the record a person means (vendor, tags, day, amount), leaves a field empty when it cannot tell, and fills nothing when the request asks for no new expense, in English and in Spanish, on Enter. The lab measured a salon appointment card; this is a new measurement.

## Sets

Files in `demo/eval/`, one JSONL row per request (`parseCardEvalSet`). Spanish row N has the same shape as English row N.

| File | Rows | record | ambiguous | nothing |
|---|---|---|---|---|
| `card-en.jsonl` (eval) | 42 | 28 | 8 | 6 |
| `card-es.jsonl` (eval) | 42 | 28 | 8 | 6 |
| `card-en.dev.jsonl` (dev) | 20 | 12 | 4 | 4 |
| `card-es.dev.jsonl` (dev) | 20 | 12 | 4 | 4 |

- **record:** asks for a new expense. Tags in all 28 eval rows, the day in 24, the amount in 27, the vendor in 21. Each of the 14 vendors at least once, by name, typo (`talyroot`, `papergrov`; `cuntia`, `tintaverd`) or a paraphrase only one vendor fits (`the courier`, `our law firm's`, `payroll company`). Seven records name no vendor of the catalog (a taxi, a hotel, `Rosa's Diner`, `a furniture store`): the vendor must stay empty there, and a catalog vendor filled in counts as a correction. Days: `yesterday`, `today`, a bare weekday read back, `on the 5th`, named days. Amounts in `$`, `dollars`, `dólares`, and one in euros.
- **Tags follow the words, not a guess.** Every record names what the money bought, so its tags are the ones a person would write: `meals` (lunch, dinner, coffee, catering), `travel` (flights, hotels, taxis, a train), `office` (supplies, equipment, software and services, which covers payroll, legal, insurance, cleaning and couriers), and `client` only when the request says the expense is billable to or spent with a client. A coffee machine rental is `office`, not `meals`.
- **ambiguous:** two per field. Vendor: `office cleaning` (Brightmop or Glasswell), a named pair. Tags: `Beanhaven, $45` (coffee or beans: `meals` or `office`), `might be billable to a client`. Day: `last Tuesday`, which #39 reads two ways, and `last week`, a period where the card takes a day. Amount: `900 pesos`, a currency the local one does not resolve, and `$18 or $20`. The row's other fields still expect their values.
- **nothing:** a question about spending, a delete, an edit of an existing expense (`change Monday's lunch to $52`), a thank-you, a question about tags, and a reminder to pay a vendor. Several carry a vendor, a day or an amount the fields would read; only the intent keeps them empty.
- The eval and dev sets repeat no request of each other, of any other set in `demo/eval/`, or of the demo's search, filter and card suggestions. Every expected day and amount is one the parser builds on Wednesday 2026-09-23, the day the runs are fixed at; every held day and amount is held by the parser's own reading or by two candidates, whatever the provider picks. `test/demo-card-eval.test.ts` checks all of this.

## Measures

The card is scored as the person meets it: a filled card they correct, or a card with empty fields they fill. The lab's card measures, which the owner accepted on 2026-09-22, not the filter's.

- **exact:** of the cards (record and ambiguous rows) that filled at least one field, the share with no field to correct. A field filled with anything but the expected value is a correction: a wrong value, a value on a field the row holds, or a value on a field the request never mentions. A held field is not a correction.
- **coverage:** of the fields the cards expect a value in, the share that filled. It counts fields, not rows: a card that fills three of four fields saves the person three. The filter's row-level coverage would read a card with one held field as a miss.
- **invented:** nothing rows that filled any field.
- **held ambiguous:** ambiguous rows where every field marked held stayed empty. Empty is empty, whatever the reason: a `not_mentioned` pick holds like a low one (the owner's ruling on the lab's card).
- **p95, errors, cost per call** as in the search and filter.
- The intent gates the whole card: below its gate every field is empty. The report gives the intent its own row beside the fields (its right picks on the cards, its wrong ones on the nothing rows), and a card the intent held is listed as the intent's miss alone.

## Kill lines

`CARD_KILL_LINES` in `demo/eval/kill-lines.ts`, the lab's card lines in the package's six measures, the same for both languages. The verdict passes only when both languages pass every line.

```kill
exact >= 0.9
coverage >= 0.7
invented <= 0
heldAmbiguous >= 0.75
p95Ms <= 1000
errors <= 0
```

- `exact >= 0.9`: 9 of 10 cards that fill anything need no correction. The lab's `zero_edit`, which passed at 0.976.
- `coverage >= 0.7`: 7 of 10 expected fields fill. Without it, holding everything would pass. The lab reached 0.989.
- `invented <= 0`: no nothing row fills any field.
- `heldAmbiguous >= 0.75`: at least 6 of the 8 ambiguous rows keep their held field empty.
- `p95Ms <= 1000`, `errors <= 0`: the card is asked once, on Enter, with more questions per call than the filter (an intent, a vendor, four tags, a day, an amount). The lab's line was `< 1000`; the package's lines are inclusive.
- **Dropped from the lab: `client_invented`.** The lab had a line for a new client matched to a known one. Here a record whose vendor is not in the catalog expects the vendor empty, so a catalog vendor filled there is a correction and counts against exact.

## Gates, from the dev runs

The intent and each field get their own gate, fixed from the dev runs by the filter's rule (`fixGate` in `demo/eval/filter-gates.ts`), the two languages pooled, since the demo serves one gate per field in both. Read with no gate:

- **The intent:** a right pick is `new_record` on a card, a wrong one `new_record` on a nothing row, at its probability.
- **A field:** read on the cards only, since on a nothing row the intent keeps it empty. A right pick fills it with the expected value; a wrong pick fills it with anything else. A field's pick is its weakest one: the tags field asks one question per tag.

The rule, as approved for the filter on 2026-09-22 (#17):

- The midpoint between the highest wrong pick and the lowest right pick, rounded to 0.05, when that sits above every wrong pick.
- No wrong pick: the lowest right pick rounded down to 0.05, at most 0.9, the lab's gate.
- Overlap, or a midpoint that rounds onto a wrong pick: the first 0.05 above the highest wrong pick, since a wrong value shown as right is worse than an empty field.
- No right pick, or no gate strictly between 0 and 1 that fits: the owner decides.

The dev runs go at the lab's 0.9 on every gate, the demo's `CARD_GATE` today. The gates the rule gives are written into `demo/server/handler.ts` before run 1, so the demo serves the gates the verdict was measured at. A rescore of run 1 at other gates is reported apart and changes neither the verdict nor the demo.

### Dev run 1

Runs of 2026-09-23 with `jev-1.13.0`, every gate at the lab's 0.9 (the gates are not fixed yet), today fixed at Wednesday 2026-09-23. The frozen sets' checksums were checked unchanged and every test passed before the first call. Dev runs print no verdict.

| Dev run 1, all gates 0.9 | coverage | invented | held ambiguous | p95 | cost per call |
|---|---|---|---|---|---|
| English | 12 of 57 fields | 0 | 4 of 4 | 278 ms | $0.0000776 |
| Spanish | 2 of 57 fields | 0 | 4 of 4 | 289 ms | $0.0000809 |

At 0.9 the intent held 12 of 16 English cards and 15 of 16 Spanish ones: `new_record` won on almost every card, but between 0.47 and 0.89. No filled field was wrong.

The intent's and each field's picks, read with no gate, both languages pooled:

| Field | Lowest right | Highest wrong | Rule | Gate |
|---|---|---|---|---|
| intent | 0.47 (`tóner de Tintaverde ayer, $150 o $160`) | none: no nothing row picked `new_record` | lowest right rounded down | **0.45** |
| vendor | 0.53 | none | lowest right rounded down | **0.5** |
| tags | 0.44 (`pizza para el equipo hoy, $43`, meals) | 0.49 (`Swiftlane, $40 on Monday, maybe for a client`, `client` yes, where the tags must stay empty) | overlap: the first 0.05 above the wrong pick | **0.5** |
| spent_on | 0.82 | none | lowest right rounded down | **0.8** |
| total | 0.98 | none | lowest right rounded down, at most 0.9 | **0.9** |

- **The intent sits low, not wrong.** Every nothing row picked `not_mentioned` or `not_available`, so the rule has no wrong pick to keep out and sets the gate at the lowest right one. Two cards picked something else outright (`train ticket to Boston on Friday, $64`, `not_mentioned` 0.50; `renovación de la póliza de Cobertura Plena hoy, $1,200`, `not_available` 0.50); no gate reaches them.
- **Tags are the weakest field.** One question per tag, and the field's pick is its weakest: a right `meals` at 0.44 and the ambiguous row's `client` at 0.49 overlap, so the gate goes just above the wrong one.
- The dev set has only four nothing rows per language, so the intent's 0.45 is judged by the eval set's six.

Run logs: `demo/eval/runs/card-en-dev-1.jsonl`, `demo/eval/runs/card-es-dev-1.jsonl`. `demo/eval/card.ts gates 1` prints the table's gates with no call; `test/demo-card-eval.test.ts` pins the demo's `CARD_GATES` to it.

## Procedure

By hand with the key in `.env`, never in CI; every row is a paid call.

1. The owner approves the sets, the measures, the kill lines and the gate rule; they are frozen in `test/demo-card-eval.test.ts` before any call.
2. Dev runs: `node --conditions=source demo/eval/card.ts run <en|es> dev 1`. They print no verdict.
3. `node --conditions=source demo/eval/card.ts gates 1` prints the intent's and each field's gate by the rule; write them into the demo.
4. Run 1 per language gives the verdict: `run <en|es> eval 1`.
5. Run 2 per language reports flips only: `run <en|es> eval 2`, then `compare <en|es> 1 2`.
6. Record here the verdict, the numbers, the misses and the run logs' paths (`demo/eval/runs/`, committed so anyone can rescore them with no call).

A row found wrong after a run is the owner's call, logged here; it never silently changes the set.

## Result

Not run yet.
