# The search and the filter hold a named pair, as the card does

Extends ADR 0010 to the other two flows, as its Consequences left open. The ticket's decision (#68): the search holds its one item; the filter holds its vendor field.

1. **A search may declare `joiners`**, the card's shape. A request that names two of its candidates with an `or` or an `and` word between them, and no third, holds the item whatever the pick: the search takes one item, so "and" holds it as "or" does. The result names the pair's ids and words, and the provider is still asked, so the pick is reported.
2. **A filter may declare `joiners`**, and a pair holds any of its catalog fields by the same rule. Every filter catalog field takes one item, so both joiners hold. The demo's filter has two: the vendor, which the ticket names, and the status, whose ids (`paid`, `open`, `overdue`) the rule reads exactly. So "paid or overdue invoices" holds the status in English. From #75 the Spanish statuses declare `names` (`pagadas`, `pendientes`, `vencidas`), so "pagadas o vencidas" holds it too; plural, since `pagada` would also read `pasada`, as in "la semana pasada".
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
- Each flow is judged on its own fresh round, with sets approved before any call. The filter's round 2 names pairs of vendors only, so it judges the vendor hold. The status hold was measured in [#75](https://github.com/franklinmdev/justask/issues/75), in both languages, by probe rows and the filter's round 3 (docs/filter-eval.md): at the status gate of 0.95 it held nothing the gate did not, and its one cost is a status negated beside another ("not paid and overdue"), which it holds though the provider reads it right. The owner kept the rule as it is for #75 on 2026-09-23; the status field opting out of the hold, chosen over a negation rule, is tracked in [#80](https://github.com/franklinmdev/justask/issues/80).

## Considered Options

- The filter's vendor field alone: a per-field switch no other flow has, to leave out a status pair that no set names. Not taken; a pair of statuses is as unfillable as a pair of vendors.
- The search's `several` label alone: it held every search pair so far, but the label is the provider's judgment and structure goes in code (ADR 0010). Not taken.

## Amendment (#80): the filter's status field opts out

Decided by the owner on 2026-09-23, after #75 measured the status hold.

1. **A filter's catalog field may declare `holdsPair: false`.** A named pair then never holds it, and it fills on its pick alone. Default true, so every other field holds as above. The card and the search have no such switch; no evidence asks for one.
2. **The demo's status field declares it, in both languages.** The vendor field keeps the hold.
3. **The Spanish status names from #75 are gone.** Only the pair hold read them; the provider reads a status's id and description. With the status out of the hold nothing reads them, so `status()` in `demo/src/content/types.ts` takes no names again.

### Evidence

From #75's probes and round 3 (docs/filter-eval.md, Status-pair probes and Round 3):

- **The status hold caught nothing.** At the status gate of 0.95 no status pick on a pair went above 0.74. The gate held every status pair on its own, in the probes and in round 3.
- **Its one cost was 8 of 8 false holds**: two statuses joined by "and" with one negated (`invoices not paid and overdue`, `facturas pendientes y no vencidas de Serena`), which the provider read right at 0.98 or more.
- **The vendor hold is needed**: without it, vendor pairs filled at 0.68 and 0.72, over the vendor gate of 0.6.
- **Rescored with no call** over every saved filter run log, rounds 1 to 3, the dev runs and the probes: the 8 negated rows fill right, no row gains a miss, no verdict changes, and no kill-line measure moves but the probes' coverage, 0.5 to 1 (the probes take no verdict). Pinned in `test/demo-filter-eval.test.ts`; the table is in docs/filter-eval.md.

### Considered Options

- **A negation rule in `findPair`**: no pair when a "not" word sits beside one of the two items. Rejected: it touches the matcher the card, the search and the filter share, grows a word list per language, and needs a fresh round per flow, all to remove a cost from a hold that measurably does nothing on this field.
- **Keep the hold as it is**, as the owner did for #75. Replaced by this amendment once the rescore could show the opt-out changes no verdict.

This takes the per-field switch the first Considered Option above turned down: that option was weighed before any status pair was measured, and #75's evidence answers it.

### Consequences

- The opt-out rests on the status gate of 0.95. If that gate ever drops below about 0.75, where #75's pair picks would clear it, the opt-out needs weighing again.
- A negated status beside another now fills on the provider's pick, as the probes read it.
