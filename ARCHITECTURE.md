# Architecture

A client-rendered Sabacc game with two views of one engine. A pure Effect domain core
holds every rule; a signals store runs it; Lit components render it as a 2D table
(`index.html`, static, semantic and crawlable), and a Three.js scene renders it as a 3D
table (`3d.html`). Both views share the domain, the store, beat playback, the wording
and the action controls; only the drawing differs.

## Layers and allowed imports

Dependencies point **down** only. `npm run lint:arch` (`scripts/check-architecture.ts`)
enforces this table; a violation fails `npm run check`.

```
entry-client.ts (2D)            entry-3d.ts (3D)       app wiring: ?seed, store, mount
      │                               │
      │                         scene/                 Three.js table + <sabacc-3d> HUD shell
      │                               │
components/  ◄────────────────────────┘                Lit elements (shared controls, log)
      │
presentation/                                          wording, prompt, beat playback (no framework)
state/                                                 signals store + the single place Effects run
      │
domain/                                                pure rules: types, scoring, AI policy, engine
      │
effect                                                 (standard library)
```

| Layer | May import | Must not import |
|---|---|---|
| `src/domain/` | `effect`, other `src/domain/` files | `lit`, `@lit-labs/*`, `src/state`, `src/components`, DOM globals |
| `src/state/` | `effect`, `@lit-labs/signals`, `src/domain` | `lit`, `src/components` |
| `src/presentation/` | `effect`, `src/domain` | `lit`, `three`, `src/state`, `src/components` |
| `src/components/` | `lit`, `@lit-labs/signals`, `src/state`, `src/presentation`, `src/domain`, `src/styles` | `three`, `src/scene` |
| `src/scene/` | `three`, `lit`, `@lit-labs/signals`, `src/components`, `src/state`, `src/presentation`, `src/domain`, `src/styles` | — |
| `src/styles/` | `lit` | everything else |
| `src/entry-client.ts`, `src/entry-3d.ts` | anything | — |

Three.js is imported only under `src/scene/`, so the 2D page never ships it.

Extra rules for `src/domain/` (also enforced by `lint:arch`):
no `throw`, `try`, `async`/`await`, `Math.random`, `Date.now`/`new Date`, `any`,
non-null `!` assertions, `class` except `Data.TaggedError`/`Data.Class`; files ≤ 300 lines.

## Data flow

1. A view calls `store.dispatch(command)` (`src/state/store.ts`); in both views the
   moves come from the shared `<sabacc-controls>` as `command` events.
2. The store runs `applyCommand(game, command)` from `src/domain/engine.ts`
   **once, synchronously**, with the store's seeded `Random` service.
   This is the only `Effect.run*` call in `src/` outside tests.
3. The engine returns `{ game, beats }`. Your action, then every opponent turn,
   shift roll and step change up to your next decision (or the end of the hand),
   resolve in **one** transition (`advance` in `flow.ts`). Each beat pairs an event
   with the game right after it. No timers carry game state, so no state can go
   stale between steps.
4. The store sets the `game` signal, appends the events to `log`, sets `last` to the
   beats and, for a saved table, writes the game to storage. Components re-render.
5. Each view plays the beats back one at a time (opponents' turns, shifts) with a
   `BeatPlayer` (`src/presentation/playback.ts`) and hides controls until they're
   shown: `<sabacc-table>` through the Lit `Playback` controller, `<sabacc-3d>` with
   longer delays (`src/scene/timing.ts`) so cards can fly and dice can tumble. It owns
   only the playback cursor; under `prefers-reduced-motion` it is instant. The store's
   game is already final throughout.
6. A failed command (e.g. `InsufficientCredits`) comes back as a tagged error and
   becomes a user-facing notice. It never changes the game.

## The 3D view

`<sabacc-3d>` (`src/scene/sabacc-3d.ts`) hands each snapshot it shows to `Stage.show`.
`Board` (`src/scene/board.ts`) keeps one object per card id and moves it towards the
placement `layout.ts` computes for that snapshot, so dealing, trading, folding and the
reveal animate without any game logic in the scene. A new beat adds one-off effects
(dice roll, chip tosses, the shift's spin and flare, a winner's sparks); skipping them
never leaves the table wrong. A shift gives new card ids, so the board hands the old
card's object to the new card in the same seat and spins it over. Textures are drawn
on canvases (`textures.ts`): no image assets. Without WebGL the page shows a link to
the classic table. Both pages share the saved table.

## Determinism

All randomness (shuffles, dice, shifted card designs, opponent bluffs) goes through Effect's
`Random` service. `?seed=<int>` in the URL fixes the seed, so any game can be
replayed exactly. Tests use fixed seeds; bug reports should include the seed shown
in the page footer.

## Persistence

Without `?seed=`, the table is saved to `localStorage` (`sabacc:table`) after every
successful command and restored on load (`src/state/persistence.ts`). What's read back
is untrusted: it's decoded with `SavedGameJson` (`src/domain/schema.ts`), which also
checks invariants (credits add up, unique card ids). Anything that fails is discarded.
A `?seed=` link is an unsaved replay. Bump `SAVE_VERSION` when the `Game` shape changes.

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
| Save format and invariants | `src/domain/schema.ts` |
| Store and runtime | `src/state/store.ts` |
| Browser storage adapter | `src/state/persistence.ts` |
| Wording for events, results, errors | `src/presentation/describe.ts` |
| Status line ("Betting: 200 to match") | `src/presentation/prompt.ts` |
| Turn playback (any view) | `src/presentation/playback.ts`; Lit adapter `src/components/playback.ts` |
| Action controls (both views) | `src/components/sabacc-controls.ts` |
| Seed and store start-up (both pages) | `src/state/boot.ts` |
| 3D element, HUD | `src/scene/sabacc-3d.ts`, `src/scene/hud-styles.ts` |
| 3D renderer, camera, picking, loop | `src/scene/stage.ts` |
| Snapshot → 3D objects, beat effects | `src/scene/board.ts`, `src/scene/effects.ts` |
| 3D placement math | `src/scene/layout.ts` |
| 3D page | `3d.html`, `src/entry-3d.ts` |
| Design tokens and global CSS | `src/styles/global.css`, `src/styles/shared.ts` |
| Static page, rules copy, SEO head | `index.html` |
