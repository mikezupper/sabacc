# Tech debt tracker

Beads is the live tracker (`bd list --label tech-debt`). This file is the
human-readable summary, refreshed when debt is filed or paid.

The vendored Gyral prerelease was replaced with exact npm 0.3.1 packages on
2026-10-11 (`sabacc-92i`). The tarballs, core override and Docker vendor copies are gone;
the upgrade is recorded in the [completed plan](completed/2026-10-gyral-0.3.1.md).

The next.9 assessment and implementation feedback is ready in
[gyral-feedback.md](../references/gyral-feedback.md) for the owner to relay. The local
upgrade and lifecycle work belongs to epic `sabacc-9z2`; upstream API and distribution
requests are feedback, not unfinished next.9 application work.
