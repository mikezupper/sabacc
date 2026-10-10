# Gyral 0.3.1-next.9 (vendored prerelease)

The five packages Sabacc uses from the supplied `gyral-0.3.1-next.9.tar.gz` bundle.
Packed from clean Gyral commit `78052c439d697e5d2075bd6a40c6ea8cc257cd6c` on
2026-10-10; `SOURCE.json` preserves the upstream provenance for the full nine-package
release. Only the five packages below are vendored. `SHA256SUMS` contains their unchanged
entries from the upstream manifest.

| File | Package | Used for |
|---|---|---|
| `gyral-core-0.3.1-next.9.tgz` | `@gyral/core` | components, subscriptions, driver tokens, generated element types, Vite preset, ESLint rules |
| `gyral-time-0.3.1-next.9.tgz` | `@gyral/time` | playback and clipboard delays; `every` for the room clock |
| `gyral-http-0.3.1-next.9.tgz` | `@gyral/http` | opening a multiplayer table |
| `gyral-testing-0.3.1-next.9.tgz` | `@gyral/testing` | model tests, typed command inspection, error collection (dev only) |
| `gyral-devtools-0.3.1-next.9.tgz` | `@gyral/devtools` | development timeline panel |

Verify with `cd vendor/gyral/0.3.1-next.9 && sha256sum -c SHA256SUMS`.
Satellite packages depend on exact core `0.3.1-next.9`, so the npm override
`"@gyral/core": "$@gyral/core"` resolves them to this vendored core. Install with npm
and the committed `package-lock.json`; `npm ci` is the reproducible CI path.

The eventual final 0.3.1 registry migration is tracked separately by `sabacc-92i`:
verify the final registry artifacts, pin exact versions, and remove the override,
`vendor/gyral/` and Docker's `COPY vendor`. This upgrade intentionally stays on the
supplied next.9 release.
