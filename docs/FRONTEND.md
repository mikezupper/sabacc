# Frontend conventions

Applies to `src/components/`, `src/styles/` and `index.html`. Source skills:
lit-web-apps, modern-css, semantic-html, google-seo-fundamentals.

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

## SEO

- Unique `<title>` and meta description that describe the page. Open Graph tags.
- A real favicon (`public/favicon.svg`).
- No meta keywords, no `llms.txt`, no speculative JSON-LD (no matching rich result exists
  for a browser card game).
- Canonical URL: pending a production domain (tracked as a bead).
