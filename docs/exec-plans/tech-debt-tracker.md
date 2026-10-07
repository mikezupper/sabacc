# Tech debt tracker

Beads is the live tracker (`bd list --label tech-debt`). This file is the
human-readable summary, refreshed when debt is filed or paid.

| Item | Why it matters | Bead |
|---|---|---|
| Gyral is installed from `vendor/gyral/0.3.1-next.1` (a prerelease) until 0.3.1 is on npm | The lockfile points at tarballs in the repo; switch to the registry and delete `vendor/` | `sabacc-x56.11`, `sabacc-92i` |
| Gyral feedback not yet reported upstream | Mixed-app output events, typed `emit()`, hook cleanup, prop-schema helper, SVG fragments | `sabacc-nc4` |
