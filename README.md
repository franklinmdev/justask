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

## License

MIT
