# Search eval: sets, kill lines and verdict

**Status: round 4 run, verdict PASS in both languages (run 1), held ambiguous 6 of 6 each, with the named-pair hold of ADR 0011; round 3 passed with no slack on held ambiguous, and rounds 1 and 2 failed it in Spanish at 0.667.** Approved by the owner on 2026-09-22 (#13), with the shortlist raised to 14; the eval sets, the kill lines and the gate rule were frozen then, before any provider call.

**Hypothesis:** on the demo's fictional invoicing data, the search shows the vendor a request means, or nothing, in English and in Spanish, as the person types.

## Sets

Files in `demo/eval/`, one JSONL row per request (`parseEvalSet`):

| File | Rows | item | nothing | ambiguous |
|---|---|---|---|---|
| `search-en.jsonl` (eval) | 40 | 28 | 6 | 6 |
| `search-es.jsonl` (eval) | 40 | 28 | 6 | 6 |
| `search-en.dev.jsonl` (dev) | 12 | 8 | 2 | 2 |
| `search-es.dev.jsonl` (dev) | 12 | 8 | 2 | 2 |

- **item:** each of the 14 vendors twice per language: its name (bare, or with a typo such as `papergrov`, `Relusir`, `kafetal`) and a paraphrase that shares no word with its description where possible (`the bike messengers`, `los que lavan los cristales`). One row per language is in the other language (`la aseguradora`, `the insurance company`).
- **nothing:** a vendor the catalog lacks (electricity, landlord, advertising, furniture) and a request that is not a vendor at all (`cancel that`, the weather).
- **ambiguous:** two per language on the catalog's own near-duplicate, the two cleaning companies; two that name two vendors; two that span a category (`our tech vendor`, `the food and coffee people`).
- The eval sets share no request with the dev sets or the demo's suggestions, which were tried by hand and so count as dev data (`test/demo-eval.test.ts` checks this).

## Kill lines

Declared in `demo/eval/kill-lines.ts`, the same for both languages. The verdict passes only when both languages pass every line.

```kill
exact >= 0.9
coverage >= 0.8
invented <= 0
heldAmbiguous >= 0.75
p95Ms <= 800
errors <= 0
```

- `exact >= 0.9`: of the vendors shown, 9 of 10 are the one meant. A wrong vendor shown as right is what user story 37 forbids.
- `coverage >= 0.8`: at least 23 of the 28 item rows show their vendor. With 14 vendors a person can scan the list; below 8 of 10 the box saves little.
- `invented <= 0`: no nothing row shows a vendor. The lab's one miss in this class (`fotos d elas vacaciones`, none at 0.34) is the failure this line exists for.
- `heldAmbiguous >= 0.75`: at least 5 of the 6 ambiguous rows stay held.
- `p95Ms <= 800`, `errors <= 0`: the search runs as the person types; the lab's search p95 was 747 ms over 57 candidates.

## Gate

The scored run needs a gate before it starts, and choosing it from the eval rows would tune on the rows that judge it. So it comes from the dev runs by a rule fixed now: the midpoint between the highest `none` on a dev item row that filled with its vendor and the lowest `none` on a dev nothing or ambiguous row, rounded to 0.05. If the two overlap, the gate stays 0.5, the middle of the lab's gap (ADR 0005). The chosen gate is written into `demo/server/handler.ts` as `GATE` before run 1, so the demo serves the gate the verdict was measured at. A rescore of run 1 at another gate is reported apart and changes neither the verdict nor the demo.

## Dev-set change, made before any call

Checked with no call: in 5 of the 16 dev item rows the expected vendor never reaches the provider (`the attorneys`, `salary processing`, `liability coverage`, `quien revisó el acuerdo de confidencialidad`, `el pago de salarios`). The demo's shortlist keeps 10 of 14 vendors, text matches first and the catalog's first ones after, so the last four vendors are reachable only by a shared word. This is the lab's finding 3 again (`~/jev-lab/experiments/search/RESULT.md`). Approved and made: `SHORTLIST_LIMIT` is 14, the whole catalog. It costs four more candidates per call.

## Procedure

By hand with the key in `.env`, never in CI; every row is a paid call.

1. Dev runs, as many as tuning needs: `node --conditions=justask-source demo/eval/search.ts run <en|es> dev <n>`. They print no verdict.
2. Fix the gate by the rule above and write it into the demo. The eval sets and kill lines are already frozen: `test/demo-eval.test.ts` checks the sets' checksums and the kill lines' values, so an edit fails CI.
3. From #65 on, write the probe baseline into the demo, as Latency below says. Run 1 per language gives the verdict: `node --conditions=justask-source demo/eval/search.ts run <en|es> eval 1`.
4. Run 2 per language reports flips only: `run <en|es> eval 2`, then `compare <en|es> 1 2`.
5. Record here the verdict, the numbers, the misses and the run logs' paths (`demo/eval/runs/`, committed so anyone can rescore them with no call).

A row found wrong after a run is the owner's call, logged here; it never silently changes the set.

## Latency

The owner's triage decision on [#65](https://github.com/franklinmdev/justask/issues/65), 2026-09-23, holds here as for the card: every run sends the fixed provider probe before and after its rows, and a verdict run whose probes' median is more than twice the baseline is a slow window. Its quality lines still decide, and so does a p95 that passes its line; a p95 that fails is pending, measured again on the same frozen rows in a later window whose probes are normal. The owner's ruling on [#93](https://github.com/franklinmdev/justask/issues/93), 2026-09-24, holds here too: an error that is a provider transport failure (a timeout, or a 529, another 5xx or a lost connection on both of `ask`'s calls, ADR 0013) leaves the errors line pending when it alone puts the line over, and only those rows are sent again (`remeasure`, then `merge` with no call). The rules, the probe and the baseline are written once, in [card-eval.md, Latency](card-eval.md#latency). Every verdict recorded here was run before probes and transport marks, and stands as recorded.

## Result

**Verdict: FAIL.** English passes every kill line; Spanish fails one, held ambiguous at 0.667 against 0.75. Delivery 1 is not closed by this set.

Runs of 2026-09-22 with `jev-1.13.0`, gate 0.2, shortlist 14, today fixed at Tuesday 2026-09-22.

### Gate, from the dev runs

The dev runs were logged at the draft gate of 0.5; held ambiguous here is at that gate.

| Dev run (gate 0.5) | exact | coverage | invented | held ambiguous | p95 | cost per call |
|---|---|---|---|---|---|---|
| English | 8 of 8 | 8 of 8 | 0 | 1 of 2 | 594 ms | $0.0000300 |
| Spanish | 8 of 8 | 8 of 8 | 0 | 1 of 2 | 421 ms | $0.0000323 |

Highest `none` on a dev item that filled right: 0.17 (`the attorneys`). Lowest on a dev nothing or ambiguous row: 0.23 (`la factura de la limpieza`). Midpoint 0.20, so the gate is 0.2, written into the demo before run 1. The misses of both dev runs were the cleaning near-duplicate: `the cleaning bill` filled Brightmop at `none` 0.32 (gate 0.5 then), `la factura de la limpieza` filled Relucir at 0.23.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 1 (28 of 28) | 1 (27 of 27) |
| coverage | at least 0.8 | 1 (28 of 28) | 0.964 (27 of 28) |
| invented | at most 0 | 0 | 0 |
| held ambiguous | at least 0.75 | 0.833 (5 of 6) | **0.667 (4 of 6): FAIL** |
| p95 | at most 800 ms | 416 ms | 528 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000301 | $0.0000323 |

Every vendor shown was the one meant, in both languages, and no nothing row got a vendor: the six Spanish and six English nothing rows sat at `none` 0.97 to 1.

Misses:

| Row | Request | Expected | Got | `none` |
|---|---|---|---|---|
| en36 | whoever cleans the office | ambiguous | Brightmop (0.58, next 0.23) | 0.19 |
| es35 | la factura de limpieza de oficinas | ambiguous | Relucir (0.78, next 0.08) | 0.14 |
| es39 | nuestro proveedor de tecnología | ambiguous | Tecnoria (0.77, next 0.04) | 0.18 |
| es20 | quién llevó los documentos al banco hoy mismo | Pieveloz | held | 0.66 |

### Run 2: flips only

English: one flip, `whoever cleans the office`, Brightmop at `none` 0.19 in run 1, held at 0.21 in run 2: it sits on the gate. Spanish: no flip; the same two ambiguous rows filled and the same item held, so the failure is stable, not noise.

### What the misses say

- **The two Spanish failures are confident single picks, not near-misses.** Relucir at 0.78 and Tecnoria at 0.77, with the runner-up at 0.08 and 0.04: the provider read each request as naming one vendor. No margin between the top two tells them from a right answer.
- **The FAIL is close to the gate, and a lower gate would have passed.** Rescored with no call, and so with no verdict: at 0.15, run 1 clears every kill line in both languages (English coverage 1, held ambiguous 1; Spanish coverage 0.893, held ambiguous 0.833, `es39` held and `es35` still filled at 0.14), and so does run 2. At 0.1 every ambiguous row holds but coverage drops to 0.929 in English and 0.893 in Spanish. The item and ambiguous `none` values overlap in Spanish (items up to 0.16, `la firma de recursos humanos`; ambiguous from 0.14), so no gate separates them cleanly. The gate rule was fixed before the run and set 0.2, so the verdict stays FAIL; choosing 0.15 now would be tuning on the rows that judge it. The old demo gate of 0.5 would have held only 1 of 6 in English and 2 of 6 in Spanish, so the dev-run rule moved the gate the right way.
- **`es35`** reads the words of one vendor's description (Relucir: "limpieza de oficinas y de ventanas") over the other's ("limpieza nocturna de oficinas"). Both vendors clean offices, so the row is ambiguous as drafted; the catalog's wording pulls it to one.
- **`es39`: the owner ruled it stays as written (2026-09-22).** "tecnología" shares its root with the vendor's name, Tecnoria, which the English row (`our tech vendor` against Fixbright) does not, so it was raised as a possible drafting error. The row stands, and the FAIL stands as recorded.
- **`es20`** held a request for the courier at `none` 0.66 and 0.58 in both runs: phrased as a question about who did something today, it read as nothing to find.

### Run logs

- Dev: `demo/eval/runs/search-en-dev-1.jsonl`, `demo/eval/runs/search-es-dev-1.jsonl`
- Run 1: `demo/eval/runs/search-en-1.jsonl`, `demo/eval/runs/search-es-1.jsonl`
- Run 2: `demo/eval/runs/search-en-2.jsonl`, `demo/eval/runs/search-es-2.jsonl`

Each rescores with `scoreRun(await readRun(path), { gate })` and no call.

## Next round, fixed before any new data

Decided by the owner on 2026-09-22, after this verdict and before any row of the next set exists:

- **Gate: 0.15.** Chosen from this round's run 1, where it clears every kill line on a rescore; it is judged only on rows nobody has seen, never on these.
- **Kill lines:** the same six, unchanged in `demo/eval/kill-lines.ts`.
- **A fresh eval set per language,** 40 rows each (28 item, 6 nothing, 6 ambiguous), drafted by the orchestrator with the owner and pasted in once approved. New files beside these: `demo/eval/search-en.round2.jsonl` and `demo/eval/search-es.round2.jsonl`, run logs `demo/eval/runs/search-<language>-round2-<n>.jsonl`. This round's sets, logs and verdict stay as they are.
- **No call until the fresh sets are approved and frozen.** Run 1 of the fresh sets gives that round's verdict; run 2 reports flips only.

## Round 2: result

**Verdict: FAIL.** English passes every kill line; Spanish fails held ambiguous again, at 0.667 against 0.75. Delivery 1 is not closed.

Runs of 2026-09-22 with `jev-1.13.0`, gate 0.15, shortlist 14, the same six kill lines and fixed today. The sets were drafted by the orchestrator with the owner, approved, copied in unchanged and frozen by checksum (`test/demo-eval.test.ts`) in the commit before the first call. No dev run: the gate was fixed by the owner beforehand.

**One approved exception:** `es-r2-35`, `la empresa de limpieza`, is word for word one of the demo's Spanish suggestions, which round 1 counted as dev data. It was held, as expected; without it Spanish held ambiguous would be 3 of 5, still a FAIL. Nothing else in round 2 repeats a round 1 request, a dev request or a suggestion.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 1 (26 of 26) | 1 (24 of 24) |
| coverage | at least 0.8 | 0.929 (26 of 28) | 0.857 (24 of 28) |
| invented | at most 0 | 0 | 0 |
| held ambiguous | at least 0.75 | 0.833 (5 of 6) | **0.667 (4 of 6): FAIL** |
| p95 | at most 800 ms | 332 ms | 347 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000301 | $0.0000323 |

Again every vendor shown was the one meant, and no nothing row got a vendor.

Misses:

| Row | Request | Expected | Got | `none` |
|---|---|---|---|---|
| en-r2-39 | the people who keep our computers and website running | ambiguous | Cloudberth (0.85, next Fixbright 0.12) | 0.03 |
| es-r2-37 | el trabajo de impresión | ambiguous | Letranueva (0.96, next 0.00) | 0.04 |
| es-r2-39 | los que mantienen funcionando las computadoras y la página | ambiguous | Tecnoria (0.46, next Nubalia 0.43) | 0.11 |
| en-r2-11 | who drafted the lease agreement | Clausewood | held | 0.38 |
| en-r2-18 | la mensajería | Swiftlane | held | 0.40 |
| es-r2-11 | quién redactó el contrato de alquiler | Lindero | held | 0.17 |
| es-r2-27 | el señor del café | Cafetal | held | 0.17 |
| es-r2-07 | el vuelo de Ana a Madrid | Rumbo Claro | held | 0.20 |
| es-r2-19 | los que traen la comida cuando vienen clientes | Cazuela Azul | held | 0.24 |

### Run 2: flips only

No flip in either language. The same rows filled and held; the failure is stable.

### What the misses say

- **Held ambiguous has now failed in Spanish on two independent sets, at two gates.** The rows that leak carry a `none` as low as the right answers' (0.03 to 0.19 across both rounds' first runs): `none` says "some vendor fits", not "exactly one fits".
- **No gate on `none` passes both languages on round 2.** Rescored with no call, and so with no verdict: at 0.1 Spanish passes (coverage 0.821, held ambiguous 0.833) but English coverage falls to 0.679; from 0.15 up, Spanish held ambiguous stays at 0.667 or below.
- **The leaks are of two shapes.** `es-r2-39` is a near tie (Tecnoria 0.46, Nubalia 0.43): the provider saw two vendors, and the gate on `none` alone let the winner through; ADR 0005 holds only an exact tie. `es-r2-37` and `en-r2-39` are confident single picks (0.96, 0.85), which no rule on this answer would hold.
- **Coverage lost four Spanish items between 0.17 and 0.24:** requests that name a service by a person or an event (`el señor del café`, `el vuelo de Ana a Madrid`) put more weight on `none`. Coverage still clears its line.

