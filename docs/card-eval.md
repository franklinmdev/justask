# Card eval: sets, kill lines and verdict

**Status: run, verdict PASS in both languages (run 1), with nothing invented; Spanish passes held ambiguous with no slack. Sets, measures, kill lines and gate rule approved and frozen by the owner on 2026-09-23 (#20), before any provider call; the gates were fixed from the dev runs by that rule and written into the demo before run 1.**

**Round 2 (#44): the card passes in English and fails in Spanish**, where two nothing rows were read as new records; the owner ruled that round 2 stands. The Spanish intent fix is carried by [#57](https://github.com/franklinmdev/justask/issues/57). See Round 2 below; round 1's record is unchanged.

**Round 3 (#57): the card fails in both languages.** The fix held every command but one, a Spanish change no list names and the label did not hold (`deje en $260 el cargo de Brisamar de ayer`, `new_record` 0.58); English fails exact and held ambiguous on tags and the named pair, which #57 did not change. See Round 3: result below; rounds 1 and 2 are unchanged.

**Round 4 (#63): the card fails on Spanish latency alone.** Every quality line passes in both languages and both runs, with a named pair held in code ([ADR 0010](adr/0010-card-holds-a-named-pair.md)) and the intent naming setting a value; Spanish run 1's p95 was 1,137 ms against a line of 1,000, in a provider slowdown across the whole run. The owner ruled that the FAIL stands, with latency carried by [#65](https://github.com/franklinmdev/justask/issues/65). See Round 4: result below; rounds 1 to 3 are unchanged.

**Round 5 (#73): the same card fails on Spanish coverage by one field.** Under #65's latency rule, with nothing changed, English clears every kill line and Spanish covers 86 of 124 fields (0.694) against a line of 0.7, in both runs; every probe window was normal, and no warm-up call or row timed out. See Round 5: result below; rounds 1 to 4 are unchanged.

**Office tag diagnosis (#77): the office tag fills when a request names a service its label lists, and almost never from the service alone, in both languages.** Without its list the label fills no row, whether shortened or naming what office is not, and adding backups fills the backups row alone. The owner chose the vendor fix, filling a gap only, carried with round 6 by [#79](https://github.com/franklinmdev/justask/issues/79); nothing has landed. See Office tag diagnosis below; rounds 1 to 5 are unchanged.

**Round 6 (#79): the card with the vendor's office fill fails on English exact alone; Spanish passes every line.** Office is filled from an office-only vendor where the tags left a gap ([ADR 0012](adr/0012-card-fills-an-implied-value-in-a-gap.md)), its false-fill cost measured first on probes. English covers 0.79 but fixes 29 of 33 cards (0.879 against 0.9), every correction a tag the provider picked; Spanish covers 0.766, against round 5's 0.694. The rule filled no field wrong in any run. The owner ruled on 2026-09-23 that card measurement moves next to [#86](https://github.com/franklinmdev/justask/issues/86), with no round 7 before it. See Round 6: result below; rounds 1 to 5 are unchanged.

**Before round 7 (#86): the tag each case gets, the set size and a cap per row shape are written, with no call.** Printing billed to a client is `client` alone, a trip for a client event with no billing is `travel` alone, and a maybe-billable row expects its certain tags; round 7's sets are four times the size (168 rows per language, one card worth 0.008 of exact or less), with at most two rows per shape. No kill line changes and no frozen round is re-scored. See Before round 7 below.

**Round 7 (#88): the same card on 168 rows per language, under #86's tag cover and shape cap, fails on errors alone in both languages, a FAIL the owner ruled stands; the errors line's rule is extended for later rounds only, in [#93](https://github.com/franklinmdev/justask/issues/93).** Every quality line and p95 pass with room (exact 0.949 and 0.963, coverage 0.848 and 0.808, held ambiguous 0.935 and 0.903, nothing invented); the three errors of run 1 are the provider's 529 high-traffic answer and a 2 s timeout, in normal probe windows, and the errors line has no rule that sets them apart. A better result on reworded rows is not evidence that the card improved. See Round 7: result below; rounds 1 to 6 are unchanged.

**Round 8 (#97): the same card on fresh rows, under #93's retry and errors rule, fails on English invented alone; Spanish passes every line.** One English nothing row, a send no list names (`copy accounting on the Cloudberth bill`), filled a card in both runs (`new_record` 0.70 and 0.64); every other line passes in both languages with room (exact 0.957 and 0.95, coverage 0.869 and 0.841, held ambiguous 1 and 0.938). No row errored and no row retried in any of the four runs, so the round measured nothing of the retry. The owner ruled on 2026-09-24 that the FAIL stands: invented is a quality line, and row 60 is a card miss, not the provider's. The label fix and round 9 are carried by [#99](https://github.com/franklinmdev/justask/issues/99), and the retry is now counted in every run and measured whenever a transport failure occurs, not in a round of its own ([ADR 0013](adr/0013-ask-calls-an-unavailable-provider-once-more.md), amended). See Round 8: result below; rounds 1 to 7 are unchanged.

**Copy probes and round 9 (#99): copying someone is a send, the label now says so, and round 9 passes in both languages and both runs.** The new label held every English copy probe; Spanish `cópiale` read as a new record with it too, so the owner added the Spanish copy verbs to the command list and no reference, and the label's measured cost is two of the ten `copyrec` records, both of which copy a document. On fresh rows of round 7's shapes, English run 1 clears every line (exact 0.956, coverage 0.843, invented 0, held ambiguous 0.969) and so does Spanish (0.941, 0.8, 0, 0.875); every nothing row held in all four runs, and no row errored or retried. See Copy probes and Round 9: result below; rounds 1 to 8 are unchanged.

**Dates (#140): "last X" and "next X" are held only when their two readings differ, and a part of the day reads as its day.** On the runs' fixed Wednesday 2026-09-23, "last Monday" and "last Tuesday" are still held and "last Wednesday" to "last Sunday" now fill. The owner ruled on 2026-09-25 that today stays fixed at that Wednesday, the 14 frozen rows it moves stay as frozen and scored, and the next round runs under the new rule. See Dates (#140) below; rounds 1 to 9 are unchanged.

**Parser readings (#232): the QA's parser fixes change the candidates of eight frozen rows, and no row's expected value.** See Parser readings (#232) below; rounds 1 to 9 are unchanged.

**Card rules (#235): four new holds in code move no frozen row.** A named pair joined by a slash, "y/o" or a comma alone, a role marker, a vendor named only negated, and a day after today on the card's past-reading day. See Card rules (#235) below; rounds 1 to 9 are unchanged.

**Latency (#65): from the next verdict run on, every run sends a fixed provider probe before and after its rows, and a run whose probes are more than twice the baseline leaves a failing latency line pending, to be measured again in a normal window.** See Latency below; round 4 stays a FAIL.

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

## Card rules (#235)

The pre-launch QA's card fixes ([#235](https://github.com/franklinmdev/justask/issues/235)) add four holds in code, each before a gate and each reported on the result and saved in the run log, so a log rescores as it ran:

- **A named pair joined by a slash, "y/o" or a comma alone (#185, ADR 0010 and 0011, Amendment).** The demo reads "vs" and "versus" as `or` words in both languages.
- **A role marker (#186, ADR 0015)**, such as "System:" or "</request>", holds the whole card, and every field of a filter.
- **A vendor the request names only negated (#188, ADR 0016)**, by the demo's own negation words.
- **A day after today on a field that reads the past (#187, ADR 0008, Amendment)**, explicit words included.

Every row of every set in `demo/eval/` (2,494 rows over the card, filter and search) was checked with no call, on each set's fixed today, with each flow's own shortlists: none of the four holds any row it did not hold before. The only rows with a candidate after the eval's Wednesday are `en-r8-151` and `es-r8-151`, nothing rows whose "next week" is a period, held already. Bare Spanish "no" was left off the demo's negation words because it held `es-r6-10` ("acuerdo de no competencia de Lindero"), a record. `test/demo-card-eval.test.ts` pins that no card row holds on a marker, a negated vendor or a day after today, and the pair tests of each flow pin the rows a pair holds. No gate is refixed and no call was made for the frozen sets; the QA's calibration probes were rerun before and after (the PR lists the counts).

## Latency

The owner's triage decision on [#65](https://github.com/franklinmdev/justask/issues/65), 2026-09-23, for the search, filter and card alike. The p95 kill line reads the provider's latency and the flow's together, so a verdict run in a slow provider window fails on it whatever the flow does, as card round 4 did. From the next verdict run on:

- **Probes.** Every run sends one fixed provider probe (`PROBE` in `demo/eval/probe.ts`: one request, one question, three labels) straight to the provider, three times before its rows and three times after, and saves each probe's latency in its run log: the ones before in the header, the ones after on the log's last line.
- **Warm-up.** Before the measured probes and before any row, every run sends the probe request three more times (`PROBE_WARM_UP`) and discards them: they are saved in the header as `warmUp`, and never counted in the probe median or the p95. The owner's ruling on #65, 2026-09-23, after the first two runs with probes (search dev runs 3 and 4, below): in both, the first calls after idle took 1,236 to 1,443 ms and the rest about 250 to 450 ms, a cold start and not a slow window. The warm-up keeps a cold start out of the baseline, and it also protects a verdict's first rows: dev run 3's first four rows (`en-dev01` to `en-dev04`) timed out at 2 s, and a verdict run's first rows would have done the same. The probe is the same for every flow and language, and frozen by value in `test/demo-probe.test.ts`. It is not the diagnostic probe sets of rounds 3 and 4 (`diag`, `pair`), which are eval rows.
- **Baseline.** The probes' median from the most recent normal runs, written into `PROBE_BASELINE_MS` in `demo/eval/probe.ts` before the next verdict run, saved in every run log beside the kill lines, and frozen by value in the same test. `node --conditions=justask-source demo/eval/baseline.ts <run log>...` prints the median over the runs named, with no call. A probe that timed out counts at its wait; one that failed fast is left out. While no baseline is written, a dev, diag or pair run still sends the probes, and the CLIs refuse a verdict run before any call.
- **Slow window.** A run whose probes' median is more than twice its baseline, or whose every probe failed, is marked a slow window, in its report's measures. Its quality lines (exact, coverage, invented, held ambiguous, errors) still decide: any of them failing is a FAIL. A p95 that passes its line counts, since a slow provider only adds latency (the owner's ruling on #65, 2026-09-23). A p95 that fails is pending, and when every quality line passes the report's verdict reads `LATENCY PENDING`. Only that latency line is measured again: a later run of the same frozen rows, with nothing else changed, in a window whose probes are normal, under the next free run number (run 3 when run 2 took the flips). Read two lines of its report and nothing else: `Probes` must say `normal`, and the p95 in `Measures` decides the latency line against its kill line. Its verdict table decides nothing, even where it prints FAIL on a quality line; record the result beside run 1's. A later run for the latency line in a slow window decides nothing either; wait and run again.
- **Round 4 stays a FAIL** as recorded. Every log saved before this rule has no probes and scores as it did.

The owner's ruling on [#93](https://github.com/franklinmdev/justask/issues/93), 2026-09-24, for the search, filter and card alike, extends the rule to the errors line. Card round 7 failed on errors alone, and every one of its errors was the provider's: HTTP 529 answers and timeouts, in normal windows, about one per run of 168 rows. From the next verdict run on:

- **Transport failures.** A row's error is a transport failure when the provider did not answer at all: a timeout, or an overload status such as 529, another 5xx, or a lost connection on both of `ask`'s calls (ADR 0013). Its run log marks it `transport: true`. Any other error is not one: an answer that broke the contract, or an adapter that threw otherwise. Each report prints the errors with the transport failures among them, `errors: 2 (1 transport)`, and the rows where `ask` called twice with those of them the second call answered, `retried 3 (recovered 2)`; a run with no retried row prints neither.
- **The errors line.** The errors that are not transport failures decide a fail, as every error did before. When they stay within the line and the transport failures put the count over it, the errors line is pending, and when every other line passes or is pending, the verdict reads `ERRORS PENDING` (`LATENCY AND ERRORS PENDING` beside a pending p95). Sending the whole set again would not settle it: at about one transport failure per run, a later run of every row would likely fail the line of 0 again.
- **Remeasure.** Only the rows that failed on transport are sent again, in a later run with nothing else changed, under the next free run number: `remeasure <en|es> <set> <first n> <n>` on the flow's eval CLI sends exactly those rows, with the warm-up and the probes, into run `<n>`, then prints run `<first n>`'s report with their answers in place. A remeasure under other kill lines or gates than run 1's decides nothing. `merge` with the same arguments prints that report again, with no call. That report decides every line, the errors line included, and is recorded beside run 1's. It keeps run 1's probes, so a p95 pending in run 1's slow window stays pending and is measured by the latency rule above. A remeasure whose probes are not normal decides nothing, and neither does one with no baseline; wait and run again. A row that fails on transport again leaves the line pending; remeasure again, under the next free number, naming every earlier remeasure in order: `remeasure <en|es> <set> <first n> <earlier n>... <n>` sends only the rows still failing, and `merge` with the same numbers prints the report with every answer in place.
- **Round 7 stays a FAIL** as recorded. Every log saved before this rule has no transport marks, so every error in it counts as before (frozen in `test/transport.test.ts` on round 7's English run 1).

### Baseline: 235 ms, from search dev runs 5 and 6

The owner ruled on 2026-09-23 (#65) that the first baseline is seeded from two search dev runs back to back, accepted only if the rows' median latency in both logs is near the normal history, about 240 ms (card round 3 run 1: 243 ms; round 4's normal runs: 224 and 240 ms; the slow ones: 693 and 726 ms). The row median is taken over rows answered by a call.

| Run | Rows' median | Row errors | Warm-up (discarded) | Measured probes, before · after |
|---|---|---|---|---|
| Search `en` dev 3 | 444 ms (769 ms over all rows) | 4 timeouts | none yet | 1,236, 2,003 timeout, 2,001 timeout · 1,443, 445, 259 |
| Search `en` dev 4 | 318 ms | 0 | none yet | 1,312, 1,392, 367 · 249, 415, 359 |
| Search `en` dev 5 | 226 ms | 0 | 2,004, 2,002, 2,001, all timeouts | 336, 427, 306 · 227 provider error, 446, 176 |
| Search `en` dev 6 | 273 ms | 0 | 414, 217, 317 | 228, 261, 202 · 235, 231, 223 |

- **Dev runs 3 and 4 were rejected.** Dev run 3's rows sat far above the history, and both runs' first calls were a cold start. That led to the warm-up (above). Their logs are kept, and they seed nothing.
- **Dev runs 5 and 6 were accepted**, both near the history. Dev run 5's warm-up took the cold start on its own: all three calls timed out, and no row did. `node --conditions=justask-source demo/eval/baseline.ts demo/eval/runs/search-en-dev-5.jsonl demo/eval/runs/search-en-dev-6.jsonl` gives 235 ms over the 11 measured probes left: the warm-up is left out, and so is the one probe that failed fast. `PROBE_BASELINE_MS` is 235, frozen by value in `test/demo-probe.test.ts`, so a run is a slow window when its probes' median is above 470 ms.

Run logs: `demo/eval/runs/search-en-dev-3.jsonl` to `search-en-dev-6.jsonl`.

## Gates, from the dev runs

The intent and each field get their own gate, fixed from the dev runs by the filter's rule (`fixGate` in `demo/eval/gates.ts`), the two languages pooled, since the demo serves one gate per field in both. Read with no gate:

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
2. Dev runs: `node --conditions=justask-source demo/eval/card.ts run <en|es> dev 1`. They print no verdict.
3. `node --conditions=justask-source demo/eval/card.ts gates 1` prints the intent's and each field's gate by the rule; write them into the demo.
4. From #65 on, write the probe baseline into the demo (Latency, above).
5. Run 1 per language gives the verdict: `run <en|es> eval 1`. In a slow window a failing latency line is measured again, and from #93 on an errors line over only by transport failures has those rows sent again, as Latency says.
6. Run 2 per language reports flips only: `run <en|es> eval 2`, then `compare <en|es> eval 1 2`.
7. Record here the verdict, the numbers, the misses and the run logs' paths (`demo/eval/runs/`, committed so anyone can rescore them with no call).

A row found wrong after a run is the owner's call, logged here; it never silently changes the set.

## Result

**Verdict: PASS.** Both languages clear every kill line in run 1. The owner ruled on 2026-09-23 that it closes delivery 3, recorded as the thinnest of the three verdicts:

- **The intent's gate of 0.45 rests on 4 dev nothing rows per language.** None picked `new_record`, so the rule had no wrong pick to keep out; the eval set's 6 nothing rows per language held, but nothing measures the margin.
- **Spanish held ambiguous sits exactly on its line**, 0.75 (6 of 8) in both runs: one more leak and it fails.

Both, with the tag descriptions and the four remaining review findings, are carried by [#44](https://github.com/franklinmdev/justask/issues/44), judged on a fresh round 2.

Runs of 2026-09-23 with `jev-1.13.0`, gates intent 0.45, vendor 0.5, tags 0.5, spent_on 0.8, total 0.9 (from dev run 1, above), the frozen sets and kill lines, today fixed at Wednesday 2026-09-23.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 0.939 (31 of 33 cards) | 0.941 (32 of 34 cards) |
| coverage | at least 0.7 | 0.75 (93 of 124 fields) | 0.734 (91 of 124 fields) |
| invented | at most 0 | 0 | 0 |
| held ambiguous | at least 0.75 | 0.875 (7 of 8) | 0.75 (6 of 8) |
| p95 | at most 1000 ms | 508 ms | 314 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000780 | $0.0000813 |

Per field, filled of expected: vendor 24 of 27 in both; tags 12 of 34 English (one of them wrong), 9 of 34 Spanish; day 26 and 27 of 30; amount 31 of 33 in both. The intent passed 33 and 34 of the 36 cards, and no nothing row in either language.

Filled and wrong, the only corrections a person would make:

| Row | Request | Field | Expected | Got | Pick |
|---|---|---|---|---|---|
| en-r-27 | Swiftlane delivery, billable to the client, $58.50 on August 18 | tags | office + client | client | office `not_mentioned` 0.92 |
| en-a-32 | Larkspur lunch, might be billable to a client, $180 on Monday | tags | held | meals + client | client yes 0.74 |
| es-a-32 | almuerzo de Cazuela Azul, quizás facturable a un cliente, $180 el lunes | tags | held | meals + client | client yes 0.63 |
| es-a-30 | Tintaverde o Letranueva, $95 por impresiones el viernes | vendor | held | letranueva | letranueva 0.59 |

Held and wrong, by cause:

- **Tags, 19 English and 23 Spanish cards.** Almost all expect `office`, and the provider answers `not_mentioned` for it on hosting, cleaning, windows, couriers, legal, payroll and insurance, up to 0.98 (`business insurance premium to Sureharbor`). A `not_mentioned` on every tag leaves the field empty, so these are held, never wrong. `travel` and `meals` filled where the words said them.
- **The intent, 3 English and 2 Spanish cards.** `hotel in Denver for two nights, $389, September 15` (`not_mentioned` 0.50), `flyers from Inkhollow` and `volantes de Letranueva` (no amount, `not_mentioned` 0.71 and 0.57), `entrega de Pieveloz, facturable al cliente, ...` (`not_mentioned` 0.50), and `Papergrove pens on Monday, $18 or $20, I forget` (`new_record` 0.35).
- **The day on "Friday" beside a client visit or a printing job.** `flight to Chicago ... on Friday` held in both languages (`not_available` 0.54 and 0.51), `Tintaverde o Letranueva ... el viernes` at 0.55.
- **The euro amount** held under the 0.9 gate in both languages (a0 0.81 and 0.66): the only amount with a currency other than the local one.
- **`payroll company fee`** held its vendor in both languages (`not_mentioned` 0.57 and 0.52), the paraphrase with no vendor name.

### Run 2: flips only

English: 3 flips, all on one row whose intent crossed the gate: `hotel in Denver for two nights` filled tags, day and amount in run 2. Coverage 0.774, exact 0.941, held ambiguous 0.875. Spanish: 7 flips on three rows. `entrega de Pieveloz, facturable al cliente` passed its intent and filled four fields; `sillas de oficina de una mueblería` lost its `office` tag; `bolígrafos de Tintaverde el lunes, $18 o $20` held its vendor and day, its intent below the gate. Coverage 0.742, exact 0.912 (a third correction), held ambiguous 0.75 again.

### What the misses say

- **The card never filled a wrong vendor, day or amount on a record.** Every correction in run 1 is a tag, or a field an ambiguous row must hold. No nothing row filled anything in either run.
- **Tags carry the coverage cost.** Without the tags field, run 1 fills 81 of 90 English and 82 of 90 Spanish expected fields. The provider reads `office: supplies, equipment, software and services` narrowly: services like hosting or insurance are `not_mentioned`, not `office`. The sets were frozen with the broad reading, so the rows stand; the tag's description is the thing to tune, on the dev set, in a follow-up.
- **The intent sits low, and the rule set its gate low with no wrong pick to keep out.** Rescored with no call, and so with no verdict: at the lab's 0.9 on every gate, run 1 covers 0.137 English and 0.097 Spanish, with every filled card exact. The per-field gates are what makes the card fill at all.
- **"Maybe billable to a client" is read as billable**, in both languages (0.74 and 0.63). The ambiguous row expects the tags held; `client` passes the tags gate of 0.5.
- **The named pair leaks again.** `Tintaverde o Letranueva` filled Letranueva at 0.59 against a vendor gate of 0.5, as the filter's `Nubalia o Cuentia` filled at 0.61 (docs/filter-eval.md). The card's vendor has no `several` label either. This is the one reason Spanish passes held ambiguous with no slack.
- **Spanish held ambiguous has no slack.** One more leak and it fails. A rescore at a tags gate of 0.9 holds `es-a-32` but not `es-a-30`, and drops coverage to 0.661 in both languages, below its line.

### Run logs

- Dev: `demo/eval/runs/card-en-dev-1.jsonl`, `demo/eval/runs/card-es-dev-1.jsonl`
- Run 1: `demo/eval/runs/card-en-1.jsonl`, `demo/eval/runs/card-es-1.jsonl`
- Run 2: `demo/eval/runs/card-en-2.jsonl`, `demo/eval/runs/card-es-2.jsonl`

Each rescores with `scoreCardRun(await readCardRun(path), { gates })` and no call.

## Round 2: tuning, from the dev runs only

Carried by [#44](https://github.com/franklinmdev/justask/issues/44). Round 1 above stands as recorded; its logs rescore at their own gates, which each log saves. Everything in this section was fixed from dev runs, before any round 2 call.

### Dev nothing rows

The owner approved 8 more dev nothing rows per language on 2026-09-23, `en-d-21` to `en-d-28` and `es-d-21` to `es-d-28`: a question about a recorded expense (`did the Larkspur lunch on Monday come to $96?`), changes and deletes that name a vendor, a day or an amount (`change the Cloudberth expense from August 1 to $329`), a thank-you about a vendor, a tag added to another expense, a split between clients, and a total. The dev sets now hold 12 records, 4 ambiguous rows and 12 nothing rows per language; round 1's dev counts above describe dev run 1.

### Tag descriptions

Tuned on the dev sets only, toward the reading the sets were written with (Sets, above). What the provider reads, English and Spanish alike:

| Tag | Round 1 | Round 2 |
|---|---|---|
| meals | `meals: lunch, dinner, coffee, catering` | `meals: food and drink, such as lunch, dinner, coffee, snacks and catering` |
| travel | `travel: flights, hotels, taxis` | `travel: flights, hotels, taxis and trains` |
| office | `office: supplies, equipment, software and services` | `office: what keeps the business running, such as supplies, equipment, software, hosting, repairs, cleaning and window washing, printing, couriers, payroll and HR, legal advice and insurance` |
| client | `billable to a client, or spent with a client` | `billable to a client, or spent with a client, when the request says so for certain, not when it says maybe` |

Dev run 2 had every change but `window washing` and `HR` (`ventanas` and `recursos humanos`); `office` still answered `not_mentioned` on `Paydale HR consulting` and `glaswell windows` in both languages, services the catalog's own vendors sell, so dev run 3 names them. The labels a person sees are unchanged.

### Dev runs 2 and 3

Runs of 2026-09-23 with `jev-1.13.0`, at round 1's gates, today fixed at Wednesday 2026-09-23. Tags filled at round 1's tags gate of 0.5, of 15 expected:

| Tags filled at 0.5 | Dev run 1 | Dev run 2 | Dev run 3 |
|---|---|---|---|
| English | 3 | 10 | 10 |
| Spanish | 1 | 7 | 11 |

- **No field filled wrong** on any dev card, in either run or language, and no nothing row filled anything.
- **The `client` tag held on `maybe for a client`** in both languages and both runs (`not_mentioned` 0.79 and 0.83 in dev run 2), where dev run 1 filled it at 0.49.
- **The intent's margin is measured now, though the rule still has no wrong pick.** None of the 24 dev nothing rows picked `new_record`. Its highest probability on them was 0.23 in dev run 2 (`póngale la etiqueta de cliente al almuerzo de ayer`) and 0.18 in dev run 3 (`pase el gasto del taxi al viernes`), against a lowest right pick of 0.49: the gate of 0.45 sits above every nothing row by more than 0.2.
- **The remaining tag misses in dev run 3 are weak picks, not wrong ones.** `yes` on `travel` for `Farwander flights for the sales trip` came at 0.37 and 0.39, `yes` on `office` for software, toner and business cards between 0.44 and 0.49, and `office` still answered `not_mentioned` on `glaswell windows` (0.44), `Cuentia` licenses (0.42) and `Tintaverde` toner (0.39).

### Gates for round 2

The owner ruled on 2026-09-23 that dev run 3 alone fixes the gates, the only dev run with the final descriptions, by the same rule as round 1. `node --conditions=justask-source demo/eval/card.ts gates 3`:

| Field | Lowest right | Highest wrong | Rule | Gate | Round 1 |
|---|---|---|---|---|---|
| intent | 0.49 | none | lowest right rounded down | **0.45** | 0.45 |
| vendor | 0.51 | none | lowest right rounded down | **0.5** | 0.5 |
| tags | 0.37 | none | lowest right rounded down | **0.35** | 0.5 |
| spent_on | 0.9 | none | lowest right rounded down, at most 0.9 | **0.9** | 0.8 |
| total | 0.99 | none | lowest right rounded down, at most 0.9 | **0.9** | 0.9 |

At these gates dev run 3 fills 51 of 57 English and 54 of 57 Spanish expected fields, every filled card exact, every ambiguous row held. The gates are in `demo/server/handler.ts`; `test/demo-card-eval.test.ts` pins them to dev run 3.

Run logs: `demo/eval/runs/card-en-dev-2.jsonl`, `demo/eval/runs/card-es-dev-2.jsonl`, `demo/eval/runs/card-en-dev-3.jsonl`, `demo/eval/runs/card-es-dev-3.jsonl`.

### Round 2 sets

Files in `demo/eval/`, drafted against every set in `demo/eval/` and the demo's suggestions, approved by the owner in two batches on 2026-09-23 (the 28 records, then the 8 ambiguous and 6 nothing rows) and frozen by checksum in `test/demo-card-eval.test.ts` in the commit before the first round 2 call. Run logs `demo/eval/runs/card-<language>-round2-<n>.jsonl`.

| File | Rows | record | ambiguous | nothing |
|---|---|---|---|---|
| `card-en.round2.jsonl` | 42 | 28 | 8 | 6 |
| `card-es.round2.jsonl` | 42 | 28 | 8 | 6 |

- **The same shape as round 1**, so the two rounds read side by side: tags in all 28 records, the day in 24, the amount in 27, the vendor in 21, each of the 14 vendors at least once, 7 records with no vendor of the catalog (`Uber`, `a bus ticket`, `an electronics store`), typos (`Tallyrot`, `clausewod`; `Cuentya`, `lindro`), paraphrases (`the IT support company`, `the insurance company`), one euro amount. Spanish row N has the same shape as English row N.
- **Tags not named in any description**, so the tuned descriptions are not what is measured word for word: a bus, a birthday cake, drinks, a monitor, a trademark filing, a descaling service.
- **ambiguous:** vendor `the cleaners` and the named pair `Fixbright or Cloudberth` (`Tecnoria o Nubalia`), the shape that leaked in round 1; tags `Beanhaven order` (coffee or beans) and `possibly billable to a client`; day `last Thursday` and `earlier this month`; amount `600 pesos` and `$45 or $54`.
- **nothing:** a question about spending, a delete, a date change on an existing expense, a thank-you, a question about tags, and an email of an invoice.
- The same checks as round 1 hold: no request repeats any other set or suggestion, every expected day and amount is one the parser builds on Wednesday 2026-09-23, and every held one is held by the parser's reading or by two candidates.
- Kill lines, measures and procedure as round 1. Run 1 gives the verdict at the gates above; run 2 reports flips only (`compare <en|es> round2 1 2`).

## Round 2: result

**Verdict: FAIL.** English clears every kill line; Spanish fails exact, invented and held ambiguous. Runs of 2026-09-23 with `jev-1.13.0`, gates intent 0.45, vendor 0.5, tags 0.35, spent_on 0.9, total 0.9 (dev run 3, above), the frozen round 2 sets and the same kill lines, today fixed at Wednesday 2026-09-23.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 0.941 (32 of 34 cards) | **0.882** (30 of 34 cards) |
| coverage | at least 0.7 | 0.847 (105 of 124 fields) | 0.774 (96 of 124 fields) |
| invented | at most 0 | 0 | **2** |
| held ambiguous | at least 0.75 | 0.875 (7 of 8) | **0.625** (5 of 8) |
| p95 | at most 1000 ms | 317 ms | 327 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000865 | $0.0000916 |

Per field, filled of expected: vendor 26 and 25 of 27; tags 29 of 34 English (one wrong), 20 of 34 Spanish (one wrong); day 20 and 21 of 30; amount 30 of 33 in both. Round 1 filled tags 12 and 9 of 34.

Filled and wrong:

| Row | Request | Field | Expected | Got | Pick |
|---|---|---|---|---|---|
| es-r2-38 | quite el gasto de $75 del Cafetal | intent | nothing | vendor, tags, amount | `new_record` 0.72 |
| es-r2-42 | envíe la factura de Lindero a contabilidad | intent | nothing | vendor | `new_record` 0.53 |
| en-r2-24 | Inkhollow banner for the client's launch, billable to them, $210 on September 11 | tags | office + client | client | office `not_mentioned` 0.64 |
| es-r2-24 | pancarta de Letranueva para el lanzamiento del cliente, facturable a él, ... | tags | office + client | client | office `not_mentioned` 0.94 |
| en-r2-32 | Farwander flight, possibly billable to a client, $310 yesterday | tags | held | travel | travel yes 0.62 |
| es-r2-32 | vuelo de Rumbo Claro, posiblemente facturable a un cliente, $310 ayer | tags | held | travel | travel yes 0.64 |
| es-r2-31 | pedido del Cafetal, $62 el jueves | tags | held | meals | meals yes 0.70 |
| es-r2-30 | Tecnoria o Nubalia, $140 por el arreglo del servidor el lunes | vendor | held | tecnoria | tecnoria 0.57 |

### Run 2: flips only

English: 2 flips, coverage 0.847, exact 0.941, held ambiguous 0.875 again: `Farwander hotel ... September 14` filled its day, `Beanhaven coffee machine descaling` lost its `office` tag. Spanish: 4 flips on two rows, coverage 0.742, exact 0.909, the same two nothing rows invented and the same three ambiguous rows leaked: `pancarta de Letranueva ...` held its intent and so its vendor, tags and day, and `tóner de Tintaverde el jueves pasado` lost its `office` tag.

### What the misses say

- **The intent is what fails, and the dev nothing rows did not predict it.** Across 24 dev nothing rows `new_record` never passed 0.23; on round 2, `quite el gasto de $75 del Cafetal` reached 0.72 and `envíe la factura de Lindero a contabilidad` 0.53, in both runs. The English twins stayed at 0.00 and 0.12. Records pick `new_record` as low as 0.49, so the two overlap: rescored with no call, at an intent gate of 0.75 Spanish invents nothing but its coverage falls to 0.484, and English to 0.605. No intent gate passes Spanish. The intent's question names the card alone, never a tag, and its gate is round 1's 0.45, so round 1's card would put the same question to these two rows at the same gate.
- **The tag descriptions did what they were tuned for.** Tags filled 29 and 20 of 34, against 12 and 9 in round 1, with rows the descriptions never name (a bus, a birthday cake, drinks, a monitor). Without the tags field, run 1 fills 76 of 90 expected fields in both languages; the tags now add to coverage instead of costing it. Spanish `office` still answers `not_mentioned` on couriers, a trademark filing and a backup add-on, up to 0.93.
- **"Not when it says maybe" moved the leak, it did not stop it.** On `possibly billable to a client`, `client` now answers `not_mentioned` (0.66 and 0.76) instead of yes, so the tags field fills `travel` alone and still leaks. A several-item field holds only when some item answers `not_available`; a description that steers toward `not_mentioned` cannot hold it.
- **`billable to them` drops `office`.** Both languages fill `client` alone on the banner, `office` `not_mentioned`: the client reading crowds out what was bought.
- **The named pair leaks in Spanish again,** `Tecnoria o Nubalia` at 0.57 against the vendor gate of 0.5, as `Tintaverde o Letranueva` did at 0.59 in round 1; English held `Fixbright or Cloudberth` (0.38). The card's vendor has no `several` label.
- **Rescored at round 1's gates** (tags 0.5, spent_on 0.8), with no call and no verdict: English 0.815 coverage, Spanish still fails the same three lines.

### Run logs

- Dev: `demo/eval/runs/card-en-dev-2.jsonl`, `demo/eval/runs/card-es-dev-2.jsonl`, `demo/eval/runs/card-en-dev-3.jsonl`, `demo/eval/runs/card-es-dev-3.jsonl`
- Run 1: `demo/eval/runs/card-en-round2-1.jsonl`, `demo/eval/runs/card-es-round2-1.jsonl`
- Run 2: `demo/eval/runs/card-en-round2-2.jsonl`, `demo/eval/runs/card-es-round2-2.jsonl`

Each rescores with `scoreCardRun(await readCardRun(path), { gates })` and no call.

## Round 3: diagnosis, from probes only

Carried by [#57](https://github.com/franklinmdev/justask/issues/57). Rounds 1 and 2 above stand as recorded. Before any fix is chosen, the question is why two Spanish nothing rows read as new records in round 2 while their English twins did not: the usted imperative (`quite` is also an English word), commands in general, or amounts and vendors pulling toward `new_record`.

### Probe sets

`demo/eval/card-es.diag.jsonl` and `demo/eval/card-en.diag.jsonl`, run with `card.ts run <en|es> diag <n>` and no verdict. The first 50 Spanish and 30 English rows are nothing rows, the diagnosis below; the 15 records per language after them measure the fix's false holds (The fix, below). They are measured, never tuned against, and no round 3 row may repeat them (`test/demo-card-eval.test.ts`).

- **Spanish, 44 rows:** each of `quite`, `quita`, `quité`, `borre`, `borra`, `elimine`, `elimina`, `cambie`, `cambia`, `envíe` and `envía` on the same expense four ways: with a vendor and an amount (`quite el gasto de $58 del Cafetal`), a vendor alone, an amount alone, and neither (`quite ese gasto`). Changes move the expense to Friday; sends go to accounting and name an invoice (`la factura`).
- **English, 24 rows:** `remove`, `I removed`, `erase`, `delete`, `change` and `send` on the Beanhaven expense, the same four ways.
- **Six more per language, added for run 3,** to split the verb from the noun and the vendor: `borre la factura ...` and `envíe el gasto ...`, `mande la factura ...`, `quite` on another vendor and amount (`quite el gasto de $320 de Nubalia`) and on an invoice, and `reenvíe la factura de Lindero a contabilidad`; English twins with `delete`, `send`, `forward` and `remove`.

### Result

Runs of 2026-09-23 with `jev-1.13.0`, the demo's card at round 2's gates (intent 0.45), today fixed at Wednesday 2026-09-23. Runs 1 and 2 read the first 44 and 24 rows; run 3 reads all of them. `new_record`'s probability, lowest to highest across the runs:

| Verb | Vendor and amount | Vendor | Amount | Neither |
|---|---|---|---|---|
| `quite` | 0.78 to 0.81 | 0.57 to 0.60 | 0.86 to 0.88 | 0.19 to 0.26 |
| `quita`, `quité`, `borre`, `borra`, `elimine`, `elimina` | 0.00 | 0.00 | 0.00 | 0.00 |
| `cambie`, `cambia` | 0.00 to 0.01 | 0.01 to 0.03 | 0.02 to 0.04 | 0.00 |
| `envíe` | 0.93 to 0.94 | 0.78 to 0.83 | 0.88 | 0.57 to 0.68 |
| `envía` | 0.91 to 0.95 | 0.79 to 0.82 | 0.88 to 0.91 | 0.45 to 0.52 |
| `remove`, `I removed`, `erase`, `delete`, `change` | 0.00 | 0.00 | 0.00 | 0.00 |
| `send` | 0.38 to 0.43 | 0.14 to 0.16 | 0.45 to 0.48 | 0.09 to 0.16 |

Run 3's added rows: `quite el gasto de $320 de Nubalia` 0.74, `quite la factura de $58 del Cafetal` 0.70, `borre la factura de $58 del Cafetal` 0.00, `envíe el gasto de $58 del Cafetal a contabilidad` 0.99, `mande la factura de $58 del Cafetal a contabilidad` 0.97, `reenvíe la factura de Lindero a contabilidad` 0.34; English `delete the $58 Beanhaven invoice` 0.00, `remove the $58 Beanhaven invoice` 0.00, `remove the $320 Cloudberth expense` 0.00, `send the $58 Beanhaven expense to accounting` 0.57, `forward the $58 Beanhaven invoice to accounting` 0.40, `forward the Clausewood invoice to accounting` 0.25.

### What the probes say

- **Not commands in general.** Every other Spanish delete and change, usted or tú, read 0.04 or less in every run, as did every English one. The intent question handles commands on an existing record.
- **`quite` alone, and it is the word, not the mood.** `quita`, `borre` and `elimine` are the same command, and `borre`/`elimine` the same usted imperative, all at 0.00; `quite` reads as a new record on either vendor, on an expense or an invoice. Read as English, `quite the $58 Cafetal expense` is a note about an expense, not a delete.
- **Sending is a second, separate gap, in both languages.** The intent's `not_available` label names changing, cancelling, deleting and asking; sending names none of them. Spanish `envíe`, `envía` and `mande` read as new records at up to 0.99 whatever the noun (`el gasto` 0.99, `la factura` 0.97). English reads lower but not safely: `send the $58 invoice to accounting` reached 0.45, 0.46 and 0.48, and `send the $58 Beanhaven expense to accounting` 0.57, at or above the intent gate of 0.45. English passed round 2 because its send row named no amount (`email the Clausewood invoice to accounting` read 0.12).
- **Amounts and vendors raise the leak but do not cause it.** Under `quite` and `envíe`, an amount lifts `new_record` most (`quite ese gasto` 0.19 to 0.26, `quite el gasto de $58` 0.86 to 0.88); under every other verb they change nothing. The noun does not matter: `borre la factura` and `delete the invoice` read 0.00.
- **The misreading is stable.** The same row moved by at most 0.11 across three runs (`envíe esa factura a contabilidad`, 0.57 to 0.68).

Run logs: `demo/eval/runs/card-<en|es>-diag-<1|2|3>.jsonl`.

## Round 3: the fix, from dev runs only

The owner decided on 2026-09-23 from the diagnosis above: both fixes, recorded in [ADR 0009](adr/0009-card-holds-commands-on-existing-records.md). **The fix covers English too**, which leaked on sending.

1. **The intent question's `not_available` label names sending and forwarding**: "it changes, cancels, deletes, sends or forwards one, or asks a question".
2. **The demo's card holds a command on an existing record in code**, before the intent's gate: a verb and a reference from its language's lists (`cardCommands` in `demo/src/content/en.ts` and `es.ts`), each as whole words, up to two words between a reference's determiner and its noun. `quite` is on the Spanish list alone.

| Language | Verbs | References |
|---|---|---|
| English | remove, delete, erase, cancel, void, change, edit, update, move, undo, send, resend, forward, email | the, that, this expense; the expenses; the, that, this invoice; the invoices |
| Spanish | quite, quita, quitar, borre, borra, borrar, elimine, elimina, eliminar, anule, anula, anular, cancele, cancela, cancelar, cambie, cambia, cambiar, mueva, mueve, mover, pase, pasa, deshaga, deshaz, envíe, envía, enviar, reenvíe, reenvía, reenviar, mande, manda, mandar | el, del, ese, este gasto; los gastos; la, esa, esta factura; las facturas |

### False holds, beside the leaks removed

Before any gate was fixed, the owner asked for the cost: 15 real new records per language, appended to the probe sets, each with a listed word in it, such as `email hosting invoice from Cloudberth, $12`, `quite a pricey lunch at Larkspur, $95 yesterday` and `limpieza de Brisamar para que quite las manchas de la alfombra, $140 el viernes`. Six of them hold a listed verb and a listed reference together (`Swiftlane courier to send the invoice to the client`, `complemento de Cuentia para enviar las facturas`), the shape the code check cannot tell from a command. Probe run 4, of 2026-09-23 with `jev-1.13.0`, has both fixes, the intent gate at 0.45, today Wednesday 2026-09-23.

| Probe run 4 | English | Spanish |
|---|---|---|
| Nothing rows that read as new records at 0.45, run 3 (no fix) | 2 of 30 | 15 of 50 |
| The same, run 4 (both fixes) | 0 of 30 | 0 of 50 |
| Of those, held by the provider in run 4, with the new label | 2 | 10 |
| Of those, held by the code alone, the provider still reading a new record | 0 | 5 |
| Records held, of 15 | 5 | 3 |
| Held by the code | 3 | 3 |
| Of those, which the provider held too | 2 | 2 |
| Held by the provider, no command found | 2 | 0 |

- **The label carries sending.** Every English send and forward fell to 0.00 or 0.01 (from 0.25 to 0.57); Spanish `envíe`, `envía`, `mande` and `reenvíe` fell to 0.14 or less, all but `envíe el gasto de $58 del Cafetal a contabilidad` at 0.46, where `not_available` still won at 0.54. The code holds every one of them too.
- **The code carries `quite`, as the diagnosis said the label could not.** `quite` read about the same with the new label, 0.34 to 0.87: five of its six rows still read as new records, and the code held all six.
- **The code's own cost is one record per language.** It held 3 of 15 in each; the provider read 2 of those 3 as not new too (`send the invoice to the client` 0.10, `resend the invoice to Paydale` 0.00; `enviar la factura al cliente` 0.32, `reenviar la factura a Serena` 0.12), so only `Tallyroot add-on to email the invoices, $30 today` (0.74) and `complemento de Cuentia para enviar las facturas, $30 hoy` (0.53) are held by the code alone. Every one of the six is a purpose clause, `to` or `para` and a verb, the verb's infinitive in Spanish.
- **The provider held two English records with no command in them**: `taxi to forward the signed contract to Clausewood, $22 yesterday` (`not_available` 0.32 for `new_record`), and `quite a pricey lunch at Larkspur, $95 yesterday` (`not_mentioned`, `new_record` 0.12). The code never holds the second, as the owner required; there was no run without the new label to say whether the label moved them.
- **No record of any frozen set holds a command.** Checked with no call over every set in `demo/eval/`: the code holds only nothing rows there.

### Gates for round 3

Dev run 4, of 2026-09-23 with `jev-1.13.0`, the first dev run with both fixes, fixes every gate by the same rule as rounds 1 and 2. `node --conditions=justask-source demo/eval/card.ts gates 4`:

| Field | Lowest right | Highest wrong | Rule | Gate | Round 2 |
|---|---|---|---|---|---|
| intent | 0.48 | none | lowest right rounded down | **0.45** | 0.45 |
| vendor | 0.52 | none | lowest right rounded down | **0.5** | 0.5 |
| tags | 0.38 | none | lowest right rounded down | **0.35** | 0.35 |
| spent_on | 0.84 | none | lowest right rounded down | **0.8** | 0.9 |
| total | 0.98 | none | lowest right rounded down, at most 0.9 | **0.9** | 0.9 |

- The code held 3 English and 3 Spanish dev nothing rows (`undo the last expense`, `pase el gasto del taxi al viernes`); the rule reads no intent pick on them, since no gate lets them through. No nothing row picked `new_record`, held or not: the highest was 0.18 (`pase el gasto del taxi al viernes`, held by the code), and 0.16 among the rest (`póngale la etiqueta de cliente al almuerzo de ayer`).
- The label cost the dev cards nothing the earlier runs did not: English held `the IT people fixed the printer`, as dev run 3 did, and `train ticket to Boston on Friday` (`not_mentioned` 0.48), held in dev run 1 too. Spanish passed all 16 cards.
- At these gates dev run 4 fills 49 of 57 English and 52 of 57 Spanish expected fields, every filled card exact, every ambiguous row held, no nothing row filled.

The gates are in `demo/server/handler.ts`; `test/demo-card-eval.test.ts` pins them to dev run 4.

Run logs: `demo/eval/runs/card-<en|es>-diag-4.jsonl`, `demo/eval/runs/card-<en|es>-dev-4.jsonl`.

### Round 3 sets

Files in `demo/eval/`, drafted against every set in `demo/eval/` and the demo's suggestions, approved by the owner in five batches on 2026-09-23 (rows 1 to 10, 11 to 20, 21 to 30, 31 to 40, 41 and 42, English beside Spanish) and frozen by checksum in `test/demo-card-eval.test.ts` in the commit before the first round 3 call. Run logs `demo/eval/runs/card-<language>-round3-<n>.jsonl`.

| File | Rows | record | ambiguous | nothing |
|---|---|---|---|---|
| `card-en.round3.jsonl` | 42 | 28 | 8 | 6 |
| `card-es.round3.jsonl` | 42 | 28 | 8 | 6 |

- **The same shape as rounds 1 and 2:** tags in all 28 records, the day in 24, the amount in 27, the vendor in 21, each of the 14 vendors at least once, 7 records with no vendor of the catalog (`Lyft`, `a seafood place`, `an office outlet`), typos (`Taliroot`, `clauswood`; `Quentia`, `lyndero`), paraphrases (`the laptop repair shop`, `our business insurer`), one euro amount. Spanish row N has the same shape as English row N.
- **ambiguous:** vendor `the cleaning crew` and the named pair `Tallyroot or Cloudberth` (`Cuentia o Nubalia`); tags `Beanhaven delivery` and `perhaps billable to a client`; day `last Monday` and `last month`; amount `2,500 pesos` and `$27 or $32`. Two shapes repeat round 2's leaks on purpose: the named pair, and `billable to them` on a record (row 24).
- **nothing:** a question about spending, a delete, a change, a thank-you, a question about tags, and a send. They measure both fixes apart: the code holds the delete in both languages (`delete the Papergrove expense`, `quite la factura de Tintaverde`), and no list holds the change (`make yesterday's Brightmop charge $260`, `deje en $260 el cargo`) or the send (`forward Paydale's invoice to our accountant`, `mándele la factura de Serena al contador`), which the label alone must hold. Checked with no call: the code holds no round 3 record.
- The same checks as rounds 1 and 2 hold: no request repeats any other set, probe or suggestion, every expected day and amount is one the parser builds on Wednesday 2026-09-23, and every held one is held by the parser's reading or by two candidates.
- Kill lines, measures and procedure as round 1, at the gates from dev run 4 (above). Run 1 gives the verdict; run 2 reports flips only.

## Round 3: result

**Verdict: FAIL.** English fails exact and held ambiguous; Spanish fails invented. Runs of 2026-09-23 with `jev-1.13.0`, gates intent 0.45, vendor 0.5, tags 0.35, spent_on 0.8, total 0.9 (dev run 4, above), both fixes of ADR 0009, the frozen round 3 sets and the same kill lines, today fixed at Wednesday 2026-09-23.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | **0.844** (27 of 32 cards) | 0.906 (29 of 32 cards) |
| coverage | at least 0.7 | 0.815 (101 of 124 fields) | 0.734 (91 of 124 fields) |
| invented | at most 0 | 0 | **1** |
| held ambiguous | at least 0.75 | **0.625** (5 of 8) | 0.75 (6 of 8) |
| p95 | at most 1000 ms | 378 ms | 334 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000869 | $0.0000920 |

Per field, filled of expected: vendor 24 and 21 of 27; tags 26 of 34 English (two wrong), 21 of 34 Spanish (one wrong); day 21 and 20 of 30; amount 30 and 29 of 33. The intent passed 32 of the 36 cards in both languages.

### The commands, what #57 set out to fix

| Row | English | `new_record`, runs 1 and 2 | Spanish | `new_record`, runs 1 and 2 |
|---|---|---|---|---|
| 38, a delete | `delete the Papergrove expense from Monday` | 0.00, 0.00, held by the code | `quite la factura de Tintaverde del lunes` | 0.17, 0.13, held by the code |
| 39, a change | `make yesterday's Brightmop charge $260` | 0.41, 0.30 | `deje en $260 el cargo de Brisamar de ayer` | **0.58, 0.64** |
| 42, a send | `forward Paydale's invoice to our accountant` | 0.00, 0.00 | `mándele la factura de Serena al contador` | 0.00, 0.00 |

- **Sending is fixed by the label alone.** Row 42 names neither list's words in either language (`Paydale's invoice` has no listed determiner, `mándele` is not on the Spanish list) and read 0.00 in all four runs, where round 2's send read 0.53 in Spanish.
- **`quite` is fixed, by both.** The code held row 38, and the provider read it at 0.17 and 0.13 besides, against round 2's 0.72.
- **A change no list names still leaks in Spanish.** `deje en $260 el cargo de Brisamar de ayer` read as a new record in both runs and filled vendor, day and amount. The label names changing, and the provider still reads `deje en $260` as recording $260. Its English twin stayed below the gate, at 0.41 in run 1, 0.04 under it. This is the one row that fails Spanish.
- The questions, the thank-you and the tags question read `new_record` at 0.01 or less in all four runs.

### Filled and wrong

| Row | Request | Field | Expected | Got | Pick |
|---|---|---|---|---|---|
| es-r3-39 | deje en $260 el cargo de Brisamar de ayer | intent | nothing | vendor, day, amount | `new_record` 0.58 |
| en-r3-30 | Tallyroot or Cloudberth, $75 for the software renewal on Tuesday | vendor | held | tallyroot | tallyroot 0.75 |
| es-r3-30 | Cuentia o Nubalia, $75 por la renovación del software el martes | vendor | held | cuentia | cuentia 0.77 |
| en-r3-24 | Inkhollow brochures for the client, billable to them, $240 on September 9 | tags | office + client | client | office `not_mentioned` 0.56 |
| es-r3-24 | folletos de Letranueva para el cliente, facturables a él, ... | tags | office + client | client | office `not_mentioned` 0.56 |
| en-r3-06 | Farwander flights to Denver for the client kickoff, $712, September 8 | tags | travel + client | travel | client `not_mentioned` 0.61 |
| en-r3-31 | Beanhaven delivery, $58 on Friday | tags | held | meals | meals yes 0.54 |
| en-r3-32 | Swiftlane courier, perhaps billable to a client, $36 yesterday | tags | held | office | office yes 0.54 |
| es-r3-32 | mensajería de Pieveloz, tal vez facturable a un cliente, $36 ayer | tags | held | office | office yes 0.55 |

### Run 2: flips only

English: 1 flip, the amount of `Inkhollow brochures ...` held; coverage 0.806, exact 0.844, held ambiguous 0.625 again. Spanish: 8 flips on four rows, all fields that filled in run 2 and were held in run 1: `una silla ergonómica ...` and `comisiones de nómina de Serena del mes pasado` passed their intent, `catering de Cazuela Azul para la visita del cliente` filled its tags, and `entrega del Cafetal` filled `meals` where the tags must hold. Coverage 0.79, exact 0.882, held ambiguous 0.625, and `deje en $260 el cargo` invented again at 0.64: Spanish fails three lines in run 2.

### What the misses say

- **#57's target moved as measured on dev.** The delete, `quite` and the send held in both languages and both runs. The one leak is a change phrased as a value (`deje en $260 el cargo`), which the dev probes never tried: every dev change named a verb from the lists (`cambie`, `cambia`, `pase`).
- **English now fails on what #57 did not touch.** Its five corrections are four tags and the named pair; its three leaked ambiguous rows are the named pair (0.75, above the vendor gate of 0.5) and two tag rows that fill one tag at 0.54 against the tags gate of 0.35. Round 2's English passed held ambiguous at 0.875; the same shapes leaked here at a tags gate that dev run 3 and dev run 4 both set at 0.35.
- **The named pair leaks in both languages now,** at 0.75 and 0.77, the highest of any round. ADR 0009 left the optional pair fix out; it is the vendor field's open weakness, measured four times.
- **`billable to them` drops `office` again,** in both languages at 0.56, as in round 2.
- **The Spanish intent is unstable on a few records.** Two Spanish cards crossed the intent gate between runs (`una silla ergonómica`, `comisiones de nómina de Serena`); no English card did.

### Run logs

- Probes: `demo/eval/runs/card-<en|es>-diag-<1..4>.jsonl`; dev: `demo/eval/runs/card-<en|es>-dev-4.jsonl`
- Run 1: `demo/eval/runs/card-en-round3-1.jsonl`, `demo/eval/runs/card-es-round3-1.jsonl`
- Run 2: `demo/eval/runs/card-en-round3-2.jsonl`, `demo/eval/runs/card-es-round3-2.jsonl`

Each rescores with `scoreCardRun(await readCardRun(path), { gates })` and no call.

## Round 4: the fix, from dev runs only

Carried by [#63](https://github.com/franklinmdev/justask/issues/63). Rounds 1 to 3 above stand as recorded. Two leaks were left after round 3: the named pair, which leaked in every verdict so far, and a change phrased as a new value (`deje en $260 el cargo`). The owner decided both fixes on 2026-09-23, recorded in [ADR 0010](adr/0010-card-holds-a-named-pair.md):

1. **The demo's card holds a named pair in code**, before the field's gate: two vendors or two tags joined by a word from its language's `cardJoiners` (`or`; `o`, `u`, and `and`; `y`, `e` on the vendor alone), with no third one named. Each vendor is named by its id or its brand (`vendor()` in `demo/src/content/types.ts`), the brand also with a clear typo.
2. **The intent's `not_available` label names setting a value**: "it changes, cancels, deletes, sends or forwards one, sets one to a new value, or asks a question".

### Pair probes: false holds, and "and"

No frozen set names two vendors joined by "and", and no dev row names a pair at all, so dev alone could not measure a false hold. The owner approved ten probe records per language on 2026-09-23, before any call: `demo/eval/card-en.pair.jsonl` and `card-es.pair.jsonl`, run with `card.ts run <en|es> pair <n>` and no verdict. Rows 1 to 4 name two vendors with "and" and no other (an ambiguous row, the vendor held); rows 5 to 7 name two with "and" beside a third, the one paid; rows 8 and 9 the same with "or"; row 10 names two tags with "and" (`for the office and client binders`). They are measured, never tuned against, and no round 4 row may repeat them.

Pair run 1, of 2026-09-23 with `jev-1.13.0`, ran with the first rule, "or" alone, at round 3's gates. Its numbers decided the rule (ADR 0010):

| Probe rows | The provider alone, vendor gate 0.5 | "or" alone | Both joiners, no third item |
|---|---|---|---|
| 1 to 4, "and", no other vendor (7 answered; `en-p-01` timed out at 2 s) | 4 filled a vendor: 0.54, 0.79, 0.68, 0.53 | 4 leak | 0 leak |
| 5 to 7, "and", a third vendor paid (6) | right, 0.79 to 1.00 | right | right |
| 8 and 9, "or", a third vendor paid (4) | right, 0.90 to 1.00 | 4 held, a false hold each | right |
| 10, two tags with "and" | `office` alone, both languages | fills | fills |

**Pair run 2**, with the rule the owner chose, held all 8 pair rows (the provider would have filled 6 of them: 0.81, 0.58, 0.52; 0.79, 0.71, 0.54) and none of the 12 records, whose vendors filled right at 0.85 to 1.00. Checked with no call over every set in `demo/eval/` and the demo's suggestions, the rule holds 22 rows, all ambiguous rows or pair probes, and no record.

### Gates for round 4

Dev run 5, of 2026-09-23 with `jev-1.13.0`, the first dev run with both fixes, fixes every gate by the same rule as rounds 1 to 3. `node --conditions=justask-source demo/eval/card.ts gates 5`:

| Field | Lowest right | Highest wrong | Rule | Gate | Round 3 |
|---|---|---|---|---|---|
| intent | 0.47 | none | lowest right rounded down | **0.45** | 0.45 |
| vendor | 0.7 | none | lowest right rounded down | **0.7** | 0.5 |
| tags | 0.41 | none | lowest right rounded down | **0.4** | 0.35 |
| spent_on | 0.82 | none | lowest right rounded down | **0.8** | 0.8 |
| total | 0.98 | none | lowest right rounded down, at most 0.9 | **0.9** | 0.9 |

- **No dev card filled a wrong field**, in either language, and no nothing row filled anything. At these gates dev run 5 fills 49 of 57 English and 50 of 57 Spanish expected fields, every filled card exact, every ambiguous row held. The dev sets name no pair, so the hold changed nothing on them.
- **The vendor's gate rises to 0.7 on one row**, `los de soporte técnico arreglaron la impresora` (`tecnoria` 0.70), a paraphrase with no vendor name; dev run 4's lowest right vendor was 0.52. Rescored with no call and no verdict, rounds 1 to 3 at these gates lose one to three filled vendors each, and Spanish round 3 run 1's coverage falls from 0.734 to 0.718, above its line with less slack.
- **The intent sits where it did.** The code held 3 dev nothing rows per language, the same commands as dev run 4; among the rest `new_record` reached 0.03 English and 0.08 Spanish. The cards the intent held are ones earlier dev runs held too: `train ticket to Boston on Friday`, `the IT people fixed the printer` and `renovación de la póliza de Cobertura Plena`, all at 0.50 to 0.52 for another label.

The gates are in `demo/server/handler.ts`; `test/demo-card-eval.test.ts` pins them to dev run 5.

Run logs: `demo/eval/runs/card-<en|es>-pair-<1|2>.jsonl`, `demo/eval/runs/card-<en|es>-dev-5.jsonl`.

### Round 4 sets

Files in `demo/eval/`, drafted against every set in `demo/eval/` (probes included) and the demo's suggestions, approved by the owner in five batches on 2026-09-23 (rows 1 to 10, 11 to 20, 21 to 30, 31 to 40, 41 and 42, English beside Spanish) and frozen by checksum in `test/demo-card-eval.test.ts` in the commit before the first round 4 call. Run logs `demo/eval/runs/card-<language>-round4-<n>.jsonl`.

| File | Rows | record | ambiguous | nothing |
|---|---|---|---|---|
| `card-en.round4.jsonl` | 42 | 28 | 8 | 6 |
| `card-es.round4.jsonl` | 42 | 28 | 8 | 6 |

- **The same shape as rounds 1 to 3:** tags in all 28 records, the day in 24, the amount in 27, the vendor in 21, each of the 14 vendors at least once, 7 records with no vendor of the catalog (`a cab`, `a steakhouse`, `a warehouse club`), typos (`Tallyrut`, `Clauzewood`; `Kuentia`, `Lindeiro`), paraphrases (`the computer repair people`, `our insurance carrier`), one euro amount. Spanish row N has the same shape as English row N.
- **ambiguous:** vendor, two named pairs, one per arm of the rule: `Fixbright and Cloudberth` (`Tecnoria y Nubalia`) and `Beanhaven or Larkspur` (`Cafetal o Cazuela Azul`); this round has no vendor paraphrase. Tags `Beanhaven, $73 for the break room` and `could be billable to a client`; day `last Thursday` and `in August`; amount `1,800 pesos` and `$19 or $24`.
- **A record names a third vendor beside an "or" pair** (row 23, `Larkspur lunch for the Paydale or Sureharbor meeting`): the rule holds no pair there, and the vendor is expected filled.
- **nothing:** a question about spending, a delete, a change that sets a value, a thank-you, a question about tags, and a send. The code holds the delete in both languages (`erase the Fixbright expense`, `elimine el gasto`); no list holds the change (`set the Larkspur lunch from Monday to $140`, `deje el almuerzo de Cazuela Azul del lunes en $140`) or the send (`share Glasswell's receipt`, `compártale el recibo`), which the label alone must hold. Checked with no call: the code holds no round 4 record, only the two pair rows' vendors and the delete.
- The same checks as rounds 1 to 3 hold: no request repeats any other set, probe or suggestion, every expected day and amount is one the parser builds on Wednesday 2026-09-23, and every held one is held by the parser's reading or by two candidates.
- Kill lines, measures and procedure as round 1, at the gates from dev run 5 (above). Run 1 gives the verdict; run 2 reports flips only.

## Round 4: result

**Verdict: FAIL.** English clears every kill line; Spanish fails p95 alone. Runs of 2026-09-23 with `jev-1.13.0`, gates intent 0.45, vendor 0.7, tags 0.4, spent_on 0.8, total 0.9 (dev run 5, above), both fixes of ADR 0010, the frozen round 4 sets and the same kill lines, today fixed at Wednesday 2026-09-23. The owner ruled on 2026-09-23 that the FAIL stands as the procedure reads it, run 1 deciding, and that latency is carried by [#65](https://github.com/franklinmdev/justask/issues/65); reading the latency line away after the result would change a frozen verdict.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 0.917 (33 of 36 cards) | 0.938 (30 of 32 cards) |
| coverage | at least 0.7 | 0.831 (103 of 124 fields) | 0.71 (88 of 124 fields) |
| invented | at most 0 | 0 | 0 |
| held ambiguous | at least 0.75 | 0.875 (7 of 8) | 0.875 (7 of 8) |
| p95 | at most 1000 ms | 369 ms | **1,137 ms** |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000872 | $0.0000924 |

Per field, filled of expected: vendor 25 and 19 of 27; tags 26 of 34 English (three wrong), 19 of 34 Spanish (two wrong); day 20 and 21 of 30; amount 32 and 29 of 33. The intent passed all 36 English cards and 32 Spanish ones, and no nothing row in either language.

### The latency

| Run | Median | p95 |
|---|---|---|
| Spanish, run 1 | 696 ms | 1,137 ms |
| Spanish, run 2 | 243 ms | 395 ms |
| English, run 1 | 225 ms | 369 ms |
| English, run 2 | 773 ms | 1,396 ms |
| Spanish, round 3 run 1 | 243 ms | 334 ms |

The slowdown is the provider's, across whole runs, not the change's: the same set ran at a median near 240 ms in one run and near 700 ms in the other, and English met it in run 2. The card asks the same questions as round 3, and a call cost the same ($0.0000924 against $0.0000920). The kill line reads the provider's latency and the card's together, and a verdict run in a slow window fails on it.

### What #63 set out to fix

| Row | English | Held by | Spanish | Held by |
|---|---|---|---|---|
| 29, an "and" pair | `Fixbright and Cloudberth` | the pair (fixbright 0.55, 0.57) | `Tecnoria y Nubalia` | the pair (`not_available` 0.49, 0.51) |
| 30, an "or" pair | `Beanhaven or Larkspur` | the pair (`not_available` 0.37, 0.33) | `Cafetal o Cazuela Azul` | the pair (cazuela 0.37, 0.40) |
| 23, a third vendor beside a pair | `Larkspur lunch for the Paydale or Sureharbor meeting` | not held: larkspur 1.00 | `... con Serena o con Cobertura Plena` | not held: cazuela 0.98, 0.99 |
| 39, sets a value | `set the Larkspur lunch from Monday to $140` | `new_record` 0.00 | `deje el almuerzo de Cazuela Azul del lunes en $140` | `new_record` 0.09, 0.06 |

- **The pair held in all four runs, and this round did not need it.** Three of the four pair rows picked below every vendor gate the card has had; `Fixbright and Cloudberth` at 0.55 and 0.57 would have leaked at round 3's vendor gate of 0.5, and the new gate of 0.7 held it too. Round 4 shows the hold costs nothing: row 23, the one record it could have held, filled right in every run. The pair probes remain the evidence that it is needed.
- **Setting a value no longer reads as a new record.** Round 3's `deje en $260 el cargo` read 0.58 and 0.64; round 4's Spanish twin read 0.09 and 0.06, and every nothing row stayed at 0.09 or below. There is no run without the new label on this row, so the round shows the leak gone, not which change removed it.

### Filled and wrong

| Row | Request | Field | Expected | Got | Pick |
|---|---|---|---|---|---|
| en-r4-24 | Inkhollow posters for the client's store opening, billable to the client, $190 on September 8 | tags | office + client | client | office `not_mentioned` 0.62 |
| es-r4-24 | carteles de Letranueva para la apertura de la tienda del cliente, facturables al cliente, ... | tags | office + client | client | office `not_mentioned` 0.63 |
| en-r4-06 | Farwander train tickets to Philadelphia for the client workshop, $268, September 11 | tags | travel + client | travel | client `not_mentioned` 0.53 |
| en-r4-32 | Farwander hotel, could be billable to a client, $280 yesterday | tags | held | travel | travel yes 0.44 |
| es-r4-31 | Cafetal, $73 para la sala de descanso el martes | tags | held | meals | office `not_mentioned` 0.74 |

Every correction is a tag, as in every round before: `billable to the client` still drops `office` in both languages (rounds 2, 3 and 4), and a maybe-billable or coffee-or-machine row fills the one tag it is sure of.

### Run 2: flips only

English: 7 flips on four rows; coverage 0.798, exact 0.941, held ambiguous 1, and p95 1,396 ms in the slow window. `a paper shredder from a warehouse club` held its intent, `the computer repair people swapped a keyboard` held its tags and amount, `Cloudberth load balancer` filled `office`, and `could be billable to a client` held its tags. Spanish: 1 flip, `boletos de tren de Rumbo Claro ...` filled its vendor (0.67 in run 1, under the gate); coverage 0.718, exact 0.938, held ambiguous 0.875, p95 395 ms. Every quality line passes in both languages in run 2 as well.

### What the misses say

- **The vendor's new gate costs Spanish coverage, as dev run 5 warned.** Spanish filled 19 of 27 vendors, against 21 in round 3; rescored at round 3's vendor and tags gates, with no call and no verdict, run 1 fills 20 and covers 0.726. Coverage has 0.01 of slack in Spanish run 1.
- **The Spanish intent held four cards,** as round 3's held a few: `entrega urgente del contrato firmado con Pieveloz` (`not_available` 0.72), `redacción de un acuerdo de confidencialidad de Lindero` (`not_mentioned` 0.52), `complemento de seguro cibernético ...` (`not_mentioned` 0.65) and `hotel de Rumbo Claro, podría ser facturable a un cliente` (`not_available` 0.76). None is a nothing row read wrong; they cost coverage, not correctness.
- **Tags remain the weakest field**: 26 and 19 of 34 filled, every wrong value on the card a tag.

### Run logs

- Pair probes: `demo/eval/runs/card-<en|es>-pair-<1|2>.jsonl`; dev: `demo/eval/runs/card-<en|es>-dev-5.jsonl`
- Run 1: `demo/eval/runs/card-en-round4-1.jsonl`, `demo/eval/runs/card-es-round4-1.jsonl`
- Run 2: `demo/eval/runs/card-en-round4-2.jsonl`, `demo/eval/runs/card-es-round4-2.jsonl`

Each rescores with `scoreCardRun(await readCardRun(path), { gates })` and no call.

## Round 5: the same card, under the latency rule

Carried by [#73](https://github.com/franklinmdev/justask/issues/73). Rounds 1 to 4 above stand as recorded. Round 4 failed on Spanish p95 alone, in a slow provider window, and cannot be rescored under #65's rule (Latency, above), so the card gets a fresh round with nothing changed: the code of ADR 0009 and ADR 0010, the labels, and round 4's gates as `demo/server/handler.ts` serves them (intent 0.45, vendor 0.7, tags 0.4, spent_on 0.8, total 0.9, from dev run 5). #73 lists vendor 0.5 and tags 0.35, round 3's gates; it also says "as written in `demo/server/handler.ts`", which serves round 4's, so round 5 runs at those and nothing changes. No dev run is made.

### Round 5 sets

Files in `demo/eval/`, drafted against every set in `demo/eval/` (probes included) and the demo's suggestions and recordings, approved by the owner in five batches on 2026-09-23 (rows 1 to 10, 11 to 20, 21 to 30, 31 to 40, 41 and 42, English beside Spanish) and frozen by checksum in `test/demo-card-eval.test.ts` in the commit before the first round 5 call. Run logs `demo/eval/runs/card-<language>-round5-<n>.jsonl`.

| File | Rows | record | ambiguous | nothing |
|---|---|---|---|---|
| `card-en.round5.jsonl` | 42 | 28 | 8 | 6 |
| `card-es.round5.jsonl` | 42 | 28 | 8 | 6 |

- **The same shape as round 4:** tags in all 28 records, the day in 24, the amount in 27, the vendor in 21, each of the 14 vendors at least once, 7 records with no vendor of the catalog (`a rideshare`, `a wine bar`, `a hardware store`), typos (`Tallroot`, `Klausewood`; `Cuemtia`, `Lindiero`), paraphrases (`the IT support team`, `our commercial insurer`), one euro amount. Spanish row N has the same shape as English row N.
- **ambiguous:** vendor, two named pairs no earlier set or probe names, one per arm of the rule: `Sureharbor and Clausewood` (`Cobertura Plena y Lindero`) and `Paydale or Tallyroot` (`Serena o Cuentia`). Tags `Beanhaven order for the front desk` and `not sure if it's billable to a client`; day `last Friday` and `in July`; amount `2,200 pesos` and `$35 or $40`.
- **A record names a third vendor beside an "or" pair** (row 23, `Larkspur dinner for the Clausewood or Paydale kickoff`): the rule holds no pair there, and the vendor is expected filled.
- **nothing:** a question about spending, a delete, a change that sets a value, a thank-you, a question about tags, and a send. The code holds the delete in both languages (`remove the Tallyroot expense`, `quite el gasto de Cuentia`); no list holds the change (`the Brightmop charge on Thursday should be $210`, `el cargo de Brisamar del jueves debería ser $210`) or the send (`text the Cloudberth receipt to our accountant`, `pásele el recibo de Nubalia a nuestro contador`), which the label alone must hold. Checked with no call: the code holds no round 5 record, only the two pair rows' vendors and the delete.
- The same checks as rounds 1 to 4 hold: no request repeats any other set, probe, suggestion or recording, every expected day and amount is one the parser builds on Wednesday 2026-09-23, and every held one is held by the parser's reading or by two candidates.
- **One approved exception, found after the runs:** `es-r5-40`, `perfecto, gracias`, is also the filter's round 2 row `es-r2-n42`. The two sets were frozen seconds apart from parallel sessions (#73, #68), neither able to see the other, and the row filled nothing in either flow in either run. The owner ruled on 2026-09-23 that both sets and verdicts stand; the repeat check in `test/demo-card-eval.test.ts` allows this one row by id.
- Kill lines, measures and procedure as round 1, under the latency rule: run 1 gives the verdict, a failing p95 in a slow window with every quality line passing reads `LATENCY PENDING` and is measured again in a normal window; run 2 reports flips only.

## Round 5: result

**Verdict: FAIL.** English clears every kill line; Spanish fails coverage alone, 0.694 (86 of 124 fields) against 0.7, one field short. Runs of 2026-09-23 with `jev-1.13.0`, round 4's card unchanged (gates intent 0.45, vendor 0.7, tags 0.4, spent_on 0.8, total 0.9), the frozen round 5 sets, the same kill lines and `PROBE_BASELINE_MS` 235, today fixed at Wednesday 2026-09-23. Every run's probes were normal, so no line is pending: the FAIL is a quality line, not latency.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 0.97 (32 of 33 cards) | 0.938 (30 of 32 cards) |
| coverage | at least 0.7 | 0.774 (96 of 124 fields) | **0.694** (86 of 124 fields) |
| invented | at most 0 | 0 | 0 |
| held ambiguous | at least 0.75 | 1 (8 of 8) | 0.875 (7 of 8) |
| p95 | at most 1000 ms | 338 ms | 390 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000873 | $0.0000924 |
| probes, median against 235 ms | | 259 ms, normal | 375 ms, normal |

Per field, filled of expected: vendor 21 and 20 of 27; tags 23 of 34 English (one wrong), 15 of 34 Spanish (one wrong, and one more on an ambiguous row that must hold its tags); day 21 of 30 in both; amount 31 and 30 of 33. The intent passed 33 English and 32 Spanish cards, and no nothing row in either language.

### Filled and wrong

| Row | Request | Field | Expected | Got | Pick |
|---|---|---|---|---|---|
| en-r5-24 | Inkhollow product catalogs for the client's sales team, billable to the client, $260 on September 15 | tags | office + client | client | office `not_mentioned` 0.77 |
| es-r5-24 | catálogos de productos de Letranueva para el equipo de ventas del cliente, facturables al cliente, ... | tags | office + client | client | office `not_mentioned` 0.97 |
| es-r5-31 | pedido del Cafetal para la recepción, $61 el viernes | tags | held | meals | meals yes 0.60 |

Every correction is a tag again, as in rounds 1 to 4: `billable to the client` drops `office` in both languages for the fourth round running.

### What the round measured

| Row | English | Spanish |
|---|---|---|
| 29, an "and" pair | `Sureharbor and Clausewood`: held by the pair | `Cobertura Plena y Lindero`: held by the pair |
| 30, an "or" pair | `Paydale or Tallyroot`: held by the pair | `Serena o Cuentia`: held by the pair |
| 23, a third vendor beside a pair | larkspur, filled right | cazuela, filled right |
| 38, a delete | held by the code; `new_record` 0.00 | held by the code; `new_record` 0.31, 0.38 |
| 39, sets a value, no listed word | `new_record` 0.10, 0.11 | `new_record` 0.06, 0.06 |
| 42, a send, no listed word | `new_record` 0.00, 0.00 | `new_record` 0.02, 0.01 |

The pair hold and both labels held in all four runs, with no false hold: every nothing row stayed at 0.38 or below, and the pair rule held no record.

### The warm-up

The open question on #53: does a warm-up call cut off at 2 s still warm the provider? **This round cannot answer it: no warm-up call reached the cutoff.** No row timed out either, in any run, including the first rows after the warm-up.

| Run | Warm-up (discarded) | Measured probes before | First three rows |
|---|---|---|---|
| English 1 | 600, 627, 254 | 300, 194, 296 | 269, 264, 304 |
| English 2 | 535, 553, 166 | 223, 285, 198 | 285, 247, 278 |
| Spanish 1 | 565, 650, 209 | 444, 363, 387 | 821, 360, 379 |
| Spanish 2 | 857, 1,352, 181 | 297, 237, 260 | 285, 219, 311 |

The first two warm-up calls of every run took 535 to 1,352 ms and the third 166 to 254 ms; the rows after them ran near 250 ms, the slowest first row at 821 ms (`es-r5-01`), well under the 2 s cutoff. The warm-up took most of the start-up cost. The one case of a cut-off warm-up remains search dev run 5 (Latency, above), where all three warm-up calls timed out and no row did.

### Run 2: flips only

English: no flips; coverage 0.774, exact 0.97, held ambiguous 1, p95 283 ms, probes 230 ms, normal. Spanish: 3 flips, coverage 0.694 again: `vuelos de Rumbo Claro ... para la presentación al cliente` lost its `client` tag and so became a correction, `el soporte técnico actualizó nuestras laptops` held its vendor, and `notas adhesivas y clips de Tintaverde` filled `office`. Exact 0.906, held ambiguous 0.875, p95 326 ms, probes 266 ms, normal. Spanish fails coverage alone in run 2 as well.

### What the misses say

- **Spanish `office` is what costs the line.** Spanish filled 15 of 34 expected tags, against 23 English and 19 in round 4. `office` answered `not_mentioned` on a courier (0.94), W-2 processing, a legal consultation and an accounting software add-on (0.88 each), a label maker, offsite backups, a lease amendment and a payroll-tax filing (0.50 to 0.66): the services the round 2 description names, read narrowly again. Every other Spanish field filled within one or two of English.
- **The intent held four Spanish cards and three English ones**, none a nothing row read wrong: the insurance rider with no amount (`not_mentioned` 0.66 and 0.70), the maybe-billable car service (`not_available` 0.66 and 0.97), `$35 or $40` (`not_mentioned` 0.47 and 0.41), and `revisión de contratos laborales de Lindero` (`not_available` 0.46), which its English twin passed.
- **Latency is not the issue this round.** Four normal windows, p95 283 to 390 ms, medians near the history: round 4's slow window did not recur.
- Nothing about the card changed between round 4 and round 5, so round 5 measures the provider on fresh rows; round 4's Spanish coverage was 0.71, 0.01 above its line, and this round's is 0.006 below it.

### Run logs

- Run 1: `demo/eval/runs/card-en-round5-1.jsonl`, `demo/eval/runs/card-es-round5-1.jsonl`
- Run 2: `demo/eval/runs/card-en-round5-2.jsonl`, `demo/eval/runs/card-es-round5-2.jsonl`

Each rescores with `scoreCardRun(await readCardRun(path), { gates })` and no call.

## Office tag diagnosis (#77)

Carried by [#77](https://github.com/franklinmdev/justask/issues/77). Rounds 1 to 5 above stand as recorded. Round 5 failed on Spanish coverage alone, and its Spanish `office` tag filled 6 of 23 cards that expect it in run 1, against 15 English (#77 counts the whole tags field, 15 against 23 of 34; this section counts the office tag alone), answering `not_mentioned` on couriers, payroll, legal work and backups. Two hypotheses, unverified before these runs:

- **Wording:** the label's phrasing or length makes the provider skip it in Spanish.
- **Inference:** the request names a service, never the tag, and the provider reads Spanish too literally to infer it, so no label wording would fix it.

### Probe sets

`demo/eval/card-es.office.jsonl` and `demo/eval/card-en.office.jsonl`, 20 records per language, every one expecting `office`, run with `card.ts run <en|es> office <n> <label>` and no verdict. #77 named `diag`, #57's set; these are a set of their own, so the diag set and its logs stay as #57 froze them, and the label is the run's fourth argument. They take the round 5 misses' services (courier, payroll, legal, insurance, software, hosting, HR, printing, repairs, equipment), never their text. Approved by the owner in two batches on 2026-09-23 and frozen by checksum in `test/demo-card-eval.test.ts` in the commit before the first call; no later round may repeat them.

- **Rows 1 to 10 name the service by a word the label already lists** (`mensajería de Pieveloz`, `nómina de septiembre`, `asesoría legal de Lindero`; `Swiftlane courier`, `Paydale September payroll run`).
- **Rows 11 to 20 name the same services by what was done, with no word of the label** (`entrega de Pieveloz de unos documentos`, `declaración de retenciones`, `Lindero redactó los estatutos`; `drop-off of documents`, `withholding return`, `drafted the company bylaws`). Row N + 10 shares row N's vendor and service. Row 16 is the backups row (`copias de seguridad de la base de datos`, `database backups`); row 20 names no vendor of the catalog.
- Checked with no call: the parser builds every day and amount, no row repeats any set, suggestion or recording, and the code's command and pair holds hold none of them.

### Labels

Each run reads the office tag by one label (`OFFICE_LABELS` in `demo/eval/office.ts`), everything else as the demo serves it at round 4's gates (tags 0.4). The demo serves `current` alone.

| Label | Spanish | What changes |
|---|---|---|
| `current` | `oficina: lo que mantiene el negocio en marcha, como artículos, equipos, software, hosting, reparaciones, limpieza y ventanas, imprenta, mensajería, nómina y recursos humanos, asesoría legal y seguros` | nothing, round 2's label |
| `backups` | the same with `respaldos` after `hosting` (English `backups`) | one service added |
| `short` | `oficina: lo que mantiene el negocio en marcha` | the list dropped |
| `rest` | `oficina: cualquier gasto del negocio que no sea comida ni viajes` (English `office: any business expense that is not meals or travel`) | the tag named by what it is not; added after `short`'s runs showed the list is what fills the tag |

### Result

Runs of 2026-09-23 with `jev-1.13.0`, two per label and language, today fixed at Wednesday 2026-09-23. Every run's probes were normal (medians 208 to 309 ms against 235), and no row errored. The office tag's own question is read here, whatever the intent did: `yes` wins at or above the tags gate of 0.4.

| Office filled, runs 1 and 2 | Spanish, rows 1 to 10 | Spanish, rows 11 to 20 | English, rows 1 to 10 | English, rows 11 to 20 |
|---|---|---|---|---|
| `current` | 9, 9 | 3, 4 | 10, 10 | 4, 5 |
| `backups` | 9, 9 | 3, 2 | 9, 9 | 4, 4 |
| `short` | 0, 0 | 0, 0 | 0, 0 | 0, 0 |
| `rest` | 0, 0 | 0, 0 | 0, 0 | 0, 0 |

`not_mentioned` won, of 20 rows, runs 1 and 2: `current` 7 and 7 Spanish, 5 and 4 English; `backups` 7 and 6, 7 and 7; `short` and `rest` 20 in every run. `not_available` won no row in any run. The other unfilled rows are `yes` below the gate: `es-o-16` under Spanish `current` run 1 (0.38), `en-o-20` under English `current` (0.39, 0.38), `es-o-18` under Spanish `backups` (0.39, 0.35), and `es-o-10` and `es-o-14` under Spanish `backups` run 2 (0.38, and 0.4 as the provider's float 0.39999..., held as the card holds it: a pick fills only at or above its gate). `yes`'s mean probability under `current`: Spanish 0.59 and 0.60 on rows 1 to 10, 0.28 and 0.29 on rows 11 to 20; English 0.67 and 0.68, 0.34 and 0.34. Under `short` it was 0.01 or less on every row, and under `rest` 0.38 or less.

Per row under `current`, `yes` in runs 1 and 2:

| Row | Spanish | `yes` | English | `yes` |
|---|---|---|---|---|
| 01 | mensajería de Pieveloz para llevar los cheques al banco, $23 el lunes | 0.62, 0.63 | Swiftlane courier to take the checks to the bank, $23 on Monday | 0.63, 0.64 |
| 02 | nómina de septiembre procesada por Serena, $140 el 15 de septiembre | 0.54, 0.55 | Paydale September payroll run, $140 on September 15 | 0.74, 0.70 |
| 03 | asesoría legal de Lindero por una disputa con un proveedor, $300 el 10 de septiembre | 0.73, 0.76 | Clausewood legal advice on a supplier dispute, $300 on September 10 | 0.81, 0.78 |
| 04 | seguro de responsabilidad civil de Cobertura Plena, $410 el martes | 0.52, 0.51 | Sureharbor liability insurance, $410 on Tuesday | 0.75, 0.71 |
| 05 | software de facturación de Cuentia, $45 el viernes | 0.44, 0.47 | Tallyroot invoicing software, $45 on Friday | 0.54, 0.56 |
| 06 | hosting del correo de Nubalia, $27 ayer | 0.75, 0.80 | Cloudberth email hosting, $27 yesterday | 0.64, 0.69 |
| 07 | recursos humanos de Serena para contratar a un asistente, $220 el 8 de septiembre | 0.77, 0.74 | Paydale HR help hiring an assistant, $220 on September 8 | 0.82, 0.84 |
| 08 | imprenta de Letranueva, sobres con el logo, $66 el lunes | 0.59, 0.63 | Inkhollow printing of logo envelopes, $66 on Monday | 0.65, 0.67 |
| 09 | reparación del proyector con Tecnoria, $85 el jueves | 0.63, 0.58 | Fixbright projector repair, $85 on Thursday | 0.65, 0.68 |
| 10 | equipos de Tintaverde: una laminadora, $38 ayer | 0.32, 0.31 | Papergrove equipment: a laminator, $38 yesterday | 0.45, 0.50 |
| 11 | entrega de Pieveloz de unos documentos en la notaría, $21 el martes | 0.30, 0.40 | Swiftlane drop-off of documents at the notary, $21 on Tuesday | 0.39, 0.41 |
| 12 | declaración de retenciones de agosto de Serena, $95 el 11 de septiembre | 0.02, 0.03 | Paydale August withholding return, $95 on September 11 | 0.08, 0.07 |
| 13 | Lindero redactó los estatutos de la empresa, $520 el 2 de septiembre | 0.12, 0.12 | Clausewood drafted the company bylaws, $520 on September 2 | 0.44, 0.45 |
| 14 | póliza contra robo de Cobertura Plena, $260 el lunes | 0.45, 0.44 | Sureharbor theft policy, $260 on Monday | 0.13, 0.13 |
| 15 | licencias adicionales de Cuentia para dos usuarios, $58 el viernes | 0.52, 0.58 | Tallyroot extra seats for two users, $58 on Friday | 0.11, 0.12 |
| 16 | copias de seguridad de la base de datos con Nubalia, $14 ayer | 0.38, 0.28 | Cloudberth database backups, $14 yesterday | 0.42, 0.47 |
| 17 | verificación de antecedentes de un candidato con Serena, $48 el lunes | 0.01, 0.01 | Paydale background check on a candidate, $48 on Monday | 0.32, 0.27 |
| 18 | calcomanías con el logo para la vitrina de Letranueva, $72 el martes | 0.45, 0.52 | Inkhollow logo decals for the shop window, $72 on Tuesday | 0.58, 0.60 |
| 19 | Tecnoria cambió la batería de una laptop, $110 el jueves | 0.36, 0.34 | Fixbright swapped a laptop battery, $110 on Thursday | 0.54, 0.49 |
| 20 | un organizador de cables de una ferretería, $17 el viernes | 0.14, 0.17 | a cable organizer from a hardware store, $17 on Friday | 0.39, 0.38 |

`backups` moved row 16 alone: Spanish 0.68 and 0.64, English 0.73 and 0.74, though the Spanish row says `copias de seguridad` and the label `respaldos`. Every other row stayed within 0.1 of `current`.

### Diagnosis

- **Neither hypothesis as written. The tag fills on what its label lists, in both languages.** A service the list names fills 9 of 10 Spanish and 10 of 10 English rows; the same service named by what was done fills 2 to 4 Spanish and 4 to 5 English. The definition carries nothing on its own: `short` and `rest` fill no row in either language, the first at 0.01 or less.
- **Wording, refuted.** The label's length is not what makes it skip: dropping the list removes every fill, in English too. No rewording of the definition was found that fills anything.
- **Inference, supported in part.** The provider does not infer `office` from a service the label does not name, and answers `not_mentioned`, as #77 guessed. But it is not Spanish alone, and wording does fix what it names: `backups` filled its row in both languages, a Spanish synonym included. So the list fixes what it lists and nothing else.
- **The Spanish gap is smaller here than in round 5.** On these rows Spanish trails English by about one fill per ten in each group, and the gap runs both ways row by row (`póliza` 0.45 against `policy` 0.13, `licencias` 0.52 against `seats` 0.11; `estatutos` 0.12 against `bylaws` 0.44). Round 5's Spanish misses name few listed words (`entrega`, `constancias`, `consulta`, `enmienda del contrato`), which reads as the likelier cause of its 6 against 15 than a weaker reading of the same words; these runs cannot separate the two on round 5's rows.

### Proposed fix, not landed

The owner decides. Two ways, each with its cost on a round 6:

1. **Fill `office` from the vendor, in code (recommended).** Eleven of the fourteen vendors in each language sell office services alone (`vendor()`'s `supplies` already says what); a card whose vendor fills with one of them gets `office` too, whatever the tag's pick. In Spanish round 5 run 1 the vendor filled with one of them on 19 cards, 17 of them expecting `office`; the other two were nothing rows the intent held. Rescored with no call over every saved verdict log (rounds 1 to 5, runs 1 and 2, `office` set to `yes` wherever the vendor filled with an office vendor), round 5 moves:

   | Round 5 | Coverage | Exact |
   |---|---|---|
   | Spanish, run 1 | 0.694 to 0.774 | 0.938 to 0.969 |
   | Spanish, run 2 | 0.694 to 0.758 | 0.906 to 0.938 |
   | English | 0.774 to 0.815 | 0.97 to 1 |

   No run's exact or held ambiguous fell in any round, and invented cannot move, since the intent gates the card. Its cost: a record at an office vendor that bought something else would get `office` too (a lunch with the cleaning crew, named by vendor); no frozen set has one, so that cost is unmeasured. The coffee vendors (`beanhaven`, `cafetal`) sell beans and machine rental, `meals` or `office`, and stay out. It needs an ADR, like the command and pair holds.
2. **Extend the label's list.** Each service added fills the rows that name it, as `backups` did (+0.3 on its row), and nothing else. On a round 6 of fresh rows it gains only where a row names a word added, so its effect cannot be priced from these runs, and tuning the list toward rounds 1 to 5's words fits the past sets, not the next.

No gate, kill line, label or code the demo serves changed.

### Decision

The owner chose fix 1 on 2026-09-23, with one change: **the card adds `office` from an office vendor only when the tags field answered `not_mentioned` or came back empty, never over a filled or held tag.** As #79 words it, a tag the provider filled, or one held below its gate, is left as it is: the rule fills gaps and never contradicts the provider. The fix and a fresh round 6 to judge it are carried by [#79](https://github.com/franklinmdev/justask/issues/79). The rescore above forced `office` on every card at an office vendor, so it is an upper bound for the chosen rule, not its measure; #79's runs give that.

### Run logs

`demo/eval/runs/card-<en|es>-office-<current|backups|short|rest>-<1|2>.jsonl`. `node --conditions=justask-source demo/eval/card.ts office <en|es> <n> <label>` prints a run's office picks with no call.

## False-fill probes (#79)

Carried by [#79](https://github.com/franklinmdev/justask/issues/79), before round 6. The card fills `office` from a vendor that sells office services alone, where the tags left a gap ([ADR 0012](adr/0012-card-fills-an-implied-value-in-a-gap.md)). Its cost is a record at such a vendor that bought something else, which no frozen set has, so it was measured first.

### Probe sets

`demo/eval/card-en.notoffice.jsonl` and `card-es.notoffice.jsonl`, 20 records per language, run with `card.ts run <en|es> notoffice <n>` and no verdict. Approved by the owner in two batches on 2026-09-23 (rows 1 to 10, 11 to 20, English beside Spanish) and frozen by checksum in `test/demo-card-eval.test.ts` in the commit before the first call; no later round may repeat them.

- **Each names one of the eleven office-only vendors, paid for something that is not office**, and expects that vendor, the day and the amount. Every vendor at least once, Glasswell (Relucir) twice.
- **7 meals** (`Brightmop crew lunch after the deep clean`, `pizza para el equipo de Serena durante la auditoría de nómina`), 2 of them with a client (`Clausewood's catered lunch at the client signing`); **5 travel** (`Swiftlane driver's hotel on the overnight run to Albany`); **8 where no tag fits**, which expect no tags: a staff gift (`birthday gift for our receptionist from Inkhollow`), a donation, raffle and gala tickets, team hoodies, charity race fees, a farewell gift card.
- Checked with no call: the parser builds every day and amount, no row repeats any set, suggestion or recording, and the code's command and pair holds hold none of them.

### Result

Runs of 2026-09-23 with `jev-1.13.0`, the card as the demo serves it with the rule (gates intent 0.45, vendor 0.7, tags 0.4, spent_on 0.8, total 0.9), today fixed at Wednesday 2026-09-23. Every probe window was normal (medians 216 to 257 ms against 235), and no row errored. `node --conditions=justask-source demo/eval/card.ts gaps <en|es> <n>` prints each row's tags and gap with no call.

| Of 20 rows, runs 1 and 2 | English | Spanish |
|---|---|---|
| The tags left a gap | 8, 8 | 8, 8 |
| Of those, rows no tag fits | 8, 8 | 8, 8 |
| The vendor filled, so the rule added office: a false fill | 6, 6 | 4, 4 |
| A tag filled on the 12 rows where one fits | 12, 12 | 12, 12 |

- **The provider leaves the gap exactly on the 8 rows no tag fits**, in both languages and both runs: `not_mentioned` on every tag, office at 0.81 to 1.00. On the 12 rows that name a meal, a trip or a client it filled that tag (`yes` at 0.53 to 0.98), and the rule stayed out.
- **The false fills are those rows where the vendor filled**: English `en-v-02`, `04`, `09`, `15`, `17`, `19`; Spanish `es-v-04`, `15`, `17`, `19`, the same rows in both runs.
- **The vendor's gate is the rule's guard here.** The vendor filled on 6 English and 5 Spanish rows of 20; the provider rarely read the office vendor as the one paid for a lunch or a trip, and held it (`not_mentioned` up to 0.95 on `coffee and donuts for the Fixbright technicians`).

### Run logs

`demo/eval/runs/card-<en|es>-notoffice-<1|2>.jsonl`.

## Round 6: the office tag from the vendor

Carried by [#79](https://github.com/franklinmdev/justask/issues/79). Rounds 1 to 5 above stand as recorded. The one change from round 5 is the vendor's office fill of ADR 0012: the eleven office-only vendors imply the `office` tag, filled only where the tags left a gap (every tag `not_mentioned`, or office `yes` below the gate). Its cost was measured first, on the false-fill probes above. The gates are round 4's as `demo/server/handler.ts` serves them (intent 0.45, vendor 0.7, tags 0.4, spent_on 0.8, total 0.9), with the same labels, kill lines, and `PROBE_BASELINE_MS` of 235. No dev run is made: the rule asks no question, so every pick reads as before, and `fixGate` reads the tags' own picks, never the implied value.

### Round 6 sets

Files in `demo/eval/`, drafted against every set in `demo/eval/` (probes included) and the demo's suggestions and recordings, approved by the owner in five batches on 2026-09-23 (rows 1 to 10, 11 to 20, 21 to 30, 31 to 40, 41 and 42, English beside Spanish) and frozen by checksum in `test/demo-card-eval.test.ts` in the commit before the first round 6 call. Run logs `demo/eval/runs/card-<language>-round6-<n>.jsonl`.

| File | Rows | record | ambiguous | nothing |
|---|---|---|---|---|
| `card-en.round6.jsonl` | 42 | 28 | 8 | 6 |
| `card-es.round6.jsonl` | 42 | 28 | 8 | 6 |

- **The same shape as rounds 4 and 5, row for row:** tags in all 28 records, the day in 24, the amount in 27, the vendor in 21, each of the 14 vendors at least once, 7 records with no vendor of the catalog (`a ramen shop`, `a furniture outlet`, `the port authority`), typos (`Tallyroo`, `Clausewud`; `Cuenttia`, `Lindeero`), paraphrases (`the tech support crew`, `the company that insures us`), one euro amount. Spanish row N has the same shape as English row N.
- **ambiguous:** vendor, two named pairs no earlier set or probe names, one per arm of the rule: `Swiftlane and Inkhollow` (`Pieveloz y Letranueva`) and `Glasswell or Fixbright` (`Relucir o Tecnoria`). Tags `Beanhaven restock for the kitchenette` and `may end up billable to a client`; day `last Monday` and `in June`; amount `1,600 pesos` and `$22 or $25`.
- **A record names a third vendor beside an "or" pair** (row 23, `Larkspur lunch for the Fixbright or Swiftlane walkthrough`), and row 24 is `billable to the client` again, the shape that dropped `office` in rounds 2 to 5; the rule cannot reach it, since `client` fills and the tags leave no gap.
- **nothing:** a question about spending, a delete, a change that sets a value, a thank-you, a question about tags, and a send. The code holds the delete in both languages (`void that Inkhollow expense`, `anule ese gasto de Letranueva`); no list holds the change (`Monday's Papergrove receipt was really $44`) or the send (`pass Larkspur's receipt along to the bookkeeper`, `hágale llegar el recibo de Cazuela Azul a la contadora`). Checked with no call: the code holds no round 6 record, only the two pair rows' vendors and the delete.
- The same checks as rounds 1 to 5 hold: no request repeats any other set, probe, suggestion or recording, every expected day and amount is one the parser builds on Wednesday 2026-09-23, and every held one is held by the parser's reading or by two candidates.
- Kill lines, measures and procedure as round 5, under the latency rule. Run 1 gives the verdict; run 2 reports flips only.

## Round 6: result

**Verdict: FAIL.** Spanish clears every kill line; English fails exact alone, 0.879 (29 of 33 cards) against 0.9, in both runs. Runs of 2026-09-23 with `jev-1.13.0`, round 5's card plus ADR 0012 (gates intent 0.45, vendor 0.7, tags 0.4, spent_on 0.8, total 0.9), the frozen round 6 sets, the same kill lines, and `PROBE_BASELINE_MS` of 235, today fixed at Wednesday 2026-09-23. Every run's probes were normal, so no line is pending.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | **0.879** (29 of 33 cards) | 0.969 (31 of 32 cards) |
| coverage | at least 0.7 | 0.79 (98 of 124 fields) | 0.766 (95 of 124 fields) |
| invented | at most 0 | 0 | 0 |
| held ambiguous | at least 0.75 | 0.75 (6 of 8) | 0.875 (7 of 8) |
| p95 | at most 1000 ms | 402 ms | 365 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000870 | $0.0000922 |
| probes, median against 235 ms | | 252 ms, normal | 302 ms, normal |

Per field, filled of expected: vendor 21 and 20 of 27; tags 26 of 34 English (four wrong, two of them on ambiguous rows that must hold their tags), 24 of 34 Spanish (one wrong, on an ambiguous row); day 20 and 21 of 30; amount 31 and 30 of 33. The intent passed 33 English and 32 Spanish cards, and no nothing row in either language.

### What the vendor filled

Rescored with no call, with the logged implications removed: the rule asks no question, so the same answers read as the card without it.

| Office from the vendor | Tags filled by it | Coverage with | Coverage without | Exact, held ambiguous |
|---|---|---|---|---|
| English run 1 | 1 (`en-r6-33`) | 0.79 | 0.782 | unchanged |
| English run 2 | 2 (`en-r6-02`, `33`) | 0.798 | 0.782 | unchanged |
| Spanish run 1 | 8 | 0.766 | 0.702 | unchanged |
| Spanish run 2 | 8 | 0.742 | 0.677 | unchanged |

- **Every tag the vendor filled was right.** The same eight Spanish rows in both runs: an SSL certificate, name badges, a bank reconciliation add-on, a monitor pickup, a direct deposit setup, a shareholder agreement review, a parcel of brochures, and incorporation paperwork (`es-r6-02`, `05`, `07`, `09`, `12`, `25`, `27`, `34`). The provider answered `not_mentioned` on office there, as #77 found.
- **Spanish passes coverage because of it.** Without the rule, Spanish run 1 covers 0.702, with 0.002 of slack, and run 2 would fail at 0.677. English's provider already filled office on most of its office rows, so the rule added one or two.
- **The false fill the probes priced did not occur here:** no round 6 record at an office vendor bought something no tag fits.

### Filled and wrong

| Row | Request | Field | Expected | Got | Pick |
|---|---|---|---|---|---|
| en-r6-24 | Inkhollow event programs for the client's gala, billable to the client, $175 on September 12 | tags | office + client | client | office `not_mentioned` 0.78 |
| en-r6-06 | Farwander hotel in Chicago for the client workshop, $362, September 8 | tags | travel + client | travel | client `not_mentioned` 0.55 |
| en-r6-31 | Beanhaven restock for the kitchenette, $57 on Friday | tags | held | meals + office | office yes 0.54 |
| en-r6-32 | Farwander shuttle to the expo, which may end up billable to a client, $64 yesterday | tags | held | travel | travel yes 0.40 |
| es-r6-31 | reabastecimiento del Cafetal para la cocineta, $57 el viernes | tags | held | meals | meals yes 0.87 |

Every correction is a tag the provider picked, as in every round before. None is the rule's: Beanhaven and Cafetal imply nothing, and on row 24 `client` fills, so no gap is left.

### Run 2: flips only

English: 1 flip, `Tallyroo bank reconciliation add-on` filled its day. Coverage 0.798, exact 0.879 again with the same four corrections, held ambiguous 0.75, p95 417 ms, probes 229 ms, normal. Spanish: 3 flips, all fields held in run 2 that filled in run 1: `complemento de conciliación bancaria de Cuenttia` and `lavado del toldo con Relucir` their days, and `estacionamiento del aeropuerto de Rumbo Claro` its vendor. Coverage 0.742, exact 0.969, held ambiguous 0.875, p95 424 ms, probes 213 ms, normal. Spanish passes every line in run 2 as well.

### What the misses say

- **The rule did what #77 predicted, in Spanish, and cost nothing.** It filled 8 of Spanish's 24 tags in each run and none wrong; exact, invented and held ambiguous moved by nothing.
- **English fails on the provider's tags, not the rule.** Four corrections of 33 cards: `billable to the client` dropped `office` for the fifth round running, `for the client workshop` dropped `client`, and both tag rows that must hold leaked: coffee or beans filled `meals` and `office`, and `may end up billable` filled `travel` exactly at the gate of 0.4. Round 5's English had one correction; these rows are fresh, and the shapes are rounds 2 to 5's.
- **English held ambiguous sits on its line,** 0.75 in both runs, the two leaks both tags.
- **The Spanish intent held four cards** (a non-compete drafting at `not_mentioned` 0.65, fire coverage with no amount at 0.62, and two picks just under the gate, 0.40 and 0.39), none a nothing row read wrong.

### Next

The owner ruled on 2026-09-23, after this result, that card measurement moves next to [#86](https://github.com/franklinmdev/justask/issues/86), with no round 7 before it. Round 6's FAIL stands as recorded. The decisions are in Before round 7, below.

### Run logs

- False-fill probes: `demo/eval/runs/card-<en|es>-notoffice-<1|2>.jsonl`
- Run 1: `demo/eval/runs/card-en-round6-1.jsonl`, `demo/eval/runs/card-es-round6-1.jsonl`
- Run 2: `demo/eval/runs/card-en-round6-2.jsonl`, `demo/eval/runs/card-es-round6-2.jsonl`

Each rescores with `scoreCardRun(await readCardRun(path), { gates })` and no call; the scorer fills the vendor's office from the logged implications at any gate.

## Before round 7: tags, set size and shapes (#86)

Carried by [#86](https://github.com/franklinmdev/justask/issues/86), decided with no provider call. Rounds 1 to 6 above stand as recorded, and none is re-scored against what follows: this section decides the expected values of rows not yet written, and nothing else. No kill line, measure, gate, label or code the demo serves changes. Round 7 is carried by [#88](https://github.com/franklinmdev/justask/issues/88) and follows this procedure. The owner approved the four disputed tag rulings and the set size of 168 rows per language on 2026-09-23, as written below; #88 builds round 7 to the shape cap as well.

Rounds 2 to 6 all failed, on different lines, and round 6 failed on one line by one card: English exact at 0.879 (29 of 33 cards), where 30 of 33 would have passed. Three things made one row decide a verdict: rows whose expected tags the written rule did not settle, 33 cards per language where one card moves exact by 0.03, and the same row shapes carried at the same positions from round to round.

### Tag cover

The rule a round 7 row's expected tags follow. A tag covers what it lists and nothing it does not; a record expects every tag whose cover it meets, and no other. No cover contradicts the labels the demo serves since round 2 (Round 2: Tag descriptions, above): each names more cases than its label lists (travel's label has no rideshares, buses or tolls), and the disputed cases below turn on the office and client labels' own words, what keeps the business running and "for certain, not when it says maybe". Where the sets drifted, it was from those words. Whether a label should list more is the card's question, not this one: no label changes here.

- **meals: anything eaten or drunk**, by staff or with a client: lunch, dinner, coffee, drinks, snacks, catering, a cake, and pantry stock (coffee beans, snacks, bottled water). Not the machine that makes it: a coffee machine, its rental and its servicing are `office`.
- **travel: getting somewhere and staying there**: flights, hotels, taxis and rideshares, trains, buses, and parking or tolls on the way. A meal on a trip is `meals` alone: what the money bought decides, not where.
- **office: what the business buys to run itself**: supplies, equipment, software, hosting, repairs, cleaning, printing, couriers, payroll and HR, legal work and insurance, whatever the words for them. Not food and drink, not trips, and **not goods or services bought for a client and billed to them**, which are `client` alone (below).
- **client: a client pays or a client shares it, said for certain.** Billable to a client, billed back, charged to the client's account; or a meal, a ride or an event with a client present. Not a purpose alone (`for the client workshop`, `for the client's launch`), not a maybe (`might be`, `possibly`, `may end up billable`), and not a client named as a place.
- **No tag** where no cover is met: a staff gift, a donation, event tickets, apparel, as the false-fill probes already expect.

`meals` and `travel` say what was bought, so a billable client dinner is `meals` + `client` and a billable flight `travel` + `client`. `office` says the business used it itself, so printing billed through to a client is `client` alone. The asymmetry is deliberate: it is how a person tags a cost they pass on.

**Rounds 2 to 6's disputed cases, decided:**

| Case | Rows | Frozen expectation | Under the cover | Why |
|---|---|---|---|---|
| Printing, a courier or a server upgrade for a client, billable to the client | row 24 in rounds 2 to 6; round 1's `en-r-24` and `en-r-27` | `office` + `client` | `client` | Billed through, not used by the business to run itself. |
| Travel for a client event, nothing said about billing | row 6 in rounds 1 to 6 (`for the client visit`, `workshop`, `kickoff`, `pitch`); English dropped `client` in rounds 3, 4 and 6 | `travel` + `client` | `travel` | A purpose alone. Round 1's own rule already read "billable to or spent with a client". |
| A trip or a service that may be billable | row 32 in rounds 1 to 6 | tags held | the certain tags alone (`meals`, `travel` or `office`, whichever was bought); not an ambiguous row | The client label says "not when it says maybe" since round 2, so the certain tag is what the words say and the row holds nothing. |
| Beanhaven or Cafetal, nothing named that was bought | row 31 (`Beanhaven, $45`, `Beanhaven order`, `Beanhaven delivery`) | tags held | tags held | The vendor sells beans (`meals`) and machine rental (`office`); nothing in the words chooses. |
| Beanhaven or Cafetal, a place named | row 31 in rounds 4 and 5 (`for the break room`, `para la recepción`) | tags held | tags held | A place is not what was bought: beans and a machine both sit in a break room. |
| Beanhaven or Cafetal, a restock | row 31 in round 6 (`restock for the kitchenette`) | tags held | `meals` | A restock is of what runs out, the beans; a rental is not restocked. |

**What this does not show.** On the first three cases the cover now agrees with most of what the provider answered in rounds 2 to 6, and on the restock with its Spanish answer (English filled `meals` + `office`). Not with all of it: Spanish filled `client` on row 6 in rounds 3, 4 and 6 (0.60, 0.50, 0.65), and round 1's maybe row filled `client` in both languages (0.74, 0.63). The cover was chosen for what a person writes, and each reason above stands without the provider; but round 7 cannot read those shapes as the card improving, since the rows changed and the card did not. Frozen rounds keep their expectations and their verdicts.

**The two tags-ambiguous shapes for round 7.** With the maybe row a record, the tags field keeps its share of ambiguous rows through two shapes where no tag is certain: a vendor that sells in two tags with nothing named that was bought (Beanhaven or Cafetal, a place at most), and a purchase at a store outside the catalog that sells across tags, with nothing named that was bought (`$60 at the warehouse club`, snacks or supplies). Both expect the tags held; the Row shapes cap below applies to each.

**One interaction with ADR 0012.** A billed-through row at an office-only vendor whose tags all answer `not_mentioned` (the `client` pick missed) gets `office` from the vendor, which the cover calls a correction. Without the rule it would be an empty tags field, also a miss; the rule changes which, not whether.

### Set size

The same mix as rounds 1 to 6 (28 records, 8 ambiguous rows, 6 nothing rows in 42), four times over, per language. Past rounds' cards filled 32 to 36 of the 36 card rows, and the cards expect 124 fields in 42 rows.

| Rows per language | record | ambiguous | nothing | Cards that fill | One card, exact | One field, coverage | One row, held ambiguous | Calls per run |
|---|---|---|---|---|---|---|---|---|
| 42 (rounds 1 to 6) | 28 | 8 | 6 | 32 to 36 | 0.028 to 0.031 | 0.008 | 0.125 | 51 |
| 126 (three times) | 84 | 24 | 18 | 96 to 108 | 0.009 to 0.010 | 0.003 | 0.042 | 135 |
| **168 (four times, proposed)** | **112** | **32** | **24** | **128 to 144** | **0.007 to 0.008** | **0.002** | **0.031** | **177** |

- **Four times, not three.** Three times reaches 0.01 per card only when at least 100 cards fill, and past rounds say a card row fills 89 to 100% of the time: 96 cards would give 0.0104. Four times stays under 0.008 at the lowest fill seen.
- **Ambiguous rows, eight per field**, as two per field now. Held ambiguous moves by 0.031 per row against round 6 English's slack of 0 (0.75, on its line).
- **Calls per run:** 168 rows, 3 discarded warm-up calls and 6 measured probes (Latency, above). Two runs per language, as every round: 708 calls.
- **Cost:** at the card's measured cost per call, the figure #51's calculator scales (round 6: $0.0000870 English, $0.0000922 Spanish), 177 calls cost at most $0.0163 a run, and the whole round at most $0.065. The probes ask one question, so this is an upper bound.
- **Run time:** the runner sends one request at a time (`runCardEval`), so a run takes about its calls times their latency: 177 calls at round 6's highest p95 (424 ms, Spanish run 2) is about 75 s, and at its rows' medians, 231 to 260 ms in its four logs, about 41 to 46 s. A p95 is not a ceiling: round 6 had a 1,496 ms row and a probe timed out at 2 s, so a slow window runs longer.
- **The real cost is drafting and approval.** 336 rows across two languages, every one checked against every set and probe in `demo/eval/`, approved in batches of ten as before: about 17 batches per language pair, where rounds 3 to 6 took five.

**What the size does not buy.** Resolution is how far one card moves exact; it is not how sure the verdict is. A card whose true exact is 0.9 still fails about half its verdict runs at any size, since the line sits on it; the band a run lands in narrows from about ±0.05 at 33 cards (one standard error) to about ±0.026 at 132. At four times, a card near its line is decided by many rows rather than one, which is what #86 asks, and a verdict near the line remains close. The kill lines are not up for change here.

**Nothing rows, 6 to 24.** `invented <= 0` reads a count, so four times the nothing rows is four times the chances to invent one: the line is stricter at this size, not looser. Rounds 4 to 6 invented nothing on any of their 72 nothing row runs.

### Row shapes

Rounds 2 to 6 were drafted on round 1's positions (round 6: "the same shape as rounds 4 and 5, row for row"), so the same construction sat at row 24 in five rounds, and one systematic reading of it moved exact by 0.03 in each. For round 7 and after:

- **A shape** is the construction a row's expected value turns on, beyond naming a vendor, what was bought, a day and an amount plainly: `billable to the client` on a purchase that is not meals or travel, a purpose that names a client, a maybe, a vendor that sells in two tags, a named pair with `and` or `or`, a third vendor beside a pair, a vendor paraphrase, a typo, a vendor not in the catalog, a foreign currency, two amounts, a period for a day, a delete, a change that sets a value, a send, and so on.
- **At most two rows per shape per language.** Two rows of 128 or more cards are at most 0.016 of exact even if both miss, under round 6's gap of 0.021 and well under one card's 0.03 at 42 rows. A weakness that recurs across many shapes still shows; one construction no longer carries a verdict alone.
- **The shape list comes first.** Before drafting, the round 7 ticket lists every shape and its rows per kind (record, ambiguous per field, nothing), and the owner approves it before any row is drafted. Each row names its shape, and each row with a tag shape names the clause of the tag cover that decides its tags. A row whose expected tags the cover does not settle is not written.
- **No positions carried over.** Round 7 is not drafted on an earlier round's row order. English row N and Spanish row N still share a shape, so the languages read side by side.
- **The standing fixtures stay, under the cap.** The pair hold, the third vendor beside a pair, the delete the code holds, and the change and send the label alone holds are measured on purpose every round; each counts as a shape and gets its two rows like any other.
- **Coverage of the catalog scales with the set:** every vendor at least four times, a quarter of records with no vendor, a seventh of records with no day, and the other shares as rounds 1 to 6 wrote them, each within the per-shape cap (so two foreign-currency rows, not four).
- **Enforced in the test.** The round 7 ticket adds the shape to each row of the set (a field `parseCardEvalSet` reads) and a check to `test/demo-card-eval.test.ts` that no shape exceeds two rows per language, beside the checks that already hold: no repeat of any set, probe, suggestion or recording, every expected day and amount built by the parser on Wednesday 2026-09-23, and every held one held by the parser's reading or by two candidates.

### Procedure for round 7

Carried by [#88](https://github.com/franklinmdev/justask/issues/88).

1. #88 drafts the shape list (Row shapes, above) and the owner approves it.
2. Rows are drafted to it, 168 per language in the mix above, their tags by the tag cover, and approved in batches; the shape field and the cap check land, and the sets are frozen by checksum in `test/demo-card-eval.test.ts` in the commit before the first call.
3. The card, gates, labels, kill lines and `PROBE_BASELINE_MS` are round 6's as `demo/server/handler.ts` and `demo/eval/probe.ts` serve them, and stay so through round 7: #88 changes only the sets.
4. Run 1 per language gives the verdict, under the latency rule; run 2 reports flips only. Results are recorded here as in rounds 1 to 6.

## Round 7: shapes

Carried by [#88](https://github.com/franklinmdev/justask/issues/88). **Approved by the owner as written on 2026-09-24, before any row was drafted.** Every row of `card-<language>.round7.jsonl` names exactly one shape from it in its `shape` field, by its name in `ROUND7_SHAPES` (`demo/eval/card-shapes.ts`), which the set test holds each row and each count to; English row N and Spanish row N the same one, and no shape has more than two rows per language. The card, gates, labels, kill lines and `PROBE_BASELINE_MS` are round 6's.

- **One shape per row.** A row is built on its shape and is plain everywhere else: a vendor by its name or none, what was bought in words the tag's label lists, a day as `yesterday`, `today`, a bare weekday or a named date, an amount in `$`. So a typo row has no maybe in it, and a billed-through row no typo.
- **A plain record's shape is the item of the tag cover that decides its tags** (`meals: catering`, `office: couriers`), so each item is capped like any construction, and every tag row names its clause through its shape.
- **The quotas are counted across rows, not shapes:** of 112 records, tags in all 112, the vendor in 84 (every vendor at least four times, 28 records with no vendor of the catalog), the day in 96, the amount in 108. Ambiguous rows expect every field they do not hold.
- Every day and amount below was read by the parser on Wednesday 2026-09-23 in both languages before this list was written.

### Records: 112 rows, 73 shapes

**Plain, by the item of the tag cover (39 rows, 28 shapes).**

| Tag | Item: rows |
|---|---|
| meals (9) | lunch 1, dinner 1, coffee or tea 1, drinks 1, snacks 1, catering 2, a cake 1, pantry stock (water, beans) 1 |
| travel (10) | flight 1, hotel 1, taxi 2, rideshare 1, train 1, bus 1, parking 2, tolls 1 |
| office (20) | supplies 2, equipment 2, software 2, hosting 2, repairs 2, cleaning or window washing 2, printing 2, couriers 2, payroll 1, HR 1, legal work 1, insurance 1 |

**The vendor (23 rows, 13 shapes).** Tags by the plain item bought.

| Shape | Rows | Example | Vendor expected |
|---|---|---|---|
| typo, a letter dropped | 2 | `Tallyroo` | the vendor |
| typo, a letter doubled | 2 | `Lindeero` | the vendor |
| typo, a sound spelled another way | 2 | `Clausewud` | the vendor |
| typo, two letters swapped | 2 | `Papregrove` | the vendor |
| paraphrase by the service | 2 | `the company that insures us` | the vendor |
| paraphrase by the people | 2 | `the tech support crew` | the vendor |
| paraphrase as `our <trade>` | 2 | `our law firm` | the vendor |
| paraphrase as the trade's shop | 2 | `the print shop` | the vendor |
| a third vendor beside an `or` pair | 2 | `Larkspur lunch for the Fixbright or Swiftlane walkthrough` | the third |
| a third vendor beside an `and` pair | 1 | `Larkspur lunch for the Brightmop and Glasswell crews` | the third |
| no catalog vendor: a named business | 1 | `Rosa's Diner` | empty |
| no catalog vendor: a kind of shop | 1 | `a ramen shop` | empty |
| no catalog vendor: a store selling what a catalog vendor sells | 2 | `toner from a big-box store` | empty |

**The tags (26 rows, 15 shapes), each with the clause of the tag cover that decides it.**

| Shape | Rows | Clause | Tags expected |
|---|---|---|---|
| an office purchase billed to a client | 2 | office, not bought for a client and billed to them; client, billable | `client` |
| a meal billable to a client | 2 | meals; client, billable | `meals` + `client` |
| a trip billable to a client | 2 | travel; client, billable | `travel` + `client` |
| a meal with a client present | 2 | meals; client, a meal with a client | `meals` + `client` |
| a ride with a client present | 1 | travel; client, a ride with a client | `travel` + `client` |
| an event with a client present | 1 | no tag for tickets; client, an event with a client | `client` |
| a trip whose purpose names a client | 2 | client, not a purpose alone | `travel` |
| another purchase whose purpose names a client, not billed | 1 | client, not a purpose alone | its own tag |
| a maybe billable | 2 | client, not a maybe | its certain tag |
| a client named as a place | 1 | client, not a client named as a place | its own tag |
| two purchases in two tags | 2 | what the money bought decides | both |
| a meal on a trip | 2 | travel, a meal on a trip is meals alone | `meals` |
| the coffee machine, rented or serviced | 2 | meals, not the machine that makes it | `office` |
| a restock at the vendor that sells in two tags | 2 | meals, pantry stock; a restock is of what runs out | `meals` |
| an office service in words its label does not list | 2 | office, whatever the words for them | `office` |

**The day (9 rows, 7 shapes).** Parser checked: each builds the one expected day.

| Shape | Rows | Example |
|---|---|---|
| a day of the month alone | 2 | `on the 5th`, `el 5` |
| a numeric date | 1 | `9/14`, `el 14/9` |
| days counted back | 2 | `two days ago`, `the day before yesterday`; `hace dos días`, `anteayer` |
| a weekday with its date | 1 | `Monday the 14th` |
| a time of day | 1 | `yesterday morning`, `ayer por la mañana` |
| `this` and a weekday | 1 | `this Monday`, `este lunes` |
| a month abbreviated | 1 | `Sept 8`, `8 de sept` |

**The amount (10 rows, 6 shapes).**

| Shape | Rows | Example |
|---|---|---|
| a foreign currency | 2 | `€22` |
| cents | 2 | `$12.50` |
| a thousands separator | 1 | `$1,250` |
| the word for dollars | 2 | `52 dollars`, `52 dólares` |
| a count beside the amount | 2 | `3 boxes of paper, $45` |
| a currency code | 1 | `USD 40` |

**The intent (5 rows, 4 shapes).** Records a reader could take for something else.

| Shape | Rows | Example |
|---|---|---|
| told as a story | 1 | `we paid Brightmop $230 to clean up after the renovation` |
| asked to be logged | 1 | `log $38 of printer paper from Papergrove` |
| a command word inside a record | 2 | `Farwander cancellation fee`, `Swiftlane courier to send the contract` |
| asked as a question | 1 | `can you put down $27 for Beanhaven espressos?` |

### Ambiguous: 32 rows, 16 shapes, two each

Eight rows hold each field, as #86 set.

| Field | Shapes |
|---|---|
| vendor | a named pair with `and`; a named pair with `or`; a service both cleaning vendors sell (`office cleaning`); a paraphrase both cleaning vendors fit (`our cleaning company`) |
| tags | the vendor that sells in two tags, nothing named that was bought; the same, with a place named (`for the break room`); a store outside the catalog that sells across tags, nothing named (`$60 at the warehouse club`); the same, with a place named |
| day | `last` and a weekday (#39's two readings); a week (`last week`); a named month (`in June`); a month counted from today (`last month`, `earlier this month`) |
| amount | a currency the local one does not resolve (`1,600 pesos`); two amounts with `or` (`$22 or $25`); a range (`between $30 and $40`); an amount and a tip, no total (`$40 plus a $6 tip`) |

The tags split each of #86's two tags-ambiguous shapes in two, bare and with a place, since #86's table rules both cases held and four rows per shape would break the cap. Every held day has no single-day reading and every held amount has none or two resolved candidates, as the set test checks.

### Nothing: 24 rows, 12 shapes, two each

| Shape | Held by | Example |
|---|---|---|
| a question about spending | the intent | `how much have we paid Swiftlane since August?` |
| a question about tags | the intent | `which tag should a train ticket get?` |
| a request to show expenses | the intent | `show me last week's Larkspur expenses` |
| a delete | the code | `void that Inkhollow expense` |
| a change with a listed verb | the code | `change that expense to $52` |
| a change that sets a value, no list word | the intent | `Monday's Papergrove receipt was really $44` |
| a move or an undo | the code | `move this expense to Friday` |
| a send with a listed verb | the code | `email that invoice to accounting` |
| a send no list names | the intent | `pass Larkspur's receipt along to the bookkeeper` |
| a thank-you | the intent | `great, thanks a lot` |
| a reminder to pay a vendor | the intent | `remind me to pay Brightmop on Friday` |
| a greeting or a question about the demo | the intent | `hi, what can you do?` |

Examples show the construction only; none is a drafted row, and a drafted row repeats no request of any set, probe, suggestion or recording.

### Round 7 sets

Files in `demo/eval/`, drafted to the shapes above against every set in `demo/eval/` (probes included), the demo's suggestions and recordings, and the provider probe, approved by the owner in seven batches of 24 rows on 2026-09-24, English beside Spanish, and frozen by checksum in `test/demo-card-eval.test.ts` in the commit before the first round 7 call. Run logs `demo/eval/runs/card-<language>-round7-<n>.jsonl`.

| File | Rows | record | ambiguous | nothing |
|---|---|---|---|---|
| `card-en.round7.jsonl` | 168 | 112 | 32 | 24 |
| `card-es.round7.jsonl` | 168 | 112 | 32 | 24 |

- **Quotas:** tags in all 112 records, the day in 96, the amount in 108, the vendor in 84, every vendor in four records or more, 28 records with no vendor of the catalog; eight ambiguous rows hold each field. The test holds every row to its shape's kind and count.
- **No order carried over:** the rows were drafted by shape and shuffled once, with the same order in both languages; row N shares its shape and kind across languages, which the test checks.
- **Checked with no call:** the code holds the ten nothing rows with a listed verb and a reference (`undo that expense`, `quite ese gasto de Nubalia`) and the vendor of the four named-pair rows in each language, and no record. One nothing row also has a tags pair in English alone (`does a hotel minibar count as meals or travel?`); it expects nothing either way.
- The same checks as rounds 1 to 6 hold: no request repeats any other set, probe, suggestion or recording, every expected day and amount is one the parser builds on Wednesday 2026-09-23, and every held one is held by the parser's reading or by two candidates.
- Kill lines, measures and procedure as round 6, under the latency rule. Run 1 gives the verdict; run 2 reports flips only.

## Round 7: result

**Verdict: FAIL, on errors alone, in both languages; every quality line passes in both, and so does p95.** Runs of 2026-09-24 with `jev-1.13.0`, round 6's card and gates (intent 0.45, vendor 0.7, tags 0.4, spent_on 0.8, total 0.9), the frozen round 7 sets, the same kill lines, and `PROBE_BASELINE_MS` of 235, today fixed at Wednesday 2026-09-23. Every run's probes were normal, so no line is pending. **The errors are the provider's:** of the three in run 1, two are its `529 We are currently experiencing high traffic` answer, returned in under 250 ms, and one a row it did not answer within the 2 s timeout. The errors line has no slow-window rule, so they count as written. The owner ruled on 2026-09-24 that the FAIL stands, as round 4's did; the errors line's rule is extended for later rounds only, in [#93](https://github.com/franklinmdev/justask/issues/93), and round 7 is not rescored under it.

As #86 wrote, the rows changed and the card did not, so a better result on the reworded rows is not evidence that the card improved: rounds 1 to 6 stand as recorded, and round 7 is a new measurement of the same card on a larger set whose tags follow the tag cover.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 0.949 (129 of 136 cards) | 0.963 (130 of 135 cards) |
| coverage | at least 0.7 | 0.848 (413 of 487 fields) | 0.808 (391 of 484 fields) |
| invented | at most 0 | 0 | 0 |
| held ambiguous | at least 0.75 | 0.935 (29 of 31) | 0.903 (28 of 31) |
| p95 | at most 1000 ms | 594 ms | 768 ms |
| errors | at most 0 | **1** | **2** |
| cost per call | | $0.0000870 | $0.0000922 |
| probes, median against 235 ms | | 456 ms, normal | 395 ms, normal |

- **Errors:** `en-r7-153` (`Paydale and Tallyroot, $150 for the payroll export setup on September 9`) and `es-r7-030` (`la imprenta, $58 por los banners del evento el viernes`) got the 529 in 245 and 185 ms; `es-r7-097` (`taxi en Ciudad de México el lunes, 350 pesos`) timed out at 2 s. An errored row is scored as no card, so the cards count 143 and 142 of 144, and the ambiguous rows 31 of 32.
- **The probes were normal, and high.** Both medians sat under twice the baseline (470 ms), at 1.9 and 1.7 times it in English and Spanish run 1; the warm-up's first call took 1,759 ms in English. The 529s name the provider's high traffic, in windows the probes still read as normal.

Per field, filled of expected: vendor 88 of 102 English, 82 of 101 Spanish; tags 120 of 135 (7 wrong, two of them on ambiguous rows that must hold their tags) and 108 of 134 (5 wrong, three on ambiguous rows); day 79 of 119 and 79 of 118; amount 126 of 131 and 122 of 131. No field but the tags filled wrong. The intent passed 136 English and 135 Spanish cards, and no nothing row in either language; no vendor filled on a named-pair row.

### Filled and wrong

| Row | Request | Shape | Expected | Got | Pick |
|---|---|---|---|---|---|
| en-r7-096 | flight to Nashville for the client demo, $264 on September 10 | a trip whose purpose names a client | travel | travel + client | client yes 0.61 |
| en-r7-094 | rideshare to the client's headquarters, $21 on Friday | a client named as a place | travel | travel + client | client yes 0.58 |
| en-r7-016 | lunch on the train to the Portland trade fair, $18 on September 16 | a meal on a trip | meals | meals + travel | travel yes 0.52 |
| en-r7-024 | Farwander hotel in Omaha for the client's project kickoff, $198 on September 13 | a trip whose purpose names a client | travel | travel + client | client yes 0.49 |
| en-r7-064 | Inkhollow brochures for the client's launch, $96 on Monday | another purchase whose purpose names a client, not billed | office | office + client | client yes 0.68 |
| en-r7-055 | Beanhaven order for the third-floor lounge, $49 on Monday | tags held: the vendor that sells in two tags, a place named | held | meals | meals yes 0.73 |
| en-r7-026 | $82 at the supermarket for the break room on Monday | tags held: a store across tags, a place named | held | meals | meals yes 0.65 |
| es-r7-016 | almuerzo en el tren a la feria de Portland, $18 el 16 de septiembre | a meal on a trip | meals | meals + travel | travel yes 0.74 |
| es-r7-024 | hotel de Rumbo Claro en Omaha para el arranque del proyecto del cliente, $198 el 13 de septiembre | a trip whose purpose names a client | travel | travel + client | client yes 0.53 |
| es-r7-055 | pedido del Cafetal para la sala del tercer piso, $49 el lunes | tags held: the vendor that sells in two tags, a place named | held | meals | meals yes 0.86 |
| es-r7-113 | Cafetal para el vestíbulo, $66 el viernes | tags held: the vendor that sells in two tags, a place named | held | meals | meals yes 0.91 |
| es-r7-129 | Cafetal, $73 el martes | tags held: the vendor that sells in two tags, nothing named | held | meals | meals yes 0.70 |

Every correction is a tag the provider picked; none came from a vendor's implied office.

### Run 2: flips only

English: 14 flips on 9 rows, one error (`en-r7-167`, the 529 again). Exact 0.964 (132 of 137), coverage 0.86, held ambiguous 0.938, p95 776 ms, probes 435 ms, normal. `en-r7-016` held the tags run 1 filled wrong, `en-r7-024` dropped its client, and two cards the intent held in run 1 filled every field right (`Clausewood legal advice on the vendor contract`, `Sureharbor business insurance premium on September 1`); the other flips are single fields filled in one run and held in the other, none wrong. Spanish: 6 flips, one error (`es-r7-152`, a timeout). Exact 0.97 (131 of 135), coverage 0.811, held ambiguous 0.906, p95 826 ms, probes 317 ms, normal; `es-r7-024` dropped its client, four fields held in run 1 filled right, and one tag filled in run 1 held. Both languages again pass every line but errors.

### What the misses say

- **The card, read by the tag cover, clears every quality line in both languages with room:** exact 0.049 and 0.063 over its line, held ambiguous 0.185 and 0.153, coverage 0.148 and 0.108. The largest single shape in the misses is two rows, 0.015 of exact, which is what the cap was for: no construction decides the verdict.
- **Where the provider and the cover part:** a client named as a purpose or a place still draws `client` in English (three shapes, four rows), and a meal on a train draws `travel` in both languages. These are the cases #86 decided against the provider's rounds 2 to 6 answers; they now cost exact, where before they cost it the other way.
- **Beanhaven and Cafetal still draw `meals`** on the tags-held rows, most on the rows with a place named (both languages' `-055`); the stores outside the catalog held in Spanish and leaked once in English.
- **The owner's printing ruling held:** both rows of an office purchase billed to a client (`-127`, `-141`) filled `client` alone in every run, office `not_mentioned` at 0.58 to 0.88.
- **Errors, not the card, fail the round.** Nothing in the rules sets the provider's overload apart on the errors line, as #65 did for p95; all five errors in four runs were a 529 or a timeout in a normal window. [#93](https://github.com/franklinmdev/justask/issues/93) carries that rule for later rounds; round 7 is not rescored under it.

### Run logs

- Run 1: `demo/eval/runs/card-en-round7-1.jsonl`, `demo/eval/runs/card-es-round7-1.jsonl`
- Run 2: `demo/eval/runs/card-en-round7-2.jsonl`, `demo/eval/runs/card-es-round7-2.jsonl`

Each rescores with `scoreCardRun(await readCardRun(path), { gates })` and no call.

## Round 8: the retry, under the errors rule

Carried by [#97](https://github.com/franklinmdev/justask/issues/97). The card's first verdict under #93's errors rule and `ask`'s one retry on a provider-unavailable error ([ADR 0013](adr/0013-ask-calls-an-unavailable-provider-once-more.md)). Nothing else changes: the card, gates, labels, kill lines and `PROBE_BASELINE_MS` are round 7's. The retry changes what a visitor sees, so the round set out to measure it: each report counts the rows that retried, and those of them with no error are the ones the retry recovered, read from the run log. The round met no transport failure, so it measured nothing of the retry (Round 8: result, below).

**Code freeze:** the round runs on main `ff6eb4a` (the merge of #96). If a commit lands on main between this freeze and run 1, every saved card log is rescored first and must score as before.

### Round 8 sets

Round 7's shapes, reused as the owner approved on 2026-09-24: every row names one shape of `ROUND7_SHAPES` with round 7's counts, so the two rounds read side by side shape by shape. The rows are new, drafted against every set in `demo/eval/` (probes included), the demo's suggestions and recordings, and the provider probe, approved by the owner in seven batches of 24 rows on 2026-09-24, English beside Spanish (one Spanish word changed at approval: row 131's deli is `charcutería`, not `cafetería`, which sits close to Café del Cafetal), and frozen by checksum in `test/demo-card-eval.test.ts` in the commit before the first round 8 call. Run logs `demo/eval/runs/card-<language>-round8-<n>.jsonl`.

| File | Rows | record | ambiguous | nothing |
|---|---|---|---|---|
| `card-en.round8.jsonl` | 168 | 112 | 32 | 24 |
| `card-es.round8.jsonl` | 168 | 112 | 32 | 24 |

- **Quotas as round 7:** tags in all 112 records, the day in 96, the amount in 108, the vendor in 84, every vendor in four records or more, 28 records with no vendor of the catalog; eight ambiguous rows hold each field.
- **No order carried over:** drafted by shape and shuffled once, with the same order in both languages; no row shares its shape with round 7's row at the same position, checked with no call.
- **Checked with no call:** the code holds the eight nothing rows with a listed verb and a reference and the vendor of the four named-pair rows in each language, and no record. One nothing row names two tags with `or` in both languages (`is a parking fee travel or office?`); it expects nothing either way.
- The same checks as rounds 1 to 7 hold: no request repeats any other set, probe, suggestion or recording, every expected day and amount is one the parser builds on Wednesday 2026-09-23, and every held one is held by the parser's reading or by two candidates.

## Round 8: result

**Verdict: FAIL, on English invented alone; Spanish passes every line.** Runs of 2026-09-24 with `jev-1.13.0` on main `ff6eb4a`, round 7's card and gates (intent 0.45, vendor 0.7, tags 0.4, spent_on 0.8, total 0.9) with #93's retry, the frozen round 8 sets, the same kill lines, and `PROBE_BASELINE_MS` of 235, today fixed at Wednesday 2026-09-23. Main did not move between the freeze and run 1, so no saved log was rescored. Every run's probes were normal and no row errored, so no line is pending and nothing was remeasured. The owner ruled on 2026-09-24 that the FAIL stands: invented is a quality line, and `en-r8-060` is a card miss, not the provider's. The label fix and round 9 are carried by [#99](https://github.com/franklinmdev/justask/issues/99).

As #86 wrote for round 7, the rows changed and the card did not: a result on reworded rows is a new measurement of the same card, not evidence that it changed.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 0.957 (134 of 140 cards) | 0.95 (133 of 140 cards) |
| coverage | at least 0.7 | 0.869 (426 of 490 fields) | 0.841 (412 of 490 fields) |
| invented | at most 0 | **1** (`en-r8-060`) | 0 |
| held ambiguous | at least 0.75 | 1 (32 of 32) | 0.938 (30 of 32) |
| p95 | at most 1000 ms | 380 ms | 543 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000872 | $0.0000923 |
| probes, median against 235 ms | | 202 ms, normal | 242 ms, normal |
| retried, recovered | | 0, 0 | 0, 0 |

- **The invented card:** `en-r8-060`, `copy accounting on the Cloudberth bill`, a send no list names. The intent picked `new_record` at 0.70 over `not_available` at 0.27, the vendor filled Cloudberth at 0.89, and the tags filled `office` from the vendor (ADR 0012), since every tag answered `not_mentioned`. Its Spanish row (`ponga en copia a contabilidad con la factura de Nubalia`) held. Round 7's two rows of the same shape held in both languages.
- **The retry and the errors rule:** no row of the four runs errored, and none called twice (`retried` is absent from every report). The round cannot say whether the retry helps a visitor: the provider answered every first call. The recovered count is read by hand from the run logs, as retried rows with no error; the reports count only the rows that retried.
- **Retried rows and their cost (the owner's request on #97, from #98):** no row retried, so there is no retried row's `costUsd` to compare against the TypeSafe dashboard, and this round does not settle whether a retry after a lost connection under-reports cost.

### Filled and wrong

| Row | Request | Shape | Expected | Got | Pick |
|---|---|---|---|---|---|
| en-r8-149 | train to Providence for the client's quarterly review, $52 on September 15 | a trip whose purpose names a client | travel | travel + client | client yes 0.64 |
| en-r8-020 | Farwander hotel in Tucson for the client training, $176 on Thursday | a trip whose purpose names a client | travel | travel + client | client yes 0.61 |
| en-r8-078 | bus ticket and a coffee on the way to the Stamford office, $11 on Monday | two purchases in two tags | meals + travel | meals | travel not_mentioned 0.61 |
| en-r8-158 | snacks on the flight back from Phoenix, $12 on Sunday | a meal on a trip | meals | meals + travel | travel yes 0.61 |
| en-r8-025 | parking at the client's office for the kickoff, $14 on Thursday | a client named as a place | travel | client | client yes 0.53 |
| en-r8-063 | breakfast at the hotel during the Des Moines trip, $21 on Friday | a meal on a trip | meals | meals + travel | travel yes 0.52 |
| es-r8-078 | pasaje de autobús y un café camino a la oficina de Stamford, $11 el lunes | two purchases in two tags | meals + travel | meals | travel not_mentioned 0.78 |
| es-r8-058 | Cafetal para la sala de espera, $57 el martes | tags held: the vendor that sells in two tags, a place named | held | meals | meals yes 0.90 |
| es-r8-048 | pedido del Cafetal para el área de recepción, $44 el 10 de septiembre | tags held: the vendor that sells in two tags, a place named | held | meals | meals yes 0.68 |
| es-r8-025 | parqueo en la oficina del cliente para el arranque, $14 el jueves | a client named as a place | travel | client | client yes 0.53 |
| es-r8-158 | meriendas en el vuelo de regreso de Phoenix, $12 el domingo | a meal on a trip | meals | meals + travel | travel yes 0.52 |
| es-r8-063 | desayuno en el hotel durante el viaje a Des Moines, $21 el viernes | a meal on a trip | meals | meals + travel | travel yes 0.46 |
| es-r8-149 | tren a Providence para la revisión trimestral del cliente, $52 el 15 de septiembre | a trip whose purpose names a client | travel | travel + client | client yes 0.46 |

Every correction on a card is a tag the provider picked; none came from a vendor's implied office. The one implied fill of the round is the invented card's `office`, above.

### Run 2: flips only

English: 2 flips, no error, no retry. Exact 0.95 (133 of 140), coverage 0.871, held ambiguous 0.969, p95 574 ms, probes 219 ms, normal. `en-r8-060` invented again (`new_record` 0.64); `en-r8-048` filled `meals` on a tags-held row, and `en-r8-128` (`our caterer`) filled Larkspur where run 1 held it. Spanish: 9 flips on 6 rows, no error, no retry. Exact 0.95 (132 of 139), coverage 0.835, held ambiguous 0.938, p95 516 ms, probes 209 ms, normal; the intent held `es-r8-104` (a maybe billable) in run 2, which emptied its four fields, and the other flips are single fields filled in one run and held in the other, none wrong. English fails invented again and Spanish passes every line again.

### What the misses say

- **The one line that fails is a row, not a pattern:** `invented <= 0` reads a count, and the count is one English send no list names, in both runs. The other 23 English nothing rows and all 24 Spanish ones held in both runs, as every nothing row of round 7 did.
- **The quality lines clear with room in both languages:** exact 0.057 and 0.05 over its line, held ambiguous 0.25 and 0.188, coverage 0.169 and 0.141. No shape costs exact more than two rows.
- **The same partings as round 7, on new rows:** a client named as a purpose or a place draws `client` (three rows in English, two in Spanish), and a meal on a trip draws `travel` in both languages. A bus ticket and a coffee drop `travel` in both languages.
- **Beanhaven and Cafetal still draw `meals`** with a place named: both Spanish rows in both runs, and one English row in run 2.
- **The retry was not exercised.** Round 7's five errors in four runs were a 529 or a timeout; round 8 met none. The owner ruled on 2026-09-24 that no round is set aside for it: it is counted in every run and measured whenever a transport failure occurs, and its mechanics are covered by the stand-in provider tests ([ADR 0013](adr/0013-ask-calls-an-unavailable-provider-once-more.md), amended).

### Run logs

- Run 1: `demo/eval/runs/card-en-round8-1.jsonl`, `demo/eval/runs/card-es-round8-1.jsonl`
- Run 2: `demo/eval/runs/card-en-round8-2.jsonl`, `demo/eval/runs/card-es-round8-2.jsonl`

Each rescores with `scoreCardRun(await readCardRun(path), { gates })` and no call.

## Copy probes (#99)

Carried by [#99](https://github.com/franklinmdev/justask/issues/99), before round 9. Round 8's `en-r8-060`, `copy accounting on the Cloudberth bill`, read as a new record in both runs: copying someone on a record is a send, and the intent's `not_available` label named sending but the provider did not read "copy X on" as one. As #57 did, probes came first, at the current label and then at the new one.

### Probe sets

Both run with `card.ts run <en|es> <copy|copyrec> <n>` and no verdict, approved by the owner on 2026-09-24 in batches of 10, English beside Spanish, and frozen by checksum in `test/demo-card-eval.test.ts` in the commit before their first call; no later round may repeat them.

- **`card-<en|es>.copy.jsonl`, 20 rows per language.** Rows 1 to 12 are nothing rows, someone copied or cc'd on a record that exists, on a vendor, an amount, a day or neither: `cc Dana on the Sureharbor invoice`, `cópiale a nuestro contador la factura de $210 de Lindero`, `add accounting to the cc on the Swiftlane receipt`, `cc: contabilidad, factura de Relucir`. Rows 13 to 20 are records that name a person with no send (`lunch with accounting at Larkspur`, `taxi para la contadora al aeropuerto`), one with `copy` as a noun (`copy paper for accounting`) and one a paid delivery to a person (`Swiftlane courier to take the contract to Dana`).
- **`card-<en|es>.copyrec.jsonl`, 10 records per language,** approved after the first runs to measure the cost of listing the copy verbs: each holds `copy`/`copiar`, a copy noun or a charge (`the charge`, `el cargo`), four of them in the purpose clause the code check cannot tell from a command (`Tallyroot add-on to copy the invoices to the cloud`, `Serena: el cargo por mover la nómina al viernes`).
- Checked with no call: the parser builds every day and amount, and no row repeats any set, suggestion or recording.

### Result

Runs of 2026-09-24 with `jev-1.13.0`, the card at round 8's gates (intent 0.45), today fixed at Wednesday 2026-09-23. Every probe window was normal (medians 185 to 228 ms against 235), and no row errored. The old label is "it changes, cancels, deletes, sends or forwards one, sets one to a new value, or asks a question"; the new one adds "copies someone on it" after "sends or forwards one". Copyrec's old-label runs (3, 4) were sent from a working tree with the label reverted, after its new-label runs.

| Runs | English | Spanish |
|---|---|---|
| copy nothing rows that filled, old label (copy 1, 2) | 2, 2 of 12 (`03`, `12`) | 2, 2 (`06`, `12`) |
| the same, new label (copy 3, 4) | 0, 0 | 2, 2 (`06`, `12`) |
| the same, new label and the Spanish copy verbs (copy 5) | | 1 (`12`) |
| copy records held, of 8, old label and new | 0, 0 and 0, 0 | 1, 1 and 1, 1 (`20`) |
| copyrec records held, of 10, old label (copyrec 3, 4) | 1, 1 (`04`) | 1, 1 (`04`) |
| the same, new label (copyrec 1, 2) | 3, 3 (`01`, `04`, `05`) | 3, 3 (`01`, `04`, `05`) |
| the same, new label and the Spanish copy verbs (copyrec 5) | | 4 (`01`, `02`, `04`, `05`) |

- **The label carries the English send.** Every English copy row fell to 0.29 or less at the new label, from up to 0.86 (`copy accounting on today's $38 Tallyroot charge`); ten of twelve Spanish ones fell to 0.06 or less. The leaks at the old label all named an amount, as #57's did.
- **Spanish `cópiale` is `quite` again: the label does not reach it.** `cópiale a nuestro contador la factura de $210 de Lindero` read 0.94 and 0.90 at the old label and 0.70 and 0.64 at the new one; `cópiale a contabilidad el cargo de $38 de hoy de Cuentia` 0.98, 0.99, then 0.85, 0.90.
- **The label costs records that copy a document.** `copy the old invoice into the new system` fell from 0.59 to 0.11 in English and from 0.74 to 0.20 in Spanish, and `copies of the invoice for the audit` from 0.55 and 0.50 to 0.34 and 0.33 in English, from 0.49 and 0.54 to 0.22 and 0.35 in Spanish: two of ten records per language held that the old label filled. Every other record, in both sets, moved by 0.14 or less on the mean of its two runs (0.18 at most between single runs, `en-k-02`). `the charge for changing the ticket` is held at either label (0.28 to 0.36).
- **The owner chose the Spanish copy verbs, and no new reference,** on 2026-09-24 from these runs, asked before the list changed, as #99 requires: `copie`, `copiar`, `cópiale`, `cópiele`, `cópiame`, `cópieme` join the Spanish list (ADR 0009, amended). The code now holds `es-c-06` and, of the records, `es-k-01` (which the provider held too) and `es-k-02` alone (`complemento para copiar las facturas`, 0.74 to 0.79), #57's purpose-clause cost. `el cargo` was left off: Spanish writes a fee as `el cargo por <verb>`, and with it the code would also hold `es-k-08` (`el cargo por mover la nómina`, 0.81 to 0.85). So `es-c-12`, a copy on `el cargo`, stays open, and round 9 may meet it. Checked with no call over every frozen Spanish set: the new verbs hold no other row.

### Run logs

- copy: `demo/eval/runs/card-<en|es>-copy-<1|2>.jsonl` at the old label, `<3|4>` at the new, `card-es-copy-5.jsonl` with the Spanish copy verbs
- copyrec: `demo/eval/runs/card-<en|es>-copyrec-<1|2>.jsonl` at the new label, `<3|4>` at the old, `card-es-copyrec-5.jsonl` with the Spanish copy verbs

## Round 9: the copy label

Carried by [#99](https://github.com/franklinmdev/justask/issues/99). The card's first verdict with the intent's `not_available` label naming copying someone on a record, and the Spanish copy verbs on the command list, both from the copy probes above ([ADR 0009](adr/0009-card-holds-commands-on-existing-records.md), amended). Nothing else changes: gates, kill lines, the other labels and `PROBE_BASELINE_MS` are round 8's, and the retry is counted in every run as #102 left it.

**Code freeze:** the sets were frozen at `c408d89`. Main then moved to `ffcdb6f` (#102's retry count), merged into the branch before any round 9 call, so the round runs on branch `eval/99-card-round9` at `973f51c`, main `ffcdb6f` with the label, the verbs and the frozen sets, as the owner chose on 2026-09-24, and lands with a merge commit so that `973f51c` stays reachable from main. The full suite, which rescores every saved card log it pins, passed on that commit before run 1.

### Round 9 sets

Round 7's shapes, reused as the owner chose on 2026-09-24, so rounds 7, 8 and 9 read side by side shape by shape. The rows are new, drafted against every set in `demo/eval/` (the copy probes included), the demo's suggestions and the provider probe, with about 30 drafts rewritten before approval where they read as an earlier row with a number changed. Approved by the owner in seven batches of 24 rows on 2026-09-24, English beside Spanish, and frozen by checksum in `test/demo-card-eval.test.ts` in the commit before the first round 9 call. Run logs `demo/eval/runs/card-<language>-round9-<n>.jsonl`.

| File | Rows | record | ambiguous | nothing |
|---|---|---|---|---|
| `card-en.round9.jsonl` | 168 | 112 | 32 | 24 |
| `card-es.round9.jsonl` | 168 | 112 | 32 | 24 |

- **Quotas as rounds 7 and 8:** tags in all 112 records, the day in 96, the amount in 108, the vendor in 84, every vendor in four records or more, 28 records with no vendor of the catalog; eight ambiguous rows hold each field.
- **No order carried over:** drafted by shape and shuffled once, with the same order in both languages; no row shares its shape with round 7's or round 8's row at the same position, checked with no call.
- **Checked with no call:** the code holds the eight nothing rows with a listed verb and a reference and the vendor of the four named-pair rows in each language, and no record. One of the two `a send no list names` rows is a copy (`cc the office manager on the Brightmop invoice`, `ponga en copia a la gerente de oficina en la factura de Brisamar`), which no list names in either language, so the label alone holds it. One nothing row names two tags with `or` in English (`is a client dinner meals or client?`); it expects nothing either way.
- The same checks as rounds 1 to 8 hold: no request repeats any other set, probe, suggestion or recording, every expected day and amount is one the parser builds on Wednesday 2026-09-23, and every held one is held by the parser's reading or by two candidates.

## Round 9: result

**Verdict: PASS in both languages, in both runs.** Runs of 2026-09-24 with `jev-1.13.0` on `973f51c`, round 8's gates (intent 0.45, vendor 0.7, tags 0.4, spent_on 0.8, total 0.9), the copy label and the Spanish copy verbs, the frozen round 9 sets, the same kill lines, and `PROBE_BASELINE_MS` of 235, today fixed at Wednesday 2026-09-23. Every run's probes were normal and no row errored, so no line is pending and nothing was remeasured.

As #86 wrote for round 7, the rows changed: a pass on new rows says the card held on these, not that round 8's row would now hold. The copy probes are the evidence for that row's category.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 0.956 (131 of 137 cards) | 0.941 (128 of 136 cards) |
| coverage | at least 0.7 | 0.843 (413 of 490 fields) | 0.8 (392 of 490 fields) |
| invented | at most 0 | 0 | 0 |
| held ambiguous | at least 0.75 | 0.969 (31 of 32) | 0.875 (28 of 32) |
| p95 | at most 1000 ms | 360 ms | 241 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000874 | $0.0000925 |
| probes, median against 235 ms | | 211 ms, normal | 194 ms, normal |
| retried, recovered | | 0, 0 | 0, 0 |

- **Every nothing row held, in both languages and both runs.** The two sends no list names read `new_record` 0.00 in all four runs, the copy row included; the highest `new_record` on any nothing row was 0.23 in English (`Friday's Swiftlane delivery should read $26`) and 0.33 in Spanish (`quite esa factura de Cazuela Azul`, which the code holds too).
- **The retry was not exercised again:** no row of the four runs retried or errored, so the round cannot say whether it helps a visitor, and there is no retried row's cost to compare against the TypeSafe dashboard.

### Filled and wrong

| Row | Request | Shape | Expected | Got | Pick |
|---|---|---|---|---|---|
| en-r9-111 | Farwander flight to Reno for the client's site visit, $224 on Thursday | a trip whose purpose names a client | travel | travel + client | client yes 0.73 |
| en-r9-154 | Beanhaven delivery to the boardroom, $49 on September 3 | tags held: the vendor that sells in two tags, a place named | held | meals | meals yes 0.63 |
| en-r9-008 | Beanhaven restock of coffee and creamer, $52 on Monday | a restock at the vendor that sells in two tags | meals | meals + office | office yes 0.52 |
| en-r9-062 | Papergrove poster board for the client presentation, $28 on Thursday | another purchase whose purpose names a client, not billed | office | office + client | client yes 0.51 |
| en-r9-099 | taxi to the client's headquarters for the demo, $23 on Friday | a client named as a place | travel | travel + client | client yes 0.50 |
| en-r9-068 | subway fare and a bagel on the way to the Albany office, $14 on Tuesday | two purchases in two tags | meals + travel | meals | travel not_mentioned 0.43 |
| es-r9-158 | Cafetal para la sala de visitas, $36 el jueves | tags held: the vendor that sells in two tags, a place named | held | meals | meals yes 0.91 |
| es-r9-068 | pasaje de metro y un bagel camino a la oficina de Albany, $14 el martes | two purchases in two tags | meals + travel | meals | travel not_mentioned 0.75 |
| es-r9-154 | entrega del Cafetal a la sala de juntas, $49 el 3 de septiembre | tags held: the vendor that sells in two tags, a place named | held | meals | meals yes 0.67 |
| es-r9-071 | pedido del Cafetal, $73 el 9 de septiembre | tags held: the vendor that sells in two tags, nothing named | held | meals | meals yes 0.57 |
| es-r9-035 | hotel en Spokane para el arranque con el cliente, $149 el 13 de septiembre | a trip whose purpose names a client | travel | travel + client | client yes 0.52 |
| es-r9-111 | vuelo de Rumbo Claro a Reno para la visita a la obra del cliente, $224 el jueves | a trip whose purpose names a client | travel | travel + client | client yes 0.51 |
| es-r9-100 | cuenta del Cafetal, $58 el lunes | tags held: the vendor that sells in two tags, nothing named | held | meals | meals yes 0.41 |
| es-r9-086 | arrendamiento de la máquina de café automática del Cafetal para el cuarto piso, $85 el 1 de septiembre | the coffee machine, rented or serviced | office | meals + office | meals yes 0.41 |

Every correction on a card is a tag the provider picked; none came from a vendor's implied office, and no vendor, day or amount filled wrong.

### Run 2: flips only

English: 9 flips on 8 rows, no error, no retry. Exact 0.956 (130 of 136), coverage 0.829, held ambiguous 0.969, p95 279 ms, probes 243 ms, normal; every flip is a single field filled in one run and held in the other, none wrong. Spanish: 7 flips on 7 rows, no error, no retry. Exact 0.956 (130 of 136), coverage 0.796, held ambiguous 0.875, p95 395 ms, probes 194 ms, normal; `es-r9-086` dropped its wrong `meals` and `es-r9-111` held its tags, and the other flips are single fields filled in one run and held in the other. Both languages pass every line again.

### What the misses say

- **The line round 8 failed on holds:** invented is 0 in all four runs, and no nothing row came near the intent's gate.
- **Beanhaven and Cafetal still draw `meals`** where the tags should hold, as in rounds 7 and 8: one English row in both runs and all four Spanish tags-held rows at this vendor, which is all of Spanish held ambiguous's misses (0.875 against 0.75).
- **The same partings as rounds 7 and 8, on new rows:** a client named as a purpose or a place draws `client` (three English rows, two Spanish), and a fare with a snack drops `travel` in both languages.
- **The round tests the copy category weakly:** its one copy row per language (`cc the office manager on the Brightmop invoice`) names no amount, and every copy probe that leaked named one. The copy probes, not round 9, are the evidence that the label holds the category.
- **Spanish coverage is the lowest line for room,** 0.8 and 0.796 against 0.7, as in round 8 (0.841); English 0.843 and 0.829.

### Run logs

- Run 1: `demo/eval/runs/card-en-round9-1.jsonl`, `demo/eval/runs/card-es-round9-1.jsonl`
- Run 2: `demo/eval/runs/card-en-round9-2.jsonl`, `demo/eval/runs/card-es-round9-2.jsonl`

Each rescores with `scoreCardRun(await readCardRun(path), { gates })` and no call.

## Dates (#140)

The owner's decision on [#140](https://github.com/franklinmdev/justask/issues/140), 2026-09-25, amending [ADR 0008](adr/0008-card-dates-declare-their-direction.md). The parser computes two readings of "last X" and "next X": the closest one that way, and that weekday in the week before or after this one, weeks starting on Monday. When they are the same day the field can fill; when they differ both are marked ambiguous and the field is held, as before. A part of the day reads as its day: "this morning", "tonight", "esta tarde" are today, "last night" and "anoche" yesterday.

- **No row depends on the run day.** The card eval writes today as a fixed fact, Wednesday 2026-09-23 (`demo/eval/card.ts`), and the parser reads its today from that fact, never from the clock. The owner ruled that today stays fixed there, so every round keeps one day and the demo's recordings and the eval keep reading the same week.
- **What moves on that Wednesday.** "last Monday" and "last Tuesday" (this week's, or last week's) are still held. "last Wednesday" to "last Sunday" now read one way, the day in the week before this one, and fill. "next Thursday" to "next Sunday" are held; "next Monday" to "next Wednesday" fill.
- **Frozen rows stay as they are.** 14 rows frozen before #140 expect a Thursday or Friday held, which the parser now reads one way: `en-r2-33`, `en-r4-33`, `en-r5-33`, `en-r7-034`, `en-r7-087`, `en-r9-076`, `en-r9-161` and their Spanish twins. Their sets, logs, scores and verdicts are unchanged: a log saves each field's candidates and picks, so it rescores as it ran. `test/demo-card-eval.test.ts` lists them by id (`HELD_BEFORE_140`) and checks every other row's held day against the parser, and checks that each listed row now reads one way, so the list names no row it need not.
- **The next round runs under the new rule.** Its `day held: last and a weekday` rows name a Monday or a Tuesday, the weekdays held on that Wednesday; a "last X" row that fills expects its one day, which the set test checks is the one the parser builds.
- **The demo's suggestion.** "Papergrove toner last Friday, $120" (`tóner de Tintaverde el viernes pasado, $120`) under "Leaves one empty" would fill on most days. It is now "Papergrove toner last week, $120" (`tóner de Tintaverde la semana pasada, $120`): a period, held on every day of the week, checked for each day of a week by the same test file.
- **No call was made for this change.**

## Parser readings (#232)

The pre-launch QA's parser fixes ([#232](https://github.com/franklinmdev/justask/issues/232)) change what the built-in parser reads from some requests. Every frozen row of every set was parsed before and after the change, on the eval's Wednesday 2026-09-23, and the rows whose candidates changed are listed here.

- **"before X" and "after X" leave X out (#183).** `en-r8-163` (`don't let me forget to pay Farwander before Friday`) and `es-r8-163` (`que no se me olvide pagarle a Rumbo Claro antes del viernes`) now read the Thursday before that Friday. Both are nothing rows: only the intent is scored, so no expected value moves.
- **A weekday and its day of the month are one day (#193).** `en-r7-092` (`Monday the 14th`), `en-r8-062` (`Thursday the 10th`) and `en-r9-165` (`Friday the 11th`) read one candidate, the day they expect, where they read two: the weekday's last one and the day of the month. Their Spanish twins say the month (`el lunes 14 de septiembre`) and read as before.
- **The number after a dash in a form's name is no amount (#193).** `en-r5-33` and `en-r9-134` (`W-2`) and `en-r9-049` (`I-9`) no longer read a stray amount of 2 or 9 beside the total they expect.
- **Frozen rows stay as they are.** Their sets, logs, scores and verdicts are unchanged: a log saves each field's candidates and picks, so it rescores as it ran. `test/demo-card-eval.test.ts` lists them by id (`MOVED_BY_232`) with the span each now reads or no longer reads, and fails when a listed row stops being moved.
- **No call was made for this change.**
