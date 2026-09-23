# Card eval: sets, kill lines and verdict

**Status: run, verdict PASS in both languages (run 1), with nothing invented; Spanish passes held ambiguous with no slack. Sets, measures, kill lines and gate rule approved and frozen by the owner on 2026-09-23 (#20), before any provider call; the gates were fixed from the dev runs by that rule and written into the demo before run 1.**

**Round 2 (#44): the card passes in English and fails in Spanish**, where two nothing rows were read as new records; the owner ruled that round 2 stands. The Spanish intent fix is carried by [#57](https://github.com/franklinmdev/justask/issues/57). See Round 2 below; round 1's record is unchanged.

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
4. Run 1 per language gives the verdict: `run <en|es> eval 1`.
5. Run 2 per language reports flips only: `run <en|es> eval 2`, then `compare <en|es> eval 1 2`.
6. Record here the verdict, the numbers, the misses and the run logs' paths (`demo/eval/runs/`, committed so anyone can rescore them with no call).

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

`demo/eval/card-es.diag.jsonl` (50 rows) and `demo/eval/card-en.diag.jsonl` (30 rows), every row a nothing row, run with `card.ts run <en|es> diag <n>` and no verdict. They are measured, never tuned against, and no round 3 row may repeat them (`test/demo-card-eval.test.ts`).

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