### Run logs

- Run 1: `demo/eval/runs/search-en-round2-1.jsonl`, `demo/eval/runs/search-es-round2-1.jsonl`
- Run 2: `demo/eval/runs/search-en-round2-2.jsonl`, `demo/eval/runs/search-es-round2-2.jsonl`

## Several, on the dev sets only

After round 2 the owner added a `several` label beside `none` (ADR 0007): the item holds when either reaches the gate. It was measured on the dev sets only, which never decide a verdict; a fresh, frozen round 3 will. Rounds 1 and 2 above are unchanged, and their logs, which have no `several`, rescore exactly as recorded (`test/demo-eval.test.ts`).

Dev runs of 2026-09-22 with `jev-1.13.0`, gate 0.15, shortlist 14, the same six kill lines and fixed today, logged as dev run 2 beside round 1's dev run 1, which had no `several`:

| Dev set at 0.15 | coverage | exact | invented | held ambiguous | p95 | cost per call |
|---|---|---|---|---|---|---|
| English, before (dev run 1, rescored) | 7 of 8 | 1 | 0 | 2 of 2 | | |
| English, with `several` (dev run 2) | 8 of 8 | 1 | 0 | 2 of 2 | 514 ms | $0.0000315 |
| Spanish, before (dev run 1, rescored) | 8 of 8 | 1 | 0 | 2 of 2 | | |
| Spanish, with `several` (dev run 2) | 8 of 8 | 1 | 0 | 2 of 2 | 423 ms | $0.0000337 |

