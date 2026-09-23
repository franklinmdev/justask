# Search eval: sets, kill lines and verdict

**Status: run, verdict FAIL (Spanish held ambiguous 0.667 against 0.75).** Approved by the owner on 2026-09-22 (#13), with the shortlist raised to 14; the eval sets, the kill lines and the gate rule were frozen then, before any provider call.

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

1. Dev runs, as many as tuning needs: `node --conditions=source demo/eval/search.ts run <en|es> dev <n>`. They print no verdict.
2. Fix the gate by the rule above and write it into the demo. The eval sets and kill lines are already frozen: `test/demo-eval.test.ts` checks the sets' checksums and the kill lines' values, so an edit fails CI.
3. Run 1 per language gives the verdict: `node --conditions=source demo/eval/search.ts run <en|es> eval 1`.
4. Run 2 per language reports flips only: `run <en|es> eval 2`, then `compare <en|es> 1 2`.
5. Record here the verdict, the numbers, the misses and the run logs' paths (`demo/eval/runs/`, committed so anyone can rescore them with no call).

A row found wrong after a run is the owner's call, logged here; it never silently changes the set.

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
