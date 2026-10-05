# Exec plan: multiplayer

Started and completed 2026-10-05. Beads epic `sabacc-kiq` ("Multiplayer: server-run tables for the
classic and 3D views").

## Goal

Play Sabacc with friends: a self-hosted server runs the same rules engine for each
table, and both views (classic and 3D) can play solo in the browser or join a room.

## Done when

- Two browsers in one room play a whole hand, each in either view; a reload or a dropped
  connection gets the seat back; nobody's browser ever receives another player's
  hidden cards or the deck order.
- Solo play is unchanged in both views; old saved tables still load.
- `npm run check` is green (server tests included); `npm run drive` has a multiplayer
  path with two browsers and no console errors.
- A Docker image builds, and `compose.yml` runs it behind Traefik. The registry is
  never committed.

## Steps (beads `sabacc-kiq.1` … `.6`)

1. Domain: human or AI control per seat, seat-addressed commands, a `Control` command,
   names in the narration, `viewFor(game, viewer)` (redaction + seat rotation), save
   migration v1 → v2.
2. Protocol (`src/protocol/`): Effect Schemas for every message.
3. Server (`src/server/`): `@effect/platform-node` HTTP + WebSockets, rooms, timers,
   `node:sqlite` persistence, static files, health check, limits.
4. Client: `createRemoteStore`, `?room=` boot, `<sabacc-room>`, spectator and host
   handling in both views, Vite dev proxy.
5. Docker: image, build and push scripts, compose with Traefik labels, deploy docs.
6. Tests, drive path, docs.

## Decision log (owner unless marked)

- 2026-10-05: **Node 24 + `@effect/platform-node` + SQLite, one container.** No celld,
  no Cloudflare.
- 2026-10-05: **Self-hosted on a VPS behind Traefik** (already on the server). Compose
  carries Traefik labels; host, entrypoint, cert resolver and network come from `.env`.
- 2026-10-05: **Images are built and pushed by hand** with scripts; the registry comes
  from `IMAGE=…` and is never committed. amd64 only. Tags: git SHA and `latest`.
- 2026-10-05: **Keep all views**: classic and 3D, each solo (in the browser) or multiplayer.
- 2026-10-05: **5 seats**, the AI fills empty ones; 2–5 humans. The rules give no seat
  count ([H] in the spec).
- 2026-10-05: **Anonymous names + seat tokens**, no accounts. Play money per table.
- 2026-10-05: **45 s turn timer**: auto-check if possible, otherwise fold (betting),
  stand (drawing) or pass (call window).
- 2026-10-05: **Disconnect: 30 s grace, then the AI plays the seat** until you reconnect.
- 2026-10-05: **Private rooms by link**, the room creator deals first, later hands start
  automatically after a pause; spectators allowed; no chat.
- 2026-10-05: Idle rooms close after 30 min, are deleted after 24 h; nightly backup;
  `/healthz`; JSON logs; rate limits in memory, no stored IPs.
- 2026-10-05: **`node:sqlite`** (built into Node 24) instead of a native SQLite module,
  so the image needs no compiler. Agent.
- 2026-10-05: **Seat rotation in `viewFor`**: every player sees themselves as seat 0, so
  the existing views work unchanged; spectators get an unrotated, fully hidden view. Agent.
- 2026-10-05: **Run the server's TypeScript with Node's type stripping** (no server
  bundle step). Agent.

## Progress log

- 2026-10-05: Plan written; all six steps done the same day.
- Bugs found while building, each with a regression test:
  - The narrator treated an explicit `undefined` viewer (a spectator) as seat 0,
    because a default parameter replaces `undefined`.
  - A joining player's snapshot was taken before their own seat change applied.
  - A room shut down during a server stop could still fire a grace timer and
    overwrite the saved table; closed rooms now never change or save.
  - **Lock-up:** timers started while a connection closed inherited the
    finalizer's uninterruptibility, so cancelling the next-hand timer waited out the
    whole delay while holding the room's lock. Timers are now always interruptible.
  - The turn clock kept showing after a hand ended; the server now announces when
    the clock stops.
  - "New table" showed for non-hosts: an absent boolean attribute can't turn off a
    property that defaults to `true`.
- Not done: load testing; a lobby of public tables; chat (owner: no chat).
