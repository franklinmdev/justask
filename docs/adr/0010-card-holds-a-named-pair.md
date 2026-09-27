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
- **Search and filter do not adopt it yet.** Every frozen search and filter set's pair rows are ambiguous rows the rule holds (`Cloudberth or Tallyroot invoices in July`, `la factura de Pieveloz o de Lindero`), and none of their records, so the evidence points the same way; each adopts it with its own fresh round, as a follow-up. ADR 0011 adopts it for both.
- Every gate is refixed from dev runs with both changes in place, before any round 4 call.

## Known limits

Found in review after round 4, and left as they are: round 4 judged this rule, and a change is a new round's.

- **A choice of three is not held.** "Tallyroot, Cloudberth or Paydale" names a third item, and a comma is not a joiner; the provider decides it as before.
- **A self-correction is held.** "Tallyroot, or rather Cloudberth" and "Cazuela Azul o mejor dicho Nubalia" name one vendor, but the two other words the rule allows cover "rather" and "mejor dicho".
- **A brand that is an ordinary word reads as the vendor.** `Serena` (calm) and `Relucir` (to shine) are words: "una tarde serena y Lindero" is held, and such a word can count as a third item and cancel a real pair.
- **A hyphen joins the names into one word**, so "Cazuela-Azul o Nubalia" is not held. A slash no longer does: see the Amendment (#185).
- **The matcher is not the search's.** The fuzzy shortlist scores a request against descriptions; the pair hold reads ids and `names` with its own typo rule, so a name the shortlist matches by a prefix or an initial is not a mention here.
- **A saved log keeps the pairs it was run with.** The scorer rebuilds a held field from the logged `pairs`, never by running the matcher again, so a rule change never reaches an old log.

## Amendment (#185): a slash, "y/o" and a comma join a pair too

The pre-launch QA (#172, finding F5) found two vendors the rule above never read as a pair, since `findPair` needed a joiner word between them: "Larkspur/Beanhaven lunch $40" filled `larkspur` at 0.71 over the 0.7 gate in one run and held at 0.66 in the other; "Larkspur, Beanhaven, $40 yesterday", "Larkspur vs Beanhaven lunch $40" and "Cazuela, Cafetal, 10 dólares" held at 0.39 to 0.47, the pick flipping between the two vendors across runs. The owner decided on 2026-09-26 to hold these too: "/", "vs", "y/o" and two catalog names separated by a comma form a named pair, as "or" and "and" do.

1. **A slash offers a choice, as "or" does**: "Larkspur/Beanhaven", "Larkspur / Beanhaven". So does a slash between two joiner words, read as one: "y/o", "and/or". It holds any catalog field, a field where several items may apply included ("meals/travel"). A slash that closes a word ("w/", with) is part of that word, not a joiner.
2. **A comma alone lists both, as "and" does**: "Larkspur, Beanhaven" and "Cazuela, Cafetal" hold a field that takes one item, and never a field where several may apply ("meals, travel" asks for both). Only a comma with nothing else between the names joins them, so "Larkspur lunch, Beanhaven coffee" and a correction ("Larkspur, no wait, Beanhaven") are not pairs.
3. **A joiner word decides as before.** With one joiner word between the names, a slash or a comma beside it changes nothing ("Larkspur, or Beanhaven" is a pair); a slash or a comma counts only where no joiner word does.
4. **"vs" is the host's word, not the package's.** The package ships no words (point 1 above); the demo adds "vs" and "versus" to its `or` words in both languages.
5. **The third item still cancels a pair**, and a slash or a comma counts as one joiner in the two-word gap, as a joiner word does.

"facturas de la gente de limpieza", which the QA filed with these, names neither vendor: it is no named pair and stays the provider's call, as the owner decided.

### Evidence before any call

Checked with no call over all 2,494 rows of every set in `demo/eval/` (card, filter and search) and every string of the demo's copy in both languages, with each flow's own shortlists: the new rule holds exactly the rows the old one held, and no other. No frozen row moves and no gate is refixed.

### Known cost

A negated name beside a comma reads as a pair: "not Larkspur, Beanhaven coffee" names Beanhaven, but has two names with a comma between them. On the card the negation hold (ADR 0016) drops a pair one of whose items the request names negated, so it fills Beanhaven there. The filter and the search hold it, as they declare no negations: held, never filled wrong.

## Considered Options

- A `several` label on the vendor question: the vendor question already has `not_available` for "names one that no candidate expresses", and it leaked at up to 0.77. Not taken; a label has not held it in four verdicts.
- "or" alone: leaves the "and" pairs to the provider, which filled four of seven, and holds a record whose third vendor is the one paid. Rejected on the probes.
- "and" on every field: holds tags a request asks for both of. Rejected.
- Skipping the vendor's question when the code holds: saves nothing, since the card is asked in one call, and its pick would go unreported. Not taken.
