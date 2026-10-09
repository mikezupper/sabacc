# Gyral feedback from Sabacc (0.3.0 → 0.3.1-next.6)

For the Gyral team, relayed by the owner. Written 2026-10-09, after upgrading Sabacc from
0.3.1-next.1 to 0.3.1-next.6 (bead `sabacc-uxn`). Earlier feedback (bead `sabacc-nc4`, from
0.3.0) is answered in 0.3.1 and isn't repeated here.

**What Sabacc is.** A browser card game: a pure Effect rules engine behind a store, and two
views of it, a classic table and a Three.js table, each solo or multiplayer over WebSockets.
The UI is 9 Gyral components (2 of them small 3D labels) and one plain custom element (the
WebGL stage), about 1,800 lines. Client-only: no `@gyral/ssr`, no `@gyral/router`. We
use `@gyral/core`, `time`, `http`, `testing` and `devtools`. Most of the code was written by
coding agents working from the `gyral` skill, so some notes are about how well an agent
learns Gyral from its docs and types.

**The short version.** The model is right for this app, and the team's upgrade support is
the best we've had from any dependency. Most friction is ceremony. Some of it is boilerplate
written to satisfy the types: empty `intent`/`update` objects, parsers that only return
their own tag, intent names typed by hand, and four explicit generics on `command`. The
rest is lifecycle code we write by hand: starting and stopping subscriptions as state
changes. Our five main asks:

1. Let stateless components drop `intent: {}` and `update: {}`.
2. Give payload-free messages a parser shorthand.
3. Make view helpers easy to type: document `IntentNames`, or derive the names some way
   that doesn't hit TypeScript's circularity error.
4. Add declarative subscriptions derived from state, Elm-style.
5. Publish prereleases to npm under a `next` dist-tag, and put the 0.3.1 changes in the
   packaged CHANGELOGs.

## The next.6 upgrade

Following the team's `SABACC.md` for this release:

- **16 lines in 9 files**, every site found by `tsc`. The team's Perl one-liner did all 10
  `define` calls and left `customElements.define` alone. `intents<Msg>()` became
  `intentsOf<typeof SabaccControls>()` in one file and the view's own `i` in another.
- **Checks:** `tsc`, ESLint, the architecture lint and the build were clean. All 156
  tests passed: 155 existing ones plus a new one for the error channel. One 3D test hit
  its 30 s timeout once at a load average of 44 and passed when rerun; it has done this
  before under load.
- **Sizes**, per page, gzip -9, all chunks the page loads: classic 86,143 → 86,934 B, 3D
  242,198 → 242,974 B (+791/+776 B). Our next.1 numbers match the team's to the byte, and
  their next.6 estimate was +789/+784 B. The 3D page is 8 B lighter than theirs because we
  now read `input.detail` directly.
- **Behaviour:** only one change reaches us. A component used without `provideTable` used
  to log a console warning. It now goes through the error channel and `reportError`. We
  wanted that: we already gave that case a clear message. We added a browser test with
  `collectErrors()`.

One rough moment: before the codemod, the bare upgrade gave **140 type errors**. The root
cause is `Expected 0 arguments, but got 2` at each `define`; every other error is an
implicit `any` downstream of it. See item 4 below.

## What worked well

1. **Pure reducers, tested without a DOM.** `step(spec, state, msg, props)` and `initial()`
   test `<sabacc-controls>` in node: what a bet clamps to, which move each button sends.
   No mounting and no fake timers (`test/unit/controls-model.test.ts`). React, Preact,
   Svelte and Solid have no equivalent for a component; you either pull the logic out
   into a reducer or hook by hand, or render into a DOM. Elm and Redux give you this, but
   not as a web component.
