# AGENTS.md — map of this repo

Star Wars Sabacc: a browser card game. Lit + TypeScript UI, pure Effect rules engine,
Vite build, Vitest tests. This file is a table of contents; follow the links.

## Start of every session

```bash
bd prime          # work-tracking contract + stored memories
bd ready          # claimable work
npm run check     # typecheck + architecture lint + tests + build; must be green
```

Beads (`bd`) is the only task tracker. Create a bead before writing code; file
anything you find but don't fix with `--deps discovered-from:<id>`.

## Where to look

| You need… | Read |
|---|---|
| What the game rules are (source of truth) | [docs/product-specs/sabacc-rules.md](docs/product-specs/sabacc-rules.md) |
| Layers, allowed imports, data flow | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Why things are the way they are | [docs/design-docs/core-beliefs.md](docs/design-docs/core-beliefs.md) |
| Lit, HTML, CSS and SEO conventions | [docs/FRONTEND.md](docs/FRONTEND.md) |
| Current plan, decisions, progress | [docs/exec-plans/active/](docs/exec-plans/active/) |
| Known debt | [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) |
| How good each area is | [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md) |

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server at http://localhost:5173 (`?seed=42` replays a game) |
| `npm run check` | Everything below, in order; the merge gate |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run lint:arch` | Layer edges + domain purity + doc links (`scripts/check-architecture.ts`) |
| `npm test` | Vitest: `unit` project (node) and `browser` project (Playwright Chromium) |
| `npm run build` | Production build to `dist/` |

## Invariants (enforced — don't work around them)

1. `src/domain/` is pure: imports only `effect`; no `throw`, `async`, `Math.random`,
   `Date.now`, DOM, Lit. Randomness comes from Effect's `Random` service.
2. Game state changes only through `applyCommand` in `src/domain/engine.ts`, run by
   the store in `src/state/store.ts`. Never keep game state in a component or a timer.
3. Changing a rule means editing the spec first, then the domain, then the rules copy
   in `index.html`. `test/unit/rules-copy.test.ts` catches drift.
4. Every fixed bug gets a regression test that fails on the old behaviour.
5. Browser tests run in real Chromium. No jsdom.

## Skills used in this repo

lit-web-apps · effect-fp-skill · modern-css · semantic-html ·
google-seo-fundamentals · beads. Load the relevant one before working in its area.

## Validating a change in the real app

Run `npm run dev`, open `http://localhost:5173/?seed=42`, and play the path you
changed. The footer shows the seed; include it in any bug bead so the game replays.

## Git

Conservative: do not commit or push unless the user asks. At hand-off, report changed
files, `npm run check` output and bead status.
