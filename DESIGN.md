# Design: justask
Inherits ~/.claude/design/DESIGN.md. Only slots and overrides live here.

The package's React pieces ship unstyled, so these slots bind the demo and any styled example, never the pieces' markup.

## Slots
- Accent hue: oklch(0.55 0.17 255) cobalt, with --primary-text at oklch(0.50 0.17 255) for 4.5:1 on the light housing. Reason: chosen by the owner on 2026-09-22; a precise instrument blue that stays clear of the success green and destructive red.
- Type pairing: IBM Plex Sans + JetBrains Mono. Reason: no brand evidence exists, and the demo shows candidates, probabilities and gates as data, which the mono ration covers.
- Neutral temperature: achromatic. Reason: the demo is a fictional invoicing tool, and nothing in PRODUCT.md asks for a tint.
- Signature motion: the pick settling in, translateY(4px) to 0 with opacity over 150ms; placements: the search item, a filled field, the confirm bar. Reason: the core action is the model picking among real candidates and the person confirming it.

## Overrides
- None.

## Benchmarks
- None named yet.
