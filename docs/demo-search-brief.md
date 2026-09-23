# Demo search page: shape brief

Confirmed with the owner on 2026-09-22 (#12). Visual rules come from `DESIGN.md` and the personal file it inherits.

- **Job and audience:** a developer evaluating justask, running the demo locally with their own key. They are skeptical: they want to see that the provider only picks among real candidates, and that it holds when unsure.
- **Outcome:** type a request, or pick a suggested one, and see the app's own state (the vendor, or nothing) beside a state panel that says why: the shortlist with every probability, the pick, `none` against the gate, and the verdict in one sentence.
- **Layout:** the fictional app at about 40% on the left (box, item or empty state, the chosen vendor's transactions, suggested requests grouped as one vendor, could mean two, nothing to find); the state panel at about 60% on the right, sticky. Mobile stacks the app, then the panel, with the same actions.
- **States:** idle, waiting (the last readout dims), filled, held (none reached the gate, a tie, no candidates), failed (provider, timeout, handler unreachable; figures stay blank). Held and empty look the same in the app; only the panel tells them apart.
- **Language:** the English and Spanish toggle lives in the header and in `?lang`, and switches the UI text, the suggestions and the catalog. In the Spanish UI the provider is "el modelo", since "proveedor" means vendor.
- **Signature motion:** the item settling in, 150 ms, a fade under reduced motion.
