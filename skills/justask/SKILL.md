---
name: justask
description: Write correct code with justask (@justask/core), the TypeScript and React package that turns what a person types in plain language into an app's own state. It covers a search box that resolves to one catalog item, a table filter built from a sentence, and a record card (an expense, an appointment) filled from a sentence, with the person confirming before anything is saved. Use this whenever code imports @justask/core, and whenever a feature needs typed requests over an app's own data, even if nobody names justask. Typical asks are "let users type what they want instead of clicking filters", "fill this form from one sentence", "natural-language search over our customers", or "AI fill for the expense form". Read it before hand-rolling an LLM prompt that returns JSON for a form or a filter.
---

# justask

justask turns a typed request into the exact object an app already
understands: a search's item, a filter object, a filled record. Code finds the
candidates (parsed dates, times and amounts; a shortlist of the host app's
catalog rows), a provider model picks one label per question with a
probability for every label, and code builds the result. A field the model is
unsure of stays empty for the person to fill, and nothing reaches the host app
until the person confirms.

Most mistakes with justask come from treating it like a general LLM wrapper:
expecting it to write values, inventing a gate, treating an empty field as an
error, or calling the provider from the browser.

## Read the live docs first

The README and the guides on GitHub are the contract. This skill gives
direction and does not copy the API, because a stale copy makes agents invent
options and fields. Before writing a declaration, a handler or a hook, read
the current page for it:

