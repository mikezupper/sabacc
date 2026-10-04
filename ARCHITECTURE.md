# Architecture

A single-page, client-rendered Sabacc game. A pure Effect domain core holds every
rule; a signals store runs it; Lit components render it. `index.html` is static,
semantic and crawlable, and the game mounts into it.

## Layers and allowed imports

Dependencies point **down** only. `npm run lint:arch` (`scripts/check-architecture.ts`)
enforces this table; a violation fails `npm run check`.

```
entry-client.ts      app wiring: decode ?seed, create store, define elements
      │
components/          Lit elements: render state, dispatch commands
      │
state/               signals store + the single place Effects are run
      │
domain/              pure rules: types, scoring, AI policy, engine
      │
effect               (standard library)
```

| Layer | May import | Must not import |
|---|---|---|
| `src/domain/` | `effect`, other `src/domain/` files | `lit`, `@lit-labs/*`, `src/state`, `src/components`, DOM globals |
| `src/state/` | `effect`, `@lit-labs/signals`, `src/domain` | `lit`, `src/components` |
| `src/components/` | `lit`, `@lit-labs/signals`, `src/state`, `src/domain`, `src/styles` | — |
| `src/styles/` | `lit` | everything else |
| `src/entry-client.ts` | anything | — |

Extra rules for `src/domain/` (also enforced by `lint:arch`):
no `throw`, `try`, `async`/`await`, `Math.random`, `Date.now`/`new Date`, `any`,
non-null `!` assertions, `class` except `Data.TaggedError`/`Data.Class`; files ≤ 300 lines.

## Data flow

1. A component calls `store.dispatch(command)` (`src/state/store.ts`).
2. The store runs `applyCommand(game, command)` from `src/domain/engine.ts`
   **once, synchronously**, with the store's seeded `Random` service.
   This is the only `Effect.run*` call in `src/` outside tests.
3. The engine returns `{ game, events }`. Your action, then every opponent turn,
   shift roll and step change up to your next decision (or the end of the hand),
   resolve in **one** transition (`advance` in `flow.ts`). No
   timers carry game state, so no state can go stale between steps.
4. The store sets the `game` signal and appends `events` to the `log` signal;
   components re-render.
5. A failed command (e.g. `InsufficientCredits`) comes back as a tagged error and
   becomes a user-facing notice. It never changes the game.

## Determinism

All randomness (shuffles, dice, shifted card designs, opponent bluffs) goes through Effect's
`Random` service. `?seed=<int>` in the URL fixes the seed, so any game can be
replayed exactly. Tests use fixed seeds; bug reports should include the seed shown
in the page footer.

## Where things live

| Concern | File |
|---|---|
| Rule constants | `src/domain/constants.ts` |
| 76-card deck, card names | `src/domain/cards.ts` |
| Totals, bomb-out, Idiot's Array, ranking | `src/domain/scoring.ts` |
| Game, seat, step, command, event and error types | `src/domain/model.ts` |
| No-limit betting round | `src/domain/betting.ts` |
| Side-pot layering | `src/domain/pots.ts` |
| Rounds, shift, call window, opponent turns | `src/domain/flow.ts` |
| Reveal, penalties, sudden demise, payouts | `src/domain/showdown.ts` |
| Opponent policy | `src/domain/ai.ts` |
| Your commands → transition | `src/domain/engine.ts` |
| Store and runtime | `src/state/store.ts` |
| Design tokens and global CSS | `src/styles/global.css`, `src/styles/shared.ts` |
| Static page, rules copy, SEO head | `index.html` |
