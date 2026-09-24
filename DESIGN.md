# Design: justask
Inherits ~/.claude/design/DESIGN.md. Only slots and overrides live here.

The package's React pieces ship unstyled, so these slots bind the demo and any styled example, never the pieces' markup.

## Slots
- Accent hue: oklch(0.55 0.17 255) cobalt, with --primary-text at oklch(0.50 0.17 255) for 4.5:1 on the light housing. Reason: chosen by the owner on 2026-09-22; a precise instrument blue that stays clear of the success green and destructive red.
- Type pairing: IBM Plex Sans + JetBrains Mono. Reason: no brand evidence exists, and the demo shows candidates, probabilities and gates as data, which the mono ration covers.
- Neutral temperature: achromatic. Reason: the demo is a fictional invoicing tool, and nothing in PRODUCT.md asks for a tint.
- Signature motion: the pick settling in, translateY(4px) to 0 with opacity over 150ms, its box lit in the accent (border and a 10 percent wash) that fades over 800ms; placements: the filter control, the form field and the chosen search result. The table's controls and the form's fields an answer fills settle in field order, 50ms apart, and settle again with each answer. Under reduced motion only the light shows, over 400ms, with no settle. It starts once the answer is in and never delays the call. Reason: the core action is the model picking among real candidates, and the showcase shows the app's own controls taking the picks; at a few hundred ms per call the fill was too fast to follow without a trace the eye can catch (#123).

## Overrides
- Stack notes (Tailwind, shadcn, an icon set): the demo uses plain CSS on class names and no icons. Reason: it shows the package's unstyled pieces styled the way any host app would style them, and one page needs no component library.
- No icons, but two: the card page's calendar steps between months with two authored SVG chevrons. Reason: a 32px step in a 264px popover has no room for "Previous month", and the arrows are the convention every calendar teaches; the buttons carry the words as their accessible names.
- App shell (icon-rail sidebar, command palette): the demo has a 56px header with the case tabs, the theme toggle and the language toggle, and nothing else. Reason: one showcase page with three cases and one text box each; a palette would compete with the box the demo exists to show.
- Tables on mobile stay tables: the chosen vendor's transactions (four columns) and the panel's candidates (two). Reason: both fit a 375px screen without scrolling, checked at 390, and neither has row actions a card list would carry. The Table case's five-column transactions do become a card list under 560px, as the invariant says.
- Page title: case tabs (Table, Form, Search) replace the page links beside the product name, the selected one underlined in the accent, and the h1, the case's name, is visually hidden. Reason: the showcase is one page, the selected tab already shows the case, and the app and hood headings below carry the hierarchy.
- Motion only when the instrument responds to the person: a recorded run, on load, types its sentence into the box (and presses Enter on the Form case, whose box calls only on Enter), and the controls or fields settle in with no one acting; the Table's answer applies itself, as a live one does, and the replay never presses Save. Reason: the showcase must show a real answer in the first viewport with no click (docs/demo-showcase-brief.md), and a replay the eye can follow proves the controls are the app's own; it is interruptible, ends at the person's first keystroke, pick, control or field change, and under reduced motion the sentence appears whole and the controls fade.
- URL reflects state (open panel): the case and the language live in the URL, the hood's place does not. Reason: the hood is open beside the app on a desktop and behind a switch on a phone, so one flag would mean two things on the two layouts; a shared link opens each device on its default, the hood open on a desktop and the app first on a phone, and the place is kept while the visitor moves between cases.

- Confirm for a reversible action: the Table case applies each answer to its controls with no Apply button, and Clear filters undoes it; Confirm stays where a record is created (the Form card's Save). Reason: the owner's call on 2026-09-24 (#123): filtering is reversible, the invariant bans confirming reversible actions, and a first visitor never found the Apply button.
- Suggestions ("Try a request") sit in a raised surface panel with a title-size heading, not under a divider. Reason: they are the way in, and a first visitor looked past them (#123). Their chips keep the accent's text, so the panel adds no second accent.

## Benchmarks
- None named yet.
