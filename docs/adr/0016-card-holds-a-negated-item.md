# A card holds a field whose pick the request names only negated

Adds a hold in code before a catalog field's gate, as ADR 0010 holds a named pair. The owner's decision of 2026-09-26 on #188, chosen over leaving it to the provider or a label change.

The pre-launch QA (#172, finding F9, serious) found the card's vendor filled with a vendor the request says it was not: "lunch $30, Larkspur wasn't it" filled `larkspur` at 0.98 and 0.97, and "coffee, wasn't Beanhaven, $5" picked `beanhaven` at 0.99 in all four runs, filling three times. Ten other negations held on the provider's own labels ("not from Beanhaven", "didn't go to Larkspur", "no fue Cafetal", "no era Cazuela"); the filter's and the search's negations all held.

## Decision

1. **A card may declare `negations`, per language: `before` phrases that sit before an item's name, with up to two other words between ("not", "didn't", "no fue"), and `after` phrases straight after it ("wasn't", "no fue").** Each is a word or a phrase. A mention is negated only when the phrase and the name share one clause, with no comma, colon, period, bracket or question mark between them, and no other item of the field is named between them.
2. **A field that takes one item is held when its pick is an item the request names only negated**, whatever its probability. An item named once without a negation is not negated: "never Northwind before, but a Northwind lunch today" fills. The hold reads the pick, so "not Acme, Northwind coffee" fills Northwind: only a pick on the negated item is held.
3. **The provider is still asked**, so every pick is reported, and the field's result names the negated items and the words (`negated: [{ id, text }]`). The package ships no words; a card with no `negations` behaves as before. A blank phrase is refused when the card is asked, as a blank command is.
4. **Only a field that takes one item.** A field where several items may apply asks one question per item, and "Northwind lunch, not travel" is the provider's to read there, as it read every tag negation in the QA.

The demo declares English `before` "not", "never", "no", "wasn't", "isn't", "didn't" (with "was not", "is not", "did not" and the forms with no apostrophe), `after` "wasn't", "isn't", "was not", "is not"; Spanish `before` "no fue", "no era", "no es", "nunca", "ni", `after` "no fue", "no era", "no es". Bare Spanish "no" is left out: it also modifies a noun, and "un acuerdo de no competencia de Lindero" (round 6, `es-r6-10`) is Lindero's record.

## Evidence before any call

Checked with no call over all 1,838 rows of every card set in `demo/eval/` and every string of the demo's copy, with the demo's lists: no row and no string names a vendor only negated, so no frozen row moves and no gate is refixed. With bare Spanish "no" on the list, `es-r6-10` was the one row held, a record; that is why it is off.

## Consequences

- **The eval log saves each field's negated items** (`negations` per field on a card row). The scorer holds a pick on one at every gate, blames the negation for a record whose expected item it held, and the gate rule reads no such pick, as it reads no pick a pair held.
- **The demo's state panel says the code held the vendor**, naming the words.
- **It is a word list, with a word list's limits.** A negation more than two words away ("que no fue en el Cafetal") or phrased around the list ("anywhere but Larkspur") is the provider's, as before; the provider held those in the QA. A phrase on the list that negates something else two words on ("wasn't cheap at Northwind") holds a field falsely: held, never filled wrong.
- **The filter and the search do not adopt it**: their negations held on their own labels in the QA. Either can adopt it with a round of its own.

## Considered Options

- Leave it to the provider, with a follow-up round: a serious finding filled wrong at 0.97 to 0.99, above any gate the card could take. Rejected by the owner.
- A `not_available` label naming "says which it was not": a question change moves every frozen card row's question and needs a round, and a label has not held a pattern the provider reads confidently wrong (ADR 0010). Not taken.
- Every negated mention holds the field, whatever the pick: holds "not Larkspur, Beanhaven coffee", whose vendor the request names. Rejected.
- A negation rule inside `findPair`, weighed for the filter's statuses in ADR 0011: a different question (whether two names form a choice), and rejected there. Not taken.