- **`several` rose where more than one vendor fits and stayed flat where one does.** On the four ambiguous dev rows it read 0.84 to 0.98 (`the cleaning bill` 0.85, `the hosting or the software invoice` 0.98, `la factura de la limpieza` 0.84, `el hosting o el programa contable` 0.95); on all 16 item rows, 0.02 or less.
- **`none` fell where it was carrying the doubt.** On the ambiguous rows it went from 0.23 to 0.73 before to 0.01 to 0.08 with `several`; on the items it stayed low or dropped (`the attorneys` 0.17 to 0.08, which now fills at 0.15).
- **What the dev sets cannot show.** They hold two ambiguous rows per language, both of the easier shapes (the cleaning near-duplicate, two named vendors). The misses that failed rounds 1 and 2 include confident single picks (`el trabajo de impresión`, Letranueva at 0.96), which no dev row resembles. Only a fresh round can say whether `several` catches those.
- **Cost:** about 5% more per call than before (one more label to read).

Run logs: `demo/eval/runs/search-en-dev-2.jsonl`, `demo/eval/runs/search-es-dev-2.jsonl`.

## Round 3: result

**Verdict: PASS.** Both languages clear every kill line in run 1. This is the first round to pass; whether it closes delivery 1 is the owner's call.

Runs of 2026-09-23 (UTC) with `jev-1.13.0`, gate 0.15 against `none` and `several` alike (ADR 0007), shortlist 14, the same six kill lines and today fixed at Tuesday 2026-09-22. The sets were drafted by the orchestrator with the owner, approved, copied in unchanged (sha256 checked against the approved drafts) and frozen by checksum in `test/demo-eval.test.ts` in the commit before the first call. No row repeats a round 1, round 2 or dev request, nor a suggestion. No dev run: the gate was already fixed.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 1 (25 of 25) | 1 (25 of 25) |
| coverage | at least 0.8 | 0.893 (25 of 28) | 0.893 (25 of 28) |
| invented | at most 0 | 0 | 0 |
| held ambiguous | at least 0.75 | 0.833 (5 of 6) | 0.833 (5 of 6) |
| p95 | at most 800 ms | 288 ms | 297 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000316 | $0.0000338 |

