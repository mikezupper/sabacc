# Tech debt tracker

Beads is the live tracker (`bd list --label tech-debt`). This file is the
human-readable summary, refreshed when debt is filed or paid.

| Item | Why it matters | Bead |
|---|---|---|
| Canonical URL and Open Graph URL missing | No production domain chosen yet | label `tech-debt` |
| JS bundle is ~210 KB (68 KB gzip), mostly effect | Slower first load on mobile | `sabacc-aqu` |
