# Tech debt tracker

Beads is the live tracker (`bd list --label tech-debt`). This file is the
human-readable summary, refreshed when debt is filed or paid.

| Item | Why it matters | Bead |
|---|---|---|
| Gyral is installed from `vendor/gyral/0.3.1-next.6` (a prerelease) until 0.3.1 is on npm | The lockfile points at tarballs in the repo; switch to the registry and delete `vendor/` | `sabacc-92i` |
| Gyral feedback from 0.3.1-next.6 not yet sent upstream | The owner relays [gyral-feedback.md](../references/gyral-feedback.md) to the Gyral team | `sabacc-alv` |
