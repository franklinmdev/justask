# A card fills a value one item implies, only in a gap

Adds a fill in code after the gates, where ADR 0009 and 0010 added holds before them. It is the owner's decision of 2026-09-23 (#77, carried by #79), with the gap condition as ruled on #79 the same day.

1. **A catalog item may declare what it implies for another field of a card: `implies`, by the field's name and its items' ids.** The demo's eleven vendors that sell office services alone imply the `office` tag, in both languages (`OFFICE_ONLY` in `demo/src/content/types.ts`). The coffee vendors (`beanhaven`, `cafetal`) sell beans and machine rental, `meals` or `office`, so they declare nothing, and neither do the caterer and the travel agency. The package ships no implications: the host writes them in its catalog, and an item with none behaves as before.
2. **The card fills the implied items only where the other field's own questions left a gap.** The item must fill its own field, at its gate, on a card whose intent passed. The other field must take several items, and on it every implied item must have answered `not_mentioned`, or `yes` at any probability, and every other item `not_mentioned`. So office is added over an office tag the provider left unmentioned, or said yes to below the tags gate (the vendor confirms what the provider already said: `es-o-16` at 0.38 under #77's `current` label). It is never added over a `not_available`, a tie, a named pair (ADR 0010), or another tag the provider filled or held. The rule fills gaps and never contradicts the provider.
3. **The field's result says what filled it**: `implied: { field, id }`, the field and the item. The demo's state panel says the tags were filled from the vendor, naming it.

#77 found that the provider does not infer `office` from a service its label does not list. It answers `not_mentioned`, in English as in Spanish, and no rewording of the label filled more than the words it lists. The vendor is the one field that names the service. So the fact that "a Brightmop expense is office" goes in the catalog, and the code fills it: the lab's lesson that structure goes in code, as in ADR 0009 and 0010.

## Its cost, measured before round 6

The rule mistags a record at an office vendor that bought something else, where the provider leaves the tags empty. No frozen set had one, so the owner approved 20 probe records per language in two batches, frozen before any call (`card-<language>.notoffice.jsonl`, docs/card-eval.md). Each names an office-only vendor paid for something that is not office: 7 meals (2 with a client), 5 travel, and 8 where no tag fits (a staff gift, a donation, gala tickets). Two runs per language, of 2026-09-23 with `jev-1.13.0`, the card as the demo serves it, every probe window normal:

| Of 20 rows, runs 1 and 2 | English | Spanish |
|---|---|---|
| The tags left a gap | 8, 8 | 8, 8 |
| Of those, rows no tag fits | 8, 8 | 8, 8 |
| The vendor filled, so the rule added office | 6, 6 | 4, 4 |
| A tag filled where a tag fits | 12 of 12, both runs | 12 of 12, both runs |

- **The provider leaves the gap exactly where no tag fits, and nowhere else.** On every row that names a meal, a trip or a client, it filled that tag, from 0.53 to 0.98, and the rule stayed out. On all 8 rows with no fitting tag it answered `not_mentioned` on every tag, the office tag included at 0.81 to 1.00, in all four runs.
- **So the false fill is the rows no tag fits, whenever the vendor fills.** The vendor filled on 6 English and 4 Spanish of those 8, and the rule added `office` to each: `birthday gift for our receptionist from Inkhollow`, `Papergrove gift basket for a retiring employee`, `donation to Swiftlane's toy drive`, `tarjeta de regalo de Tecnoria para la despedida de nuestra pasante`. The false fills matched row for row across the runs.
- **What guards the rule is the vendor's gate, not the tags.** The vendor filled on 6 English and 5 Spanish rows of 20 at its gate of 0.7, in each run, all but one Spanish row (`es-v-20` in run 1, `es-v-05` in run 2) with no fitting tag. The provider rarely read the office vendor as the one paid for a lunch or a trip.

The cost falls on a shape no frozen verdict set has: on every record the sets describe at an office vendor, the purchase is office. #77's rescore put the gain on Spanish round 5 at up to 0.08 of coverage, an upper bound; round 6 measures it on fresh rows.

## Round 6

The verdict FAILs on English exact alone (0.879 against 0.9), on four tags the provider picked, none of them the rule's; Spanish passes every line (docs/card-eval.md, Round 6: result). The rule filled 8 Spanish tags in each run and 1 to 2 English, all right, and moved no exact or held ambiguous figure. Without it, the same answers cover 0.702 and 0.677 in Spanish, the second below the line.

## Consequences

- **`Candidate` gains an optional `implies`.** A search and a filter ignore it; a card checks it before the call. It refuses an item that implies a value for a field the card does not declare, or for one that takes one item, and an item of a field that takes several, since the gap reads one yes-or-no question per item and one filled item.
- **The eval log saves what each catalog candidate implies**, and the scorer fills the gap at any gate as `ask` does, so a rescore at another vendor gate moves the implied tag with the vendor. A wrong value the rule filled is blamed on it (`implied`), not the provider. Logs written before it imply nothing and score as they did.
- **The gate rule reads the field's own picks**, never the implied value, so the tags gate is fixed as before.
- The first item to fill a field wins, in the card's field order; the demo's card has one.

## Considered Options

- Adding `office` whatever the tags answered: #77's rescore, an upper bound. It would contradict a `meals` or `travel` the provider filled, and the probes show it filled one on every row where one fits. Rejected by the owner.
- Filling only over `not_mentioned`: leaves out an office `yes` below the gate, where the vendor confirms the provider. The owner ruled it in on #79.
- Extending the office label's list: fills what it lists and nothing else (#77); on fresh rows its gain cannot be priced. Not taken.
