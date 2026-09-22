# A provider must answer every question in one call, with a probability for every label

The core sends a provider the facts and all of a request's questions in one call, each question an instruction plus labelled descriptions, and requires back, per question, a probability for every label, not just the winner. Jev (`@typesafe-ai/sdk` 0.6.0, `client.systemOne`) already does both, and search needs the full distribution to order candidates. A model that returns only a winner, or that needs one call per question, does not fit this contract: a card asks 13 questions, so one call per question would multiply latency and cost, and a winner-only answer would lose search's ordering.

## Considered Options

- Winner plus its probability only: fits more models, loses search ordering. Rejected.
- One question per call: simpler contract, 13 round trips for a card. Rejected.
