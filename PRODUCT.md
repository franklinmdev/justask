# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- The package: a TypeScript core with no UI, then React bindings (hooks plus unstyled components).
- The demo: Vite + React, run locally only.
- Undecided, for the grilling: the server handler's shape per framework.

## Users

- **Primary: the developer** who adds justask to a TypeScript and React app so the app's people can type what they want instead of working the UI by hand.
- **Secondary: the person using that app.** They type a request in plain language, see the app's own state come back (search results, table filters, a filled form or record card), and confirm it before anything is saved.

## Product Purpose

justask turns what a person types in plain language into an app's own state: search results, table filters, a filled form or a record card. The person confirms before anything is saved.

Success for the developer: the typed request lands as the exact object their app already understands, and a field the model is unsure of stays empty instead of wrong. Success for the person: fewer steps than the form, and nothing saved they did not see.

## Positioning

The provider model never writes a value. Code finds the candidates (parsed dates, times and amounts; catalog rows; files), the model picks among them, one choice per decision, each with `not_mentioned` and `not_available`, and code builds the result. A per-field gate on the winner's probability, fixed before any run and measured on real data, leaves unsure fields empty. The package is extracted from three lab experiments that passed, not designed from scratch.

## Operating Context

- The developer wires justask into an existing app: a catalog, a table's filter shape, a form's fields, and app config written as facts (for example `local_currency`). No question may name a country.
- The API key stays on the server. A server handler calls the provider; the key never ships to the browser.
- The person meets justask inside the host app, as a text box that produces a card or a filter they review.

## Capabilities and Constraints

- **Core, no UI:** candidate parsers, question builders, gates, reading the provider's own `none` label, and a server handler.
- **React first:** hooks plus unstyled components; other frameworks later.
- **Model-agnostic core.** Jev (`jev-1.13.0`, TypeSafe, `@typesafe-ai/sdk`) is the first provider adapter. "Jev" may appear in the README and keywords, never in the package name.
- **Nothing auto-submits.** Every card is confirmed by hand, with undo after saving.
- **Gates** are per field, on `probabilities[choice]`, fixed before a run and measured on real data; never a default. Read the provider's `none` label rather than thresholding the maximum.
- **Language:** everything is written in English; the package supports English and Spanish first. No country-specific sets or parsers ship in the package.
- **Private until it works:** the repo is private, nothing is published to npm, the demo is not deployed. Going public is the owner's call later.
- **Undecided:** the license; the provider adapter's shape, so a second model fits without touching the core; which of search, filter and card ships first; the public demo's call budget (decided for later: the owner's key with per-visitor and daily limits).

## Brand Commitments

- Name: `justask`. The package name never contains a provider's name.
- The demo is a fictional English app with a Spanish toggle. No real business, person or brand appears in it.

## Evidence on Hand

From `~/jev-lab` (private lab, `main`), measured, not claimed:

- `experiments/search/RESULT.md`: one `choice` over the candidates with a `none` label; the `none` label beat thresholding the maximum, 10 of 10 against 8 of 10.
- `experiments/filter/RESULT.md`: passed 6 of 6 lines. Exact object 23 of 23 covered rows, coverage 74.2%, p95 487 ms, $0.0000942 per call.
- `experiments/card/RESULT.md`: passed 7 of 7 lines. Zero edits 41 of 42, coverage 98.9%, nothing invented, ambiguous fields left empty in 7 of 8 (6 of 8 under the stricter definition the filter experiment used, exactly on its line), p95 645 ms, $0.0001318 per call. Open fix: code, not the gate, should hold "next X" dates.
- `LEARNINGS.md`, sections "Filtro por intención" and "Tarjeta de cita".

There are no users, testimonials, customers or public benchmarks. None may be invented.

## Product Principles

1. **Code proposes, the model picks, code builds.** The provider never writes a value.
2. **Empty beats wrong.** An unsure field stays empty for the person to fill.
3. **The person has the last word.** Nothing saves without a confirm, and every save can be undone.
4. **Numbers before claims.** Every gate and every claim comes from a measured run on real data.
5. **No lock-in to one model.** The core outlives any provider.

## Accessibility & Inclusion

WCAG 2.2 AA for the components and the demo. The unstyled components ship inside other people's apps, so keyboard use, focus order and screen reader announcements (for example a field held empty, or a card ready to confirm) must work without the host adding them.
