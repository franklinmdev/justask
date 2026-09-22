# Search gates on the `none` label, not on the winner

A search fills its item with the top candidate only when that candidate wins outright and the `none` label's probability stays below the search's gate. A `none` pick or a tie for first place still holds. This amends the spec's "gate on the winner's probability" for search only; filter and card fields keep gating their pick.

In a search question the probability is spread across every candidate on the shortlist, so near-duplicates split it: in the lab (`~/jev-lab/experiments/search/RESULT.md`, finding 1) two copies of a resume went 0.63 / 0.37 and three certificates 0.45 / 0.35 / 0.15. A gate of 0.5 on the winner held two requests whose right answer was first. The `none` label in the same answer sat at 0.00 to 0.03 on every request with an answer and at 0.58 or more on every request without one, so gating on it scored 10 of 10 against 8 of 10, with no new calls.

## Consequences

- For search, a gate is the `none` probability at which the item is held, still declared per search with no default (ADR 0003) and measured on an eval set.
- The more near-duplicates a catalog holds, the lower the winner's probability, and that no longer holds the item.

## Considered Options

- Gate on the winner's probability, as #7 first read: misfires when candidates look alike, which is the normal case in a real catalog. Rejected.
- Both rules, chosen per search: more surface, and the eval function would have to measure both. Rejected.
