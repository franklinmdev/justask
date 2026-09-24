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

**Shape**:
The construction an eval row's expected value turns on, beyond naming a vendor, what was bought, a day and an amount plainly: a typo, a named pair, a maybe, a period for a day, a delete. A plain card record's shape is the item of the tag cover that decides its tags. From card round 7 on, each row names its shape and no shape has more than two rows per language, so one construction never carries a verdict alone (docs/card-eval.md).
_Avoid_: Pattern, template, category

**Dev set**:
Requests used to tune questions and parsers. It never decides a verdict.
_Avoid_: Training set, validation set

**Kill line**:
A pass or fail threshold on one measure (exact, coverage, invented, held ambiguous, p95, errors), written and frozen before the first scored run on an eval set.
_Avoid_: Target, KPI, acceptance criterion

**Run log**:
The raw answers of one eval run, saved with the gate and kill lines it ran under. Rescoring at another gate and comparing a second run read it, never the provider.
_Avoid_: Results, output, trace

**Transport failure**:
An error where the provider did not answer at all: a timeout, or an overload status such as 529, another 5xx, or a lost connection, after `ask`'s one more call (ADR 0013). Not an answer that broke the contract, nor an adapter that threw otherwise. On the errors line it leaves the line pending, and only its rows are remeasured (docs/card-eval.md, Latency).
_Avoid_: Outage, flake, provider error (which covers both)

**Remeasure**:
A later run of only the rows a verdict run left pending on transport failures, whose answers replace theirs in that run's report. Not a full rerun of the set, which the latency rule asks for.
_Avoid_: Retry (the product's one more call), rerun

**Provider probe**:
A fixed request an eval run sends straight to the provider before its rows and after, so the run log holds the provider's latency apart from the flow's. Not the diagnostic probe sets, which are eval rows, nor the warm-up.
_Avoid_: Ping, health check

**Warm-up**:
Calls of the provider probe's request that an eval run sends first and discards, before the measured probes and before any row, so a cold start after idle falls on them. Logged, never counted in the probe median or the p95. The demo's recording script sends the same before its recorded calls, and the demo's dev server sends one on start, before a visitor's first request.
_Avoid_: Priming, preflight

**Slow window**:
An eval run whose provider probes' median is more than twice the baseline declared before it. Its quality lines still decide, and so does a p95 that passes its line; a p95 that fails is measured again on the same rows in a normal window.
_Avoid_: Outage, bad run, flaky run

**Held field**:
A field left empty because its pick did not clear the gate, because the provider picked `not_mentioned` or `not_available`, because a parser marked its candidates ambiguous (such as "next Friday"), because the request names a pair of the field's items, or, on a card, because the request is a command on an existing record. Empty looks the same whatever the reason.
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
Two items of one catalog field that a request names with a joiner between them, and no third item of that field: "Tallyroot or Cloudberth", "Lindero y Serena". An "or" word holds any catalog field, an "and" word only a field that takes one item. The search holds its item, and the filter and the card that field, before the gate, whatever the pick (ADR 0010, 0011). A filter's catalog field may opt out with `heldByPair: false` (ADR 0011).
_Avoid_: Choice, either-or

**Implied value**:
The items a catalog item declares for another field of a card (`implies`): the demo's office-only vendors imply the `office` tag. The card fills them only in a gap, and says the value came from the other field (ADR 0012).
_Avoid_: Default, inferred value

**Tag cover**:
What each tag of the demo's expense card covers, the rule an eval row's expected tags follow: a record expects every tag whose cover it meets and no other. `meals` is anything eaten or drunk, `travel` getting somewhere and staying there, `office` what the business buys to run itself, not what it bills through to a client, and `client` a client paying or present, said for certain. Written for the eval's rows (docs/card-eval.md, Tag cover); the tags' labels are the card's and did not change with it.
_Avoid_: Tag rule, tag definition

**Gap**:
What a card field where several items may apply is left with when its own questions settle nothing: no named pair holds it, every implied item answered `not_mentioned` or `yes`, and every other item `not_mentioned`, each at any probability, and the field did not fill. A `not_available`, a tie or another item filled is no gap (ADR 0012).
_Avoid_: Empty field, blank
