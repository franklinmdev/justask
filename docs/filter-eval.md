# Filter eval: sets, kill lines and verdict

**Status: sets, kill lines and gate rule approved and frozen by the owner on 2026-09-22 (#17), before any provider call. No dev run yet: it waits for #39, which changes how the filter reads "last Friday", to merge into main.**

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

Each field gets its own gate, fixed from the dev runs by a rule the owner approved before any call (`fixGate` in `demo/eval/filter-gates.ts`). The demo serves one gate per field in both languages, so the rule reads both languages' dev runs together. Read with no gate, a field's **right pick** fills it with the expected value; a **wrong pick** fills it with anything else: a wrong value, a value on a field an ambiguous row holds, or a value on a field the request never mentions. A field's pick is its weakest one.

- The midpoint between the field's highest wrong pick and its lowest right pick, rounded to 0.05, when that sits above every wrong pick.
- No wrong pick: the lowest right pick rounded down to 0.05, at most 0.9, the lab's gate.
- Overlap, or a midpoint that rounds onto a wrong pick: the first 0.05 above the highest wrong pick, since a wrong filter shown as right is worse than an empty field.
- No right pick, or no gate strictly between 0 and 1 that fits: the owner decides.

The gates are written into `demo/server/handler.ts` before run 1, so the demo serves the gates the verdict was measured at. A rescore of run 1 at other gates is reported apart and changes neither the verdict nor the demo.

## Procedure

By hand with the key in `.env`, never in CI; every row is a paid call.

1. After #39 is in main and merged into this branch: dev runs, `node --conditions=source demo/eval/filter.ts run <en|es> dev <n>`. They print no verdict.
2. `node --conditions=source demo/eval/filter.ts gates <n>` prints each field's gate by the rule; write them into the demo.
3. Run 1 per language gives the verdict: `run <en|es> eval 1`.
4. Run 2 per language reports flips only: `run <en|es> eval 2`, then `compare <en|es> 1 2`.
5. Record here the verdict, the numbers, the misses and the run logs' paths (`demo/eval/runs/`, committed so anyone can rescore them with no call).

A row found wrong after a run is the owner's call, logged here; it never silently changes the set.
