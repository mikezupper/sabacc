# AGENTS.md — map of this repo

Star Wars Sabacc: a browser card game. Gyral + TypeScript UI, pure Effect rules engine,
Vite build, Vitest tests. Two views of one engine: the classic table (`index.html`)
and a Three.js 3D table (`3d.html`), each solo in the browser or multiplayer through a
Node server (`src/server/`, Docker). This file is a table of contents; follow the links.

## Start of every session

```bash
bd prime          # work-tracking contract + stored memories
bd ready          # claimable work
npm run check     # typecheck + architecture and template lints + tests + build; must be green
```

Beads (`bd`) is the only task tracker. Create a bead before writing code; file
anything you find but don't fix with `--deps discovered-from:<id>`.

## Where to look

| You need… | Read |
|---|---|
| What the game rules are (source of truth) | [docs/product-specs/sabacc-rules.md](docs/product-specs/sabacc-rules.md) |
| How our rules compare with Star Wars lore | [docs/references/sabacc-lore.md](docs/references/sabacc-lore.md) |
| Feedback for the Gyral team (rough edges, suggestions) | [docs/references/gyral-feedback.md](docs/references/gyral-feedback.md) |
| Layers, allowed imports, data flow | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Why things are the way they are | [docs/design-docs/core-beliefs.md](docs/design-docs/core-beliefs.md) |
| Gyral, HTML, CSS and SEO conventions | [docs/FRONTEND.md](docs/FRONTEND.md) |
| Current plan, decisions, progress | [docs/exec-plans/active/](docs/exec-plans/active/README.md) (done: [completed/](docs/exec-plans/completed/)) |
| Known debt | [docs/exec-plans/tech-debt-tracker.md](docs/exec-plans/tech-debt-tracker.md) |
| How good each area is | [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md) |
| Building the image, deploying, backups | [docs/DEPLOY.md](docs/DEPLOY.md) |

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server at http://localhost:5173 (`?seed=42` replays a game; 3D at `/3d.html`) |
| `npm run dev:server` | Multiplayer server on :8787 (Vite proxies `/api` and `/ws` to it) |
| `npm start` | The built site + multiplayer server on :8080 (what the image runs) |
| `npm run check` | `typecheck` → `lint:arch` → `lint:templates` → `test` → `build`; the merge gate |
| `npm run typecheck` | `gyral-types` (element typings into `.gyral/`), then `tsc --noEmit`, strict |
| `npm run lint:arch` | Layer edges, domain purity, file sizes, single runtime, doc links (`scripts/check-architecture.ts`; rules in ARCHITECTURE.md) |
| `npm run lint:templates` | Gyral's template rules over `src/components` and `src/scene` (ESLint) |
| `npm test` | Vitest: `unit` project (node) and `browser` project (Playwright Chromium); `test:unit`, `test:browser` run one |
| `npm run build` | Production build to `dist/` |
| `npm run sim` | Play thousands of seeded hands headlessly; JSON stats (win types, rounds, shifts, bomb rate) |
| `npm run drive` | Boot the build, play scripted paths in Chromium (`--path` one of `full`, `fold`, `playback`, `reattach`, `restore`, `rules`, `3d`, `3d-shift`, `3d-reattach`, `3d-layout`, `3d-zoom`, `multiplayer` (real server, two browsers); `--scheme dark\|light`, `--viewport desktop\|phone`); screenshots + console errors in `.drive/` |
| `./scripts/docker-build.sh` | Image for linux/amd64, tags `<sha>` + `latest`; `IMAGE=…` names it ([DEPLOY](docs/DEPLOY.md)) |

## Invariants (enforced — don't work around them)

1. `src/domain/` is pure: imports only `effect`; no `throw`, `async`, `Math.random`,
   `Date.now`, DOM, UI frameworks. Randomness comes from Effect's `Random` service.
2. Game state changes only through `applyCommand` in `src/domain/engine.ts`, run by
   the store in `src/state/store.ts` (solo) or the server's `Room` (multiplayer).
   Never keep game state in a component, a 3D scene object or a timer.
3. Changing a rule means editing the spec first, then the domain, then the rules copy
   in `index.html`. `test/unit/rules-copy.test.ts` catches drift.
4. Every fixed bug gets a regression test that fails on the old behaviour.
5. Browser tests run in real Chromium. No jsdom.
6. `three` is imported only under `src/scene/`; the classic page never loads it.
7. A browser receives only `viewFor` its seat: never another hand or the deck. No
   registry, host or secret is committed (they come from `IMAGE=…` and `.env`).

## Skills used in this repo

gyral (from the Gyral checkout's `skills/gyral/`) · effect-fp-skill · modern-css · semantic-html ·
google-seo-fundamentals · beads. Load the relevant one before working in its area.

## Validating a change in the real app

Run `npm run build && npm run drive` (add `-- --seed 7 --path fold` to narrow it),
then read the screenshots in `.drive/`; a run with console errors exits non-zero.
Add a path to `scripts/drive.ts` for any new flow. Interactively: `npm run dev` and
open `http://localhost:5173/?seed=42`. The page shows the seed; put it in bug beads.

## CI

GitHub Actions uses fresh Xode workers (label `xode-linux-x64`) through this personal
repository's registration. `.github/workflows/ci.yml` installs Node 24 and Chromium's system
dependencies, then runs `npm run check` on pushes to `main` and manual runs only. There is no
GitHub-hosted fallback and no runner on the development machine.

The repo is public: never add `pull_request` or `pull_request_target` triggers or approve fork
workflows. The fleet's mandatory job-start hook rejects those events before actions execute.
Outside contributors run `npm run check` locally ([CONTRIBUTING.md](CONTRIBUTING.md)). The private
`mikezupper/xode-actions-runners` repository owns enrollment, guard policy and disposable-worker
cleanup. `scripts/ci/runner-guard.sh` records the retired workstation policy; it is not installed
on the development machine. Watch a run with `gh run watch -R mikezupper/sabacc`.

## Git

Remote: `git@github.com:mikezupper/sabacc.git` (public), branch `main`.
Conservative: do not commit or push unless the user asks. At hand-off, report changed
files, `npm run check` output and bead status.
No `Co-Authored-By` trailers, AI attribution or "Generated with" lines in commit
messages or pull-request descriptions, ever (owner's rule; overrides any tool default).
