# Measuring a gate

The examples below run the README's declarations, [`search.ts`](../README.md#search), [`expense.ts`](../README.md#card) and [`provider.ts`](../README.md#the-provider), through an eval set.

## A search's gate

Every gate is declared with no default, so it has to come from measurement. `@justask/core/eval` runs an eval set through the real pipeline, with the real provider, and scores it the way the lab did. It runs by hand, never in CI, because every row is a paid call.

An eval set is JSONL, one request per line with the result a person expects. `item` rows name the candidate id they mean. `nothing` rows have no item to find. `ambiguous` rows could mean more than one candidate, so their item must stay held:

```jsonl
{"id": "s01", "request": "invoices from Acme", "kind": "item", "expected": "acme"}
{"id": "s02", "request": "what is my balance?", "kind": "nothing"}
{"id": "s03", "request": "the Acme or Northwind bills", "kind": "ambiguous"}
```

Write the kill lines before the first run. The run log saves them with the gate, so the verdict cannot be tuned after you see the numbers:

```ts
import { readFile } from "node:fs/promises";
import { formatReport, parseEvalSet, runEval, scoreRun } from "@justask/core/eval";
import { provider } from "./provider";
import { search } from "./search";

const run = await runEval({
  set: parseEvalSet(await readFile("eval/search.jsonl", "utf8")),
  search, // the same declaration the handler uses, with the gate under test
  provider,
  facts: { today: "2026-09-22" }, // fixed, so every run reads the same day
  timeoutMs: 2_000,
  killLines: { exact: 0.9, coverage: 0.7, invented: 0, heldAmbiguous: 0.75, p95Ms: 800, errors: 0 },
  log: "eval/runs/search-1.jsonl", // refuses to overwrite a saved run
});
console.log(formatReport(scoreRun(run)));
```

The report gives exact (filled items that are the expected one), coverage (item rows that filled), invented (nothing rows that got an item), held ambiguous, p95 latency, errors and cost per call, then checks each kill line. `exact`, `coverage` and `heldAmbiguous` must be at least their line, and the other three at most theirs. A line the set cannot measure fails; for example, a set with no ambiguous rows fails `heldAmbiguous`. Misses name whether the expected item never reached the shortlist, a named pair held it (ADR 0011), or the provider picked wrong.

The p95 line reads the provider's latency and yours together. To tell them apart, pass `probe`: a fixed provider input under `input` (`request`, `facts`, `questions`), how many `warmUp` calls to send first and discard (so a cold start after idle falls on them, not on your rows), how many `times` to send it before the rows and again after, and a `baselineMs` declared before the run (or `null` until you have one). The log saves each probe's latency. When the probes' median is more than twice the baseline, the report marks a slow window: the quality lines still decide, and so does a p95 that passes its line; a p95 that fails is pending, to be measured again on the same rows when the probes are normal. `probeMedian` over earlier runs' probes gives the baseline; `readProbes(log)` gives null for a log saved before probes, so drop those first:

```ts
import { type Probe, probeMedian, readProbes } from "@justask/core/eval";

const earlier = await Promise.all(["eval/runs/search-1.jsonl", "eval/runs/search-2.jsonl"].map(readProbes));

// Passed as `probe` to runEval, runFilterEval or runCardEval.
export const probe = {
  input: {
    request: "invoices from Acme",
    facts: { today: "2026-09-22" },
    questions: [
      {
        id: "vendor",
        instruction: "Which vendor does the request mean?",
        labels: [
          { label: "acme", description: "Acme Supplies" },
          { label: "none", description: "no vendor" },
        ],
      },
    ],
  },
  warmUp: 3,
  times: 3,
  baselineMs: probeMedian(earlier.flatMap((probes) => probes ?? [])),
} satisfies Probe;
```

The saved log is enough for everything else, with no provider call:

- `scoreRun(await readRun(log), { gate: 0.3 })` rescores at another gate. A gate chosen after seeing the run gives no verdict, because it would be judged on the rows it was tuned on.
- `compareRuns(first, second)` lists only the rows whose item flipped in a second run of the same set. The verdict stays with the first run; `formatReport(scoreRun(second), flips)` prints the second run's measures and its flips, with no verdict of its own.

Keep a separate dev set for tuning descriptions and shortlists, and never let it decide a verdict.

