# Frontend conventions

Applies to `src/components/`, `src/scene/`, `src/styles/`, `index.html` and `3d.html`.
Source skills: lit-web-apps, modern-css, semantic-html, google-seo-fundamentals.

## Lit

- TypeScript strict with `experimentalDecorators: true` and
  `useDefineForClassFields: false`. Never change those two.
- Components read the store's signals through `SignalWatcher`; they never hold game
  state in `@state()`. Local UI state (e.g. which dialog is open) may use `@state()`.
- Events go up, data goes down. Components call `store.dispatch(...)`; they never
  call domain functions that change the game.
- Derived values go in `willUpdate()`, not `render()`.
- Show what happened between your moves by playing back `store.last` beats with the
  `Playback` controller. Never keep game state in a timer, and keep playback instant
  under `prefers-reduced-motion`.
- Styles live in `static styles = css\`...\``, built on the shared tokens in
  `src/styles/shared.ts`.
- Element names use the `sabacc-` prefix, one element per file, file name = element name.

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
  cards stay visible. Name plates are HTML (CSS2DRenderer), styled in `hud-styles.ts`.
- Under `prefers-reduced-motion` every snapshot is drawn instantly and effects are
  skipped. Without WebGL, show the fallback with a link to the classic table.

## Gyral (moving from Lit; plan: [exec-plans/active/2026-10-gyral-0.3.md](exec-plans/active/2026-10-gyral-0.3.md))

New and converted components are [Gyral](https://gyral.dev) 0.3 `define()` components;
the remaining Lit elements go away as the plan proceeds. Source skill: `gyral` (read from
the Gyral checkout's `skills/gyral/`).

- One loop per component: `intent` parses events into tagged messages, `update` has a pure
  reducer for every tag, `view` is a pure template that **names intents**
  (`data-intent=${i.Check}`) and never holds closures.
- Import the view layer (`html`, `css`, `nothing`, `each`, `defineHook`) from `@gyral/core`,
  never from `lit`, in a Gyral component. Lists use `each` with pure rows and a module-level
  `const i = intents<Msg>()`. Form state uses attributes (`value=${…}`), never `.value=`.
- Game state stays in the store: components reach it through the table driver
  (`TableChanged` in, `dispatch` commands out), never by calling the store directly from a
  reducer. Timers are `@gyral/time` commands; HTTP is `@gyral/http`.
- Template rules are checked three times: ESLint in the editor (`npm run lint:templates`),
  the runtime in dev and tests, and the compiler in `vite build` (a break fails the build).
- `@gyral/*` may be imported only in `src/components` and `src/scene` (`lint:arch`).
- Test models without a DOM (`step`, `run` from `@gyral/testing`); test elements in
  Chromium and `await settled()` before asserting.

## Multiplayer in the views

- Views read the `Store` interface only; whether it's local or remote is the store's
  business. `store.room` (present only at a multiplayer table) carries connection,
  host, spectator and presence signals.
- Seat 0 is "you" except for a spectator. Use `tableContext(store, game)` for the
  narrator (names), spectator flag, presence and which hands the last reveal showed;
  never assume seat 0 is yours or that a lobby reveal shows every hand.
- `<sabacc-room>` is the one place for room UI: "Play with friends" in solo; name,
  invite link, players and the turn clock at a table (`compact` folds it away in 3D).
- Set boolean properties that default to `true` as properties (`.newTable=${…}`), not
  `?attr=`: an absent attribute never turns a default `true` off.

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

- 233 KB / 76 KB gzip as of 2026-10-04, about three quarters Effect. The owner accepted
  this: no size budget in CI, no lazy loading of save/restore, no move off Effect.
  Re-measure only if a real-user performance problem appears.
- The 3D page adds a ~620 KB / 160 KB gzip chunk (Three.js and the scene) that only
  `3d.html` loads; the two pages share the Effect/Lit chunk. `chunkSizeWarningLimit`
  is 700 KB for that reason.

## SEO

- Unique `<title>` and meta description that describe the page. Open Graph tags.
- A real favicon (`public/favicon.svg`).
- No meta keywords, no `llms.txt`, no speculative JSON-LD (no matching rich result exists
  for a browser card game).
- Production URL: `https://sabacc.starwars.run/`, used as the self-referencing canonical
  and `og:url` (checked by `test/unit/rules-copy.test.ts`). Change both together.
