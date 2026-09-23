# A card holds a field whose request names a pair of its items

Adds a hold in code before a catalog field's gate, as ADR 0009 holds a command before the intent's, and names one more category in the intent question. Both are the owner's decisions of 2026-09-23 (#63).

1. **A card may declare `joiners`, per language: `or` words that offer a choice ("or"; "o", "u") and `and` words that name both ("and"; "y", "e").** A request that names two items of one catalog field with one of these between them, up to two other words beside it ("Larkspur lunch and Beanhaven", "de Cuentia o de Nubalia"), and no third item of that field, holds the field whatever its pick. An item is named by its candidate id, read exactly, or by one of its `names`, exactly or with a clear typo: one letter off from five letters, two from eight, none below five (`Taliroot` reads Tallyroot; `Acne` is not Acme). Case, accents and a possessive are ignored. The provider is still asked, so every pick is reported, and the field's result names the pair's ids and words. The package ships no lists and no names: the host writes them, and a card with no `joiners` behaves as before.
2. **The intent question's `not_available` label names setting a value**: "it changes, cancels, deletes, sends or forwards one, sets one to a new value, or asks a question". Round 3's one Spanish leak, `deje en $260 el cargo de Brisamar de ayer`, changes a record by naming its new value, a category the label did not name, as #57 found for sending.

The named pair leaked in every verdict before this one: search ("paper for the flyers"), filter (`Nubalia o Cuentia`, 0.61), card rounds 1 to 3 (`Tintaverde o Letranueva` 0.59, `Tecnoria o Nubalia` 0.57, `Tallyroot or Cloudberth` 0.75). No gate or label held it. A pair is structure, "two items of one field and a word between them", and the lab's lesson is that structure goes in code.

## "and", and the third item

The ticket asked for false holds measured before any gate was fixed, and for "and" to be decided and recorded. No frozen set in `demo/eval/` names two items joined by "and", and no dev row names a pair at all, so the owner approved ten probe records per language (`card-<language>.pair.jsonl`, `docs/card-eval.md`). The first rule, "or" alone, ran on them first:

- **"and" pairs leak like "or" pairs.** Of the seven answered rows that name two vendors with "and" and no other, four filled a vendor above the gate of 0.5 (`Papergrove paper and Inkhollow flyers` 0.54, `almuerzo de Cazuela Azul y café del Cafetal` 0.79, `papel de Tintaverde y volantes de Letranueva` 0.68, `Lindero y Serena se repartieron la revisión` 0.53).
- **Every false hold came from a third vendor, the one paid.** `Swiftlane courier to Clausewood or Paydale` and `Larkspur catering for the Tallyroot or Cloudberth training`, and their Spanish twins, were held by "or" where the provider filled the right vendor at 0.90 to 1.00. Holding on "and" alone would have held six more such records (`Swiftlane courier for the Clausewood and Paydale contracts`), filled right at 0.79 to 1.00.
- **"and" on tags means both.** `for the office and client binders` asks for `office` and `client`; a field where several items may apply can hold both, so "and" never holds it.

The owner chose the rule above from these numbers: both joiners, "and" only on a one-item field, and no pair when a third item is named. It was shaped after the probes, so the probes cannot judge it; round 4 does. Pair run 2, with the rule, held all eight "and" pair rows, six of which the provider would have filled, and none of the twelve records. Checked with no call over every set in `demo/eval/` and the demo's suggestions, the rule holds only ambiguous rows and pair probes: 22 rows, 0 records.

## Consequences

- **`Candidate` gains an optional `names`**, the words a request names a row by, such as a brand. The demo's vendors name their brand (`Tallyroot`, `Cazuela Azul`, `Cobertura Plena`). Ids are read exactly, never with a typo: an id is a label, and `meals` is one letter from `meels` and `deals`.
- **The eval log saves each field's pair**, as ADR 0009's log saves the command. The scorer holds that field at every gate, blames the pair for a record it held, and the gate rule reads no pick of that field on that row.
- **The demo's state panel says the code held the field**, naming the pair's words.
- **Search and filter do not adopt it yet.** Every frozen search and filter set's pair rows are ambiguous rows the rule holds (`Cloudberth or Tallyroot invoices in July`, `la factura de Pieveloz o de Lindero`), and none of their records, so the evidence points the same way; each adopts it with its own fresh round, as a follow-up.
- Every gate is refixed from dev runs with both changes in place, before any round 4 call.

## Known limits

Found in review after round 4, and left as they are: round 4 judged this rule, and a change is a new round's.

- **A choice of three is not held.** "Tallyroot, Cloudberth or Paydale" names a third item, and a comma is not a joiner; the provider decides it as before.
- **A self-correction is held.** "Tallyroot, or rather Cloudberth" and "Cazuela Azul o mejor dicho Nubalia" name one vendor, but the two other words the rule allows cover "rather" and "mejor dicho".
- **A brand that is an ordinary word reads as the vendor.** `Serena` (calm) and `Relucir` (to shine) are words: "una tarde serena y Lindero" is held, and such a word can count as a third item and cancel a real pair.
- **A hyphen or slash joins the names into one word**, so "Tallyroot/Cloudberth" and "Cazuela-Azul o Nubalia" are not held.
- **The matcher is not the search's.** The fuzzy shortlist scores a request against descriptions; the pair hold reads ids and `names` with its own typo rule, so a name the shortlist matches by a prefix or an initial is not a mention here.
- **A saved log keeps the pairs it was run with.** The scorer rebuilds a held field from the logged `pairs`, never by running the matcher again, so a rule change never reaches an old log.

## Considered Options

- A `several` label on the vendor question: the vendor question already has `not_available` for "names one that no candidate expresses", and it leaked at up to 0.77. Not taken; a label has not held it in four verdicts.
- "or" alone: leaves the "and" pairs to the provider, which filled four of seven, and holds a record whose third vendor is the one paid. Rejected on the probes.
- "and" on every field: holds tags a request asks for both of. Rejected.
- Skipping the vendor's question when the code holds: saves nothing, since the card is asked in one call, and its pick would go unreported. Not taken.
