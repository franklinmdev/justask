# justask

## Agent skills

### Issue tracker

Issues and tickets are GitHub Issues on this repo, driven with `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles use their default names: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root plus `docs/adr/`. See `docs/agents/domain.md`.

## Commands

- `pnpm lint`: Biome lint and format check (`pnpm format` applies fixes)
- `pnpm typecheck`: strict `tsc`
- `pnpm test`: Vitest, once; `pnpm test test/ask.test.ts` for one file
- `pnpm build`: emit `dist/`
- `pnpm demo`: the local demo in `demo/` (Vite, handler as dev middleware), real Jev calls with the key in `.env`
- `node --conditions=source scripts/jev-call.ts ["a request"]`: one real Jev call through `ask`, by hand with the key in `.env`, never in CI; prints latency and cost
- `node --conditions=source demo/recordings/record.ts`: the showcase's recorded runs, four real Jev calls through the demo's handler, by hand with the key in `.env`, never in CI; rewrites `demo/recordings/<table|search>-<en|es>.json` only when every call gives its eval row's expected result. Never edit a recording by hand; rerun the script after a change to the gates
- `node --conditions=source demo/eval/search.ts run <en|es> <eval|round2|round3|dev> <n>`: the demo's search eval by hand, real Jev calls, never in CI; `compare <en|es> <eval|round2|round3> <first> <second>` lists flips with no call. The eval sets are frozen by checksum and the kill lines by value in `test/demo-eval.test.ts`; see `docs/search-eval.md`
- `node --conditions=source demo/eval/filter.ts run <en|es> <eval|dev> <n>`: the demo's filter eval by hand, real Jev calls, never in CI; `compare <en|es> <first> <second>` lists flips and `gates <dev n>` prints each field's gate by the approved rule, both with no call. The eval sets are frozen by checksum and the kill lines by value in `test/demo-filter-eval.test.ts`; see `docs/filter-eval.md`
- `node --conditions=source demo/eval/card.ts run <en|es> <eval|round2|round3|round4|dev|diag|pair> <n>`: the demo's card eval by hand (`diag`: #57's command probes, `pair`: #63's pair probes, no verdict), real Jev calls, never in CI; `compare <en|es> <eval|round2|round3|round4> <first> <second>` lists flips and `gates <dev n>` prints the intent's and each field's gate by the filter's rule, both with no call. The eval sets are frozen by checksum and the kill lines by value in `test/demo-card-eval.test.ts`; see `docs/card-eval.md`

The key's `.env` lives in the main checkout; the demo, the evals and `scripts/jev-call.ts` load it from there when a worktree has none (`scripts/load-env.ts`), so never copy it into a worktree.
- `node --conditions=source demo/eval/baseline.ts <run log>...`: the provider probes' median over saved run logs of any flow, with no call; the baseline to write into `demo/eval/probe.ts` before a verdict run, which the three eval CLIs refuse while it is null. See `docs/card-eval.md`, Latency

Tests import the package by its own name (`justask`, `justask/react`, `justask/jev`, `justask/eval`); the `source` export condition points those at `src/`. The only fake is the provider, `test/fake-provider.ts`; the Jev adapter's tests alone use a fake TypeSafe SDK client from the same file, and one of them stubs `fetch` to check the real SDK sends the environment key once. No test calls a real provider. One exception to the one fake is the clock: a test that needs a fixed today stubs `Date` with `vi.setSystemTime`, never the timers, so the provider timeout stays real. Another is the viewport: jsdom has no `matchMedia`, so the showcase's tests (`test/demo-showcase.test.tsx`) stub it with a width, to reach the phone layout, and the replay's tests (`test/demo-replay.test.tsx`) stub it with a desktop width and the reduced-motion setting, to reach the typed sentence. The last is an unreachable handler: a handler served in process always answers, so a test of a network failure hands the hook or the demo a `fetch` that rejects (`test/use-card.test.tsx`, `test/demo.test.tsx`). The eval tests write their run logs to a fresh directory under the OS temp directory and remove it afterwards, and so does the Code tab's test (`test/demo-snippet.test.ts`), which typechecks each snippet there with the repo's `tsc`, and the env loader's test (`test/load-env.test.ts`), which builds a real git repo and worktree there with its own `.env` files, never the real one.

React tests (`test/*.test.tsx`) run in jsdom, chosen per file with `// @vitest-environment jsdom`. They render the pieces against the real handler in process: the hook's `fetch` option hands each request to `createSearchHandler`, wired to the fake provider. They query by role and name and run axe with its contrast rule off, since jsdom paints nothing and the pieces ship unstyled. Debounce waits are real, short pauses, for the same reason as the timeout. The demo's tests (`test/demo.test.tsx`) render its `App` the same way, against `createDemoHandler` with the fake provider, and so do the card, filter and showcase tests (`test/demo-card.test.tsx`, `test/demo-filter.test.tsx`, `test/demo-showcase.test.tsx`), all with `recordings={null}`, so every case opens idle. Only the replay's tests (`test/demo-replay.test.tsx`) open on the recording files themselves, with a provider that fails, to show the replay makes no call; a replay runs on real timers, so they wait for it with a longer `waitFor` timeout.
