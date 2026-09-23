# justask

Turns what a person types in plain language into an app's own state: search results, table filters, a filled record card. Code finds the candidates (parsed dates, times and amounts; a shortlist of the host app's catalog rows), a provider model picks one label per question with a probability for every label, and code builds the result. A field the model is unsure of stays empty for the person to fill, and nothing reaches the host app until the person confirms.

The first provider is Jev (TypeSafe, `@typesafe-ai/sdk`). Any model that answers every question in one call with a probability for every label can be added without touching the core.

## Status

Private and unpublished. `package.json` sets `"private": true`, so npm refuses to publish it. The domain is described in [CONTEXT.md](CONTEXT.md), the product in [PRODUCT.md](PRODUCT.md), and decisions in [docs/adr/](docs/adr/).

## Entry points

| Import | What it holds |
|---|---|
| `justask` | The core, no UI: `ask`, the server handler and the provider contract |
| `justask/react` | The React layer (hooks and unstyled pieces) |
| `justask/jev` | The Jev provider adapter |
| `justask/eval` | The eval function, Node only: measures a gate on an eval set |

## Server handler

`createSearchHandler` returns a function from a standard `Request` to a standard `Response`, so it mounts as is in any fetch-style server (Next.js route handlers, Hono, Remix, Bun, Deno, Cloudflare Workers). It runs on the server with the provider built there, so the provider's key never reaches the browser.

There is one handler per flow, each at its own route: the browser never chooses the flow, and each route owns its facts and limits. Filter and card get their own handlers.

```ts
import { createSearchHandler, fuzzyShortlist } from "justask";

export const handler = createSearchHandler({
  provider, // a provider adapter, built on the server
  timeoutMs: 2_000, // no default: measure it
  facts: { local_currency: "USD" }, // the host app's configuration, written as facts
  search: {
    description: "the vendor the request means",
    gate: 0.4, // no default: measure it on an eval set
    shortlist: fuzzyShortlist(vendors, { limit: 10 }),
  },
});
```

The browser posts JSON with the request and its own time zone, and the handler writes today in that time zone as a fact:

```ts
await fetch("/api/justask", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    request: "invoices from Acme",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }),
});
```

It answers:

- `200` with `{ search, error? }`. A provider failure or timeout still answers `200`, with the item held and a typed `error` of kind `provider` or `timeout`. The provider's own message and cause never leave the server; pass `onError` to log them.
- `400` with `{ error: { kind: "request", message } }` when the body is not JSON, has no `request` string or no valid `timeZone`.
- `405` for anything but `POST`.

### What leaves the server on each call

The handler sends data to two places:

- **To the provider**, in one call: the request text, the facts (today plus every fact you configure), one question built from the search's `description` (a fixed instruction around it, and a `none` label beside the candidates), and the `id` and `description` of every shortlist candidate. The provider adapter adds what its service needs to authenticate, such as the key. A candidate's `value` is never sent to the provider, so write each `description` knowing a third party reads it.
- **To the browser**, in the response: every shortlist candidate in full (`id`, `description` and `value`, not only the picked one), the pick, every label's probability and the gate. Candidate values travel as JSON, so keep them plain data, and leave out of `value` anything the person may not see.

The provider's key, the provider's own error messages and the error's cause never reach the browser.

### Node and Express

Node's `http` module and Express speak their own request types. A few lines turn the handler into one of theirs:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { buffer } from "node:stream/consumers";

