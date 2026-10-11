# Frontend conventions

Applies to `src/components/`, `src/scene/`, `src/styles/`, `index.html` and `3d.html`.
Source skills: gyral, modern-css, semantic-html, google-seo-fundamentals.

## Gyral

The UI is [Gyral](https://gyral.dev) 0.3.1, installed from npm at exact versions:
Model-View-Intent web components with their own view layer. Source skill: `gyral`
(read from the Gyral checkout's `skills/gyral/`). The move
from Lit is recorded in the [exec plan](exec-plans/completed/2026-10-gyral-0.3.md).

- One loop per component: `intent` parses events into tagged messages, `update` has a pure
  reducer for every tag, `view` is a pure template that **names intents**
  (`data-intent=${i.Check}`) and never holds closures.
  Payload-free intents use `Name: true`; pure views omit empty `intent` and `update`
  tables. Helper templates name their intent shape with `IntentNames<"Name" | "Other">`.
- Import the view layer (`html`, `css`, `nothing`, `each`, `defineHook`) from `@gyral/core`.
  Components are `define<State, Msg, Props, Out>()(tag, spec)` (two calls); the intent
  names are the keys of `intent`. Lists of stable things use `each` with pure rows; a row
  that names intents reads a module-level `const i = intentsOf<typeof Component>()` and
  declares its return type (`: TemplateResult`), or TypeScript reports a circular type. Form state uses attributes (`value=${…}`), never `.value=`.
  SVG: an `<svg>` element in an `html` template; optional SVG parts are `svg` fragments
  inside it (`sabacc-card`).
- **Game state stays in the store.** Components reach it only through the table drivers
  (`src/components/table-driver.ts`): `watchTable` (a Gyral `subscription()`) streams a
  snapshot (game, last beats, log, notice, room) into a `TableChanged` message,
  `play(move)` sends a move, `join(name)` sits down at a multiplayer table. Each page provides it with `provideTable` in
  `src/entry-table.ts`, imported before any component; tests provide it on a host element.
  Typed `tableMoves` and `tableSnapshots` tokens have no default implementation. Missing
  providers report G0043 with the driver and component; bind them through `provideTable`.
- Continuous table and reduced-motion watches belong in `subscriptions`, which restart
  after genuine removal and reattachment. Starting them in `init` loses that recovery.
  A move in the same task preserves them. The room clock is a conditional `every(1000, …)`
  subscription while a deadline exists; it stops when the deadline disappears.
- Show what happened between your moves by playing back the snapshot's `last` beats with
  the pure model in `src/presentation/playback.ts` (timers are `@gyral/time` commands via
  `nextBeat`). The pending beat is a state-derived subscription keyed by its run and
  step, with both guarded in `Advance`; consecutive equal delays still restart for
  each step. Genuine reattachment resumes the current beat with its full delay; moves
  and unrelated snapshots preserve elapsed time. Skip and reduced motion cancel the
  timer. Never keep game state in a timer; playback is instant under
  `prefers-reduced-motion` (the `reducedMotion` subscription).
- Other browser effects are commands too (`src/components/browser-drivers.ts`): the page
  address, navigation and the clipboard. Commands that need no reply omit handlers and
  return `Command<never>`. Import timers from `@gyral/time`; HTTP is `@gyral/http`.
- Children talk up through outputs: `const emit = outputs<Out>()` types them; parents
  listen with `child()` intents. Object props use `prop.value(guard)` with the plain type
  guards in `prop-schemas.ts` (Gyral keeps the value a property is set to; production
  builds drop the checks).
- Booleans are presence props (`prop.boolean()`, default `false`): name them so the default
  is the common case (`hide-new-table`, not `new-table`).
- Styles: `styles: [base, buttons, css\`…\`]`; `src/styles/shared.ts` exports plain CSS text
  built on the tokens in `global.css`.
- Element names use the `sabacc-` prefix, one element per file, file name = element name.
- `npm run typecheck` runs `gyral-types` before `tsc`, generating all nine Gyral tag
  declarations in ignored `.gyral/elements.d.ts` (explicitly included in tsconfig).
  Only the plain `sabacc-stage` needs a handwritten declaration. No special
  `useDefineForClassFields` setting is needed.
- Template rules are checked three times: ESLint in the editor (`npm run lint:templates`),
  the runtime in dev and tests, and the compiler in `vite build` (a break fails the build).
- `@gyral/*` may be imported only in `src/components` and `src/scene` (`lint:arch`).
- Test models without a DOM (`step`, `run` from `@gyral/testing`); test elements in
  Chromium and `await settled()` (it waits until messages stop, the store's snapshots
  included).
  Use `inputsFor(commands, tableMoves)` for typed move assertions. Reconnect tests must
  await teardown while detached; a same-task move does not exercise stopped subscriptions.
- Failures Gyral catches (a driver without `onFailure`, a throwing reducer or view) are
  reported with `reportError`, so a browser test fails on them. A test that makes a
  component fail on purpose wraps it in `collectErrors()` from `@gyral/testing` (see the
  "no table provided" test in `test/browser/table-driver.test.ts`).
- An imperative widget with a lifecycle (the Three.js stage) is its own plain custom
  element: one property set from the view (`.view=${…}`), setup in `connectedCallback`,
  teardown in `disconnectedCallback`, and DOM events an intent listens for
  (`data-intent-on="stage-event"`). Small behaviours on one element can be hooks
  (`defineHook`). This is the Gyral team's recommended pattern.

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
- On desktop the room/log aside, including the replay seed badge, gets a reserved
  column beside the stage. On phones it gets its own row above the stage. The native
  log disclosure has a bounded scrolling list; expanded room controls also scroll
  within the aside. The stage keeps at least 16rem of height, and the view scrolls on
  short screens so the seat controls stay reachable. The `3d-layout` drive path checks
  projected plate bounds against the HUD at every viewport, open/closed disclosures,
  resize and camera reset. Add
  `--scheme dark --viewport phone` to capture one focused case.
- A stage resize paints immediately after changing the canvas dimensions, keeping
  the table visible when a prompt or disclosure changes its available height.
- The shift alert has an explicit layer above the isolated stage, so it remains
  visible after its decorative flash animation ends.
- Below an 18rem table container, projected plates become numbered seat markers.
  A player list after the seat controls shows the matching seat numbers, full names,
  credits, turn/presence tags and results in normal flow. Names wrap without shrinking
  the text. Both presentations use `platesFor` over the current playback snapshot.
  `npm run drive -- --path 3d-zoom` checks both themes at a 195×422 CSS viewport with
  pixel density 2, equivalent to a 390×844 phone layout at 200% zoom.
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

- What each page loads (all chunks it reaches, gzip), 2026-10-07: classic page 270 KB /
  **88.0 KB** (Lit, before Gyral: 84.5 KB), 3D page 890 KB / **244.0 KB** (Lit: 239.3 KB).
  Most of it is Effect. The stores use our own `Cell` (`src/state/cell.ts`) instead of a
  signals library (−2.4 KB), and Vite's modulepreload polyfill is off.
- On Gyral 0.3.1-next.1 with `gyralVitePreset({ clientOnly: true })` (no hydration code;
  nothing here is server-rendered) and `delay` from `@gyral/time/delay`: classic **86.1 KB**,
  3D **242.2 KB** gzip. On 0.3.1-next.6 (2026-10-09): classic **86.9 KB**, 3D **243.0 KB**
  (+0.8 KB each, almost all of it Gyral's error channel).
  After the complete next.9 upgrade (2026-10-10), current JS + CSS totals across each
  page's chunks are **87.2 KB classic / 242.3 KB 3D**, gzip level 9 without filename or
  timestamp headers. The subscription lifecycle and playback recovery are included.
  On npm 0.3.1 (2026-10-11), including the subsequent responsive HUD fixes, the same
  measurement is **87,434 bytes classic / 244,642 bytes 3D**.
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
