# Development

`@justask/core@0.1.0` is the first release, and `publishConfig` publishes it public, since a scoped package is private by default. The domain is described in [CONTEXT.md](../CONTEXT.md), the product in [PRODUCT.md](../PRODUCT.md), and decisions in [adr/](adr/).

Developing justask requires Node 24 and pnpm 12 (the version is pinned in `package.json`; `corepack enable` picks it up). The published package runs on Node 22 or later (`engines`), and CI runs the suite on both.

```sh
pnpm install
pnpm lint        # Biome: lint and format check
pnpm format      # Biome: apply fixes and formatting
pnpm typecheck   # tsc, strict
pnpm test        # Vitest, once
pnpm build       # emit dist/
```

Tests never call a real provider. They use the fake provider in `test/fake-provider.ts`, which returns fixed probabilities per question label. Real calls happen only by hand, never in CI: eval runs, `pnpm demo`, the recording script and `scripts/jev-call.ts`, each with the key in `.env` (copied from `.env.example`).

To make one real Jev call by hand and see its latency and cost:

```sh
node --conditions=justask-source scripts/jev-call.ts "invoices from Acme"
```

`@justask/core/react` takes any React 19 (`"react": "^19.0.0"`), but the tests run on the lockfile's React only. To run the packed package on another one, as CI does for 19.0.0 and the newest 19.1, build first:

```sh
pnpm build && scripts/react-peer.sh 19.0.0
```

It packs the package, installs it in a temporary project with that React, renders every piece on the server and makes one call per hook in jsdom, with no real provider.
