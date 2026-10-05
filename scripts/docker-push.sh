#!/usr/bin/env bash
# Push the image built by docker-build.sh (both tags) to your registry.
#
#   docker login registry.example.com
#   IMAGE=registry.example.com/you/sabacc ./scripts/docker-push.sh
#
# Then on the server: set SABACC_TAG=<sha> in .env and `docker compose pull && docker compose up -d`.
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="${IMAGE:?set IMAGE to your registry path, e.g. IMAGE=registry.example.com/you/sabacc}"
case "$IMAGE" in
  */*) ;;
  *) echo "IMAGE must include a registry (got '$IMAGE')" >&2; exit 1 ;;
esac
SHA="$(git rev-parse --short=12 HEAD)"

docker push "$IMAGE:$SHA"
docker push "$IMAGE:latest"
echo "pushed $IMAGE:$SHA (and latest). Deploy with SABACC_TAG=$SHA."
