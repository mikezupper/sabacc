# Tech debt tracker

Beads is the live tracker (`bd list --label tech-debt`). This file is the
human-readable summary, refreshed when debt is filed or paid.

| Item | Why it matters | Bead |
|---|---|---|
| Gyral is installed from `vendor/gyral/0.3.1-next.9` (a prerelease) until the final 0.3.1 registry migration | The lockfile points at verified tarballs in the repo; switch to the registry and delete `vendor/` | `sabacc-92i` |

The next.9 assessment and implementation feedback is ready in
[gyral-feedback.md](../references/gyral-feedback.md) for the owner to relay. The local
upgrade and lifecycle work belongs to epic `sabacc-9z2`; upstream API and distribution
requests are feedback, not unfinished next.9 application work.
