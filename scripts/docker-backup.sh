#!/usr/bin/env bash
# Back up the game database from the running container (run on the server, next to
# compose.yml). Writes a consistent copy into the volume's backups/ folder and keeps
# the newest 14. For a nightly backup, add to the host's crontab:
#
#   15 3 * * * cd /srv/sabacc && ./scripts/docker-backup.sh >> backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T sabacc node src/server/backup.ts
