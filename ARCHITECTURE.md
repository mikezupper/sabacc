# Architecture

A Sabacc game with two views of one engine, played solo in the browser or with friends
through a server. A pure Effect domain core holds every rule. Gyral components render it
as a 2D table (`index.html`, static, semantic and crawlable) and a Three.js scene as a
3D table (`3d.html`); both share the store, beat playback, the wording and the controls.
Solo, the store runs the engine in the browser. Multiplayer, a Node server
(`src/server/`) runs the same engine per table and the store follows it over a
WebSocket; the views can't tell the difference.

## Layers and allowed imports

Dependencies point **down** only. `npm run lint:arch` (`scripts/check-architecture.ts`)
enforces this table; a violation fails `npm run check`.

```
entry-client.ts (2D)            entry-3d.ts (3D)       app wiring: ?seed, store, mount
      │                               │
      │                         scene/                 Three.js table + <sabacc-3d> HUD shell
      │                               │
components/  ◄────────────────────────┘                Gyral components, table driver
      │
presentation/                                          wording, prompt, beat playback (no framework)
state/                                                 stores (local engine, or remote over WebSocket)
      │
protocol/                                              wire messages as Schemas (browser ⇄ server)
      │
domain/                                                pure rules: engine, AI, viewFor (what a player may see)
      │
effect                                                 (standard library)

server/  (Node only)  → protocol/, domain/             rooms, timers, SQLite, HTTP + WebSocket
```

| Layer | May import | Must not import |
|---|---|---|
| `src/domain/` | `effect`, other `src/domain/` files | `@gyral/*`, `src/state`, `src/components`, DOM globals |
| `src/protocol/` | `effect`, `src/domain` | everything else |
| `src/state/` | `effect`, `signal-polyfill`, `src/protocol`, `src/domain` | `@gyral/*`, `src/components` |
| `src/server/` | `effect`, `@effect/platform`, `@effect/platform-node`, `node:*`, `src/protocol`, `src/domain` | `@gyral/*`, `three`, browser layers |
| `src/presentation/` | `effect`, `src/domain` | `@gyral/*`, `three`, `src/state`, `src/components` |
| `src/components/` | `@gyral/core`, `@gyral/time`, `@gyral/http`, `signal-polyfill`, `effect`, `src/state`, `src/presentation`, `src/domain`, `src/styles` | `three`, `src/scene` |
| `src/scene/` | `three`, `@gyral/*`, `effect`, `src/components`, `src/state`, `src/presentation`, `src/domain`, `src/styles` | — |
| `src/styles/` | nothing (plain CSS text) | everything |
| `src/entry-client.ts`, `src/entry-3d.ts`, `src/entry-table.ts` | anything | — |

Three.js is imported only under `src/scene/`, so the 2D page never ships it. Effects are
run only in `src/state/store.ts` (browser) and `src/server/main.ts` (server).

Extra rules for `src/domain/` (also enforced by `lint:arch`):
no `throw`, `try`, `async`/`await`, `Math.random`, `Date.now`/`new Date`, `any`,
non-null `!` assertions, `class` except `Data.TaggedError`/`Data.Class`; files ≤ 300 lines.

## Data flow

1. A component returns `play(move)`, a command for the **table driver**
   (`src/components/table-driver.ts`), which calls `store.dispatch(command)`
   (`src/state/store.ts`). In both views the moves come from the shared
   `<sabacc-controls>` (and Lock/Trade from `<sabacc-seat>` on the classic table).
   Each page provides the driver for its store in `src/entry-table.ts`.
2. The store runs `applyCommand(game, command)` from `src/domain/engine.ts`
   **once, synchronously**, with the store's seeded `Random` service.
   This is the only `Effect.run*` call in `src/` outside tests.
3. The engine returns `{ game, beats }`. Your action, then every opponent turn,
   shift roll and step change up to your next decision (or the end of the hand),
   resolve in **one** transition (`advance` in `flow.ts`). Each beat pairs an event
   with the game right after it. No timers carry game state, so no state can go
   stale between steps.
4. The store sets the `game` signal, appends the events to `log`, sets `last` to the
   beats and, for a saved table, writes the game to storage. The table driver's
   `watchTable` notices the change and sends each watching component one
   `TableChanged` message with a snapshot (game, beats, log, notice, room).
