# Star Wars Sabacc

A browser card game: get your hand closest to ±23, survive the Sabacc Shift, take the pot.
Lit + TypeScript UI over a pure [Effect](https://effect.website) rules engine.

- **Rules (source of truth):** [docs/product-specs/sabacc-rules.md](docs/product-specs/sabacc-rules.md)
- **How the code is organised:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Working in this repo (humans and agents):** [AGENTS.md](AGENTS.md)

## Quick start

Requires Node 22+.

```bash
npm install
npx playwright install chromium   # once, for browser tests and npm run drive
npm run dev                       # http://localhost:5173  (?seed=42 replays a table)
npm run check                     # typecheck, architecture lint, tests, build
```

Work is tracked with [beads](https://github.com/gastownhall/beads): `bd ready`.
