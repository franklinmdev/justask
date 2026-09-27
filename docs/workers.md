# The demo on Cloudflare Workers

**Status (2026-09-24, #107): deployed behind Access at `https://justask-demo.franklinmdev.workers.dev`, every flow answers there, and CPU is measured: search and filter fit the free plan's 10 ms with room (max 9 ms), the card does not cleanly. 8 of its 168 requests ran 10 to 29 ms, every one of them in rounds 1 and 2 of 3, none in round 3, and every one answered, since Cloudflare lets an isolate run over now and then. Verdict: the owner chose the free plan on 2026-09-24, and the demo's page sends a request Cloudflare stops on the CPU limit once more (Verdict, below).**

## Shape

One Worker on the free plan, `justask-demo` (`wrangler.jsonc`):

- The frontend is what `pnpm demo:build` writes to `demo/dist`, served as the Worker's static assets. Static requests never reach the Worker's code, so they cost no Worker CPU and, per Cloudflare's pricing page, are "free and unlimited".
- `/api/*` alone runs the Worker first (`run_worker_first`), which serves the demo's handler, `createDemoHandler`, with the real Jev provider (`demo/worker/main.ts`, the entry, over `createWorker` in `demo/worker/index.ts`). The handler and the catalogs' shortlists are built once per isolate, at startup, not per request.
- **The daily budget (#109)** lives in one SQLite-backed Durable Object, `DemoLedger`, bound as `LEDGER` (`demo/worker/ledger.ts`, `wrangler.jsonc`), one row a UTC day. Every request reads the day's spend over RPC before its call; past $1 it answers 402 `budget_exceeded` with no call. Each call's `costUsd` is added as soon as the call returns, before its answer is used. A small overshoot is accepted: requests in flight when the budget is crossed are still answered.
- **The kill switch** is the Worker's secret `DEMO_KILL_SWITCH`: set to any value, it makes the day's budget count as spent, so every request gets the same 402 through the same path, with no call. Its `cause` is `paused` rather than `budget`, and the page says the live demo is paused, with the same replay button and clone link, and never a time it comes back: the owner ends it, not midnight UTC (owner, 2026-09-25). `pnpm exec wrangler secret put DEMO_KILL_SWITCH` turns it on and `pnpm exec wrangler secret delete DEMO_KILL_SWITCH` off; each deploys a new version at once. On `pnpm demo`, `DEMO_KILL_SWITCH=on pnpm demo` does the same, and the ledger is in memory, so its spend starts over with the server.
- **The visitor's limits (#110)** live in the same `DemoLedger`: 20 calls a UTC minute and 200 a UTC day per visitor, a fixed window each, counted after the budget check, on the request's first provider call only, so a request that never calls the provider (an empty or blank one, a malformed body, a GET) counts nothing and writes no row (#219); a retried call is the same request. The visitor is the address in `CF-Connecting-IP`, which Cloudflare sets to the client's address on a request that reaches the Worker from the edge ("When no Worker subrequest is triggered, `cf-connecting-ip` reflects the client's IP address", https://developers.cloudflare.com/fundamentals/reference/http-headers/, read on 2026-09-25); an IPv6 address counts by its /64 (`visitorAddress` in `demo/server/visitors.ts`). No cookie. Past either limit the answer is the budget's 402 with `cause: "visitor"` and `limit: "minute"` or `"day"`, and the page says which and when it comes back. The object stores only a SHA-256 of the address with a random salt for the UTC day, in a `visitors` table, one row a visitor; an alarm at the next UTC midnight deletes every row and the salt, and the day's first call draws a new salt (and deletes them too, should the alarm be late), so no count outlives its day. The alarm is set on each day's first call and checks the object's own clock, so it never drops the day it runs in. The salt sits beside the hashes, so whoever can read the object's storage could still test today's addresses against them; after midnight, nothing names anyone. A call stamped just before a minute or a day another call has already passed counts in the newer one, so a slow isolate's clock never starts a count over. Each counted call writes one row, beside the spend's one: two of the free plan's 100,000 rows written a day per call, about 50,000 calls a day (unverified whether a `DELETE` of no row counts). If Cloudflare's Pseudo IPv4 were set to overwrite headers, an IPv6 visitor would arrive as a pseudo IPv4 address and count per address, not per /64; it is off unless set on a zone.
- **The measure meets the limits.** `demo/worker/measure.ts` sends its 360 calls from one address, so on a Worker with #110 its 21st call in a minute gets the visitor's 402, as a call past the day's $1 already did with #109. A new measure needs a way past both that does not open one for visitors; none is built yet.
- **A refused key.** When TypeSafe refuses the owner's key with any 4xx other than 429, the request is answered 503 `key_out_of_service`, and the page says the demo's own key is out of service, never a result with every field held. There is no probe and no stored state: each request that TypeSafe refuses gets that answer, and the first one TypeSafe accepts after a new key or a top-up answers as usual. A 429, a 5xx or a lost connection keep the usual provider error. The server log keeps TypeSafe's own answer.
- The key is the Worker's secret `TYPESAFE_API_KEY`. Under `nodejs_compat` the runtime fills `process.env` from the Worker's secrets, where the TypeSafe SDK reads it, as it does on the dev server. It is in no file of the repo and in neither bundle: on 2026-09-24 the key's value was searched for in `demo/dist` and in the Worker bundle wrangler writes, and found in neither (its name is in the Worker bundle, as in the SDK).
- Workers Logs is on (`observability`), which is where each request's CPU time is read. A failed request logs its error and, for a provider error, the SDK's error object, as on the dev server. That object holds TypeSafe's response (status, body, response headers), never the request's `Authorization` header, and the SDK redacts request headers even in its debug log (read in `@typesafe-ai/sdk` 0.6.0's `dist/index.mjs` on 2026-09-24). The Access service token's secret never reaches the Worker: in the measure's trace events on 2026-09-24, the request headers had no `cf-access-client-id` or `cf-access-client-secret`, and `cf-access-jwt-assertion` and `cookie` read `REDACTED`. Delete the token once it is no longer needed.
- `pnpm demo` is unchanged: the Vite dev server with the handler as middleware, the key from `.env`. It streams each request's body to the handler, as the README's `toNode` does, so the handler's 16 KiB cap holds there too, and aborts the call when the browser goes away. It names each request's socket address in `CF-Connecting-IP`, so the visitor's limits count there as on the Worker; the ledger is in memory, so the counts start over with the server. A request with no `CF-Connecting-IP` counts against no visitor: only the recording script and the tests call the handler directly.

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
6. For the measure, create a service token (Zero Trust, Access controls, Service credentials, Service Tokens), add a second policy to the Worker's Access application with the **Service Auth** action and that token as its rule (with the Allow action, Access sends the token to the login page), and put its pair in the main checkout's `.env` as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`. Cloudflare shows the secret once. Delete the token once the measure is written down.

### Every push to main deploys itself (#129)

Cloudflare Workers Builds builds and deploys `justask-demo` on every push to `main`: no GitHub secret, no Actions workflow. Owner's dashboard settings, entered 2026-09-26 (Workers & Pages, `justask-demo`, Settings, Builds):

| Setting | Value |
|---|---|
| Git repository | `franklinmdev/justask` |
| Git branch | `main` |
| Build command | `pnpm demo:build` |
| Deploy command | `pnpm exec wrangler deploy`, the wrangler pinned in `package.json` |
| Root directory | empty, the repo root |
| Build variables | `NODE_VERSION=24.18.0`, `PNPM_VERSION=12.5.1`, `WRANGLER_BUILD_CONDITIONS=source,workerd,worker,browser` |
| Branch control | Enable Preview Builds off, so no other branch deploys anything |

- `NODE_VERSION` names a Node the build image preinstalls. A version it has to install leaves no `pnpm` on the path ("No preset version installed for command pnpm"). Its default pnpm is older than `packageManager`, hence `PNPM_VERSION`.
- Build variables exist only during the build. `TYPESAFE_API_KEY` and `DEMO_KILL_SWITCH` are the Worker's runtime secrets, set with `wrangler secret put`; a build never sees or changes them.
- Workers Builds does not wait for GitHub's checks (its docs say nothing of it, read 2026-09-26), so a merge with red CI deploys too. Merge only on green.
- The first connection picked the wrong repository, and the build ran `uv sync` on it: when a build log installs anything but pnpm packages, check the connected repository first.
- `pnpm demo:deploy` stays for a first deploy, a rollback, or a deploy while Workers Builds is down.

The Worker stays behind Access until the launch ticket of #29, so nobody spends the key before the limits exist.

The first deploy with #109 creates the `DemoLedger` class from the `v1` migration in `wrangler.jsonc`; nothing is set up by hand. The class creates its own tables when it starts (`CREATE TABLE IF NOT EXISTS`), so #110's tables need no new tag; a new tag is for creating, renaming or deleting a class, never an edit of `v1`.

## Measuring CPU

The free plan allows 10 ms of CPU per request; waiting on `fetch`, such as the Jev call, does not count. A Worker's startup is under its own limit of 1 s, separate from the request's. Over it, the request fails with error 1102, but not at once: "Each isolate has some built-in flexibility to allow for cases where your Worker infrequently runs over the configured limit. If your Worker starts hitting the limit consistently, its execution will be terminated" (https://developers.cloudflare.com/workers/platform/limits/, read on 2026-09-24). The docs do not say how often is infrequent.

### Procedure

1. Deploy, then send nothing else for a while, so the first measured request lands on a fresh isolate if Cloudflare evicted it (unverified how long that takes). Start `pnpm exec wrangler tail justask-demo --format json > <file>` before the first request, so the tail catches it.
2. `node --conditions=source demo/worker/measure.ts <workers.dev URL> 3`: every dev row of the search, filter and card eval sets, both languages (12, 20 and 28 rows per language), three times over, one at a time: 360 real Jev calls on the owner's key. One request at a time is not how a visitor types, but CPU is per request, so the pace does not change it. It prints each request's status and wall time, and the run's window, and stops at the first request Access refuses.
3. Stop the tail. Each request's trace event carries `cpuTime` and `wallTime` in ms and `event.request.url`; group by the URL's path, and take the count, median, p99 (linear between ranks) and max of `cpuTime`. Match the events to the measure's lines in time order to tell the rows and rounds apart. The dashboard's Observability Query Builder has the same numbers (`$workers.cpuTimeMs`, grouped by `$workers.event.request.path`). Its REST API (`POST /accounts/{account_id}/workers/observability/telemetry/query`) refused wrangler's login token with an authentication error on 2026-09-24; it needs an API token with Workers Observability permission.
4. Write the table below, with the date, and the verdict.

### Local signal, not the measure (2026-09-24)

In Node 24 on the owner's machine, from a throwaway script not kept in the repo: the demo's handler with a provider that answers at once, one request per flow and language 60 times over, CPU from `process.cpuUsage` (process-wide, so GC and other threads count):

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

2026-09-24, 17:53:52 to 17:55:50 UTC, three rounds of every dev row, 360 requests, every one 200 with outcome `ok`, one deployed version (`fe341dc9`), all served from Cloudflare's ATL location. The Worker had been idle for about an hour since its secret was set. CPU in ms, from the tail's trace events:

| Flow | Requests | Median | p99 | Max | Over 10 ms | First request |
|---|---|---|---|---|---|---|
| search en | 36 | 2 | 5.6 | 6 | 0 | 6 |
| search es | 36 | 2 | 6.9 | 9 | 0 | 3 |
| filter en | 60 | 2 | 5.2 | 7 | 0 | 7 |
| filter es | 60 | 2 | 3.4 | 4 | 0 | 2 |
| card en | 84 | 3 | 14.3 | 16 | 4 | 16 |
| card es | 84 | 2 | 26.5 | 29 | 4 | 16 |
| all | 360 | 2 | 14.8 | 29 | 8 | 6 (search en, the run's first) |

The cold start was not the problem: the run's first request, on a Worker idle for an hour, took 6 ms. The overruns were all card requests, and none belongs to one request. The same rows ran 2 or 3 ms in round 3:

| Card row | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| en 1, `Paydale HR consulting, $400 on August 24` | 16 | 14 | 2 |
| en 18, `undo the last expense` | 14 | 14 | 2 |
| es 1, `consultoría de recursos humanos de Serena, $400 el 24 de agosto` | 16 | 14 | 2 |
| es 3, `renovación de la póliza de Cobertura Plena hoy, $1,200` | 10 | 2 | 3 |
| es 18, `deshaga el último gasto` | 3 | 26 | 2 |
| es 20, `pase el gasto del taxi al viernes` | 29 | 3 | 3 |

Rows 1 are the first card request of a round, right after 40 filter requests; rows 18 are the set's first requests that name a command on an existing record. That points at code paths the isolate had not run yet, or recently, being compiled, and at garbage collection, not at the card's own work, which is 2 or 3 ms once warm. The trace cannot split justask's CPU from the TypeSafe SDK's, and whether the card ran on one isolate or several is not in the events. The Node signal above said to watch the max; it was the card, not the first request.

### Verdict

**Search and filter fit the free plan. The card does not fit cleanly:** 8 of 168 card requests (4.8%), 8 of 360 overall (2.2%), ran over 10 ms, up to 29 ms. None failed: Cloudflare's per-isolate allowance let every one through. Whether it keeps doing so for real visitors, who would hit fresh isolates more often than a 2-minute run on one location, is not known, and the docs do not say how often is too often. A refused request is Cloudflare's error 1102, which the demo's page sends once more before it shows the usual error (The CPU limit's retry, below).

**The owner chose the free plan on 2026-09-24, not Workers Paid.** The reason: the demo is an open-source developer tool with low traffic, and a card that fails now and then is acceptable there. Workers Paid, for the record, re-read that day from https://developers.cloudflare.com/workers/platform/pricing/: $5 a month minimum for the account, 10 million requests and 30 million CPU ms a month included, then $0.30 per additional million requests and $0.02 per additional million CPU ms, with 30 s of CPU per request by default. Under #29's limits the demo would stay inside what is included (estimate, not measured: its $1 a day budget is about 7,700 card calls a day, 230,000 a month, at about 3 ms each), so that bill would be the $5.

**Revisit, at #115 (go public):** check Workers Logs for 1102 stops on launch day, and again one week later; if they are more than rare, reconsider Workers Paid. A check by hand, not an alert, because a Worker stopped on its CPU limit cannot report its own stop: the stop is seen only from outside the stopped request. To check: Workers & Pages, `justask-demo`, Observability, over the day, count the `/api/*` requests whose outcome is the CPU limit's (`exceededCpu` in the tail's trace events; the name in the Query Builder is unverified), against all of them. Decided by the owner on 2026-09-24, over extending #114's alert.

### The CPU limit's retry

The demo's page sends a request Cloudflare stopped on the CPU limit once more, and never a third time; a second stop shows the page's usual error (`demo/src/cpu-limit.ts`, around the `fetch` every page gets, tested in `test/demo-card.test.tsx`). It works for every flow, though only the card has run over.

- **How a stop is known:** error 1102 is Cloudflare's own answer, not the handler's. Its HTTP status and page are not in Cloudflare's docs (read on 2026-09-24), and local workerd does not enforce a CPU limit, so none was seen here. The page takes a 5xx whose body is not JSON and names `1102` as the stop. If Cloudflare's answer does not name the code, the retry never fires and the visitor sees the usual error, as before. Unverified until a real 1102 is seen.
- **Whether a retried card spends the key twice:** it can. The card's own CPU runs both before the Jev call (reading the request, the shortlist, the questions) and after it (the gates, the card). A request stopped after the call has already been answered and charged for, and the retry calls Jev again; one stopped before it spent nothing. The trace events do not say which of the 8 overruns was which. At about $0.00013 a card call ($1 for 7,700), a second call costs next to nothing.
- **Whether the budget counts it (#109):** it does. The budget adds a call's `costUsd` in the provider the handler calls, as soon as the call returns and before the gates run, and waits for the ledger's write before the answer goes on. So a request stopped in the gates has already counted the call it paid for, and its retry counts its own. The one gap left is a stop between the call's return and the ledger's write, which is waiting on the Durable Object, not CPU; accepted, at one card call's cost.
- **The browser's abort (#176):** the handler stops the provider call when `request.signal` fires, and on Cloudflare it fires only with the `enable_request_signal` compatibility flag, which has no default-on date (https://developers.cloudflare.com/workers/configuration/compatibility-flags/, read on 2026-09-26), so `wrangler.jsonc` sets it. Local workerd cannot show it: under wrangler's test harness and under `wrangler dev` (wrangler 4.136.3, workerd 1.20260921.1), a fetch aborted 300 ms into a call that never answers reached the provider only at the handler's 2 s timeout, on 2026-09-26. The request passes through Miniflare's own entry Worker first, and a client hang-up is reported not to cross that hop (cloudflare/workers-sdk#15447 and its neighbours, unverified in Miniflare's source). Whether the deployed Worker aborts is unverified until checked there.
- **A call past the timeout (#109):** the core aborts it at `TIMEOUT_MS` (2 s), and the Jev adapter passes that signal to the SDK, so the call never returns and reports no cost; whether TypeSafe charges a request aborted mid-flight is unverified, and the demo cannot learn its cost either way. Accepted: at most one call per timed-out request, next to nothing at the demo's prices, and `ctx.waitUntil` would not help, since no answer ever arrives to count.

## Testing the Worker side

The one fake stays the provider; the Worker side adds no other.

- **The Worker** is a thin shell over `createDemoHandler`: `createWorker(provider)` in `demo/worker/index.ts`, tested in Node with the fake provider like every other demo test (`test/demo-worker.test.ts`). The entry, `demo/worker/main.ts`, hands it the Durable Object ledger and the kill switch through `durableWorker` (`demo/worker/durable.ts`), which imports the runtime's own module and so is tested in workerd (below). Static assets and Access are Cloudflare's, configured and checked by hand on deploy, not tested here.
- **Cloudflare's Vitest pool does not fit this repo today.** `@cloudflare/vitest-pool-workers` 0.22.0, the latest on 2026-09-24, needs Vitest `^4.1.0`, and the repo runs Vitest 5.0.1. Revisit when a release supports Vitest 5.
- **The ledger** (the day's spend and the visitor's limits now; the answer cache later) is one interface, `Ledger` in `demo/server/budget.ts`, with two stores: in memory for `pnpm demo` and the tests, and the SQLite-backed Durable Object on Workers. The in-memory store is the dev server's real store, not a fake, so every policy (the budget, its UTC day, the kill switch, a refused key, the visitor's limits) is tested in Node through the demo's handler with the fake provider, against it (`test/demo-budget.test.ts`, `test/demo-visitor.test.ts`; the page's side in `test/demo-stopped.test.tsx` and `test/demo-replay.test.tsx`).
- **What only the Durable Object has**, its SQL and its one object for every request, is tested against the real runtime rather than a stand-in: `test/demo-durable.test.ts` starts the Worker in local workerd through wrangler's own `createTestHarness` (wrangler 4.136.3, read in its `cli.d.ts` on 2026-09-25) and sends it requests. Its entry, `test/worker/entry.ts`, is the deployed one's shape (`durableWorker` in `demo/worker/durable.ts`) over the fake provider, and its bindings and migrations are read from `wrangler.jsonc`, so the two cannot drift. Its calls cost $0.4 each, or the var `TEST_COST_USD`'s dollars, which the visitor's tests set to 0 so their limits are reached before the budget. The Worker reads the real clock, so a visitor test makes its calls again on fresh storage when a UTC minute's edge fell between their start and their end (#166): under load the calls took up to 12.6 s, past any wait for a minute's last seconds. It starts in about a second, needs no network and no Cloudflare account, and runs in CI with the rest.
- **The Workers runtime's types** are declared by hand, for the few pieces used (`demo/worker/cloudflare-workers.d.ts`): the repo's one tsconfig is Node's and the DOM's, and the runtime's generated types would redeclare both.

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
- Workers Builds: settings, the build image's preinstalled Node (22.23.2, 24.18.0) and default pnpm (10.11.1, `PNPM_VERSION`), and Branch control's Enable Preview Builds (read 2026-09-26): https://developers.cloudflare.com/workers/ci-cd/builds/configuration/, https://developers.cloudflare.com/workers/ci-cd/builds/build-image/, https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
- wrangler 4.136.3 is pinned, not the latest 4.138.0, which was younger than pnpm's minimum release age that day.

## Facts read (2026-09-25, #109)

- SQLite storage API, `ctx.storage.sql.exec(query, ...bindings)`, each call its own transaction: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- `getByName` on a Durable Object namespace: https://developers.cloudflare.com/durable-objects/api/namespace/
- `env` importable from `cloudflare:workers` at the top level, with no Durable Object call outside a request: https://developers.cloudflare.com/workers/runtime-apis/bindings/