5. Each view plays the beats back one at a time (opponents' turns, shifts) and hides
   controls until they're shown. Playback is a pure model in its state
   (`src/presentation/playback.ts`); timers are `@gyral/time` commands that send
   `Advance` back (`src/components/playback-commands.ts`). `<sabacc-3d>` uses longer
   delays (`src/scene/timing.ts`) so cards can fly and dice can tumble. Under
   `prefers-reduced-motion` it is instant. The store's game is already final throughout.
6. A failed command (e.g. `InsufficientCredits`) comes back as a tagged error and
   becomes a user-facing notice. It never changes the game.

## The 3D view

`<sabacc-3d>` (`src/scene/sabacc-3d.ts`) is a Gyral component like the classic table.
Its view renders `<sabacc-stage>` (`src/scene/sabacc-stage.ts`), a plain custom element
that owns the Three.js `Stage`: it builds it when connected, hands it each snapshot set
on its `.view` property (`Stage.show`), and tears it down in `disconnectedCallback`. The
stage reports picks, hovers and a missing WebGL as one DOM event (`stage-event`) that an
intent turns into a message.
`Board` (`src/scene/board.ts`) keeps one object per card id and moves it towards the
placement `layout.ts` computes for that snapshot, so dealing, trading, folding and the
reveal animate without any game logic in the scene. A new beat adds one-off effects
(dice roll, chip tosses, the shift's spin and flare, a winner's sparks); skipping them
never leaves the table wrong. A shift gives new card ids, so the board hands the old
card's object to the new card in the same seat and spins it over. Textures are drawn
on canvases (`textures.ts`): no image assets. Without WebGL the page shows a link to
the classic table. Both pages share the saved table.

## Multiplayer

1. `POST /api/rooms` opens a table (`src/server/rooms.ts`); its link is `?room=CODE` on
   either page. `bootStore` (`src/state/boot.ts`) then makes a **remote store**
   (`src/state/remote-store.ts`) with the same signals as the local one.
2. The browser sends `Join` (name + seat token) and `Act` (a player command) as
   Schema-checked JSON (`src/protocol/messages.ts`). The server decodes every message.
3. Each table is a `Room` (`src/server/room.ts`): it runs `applyCommand(game, command,
   seat)` with its own `Random`, one command at a time under a lock, saves to SQLite and
   sends every connection **its own view**: `transitionFor(t, seat)`
   (`src/domain/view.ts`) hides other hands and the deck and rotates seats so each
   player is seat 0 (`YOU`). That's why the views needed no multiplayer logic beyond
   names, spectators and the room panel (`<sabacc-room>`).
4. Seats are human or AI (`Seat.controller`). `advance` stops at human seats and plays
   AI ones. The server's `Control` command hands a seat over: on join, and 30 s after a
   disconnect. Timers (turn clock, grace, next deal) are fibers that re-check a version
   number before acting, so a late timer never applies a stale move.
5. Spectators get an unrotated view with every hand hidden.

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
| Turn playback (any view) | `src/presentation/playback.ts` (model), `src/components/playback-commands.ts` (timers) |
| Store ⇄ components (snapshot, moves, join) | `src/components/table-driver.ts`, provided in `src/entry-table.ts` |
| Page address, navigation, clipboard, clock, reduced motion | `src/components/browser-drivers.ts` |
| Prop schemas (identity-preserving) | `src/components/prop-schemas.ts` |
| Stage element, 3D name plates | `src/scene/sabacc-stage.ts`, `src/scene/plates.ts` |
| Action controls (both views) | `src/components/sabacc-controls.ts` |
| Seed and store start-up (both pages) | `src/state/boot.ts` |
| 3D element, HUD | `src/scene/sabacc-3d.ts`, `src/scene/hud-styles.ts` |
| 3D renderer, camera, picking, loop | `src/scene/stage.ts` |
| Snapshot → 3D objects, beat effects | `src/scene/board.ts`, `src/scene/effects.ts` |
| 3D placement math | `src/scene/layout.ts` |
| 3D page | `3d.html`, `src/entry-3d.ts` |
| Design tokens and global CSS | `src/styles/global.css`, `src/styles/shared.ts` |
| Static page, rules copy, SEO head | `index.html` |
| Per-player views (redaction, seat rotation) | `src/domain/view.ts` |
| Wire messages | `src/protocol/messages.ts` |
| Remote store, boot by `?room=` | `src/state/remote-store.ts`, `src/state/boot.ts` |
| Room panel (invite, players, clock) | `src/components/sabacc-room.ts` |
| A table on the server (seats, timers, broadcast) | `src/server/room.ts` |
| Rooms registry, SQLite, HTTP + WebSocket | `src/server/rooms.ts`, `src/server/db.ts`, `src/server/http.ts` |
| Server entry, settings | `src/server/main.ts`, `src/server/app.ts`, `src/server/config.ts` |
| Image, compose, deploy | `Dockerfile`, `compose.yml`, `scripts/docker-*.sh`, [docs/DEPLOY.md](docs/DEPLOY.md) |