Every vendor shown was the one meant, and no nothing row got a vendor: the twelve nothing rows sat at `none` 0.87 to 1.

Misses:

| Row | Request | Expected | Got | `none` | `several` |
|---|---|---|---|---|---|
| en-r3-39 | paper for the flyers | ambiguous | Inkhollow (0.87, next Papergrove 0.08) | 0.02 | 0.03 |
| es-r3-39 | el papel para los volantes | ambiguous | Letranueva (0.63, next Tintaverde 0.19) | 0.04 | 0.14 |
| en-r3-09 | the company that did the windows on the third floor | Glasswell | held | 0.41 | 0.01 |
| en-r3-16 | tallyrot | Tallyroot | held | 0.28 | 0 |
| en-r3-15 | accounting licenses for the new hires | Tallyroot | held | 0.16 | 0.01 |
| es-r3-09 | la empresa que hizo las ventanas del tercer piso | Relucir | held | 0.94 | 0 |
| es-r3-06 | nuvalia | Nubalia | held | 0.29 | 0.01 |
| es-r3-19 | la entrega urgente al cliente del centro | Pieveloz | held | 0.22 | 0.02 |

### Run 2: flips only

English: one flip, `accounting licenses for the new hires`, held at `none` 0.16 in run 1, Tallyroot at 0.12 in run 2: it sits on the gate. Spanish: no flip. The same ambiguous row leaked in both runs of both languages.

