# Card eval: sets, kill lines and verdict

**Status: run, verdict PASS in both languages (run 1), with nothing invented; Spanish passes held ambiguous with no slack. Sets, measures, kill lines and gate rule approved and frozen by the owner on 2026-09-23 (#20), before any provider call; the gates were fixed from the dev runs by that rule and written into the demo before run 1.**

**Round 2 (#44): the card passes in English and fails in Spanish**, where two nothing rows were read as new records; the owner ruled that round 2 stands. The Spanish intent fix is carried by [#57](https://github.com/franklinmdev/justask/issues/57). See Round 2 below; round 1's record is unchanged.

**Round 3 (#57): the card fails in both languages.** The fix held every command but one, a Spanish change no list names and the label did not hold (`deje en $260 el cargo de Brisamar de ayer`, `new_record` 0.58); English fails exact and held ambiguous on tags and the named pair, which #57 did not change. See Round 3: result below; rounds 1 and 2 are unchanged.

**Round 4 (#63): the card fails on Spanish latency alone.** Every quality line passes in both languages and both runs, with a named pair held in code ([ADR 0010](adr/0010-card-holds-a-named-pair.md)) and the intent naming setting a value; Spanish run 1's p95 was 1,137 ms against a line of 1,000, in a provider slowdown across the whole run. The owner ruled that the FAIL stands, with latency carried by [#65](https://github.com/franklinmdev/justask/issues/65). See Round 4: result below; rounds 1 to 3 are unchanged.

**Round 5 (#73): the same card fails on Spanish coverage by one field.** Under #65's latency rule, with nothing changed, English clears every kill line and Spanish covers 86 of 124 fields (0.694) against a line of 0.7, in both runs; every probe window was normal, and no warm-up call or row timed out. See Round 5: result below; rounds 1 to 4 are unchanged.

**Office tag diagnosis (#77): the office tag fills when a request names a service its label lists, and almost never from the service alone, in both languages.** No wording of the label's definition fills it, a shorter label fills nothing, and adding backups fills the backups row alone. A proposed fix is below; none has landed. See Office tag diagnosis below; rounds 1 to 5 are unchanged.

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

## Latency

The owner's triage decision on [#65](https://github.com/franklinmdev/justask/issues/65), 2026-09-23, for the search, filter and card alike. The p95 kill line reads the provider's latency and the flow's together, so a verdict run in a slow provider window fails on it whatever the flow does, as card round 4 did. From the next verdict run on:

- **Probes.** Every run sends one fixed provider probe (`PROBE` in `demo/eval/probe.ts`: one request, one question, three labels) straight to the provider, three times before its rows and three times after, and saves each probe's latency in its run log: the ones before in the header, the ones after on the log's last line.
- **Warm-up.** Before the measured probes and before any row, every run sends the probe request three more times (`PROBE_WARM_UP`) and discards them: they are saved in the header as `warmUp`, and never counted in the probe median or the p95. The owner's ruling on #65, 2026-09-23, after the first two runs with probes (search dev runs 3 and 4, below): in both, the first calls after idle took 1,236 to 1,443 ms and the rest about 250 to 450 ms, a cold start and not a slow window. The warm-up keeps a cold start out of the baseline, and it also protects a verdict's first rows: dev run 3's first four rows (`en-dev01` to `en-dev04`) timed out at 2 s, and a verdict run's first rows would have done the same. The probe is the same for every flow and language, and frozen by value in `test/demo-probe.test.ts`. It is not the diagnostic probe sets of rounds 3 and 4 (`diag`, `pair`), which are eval rows.
- **Baseline.** The probes' median from the most recent normal runs, written into `PROBE_BASELINE_MS` in `demo/eval/probe.ts` before the next verdict run, saved in every run log beside the kill lines, and frozen by value in the same test. `node --conditions=source demo/eval/baseline.ts <run log>...` prints the median over the runs named, with no call. A probe that timed out counts at its wait; one that failed fast is left out. While no baseline is written, a dev, diag or pair run still sends the probes, and the CLIs refuse a verdict run before any call.
- **Slow window.** A run whose probes' median is more than twice its baseline, or whose every probe failed, is marked a slow window, in its report's measures. Its quality lines (exact, coverage, invented, held ambiguous, errors) still decide: any of them failing is a FAIL. A p95 that passes its line counts, since a slow provider only adds latency (the owner's ruling on #65, 2026-09-23). A p95 that fails is pending, and when every quality line passes the report's verdict reads `LATENCY PENDING`. Only that latency line is measured again: a later run of the same frozen rows, with nothing else changed, in a window whose probes are normal, under the next free run number (run 3 when run 2 took the flips). Read two lines of its report and nothing else: `Probes` must say `normal`, and the p95 in `Measures` decides the latency line against its kill line. Its verdict table decides nothing, even where it prints FAIL on a quality line; record the result beside run 1's. A remeasure run in a slow window decides nothing either; wait and run again.
- **Round 4 stays a FAIL** as recorded. Every log saved before this rule has no probes and scores as it did.

### Baseline: 235 ms, from search dev runs 5 and 6

The owner ruled on 2026-09-23 (#65) that the first baseline is seeded from two search dev runs back to back, accepted only if the rows' median latency in both logs is near the normal history, about 240 ms (card round 3 run 1: 243 ms; round 4's normal runs: 224 and 240 ms; the slow ones: 693 and 726 ms). The row median is taken over rows answered by a call.

| Run | Rows' median | Row errors | Warm-up (discarded) | Measured probes, before · after |
|---|---|---|---|---|
| Search `en` dev 3 | 444 ms (769 ms over all rows) | 4 timeouts | none yet | 1,236, 2,003 timeout, 2,001 timeout · 1,443, 445, 259 |
| Search `en` dev 4 | 318 ms | 0 | none yet | 1,312, 1,392, 367 · 249, 415, 359 |
| Search `en` dev 5 | 226 ms | 0 | 2,004, 2,002, 2,001, all timeouts | 336, 427, 306 · 227 provider error, 446, 176 |
| Search `en` dev 6 | 273 ms | 0 | 414, 217, 317 | 228, 261, 202 · 235, 231, 223 |

- **Dev runs 3 and 4 were rejected.** Dev run 3's rows sat far above the history, and both runs' first calls were a cold start. That led to the warm-up (above). Their logs are kept, and they seed nothing.
- **Dev runs 5 and 6 were accepted**, both near the history. Dev run 5's warm-up took the cold start on its own: all three calls timed out, and no row did. `node --conditions=source demo/eval/baseline.ts demo/eval/runs/search-en-dev-5.jsonl demo/eval/runs/search-en-dev-6.jsonl` gives 235 ms over the 11 measured probes left: the warm-up is left out, and so is the one probe that failed fast. `PROBE_BASELINE_MS` is 235, frozen by value in `test/demo-probe.test.ts`, so a run is a slow window when its probes' median is above 470 ms.

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
2. Dev runs: `node --conditions=source demo/eval/card.ts run <en|es> dev 1`. They print no verdict.
3. `node --conditions=source demo/eval/card.ts gates 1` prints the intent's and each field's gate by the rule; write them into the demo.
4. From #65 on, write the probe baseline into the demo (Latency, above).
5. Run 1 per language gives the verdict: `run <en|es> eval 1`. In a slow window a failing latency line is measured again, as Latency says.
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

The owner ruled on 2026-09-23 that dev run 3 alone fixes the gates, the only dev run with the final descriptions, by the same rule as round 1. `node --conditions=source demo/eval/card.ts gates 3`:

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

Dev run 4, of 2026-09-23 with `jev-1.13.0`, the first dev run with both fixes, fixes every gate by the same rule as rounds 1 and 2. `node --conditions=source demo/eval/card.ts gates 4`:

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

Dev run 5, of 2026-09-23 with `jev-1.13.0`, the first dev run with both fixes, fixes every gate by the same rule as rounds 1 to 3. `node --conditions=source demo/eval/card.ts gates 5`:

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

Carried by [#77](https://github.com/franklinmdev/justask/issues/77). Rounds 1 to 5 above stand as recorded. Round 5 failed on Spanish coverage alone, and its Spanish `office` tag filled 6 of 23 cards that expect it in run 1, against 15 English, answering `not_mentioned` on couriers, payroll, legal work and backups. Two hypotheses, unverified before these runs:

- **Wording:** the label's phrasing or length makes the provider skip it in Spanish.
- **Inference:** the request names a service, never the tag, and the provider reads Spanish too literally to infer it, so no label wording would fix it.

### Probe sets

`demo/eval/card-es.office.jsonl` and `demo/eval/card-en.office.jsonl`, 20 records per language, every one expecting `office`, run with `card.ts run <en|es> office <n> <label>` and no verdict. They take the round 5 misses' services (courier, payroll, legal, insurance, software, hosting, HR, printing, repairs, equipment), never their text. Approved by the owner in two batches on 2026-09-23 and frozen by checksum in `test/demo-card-eval.test.ts` in the commit before the first call; no later round may repeat them.

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

Where office was not filled, `not_mentioned` won every time; `not_available` won no row in any run. `yes`'s mean probability under `current`: Spanish 0.59 and 0.60 on rows 1 to 10, 0.28 and 0.29 on rows 11 to 20; English 0.67 and 0.68, 0.34 and 0.34. Under `short` it was 0.01 or less on every row, and under `rest` 0.38 or less.

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

1. **Fill `office` from the vendor, in code (recommended).** Eleven of the fourteen vendors in each language sell office services alone (`vendor()`'s `supplies` already says what); a card whose vendor fills with one of them gets `office` too, whatever the tag's pick. In Spanish round 5 run 1 the vendor filled with one of them on 19 cards, 17 of them expecting `office`, and the other two nothing rows the intent held. Rescored with no call over every saved verdict log (rounds 1 to 5, runs 1 and 2, `office` set to `yes` wherever the vendor filled with an office vendor): Spanish round 5 coverage 0.694 to 0.774 and 0.758, exact 0.938 to 0.969 and 0.906 to 0.938; English round 5 0.774 to 0.815, exact 0.97 to 1. No run's exact or held ambiguous fell in any round, and invented cannot move, since the intent gates the card. Its cost: a record at an office vendor that bought something else would get `office` too (a lunch with the cleaning crew, named by vendor); no frozen set has one, so that cost is unmeasured. The coffee vendors (`beanhaven`, `cafetal`) sell beans and machine rental, `meals` or `office`, and stay out. It needs an ADR, like the command and pair holds.
2. **Extend the label's list.** Each service added fills the rows that name it, as `backups` did (+0.3 on its row), and nothing else. On a round 6 of fresh rows it gains only where a row names a word added, so its effect cannot be priced from these runs, and tuning the list toward rounds 1 to 5's words fits the past sets, not the next.

No gate, kill line, label or code the demo serves changed.

### Run logs

`demo/eval/runs/card-<en|es>-office-<current|backups|short|rest>-<1|2>.jsonl`. `node --conditions=source demo/eval/card.ts office <en|es> <label> <n>` prints a run's office picks with no call.
