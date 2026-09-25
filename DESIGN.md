# Design: justask
Fences from ~/.claude/design/DESIGN.md (never list, craft floor). Everything else is this direction.

The package's React pieces ship unstyled, so this direction binds the demo and any styled example, never the pieces' markup.

## Direction: Mounted specimen
The invoicing app sits in a framed window on a quiet neutral page, the way Cal.com shows its booking widget, so a developer judges justask inside an app like theirs; the hood beside it explains every pick in plain rows.

- References: Cal.com's homepage (the real widget framed on a plain ground is the hero); Stripe Elements (the component shown mounted inside a host app); a specimen mounted on a lab slide, from outside software: the object on show sits on its own raised surface, everything around it is quiet.
- Type: Mona Sans (variable, weight axis) for everything, 800 for the product name, 600 for headings, 400 to 500 for UI; Fragment Mono only for real data: figures, invoice numbers, dates in tables, code. Reason: a confident grotesk that is not a reflex face (not Inter, Geist or the system sans, and none of the spent faces) and that stays plain at small sizes; one family keeps the page from looking designed at.
- Color strategy: Restrained. Cool neutrals near hue 250 at very low chroma, one emerald accent at hue 155: oklch(0.6 0.15 155) for lines, bars and focus on light, oklch(0.8 0.17 155) on dark; a text step oklch(0.48 0.12 155) on light; filled buttons use a deeper action step, oklch(0.5 0.13 155), with white labels in both themes. Reason: the owner chose emerald from green and blue options on 2026-09-25, in the family of Supabase and Neon; the accent means only "justask did this or you can act here".
- Ground: follows the system (Auto) with Light and Dark in the header. Light is a pale cool gray page with a white window; dark is a graphite page with a charcoal window. Neither is cream or warm. Reason: the owner asked for the visitor's own default, and the cool ground is what keeps the page off the Anthropic off-white.
- Shape: 12px on the app window, 10px on the hood's panels, 8px on controls, 6px on chips and small buttons; never a pill. Density: comfortable, 36px controls on desktop, 44px on touch. Depth: one shadow, on the app window only; everything else is flat with hairlines. Reason: the window is the specimen, so it is the one thing lifted.
- Motion signature: the fill line. When an answer fills a control, an emerald line draws along its top edge from the left, one control after another in field order, 50ms apart, and the control's box lights in emerald, then both fade. Placements: the Table's filter controls, the Form card's fields, the chosen search result. Under reduced motion the line and the light fade in and out with no drawing and no settle. It starts once the answer is in and never delays the call. Reason: the sentence fans out into the app's own controls, and the eye can follow the order at a few hundred ms per call (#123, #126).
- Unexpected move: the fill line, the one mark of justask on the host app, which leaves no trace once the answer is read. A field the answer held gets no line: the app cannot tell a held field from one the request never named, by design, so the hood alone says why.

## Tokens
In `demo/src/styles.css`, `:root` and its two dark blocks: `--bg` (page), `--window`, `--surface`, `--field`, `--text`, `--muted`, `--primary` (lines, bars, focus), `--primary-text`, `--action` and `--on-action` (filled buttons), `--fill-wash`, `--ring`, `--destructive`, the radii `--radius-window`, `--radius-panel`, `--radius-control`, `--radius-chip`, and `--shadow-window`.

## Decisions carried over
- Stack notes (Tailwind, shadcn, an icon set): the demo uses plain CSS on class names and no icons. Reason: it shows the package's unstyled pieces styled the way any host app would style them, and one page needs no component library.
- No icons, but two: the card page's calendar steps between months with two authored SVG chevrons. Reason: a 32px step in a 264px popover has no room for "Previous month", and the arrows are the convention every calendar teaches; the buttons carry the words as their accessible names.
- App shell (icon-rail sidebar, command palette): the demo has a 56px header with the case tabs, the theme toggle and the language toggle, and nothing else. Reason: one showcase page with three cases and one text box each; a palette would compete with the box the demo exists to show.
- Tables on mobile stay tables: the chosen vendor's transactions (four columns) and the panel's candidates (two). Reason: both fit a 375px screen without scrolling, checked at 390, and neither has row actions a card list would carry. The Table case's five-column transactions do become a card list under 560px, as the invariant says.
- Page title: case tabs (Table, Form, Search) replace the page links beside the product name, the selected one raised in the segmented track, and the h1, the case's name, is visually hidden. Reason: the showcase is one page, the selected tab already shows the case, and the app and hood headings below carry the hierarchy.
- Motion only when the instrument responds to the person: a recorded run, on load, types its sentence into the box (and presses Enter on the Form case, whose box calls only on Enter), and the controls or fields settle in with no one acting; the Table's answer applies itself, as a live one does, and the replay never presses Save. Reason: the showcase must show a real answer in the first viewport with no click (docs/demo-showcase-brief.md), and a replay the eye can follow proves the controls are the app's own; it is interruptible, ends at the person's first keystroke, pick, control or field change, and under reduced motion the sentence appears whole and the controls fade.
- URL reflects state (open panel): the case and the language live in the URL, the hood's place does not. Reason: the hood is open beside the app on a desktop and behind a switch on a phone, so one flag would mean two things on the two layouts; a shared link opens each device on its default, the hood open on a desktop and the app first on a phone, and the place is kept while the visitor moves between cases.

- Animate only transform and opacity: the signature motion's light animates border-color and background-color, from the accent back to the box's rest. Reason: the owner asked for an accent highlight on each filled field (#123), and under reduced motion that color change is the whole feedback; it stays on the control's own box, never on layout.
- Confirm for a reversible action: the Table case applies each answer to its controls with no Apply button, and Clear filters undoes it; Confirm stays where a record is created (the Form card's Save). Reason: the owner's call on 2026-09-24 (#123): filtering is reversible, the invariant bans confirming reversible actions, and a first visitor never found the Apply button.
- Suggestions ("Try a request") sit in a raised surface panel with a title-size heading, not under a divider. Reason: they are the way in, and a first visitor looked past them (#123). Their chips keep the accent's text, so the panel adds no second accent.
- White labels on filled buttons: the action step is deepened until white passes 4.5:1, never flipped to a dark label. Reason: the owner's preference, 2026-09-25.

## Rejected directions
- Precision Instrument (cobalt 255, IBM Plex Sans with JetBrains Mono, achromatic, sharp): the fallback the demo shipped with until #126; docmatch landed on the same, so it read as a sibling.
- Answer sheet (violet drop-out ink, bubbles, Archivo): liked, but too costumed for a page a developer operates.
- Punched card and Destination blind: costumes; neither read as a professional developer tool.
- Night shift (warm dark page, mustard): close to the dark-with-one-accent default.
- Berry accent (hue 350): too close to AI purple for the owner.
- Chartreuse (125) and Azure (225): shown with emerald; the owner picked emerald.

## Benchmarks
- Cal.com (https://cal.com): the real product widget, framed on a quiet ground, is the hero.
- Stripe Elements (https://stripe.com/payments/elements): the component shown mounted inside a host app.
- Supabase (https://supabase.com): the brand color only on actions and live state.
- Neon (https://neon.com) and Railway (https://railway.com): named by the owner as loved; their one product-specific move is what keeps a dark page with one accent from being generic.