export function toNode(handler: (request: Request) => Promise<Response>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const response = await handler(
      new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method ?? "GET",
        headers: req.headers as Record<string, string>,
        body: req.method === "POST" ? await buffer(req) : null,
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
```

```ts
// Node
import { createServer } from "node:http";

const mount = toNode(handler);
createServer((req, res) => {
  mount(req, res).catch(() => {
    res.statusCode = 500;
    res.end();
  });
}).listen(3000);

// Express: mount it before express.json(), which would consume the body first.
app.post("/api/justask", (req, res, next) => {
  mount(req, res).catch(next);
});
```

## Filter

A filter is declared field by field, and `ask` returns the filter object the host app's table understands. A held field's key is left out, as if the request never mentioned it.

```ts
import { ask } from "justask";

const { filter } = await ask({
  request: "invoices from Acme over 500 pesos last month",
  facts: { today: "2026-09-22", local_currency: "MXN" },
  provider,
  timeoutMs: 2_000,
  filter: {
    description: "invoices, one row per invoice",
    fields: {
      vendor: { kind: "catalog", description: "the vendor", gate: 0.8, shortlist },
      issued: { kind: "date", description: "the day it was issued", gate: 0.8 },
      total: { kind: "amount", description: "the invoice's total", gate: 0.8 },
    },
  },
});
// filter.value: { vendor, issued: { from: "2026-08-01", to: "2026-08-31" }, total: { min: 500, currency: "MXN" } }
```

- **catalog** fields take their candidates from the host app's `shortlist`, one question each.
- **date** fields take theirs from the parsers, read backward as a filter looks at what already happened, and fill as `{ from?, to? }` in days. Two questions: where the period starts and where it ends.
- **amount** fields take theirs from the parsers and fill as `{ min?, max?, exact?, currency? }`, one question per number found. The `local_currency` fact, an ISO 4217 code, decides what a bare "$" and "pesos" mean; without it, or when it does not fit, the currency is left out.

The built-in parser reads English and general Spanish; no regional formats ship. A host app adds its own in `filter.parsers`: each is a function from the request and `{ today, facts }` to `{ dates?, amounts? }`, runs before the built-in one, and wins where their text overlaps.

## Measuring a gate

Every gate is declared with no default, so it has to come from measurement. `justask/eval` runs an eval set through the real pipeline, with the real provider, and scores it the way the lab did. It runs by hand, never in CI, because every row is a paid call.

An eval set is JSONL, one request per line with the result a person expects. `item` rows name the candidate id they mean. `nothing` rows have no item to find. `ambiguous` rows could mean more than one candidate, so their item must stay held:

```jsonl
{"id": "s01", "request": "invoices from Acme", "kind": "item", "expected": "acme"}
{"id": "s02", "request": "what is my balance?", "kind": "nothing"}
{"id": "s03", "request": "the Acme or Northwind bills", "kind": "ambiguous"}
```

Write the kill lines before the first run. The run log saves them with the gate, so the verdict cannot be tuned after you see the numbers:

```ts
import { readFile } from "node:fs/promises";
import { formatReport, parseEvalSet, runEval, scoreRun } from "justask/eval";

const run = await runEval({
  set: parseEvalSet(await readFile("eval/search.jsonl", "utf8")),
  search, // the same declaration the handler uses, with the gate under test
  provider,
  facts: { today: "Today is Tuesday 2026-09-22." }, // fixed, so every run reads the same day
  timeoutMs: 2_000,
  killLines: { exact: 0.9, coverage: 0.7, invented: 0, heldAmbiguous: 0.75, p95Ms: 800, errors: 0 },
  log: "eval/runs/search-1.jsonl", // refuses to overwrite a saved run
});
console.log(formatReport(scoreRun(run)));
```

The report gives exact (filled items that are the expected one), coverage (item rows that filled), invented (nothing rows that got an item), held ambiguous, p95 latency, errors and cost per call, then checks each kill line. `exact`, `coverage` and `heldAmbiguous` must be at least their line, and the other three at most theirs. A line the set cannot measure fails; for example, a set with no ambiguous rows fails `heldAmbiguous`. Misses name whether the expected item never reached the shortlist or the provider picked wrong.

The saved log is enough for everything else, with no provider call:

- `scoreRun(await readRun(log), { gate: 0.3 })` rescores at another gate. A gate chosen after seeing the run gives no verdict, because it would be judged on the rows it was tuned on.
- `compareRuns(first, second)` lists only the rows whose item flipped in a second run of the same set. The verdict stays with the first run; `formatReport(scoreRun(second), flips)` prints the second run's measures and its flips, with no verdict of its own.

Keep a separate dev set for tuning descriptions and shortlists, and never let it decide a verdict.

## Demo

A local demo searches the vendors of a fictional invoicing app, in English or Spanish, beside a state panel that shows what happened: the shortlist, every label's probability, the pick, the gate on `none`, and why the item filled or was held. Its suggested requests include ones that could mean two vendors and ones with nothing to find.

```sh
cp .env.example .env   # then set TYPESAFE_API_KEY
pnpm demo              # http://localhost:5173
```

Vite serves the page and mounts the search handler as dev middleware, one route per language (`/api/search/en` and `/api/search/es`), each with its own catalog. The key is read from `.env` on the server side and never reaches the browser bundle. Every search is one real, paid Jev call. Without a key the page still runs, and every search fails and is held.

The demo's gate (0.2) was fixed from its dev sets and measured on its search eval sets, with the verdict and misses in `docs/search-eval.md`. Its timeout (2 s) and typing pause (300 ms) are not measured yet. `node --conditions=source demo/eval/search.ts` runs those sets by hand with the key in `.env`, never in CI.

## Development

Requires Node 24 and pnpm 12 (the version is pinned in `package.json`; `corepack enable` picks it up).

```sh
pnpm install
pnpm lint        # Biome: lint and format check
pnpm format      # Biome: apply fixes and formatting
pnpm typecheck   # tsc, strict
pnpm test        # Vitest, once
pnpm build       # emit dist/
```

Tests never call a real provider. They use the fake provider in `test/fake-provider.ts`, which returns fixed probabilities per question label. Real calls happen only in eval runs, by hand, with a key copied from `.env.example` into `.env`.

To make one real Jev call by hand and see its latency and cost:

```sh
node --conditions=source scripts/jev-call.ts "invoices from Acme"
```

## License

MIT
