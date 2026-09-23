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
- `node --conditions=source demo/eval/search.ts run <en|es> <eval|dev> <n>`: the demo's search eval by hand, real Jev calls, never in CI; `compare <en|es> <first> <second>` lists flips with no call. The eval sets are frozen by checksum and the kill lines by value in `test/demo-eval.test.ts`; see `docs/search-eval.md`

Tests import the package by its own name (`justask`, `justask/react`, `justask/jev`, `justask/eval`); the `source` export condition points those at `src/`. The only fake is the provider, `test/fake-provider.ts`; the Jev adapter's tests alone use a fake TypeSafe SDK client from the same file, and one of them stubs `fetch` to check the real SDK sends the environment key once. No test calls a real provider. The one exception is the clock: a test that needs a fixed today stubs `Date` with `vi.setSystemTime`, never the timers, so the provider timeout stays real. The eval tests write their run logs to a fresh directory under the OS temp directory and remove it afterwards.

React tests (`test/*.test.tsx`) run in jsdom, chosen per file with `// @vitest-environment jsdom`. They render the pieces against the real handler in process: the hook's `fetch` option hands each request to `createSearchHandler`, wired to the fake provider. They query by role and name and run axe with its contrast rule off, since jsdom paints nothing and the pieces ship unstyled. Debounce waits are real, short pauses, for the same reason as the timeout. The demo's tests (`test/demo.test.tsx`) render its `App` the same way, against `createDemoHandler` with the fake provider.