2. **Effects as data, with drivers you provide by subtree.** One store bridge
   (`table-driver.ts`) gives every component in both views the game: `play(move)` sends,
   `watchTable` streams snapshots. `provideDrivers(element, …)` binds a store to a
   subtree, which makes tests trivial: each test provides its own store on a host
   `div`. The pattern of a default driver that fails with a clear message ("call
   provideTable on an ancestor") works well. React Context, Solid's `createContext` and
   Lit's `@lit/context` do the subtree part; none of them make the effect itself a value
   that a test can inspect.
3. **Lanes on commands.** `key` plus `concurrency: 'switch'` makes playback timers and the
   turn clock "latest wins" with no cancellation code. React has nothing built in. Solid
   and Svelte rely on effect cleanup ordering. The closest are RxJS's `switchMap` and
   ember-concurrency's `restartable`.
4. **Typed outputs and `child()`.** `outputs<Out>()` in the child plus
   `child(SabaccSeat, (out) => …)` on the parent's `data-intent` is the cleanest
   child-to-parent channel we've used across Lit, React and Svelte. It's typed end to end
   and works through shadow roots, with no callback props to thread through.
5. **Template rules checked three times**: ESLint in the editor, the dev runtime, and the
   compiler in `vite build`. Agents learned the rules from the error messages, and nothing
   reached the browser broken. `gyral/unused-intent` is a good addition.
6. **Small runtime.** With `clientOnly: true` and `@gyral/time/delay`, the Gyral UI costs
   us 2.4 KB gzip more than the same UI in Lit with `@lit-labs/signals` on the classic page
   (3.7 KB on the 3D page), error channel included.
7. **Upgrade support.** Every prerelease came with notes written for this repo
   (`SABACC.md`): tried on a clean clone of our `main`, with the exact files to touch, a
   codemod, test counts and a size table that reproduces our own measurements. All five
   asks from our 0.3.0 feedback shipped in 0.3.1: `svg` fragments, `OUTPUT_EVENT`,
   `outputs<Out>()`, type-guard props, a draining `settled()`, and
   `defineDisposableHook`. The plain custom element the team recommended for the Three.js
   stage works well (`src/scene/sabacc-stage.ts`).
8. **The error channel (next.6).** One `GyralError` with `component`, `phase` and `msg`,
   plus `collectErrors()` in tests, is a good design. The ability to claim failures with
   `data-intent-on="error"` is closer to the platform than React's class-only error
   boundaries.

## Rough edges, how others handle them, and what we suggest

Each item gives what we hit and where, how other frameworks handle it, and a suggestion.
They're roughly in order of how often we hit them.

### 1. Stateless components still declare `intent: {}` and `update: {}`

`sabacc-card`, `sabacc-log`, `sabacc-plate` and `sabacc-pot` are pure views of their props, but
need `define<Stateless, never, PropsOf<typeof props>>()(tag, { props, intent: {}, update: {}, view })`.
`Stateless` already makes `init` optional; `intent` and `update` stay required.

- **Elsewhere:** in React, Preact and Solid, a component of props is a function. In Svelte
  it's a file with `$props()`. In Lit it's a class with `render()`.
- **Suggestion:** make `intent` and `update` optional when `M` is `never`, so the spec is
  `{ props, view, styles }`. Or add `defineView(tag, { props, view, styles })`.
  `PropsOf<typeof props>` plus `never` and `Stateless` as positional generics is also a lot
  to know for "a card that draws its props"; inferring `P` here would help.

### 2. Most parsers only return their own tag

17 of our 26 intent parsers are `Deal: () => ({ _tag: "Deal" })`: 14 of the 16 in
`<sabacc-controls>`, plus `PlayWithFriends`, `Copy` and `ResetView`. They're noise to read
and something to keep in step with the `Msg` union.

- **Elsewhere:** Elm writes `onClick Deal`. React, Svelte and Solid pass closures, which
  Gyral rejects by design (ADR 0001); we agree with keeping the view free of closures.
- **Suggestion:** a shorthand for messages with no payload: `intent: { Deal: true }`, or
  a helper such as `same()` or `tag('Deal')`. Or let the view name a payload-free message
  tag with no parser at all, typed so that only variants whose only field is `_tag`
  qualify.

### 3. Typing intent names in view helpers

Six helper functions take part of the view's `i`, and we typed each by hand:
`i: { readonly Seat: string; readonly Controls: string }` (`sabacc-table.ts`,
`sabacc-room.ts`, `sabacc-3d.ts`). `IntentNames<'Seat' | 'Controls'>` is the right type,
but we found it only in the migration guide; the skill and the component reference don't
mention it. `intentsOf<typeof C>()` works, but every function that reads it needs an
explicit `: TemplateResult` return type or TypeScript reports a circular type. The error
doesn't hint at that fix.

- **Elsewhere:** React, Preact and Solid pass typed callbacks as props, so the type
  travels with the value. Svelte 5 snippets are typed with `Snippet<[Args]>`.
- **Suggestions:**
  - Document `IntentNames<…>` in the skill's view reference, as the pattern for view
    helpers.
  - Export `IntentsOf<typeof C>`, a type rather than a value, so a helper can say
    `Pick<IntentsOf<typeof SabaccRoom>, 'Join'>`.
  - Consider declaring intents before `define`, e.g.
    `const intent = intents<Msg, Props, State>()({ … })`, then `define()(tag, { intent, … })`.
    The names would then exist before the component's type, with no cycle and no return
    type to add.

### 4. Two-call `define`: the shape is fine, the error isn't

`define<S, M>()(tag, spec)` is a known TypeScript pattern for partial inference. Zustand
uses `create<T>()(…)` and XState v5 uses `setup({ types })`, so the shape itself is fine.
The problem is the failure mode: the old call gives `Expected 0 arguments, but got 2`, and
then the spec loses its types, so each component adds 10 to 30 implicit-`any` errors. An
agent reading the first screen of errors sees the cascade, not the cause.

- **Suggestions:**
  - Add an overload for the old signature whose parameter type carries the explanation,
    for example `spec: "Gyral 0.3.1: define takes two calls — define<S, M>()(tag, spec)"`.
    The first error then states the fix.
  - Ship the Perl one-liner as a codemod (`npx create-gyral migrate 0.3.1`, or
    `@gyral/codemod`). Svelte's `sv migrate` and React's codemods set the expectation.

### 5. `command` needs four explicit generics for a multi-input driver

Our page driver (`browser-drivers.ts`) handles `Where`, `Go` and `Copy`, so its output type
is a union, `Where | undefined`. Each helper spells out
`command<PageInput, Where | undefined, string, M>(page, …)`, because the output can't be
narrowed per input and `M` isn't inferred when `onSuccess` returns `undefined`. The
`watchTable((table): Msg => …)` mappers also need the return type annotated, or `M` widens.
The same goes for `child(…, (out) => ({ _tag: "Seat" as const, out }))`.

- **Elsewhere:** tRPC procedures, and Effect's tagged requests
  (`Request.TaggedClass("GetUser")<User, E, {…}>`), give each input its own result type.
- **Suggestion:** a driver defined from a record of handlers, with per-input result types:
  `defineDriver({ name: 'page', run: { Where: () => …, Copy: async ({ text }) => … } })`,
  used as `command(page.Copy, { text }, { onSuccess })`. Fully inferred, no unions to
  narrow. Smaller: infer `M` from the component context (the reducer's return type) rather
  than the mapper.

### 6. Starting and stopping subscriptions as state changes

`<sabacc-room>` runs a once-a-second clock only while a turn is counting down. The reducer
compares old and new state (`counting === was`) and issues `ticking(true)` or
`ticking(false)` by hand (`sabacc-room.ts`, `TableChanged`). next.5's `Connected` adds
another case of the same kind: re-issuing long-lived commands after a real reattach.

- **Elsewhere:** Elm's `subscriptions : Model -> Sub Msg` is recomputed after every update,
  and the runtime starts and stops subscriptions to match. Solid's `createEffect` with
  `onCleanup` and Svelte's `$effect` with a returned cleanup do the same through tracked
  dependencies. React's `useEffect` uses a dependency array.
- **Suggestion:** an optional spec field `subscriptions(state, props) => Command[]`, diffed
  by `key`. Keys that appear start, keys that disappear abort, and keys whose input
  changed switch. It stays pure, testable with `step()`, and visible in devtools. It would
  make the clock code declarative and make `Connected` unnecessary for most components: on
  reattach, the runtime starts whatever `subscriptions` returns.

### 7. Custom events from non-Gyral children are untyped

The WebGL stage reports picks and hovers as a `stage-event` `CustomEvent`. On the Gyral side
it's `data-intent=${i.Stage} data-intent-on="stage-event"` and a parser that runs a type
guard on `input.detail`. next.2's `input.detail` made the parser a one-liner (taken in this
upgrade). But the event name is a string in markup, and `detail` is `unknown`.

- **Elsewhere:** Svelte 5 replaced `createEventDispatcher` with callback props, and Solid
  uses typed `on:` handlers. Both avoid stringly typed events.
- **Suggestion:** a typed event source for plain elements, e.g.
  `fromEvent('stage-event', isStageEvent)` as the parser, which gives the name to the
  template rules and types `detail`. `HTMLElementEventMap` augmentation could also feed
  `data-intent-<event>` checking.

### 8. Two ways to wrap an imperative widget

0.3.1 offers `defineDisposableHook` as well as the plain custom element the team
recommended to us. Both work. Docs that compare them would save the next team a design
round. Our rule of thumb: a hook for a behaviour on one element (focus, a resize observer),
and an element for anything that owns a render loop or WebGL context, or emits events.

- **Elsewhere:** Svelte actions and attachments (`{@attach}`), Solid's `ref` with
  `onCleanup`, React 19 ref callbacks that return a cleanup, and Lit's `AsyncDirective`
  with `disconnected()`/`reconnected()`.

### 9. Smaller things

- **`declare global { interface HTMLElementTagNameMap { … } }` in all 9 element
  files.** Lit has the same chore. The Vite preset could emit these declarations, or
  `define` could document a one-line helper type.
- **Inspecting commands in model tests.** To see which moves a step sent, we cast
  `c.input as { _tag?: string; command?: Command }`. `outputsIn()` exists for outputs; a
  typed `commandsFor(result, driver)` returning that driver's inputs would remove the
  cast. elm-program-test and redux-saga-test-plan both offer something like it.
- **`each` rows must be pure, so per-row extras go through `pick`.** We use
  `each(cards, c => c.id, PickRow, c => c.id === pickedId)`. It works and the lint rule
  explains it, but the fourth argument is unusual. A keyed `.map()` would be 1.3 KB
  smaller for us, but it lets focus jump to another card after Lock. Solid's `<For>` and
  Svelte's keyed `{#each}` let rows close over outer values: with fine-grained updates,
  rows don't have to be pure for the framework to skip work. A line in the docs on when
  `.map()` is enough would help.
- **Prop equality.** `prop.value` compares with `Object.is`, so a parent that builds an
  equal array each render re-renders the child. `equals` fixes it. A development-mode
  warning when a prop gets a new but deep-equal value on every render would make this
  visible. React developers reach for why-did-you-render for the same problem.
- **Error channel cost.** It adds 0.65 KB to every app. The team already plans to make the
  fallback parts pay-per-use, and we'd welcome that: we use `reportError` and
  `collectErrors()`, but not `spec.error` or boundaries.

### 10. Distribution and release notes

- **Prereleases as vendored tarballs** mean `file:` dependencies, a checked-in `vendor/`
  directory, a Dockerfile `COPY vendor`, and an npm `overrides` entry. The `overrides`
  entry is needed because each satellite package pins `@gyral/core` exactly as a
  dependency. Seven prereleases in three days made this the main cost of following along.
  - **Elsewhere:** Svelte and Astro publish prereleases to npm under `next` or `beta`
    dist-tags (Astro with Changesets' pre mode).
  - **Suggestion:** publish `0.3.1-next.N` under `next`. Make `@gyral/core` a peer
    dependency of `time`, `http`, `testing`, `devtools`, `ssr` and `router`, so apps
    control the single copy without `overrides`.
- **The packaged CHANGELOGs stop at 0.3.0.** The 0.3.1 changes live in the repo's
  migration guide and in per-consumer notes, which are excellent. But `CHANGELOG.md`
  inside the next.6 tarball says nothing about them. Changesets' pre mode writes
  prerelease entries automatically.
- **`IntentNames` is documented only in the migration guide** (see item 3). The
  public-API inventory (`public-api-0.3.1.md`) is a good tool for spotting exports whose
  only documentation is a migration note.

## How Gyral compares, by topic

| Topic | Gyral 0.3.1 | Closest elsewhere |
|---|---|---|
| Component logic tested without a DOM | `step()` / `initial()` on `Component.spec` | Elm, Redux reducers; React/Solid/Svelte need a DOM or extracted logic |
| Effects | Commands as data; drivers provided by subtree; lanes (`switch`, …) | Elm `Cmd`; RxJS `switchMap`; ember-concurrency; React `useEffect` (no lanes) |
| Subscriptions | Imperative: issue and re-issue commands; `Connected` on reattach | Elm `subscriptions(model)`; Solid/Svelte tracked effects with cleanup |
| Child to parent | Typed `outputs<Out>()` plus `child()` intents | Callback props (React, Solid, Svelte 5); Lit DOM events (untyped) |
| Stateless components | `define` with `Stateless`, `never`, empty `intent` and `update` | A function (React, Preact, Solid); a `.svelte` file with `$props()` |
| Error handling | `GyralError`, bubbling `ErrorEvent`, `spec.error`, `Errored`, `reportError` | React class boundaries; Solid `<ErrorBoundary>`; Svelte `<svelte:boundary>`; Vue `onErrorCaptured` |
| Imperative widgets | Plain custom element, or `defineDisposableHook` | Svelte actions/attachments; Solid `ref` with `onCleanup`; React 19 ref cleanup; Lit `AsyncDirective` |
| Shared context | `provideDrivers(element, …)`, stores | React Context; Solid `createContext`; Svelte `setContext`; `@lit/context` |
| Partial hydration | `hydrate: 'visible' \| 'interaction'` islands | Astro `client:visible` / `client:idle`; Qwik resumability |
| Typed generics | Curried `define<S, M>()(…)` | Zustand `create<T>()(…)`; XState v5 `setup({ types })` |
| Upgrades | Per-consumer notes, a codemod as a shell one-liner | Svelte `sv migrate`; React codemods; Angular `ng update` |

We didn't use `@gyral/ssr` or `@gyral/router`, so this says nothing about server rendering or
routing. Partial hydration is listed from the docs, not from use.
