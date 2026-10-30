# Tech debt tracker

Beads is the live tracker (`bd list --label tech-debt`). This file is the
human-readable summary, refreshed when debt is filed or paid.

Open (filed 2026-10-12 from the gaps in [QUALITY_SCORE.md](../QUALITY_SCORE.md)):

- `sabacc-gwd`: automated axe accessibility audit in the browser tests.
- `sabacc-5yh`: a GPU performance budget for the 3D table.
- `sabacc-d8e`: a load test for the multiplayer server.

The vendored Gyral prerelease was replaced with exact npm 0.3.1 packages on
2026-10-11 (`sabacc-92i`). The tarballs, core override and Docker vendor copies are gone;
the upgrade is recorded in the [completed plan](completed/2026-10-gyral-0.3.1.md).
Exact npm 0.3.7 followed on 2026-10-28 (`sabacc-hk7`) with no `src/` change; the
Vitest preset no longer lists Gyral packages to pre-bundle, since 0.3.7 does that itself.
Exact npm 0.3.8 followed on 2026-10-29 (`sabacc-pk0`): both Vite configs use `gyral()`, the
table watch hands its batching to Gyral's `coalesce: "microtask"`, `provideTable` supplies a
driver list, and the bet field's parser uses `on()`.

The next.9 assessment and implementation feedback is ready in
[gyral-feedback.md](../references/gyral-feedback.md) for the owner to relay. The local
upgrade and lifecycle work belongs to epic `sabacc-9z2`; upstream API and distribution
requests are feedback, not unfinished next.9 application work.
