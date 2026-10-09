# Gyral 0.3.1-next.6 (vendored prerelease)

The `@gyral/*` 0.3.1-next.6 packages this repo uses, from the Gyral team's prerelease for
testers (packed from Gyral's `next` branch at `209304e`, `"dirty": false`; see
`SOURCE.json`). Neither 0.3.0 nor 0.3.1 is on npm yet. When 0.3.1 is published, install
`@gyral/*` from npm at exact versions, check the registry tarballs' SHA-256 against
`SHA256SUMS` (for 0.3.1 final, against the final tarballs), drop the npm `overrides`, and
delete `vendor/gyral/` (bead `sabacc-92i`).

| File | Package | Used for |
|---|---|---|
| `gyral-core-0.3.1-next.6.tgz` | `@gyral/core` | components, drivers, the Vite preset, ESLint rules |
| `gyral-time-0.3.1-next.6.tgz` | `@gyral/time` | `delay` (from `@gyral/time/delay`) for playback and "Link copied" |
| `gyral-http-0.3.1-next.6.tgz` | `@gyral/http` | opening a multiplayer table (`POST /api/rooms`) |
| `gyral-testing-0.3.1-next.6.tgz` | `@gyral/testing` | DOM-free model tests (dev only) |
| `gyral-devtools-0.3.1-next.6.tgz` | `@gyral/devtools` | the timeline panel while developing (dev only) |

Not vendored (not used): `@gyral/ssr`, `@gyral/router`, `@gyral/mcp`, `create-gyral`.

- Check the files: `cd vendor/gyral/0.3.1-next.6 && sha256sum -c SHA256SUMS` (the same
  sums as the Gyral team's list for these five).
- Every package but core depends on `@gyral/core` `0.3.1-next.6`, which isn't on npm, so
  `package.json` keeps `"overrides": { "@gyral/core": "$@gyral/core" }`.
