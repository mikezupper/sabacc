# Deploying

One Docker image serves everything on port 8080: the classic page, the 3D page, and
the multiplayer server (`/api/rooms`, `/ws`, `/healthz`). Games are saved in SQLite on
the `/data` volume. In production it runs with `compose.yml` behind Traefik.

Nothing about a particular registry or server is committed: the image name, tag,
host name and Traefik names all come from environment variables.

## Build and push (on your machine, by hand)

```bash
./scripts/docker-build.sh                                   # local: sabacc:<sha>, sabacc:latest
IMAGE=registry.example.com/you/sabacc ./scripts/docker-build.sh
docker login registry.example.com
IMAGE=registry.example.com/you/sabacc ./scripts/docker-push.sh
```

- Images are `linux/amd64` only.
- Tags: the short git commit (`git rev-parse --short=12 HEAD`) and `latest`. Deploy
  the commit tag; `latest` is a convenience.
- The build runs `npm ci` and `npm run build` inside Docker; it doesn't need your
  `node_modules`. Run `npm run check` before building.

## Run on the server

Once, in a folder on the VPS (e.g. `/srv/sabacc`):

```bash
# copy compose.yml, .env.example and scripts/docker-backup.sh from the repo
cp .env.example .env    # then edit: SABACC_IMAGE, SABACC_TAG, SABACC_HOST, Traefik names
docker login registry.example.com
docker compose pull && docker compose up -d
```

Traefik must already be running on the server, attached to the external network named
by `TRAEFIK_NETWORK` (default `traefik`), with the entrypoint `TRAEFIK_ENTRYPOINT`
(default `websecure`) and cert resolver `TRAEFIK_CERTRESOLVER` (default
`letsencrypt`). The container publishes no ports; Traefik reaches it on the network.
WebSockets pass through Traefik without extra settings, and the server sends a
heartbeat every 25 s so idle connections aren't dropped.

### Update and roll back

```bash
# .env: SABACC_TAG=<new sha>
docker compose pull && docker compose up -d
# roll back: put the previous sha back in .env and run the same two commands
```

Games survive restarts: rooms are saved after every move. Players who were connected
get 30 s to reconnect (their browsers do it automatically) before the AI plays for them.

### Health and logs

- `GET /healthz` → `ok`. The image's Docker health check uses it.
- Logs are JSON on stdout: `docker compose logs -f sabacc`. Rotation is set in
  `compose.yml` (5 × 10 MB). No IP addresses are stored; room-creation limits are
  kept in memory.

### Backups

```bash
./scripts/docker-backup.sh     # writes /data/backups/sabacc-<time>.db, keeps the newest 14
```

Nightly, from the host's crontab:

```cron
15 3 * * * cd /srv/sabacc && ./scripts/docker-backup.sh >> backup.log 2>&1
```

To copy one off the server: `docker compose cp sabacc:/data/backups ./backups`. To
restore, stop the service, put the copy at `/data/sabacc.db` in the volume, and start it.

## Settings

`compose.yml` passes every server setting below from `.env` into the container
(`.env.example` lists them with their defaults); `PORT`, `DATA_DIR` and `STATIC_DIR`
are fixed by the image.

| Variable | Default | Meaning |
|---|---|---|
| `SABACC_IMAGE`, `SABACC_TAG` | `sabacc`, `latest` | Image to run (compose only) |
| `SABACC_HOST` | — (required) | Host name Traefik routes here (compose only) |
| `TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT`, `TRAEFIK_CERTRESOLVER` | `traefik`, `websecure`, `letsencrypt` | Your Traefik names (compose only) |
| `PORT` | `8080` | Listening port inside the container |
| `DATA_DIR` | `.data` (`/data` in the image) | SQLite database and backups |
| `STATIC_DIR` | `dist` (`/app/dist` in the image) | The built site the server serves |
| `TURN_SECONDS` | `45` | Turn clock; on timeout: check if possible, else fold / stand / pass |
| `GRACE_SECONDS` | `30` | A dropped player's seat waits this long before the AI plays it |
| `AUTO_DEAL_SECONDS` | `20` | Pause between hands before the next deal |
| `HEARTBEAT_SECONDS` | `25` | Keep-alive message on idle connections |
| `IDLE_CLOSE_SECONDS` | `1800` | An empty room leaves memory (it stays saved) |
| `DELETE_AFTER_SECONDS` | `86400` | A room untouched this long is deleted |
| `ROOMS_PER_IP_PER_HOUR` | `20` | New tables per address per hour |
| `KEEP_BACKUPS` | `14` | Backups kept by `docker-backup.sh` |

## Locally

```bash
docker run --rm -p 8080:8080 -v sabacc-data:/data sabacc:latest   # http://localhost:8080
npm run dev & npm run dev:server                                  # development, with multiplayer
npm run build && npm start                                        # the built site + server, no Docker
```
