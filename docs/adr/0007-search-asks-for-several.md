# Search asks for `several` beside `none`

Amends ADR 0005. A search question carries two labels of its own beside the candidates: `none`, no candidate fits the request, and `several`, more than one candidate fits it. The item fills only when a candidate wins outright and both `none` and `several` stay below the search's gate. A `none` or `several` pick, or a tie for first place, still holds. `several` is read exactly as `none` is: one more label in the same answer, against the same gate, not a second rule.

Two frozen eval rounds failed on the same kill line, held ambiguous in Spanish, at gates of 0.2 and 0.15 (`docs/search-eval.md`). The requests that leaked, ones that could mean two vendors, carried a `none` as low as the right answers' (0.03 to 0.19): `none` tells "some candidate fits" from "nothing fits", and has no way to say "more than one fits". On round 2 no gate on `none` passed both languages. One leak was a near tie the provider saw (Tecnoria 0.46, Nubalia 0.43, `none` 0.11); the question gave it no label to say so. Lesson 2 of the lab's search result applies: an alternative within one question is asked of the provider, so "more than one fits" becomes a label in the same distribution rather than logic in code.

## Consequences

- `several` is a reserved label like `none`: a shortlist candidate cannot use either id.
- One gate per search, still declared with no default (ADR 0003), read on both labels. A search does not get a second gate for `several`.
- A saved run log from before this ADR has no `several` probability. It reads as 0, so rescoring rounds 1 and 2 gives exactly the results recorded for them.
- The eval report shows `several` beside `none` on every miss and flip, and the demo's state panel says which of the two held the item.
- Whether `several` also catches the confident single picks (Letranueva at 0.96 on `el trabajo de impresión`) is not known until it is measured. The dev sets measure it first; a fresh, frozen round decides the verdict.

## Considered Options

- A margin rule on the top two candidates: a second rule in code, which ADR 0005 already rejected, and it could not catch a confident single pick. Rejected.
- A lower held ambiguous kill line: changes what the product promises, not what it does. Rejected by the owner.
- Rewording the catalog descriptions: tunes the demo's data, not the package, and every host app would have to rediscover it. Not taken.
