## What and why

<!-- One or two sentences. Link the issue: "Fixes #123". -->

## How I checked it

- [ ] `npm run check` passes locally (CI runs on the maintainer's machine after merge, not on pull requests)
- [ ] A bug fix comes with a regression test that fails on the old behaviour
- [ ] UI change: `npm run build && npm run drive` has no console errors, and I looked at the screenshots in `.drive/` (attach one or two)
- [ ] Rule change: the spec (`docs/product-specs/sabacc-rules.md`) changed first, then `src/domain/`, then the rules copy in `index.html`
- [ ] Docs that describe what I changed are updated (`ARCHITECTURE.md`, `docs/`)

<!-- Seed(s) used, if it touches gameplay: -->
