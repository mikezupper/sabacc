# Exec plan: rebuild on Lit + Effect with a harness

Started and completed 2026-10-04. Tracking epic: see `bd show` on the epic titled
"Rebuild Sabacc on Lit + Effect with agent harness".

## Goal

Replace the React prototype with a Lit + TypeScript app whose rules live in a pure,
tested Effect domain core, and fix every defect found in the 2026-10-04 review, inside
a repo that an agent can navigate, validate and extend without chat context.

## Done when

- `npm run check` passes: typecheck, architecture lint, unit + property tests,
  browser tests, production build.
- Every regression listed below has a test that fails on the old behaviour.
- The rules in `index.html` match [the spec](../../product-specs/sabacc-rules.md)
  (checked by `test/unit/rules-copy.test.ts`).
- No React, no `src/**/*.jsx`.

## Regressions to lock down (from the 2026-10-04 review)

| # | Old defect | Guarding test |
|---|---|---|
| R1 | Drawn card could also go to an opponent (duplicate card) | engine: no card appears twice across deck + hands |
| R2 | Showdown scored the hand from before your last draw | engine: draw in final round is counted |
| R3 | A shift undid the player's draw | engine: shift keeps hand size |
| R4 | A shift replayed the round instead of advancing it | engine: hand never exceeds the round setting |
| R5 | Opponent cards never shown after a hand | browser: opponents revealed in lobby after fold |
| R6 | "Shift imminent" warning never visible before a shift | browser: meter shows chance ≥ 50% as warning before acting |
| R7 | Opponents never bought protection | engine: AI policy buys protection per spec |
| R8 | Credits could go negative | engine: StartHand fails with InsufficientCredits |
| R9 | Rules text disagreed with code (ante, shift odds, Balance) | rules-copy test |
| R10 | Busted opponents labelled "Folded" | browser: seat status label |
| R11 | Special card names truncated with "..." | browser: card accessible name is the full name |
| R12 | 5 Hz flashing indicator, no reduced-motion | CSS review + FRONTEND.md rule |

## Steps

The beads under the epic are the live checklist; this list is the intended order.

1. Harness: AGENTS.md map, docs/, beads, `npm run check`, architecture lint, CI.
2. Toolchain: Lit + TS + Vite + Vitest (node + browser projects); remove React.
3. Domain: constants, cards, scoring, model, AI policy, engine, with unit and
   property tests (R1–R4, R7, R8).
4. State: seeded signals store and runtime.
5. UI: semantic `index.html`, modern-CSS tokens, Lit components (R5, R6, R10–R12).
6. Copy and SEO: rules section, head metadata, favicon (R9).
7. Validate by driving the real app in a browser; update QUALITY_SCORE.md.

## Decision log

- 2026-10-04: **Ante is 200** (code value kept; old rules text said 20). Owner.
- 2026-10-04: **Shift chance escalates** 20% → +10% per shift-free round → 80% cap,
  resets after a shift, and is shown before you act. Owner.
- 2026-10-04: **Balance auto-scores** as ±10, whichever is better. Owner.
- 2026-10-04: **Absolute-value scoring**: bust outside ±23, Pure Sabacc at ±23, ties
  split the pot. Owner.
- 2026-10-04: React is replaced by Lit (lit-web-apps skill rules out React). Owner
  asked to adopt the skill.
- 2026-10-04: Client-rendered only; no SSR server. The rules are static HTML in
  `index.html`, so crawlers see them without JavaScript. Agent.
- 2026-10-04: Opponent turns resolve in the same transition as your action; the log
  shows what happened. Animated, staggered turns are a follow-up bead. Agent.
- 2026-10-04: Deck composition unchanged (100 cards incl. four 0s per suit). Agent.
- 2026-10-04: If everyone is out, the house keeps the pot (unchanged). Agent.
- 2026-10-04: No `@effect/vitest`: its effect-3 line (0.30) requires Vitest 3, but Lit
  browser tests need Vitest 4. Tests run Effects with a seeded `Random` and use
  `FastCheck` from `effect`. Revisit when moving to effect 4. Agent.

## Progress log

- 2026-10-04: Spec, architecture and core beliefs written; beads initialised
  (`bd init` took 5m21s: the /home disk was IO-saturated by an unrelated process).
- 2026-10-04: Harness, domain, store, UI, rules copy done. `npm run check` green:
  53 tests (45 unit, 8 Chromium). Playwright pinned to 1.63 to match the installed
  Chromium build 1243.
- 2026-10-04: Validated with `npm run drive` (seed 42): full hand with protection and
  draw, fold path, rules link; dark and light; 1280px and 390px. 0 console errors.
  Observed: fold reveals all hands (R5), tie split between two opponents paid 500 each,
  winner highlighted, field shows the chance before acting (R6).
