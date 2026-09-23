# Search eval: sets, kill lines and verdict

**Status: draft, waiting for the owner's approval (#13).** Nothing below has been run against the provider. Once approved, the sets, the kill lines and the gate rule are frozen before the first scored run, and this file gains the result.

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

## Dev-set change proposed before the scored run

Checked with no call: in 5 of the 16 dev item rows the expected vendor never reaches the provider (`the attorneys`, `salary processing`, `liability coverage`, `quien revisó el acuerdo de confidencialidad`, `el pago de salarios`). The demo's shortlist keeps 10 of 14 vendors, text matches first and the catalog's first ones after, so the last four vendors are reachable only by a shared word. This is the lab's finding 3 again (`~/jev-lab/experiments/search/RESULT.md`). Proposed: raise `SHORTLIST_LIMIT` to 14, the whole catalog, before any call. It costs four more candidates per call.

## Procedure

By hand with the key in `.env`, never in CI; every row is a paid call.

1. Dev runs, as many as tuning needs: `node --conditions=source demo/eval/search.ts run <en|es> dev <n>`. They print no verdict.
2. Fix the gate by the rule above and write it into the demo. Freeze: the sets and kill lines get a checksum test, so an edit after this point fails CI.
3. Run 1 per language gives the verdict: `node --conditions=source demo/eval/search.ts run <en|es> eval 1`.
4. Run 2 per language reports flips only: `run <en|es> eval 2`, then `compare <en|es> 1 2`.
5. Record here the verdict, the numbers, the misses and the run logs' paths (`demo/eval/runs/`, committed so anyone can rescore them with no call).

A row found wrong after a run is the owner's call, logged here; it never silently changes the set.

## Result

Not run yet.
