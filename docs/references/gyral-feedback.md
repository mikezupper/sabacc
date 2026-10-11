# Gyral feedback from Sabacc (0.3.1)

For the Gyral team, relayed by the owner. Latest review: 2026-10-11, on the published
npm 0.3.1 packages.

## Current status (2026-10-11)

The stable migration is complete and released. We found no new Gyral runtime defect in
this migration: the 179-test gate, production browser validation and Docker smoke checks
pass. No further application API changes were needed after next.9.

- **Resolved:** empty stateless tables, payload-free parser ceremony, unnecessary success
  handlers, manual subscription start/stop logic, handwritten Gyral element declarations,
  vendored packages/core overrides and the missing packaged 0.3.1 release history.
- **Already available:** `IntentNames` and `commandsFor`/`inputsFor`; we adopted
  `IntentNames`/`inputsFor`, typed driver tokens and imperative-widget lifecycle guidance.
  Our earlier command-inspection request was a discoverability mistake, not a missing API.
- **Highest priority now:** align the skill's existing watch/provider examples with
  `subscriptions` and driver tokens, document recovery of state-owned delays, and clarify
  the boundary between Gyral settlement and external-renderer visual readiness.
- **Optional ergonomics:** typed plain custom-event adapters, per-input driver result
  types and a type-only component-intent helper. Prerelease distribution and peer core
  dependencies are future packaging suggestions; the stable installation has no blocker.

