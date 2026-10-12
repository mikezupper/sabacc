#!/usr/bin/env bash
# Job-started hook for the self-hosted runner: refuses any job that isn't a push to
# main or a manual run by an allowed actor. A workflow file can't skip this, because
# the runner runs it before the job's first step, from a copy outside the checkout.
#
# Install (once, on the runner machine; see AGENTS.md "CI"):
#   R=~/.local/share/actions-runner-sabacc
#   install -m 755 scripts/ci/runner-guard.sh "$R/runner-guard.sh"
#   echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=$R/runner-guard.sh" >> "$R/.env"
#   systemctl --user restart sabacc-actions-runner
#
# Re-install after editing this file; the runner never reads the repo's copy.
set -euo pipefail

repo="${SABACC_CI_REPO:-mikezupper/sabacc}"
actors="${SABACC_CI_ACTORS:-mikezupper}"

refuse() {
  echo "runner-guard: refusing job: $1" >&2
  echo "runner-guard: event=${GITHUB_EVENT_NAME:-?} ref=${GITHUB_REF:-?} repo=${GITHUB_REPOSITORY:-?} actor=${GITHUB_ACTOR:-?} triggering=${GITHUB_TRIGGERING_ACTOR:-?}" >&2
  exit 1
}

[[ "${GITHUB_REPOSITORY:-}" == "$repo" ]] || refuse "not $repo"

case "${GITHUB_EVENT_NAME:-}" in
  push) [[ "${GITHUB_REF:-}" == "refs/heads/main" ]] || refuse "push to a ref other than main" ;;
  workflow_dispatch) ;;
  *) refuse "event '${GITHUB_EVENT_NAME:-}' is not allowed on this machine" ;;
esac

allowed() {
  local who="$1"
  for a in $actors; do [[ "$who" == "$a" ]] && return 0; done
  return 1
}
allowed "${GITHUB_ACTOR:-}" || refuse "actor not allowed"
allowed "${GITHUB_TRIGGERING_ACTOR:-${GITHUB_ACTOR:-}}" || refuse "triggering actor not allowed"

echo "runner-guard: ok (${GITHUB_EVENT_NAME} ${GITHUB_REF} by ${GITHUB_ACTOR})"
