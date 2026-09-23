# The search and the filter hold a named pair, as the card does

Extends ADR 0010 to the other two flows, as its Consequences left open. The ticket's decision (#68): the search holds its one item; the filter holds its vendor field.

1. **A search may declare `joiners`**, the card's shape. A request that names two of its candidates with an `or` or an `and` word between them, and no third, holds the item whatever the pick: the search takes one item, so "and" holds it as "or" does. The result names the pair's ids and words, and the provider is still asked, so the pick is reported.
2. **A filter may declare `joiners`**, and a pair holds any of its catalog fields by the same rule. Every filter catalog field takes one item, so both joiners hold. The demo's filter has two: the vendor, which the ticket names, and the status, whose ids (`paid`, `open`, `overdue`) the rule reads exactly. So "paid or overdue invoices" holds the status in English, and "pagadas o vencidas" never does, since the Spanish statuses declare no `names`, as the card's tags do not.
3. **The matcher, the typo rule and the third item are ADR 0010's, unchanged.** Its known limits hold here too.

The demo's three flows share one list of joiners per language (`joiners` in `demo/src/content/`, which was `cardJoiners`).

## Evidence before any call

Checked with no call over every set in `demo/eval/` and the demo's suggestions:

- **No dev row names a pair**, in the search or the filter, so the rule holds none: no false hold on either flow's dev set.
- **Every frozen search and filter row it holds is an ambiguous row**: `the Tallyroot or Fixbright bill`, `the Papergrove or Inkhollow order`, `the Swiftlane or Clausewood invoice` and their Spanish twins in the search's rounds 1 to 3; `Cloudberth or Tallyroot invoices in July` and `facturas de Nubalia o de Cuentia de julio` in the filter's. It holds no item and no filterable row.
- **The demo's two ambiguous search suggestions are pairs** (`the Papergrove or Larkspur invoice`, `la factura de Tintaverde o de Cazuela Azul`), held as they are meant to be.
- **The search's pair rows never leaked.** Rounds 1 and 2 held them on `none` (0.41 to 0.75), round 3 on `several` (0.98 and 0.99), in both runs of each. The search leak ADR 0010 cites, `paper for the flyers`, names no vendor, so this hold does not reach it. The filter's pair leaked once, `Nubalia o Cuentia` at 0.61 against a gate of 0.6.
- So on the filter the hold closes a known leak; on the search it moves into code what the provider's labels have held so far, and its round can show no leak fixed, only that nothing breaks.

## Consequences

- **`SearchResult` gains an optional `pair`**, and a filter's catalog field result the same, as the card's does.
- **The search's and the filter's eval logs save the pair** (`pair` on a search row, `pairs` per field on a filter row). Their scorers hold the item or the field at every gate, blame the pair for a row they held, and the filter's gate rule reads no pick of a held field on that row, as the card's does.
- **The demo's search and filter panels say the code held it**, naming the pair's words.
- Each flow is judged on its own fresh round, with sets approved before any call.

## Considered Options

- The filter's vendor field alone: a per-field switch no other flow has, to leave out a status pair that no set names. Not taken; a pair of statuses is as unfillable as a pair of vendors.
- The search's `several` label alone: it held every search pair so far, but the label is the provider's judgment and structure goes in code (ADR 0010). Not taken.
