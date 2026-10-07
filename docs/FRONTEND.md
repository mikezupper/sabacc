# Frontend conventions

Applies to `src/components/`, `src/scene/`, `src/styles/`, `index.html` and `3d.html`.
Source skills: gyral, modern-css, semantic-html, google-seo-fundamentals.

## Gyral

The UI is [Gyral](https://gyral.dev) 0.3: Model-View-Intent web components with their own
view layer. Source skill: `gyral` (read from the Gyral checkout's `skills/gyral/`). The move
from Lit is recorded in the [exec plan](exec-plans/active/2026-10-gyral-0.3.md).

- One loop per component: `intent` parses events into tagged messages, `update` has a pure
  reducer for every tag, `view` is a pure template that **names intents**
  (`data-intent=${i.Check}`) and never holds closures.
- Import the view layer (`html`, `css`, `nothing`, `each`, `defineHook`) from `@gyral/core`.
  Lists of stable things use `each` with pure rows and a module-level
  `const i = intents<Msg>()`. Form state uses attributes (`value=${…}`), never `.value=`.
  SVG goes inline in one `<svg>` per template (an SVG fragment can't be its own template).
- **Game state stays in the store.** Components reach it only through the table driver
  (`src/components/table-driver.ts`): `watchTable` streams a snapshot (game, last beats,
  log, notice, room) into a `TableChanged` message, `play(move)` sends a move, `join(name)`
  sits down at a multiplayer table. Each page provides it with `provideTable` in
  `src/entry-table.ts`, imported before any component; tests provide it on a host element.
- Show what happened between your moves by playing back the snapshot's `last` beats with
  the pure model in `src/presentation/playback.ts` (timers are `@gyral/time` commands via
  `nextBeat`). Never keep game state in a timer; playback is instant under
  `prefers-reduced-motion` (the `reducedMotion` command).
- Other browser effects are commands too (`src/components/browser-drivers.ts`): the page
  address, navigation, the clipboard, a countdown clock. HTTP is `@gyral/http`.
- Children talk up through outputs (`emit()`), parents listen with `child()` intents.
  Object props use `prop.value(schema)` with the checks in `prop-schemas.ts`: they
  validate the shape and never transform (Gyral keeps the value a property is set to and
  skips the schema in production; a transforming schema only warns in development).
- Booleans are presence props (`prop.boolean()`, default `false`): name them so the default
  is the common case (`hide-new-table`, not `new-table`).
- Styles: `styles: [base, buttons, css\`…\`]`; `src/styles/shared.ts` exports plain CSS text
  built on the tokens in `global.css`.
- Element names use the `sabacc-` prefix, one element per file, file name = element name.
- Template rules are checked three times: ESLint in the editor (`npm run lint:templates`),
  the runtime in dev and tests, and the compiler in `vite build` (a break fails the build).
- `@gyral/*` may be imported only in `src/components` and `src/scene` (`lint:arch`).
- Test models without a DOM (`step`, `run` from `@gyral/testing`); test elements in
  Chromium: let the store's change arrive (a few microtasks), then `await settled()`.
- Imperative widgets (the Three.js stage) sit behind a hook (`defineHook`). Hooks have no
  cleanup, so such a widget must notice it was detached (the stage checks `isConnected`)
  and report back through a DOM event an intent listens for.

## 3D view (`src/scene/`, `3d.html`)

- Share before you build: wording comes from `src/presentation/`, moves from
  `<sabacc-controls pick>`, the log from `<sabacc-log>`. The scene draws; it never decides.
- The scene is a function of the snapshot being shown plus the newest beat. Objects
  are keyed by card id and ease towards their placement (`Mover`); one-off effects
  (`Tweens`) only decorate a beat. A skipped effect must never leave the table wrong.
- Placement math lives in `layout.ts` as plain numbers, so it's unit-tested in node.
- Textures are drawn on canvases. Add no image or model assets without a reason
  recorded in the exec plan.
- Your cards are also listed as buttons in the controls (keyboard, screen readers);
  clicking a 3D card is a shortcut to the same choice.
- The stage sits between the status bar and the controls, never under them, so your
  cards stay visible. Name plates and pot labels are Gyral components (`plates.ts`) placed
  with CSS2DRenderer.
- Under `prefers-reduced-motion` every snapshot is drawn instantly and effects are
  skipped. Without WebGL, show the fallback with a link to the classic table.

## Multiplayer in the views

- Views read the table snapshot only; whether the store is local or remote is the store's
  business. The snapshot's `room` (present only at a multiplayer table) carries
  connection, host, spectator and presence.
- Seat 0 is "you" except for a spectator. Use `tableContext(table, game)` for the
  narrator (names), spectator flag, presence and which hands the last reveal showed;
  never assume seat 0 is yours or that a lobby reveal shows every hand.
- `<sabacc-room>` is the one place for room UI: "Play with friends" in solo; name,
  invite link, players and the turn clock at a table (`compact` folds it away in 3D).

## HTML

- `index.html` is static and semantic: one `<h1>`, skip link, landmarks, and the full
  player-facing rules as real HTML (crawlable, no JavaScript needed).
- Use the platform element first: `<dialog>` for modals, `<details>` for the game log,
  `<output aria-live>` for status messages, native
  `<select>` and `<button type>`.
- Every card has an accessible name ("Master of Coins (+14)", "Balance (-11)"), and
  field cards say "in the interference field".
- Shifts come without warning (lore), so never show shift odds.

## CSS

- Every stylesheet uses `@layer reset, tokens, base, layout, components, utilities`.
- All colour in `oklch()`, both themes through `color-scheme: light dark` and `light-dark()`.
- Logical properties (`inline-size`, `margin-block`), container queries for components,
  hit targets ≥ 44px, visible `:focus-visible`.
- Motion honours `prefers-reduced-motion`. Nothing flashes more than 3 times a second.

## Bundle

- What each page loads (all chunks it reaches, gzip), 2026-10-07 after the move to Gyral:
  classic page 278 KB / **90.4 KB** (Lit, before: 84.5 KB), 3D page 898 KB / **246.5 KB**
  (before: 239.3 KB). Most of it is Effect; Gyral costs about 6–7 KB more than Lit did.
  The owner accepted the Effect-heavy size: no size budget in CI, no move off Effect.
  Re-measure only if a real-user performance problem appears.
- The 3D page's chunk carries Three.js and the scene (~635 KB / 163 KB gzip) and only
  `3d.html` loads it. `chunkSizeWarningLimit` is 700 KB for that reason.
- Keep each entry's imports static (`src/entry-table.ts` first, then the components): a
  dynamic import split the pages into eight chunks and cost about 6 KB gzip.

## SEO

- Unique `<title>` and meta description that describe the page. Open Graph tags.
- A real favicon (`public/favicon.svg`).
- No meta keywords, no `llms.txt`, no speculative JSON-LD (no matching rich result exists
  for a browser card game).
- Production URL: `https://sabacc.starwars.run/`, used as the self-referencing canonical
  and `og:url` (checked by `test/unit/rules-copy.test.ts`). Change both together.
