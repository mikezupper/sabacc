# Gyral 0.3.1-next.1 (vendored prerelease)

The `@gyral/*` 0.3.1-next.1 packages this repo uses, from the Gyral team's prerelease for
testers (packed from Gyral's `next` branch at `bd2acc9`, `"dirty": false`; see
`SOURCE.json`). Neither 0.3.0 nor 0.3.1 is on npm yet. When 0.3.1 is published, install
`@gyral/*` from npm at exact versions, check the registry tarballs' SHA-256 against
`SHA256SUMS` (for 0.3.1 final, against the final tarballs), drop the npm `overrides`, and
delete `vendor/gyral/` (beads `sabacc-x56.11`, `sabacc-92i`).

| File | Package | Used for |
|---|---|---|
| `gyral-core-0.3.1-next.1.tgz` | `@gyral/core` | components, drivers, the Vite preset, ESLint rules |
| `gyral-time-0.3.1-next.1.tgz` | `@gyral/time` | `delay` (from `@gyral/time/delay`) for playback and "Link copied" |
| `gyral-http-0.3.1-next.1.tgz` | `@gyral/http` | opening a multiplayer table (`POST /api/rooms`) |
| `gyral-testing-0.3.1-next.1.tgz` | `@gyral/testing` | DOM-free model tests (dev only) |
| `gyral-devtools-0.3.1-next.1.tgz` | `@gyral/devtools` | the timeline panel while developing (dev only) |

Not vendored (not used): `@gyral/ssr`, `@gyral/router`, `@gyral/mcp`, `create-gyral`.

- Check the files: `cd vendor/gyral/0.3.1-next.1 && sha256sum -c SHA256SUMS` (the same
  sums as the Gyral team's list for these five).
- Every package but core depends on `@gyral/core` `0.3.1-next.1`, which isn't on npm, so
  `package.json` keeps `"overrides": { "@gyral/core": "$@gyral/core" }`.
