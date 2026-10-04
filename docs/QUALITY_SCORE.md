# Quality score

Graded per area after each exec-plan milestone. A = spec'd, tested, enforced;
B = tested; C = works, untested; D = known defects; F = missing.

| Area | Grade | Evidence | Gaps |
|---|---|---|---|
| Rules engine (`src/domain`) | A | Legends spec with a source per rule; 35 unit/property tests (ranking, betting, side pots, penalties, sudden demise, shift, conservation, unique ids, field integrity); 2000-hand sim clean | Pure Sabacc frequent (~20%, bead) |
| Store (`src/state`) | A | Store tests + 6 persistence tests (mid-hand restore, round-trip property, corrupt/tampered/old-version saves rejected); single-runtime rule enforced | — |
| UI components | B | 11 Chromium tests (betting, field lock/trade, call + reveal, notices, shift alert, motion, card names, playback, skip, restore greeting); `npm run drive` 20 runs incl. playback and reload, 0 console errors | — |
| Static page, rules copy, SEO | A | Legends rules as static HTML; rules-copy test (25 checks incl. every face card); title, description, OG, favicon | Canonical URL pending a domain (bead) |
| Accessibility | B | Landmarks, skip link, named cards, labelled bet input, `<output aria-live>`, shift `role=alert`, `<details>`, 44px targets, reduced motion | No automated axe audit yet |
| Harness (docs, lint, CI) | A | AGENTS.md map, docs/ system of record, lint:arch with remediation messages, CI, beads, drive script | — |
| Performance | B | 233 KB JS / 76 KB gzip (2026-10-04); owner accepts this size: no CI budget, save/restore stays in the main bundle, the engine stays on Effect | — |

Last graded: 2026-10-04, after the Legends rules change.
