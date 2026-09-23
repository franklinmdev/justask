# Filter eval: sets, kill lines and verdict

**Status: round 2 run, verdict PASS in both languages (run 1) with no miss, with the named-pair hold of ADR 0011, which held the two Spanish pairs the provider alone would have filled. Round 1: verdict PASS in both languages (run 1), with no wrong value shown and nothing invented. Sets, kill lines and gate rule approved and frozen by the owner on 2026-09-22 (#17), before any provider call; the gates were fixed from the dev runs by that rule and written into the demo before run 1.**

**Hypothesis:** on the demo's fictional transactions, the filter turns a request into the exact filter object a person means (vendor, status, date, amount), or leaves a field empty when it cannot tell, in English and in Spanish, as the person types.

## Sets

Files in `demo/eval/`, one JSONL row per request (`parseFilterEvalSet`). Spanish row N has the same shape as English row N.

| File | Rows | filterable | ambiguous | nothing |
|---|---|---|---|---|
| `filter-en.jsonl` (eval) | 42 | 28 | 8 | 6 |
| `filter-es.jsonl` (eval) | 42 | 28 | 8 | 6 |
| `filter-en.dev.jsonl` (dev) | 20 | 12 | 4 | 4 |
| `filter-es.dev.jsonl` (dev) | 20 | 12 | 4 | 4 |

- **filterable:** each field is mentioned in 14 eval rows (6 dev), in one-, two- and three-field combinations. Each of the 14 vendors once, by name, typo (`tallyrut`, `cuntia`) or a paraphrase only one vendor fits (`the courier`, `el bufete`). Status paid 5, open 5, overdue 4. Amount minimum 4, maximum 4, exact 3, range 3, with a currency only where the parser reads one. Dates: named months and quarters, single days, `since` and `until` one end, and `the last N days`.
- **ambiguous:** two per field. Vendor: the two cleaning companies (`office cleaning`), two named vendors. Status: `unpaid` (open or overdue), `that we still owe`. Date: `early September`, `June or August`. Amount: `roughly $100`, `under $100 or over $2,000`. The row's other fields still expect their values.
- **nothing:** one trap per field (a vendor the catalog lacks, `how do I mark an invoice as paid?`, `tomorrow`, `25 invoices per page`), a sort the table cannot do, and a thank-you.
- **Second meanings written around:** "open" alone, which accounting reads as any unpaid invoice, so the open status is always "unpaid but not yet due" and bare "unpaid" is an ambiguous row; "from July", which can read as since; "before August 15", whose parsed end would include the 15th; "paid in August", which filters on the payment date, not the invoice date; "two weeks ago", a day or a week; "por menos de", since "por" is a cue for an exact amount; "next Friday" and "last Friday", which #39 reads two ways.
- The eval and dev sets repeat no request of each other, of any other set in `demo/eval/`, or of the demo's search and filter suggestions, which were tried by hand and so count as dev data. Every expected date and amount is one the parser builds on Tuesday 2026-09-22, the day the runs are fixed at. `test/demo-filter-eval.test.ts` checks all of this.

## Kill lines

`FILTER_KILL_LINES` in `demo/eval/kill-lines.ts`, the lab's filter lines, the same for both languages. The verdict passes only when both languages pass every line.

```kill
exact >= 0.9
coverage >= 0.7
invented <= 0
heldAmbiguous >= 0.75
p95Ms <= 800
errors <= 0
```

- `exact >= 0.9`: of the rows where every expected field filled, 9 of 10 are the whole object meant, with no extra field. A wrong filter shown as right is worse than no filter.
- `coverage >= 0.7`: at least 20 of the 28 filterable rows fill every field they mention. A row fills only when every one of its fields clears, so coverage runs lower than the search's; the lab passed at 0.742.
- `invented <= 0`: no nothing row fills any field.
- `heldAmbiguous >= 0.75`: at least 6 of the 8 ambiguous rows keep their held field empty.
- `p95Ms <= 800`, `errors <= 0`: the filter runs as the person types.

## Gates, from the dev runs

Each field gets its own gate, fixed from the dev runs by a rule the owner approved before any call (`fixGate` in `demo/eval/gates.ts`). The demo serves one gate per field in both languages, so the rule reads both languages' dev runs together. Read with no gate, a field's **right pick** fills it with the expected value; a **wrong pick** fills it with anything else: a wrong value, a value on a field an ambiguous row holds, or a value on a field the request never mentions. A field's pick is its weakest one.

- The midpoint between the field's highest wrong pick and its lowest right pick, rounded to 0.05, when that sits above every wrong pick.
- No wrong pick: the lowest right pick rounded down to 0.05, at most 0.9, the lab's gate.
- Overlap, or a midpoint that rounds onto a wrong pick: the first 0.05 above the highest wrong pick, since a wrong filter shown as right is worse than an empty field.
- No right pick, or no gate strictly between 0 and 1 that fits: the owner decides.

The gates are written into `demo/server/handler.ts` before run 1, so the demo serves the gates the verdict was measured at. A rescore of run 1 at other gates is reported apart and changes neither the verdict nor the demo.

### Dev run 1

Runs of 2026-09-22 with `jev-1.13.0`, every field at the lab's 0.9 (the gates are not fixed yet), today fixed at Tuesday 2026-09-22, after #39 merged. The frozen sets' checksums were checked unchanged and every test passed before the first call. Dev runs print no verdict.

| Dev run 1, all gates 0.9 | exact | coverage | invented | held ambiguous | p95 | cost per call |
|---|---|---|---|---|---|---|
| English | 9 of 9 | 9 of 12 | 0 | 4 of 4 | 353 ms | $0.0000569 |
| Spanish | 10 of 10 | 10 of 12 | 0 | 4 of 4 | 339 ms | $0.0000593 |

Each field's picks, read with no gate, both languages pooled:

| Field | Lowest right | Highest wrong | Rule | Gate |
|---|---|---|---|---|
| vendor | 0.67 (`the catering invoices`) | 0.49 (`facturas del abogado o de la nómina de julio`, Lindero) | midpoint 0.58, rounded 0.6 | **0.6** |
| status | 0.97 | 0.88 (`facturas pendientes de pago`, open) | midpoint 0.925, rounded 0.95 | **0.95** |
| date | 0.83 (`this year's invoices`) | 0.8 (`facturas de Cuentia de finales de agosto`, all of August) | midpoint 0.815 rounds to 0.80, onto the wrong pick; the first 0.05 above it | **0.85** |
| amount | 0.96 | none | lowest right rounded down, at most 0.9 | **0.9** |

- **Date: the rule held a right pick to keep out a wrong one.** At 0.85, `this year's invoices` (0.83) would have held too; the rule puts every tie on held, since a wrong filter shown as right is worse than an empty field.
- **Status sits close to its right picks.** The Spanish `pendientes de pago`, which could mean open or overdue, picked open at 0.88; the right picks were 0.97 and above. The gate is 0.95.
- **One vendor miss no gate reaches.** `Cloudberth's paid invoices under $300 between July 1 and August 31` picked `not_mentioned` at 0.50 over Cloudberth at 0.45, with the vendor named in the request. Every other dev miss was a right value under 0.9.
- The wrong picks on the other English ambiguous rows (`outstanding invoices` open at 0.48, `Tallyroot invoices from late August` all of August at 0.63) sit below every gate.

Run logs: `demo/eval/runs/filter-en-dev-1.jsonl`, `demo/eval/runs/filter-es-dev-1.jsonl`. `demo/eval/filter.ts gates 1` prints the table's gates with no call.

## Procedure

By hand with the key in `.env`, never in CI; every row is a paid call.

1. After #39 is in main and merged into this branch: dev runs, `node --conditions=source demo/eval/filter.ts run <en|es> dev <n>`. They print no verdict.
2. `node --conditions=source demo/eval/filter.ts gates <n>` prints each field's gate by the rule; write them into the demo.
3. From #65 on, write the probe baseline into the demo, as Latency below says. Run 1 per language gives the verdict: `run <en|es> eval 1`.
4. Run 2 per language reports flips only: `run <en|es> eval 2`, then `compare <en|es> eval 1 2`.
5. Record here the verdict, the numbers, the misses and the run logs' paths (`demo/eval/runs/`, committed so anyone can rescore them with no call).

A row found wrong after a run is the owner's call, logged here; it never silently changes the set.

## Latency

The owner's triage decision on [#65](https://github.com/franklinmdev/justask/issues/65), 2026-09-23, holds here as for the card: every run sends the fixed provider probe before and after its rows, and a verdict run whose probes' median is more than twice the baseline is a slow window. Its quality lines still decide, and so does a p95 that passes its line; a p95 that fails is pending, measured again on the same frozen rows in a later window whose probes are normal. The rule, the probe and the baseline are written once, in [card-eval.md, Latency](card-eval.md#latency). Every verdict recorded here was run before probes and stands as recorded.

## Result

**Verdict: PASS.** Both languages clear every kill line in run 1. Whether it closes delivery 2 is the owner's call.

Runs of 2026-09-22 with `jev-1.13.0`, gates vendor 0.6, status 0.95, date 0.85, amount 0.9 (from dev run 1, above), the frozen sets and kill lines, today fixed at Tuesday 2026-09-22.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 1 (24 of 24) | 1 (25 of 25) |
| coverage | at least 0.7 | 0.857 (24 of 28) | 0.893 (25 of 28) |
| invented | at most 0 | 0 | 0 |
| held ambiguous | at least 0.75 | 1 (8 of 8) | 0.875 (7 of 8) |
| p95 | at most 800 ms | 551 ms | 374 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000580 | $0.0000604 |

Every filter object that filled was the one meant, in both languages: no field ever showed a wrong value on a filterable row, and no nothing row filled a field.

Misses:

| Row | Request | Field | Expected | Got | Pick |
|---|---|---|---|---|---|
| es-a-30 | facturas de Nubalia o de Cuentia de julio | vendor | held | Nubalia | nubalia 0.61 (next not_available 0.24, cuentia 0.11) |
| en-f-11 | Glasswell's paid invoices between August 1 and August 15 | vendor | Glasswell | held | glasswell 0.50 |
| en-f-15 | tallyrut invoices | vendor | Tallyroot | held | not_mentioned 0.66 |
| en-f-16 | invoices still within their payment terms | status | open | held | open 0.94 |
| en-f-25 | Paydale's unpaid, not yet due invoices for September | vendor | Paydale | held | paydale 0.52 |
| es-f-02 | las facturas que ya se vencieron | status | overdue | held | overdue 0.89 |
| es-f-24 | facturas de menos de $80 con fecha del 8 de septiembre | date | Sep 8 | held | d0 0.78 |
| es-f-27 | facturas sin pagar y todavía sin vencer entre $1,000 y $2,500 de las últimas dos semanas | amount | 1000 to 2500 USD | held | min 0.88 |

### Run 2: flips only

English: two flips, both held in run 1 and filled right in run 2, both on a gate: `Glasswell's paid invoices between August 1 and August 15` (vendor 0.50, then 0.67) and `invoices still within their payment terms` (status 0.94, then 0.95). Coverage 0.929. Spanish: no flip; `es-a-30` filled Nubalia at 0.61 again.

### What the misses say

- **The one leak is a named pair, one hundredth above the vendor gate, and stable.** `facturas de Nubalia o de Cuentia de julio` picked Nubalia at 0.61 in both runs, against a gate of 0.6; the English pair (`Cloudberth or Tallyroot invoices in July`) held. The filter's vendor field takes one vendor and has no `several` label; `not_available` took 0.24. Rescored with no call, and so with no verdict: at a vendor gate of 0.65, run 1 holds all 8 ambiguous rows in both languages with the same coverage. The rule fixed 0.6 before run 1, so the verdict stays as recorded; moving the gate now would tune it on the rows that judge it.
- **A named vendor with a date range beside it reads as less sure.** `Glasswell's ... between August 1 and August 15` (0.50) and `Paydale's unpaid, not yet due invoices for September` (0.52), like the dev row `Cloudberth's paid invoices ... between July 1 and August 31` (`not_mentioned` 0.50): the vendor's name is in the request, yet `not_mentioned` takes up to half. The vendor gate's midpoint sits low for this reason.
- **The typo `tallyrut` read as no vendor** (`not_mentioned` 0.66), as the search's `tallyrot` held in round 3.
- **Status and date held right values just under high gates.** `open` at 0.94 against 0.95, `overdue` at 0.89, a single day at 0.78 against 0.85. The rule put these gates high to keep out the dev set's wrong picks (`pendientes de pago` open at 0.88, `finales de agosto` all of August at 0.80); no wrong status or date filled in either run.
- **Against the lab's single gate.** Rescored at 0.9 on every field, run 1 covers 0.786 in both languages, with every ambiguous row held. The per-field gates bought 2 to 3 rows of coverage per language and cost the one leak above.

### Run logs

- Dev: `demo/eval/runs/filter-en-dev-1.jsonl`, `demo/eval/runs/filter-es-dev-1.jsonl`
- Run 1: `demo/eval/runs/filter-en-1.jsonl`, `demo/eval/runs/filter-es-1.jsonl`
- Run 2: `demo/eval/runs/filter-en-2.jsonl`, `demo/eval/runs/filter-es-2.jsonl`

Each rescores with `scoreFilterRun(await readFilterRun(path), { gates })` and no call.

## Round 2: the named-pair hold

Carried by [#68](https://github.com/franklinmdev/justask/issues/68). Round 1 above stands as recorded. The filter now holds a named pair in code before a catalog field's gate ([ADR 0011](adr/0011-search-and-filter-hold-a-named-pair.md)): two vendors, or two statuses by their ids, joined by a word from the language's `joiners` (`or`, `and`; `o`, `u`, `y`, `e`), with no third one named. Round 1's one leak was such a pair (`facturas de Nubalia o de Cuentia de julio`, 0.61).

The owner fixed the frame on 2026-09-23, before any row existed:

- **Round 1's gates (vendor 0.6, status 0.95, date 0.85, amount 0.9) and the same six kill lines, and no dev run.** The hold asks the provider nothing new, and no dev row names a pair, so a dev run would measure only noise (checked with no call: the rule holds no dev row).
- **The same grid as round 1:** 28 filterable, 8 ambiguous, 6 nothing per language; each field in 14 filterable rows in the same one-, two- and three-field combinations, row for row; each vendor once; status paid 5, open 5, overdue 4; amount minimum 4, maximum 4, exact 3, range 3.

### Round 2 sets

Files in `demo/eval/`, drafted against every set in `demo/eval/` and all the demo's suggestions, approved by the owner in five batches on 2026-09-23 (rows 1 to 10, 11 to 20, 21 to 30, 31 to 40, 41 and 42, English beside Spanish), copied in unchanged (sha256 checked against the approved drafts) and frozen by checksum in `test/demo-filter-eval.test.ts` in the commit before the first round 2 call. Run logs `demo/eval/runs/filter-<language>-round2-<n>.jsonl`.

| File | Rows | filterable | ambiguous | nothing |
|---|---|---|---|---|
| `filter-en.round2.jsonl` | 42 | 28 | 8 | 6 |
| `filter-es.round2.jsonl` | 42 | 28 | 8 | 6 |

- **filterable:** vendors by name, typo (`brightmopp`, `brisamarr`) or a paraphrase only one vendor fits (`the print shop`, `our insurer`, `the travel agency`). **Row 19 names a third vendor beside an "or" pair** (`overdue Swiftlane invoices for runs to Clausewood or Paydale`, `facturas vencidas de Pieveloz por envíos a Lindero o a Serena`): the rule holds no pair there, and the courier is expected. The open status is written as unpaid and not yet due, as in round 1.
- **ambiguous, two per field:** vendor, row 29 an "or" pair (`Inkhollow or Papergrove invoices from March`) and row 30 an "and" pair (`Beanhaven and Larkspur invoices over $200`), whose other field still fills; status `we haven't settled`, `still outstanding`; date `mid-August`, `April or May`; amount `around $300`, `over $500 or under $50`.
- **nothing:** a vendor the catalog lacks (the phone company), undoing a payment, today's date, 50 rows per page, a sort by amount, a thank-you.
- **One approved exception, found after the runs:** `es-r2-n42`, `perfecto, gracias`, is also the card's round 5 row `es-r5-40`. The two sets were frozen seconds apart from parallel sessions (#68, #73), neither able to see the other, and the row filled nothing in either flow in either run. The owner ruled on 2026-09-23 that both sets and verdicts stand; the repeat check in `test/demo-filter-eval.test.ts` allows this one row by id.
- Checked with no call, and pinned in `test/demo-filter-eval.test.ts`: the code holds the vendor of rows 29 and 30 in both languages, and no other field of any row. Every expected date and amount is one the parser builds on Tuesday 2026-09-22 (`invoices from May` read no date, so row 32 says `dated in May`, before approval).
- Procedure as round 1, with the probe baseline in `demo/eval/probe.ts`: run 1 gives the verdict (`filter.ts run <en|es> round2 1`), run 2 reports flips only (`compare <en|es> round2 1 2`).

## Round 2: result

**Verdict: PASS.** Both languages clear every kill line in run 1 with no miss at all: every filterable row filled its whole filter object right, every ambiguous row stayed held, no nothing row filled a field. Runs of 2026-09-23 with `jev-1.13.0`, gates vendor 0.6, status 0.95, date 0.85, amount 0.9, the named-pair hold (ADR 0011), the same six kill lines and today fixed at Tuesday 2026-09-22.

### Run 1: the verdict

| Measure | Kill line | English | Spanish |
|---|---|---|---|
| exact | at least 0.9 | 1 (28 of 28) | 1 (28 of 28) |
| coverage | at least 0.7 | 1 (28 of 28) | 1 (28 of 28) |
| invented | at most 0 | 0 | 0 |
| held ambiguous | at least 0.75 | 1 (8 of 8) | 1 (8 of 8) |
| p95 | at most 800 ms | 349 ms | 329 ms |
| errors | at most 0 | 0 | 0 |
| cost per call | | $0.0000578 | $0.0000603 |
| probes' median (baseline 235 ms) | | 260 ms, normal | 239 ms, normal |

### Run 2: flips only

No flip in either language; p95 297 and 354 ms, probes normal (206 and 214 ms).

### What #68 set out to fix

- **The hold kept the named pairs out; the provider alone would not have.** Read with no hold at the vendor gate of 0.6, the Spanish pair rows filled a vendor in both runs (`facturas de Letranueva o de Tintaverde de marzo`, Letranueva 0.65 and 0.63; `facturas de Cafetal y de Cazuela Azul de más de $200`, Cafetal 0.68 and 0.74), and the English "and" pair in run 2 (`Beanhaven and Larkspur invoices over $200`, Beanhaven 0.60, on the gate). Without the hold, Spanish held ambiguous would have been 6 of 8 in both runs, 0.75, on the line with no slack: round 1's leak (`Nubalia o Cuentia`, 0.61) again, as the ADR expected.
- **No false hold.** Row 19, the third vendor beside an "or" pair, filled the courier at 0.99 in both languages and both runs, and the rule held nothing but the two pair rows' vendors.
- **This set read easier than round 1's.** Coverage 1 against round 1's 0.857 and 0.893: no named vendor with a date range beside it read as unsure, and no typo read as no vendor, the misses that cost round 1 its coverage. The status, date and amount gates held every wrong pick below them (status 0.73 English, 0.88 Spanish; date 0.80; amount 0.57), as in round 1. A perfect score on 42 rows says the rows were answerable, not that the filter never misses.

### Run logs

- Run 1: `demo/eval/runs/filter-en-round2-1.jsonl`, `demo/eval/runs/filter-es-round2-1.jsonl`
- Run 2: `demo/eval/runs/filter-en-round2-2.jsonl`, `demo/eval/runs/filter-es-round2-2.jsonl`
