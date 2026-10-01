# Security

## Reporting a vulnerability

Report it privately through GitHub: on this repository's page, open the **Security and quality** tab (**Security** on some accounts) and press **Report a vulnerability**. Only the maintainer reads the report. Please do not open a public issue, pull request or discussion about it.

Say what is affected (the package, which entry point, or the demo), how to reproduce it, and what an attacker gains. I aim to reply within 7 days. A fix and its advisory are published together, once a fixed release is out.

## What is covered

- The package: `@justask/core`, `@justask/core/react`, `@justask/core/jev` and `@justask/core/eval`, at the latest release and on `main`.
- The public demo and its Cloudflare Worker (`demo/`), including its budget and per-visitor limits.

## Known limits, not vulnerabilities

- A request can carry instructions for the provider, and the provider may follow them. The role-marker check holds only the obvious cases ([ADR 0015](docs/adr/0015-a-role-marker-holds-the-request.md)); a host that passes text the person did not write keeps a step where the person checks the result. See [Text the person did not write](README.md#text-the-person-did-not-write).
- A filled field can be confidently wrong; see [the README](README.md#limits) on why the person confirms it.
- The demo runs on Cloudflare's free plan, whose account-wide request quota can take it down until 00:00 UTC. The owner accepted this for launch.