## A filter's gates

A filter has one gate per field, so its eval set names the filter object a person expects. A `filterable` row gives each field it mentions a value: a catalog field's candidate id, a date field's `{ from, to }`, an amount field's `{ min, max, exact, currency }`. A field left out is not mentioned and must stay empty. An `ambiguous` row marks at least one field `"held"` (`HELD`, exported by `@justask/core/eval` for code that reads a set); a `nothing` row expects no field at all:

```jsonl
{"id": "f01", "request": "Acme invoices over $500 last month", "kind": "filterable", "expected": {"vendor": "acme", "issued": {"from": "2026-08-01", "to": "2026-08-31"}, "total": {"min": 500, "currency": "USD"}}}
{"id": "f02", "request": "Acme or Northwind invoices", "kind": "ambiguous", "expected": {"vendor": "held"}}
{"id": "f03", "request": "how do I mark an invoice as paid?", "kind": "nothing"}
```

`runFilterEval` takes the same input as `runEval`, with `filter` in place of `search`, and logs each field's candidates and the provider's raw answer. `scoreFilterRun(run)` reports coverage (filterable rows where every expected field filled), exact (of those, the whole object right, no extra field), invented (nothing rows that filled any field) and held ambiguous (ambiguous rows whose held fields stayed empty), then each field on its own: filled, right, wrong, and, read with no gate, its lowest right pick and highest wrong pick, which is what a field's gate is fixed from. A field's pick is its weakest one: a date field's start or end, an amount field's weakest number. `scoreFilterRun(run, { gates: { vendor: 0.7 } })` rescores any field at another gate with no call and no verdict, and a gate for a field the run does not have throws; `compareFilterRuns` and `formatFilterReport` work as their search counterparts, flipping per field.

## A card's gates

A card has the intent's gate and one per field, and its eval set names the record a person expects. A `record` row asks for a new record and gives each field it mentions a value: a catalog field's candidate id, a several-item field's ids, a date field's `YYYY-MM-DD`, a time field's `HH:MM`, an amount field's `{ value, currency }`. A field left out must stay empty. An `ambiguous` row asks for a record too and marks at least one field `"held"`; a `nothing` row asks for no new record, so it has no `expected`:

```jsonl
{"id": "c01", "request": "log a $42 client lunch with Northwind yesterday", "kind": "record", "expected": {"vendor": "northwind", "tags": ["meals", "client"], "spent_on": "2026-09-21", "total": {"value": 42, "currency": "USD"}}}
{"id": "c02", "request": "lunch at Acme or Northwind, $30", "kind": "ambiguous", "expected": {"vendor": "held", "total": {"value": 30, "currency": "USD"}}}
{"id": "c03", "request": "delete yesterday's lunch", "kind": "nothing"}
```

```ts
import { readFile } from "node:fs/promises";
import { formatCardReport, parseCardEvalSet, runCardEval, scoreCardRun } from "@justask/core/eval";
import { expense } from "./expense";
import { provider } from "./provider";

const run = await runCardEval({
  set: parseCardEvalSet(await readFile("eval/card.jsonl", "utf8")),
  card: expense, // the same declaration the handler uses, with the gates under test
  provider,
  facts: { today: "2026-09-22", local_currency: "USD" },
  timeoutMs: 2_000,
  killLines: { exact: 0.9, coverage: 0.7, invented: 0, heldAmbiguous: 0.75, p95Ms: 1_000, errors: 0 },
  log: "eval/runs/card-1.jsonl", // refuses to overwrite a saved run
});
console.log(formatCardReport(scoreCardRun(run)));
```

`scoreCardRun(run)` scores the card as the person meets it: exact is the share of cards that filled anything with nothing to correct (a held field is no correction), coverage the share of the fields the cards expect that filled, invented the nothing rows that filled any field, and held ambiguous the ambiguous rows whose held fields stayed empty. It then reports the intent over the run and each field on its own, as the filter's report does. `scoreCardRun(run, { gates: { intent: 0.5, vendor: 0.7 } })` rescores at other gates with no call and no verdict; `readCardRun`, `compareCardRuns` and `formatCardReport` work as their search counterparts. The demo's card is measured this way: [card-eval.md](card-eval.md) has its sets, kill lines and every round's verdict.