The [npm migration appendix](#appendix-npm-031-migration-2026-10-11) and its
[current requests](#current-requests-to-relay) describe the latest results. Earlier sections
are dated history; their upgrade status and resolved requests are superseded by this summary.

## Original next.6 feedback (2026-10-09)

Written 2026-10-09, after upgrading Sabacc from
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

This is the historical next.6 comparison; the current status above supersedes its
resolved gaps.

| Topic | Gyral 0.3.1-next.6 | Closest elsewhere |
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

## Appendix: next.9 assessment (2026-10-10)

This appendix records the assessment before implementation. Assessment bead `sabacc-j5h`;
the working app was still on next.6. We tested the next.9 migration and optional cleanups in isolated
scratch copies of Sabacc `e61a7e9`, using the updated Gyral skill. These results describe a
validated prototype. The implementation results appear in the next appendix below.

**Our recommendation:** adopt next.9 with `subscriptions` for the table watches,
reduced-motion listeners and turn clock, and address playback recovery after removal.
The required API migration is small. The subscription API answers our main lifecycle ask,
but existing watches started in `init` need to move to it to gain reconnect support.

### Release and migration validation

We used `gyral-0.3.1-next.9.tar.gz`, packed from clean Gyral commit
`78052c439d697e5d2075bd6a40c6ea8cc257cd6c`. Every entry in its `SHA256SUMS` passed.
The five packages we use installed through npm with the existing core override and resolved
to one `@gyral/core@0.3.1-next.9`.

Beyond the five tarballs and package/lockfile updates, the required migration was three lines:

- Change the imports in `src/components/playback-commands.ts` and
  `src/components/sabacc-room.ts` from `@gyral/time/delay` to `@gyral/time`.
- Remove `@gyral/time/delay` from the Vitest preset's `optimize` list.

| Version / prototype | Validation |
|---|---|
| Current next.6 app | `npm run check` passed; all 156 tests |
| Next.9 with required edits only | `npm run check` passed; all 156 tests |
| Next.9 with the cleanups and subscriptions below | `npm run check` passed; 161 tests, including five new lifecycle tests |
| Production build of that prototype | `npm run drive`: 29 runs, zero console/page errors; classic, 3D, shifts, playback, persistence, rules and real-server multiplayer |

We reviewed representative desktop and phone screenshots. The additional five passing tests
cover classic and room snapshot recovery, reduced-motion listener recovery, clock lifecycle,
and 3D snapshot/stage recovery. A **separate playback recovery probe still fails** and was kept
outside the prototype's normal test discovery. The passing suite and drive therefore do not
mean all detach/reconnect behavior is fixed.

### Feedback now answered, and cleanups we validated

- **Payload-free intents:** all 17 echo parsers become `Key: true`. Payload parsers still
  validate their inputs. This directly answers item 2 above.
- **Pure views:** `sabacc-card`, `sabacc-log`, `sabacc-plate` and `sabacc-pot` omit their
  eight empty `intent`/`update` tables. This answers the empty-table part of item 1; the
  prototype kept their existing `Stateless`, `never` and props type arguments.
- **Commands with no success message:** `play`, `join` and `go` use
  `command(driver, input)`, removing three dummy `onSuccess` handlers and the explicit
  command type arguments at those sites. Per-input result typing for a multi-input driver
  remains a separate request.
- **Subscriptions and the clock:** `subscriptions(state, props)` plus `every` replaces
  our custom interval driver and the deadline comparison in `TableChanged`. The clock starts
  only while a deadline exists, stays running across unrelated updates and moves, restarts
  after a genuine detach, and stops when the deadline disappears. This answers item 6.
- **Generated element typings:** all nine Gyral tag declarations can be generated. We
  removed their eight handwritten declaration blocks, included `.gyral/elements.d.ts` in
  `tsconfig.json`, ignored `.gyral/`, and ran `gyral-types` before `tsc`. The plain
  `sabacc-stage` declaration stays handwritten. We also removed the obsolete
  `useDefineForClassFields: false` setting; the full checks passed.
- **Imperative widgets:** the updated skill explains the own-element pattern and
  `defineHook({ client, dispose })`. This addresses the guidance requested in item 8;
  our WebGL stage remains its own custom element.

Typed driver tokens are also useful: they can replace our failing `unbound` and `unwatched`
defaults. We did not adopt them in the prototype. Our current error explicitly tells a
Sabacc developer to call `provideTable`; the token's G0043 diagnostic names the missing
driver and explains `provideDrivers`. Both are actionable, with different levels of app
context.

### Continuous watches: moving them to subscriptions fixes an app defect

The supplied `SABACC.md` describes moving `watchTable` out of `init` as offering little
benefit because it runs for the component's whole life. Our reconnect tests found a benefit
that makes this part of our recommended upgrade scope.

Reproduction with seed 42, an existing `<sabacc-table>` or `<sabacc-room>`, and a store
provided on its host:

1. Mount and `await settled()`; the component reads a `Lobby` snapshot.
2. Remove the component and `await settled()` so disconnected teardown finishes.
3. Dispatch `StartHand` on the store while the component is detached.
4. Reattach the **same element** to its host and `await settled()`.
5. Check that it reads `Playing` and follows subsequent store changes.

On both next.6 and the minimal next.9 upgrade, step 5 fails: the component still reads
`Lobby`. Its initial watch was aborted, and `init` does not run again. A separate
`matchMedia` probe shows the same problem: removal releases the reduced-motion listener,
but reattachment neither restores it nor refreshes the preference.

Moving `watchTable` and `reducedMotion` into `subscriptions` fixes all three probes.
We made that change in the classic and 3D views and in the room panel, then added a passing
3D test that verifies both its refreshed game snapshot and its stage's card count.
This is a pre-existing application lifecycle gap that the new API lets us fix. We are
not reporting it as a next.9 runtime regression. Tracked locally as `sabacc-jx3`.

**Suggestion for the upgrade notes and skill:** recommend moving continuous watches from
`init` to `subscriptions`, even when their condition is always true. Show a test that waits
while detached and changes the source before reattaching. Our existing 3D teardown test
removed and reattached in one task and only checked that the renderer resumed drawing;
it did not exercise a stopped watch or verify recovery of the game snapshot. The distinction
between a move and a genuine detach is easy to miss when writing tests.

### One-shot playback delays still need an app recovery policy

Subscriptions restore the watches, but a cancelled playback delay needs additional handling.
With seed 42:

1. Mount the classic table with motion enabled, then dispatch `StartHand`.
2. Wait for rendering and verify that playback has shown only the first of several beats.
3. Remove the element and `await settled()` to abort its pending delay.
4. Reattach it, wait for rendering, then wait 1,600 ms for another beat.

The probe fails on next.6 and on the next.9 subscription prototype: `playback.shown`
stays at 1. In the prototype, the restarted watch emits the same `table.last` reference;
`tableChanged` returns state without issuing another `nextBeat` command. The one-shot delay
has already been cancelled. This specific probe exercised the classic view; the 3D view
uses the same playback pattern and needs corresponding coverage.

We need to choose whether a genuine reattachment resumes playback or finishes it immediately,
then implement that policy while retaining the existing stale-timer guards. Tracked locally
as `sabacc-1c9`. Again, this is application recovery work, not evidence that Gyral should
automatically replay all commands from `init`.

**Suggestion:** add a lifecycle recipe for cancelled one-shot work whose progress remains
in component state. Explain what `subscriptions` restores, what an aborted delay leaves
behind, and how an app can resume or finish that work without restarting timers on unrelated
state updates.

### Corrections to our earlier feedback and remaining requests

Our item 9 request for typed command inspection was mistaken: `commandsFor` and `inputsFor`
already exist in installed next.6. We can remove the cast in `controls-model.test.ts` using
those helpers. `IntentNames` also already exists; that complaint is about discoverability
and the circular type inference pattern, not an absent export. The updated skill documents
the `TemplateResult` return annotation for `intentsOf` rows. A type-only
`IntentsOf<typeof Component>` helper remains absent from the next.9 exports.

The following requests remain relevant to the artifacts we inspected:

- **Plain custom events:** `stage-event` still uses a string event name and an `unknown`
  detail checked by our guard. A typed adapter remains useful.
- **Multi-input driver results:** the page driver's `Where | undefined` output still
  needs narrowing for `Where`. Handler-less commands reduce ceremony, but do not give
  each input variant its own result type.
- **Distribution:** the supplied satellite packages still depend on an exact core version,
  so our vendored installation still needs its override. We still favor a prerelease
  dist-tag and peer core dependencies. This assessment did not check current npm publication
  status.
- **Packaged release history:** the next.9 core tarball's `CHANGELOG.md` still begins at
  0.3.0. The external release README and consumer notes remain more informative.

The narrower error-view detection is a useful correction for our room state's `error` field;
it addresses the false-positive size cost described in the consumer notes. We did not
separately attribute bytes to that change. The existing Effect store, coalesced snapshot
bridge, keyed card lists, static entry imports and WebGL custom element remain appropriate
for this app. The next.9 automatic-component and SSR changes do not require changes here:
Sabacc is still client-only and explicitly imports its components.

## Appendix: next.9 implementation (2026-10-10)

We have now applied the complete next.9 upgrade to the working Sabacc checkout under
epic `sabacc-9z2`. This section supersedes the prototype status in the preceding appendix.
The Effect engine/store, coalesced snapshot bridge, keyed card lists, static entry imports
and plain WebGL custom element remain the architecture for the app.

### Changes applied

- Vendored the five next.9 packages from clean release commit `78052c4`, verified their
  upstream SHA-256 entries, replaced next.6 artifacts, and regenerated the npm lockfile.
  A clean `npm ci` succeeds and `npm ls` resolves a single next.9 core. The npm override
  remains necessary for the supplied packages' exact core dependency.
- Imported timers from the `@gyral/time` root and removed the obsolete Vitest optimize
  subpath. Used all 17 `true` echo intents, omitted eight empty tables in four pure views,
  and removed dummy success handlers and message generics from `play`, `join` and `go`.
- Adopted typed `tableMoves` and `tableSnapshots` driver tokens. Our two throwing/failing
  placeholder implementations are gone. Missing providers report G0043 with the missing
  driver and component; optimized builds include the diagnostic documentation URL.
  Our frontend guide points developers to the app's `provideTable` binding.
- Generated all nine Gyral element declarations and removed their eight handwritten
  blocks. `typecheck` runs `gyral-types` before `tsc`, includes the generated file explicitly,
  and works with `.gyral/` absent. The plain `sabacc-stage` declaration remains.
  The obsolete class-field compiler option is gone.
- Used `IntentNames` in the six helper-template signatures and `inputsFor` with our typed
  table token in controls model tests, eliminating the command-input cast. These two
  helpers already existed in next.6; their adoption is cleanup, not a new next.9 feature.
- Moved table watches in both views and the room panel, plus both reduced-motion watches,
  into `subscriptions`. The motion driver now uses `subscription()`'s returned cleanup
  instead of a manually pending Promise and abort listener.
- Replaced the handwritten interval driver and deadline transition comparison with a
  conditional `every(1000, …)` subscription. Deadline removal clears the displayed clock
  and stale tick replies are ignored.

### Playback recovery is implemented in both views

Our recovery policy is **resume the current beat with its full delay after genuine
reattachment**. The pending beat's delay is now derived in `subscriptions`; its lane key
is `playback:<run>:<shown>`. `Advance` carries and checks both values. Skip and reduced
motion remove the pending timer; unrelated snapshots and same-task moves preserve elapsed
time. New transitions replace old playback, and reattachment refreshes the store snapshot.

Including the step in the key matters: consecutive beats can have equal delay inputs.
With a fixed key, the subscription diff regards those inputs as unchanged and does not
restart a completed delay. Guarding the step also rejects a duplicate reply from the same
run. A timer keyed by the run alone is insufficient for this sequence.

This is a useful exception to the general recipe that puts one-shot delays in reducers:
the timer exists while a particular pending beat exists in component state and must
recover with that state. Ordinary one-shot effects still belong in reducers or `init`.
We would welcome this recovery pattern, plus the genuine-detach test, in the Gyral skill
and release notes. No replay of all `init` commands is needed.

### Validation and remaining upstream feedback

`npm run check` passes: type generation/typecheck, architecture and template lints,
**167 tests in 19 files**, and the production build. This includes ten new Chromium
lifecycle tests and one duplicate-step model regression. The eight initial lifecycle
regressions failed on next.6 before implementation; the duplicate-step model test also
fails against the original playback function. Coverage includes subscription cleanup,
reattachment after source changes, listener counts, clock restart/stop, equal-duration
beats, retained elapsed time on moves, stale replies, skip and reduced motion.

The production drive passes **37 cases with zero console/page errors**, including
eight new real-motion `reattach` / `3d-reattach` cases across both themes and desktop/phone
viewports. Existing full-hand, fold, playback, persistence, 3D selection, shift, rules
and real-server multiplayer paths also pass. We reviewed representative screenshots
for both views, reattachment, card selection, shifts and multiplayer results.

Current JS + CSS across each page's chunks, gzip level 9 without filename/timestamp
headers: classic **87,157 bytes**, 3D **242,336 bytes**. Lifecycle recovery is included;
this is a bundle measurement, not a browser performance benchmark.

The remaining framework requests are narrower: a typed adapter for plain custom events,
per-input result typing for multi-input drivers, a type-only component-intent helper,
prerelease registry distribution/peer core dependencies, and release history inside the
packed core changelog. These are upstream feedback, not unfinished next.9 application
migration work. The eventual final 0.3.1 registry switch remains a separate local task,
`sabacc-92i`.

## Appendix: npm 0.3.1 migration (2026-10-11)

Sabacc now installs `@gyral/core`, `@gyral/http`, `@gyral/time`, `@gyral/testing` and
`@gyral/devtools` from npm at exact `0.3.1` versions. The five packages share one core
without an override. We removed the vendored next.9 tarballs and both Docker vendor
copies; a clean `npm ci` works, and unrelated locked dependencies are unchanged.
Downloaded packages match npm's published integrity metadata.

The next.9 application migration carries forward without further changes under `src/`:
the final API supports our typed driver tokens, generated element declarations,
subscriptions, playback recovery and SVG fragments. The full check passes **179 tests
in 20 files**, both lints, type generation/typecheck and the production build. The
Linux amd64 image builds from npm packages and passes its health, classic/3D assets,
room creation, real WebSocket join/deal and non-root smoke checks.

The packed core changelog now includes a substantive 0.3.1 release summary and a link
to the migration guide, improving the release-note gap described above. Stable npm
distribution resolves Sabacc's remaining local packaging task. The earlier requests
about prerelease publication and peer core dependencies remain upstream suggestions.

Current JS + CSS gzip totals, level 9 without filename/timestamp headers, including
the responsive HUD fixes made after next.9: **87,434 bytes classic / 244,642 bytes 3D**.

The production drive covered **43 cases with zero console/page errors**. Its two
animated phone cases initially reported clipped labels before the screenshot's font
and frame wait. An isolated next.9 build reproduced the same four after-draw assertions;
this was our capture/audit ordering, not a stable-release regression (`sabacc-189`).
Auditing after capture readiness keeps every layout assertion and makes both phone
themes pass. Representative classic, 3D, shift and enlarged player-list captures were
reviewed. The initial full-run and targeted regression reports are preserved in `.drive/`.
The corrected multiplayer replay also passes. Final coverage across the full run and
targeted phone/multiplayer reruns is **43 cases with zero console/page/layout errors**.

### Current requests to relay

1. **Make the existing skill examples teach the adopted lifecycle pattern.** In the
   Gyral checkout inspected for this review, `skills/gyral/references/outside-stores.md`
   still starts `watchCounter()` and both mailbox watches from `init`. Its per-page binding
   example also uses a throwing `unboundDraft` subscription. These patterns predate the
   declarative subscriptions and driver tokens that removed our corresponding workarounds.
   The opening of `references/update-and-commands.md` still suggests starting a router
   listener from `init`, although its subscriptions section puts `listen` in the right place.
   Align these examples: initialise state in `init`, return continuous watches from
   `subscriptions`, and use a typed driver token when a page must provide the implementation.
   For the counter, the relevant spec fields become:

   ```ts
   init: () => ({ n: 0 }),
   subscriptions: () => [watchCounter()],
   ```

   Include a test that removes the element, awaits teardown, changes the external source,
   and reattaches the same instance. Test a same-task move separately: it keeps commands
   alive and cannot prove recovery after cancellation. Our original lifecycle regressions
   and the implemented recovery are recorded in the next.9 appendices above.

2. **Add a recipe for delays owned by pending state.** The general advice that one-shot
   delays belong in reducers needs the playback exception: a delay derived from a pending
   beat belongs in `subscriptions` when that beat must recover after reattachment. Show a
   lane key containing both run and step, replies guarded by both values, and an explicit
   resume-or-finish policy. Adjacent equal-duration beats and duplicate replies deserve
   tests. Sabacc resumes the pending beat with its full delay after a genuine detach;
   unrelated updates and same-task moves preserve elapsed time. This is documentation for
   a working API, not a request to replay every command from `init`.

3. **Clarify visual readiness for imperative widgets in the testing guide.** `settled()`
   drains Gyral rendering and message work; a Three.js render loop, projected DOM labels,
   font loading and camera motion need their own readiness conditions. Our capture-order
   failure reproduced on next.9 and was fixed in the app harness without changing Gyral.
   The harness waits for fonts and fresh scene frames before capturing and now audits the
   label positions after that barrier. Recommend an explicit widget readiness barrier
   before both measurement and capture; a fixed frame count is not a universal guarantee
   that animations have finished. The existing timer/network caveat is useful, and this
   would extend it to external renderers rather than expand `settled()`'s responsibilities.

The remaining type improvements are lower priority. Installed 0.3.1 still exposes
`IntentInput.detail` as `unknown`; a guarded plain-event adapter would improve our
`stage-event` boundary. Our page driver's `Where | undefined` output still needs narrowing
for `Where`; per-input typing or guidance on splitting operations into drivers would help.
`IntentNames` and `intentsOf` exist, while a type-only `IntentsOf<typeof Component>` is absent
from the installed core export inventory. None of these prevents the current app from working.

Exact same-version core dependencies deduplicate correctly in the stable npm installation.
We would discuss peer dependencies as a packaging design choice, not carry forward the
old claim that this app still needs an override. Publishing future prereleases under a
dist-tag would reduce the cost of future consumer trials. The packaged changelog concern
is resolved for 0.3.1. Both release commits passed CI, and the production Docker image was
published and verified after its smoke test.
