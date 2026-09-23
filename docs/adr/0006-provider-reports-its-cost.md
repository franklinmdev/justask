# A provider reports what each call cost, when it knows

A provider's `answer` resolves to `{ answers, costUsd? }`: the probabilities ADR 0001 requires, and the call's cost in US dollars when the adapter can work it out. This amends ADR 0001's output, which was the probabilities alone. The eval function reports cost per call, and only the adapter sees what a call used: Jev returns its input tokens in the response, and its price is per input token. The Jev adapter prices every call at jev-1.13.0's rate, the model it pins, so a measured cost stays the cost of the measured model. An adapter that cannot know its cost leaves `costUsd` out, and the eval reports the cost as unknown instead of zero.

Amended for #46: the result also carries the call's input tokens, `{ answers, costUsd?, inputTokens? }`, so a page can show what a call used without running an eval. The Jev adapter reports the input tokens it already reads to price the call. `ask` passes both figures on in its result and each handler in its response, leaving out any the provider did not report, never writing zero for unknown. A call whose answer breaks the contract keeps its figures, since it was still made; a failed or timed-out call has none.

## Considered Options

- A callback in the provider's input (`onCost`): no shape changes, but a side channel an adapter can forget without any type error. Rejected.
- The developer passes a cost function to the eval, by wrapping the SDK client themselves: the contract stays as it was, and every developer writes the same wrapper again. Rejected.
