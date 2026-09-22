# Biome for lint and format, not ESLint

The repo uses TypeScript 7 (the native compiler, GA 2026-07-08), which shipped without the programmatic API that typescript-eslint's type-aware rules need; that API is targeted for 7.1. Biome (2.5.14) needs no TypeScript API, lints and formats in one tool, and carries 39 accessibility rules close to eslint-plugin-jsx-a11y's set (parity not verified rule by rule). Type safety leans on strict `tsc`; WCAG 2.2 AA is checked with axe tests on the components, since lint catches only a small share of accessibility faults. Checked 2026-09-22.

## Considered Options

- ESLint + typescript-eslint + jsx-a11y + Prettier: the accessibility reference, but no type-aware rules on TypeScript 7 yet, and six packages. Revisit once typescript-eslint supports TypeScript 7.1.
- Oxlint + oxfmt: type-aware rules on TypeScript 7 through tsgolint, but 24 to 29 accessibility rules and a formatter still in beta.
