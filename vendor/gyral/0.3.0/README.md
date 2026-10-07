# Gyral 0.3.0 (vendored until it's on npm)

The `@gyral/*` 0.3.0 packages, packed from the `v0.3.0` tag of
[gyraljs/gyral](https://github.com/gyraljs/gyral) (merge commit `e79abd6`, see
`SOURCE.json`). They're here because the npm release is due on 2026-10-10 and the
migration in [the exec plan](../../../docs/exec-plans/active/2026-10-gyral-0.3.md) starts
before that. Bead `sabacc-x56.11` replaces them with the npm packages and deletes this folder.

| File | Package | Used for |
|---|---|---|
| `gyral-core-0.3.0.tgz` | `@gyral/core` | components, drivers, stores, the Vite preset |
| `gyral-time-0.3.0.tgz` | `@gyral/time` | beat playback and the turn countdown |
| `gyral-http-0.3.0.tgz` | `@gyral/http` | opening a multiplayer table (`POST /api/rooms`) |
| `gyral-testing-0.3.0.tgz` | `@gyral/testing` | DOM-free model tests (dev only) |
| `gyral-devtools-0.3.0.tgz` | `@gyral/devtools` | the timeline panel while developing (dev only) |

Not vendored (not needed here): `@gyral/ssr`, `@gyral/router`, `@gyral/mcp`, `create-gyral`.

- `SOURCE.json` says `"dirty": true`: when packed, the Gyral checkout had uncommitted
  changes only in `.beads/interactions.jsonl` and `ARCHITECTURE.md`, neither of which is in
  a package. The package contents match the tag.
- Check the files: `cd vendor/gyral/0.3.0 && sha256sum -c SHA256SUMS`.
- Every package but core depends on `@gyral/core` `0.3.0` from the registry, which doesn't
  exist until the release. The install therefore pins it with npm `overrides` to
  `file:vendor/gyral/0.3.0/gyral-core-0.3.0.tgz`.
- Not installed yet: `@gyral/core` has an optional peer `vite ^8`, and this repo is on Vite 7
  (bead `sabacc-x56.2` comes first).
