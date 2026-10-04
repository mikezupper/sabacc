# Exec plan: Legends-accurate Sabacc

Started and completed 2026-10-04. Beads epic `sabacc-ecb` ("Make Sabacc rules Legends-accurate").

## Goal

Replace the house variant with classic (Legends) Sabacc as specified in
[the spec](../../product-specs/sabacc-rules.md), keeping the architecture: one transition
per command, a pure Effect domain and a seeded `Random`.

## Done when

- Every rule in the spec has a source tag, and the engine, the copy and the tests match it.
- `npm run check` is green, and `npm run drive` screenshots have been reviewed.
- Property tests: credits are conserved (players + hand pot + Sabacc pot), card ids are
  unique, and hands always keep at least 2 cards.

## Steps (beads `sabacc-ecb.1` … `.5`)

1. Spec with sources (this plan's decisions).
2. Deck, hand evaluation and ranking.
3. No-limit betting round and side pots.
4. Hand-flow engine (betting → drawing + field → shift → call window → final shift →
   reveal → sudden demise → payouts) and the opponent policy.
5. UI controls, the rules copy, browser tests and drive paths.

## Decision log

- 2026-10-04: **Legends-accurate rules.** Owner.
- 2026-10-04: **Include the fan-reconstructed WEG rules**: zero bombs out, a bomb-out
  penalty equal to the hand pot, and the failed-call penalty. Owner.
- 2026-10-04: **No-limit betting.** Owner. Consequence: side pots for all-in players. Agent.
- 2026-10-04: **Phase order** is betting → drawing → shift → call window. Sources
  disagree (WP-L lists Betting, Calling, Shifting, Drawing; HP uses per-player
  Bet/Roll/Call/Draw; PG plays then bets). This order keeps "can't call on your own
  turn" [L] and "every player has had a turn" [F HP] simple. Agent.
- 2026-10-04: **One shift roll per round plus one after a call**, at 1 in 6. PG says
  "once should be expected and twice is not abnormal" per game. Rolling on every turn
  (HP) would shift about once a round. Agent.
- 2026-10-04: **Field cards are face-down** [L] (the fan sources say face-up), 1 per
  turn [C], no total cap, and permanent. Agent.
- 2026-10-04: **A shifted card becomes a random design** from the 76 (electronic cards
  [L]), so duplicate designs can exist after a shift. Card ids stay unique. Agent.
- 2026-10-04: **Immediate reveal after the call** (HP), with no extra betting round
  (PG). Agent.
- 2026-10-04: **No fold penalty.** HP's 1-credit fold penalty contradicts itself about
  which pot it goes to. Agent.
- 2026-10-04: **Pure Sabacc doesn't end the game** (lore: "typically"). Agent.
- 2026-10-04: **Round cap of 10** forces a call, so a hand can't run forever. Agent.

## Progress log

- 2026-10-04: Spec rewritten with source tags.
- 2026-10-04: Domain rebuilt (cards, scoring, betting, pots, flow, showdown, ai, engine).
  2000-hand simulation: 2.0 rounds/hand, ~0.5 shifts/hand, sudden demise and all-ins
  occur, 0 invalid states. Pure Sabacc wins ~20% of hands (filed for tuning).
- 2026-10-04: UI and rules copy rebuilt. The odds meter is removed (shifts come without
  warning [L]). `npm run check` green with 78 tests; drive: 12 runs, 0 console errors.
  Screenshots reviewed: betting, drawing with a field lock (opponents' field cards
  face-down), showdown ranking, phone layout.
- 2026-10-04: lint:arch's DOM rule flagged the string "call window"; the rule now matches
  real DOM access (`window.` etc.), with a test for the false positive.
