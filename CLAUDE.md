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
- `node --conditions=source scripts/jev-call.ts ["a request"]`: one real Jev call through `ask`, by hand with the key in `.env`, never in CI; prints latency and cost

Tests import the package by its own name (`justask`, `justask/react`, `justask/jev`); the `source` export condition points those at `src/`. The only fake is the provider, `test/fake-provider.ts`; the Jev adapter's tests alone use a fake TypeSafe SDK client from the same file, and one of them stubs `fetch` to check the real SDK sends the environment key once. No test calls a real provider. The one exception is the clock: a test that needs a fixed today stubs `Date` with `vi.setSystemTime`, never the timers, so the provider timeout stays real.

React tests (`test/*.test.tsx`) run in jsdom, chosen per file with `// @vitest-environment jsdom`. They render the pieces against the real handler in process: the hook's `fetch` option hands each request to `createSearchHandler`, wired to the fake provider. They query by role and name and run axe with its contrast rule off, since jsdom paints nothing and the pieces ship unstyled. Debounce waits are real, short pauses, for the same reason as the timeout.