### What the misses say

- **The pass has no slack on held ambiguous.** Each language held exactly 5 of 6, the line's minimum; one more leak in either fails it.
- **The one leak is the same row in both languages, and it is a confident single pick.** `paper for the flyers` went to the print shop at 0.87 (0.79 in run 2) with `several` at 0.03; `el papel para los volantes` to Letranueva at 0.63 with `several` at 0.14 (0.12 in run 2), just under the gate. This is the shape round 2's misses warned of (`el trabajo de impresión`, Letranueva at 0.96), and `several` does not catch it in English. In Spanish it came within 0.01 of the gate.
- **`several` held the rows that name two things, not the category rows.** `several` read 0.76 to 0.99 on the two named-vendor rows and the contracts-and-staff row in each language. The two category rows (`the kitchen supplier`, `what we pay every month for our computers` and their Spanish pairs) held on `none` instead, with `several` at 0.07 or less. Three sat far above the gate (0.68 to 0.88); the fourth is close: `el proveedor de la cocina` held at `none` 0.23 in run 1 and 0.18 in run 2, with Cazuela Azul at 0.70 and 0.75.
- **Coverage lost the same windows row in both languages.** `the company that did the windows on the third floor` (`none` 0.41) and `la empresa que hizo las ventanas del tercer piso` (`none` 0.94, Relucir 0.06): "did the windows" can read as fitting windows, not washing them, and the catalog has no glazier. Recorded as a miss; the row stands as approved.
- **The typos split.** `tallyrot` and `nuvalia` held at `none` 0.28 and 0.29; round 1's typos (`papergrov`, `Relusir`) filled. Two of 28 items per language, and coverage still clears its line.

