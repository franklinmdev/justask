# Contributing

Thanks for looking. justask is maintained by one person, so a short issue first saves us both time.

## Before a pull request

- **Open an issue first** for anything beyond a typo: a bug with how to reproduce it, or a change with what it is for. A pull request without one may wait until the change is agreed.
- **A security problem never goes in an issue.** Report it privately, as [SECURITY.md](SECURITY.md) says.
- Words like *candidate*, *gate*, *held* and *shortlist* have one meaning here; [CONTEXT.md](CONTEXT.md) defines them, and design decisions are in [docs/adr/](docs/adr/). A change that goes against an ADR says so and proposes amending it.

## Set up and check

[docs/development.md](docs/development.md) has the setup (Node 24 and pnpm 12 to develop; the package runs on Node 22 or later) and every command. Before you push:

```sh
pnpm lint
pnpm typecheck
pnpm test
```

You need no API key. Tests never call a real provider: they use the fake one in `test/fake-provider.ts`. A bug fix comes with a test that fails without it.

## Changes the evals decide

How a question is worded, a candidate's description, and a gate's value change what the model fills, and the README's numbers come from measured eval rounds. Such a change is proposed in an issue; the maintainer runs a new round with real calls under the rules in [docs/card-eval.md](docs/card-eval.md), [docs/filter-eval.md](docs/filter-eval.md) and [docs/search-eval.md](docs/search-eval.md), which are fixed before any call. Never edit a frozen eval set, a run log or a recording in `demo/recordings/` by hand.

## Style

- Commit messages follow the history: a gitmoji, a conventional type and scope, and the issue number, as in `🐛 fix(parse): read 'a las 12.30' as a time, not 12.3 in money (#241)`.
- Markdown goes in `docs/`, beside the root files (`README.md`, `CONTEXT.md` and the like); CI enforces it with `scripts/check-docs-location.sh`, and `.claude/docs-allowlist` holds the exceptions.
- Code is formatted by Biome (`pnpm format`).

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
