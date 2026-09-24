# The demo on Cloudflare Workers

**Status (2026-09-24, #107): the demo builds as one Worker and every flow answers in local workerd with real Jev calls. It is not deployed yet: the Cloudflare account, the key as a secret and the Access policy need the owner (Deploy, below). CPU time on the deployed Worker is not measured yet, so there is no verdict.** A local measure in Node gives an early signal: about 1 ms per warm request, and 10 to 49 ms on the first request after start (Measuring CPU).

## Shape

One Worker on the free plan, `justask-demo` (`wrangler.jsonc`):

- The frontend is what `pnpm demo:build` writes to `demo/dist`, served as the Worker's static assets. Static requests never reach the Worker's code, so they cost no Worker CPU and, per Cloudflare's pricing page, are "free and unlimited".
- `/api/*` alone runs the Worker first (`run_worker_first`), which serves the demo's handler, `createDemoHandler`, with the real Jev provider (`demo/worker/index.ts`). The handler is built once per isolate, at startup, not per request.
- The key is the Worker's secret `TYPESAFE_API_KEY`. Under `nodejs_compat` the runtime fills `process.env` from the Worker's secrets, where the TypeSafe SDK reads it, as it does on the dev server. It is in no file of the repo and in neither bundle: on 2026-09-24 the key's value was searched for in `demo/dist` and in the Worker bundle wrangler writes, and found in neither (its name is in the Worker bundle, as in the SDK).
- Workers Logs is on (`observability`), which is where each request's CPU time is read.
- `pnpm demo` is unchanged: the Vite dev server with the handler as middleware, the key from `.env`.

wrangler bundles `justask` from `src/` through the `source` export condition, set by `WRANGLER_BUILD_CONDITIONS` in the package scripts, as the tests and the dev server do.

## Running the Worker locally

```bash
pnpm demo:worker
```

Builds the frontend and serves both through local workerd at `http://localhost:8787`. wrangler reads the key from `.env` beside `wrangler.jsonc`, so in the main checkout it just works. From a worktree, pass the main checkout's file rather than copying it: `pnpm demo:worker --env-file <main checkout>/.env`. Local workerd reports each request's wall time and not its CPU time, so CPU is measured on the deployed Worker only.

## Deploy (owner)

Each step needs the owner's Cloudflare account. The key is typed at a prompt, never on a command line or in a file of the repo.

1. `pnpm exec wrangler login`, in the browser, with the owner's account.
2. `pnpm demo:deploy`, with no secret yet, so the URL it prints spends nothing while it is still open: every request fails as a provider error.
3. Lock it behind Access: Workers & Pages, `justask-demo`, Settings, Domains & Routes, and Enable Cloudflare Access on the `workers.dev` URL (and the Preview URLs). Cloudflare makes one policy per Worker, `justask-demo - Production`; set it to allow the owner's email alone. What that policy allows before it is edited is unverified, so check it.
4. Open the URL in a private window: Access must ask for a login first.
5. Only then `pnpm exec wrangler secret put TYPESAFE_API_KEY`, and paste the key at the prompt. Logged in, every flow now answers.
6. For the measure, create a service token (Zero Trust, Access controls, Service credentials, Service Tokens), add a Service Auth rule for it to the Worker's policy, and put its pair in the main checkout's `.env` as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`. Cloudflare shows the secret once. Delete the token once the measure is written down.

The Worker stays behind Access until the launch ticket of #29, so nobody spends the key before the limits exist.

## Measuring CPU

The free plan allows 10 ms of CPU per request; waiting on `fetch`, such as the Jev call, does not count. A Worker's startup is under its own limit of 1 s, separate from the request's. Over 10 ms the request fails with error 1102. The docs state no averaging or grace; treat any request over 10 ms as a failed visitor request.

### Procedure

1. Deploy, then send nothing else for a few minutes, so the first measured request lands on a fresh isolate if Cloudflare evicted it (unverified that a few minutes is enough).
2. `node --conditions=source demo/worker/measure.ts <workers.dev URL> 3`: every dev row of the search, filter and card eval sets, both languages (12, 20 and 28 rows per language), three times over, one at a time: 360 real Jev calls on the owner's key. It prints each request's status and wall time, and the run's window.
3. In the dashboard, Workers & Pages, `justask-demo`, Observability, Query Builder, over the printed window: group by `$workers.event.request.path`, and calculate the count, median, p99 and max of `$workers.cpuTimeMs`. The same query runs on the Workers Observability REST API (`POST /accounts/{account_id}/workers/observability/telemetry/query`, a token with Workers Observability Write), not used yet.
4. Write the table below, with the date, and the verdict.

### Local signal, not the measure (2026-09-24)

In Node 24 on the owner's machine, the demo's handler with a provider that answers at once, one request per flow and language 60 times over, CPU from `process.cpuUsage` (process-wide, so GC and other threads count):

| Flow | First request | Warm median | Warm p95 | Warm max |
|---|---|---|---|---|
| search en | 49.1 ms | 1.2 ms | 4.0 ms | 9.0 ms |
| search es | 1.9 ms | 1.0 ms | 3.1 ms | 8.6 ms |
| filter en | 19.9 ms | 1.2 ms | 2.3 ms | 4.5 ms |
| filter es | 1.2 ms | 1.2 ms | 2.9 ms | 15.9 ms |
| card en | 10.5 ms | 1.0 ms | 2.1 ms | 7.4 ms |
| card es | 10.7 ms | 1.0 ms | 2.1 ms | 8.1 ms |

Warm requests fit with room. The risk is the first request on a fresh isolate, before V8 has compiled the hot paths: 10 to 49 ms here. Workers runs a different V8 on different hardware, and this excludes the SDK's own work, so it predicts nothing; it says where to look in the deployed numbers: the max, not the median.

### On the deployed Worker

Not measured yet.

| Flow | Requests | Median | p99 | Max |
|---|---|---|---|---|
| search en | | | | |
| search es | | | | |
| filter en | | | | |
| filter es | | | | |
| card en | | | | |
| card es | | | | |

### Verdict

Pending the measure. If any flow's max is over 10 ms, the demo does not fit the free plan, and the owner decides. Workers Paid, read on 2026-09-24 from https://developers.cloudflare.com/workers/platform/pricing/: $5 a month minimum, 10 million requests and 30 million CPU ms a month included, then $0.30 per million requests and $0.02 per million CPU ms. Re-read the price at the time of the decision.

## Testing the Worker side

The one fake stays the provider; the Worker side adds no other.

- **The Worker entry** is a thin shell over `createDemoHandler`: `createWorker(provider)` in `demo/worker/index.ts`, tested in Node with the fake provider like every other demo test (`test/demo-worker.test.ts`). Static assets and Access are Cloudflare's, configured and checked by hand on deploy, not tested here.
- **Cloudflare's Vitest pool does not fit this repo today.** `@cloudflare/vitest-pool-workers` 0.22.0, the latest on 2026-09-24, needs Vitest `^4.1.0`, and the repo runs Vitest 5.0.1. Revisit when a release supports Vitest 5.
- **The ledger the later tickets add** (budget, per-IP limits, answer cache) is one interface with two stores: in memory for `pnpm demo` and the tests, and a SQLite-backed Durable Object on Workers. The in-memory store is the dev server's real store, not a fake, so every policy (limits, budget, cache keys, the key switch) is tested in Node through the demo's handler with the fake provider, against it. What only the Durable Object has, its SQL and its per-object consistency, is tested against the real runtime rather than a stand-in: a Vitest file in Node that starts the Worker in local workerd through wrangler's programmatic API (Miniflare, which wrangler bundles) and sends it requests, with the fake provider behind it. That API's exact shape in the wrangler of the time is unverified; the ledger's ticket settles it first, and falls back to the Vitest pool once it supports Vitest 5.

## Facts read (2026-09-24)

- Limits, 10 ms CPU per request on free, fetch not counted, 1 s startup, error 1102: https://developers.cloudflare.com/workers/platform/limits/
- Pricing, static assets free and unlimited, Workers Paid: https://developers.cloudflare.com/workers/platform/pricing/
- `run_worker_first` takes route patterns: https://developers.cloudflare.com/workers/static-assets/binding/
- `process.env` filled from secrets under `nodejs_compat` from compatibility date 2025-04-01: https://developers.cloudflare.com/workers/configuration/compatibility-flags/
- Secrets, local `.env` or `.dev.vars`: https://developers.cloudflare.com/workers/configuration/secrets/
- Workers Logs on the free plan (200,000 events a day, 3 days kept), `$workers.cpuTimeMs`, grouping by `$workers.event.request.path`: https://developers.cloudflare.com/workers/observability/logs/workers-logs/ and https://developers.cloudflare.com/workers/observability/query-builder/
- One-click Access on `workers.dev`: https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/
- Service tokens and their headers: https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
- Durable Objects on free: SQLite-backed only, 100,000 rows written a day: https://developers.cloudflare.com/durable-objects/platform/pricing/
- wrangler 4.136.3 is pinned, not the latest 4.138.0, which was younger than pnpm's minimum release age that day.