### Run logs

- Run 1: `demo/eval/runs/search-en-round3-1.jsonl`, `demo/eval/runs/search-es-round3-1.jsonl`
- Run 2: `demo/eval/runs/search-en-round3-2.jsonl`, `demo/eval/runs/search-es-round3-2.jsonl`

## Round 4: the named-pair hold

Carried by [#68](https://github.com/franklinmdev/justask/issues/68). Rounds 1 to 3 above stand as recorded. The search now holds a named pair in code before its gate ([ADR 0011](adr/0011-search-and-filter-hold-a-named-pair.md)): two vendors joined by a word from the language's `joiners` (`or`, `and`; `o`, `u`, `y`, `e`), with no third one named.

The owner fixed the frame on 2026-09-23, before any row existed:

- **Gate 0.15 and the same six kill lines, and no dev run.** The hold asks the provider nothing new, and no dev row names a pair, so a dev run would measure only noise (checked with no call: the rule holds no dev row).
- **The same shape as rounds 1 to 3:** 28 item, 6 nothing, 6 ambiguous per language.

### Round 4 sets

Files in `demo/eval/`, drafted against every set in `demo/eval/` and all the demo's suggestions, approved by the owner in four batches of ten on 2026-09-23, English beside Spanish, copied in unchanged (sha256 checked against the approved drafts) and frozen by checksum in `test/demo-eval.test.ts` in the commit before the first round 4 call. Run logs `demo/eval/runs/search-<language>-round4-<n>.jsonl`.

| File | Rows | item | nothing | ambiguous |
|---|---|---|---|---|
| `search-en.round4.jsonl` | 40 | 28 | 6 | 6 |
| `search-es.round4.jsonl` | 40 | 28 | 6 | 6 |

- **item:** each of the 14 vendors twice, a paraphrase and its name (bare, possessive or with a typo: `Papergroove`, `brightmob`, `fixbrigth`; `Tintaverd`, `brizamar`, `Covertura Plena`). Row 17 is in the other language (`la cafetera que alquilamos`, `the coffee maker we rent`). **Row 19 names a third vendor beside an "or" pair** (`the Swiftlane run to Clausewood or Paydale`, `el envío de Pieveloz a Lindero o a Serena`): the rule holds no pair there, and the courier is expected.
- **nothing:** a parking pass, an electrician, a phone plan, gym memberships, a reminder, a greeting.
- **ambiguous:** row 35 an "or" pair (`the Glasswell or Beanhaven receipt`, `el recibo de Relucir o de Cafetal`), row 36 an "and" pair (`the Fixbright and Cloudberth bills`, `las facturas de Tecnoria y de Nubalia`), rows 37 and 38 the cleaning near-duplicate, row 39 lunch and coffee, row 40 IT costs.
- Checked with no call, and pinned in `test/demo-eval.test.ts`: the code holds rows 35 and 36 in both languages and no other row.
- Procedure as round 1, with the probe baseline in `demo/eval/probe.ts`: run 1 gives the verdict (`search.ts run <en|es> round4 1`), run 2 reports flips only.

## Round 4: result

**Verdict: PASS.** Both languages clear every kill line in run 1, held ambiguous at 6 of 6 in each, with the probes in a normal window. What the pair hold added is nothing measurable: the provider's `several` held every pair row on its own.

Runs of 2026-09-23 with `jev-1.13.0`, gate 0.15 against `none` and `several`, the named-pair hold (ADR 0011), shortlist 14, the same six kill lines and today fixed at Tuesday 2026-09-22.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 1 (24 of 24) | 1 (24 of 24) |
| coverage | at least 0.8 | 0.857 (24 of 28) | 0.857 (24 of 28) |
| invented | at most 0 | 0 | 0 |
| held ambiguous | at least 0.75 | 1 (6 of 6) | 1 (6 of 6) |
| p95 | at most 800 ms | 380 ms | 394 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000316 | $0.0000338 |
| probes' median (baseline 235 ms) | | 286 ms, normal | 278 ms, normal |

Every vendor shown was the one meant, and no nothing row got a vendor.

Misses, all held items:

| Row | Request | Expected | `none` | `several` |
|---|---|---|---|---|
| en-r4-07 | the crew that cleans after we close | Brightmop | 0.01 | 0.49 |
| en-r4-19 | the Swiftlane run to Clausewood or Paydale | Swiftlane | 0.03 | 0.28 |
| en-r4-18 | Beenhaven | Beanhaven | 0.20 | 0 |
| en-r4-08 | brightmob | Brightmop | 0.54 | 0.01 |
| es-r4-07 | el equipo que limpia cuando cerramos | Brisamar | 0.01 | 0.37 |
| es-r4-19 | el envío de Pieveloz a Lindero o a Serena | Pieveloz | 0.02 | 0.44 |
| es-r4-03 | el bufé del taller con el cliente | Cazuela Azul | 0.18 | 0.02 |
| es-r4-12 | letranuva | Letranueva | 0.26 | 0.04 |

### Run 2: flips only

English: no flip. Spanish: one, `tecnorria`, Tecnoria at `none` 0.12 in run 1 and held at 0.18 in run 2: it sits on the gate. Spanish run 2's coverage is 0.821 (23 of 28), still above its line; run 2 carries no verdict. Both runs' probes were normal (233 and 237 ms), p95 304 and 302 ms.

### What #68 set out to check

- **The code held both pair rows in both languages and both runs, and the provider would have held them too.** Read with no hold, `several` was 0.97 to 1.00 on all eight: `the Glasswell or Beanhaven receipt`, `the Fixbright and Cloudberth bills`, and their Spanish twins. As in rounds 1 to 3, no search pair has leaked; the hold is a floor under the label, not a fix of a leak.
- **The code held no item.** Row 19, the third vendor beside an "or" pair, was held by the provider, not by the rule: `several` at 0.28 and 0.31 in English, 0.44 and 0.40 in Spanish, with the courier the top pick each time (0.53 to 0.68). Three vendors named reads to the provider as more than one; a gate on `several` holds it. The row is a coverage miss, not a false hold.
- **Coverage lost the night cleaner in both languages** (`the crew that cleans after we close`, `several` 0.49 and 0.37): read as either cleaning company, as the near-duplicate the ambiguous rows use. And two typos each, as in round 3.

### Run logs

- Run 1: `demo/eval/runs/search-en-round4-1.jsonl`, `demo/eval/runs/search-es-round4-1.jsonl`
- Run 2: `demo/eval/runs/search-en-round4-2.jsonl`, `demo/eval/runs/search-es-round4-2.jsonl`
