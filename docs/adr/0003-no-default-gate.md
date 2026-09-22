# Every field declares its gate; there is no default

A field without a gate does not compile. justask ships no default, not even the 0.9 the lab used, because a gate is only meaningful once measured on an eval set for that field and that app, and a default would be used unmeasured. justask ships the eval function that measures it (exact, coverage, invented, held ambiguous, p95, cost per gate) so the rule is practical, not just stated.
