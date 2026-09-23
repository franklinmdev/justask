# justask

Turns what a person types in plain language into an app's own state. Code finds the candidates, a provider model picks among them, code builds the result, and the person confirms it.

## Language

**Request**:
What the person types, in plain language, in English or Spanish.
_Avoid_: Prompt, query, input

**Candidate**:
A value code found for a decision before the provider is asked: a parsed date, time or amount, a catalog row, a file.
_Avoid_: Option, suggestion

**Catalog**:
The host app's own list of things a request can point at: products, clients, services, files. It lives in the host app, never in justask.
_Avoid_: Index, dataset

**Shortlist**:
The few catalog candidates the host app returns for one request, which the provider then orders.
_Avoid_: Results, top-k

**Parser**:
Code that finds candidates in a request: dates, times, amounts. justask ships English and Spanish parsers; a host app can add its own.
_Avoid_: Extractor, NER

**Facts**:
What the provider is told about the world alongside a request: today in the person's time zone, the host app's local currency, catalog descriptions. Written as facts; no question names a country.
_Avoid_: Context, settings, metadata

**Question**:
One decision put to the provider as a single choice among labelled candidates, always including `not_mentioned` and `not_available` (or `none` and `several` labels where there is one target).
_Avoid_: Prompt, field question

**Pick**:
The label the provider chose for one question, with its probability.
_Avoid_: Answer, prediction, extraction

**Provider**:
The model service that answers questions. It picks; it never writes a value. Spanish UI copy calls it "el modelo", since "proveedor" is a vendor.
_Avoid_: LLM, AI, backend

**Field**:
One named slot of a filter or card, declared by the developer with its kind, a description the question uses, and its gate.
_Avoid_: Property, attribute, slot

**Field kind**:
Where a field's candidates come from: date, time, amount (from parsers), catalog (from the host app), or yes-or-no.
_Avoid_: Type, field type

**Gate**:
The minimum probability a pick needs before its field is filled. A search reads it the other way, on its `none` and `several` labels: the item is held once either reaches the gate (ADR 0005, 0007). Every field declares its own, a number strictly between 0 and 1; there is no default. Fixed before any run and measured on an eval set. Spanish UI copy calls it "umbral".
_Avoid_: Threshold, confidence cutoff (in English)

**Eval set**:
Real requests, each with the result a person expects, used to measure a gate before it is fixed.
_Avoid_: Test set, benchmark, gold

**Dev set**:
Requests used to tune questions and parsers. It never decides a verdict.
_Avoid_: Training set, validation set

**Kill line**:
A pass or fail threshold on one measure (exact, coverage, invented, held ambiguous, p95, errors), written and frozen before the first scored run on an eval set.
_Avoid_: Target, KPI, acceptance criterion

**Run log**:
The raw answers of one eval run, saved with the gate and kill lines it ran under. Rescoring at another gate and comparing a second run read it, never the provider.
_Avoid_: Results, output, trace

**Provider probe**:
A fixed request an eval run sends straight to the provider before its rows and after, so the run log holds the provider's latency apart from the flow's. Not the diagnostic probe sets, which are eval rows, nor the warm-up.
_Avoid_: Ping, health check

**Warm-up**:
Calls of the provider probe's request that an eval run sends first and discards, before the measured probes and before any row, so a cold start after idle falls on them. Logged, never counted in the probe median or the p95.
_Avoid_: Priming, preflight

**Slow window**:
An eval run whose provider probes' median is more than twice the baseline declared before it. Its quality lines still decide, and so does a p95 that passes its line; a p95 that fails is measured again on the same rows in a normal window.
_Avoid_: Outage, bad run, flaky run

**Held field**:
A field left empty because its pick did not clear the gate, because the provider picked `not_mentioned` or `not_available`, because a parser marked its candidates ambiguous (such as "next Friday"), or, on a card, because the request is a command on an existing record or names a pair of the field's items. Empty looks the same whatever the reason.
_Avoid_: Abstained field, unknown, null field

**Confirm**:
The person's explicit approval of a result before anything is saved. Nothing leaves justask for the host app without it.
_Avoid_: Submit, auto-apply

**Host app**:
The developer's application that uses justask. It saves confirmed results and owns undo; justask hands it the confirmed object and the place for the undo control.
_Avoid_: Client app, consumer

## Flows

**Search**:
A request resolved to one item among candidates, or to none.

**Filter**:
A request resolved to the exact filter object a table in the host app already understands. Declared with its fields and a description of what one row of that table is; every field's question reads that description.

**Card**:
A request resolved to a filled record, such as an expense or an appointment, gated first by an intent question.
_Avoid_: Form fill, record card

**Command**:
A request that acts on a record that already exists ("quite el gasto de $75", "send the invoice to accounting"): a verb and a reference from the card's per-language lists. The card holds every field before the intent's gate, whatever the pick (ADR 0009).
_Avoid_: Edit request, action

**Named pair**:
Two items of one catalog field that a request names with a joiner between them, and no third item of that field: "Tallyroot or Cloudberth", "Lindero y Serena". An "or" word holds any catalog field, an "and" word only a field that takes one item. The card holds that field before its gate, whatever the pick (ADR 0010).
_Avoid_: Choice, either-or
