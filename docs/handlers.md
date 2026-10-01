# Handlers and the provider

The detail behind the README's [provider](../README.md#the-provider) and [search](../README.md#search) examples: what the provider reads, what every handler checks and answers, the search's React pieces, and how to mount a handler in Node or Express. The filter's and the card's own detail is in [filter.md](filter.md) and [card.md](card.md).

## The provider

Every handler, `ask` and eval run takes a `provider`, built on the server. The client is made on the first call, so a missing or refused key is no boot error: each call fails as a `provider` error, every field held, and the handler logs the SDK's message on the server. The SDK also reads `TYPESAFE_BASE_URL` and `TYPESAFE_LOG_LEVEL`; at `debug` it logs each request body, which holds the person's request and the facts, so keep it off in production. `jevProvider({ client })` takes a client of your own, for tests or a custom transport. Another model is an object with one `answer` method, the `Provider` type (ADR 0001).

## One handler per flow

`createSearchHandler` returns a function from a standard `Request` to a standard `Response`, so it mounts as is in any fetch-style server (Next.js route handlers, Hono, Remix, Bun, Deno, Cloudflare Workers). It runs on the server with the provider built there, so the provider's key never reaches the browser.

There is one handler per flow, each at its own route: the browser never chooses the flow, and each route owns its facts and limits. `createFilterHandler` and `createCardHandler` serve a filter and a card the same way (see [filter.md](filter.md) and [card.md](card.md)).

The README's files import each other without an extension, as a bundler such as Vite or Next.js takes them; a plain Node project writes `./catalog.js` when it compiles with `nodenext`, or `./catalog.ts` when Node strips the types itself.

A handler checks its configuration when it is created, so a misconfigured app fails at boot, not on every request: a gate outside 0 to 1, a timeout outside 1 to 2147483647 ms, a joiner of more than one word, a blank card command, two fields whose question ids clash, or a `today` fact, which the handler writes itself.

The browser posts JSON with the request and its own time zone, and the handler writes today in that time zone as a fact:

```ts
await fetch("/api/search", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    request: "invoices from Acme",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }),
});
```

It answers:

- `200` with `{ search, error? }`. A provider failure or timeout still answers `200`, with the item held and a typed `error` of kind `provider` or `timeout`. The provider's own message and cause never leave the server: the handler logs them with `console.error`, or hands them to `onError` when you pass one, so a missing or refused key shows in the server's log. A provider that was unavailable (the Jev adapter's 5xx, 529 included, or a lost connection; a custom adapter throws `ProviderUnavailableError`) is called once more within the same `timeoutMs`, and never a third time (ADR 0013). Its response then carries `retried: true`, and its cost and tokens are the second call's: the first threw and reported none. A request that is empty or only whitespace holds everything with no provider call.
- `400` with `{ error: { kind: "request", message } }` when the body is empty (most often read before the handler, by a body parser such as `express.json()` mounted first), is not JSON, has no `request` string or no valid `timeZone`, or its request is over 1,000 characters (as JavaScript counts them, `request.length`), or its stream fails before the end while the browser is still there.
- `405` for anything but `POST`.
- `413` with the same body when the body is over 16 KiB (16,384 bytes). The handler refuses a larger declared `content-length` before reading, and stops reading any other body at the cap.
- `415` with the same body when the body is not sent as `application/json`. Another site's page can make a visitor's browser post a form or plain text with no preflight; a JSON post from another origin needs a CORS preflight, which the handler never answers. The handler checks no origin itself: a host that sends CORS headers for this route checks it there.
- `499` with no body when the browser goes away mid call, or mid upload: the request's `signal` aborts the provider call, so an answer nobody reads is not paid for to the end. `ask` takes the same `signal` and rejects with its reason. On Cloudflare Workers the incoming request's `signal` fires only with the `enable_request_signal` compatibility flag.
- A rejection, not a response, when the host's own code throws: a shortlist that fails, such as a database that is down. The host's server answers it as it answers its own errors, so its message stays on the server. An `onError` that throws is logged and the held `200` still goes out.

A date, time or amount field weighs at most 10 readings of its kind: a request with more, such as a pasted list of numbers, gives that kind none, and its fields are held without a question.

## Search in React

`useSearch` from `@justask/core/react` drives the search from the host app's markup: it posts what the person types to the handler, keeps only the answer to the latest request, and hands the item to `onChoose` when the person chooses it. `timing` is required and has no default: `{ on: "type", debounceMs }` calls after a pause in typing, `{ on: "enter" }` only on Enter. Its unstyled pieces are `SearchBox` (the search input; Enter calls at once and never submits a surrounding form), `SearchItem` (the one item, as a button that chooses it, in a polite live region) and `SearchEmpty` (shown once an answer came back with no item, a failed call included; `search.error` says which).

## Errors in React

In React, each hook's `error` tells these apart by `kind`, so the host can word each one: `provider` and `timeout` from a `200`, `request` for a `400`, `too-large` for a `413`, `unsupported` for a `415`, and for statuses the host's own server gives, `rate-limited` for a `429`, with `retryAfterMs` read from its `Retry-After` (seconds or a date; null without one), and `server` for a `5xx`, with its `status`. Those two carry the host's own message when its body has one (`{ error: { message } }`, `{ error: "..." }`, `{ message }`, or a `text/plain` body), and a fixed one otherwise. A handler that cannot be reached, answers any other status, or answers a body that is not its flow's (another flow's handler, a sign-in page) gives `network`. A host that serves the handler from another origin lists `Retry-After` in `Access-Control-Expose-Headers`, or the browser hides it.

## Node and Express

Node's `http` module and Express speak their own request types. A few lines turn the handler into one of theirs:

```ts
// to-node.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

export function toNode(handler: (request: Request) => Promise<Response>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    // Aborts the provider call when the browser goes away.
    const browser = new AbortController();
    res.on("close", () => browser.abort());
    const response = await handler(
      // The handler reads no URL, so a malformed Host header cannot break it.
      new Request("http://localhost/", {
        method: req.method ?? "GET",
        headers: req.headers as Record<string, string>,
        // Streamed, so the handler stops reading a body past its 16 KiB cap.
        // A body something already read, such as express.json(), goes as none.
        body:
          req.method === "POST" && !req.readableEnded
            ? (Readable.toWeb(req) as ReadableStream)
            : null,
        signal: browser.signal,
        // A streamed body needs it; the DOM's own types do not know it yet.
        duplex: "half",
      } as RequestInit),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
```

```ts
// server.ts
import { createServer } from "node:http";
import { handler } from "./search";
import { toNode } from "./to-node";

// Node
const mount = toNode(handler);
createServer((req, res) => {
  mount(req, res).catch((error) => {
    console.error(error);
    res.statusCode = 500;
    res.end();
  });
}).listen(3000);

// Express: mount it before express.json(), which would consume the body first.
app.post("/api/search", (req, res, next) => {
  mount(req, res).catch(next);
});
```
