#!/usr/bin/env bash
# Build the image for linux/amd64, tagged with the git commit and `latest`.
#
#   ./scripts/docker-build.sh                                  # sabacc:<sha>, sabacc:latest
#   IMAGE=registry.example.com/you/sabacc ./scripts/docker-build.sh
#
# The image name comes from IMAGE; no registry is written into the repo.
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="${IMAGE:-sabacc}"
SHA="$(git rev-parse --short=12 HEAD)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "warning: uncommitted changes are in the build, so it won't match $SHA exactly" >&2
fi

docker build --platform linux/amd64 --tag "$IMAGE:$SHA" --tag "$IMAGE:latest" .
echo "built $IMAGE:$SHA and $IMAGE:latest"
