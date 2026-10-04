# Quality score

Graded per area after each exec-plan milestone. A = spec'd, tested, enforced;
B = tested; C = works, untested; D = known defects; F = missing.

| Area | Grade | Evidence | Gaps |
|---|---|---|---|
| Rules engine (`src/domain`) | A | Legends spec with a source per rule; 35 unit/property tests (ranking, betting, side pots, penalties, sudden demise, shift, conservation, unique ids, field integrity); 2000-hand sim clean | Pure Sabacc frequent (~20%, bead) |
| Store (`src/state`) | A | 3 tests: seed replay, failed command is a no-op, log reset; single-runtime rule enforced | — |
| UI components | B | 8 Chromium tests (betting, field lock/trade, call + reveal, notices, shift alert, motion, card names); `npm run drive` 12 runs, 0 console errors | Turns not animated (bead) |
| Static page, rules copy, SEO | A | Legends rules as static HTML; rules-copy test (25 checks incl. every face card); title, description, OG, favicon | Canonical URL pending a domain (bead) |
| Accessibility | B | Landmarks, skip link, named cards, labelled bet input, `<output aria-live>`, shift `role=alert`, `<details>`, 44px targets, reduced motion | No automated axe audit yet |
| Harness (docs, lint, CI) | A | AGENTS.md map, docs/ system of record, lint:arch with remediation messages, CI, beads, drive script | — |
| Performance | C | 208 KB JS / 68 KB gzip, works | Bundle mostly effect (bead) |

Last graded: 2026-10-04, after the Legends rules change.
