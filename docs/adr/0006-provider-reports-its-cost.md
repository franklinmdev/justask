# A provider reports what each call cost, when it knows

A provider's `answer` resolves to `{ answers, costUsd? }`: the probabilities ADR 0001 requires, and the call's cost in US dollars when the adapter can work it out. This amends ADR 0001's output, which was the probabilities alone. The eval function reports cost per call, and only the adapter sees what a call used: Jev returns its input tokens in the response, and its price is per input token. The Jev adapter prices every call at jev-1.13.0's rate, the model it pins, so a measured cost stays the cost of the measured model. An adapter that cannot know its cost leaves `costUsd` out, and the eval reports the cost as unknown instead of zero.

## Considered Options

- A callback in the provider's input (`onCost`): no shape changes, but a side channel an adapter can forget without any type error. Rejected.
- The developer passes a cost function to the eval, by wrapping the SDK client themselves: the contract stays as it was, and every developer writes the same wrapper again. Rejected.
