# Core beliefs

The operating principles for anyone (human or agent) changing this repo. Each one
names the mechanism that keeps it true.

1. **The repo is the system of record.** If a decision isn't in `docs/`, a bead, or
   the code, it doesn't exist. Chat context is not durable. → `AGENTS.md` is the map.
2. **Humans steer, agents execute.** Rule changes are product decisions. Record them
   in [`product-specs/sabacc-rules.md`](../product-specs/sabacc-rules.md) and the
   exec plan's decision log before changing code.
3. **One transition per command.** Game state changes only through
   `applyCommand`, all at once. No timer, callback or component holds game state.
   → `ARCHITECTURE.md` data flow; regression tests in `test/unit/engine.test.ts`.
4. **Illegal states are unrepresentable.** Phases and seat statuses are tagged unions,
   not boolean flags. → `src/domain/model.ts`.
5. **Randomness is a service.** Every game is reproducible from a seed. → `Random`
   service, `?seed=` URL parameter.
6. **Enforce invariants mechanically, not by review.** Layer edges, domain purity and
   rules-copy drift are checked by scripts and tests whose error messages say how to
   fix the problem. → `npm run check`.
7. **The platform first.** Semantic HTML (`<details>`, `<output>`, `<data>`,
   `<dl>`), modern CSS (layers, oklch, container queries) and Gyral web components. No UI kits, no
   CSS-in-JS runtime, no React. → [`FRONTEND.md`](../FRONTEND.md).
8. **Pay debt continuously.** Anything found and not fixed becomes a bead linked with
   `discovered-from`. → [`exec-plans/tech-debt-tracker.md`](../exec-plans/tech-debt-tracker.md).
