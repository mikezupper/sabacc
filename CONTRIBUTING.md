# Contributing to Sabacc

Thanks for helping. Bug reports with a seed, rules corrections with a source, UI and
accessibility fixes, tests and docs are all welcome. This is a small hobby project with
one maintainer, so a short, focused pull request gets merged fastest.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security
problems go through [private reporting](SECURITY.md), never a public issue.

## Before you start

- **Small fix** (a typo, an obvious bug with a test): open a pull request directly.
- **Anything bigger** (a feature, a refactor, a rule change, a new dependency): open an
  issue first so we can agree on the approach before you spend time on it.
- **Rule changes** are product decisions. The spec
  ([docs/product-specs/sabacc-rules.md](docs/product-specs/sabacc-rules.md)) tags every
  rule with its source (Legends lore, the West End Games fan reconstruction, canon, or a
  house choice). Bring a source, or argue for a house rule.

## Set up

You need Node 24 and npm.

```bash
git clone https://github.com/<you>/sabacc.git && cd sabacc
npm install
npx playwright install chromium   # browser tests and npm run drive
npm run check                     # should be green before you change anything
```

`npm run dev` serves the game at <http://localhost:5173>; add `?seed=42` to replay a
table. For multiplayer, also run `npm run dev:server`. The full command list is in the
[README](README.md#commands).

## Find your way around

- [ARCHITECTURE.md](ARCHITECTURE.md): the layers, what may import what, how a move
  flows through the engine and back to the views, and a "where things live" index.
- [docs/FRONTEND.md](docs/FRONTEND.md): Gyral component patterns, HTML, CSS and SEO
  rules for `src/components/`, `src/scene/` and the pages.
- [docs/design-docs/core-beliefs.md](docs/design-docs/core-beliefs.md): the principles
  and the check that keeps each one true.
- [AGENTS.md](AGENTS.md): the short map. It's written for AI coding agents but is the
  quickest overview for anyone.

## Rules the checks enforce

`npm run check` fails if you break these; the error messages say how to fix them.

1. `src/domain/` is pure: it imports only `effect`. No `throw`, `try`, `async`,
   `Math.random`, `Date.now`, DOM or `any`. Randomness comes from Effect's `Random`.
2. Game state changes only through `applyCommand` in `src/domain/engine.ts`, run by the
   store. Never keep game state in a component, a 3D object or a timer.
3. Imports follow the layer table in ARCHITECTURE.md. `three` only in `src/scene/`;
   `@gyral/*` only in `src/components/` and `src/scene/`.
4. A rule change edits the spec, then `src/domain/`, then the rules copy in `index.html`
   (`test/unit/rules-copy.test.ts` compares them).
5. A browser receives only its own seat's view (`viewFor`), never another hand or the deck.

## Write the change

- **Match the surrounding code**: two-space indent, no semicolons, double quotes, `.ts`
  extensions in relative imports, comments only where they explain why.
  [.editorconfig](.editorconfig) covers the whitespace.
- **Tests**:
  - Every bug fix gets a regression test that fails without the fix.
  - Engine and server logic: unit or property tests in `test/unit/` (Node).
  - Components and the 3D table: `test/browser/` (real Chromium; no jsdom). Gyral models
    can also be tested without a DOM with `@gyral/testing`.
  - Use fixed seeds so failures replay.
- **UI changes**: run `npm run build && npm run drive` (narrow it with
  `-- --path fold --seed 7`), look at the screenshots in `.drive/`, and make sure there
  are no console errors. Check both themes and the phone size. Add a drive path in
  `scripts/drive.ts` for a new flow.
- **Docs**: if your change makes a doc wrong, fix the doc in the same pull request.
  ARCHITECTURE.md's "where things live" table and the commands tables are the usual ones.
- **Dependencies**: avoid new ones. If you need one, say why in the issue.
- **Assets**: no Star Wars artwork, fonts, logos or sounds. Cards and the table are drawn
  in SVG or on canvases.

## Commits and pull requests

- Commit messages: a short imperative summary line ("Fix side pot when two players go
  all-in"), then a body that explains why if it isn't obvious. No prefixes needed.
- One topic per pull request. Fill in the template: what and why, how you checked it,
  the seed if it touches gameplay, and a screenshot for UI changes.
- Rebase on `main` rather than merging it in.

### About CI

CI runs `npm run check` on a disposable Xode worker, and only for pushes to `main` and manual
runs by the maintainer. **It does not run on pull requests**, from forks or otherwise,
and the runner refuses any other job. So:

1. Run `npm run check` yourself and say in the pull request that it passed (paste the
   last lines of the output if something looked odd).
2. The maintainer reviews, runs the gate locally on your branch, and merges. CI then runs
   on `main`.

Pull requests that change `.github/` or `scripts/ci/` get extra scrutiny for that reason.

## Work tracking

The maintainer tracks work with [beads](https://github.com/gastownhall/beads) (`bd`),
which keeps issues in a Dolt database synced through `refs/dolt/data`. You don't need it
to contribute: GitHub issues are the public front door, and the maintainer files beads
from them. If you use an AI agent with `bd` installed, `bd ready` shows open work.

## License

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE), like the rest of the project.
