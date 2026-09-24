# The core holds no demo policy

The owner's decision of 2026-09-24, in the grilling session that settled the public demo's design (#29). The public demo runs on the owner's provider key, so it needs a daily budget, per-visitor limits, an answer cache, a switch for a key that stops working, and checks on each request. All of it lives in the demo's own server and UI, never in the core.

1. **The core's handlers, hooks and error types stay as they are.** There is no `budget_exceeded` among the core's errors, and no change to the hooks or handlers.
2. **The demo's server wraps the core handlers.** Its checks run before a handler (`demo/server/policy.ts`, #108), and the budget adds each call's `costUsd` after it (ADR 0006).
3. **The demo wraps the provider it builds**, to see the provider's real status on a refusal, which the core reports only as "The provider failed".
4. **The demo passes its own `fetch` to every hook**, to send a visitor's key and to read the server's own answers, such as its budget answer.

A host app that wants a cap builds it the same way, from each call's `costUsd`.
