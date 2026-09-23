# Design: justask
Inherits ~/.claude/design/DESIGN.md. Only slots and overrides live here.

The package's React pieces ship unstyled, so these slots bind the demo and any styled example, never the pieces' markup.

## Slots
- Accent hue: oklch(0.55 0.17 255) cobalt, with --primary-text at oklch(0.50 0.17 255) for 4.5:1 on the light housing. Reason: chosen by the owner on 2026-09-22; a precise instrument blue that stays clear of the success green and destructive red.
- Type pairing: IBM Plex Sans + JetBrains Mono. Reason: no brand evidence exists, and the demo shows candidates, probabilities and gates as data, which the mono ration covers.
- Neutral temperature: achromatic. Reason: the demo is a fictional invoicing tool, and nothing in PRODUCT.md asks for a tint.
- Signature motion: the pick settling in, translateY(4px) to 0 with opacity over 150ms; placements: the search item, a filled field, the confirm bar. Reason: the core action is the model picking among real candidates and the person confirming it.

## Overrides
- Stack notes (Tailwind, shadcn, an icon set): the demo uses plain CSS on class names and no icons. Reason: it shows the package's unstyled pieces styled the way any host app would style them, and one page needs no component library.
- App shell (icon-rail sidebar, command palette): the demo has a 56px header with the language toggle, and nothing else. Reason: one page per flow and one text box; a palette would compete with the box the demo exists to show.
- Tables on mobile stay tables: the chosen vendor's transactions (four columns) and the panel's candidates (two). Reason: both fit a 375px screen without scrolling, checked at 390, and neither has row actions a card list would carry. The filter page's five-column transactions do become a card list under 560px, as the invariant says.
- Page title: the header's page links name the pages beside the product name, the current one underlined in the accent, and the h1 is visually hidden. Reason: the demo's pages are one flow each, the link already shows the page name, and the app and panel headings below carry the hierarchy.

## Benchmarks
- None named yet.
