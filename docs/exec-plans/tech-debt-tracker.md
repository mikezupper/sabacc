# Tech debt tracker

Beads is the live tracker (`bd list --label tech-debt`). This file is the
human-readable summary, refreshed when debt is filed or paid.

| Item | Why it matters | Bead |
|---|---|---|
| Canonical URL and Open Graph URL missing | No production domain chosen yet | label `tech-debt` |
| Opponent turns are not animated | Turns resolve instantly; the log carries the story | label `tech-debt` |
| Credits are not persisted across reloads | A reload starts a new table | label `tech-debt` |
