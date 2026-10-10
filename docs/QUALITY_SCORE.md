# Quality score

Graded per area after each exec-plan milestone. A = spec'd, tested, enforced;
B = tested; C = works, untested; D = known defects; F = missing.

| Area | Grade | Evidence | Gaps |
|---|---|---|---|
| Rules engine (`src/domain`) | A | Legends spec with a source per rule; 35 unit/property tests (ranking, betting, side pots, penalties, sudden demise, shift, conservation, unique ids, field integrity); 2000-hand sim clean | Pure Sabacc frequent (~20%, bead) |
| Store (`src/state`) | A | Store tests + 6 persistence tests (mid-hand restore, round-trip property, corrupt/tampered/old-version saves rejected); single-runtime rule enforced | — |
| UI components (Gyral 0.3.1-next.9) | B | Classic gameplay, notices, motion, accessibility, playback, skip, restore and host controls tested in Chromium; 5 DOM-free controls tests with typed command inspection; table-driver tests (node + Chromium); generated typings for 9 Gyral tags; template rules checked by ESLint, runtime and compiler. Next.9 added 10 browser lifecycle tests and a stale-step model regression | Model tests cover the controls and shared playback; vendored Gyral until the final registry migration (sabacc-92i) |
| 3D table (`src/scene`) | B | Chromium tests with real WebGL (draw, stage teardown/rebuild, deal, pick + lock, full hand to reveal); shift hand-over and immediate resize repaint regressions; 8 layout unit tests; shared playback and prompt tests. Genuine detach restores snapshots, reduced motion and playback; both views reject stale timer steps. Phone HUD has a reserved row and four browser regressions for projected names, both themes, disclosures, resize/reset, keyboard access on short screens and native multiplayer join clicks (sabacc-c9s). Two more regressions cover 200% phone layout in both themes, with numbered seat markers, full wrapping names, maximum-length names, turn/results, keyboard access and return to the normal view (sabacc-3yh). Two desktop regressions cover the reserved room/log/seed column, drawing and showdown, both themes and replay access; native multiplayer join clicks also run at desktop size (sabacc-cnd). Two hit-test regressions keep the shift alert above the canvas after its flash ends, on desktop and phone (sabacc-s74) | No GPU perf budget |
| Multiplayer server (`src/server`) | B | 11 integration tests over real WebSockets (seating, hidden cards, a full hand, out-of-turn and spectator refusals, grace → AI → rejoin, turn clock, bad input, restart with seats kept, no lock-up when players leave between hands); timer move rules; image built and run (healthy, backup) | No load test; single process (fine for one VPS) |
| Multiplayer client and views | B | 5 remote-store tests (name, token, snapshot/update, moves, refusals, reconnect, closed room); `viewFor` no-leak property test (40 random games × 3 viewers); drive `multiplayer` path (classic + 3D players, real server), 0 console errors | Spectator and reconnect UI checked in tests, not in drive screenshots |
| Static page, rules copy, SEO | A | Legends rules as static HTML; rules-copy test (25 checks incl. every face card); title, description, OG, favicon | Canonical URL pending a domain (bead) |
| Accessibility | B | Landmarks, skip link, named cards, labelled bet input, `<output aria-live>`, shift `role=alert`, `<details>`, 44px targets, reduced motion | No automated axe audit yet |
| Harness (docs, lint, CI) | A | AGENTS.md map, docs/ system of record, lint:arch with remediation messages, CI, beads, drive script | — |
| Performance | B | Current JS + CSS across each page's chunks, gzip level 9 without filename/timestamp headers (2026-10-10, Gyral next.9 with the phone HUD, compact player list and reserved desktop sidebar, Vite 8, client-only): classic 87.2 KB, 3D 243.6 KB. Mostly Effect; owner accepts this size: no CI budget, the engine stays on Effect | Three.js and Effect dominate the download; no GPU perf budget |

Last graded: 2026-10-10, after the desktop HUD fix (sabacc-cnd) and shift alert
layering fix (sabacc-s74), the 179-test gate and eleven production drive cases:
normal desktop and phone layouts, 200% phone layout, and desktop/phone shifts in
both themes, plus a full multiplayer hand with expanded room/log panels at desktop,
phone and enlarged sizes. All reported zero console/page/layout errors. Screenshots
reviewed for player names, replay metadata, keyboard focus, results and shift alerts.
The preceding compact player list (sabacc-3yh) passed the 174-test gate and seven
production cases; the phone HUD fix (sabacc-c9s) passed five cases including shift.
The preceding Gyral next.9 milestone passed 37 production drive cases covering
classic, 3D, reattachment, shift, selection and multiplayer.
