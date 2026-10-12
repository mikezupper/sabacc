# Exec plan: open-source release

Started and completed 2026-10-12. Beads epic `sabacc-1ks` ("Prepare repo for
open-source release").

## Goal

Make `mikezupper/sabacc` public with docs that match the code and a README, contribution
guide and community files fit for outside contributors, without exposing the
maintainer's machine or anything private.

## Done when

- A sweep of every doc against the code finds no drift left unfixed or unfiled.
- The full history and tracked files hold no secrets, private hosts or AI attribution
  reachable on GitHub.
- README (motivation, architecture, conventions, build/deploy/config, badges),
  CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue and PR templates exist, and
  `lint:arch` checks their links.
- The repo is public with a description, topics and hardened Actions settings.

## Decision log

- **2026-10-12: CI stays on the self-hosted runner** (owner). No GitHub-hosted
  workflows, so pull requests get no CI; contributors run `npm run check` locally.
- **2026-10-12: a job-started hook guards the runner** (owner).
  `scripts/ci/runner-guard.sh`, installed outside the checkout, refuses any job that
  isn't a push to `main` or a manual run by the owner. A fork can add its own workflow
  file, so the trigger list in `ci.yml` alone doesn't protect the machine. GitHub's
  fork-PR approval is set to all external contributors as a second layer.
- **2026-10-12: recreate the GitHub repository** (owner). GitHub kept 16 commits from
  before an earlier history rewrite, reachable through PR #1's force-push event; they
  carried AI co-author trailers. Deleting and recreating the repository was the only
  immediate way to drop them. Lost: closed PRs #1–#4 (all merged). Merged branches were
  not pushed again.
- **2026-10-12: the beads database stays on the remote** (owner): `refs/dolt/data` is
  public, so contributors can see the backlog.
- **2026-10-12: contact through GitHub private reporting** (owner) for both security
  reports and Code of Conduct reports; no email address is published.
- **2026-10-12: Node 24 is the supported version.** CI and the image use it; the server
  relies on default type stripping and `node:sqlite`. `engines` says `>=24`.
- **2026-10-12: dev host names come from `SABACC_DEV_HOSTS`**, not `vite.config.ts`.

## Progress log

- Drift sweep: 33 findings fixed across the spec, ARCHITECTURE, AGENTS, DEPLOY,
  FRONTEND, QUALITY_SCORE, core beliefs, the lore notes, `compose.yml` (now forwards
  every server setting), `.env.example` and two code comments. Filed: `sabacc-800`
  (host deals the first hand: spec vs server), `sabacc-gwd`, `sabacc-5yh`, `sabacc-d8e`
  (quality gaps).
- History audit: no secrets, private IPs or registry hosts in any commit. `.idea/` and
  `pnpm-lock.yaml` added to `.gitignore`.
