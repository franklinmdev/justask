# The provider picks among candidates; it never writes a value

Code finds the candidates (parsed dates, times and amounts; catalog rows; files), the provider picks one label per question, each question carrying `not_mentioned` and `not_available`, and code builds the result from the picked candidates. A provider is never asked to produce a date, amount or name as text. Three lab experiments (search, filter, card in `~/jev-lab`) passed with this shape and nothing invented; letting the model write values would make every field a possible invention and would leave nothing for a gate to measure against.

## Consequences

- A value no parser or catalog can produce cannot be filled. It stays held for the person to type.
- Ambiguity that code can see, such as "next Friday", is held by code, not left to the gate, because in the lab its probability sat on the gate (0.86 to 0.91) and the field filled or not by chance.
