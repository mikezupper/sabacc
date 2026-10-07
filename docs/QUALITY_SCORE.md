# Quality score

Graded per area after each exec-plan milestone. A = spec'd, tested, enforced;
B = tested; C = works, untested; D = known defects; F = missing.

| Area | Grade | Evidence | Gaps |
|---|---|---|---|
| Rules engine (`src/domain`) | A | Legends spec with a source per rule; 35 unit/property tests (ranking, betting, side pots, penalties, sudden demise, shift, conservation, unique ids, field integrity); 2000-hand sim clean | Pure Sabacc frequent (~20%, bead) |
| Store (`src/state`) | A | Store tests + 6 persistence tests (mid-hand restore, round-trip property, corrupt/tampered/old-version saves rejected); single-runtime rule enforced | — |
| UI components (Gyral 0.3) | B | All components are Gyral MVI components (no Lit). 12 Chromium tests for the classic table (betting, field lock/trade, call + reveal, notices, shift alert, motion, card names, playback, skip, restore greeting, host-only New table); 5 DOM-free model tests for the controls; table-driver tests (node + Chromium); template rules checked by ESLint, runtime and compiler; `npm run drive` 29 runs, 0 console errors | Model tests cover the controls only; vendored Gyral until the npm release (sabacc-x56.11) |
| 3D table (`src/scene`) | B | 5 Chromium tests with real WebGL (draw, deal, pick + lock, full hand to reveal, shift hand-over regression); 8 layout unit tests; shared playback and prompt tests; `npm run drive` paths `3d` and `3d-shift` (8 runs), 0 console errors | Visual look reviewed by screenshot only; no GPU perf budget |
| Multiplayer server (`src/server`) | B | 11 integration tests over real WebSockets (seating, hidden cards, a full hand, out-of-turn and spectator refusals, grace → AI → rejoin, turn clock, bad input, restart with seats kept, no lock-up when players leave between hands); timer move rules; image built and run (healthy, backup) | No load test; single process (fine for one VPS) |
| Multiplayer client and views | B | 5 remote-store tests (name, token, snapshot/update, moves, refusals, reconnect, closed room); `viewFor` no-leak property test (40 random games × 3 viewers); drive `multiplayer` path (classic + 3D players, real server), 0 console errors | Spectator and reconnect UI checked in tests, not in drive screenshots |
| Static page, rules copy, SEO | A | Legends rules as static HTML; rules-copy test (25 checks incl. every face card); title, description, OG, favicon | Canonical URL pending a domain (bead) |
| Accessibility | B | Landmarks, skip link, named cards, labelled bet input, `<output aria-live>`, shift `role=alert`, `<details>`, 44px targets, reduced motion | No automated axe audit yet |
| Harness (docs, lint, CI) | A | AGENTS.md map, docs/ system of record, lint:arch with remediation messages, CI, beads, drive script | — |
| Performance | B | Per page, gzip (2026-10-07, Gyral 0.3, Vite 8): classic 88.0 KB (84.5 with Lit), 3D 244.0 KB (239.3 with Lit); mostly Effect; owner accepts this size: no CI budget, the engine stays on Effect | ~3.5–4.7 KB gzip over the Lit build; the Gyral team is profiling where |

Last graded: 2026-10-07, after the move to Gyral 0.3.