| Need | Read |
| --- | --- |
| Install, the provider, and a first search, filter and card | [README](https://github.com/franklinmdev/justask/blob/main/README.md) |
| What a handler checks, its statuses, errors, Node and Express mounting | [docs/handlers.md](https://github.com/franklinmdev/justask/blob/main/docs/handlers.md) |
| Filter field kinds, named pairs, how dates and amounts are read, host parsers | [docs/filter.md](https://github.com/franklinmdev/justask/blob/main/docs/filter.md) |
| Card field kinds, when each is held, how `useCard` treats the person's own edits | [docs/card.md](https://github.com/franklinmdev/justask/blob/main/docs/card.md) |
| Measuring a gate on an eval set | [docs/measuring-gates.md](https://github.com/franklinmdev/justask/blob/main/docs/measuring-gates.md) |
| Why a rule exists | [docs/adr/](https://github.com/franklinmdev/justask/tree/main/docs/adr) |
| The words (request, candidate, pick, gate, held field) | [CONTEXT.md](https://github.com/franklinmdev/justask/blob/main/CONTEXT.md) |

The installed package's own `README.md` (in `node_modules/@justask/core/`) and
its type declarations are the offline fallback; trust them over memory. If you
cannot reach either, say so instead of guessing an option name.

If the project does not depend on it yet: `npm i @justask/core`, plus
`@typesafe-ai/sdk` for the Jev provider and React 19 for the hooks. Node 22 or
later.

## Pick the flow

| The person types... | Flow | Server | Browser |
| --- | --- | --- | --- |
| something that means one item of a catalog ("the Acme invoice") | Search | `createSearchHandler` with a `Search` | `useSearch` |
| what to show in a table ("unpaid invoices from Acme over $500 last month") | Filter | `createFilterHandler` with a `Filter` | `useFilter` |
| a new record to create ("$42 client lunch with Northwind yesterday") | Card | `createCardHandler` with a `Card` | `useCard` |

`ask` from `@justask/core` runs any flow without HTTP, for a server action or a
script; there the caller writes `today` in `facts` itself. `@justask/core/eval`
measures gates. `@justask/core/jev` is the Jev provider; another model
implements the one-method `Provider` type.

## What agents get wrong

### The provider picks; it never writes (ADR 0002)

Every value comes from a candidate code found: a parsed date, time or amount,
or a catalog row from the host app's `shortlist`. A value no parser or catalog
can produce, such as a free-text note or a new customer's name, cannot be
filled; leave that field to the person. Do not add a "let the model write it"
escape hatch: an invented value is the one thing the package promises never to
produce, and there would be nothing for a gate to measure.

A catalog row's `description` is what the provider reads, so write it as the
words a person would use for that row. Its `value` is what the app gets back
and is never sent to the provider, but the whole shortlist (values included)
reaches the browser, so keep secrets out of `value`, `names` and `implies`.

### Gates have no default (ADR 0003)

Every search, filter field, card and card field declares a `gate`, a number
strictly between 0 and 1, and a declaration without one does not compile.
Timeouts (`timeoutMs`) and `debounceMs` have no default either. The failure
is a guessed number presented as right, which then ships unmeasured. Write a
placeholder with a comment saying it must be measured, and point to
`docs/measuring-gates.md`: an eval set of real requests, kill lines written
before the first run, then `runEval`, `runFilterEval` or `runCardEval` with
the real provider, by hand and never in CI, since every row is a paid call.

A search gate reads the other way: the item is held once the `none` or
`several` label reaches the gate (ADR 0005, 0007), so a lower search gate is
stricter.

### Held fields and `none` are success, not failure

An empty field means the system did its job: the model was unsure, the
request did not mention it, or code saw an ambiguity. The result is a `200`
with the field left out of `value`. Do not call again, raise an error,
lower the gate on the spot, or fill the field with a guess. Render it empty for
the person to fill with the app's own control. Only `error` (kind `provider`
or `timeout`, from a `200`) means the provider failed, and even then every
field is simply held and the app keeps working by hand.

### Reading why a field is held

There is no single `reason` property. Read the result in the order the code
holds, and stop at the first match:

1. `error` present, or empty `probabilities`: no answer came back.
2. Card only: `card.intent.passes` is false. `intent.command` (a request to
   change an existing record, ADR 0009) or `intent.marker` (a role marker such
   as "System:", ADR 0015) held everything; otherwise the intent pick was not
   `new_record` at its gate. A filter's `filter.marker` works the same way.
3. The field's `pair` is set: the request named two items of that field ("Acme
   or Northwind"), held whatever the pick (ADR 0010, 0011). On a card, a
   `negated` entry matching the pick holds it too (ADR 0016).
4. `pick` is null: a tie for first place.
5. `pick.label` is `not_mentioned` or `not_available`.
6. The picked candidate's `value` is marked: `ambiguous` ("next Friday" with
   two readings), `afterToday` on a past-reading card date, a period on a card
   date, or an amount whose currency did not resolve.
7. `pick.probability` is below `gate`.

Date and amount fields of a filter, and several-item card fields, report
`answers` keyed by question instead of one `pick`; the weakest answer decides.
The demo's `heldReasonOf` in
[`demo/src/card-panel.tsx`](https://github.com/franklinmdev/justask/blob/main/demo/src/card-panel.tsx)
is a working reference.

### The handler holds the key; the browser never does

Build the provider (`jevProvider()`, which reads `TYPESAFE_API_KEY`) in server
code only, pass it to a handler, and mount one handler per flow at its own
`POST` route. Handlers take a standard `Request` and return a `Response`, so
they mount as is in fetch-style servers; Node and Express need the adapter in
`docs/handlers.md`, mounted before `express.json()`. The browser hook posts
only the request and its time zone, and the handler writes `today` itself, so
never pass a `today` fact to a handler (it refuses at boot). Import a declaration into browser code as
`import type` only: the catalog stays on the server.

Declare with `satisfies Card<CardFields>` or `satisfies Filter<Fields>`. A
type annotation loses each field's kind, so `useCard<typeof expense.fields>`
types every value loosely, and a plain const fails to compile where it is
used (`Type 'string' is not assignable to type '"catalog"'`).

### A card date declares its direction (ADR 0008)

Every card `date` field needs `reads: "past"` (an expense's day) or
`reads: "future"` (a due date, an appointment), with no default. It decides
what "Friday" or "March 3" means. The failure is copying one direction onto
every date: an expense's day read forward fills a Friday that has not
happened, and a due date read backward fills one already gone. A past-reading
field holds any day after today, even "tomorrow". One card can hold both
directions. A filter always reads the past.

### The card calls on Enter

`useCard` calls the handler when the person presses Enter, unless `timing`
says `{ on: "type", debounceMs }`; `useSearch` and `useFilter` require
`timing` with no default. A field the person set while a call was out keeps
the person's value. `onConfirm` fires only on Confirm. Saving and undo are the
host app's: after Confirm, show the undo control in `CardUndo` and call
`card.restore()` when it is used. A filter may confirm itself on each answer
when its filters are cheap to undo; a record never auto-saves.

### Text the person did not write

The request is read as the person's own words, and the provider may follow
instructions written inside it. The failure is wiring an inbox, a pasted
document or OCR straight into a card that saves: one crafted email then
records whatever it says. Keep a step where the person checks the result. The
role-marker hold catches only obvious cases.

## When justask is the wrong tool

- The output is text: a reply, a summary, a description to store. justask
  only picks among candidates.
- Values that cannot be candidates: free-text notes, names not in any catalog,
  quantities a parser cannot read.
- Editing or deleting existing records: a card creates one new record and
  holds commands on existing ones.
- Exact lookups code already does (an id, a SKU, a plain substring match).
- Saving without a person confirming, or acting on text nobody typed.
- Languages other than English and Spanish, unless the host adds its own
  parsers; no regional formats ship.

Say so plainly and suggest the simpler tool rather than bending justask to
fit.

## Other providers

The core is provider-neutral. The Jev adapter is the first; any model that
answers every question in one call with a probability for every label can
implement `Provider` (ADR 0001). Jev users can also load TypeSafe's own
`typesafe-ai` skill for the provider side; justask does not depend on it.
