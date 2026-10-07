# Tech debt tracker

Beads is the live tracker (`bd list --label tech-debt`). This file is the
human-readable summary, refreshed when debt is filed or paid.

| Item | Why it matters | Bead |
|---|---|---|
| Gyral 0.3 is installed from `vendor/gyral/0.3.0` until the npm release (2026-10-10) | The lockfile points at tarballs in the repo; switch to the registry and delete `vendor/` | `sabacc-x56.11` (deferred to 2026-10-10) |
| Gyral feedback not yet reported upstream | Mixed-app output events, typed `emit()`, hook cleanup, prop-schema helper, SVG fragments | `sabacc-nc4` |
