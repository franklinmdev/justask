# Ask calls an unavailable provider once more, within the same timeout

The owner's decision of 2026-09-24 (#93), after card round 7 (#88) failed on errors alone: of five errors in four runs, three were HTTP 529 "high traffic" answers that came back in under 250 ms, with most of the 2 s budget left, and two were timeouts.

1. **An adapter throws `ProviderUnavailableError` when the service failed to answer at all**, not the answer: an overload status such as 529, another 5xx, or a lost connection. The Jev adapter maps the SDK's `APIError` with a status of 500 or more, and its `APIConnectionError`, keeping the SDK's error as the cause. A 4xx (a rate limit, a bad request), the SDK's abort, and a missing key are thrown as they are.
2. **`ask` calls the provider once more after that error, and never a third time.** The second call shares the first call's timeout and signal, so a visitor waits no longer than before: the 2 s budget covers both calls. There is no second call once the timeout has run out, after an answer that broke the contract, or after any other thrown error.
3. **The eval's probes make one call each**, with the second call off, since they time the provider alone.
4. **An error the second call gives back is a transport failure** (`transport: true` on the `provider` error), and so is a timeout. The eval's run logs mark both, and the errors line reads them by the owner's rule on #93 (docs/card-eval.md, Latency).

This replaces the core's "no retries". The SDK's own retries stay off (`maxRetries: 0`): its backoff and its conditions are its own, it would retry for Jev alone, and the fake provider could not test it. One more call, in the core, under the developer's timeout, works for any adapter.

## Measured, not assumed

The second call changes what a visitor sees: a request the provider refused once can now fill. The next verdict round measures it. Each run log marks a row where `ask` called twice (`retried: true`), and each report counts them beside the errors. No round before this one called twice, so their logs have no mark.
