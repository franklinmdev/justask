# A card holds a command on a record that already exists

Amends the card's intent question and adds a hold in code before its gate, as ADR 0008 holds "next Friday" before a field's gate. Two changes, both the owner's decision of 2026-09-23 (#57):

1. **The intent question's `not_available` label names sending and forwarding.** It read "it changes, cancels or deletes one, or asks a question"; it now reads "it changes, cancels, deletes, sends or forwards one, or asks a question". The category was missing, not worded weakly, and a label covers verbs no list anticipates.
2. **A card may declare `commands`: verbs and references to an existing record, per language.** A request that holds one of the verbs and one of the references, each as whole words, is held whole before the intent's gate, whatever the pick. The provider is still asked, so every pick is reported, and the intent's result names the two words that held it. The package ships no lists: the host writes them in the card's language, and a card with no `commands` behaves as before.

Round 2 failed on Spanish because two nothing rows read as new records (`docs/card-eval.md`). The probes of #57 found two causes, neither of them Spanish commands in general. `quite`, the usted imperative of `quitar`, is also an English word, and reads as a new record at up to 0.88 where `quita`, `borre` and `elimine` read 0.00. Sending is a category the intent question never named: `envíe`, `envía` and `mande` read as new records at up to 0.99, and **English leaks too**: `send the $58 Beanhaven expense to accounting` read 0.57 against an intent gate of 0.45. The fix covers both languages.

The label alone cannot fix `quite`: the provider reads an English word, and the lab found that a question's language barely moves its answers (jev-lab LEARNINGS, es-do runs 2 and 3). The list alone covers only the verbs written down. Both, then: the label for the category, the list for the words the label does not reach. Structure goes in code, the lab's lesson, and the hold is structure: "a command on an existing record adds no record", whatever the provider's confidence.

## Consequences

- **The verb lists are per language.** `quite` is only on the Spanish list: "quite a pricey lunch at Larkspur" is an English record. Matching ignores case and keeps accents, so `quité` (I removed) is not `quite`.
- **A reference is a determiner and a record's noun** (`el gasto`, `esa factura`, `the invoice`), not the noun alone, so "email hosting invoice from Cloudberth, $12" is not held. The cost is measured: real new records that contain a listed verb and a listed reference are held, and dev measures how many before any gate is fixed (`docs/card-eval.md`).
- **The eval log saves the words that held a row.** The scorer holds that row at every gate, and the gate rule reads no intent pick on it, since no gate can let it through. A log from before this ADR has no such field and rescores exactly as recorded.
- **The demo's state panel says the code held the card**, naming the verb and the reference, beside the reasons the intent's pick gives.
- Every gate is refixed from dev runs with both changes in place, before any round 3 call.

## Considered Options

- The label alone: leaves `quite`, an English word to the provider, reading as a new record. Rejected.
- A code check alone, with no new label: covers only the verbs on the list, and sending in either language is a category, not a word. Rejected.
- One list for both languages: `quite` would hold English records. Rejected by the owner.
- Translating the intent question into Spanish: the lab found the instructions' language barely matters. Not taken.
- Skipping the provider call when the code holds: saves a call, but the picks would go unreported, and every other hold in the package still reports them. Not taken.
