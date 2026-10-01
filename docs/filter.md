# Filter

The detail behind the README's [filter example](../README.md#filter): what each field kind fills, the named-pair hold, the handler and the React pieces, and how dates and times are read. The handler's shared behaviour, its statuses and its errors are in [handlers.md](handlers.md).

## Fields

Each field fills only when its pick clears its gate, so a real call may leave any of them out; `filter.fields` holds each one's candidates, picks and probabilities, which say why.

- **catalog** fields take their candidates from the host app's `shortlist`, one question each.
- **date** fields take theirs from the parsers, read backward as a filter looks at what already happened, and fill as `{ from?, to? }` in days. Two questions: where the period starts and where it ends.
- **amount** fields take theirs from the parsers and fill as `{ min?, max?, exact?, currency? }`, one question per number found. The `local_currency` fact, an ISO 4217 code, decides what a bare "$" and "pesos" mean, and a mark shared by two currencies, such as "¥" or "C$". Without it, the currency is left out. A mark that names one currency reads as it: "RD$", "£", "EUR12", "300 mxn". When the request names a currency that does not resolve against it, such as "500 pesos" with `local_currency: "USD"`, the whole amount field is held without a question, so the number never fills alone.

**A named pair holds a catalog field.** A filter, a card and a search may declare `joiners`: the words that join two items in their language, each one word, such as `{ or: ["or"], and: ["and"] }`, or `{ or: ["o", "u"], and: ["y", "e"] }` in Spanish. The package ships none, so without them nothing is held this way. A request that names two items of one catalog field, and no third, with a joiner between the names and up to two other words, holds that field before its gate, whatever its pick: "Acme or Northwind invoices". So does a slash, alone or between two joiner words ("Acme/Northwind", "and/or"), and a comma with nothing else between the names ("Acme, Northwind"). An item is named by its `id`, read exactly, or by one of its `names`, exactly or with a clear typo, ignoring case and accents. The result names the two in `pair`, on the field for a filter or a card and on `search.pair` for a search (ADR 0010, 0011). A filter's catalog field may declare `heldByPair: false` to fill on its pick alone; a card and a search have no such switch.

## Over HTTP and in React

`createFilterHandler` takes the same `provider`, `timeoutMs`, `facts` and `onError` as the search handler, plus the `filter` declaration, and answers `200` with `{ filter, error? }`: the filter object in `filter.value` and every field's candidates, picks, probabilities and gate in `filter.fields`. The browser posts the same body, and the handler writes today in the browser's time zone, so a date field reads "last month" as the person means it.

`useFilter` from `@justask/core/react` drives it from the host app's markup. Its unstyled pieces are `FilterBox` (the request box), `FilterFields` (one list item per proposed filter, each with a remove button, in a polite live region), `FilterEmpty` (shown when the answer fills no field, or failed) and `FilterConfirm`. Nothing reaches the app before Confirm: `onConfirm` receives the filter object, without the filters the person removed.

`FilterEmpty` shows for a failed call too, since the fields are held either way. To say which, choose its children from `filter.error`, as the demo's Table does.

A host app whose filters are cheap to undo can skip the button and apply each answer as it comes in, as the demo's Table does:

```tsx
// in InvoiceFilter.tsx, after useFilter
useEffect(() => {
  if (filter.ready) filter.confirm();
});
```

The pieces never edit a field. A held field is left out of the proposal, and the person fills it afterwards with the host table's own filter controls, which already know every value it can take.

The proposed filters sit in a polite live region that reads only what is added, so a new proposal is announced. A removal is announced on its own, in the words `removedLabel` gives; pass `announcementProps` to hide that region visually. With nothing to confirm, `FilterConfirm` stays focusable and sets `aria-disabled`. After Confirm the request and its answer stay, so an inspector still reads `filter.result`, and the proposal is spent until the person types again.

## Parsers and ambiguous readings

The built-in parser reads English and general Spanish; no regional formats ship. A host app adds its own in `filter.parsers`: each is a function from the request and `{ today, reads, facts }` to `{ dates?, times?, amounts? }`, runs before the built-in one, and wins where their text overlaps. `reads` is `"past"` or `"future"`: which way a date that does not say its year or week should read.

A reading the request itself leaves open is marked `ambiguous` by the parser, and a field whose pick lands on one is held whatever its probability: "a las 2 y pico", and "next Friday" or "last Friday" when the closest Friday that way and the Friday of the week after or before this one (weeks start on Monday) are different days. Said on a Saturday, "last Friday" is held; said on a Wednesday, both readings are the Friday five days back, and it fills. The same request on the same day always holds the same field. A part of the day reads as its day: "this morning", "tonight" and "esta tarde" are today, "last night", "last evening" and "anoche" yesterday. "before" and "after" leave out the day or period they name, so "after May 5" reads May 6 and "antes de mayo" April 30; "since" and "until" keep it. A day, a time or an amount in a currency said twice is one candidate, so the two mentions never split its probability.
