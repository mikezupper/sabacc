// HTTP routes: the built site, a health check, room creation and the WebSocket.
import { existsSync, statSync } from "node:fs"
import { extname, join, normalize, resolve, sep } from "node:path"
import { HttpMiddleware, HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Duration, Effect, Option, Queue, Schema } from "effect"
import { ClientMessageJson, MAX_CLIENT_MESSAGE, ServerMessageJson, type ServerMessage } from "../protocol/messages.ts"
import { ServerConfig } from "./config.ts"
import type { Conn, Room } from "./room.ts"
import { Rooms } from "./rooms.ts"

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
}

/** The client's address: the first X-Forwarded-For hop behind Traefik, else the socket's. */
const clientIp = (req: HttpServerRequest.HttpServerRequest): string =>
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || Option.getOrElse(req.remoteAddress, () => "unknown")

/** Rooms created per address in the last hour (memory only; nothing is stored). */
const created = new Map<string, Array<number>>()
const allowCreate = (ip: string, perHour: number): boolean => {
  const now = Date.now()
  const recent = (created.get(ip) ?? []).filter((t) => now - t < 3_600_000)
  if (recent.length >= perHour) return false
  created.set(ip, [...recent, now])
  return true
}

const serveStatic = Effect.gen(function* () {
  const { staticDir } = yield* ServerConfig
  const req = yield* HttpServerRequest.HttpServerRequest
  const root = resolve(staticDir)
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname)
  const wanted = path.endsWith("/") ? `${path}index.html` : path
  const file = resolve(join(root, normalize(wanted)))
  const candidates = extname(file) === "" ? [file, `${file}.html`] : [file]
  const hit = candidates.find((f) => (f === root || f.startsWith(root + sep)) && existsSync(f) && statSync(f).isFile())
  if (hit === undefined) return HttpServerResponse.text("Not found", { status: 404 })
  // Vite's hashed assets never change; pages must be revalidated.
  const cache = hit.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache"
  return yield* HttpServerResponse.file(hit, { contentType: TYPES[extname(hit)] ?? "application/octet-stream", headers: { "cache-control": cache } })
})

let nextConnId = 1

/** One browser's WebSocket: decode each message, pass it to its room, send replies in order. */
const socket = Effect.gen(function* () {
  const settings = yield* ServerConfig
  const rooms = yield* Rooms
  const ws = yield* HttpServerRequest.upgrade
  const write = yield* ws.writer
  const outbox = yield* Queue.unbounded<ServerMessage>()
  const conn: Conn = { id: nextConnId++, send: (m) => Queue.offer(outbox, m).pipe(Effect.asVoid) }
  yield* Effect.forkScoped(
    Effect.forever(
      Queue.take(outbox).pipe(
        Effect.flatMap((m) => Schema.encode(ServerMessageJson)(m)),
        Effect.flatMap(write),
        Effect.catchAll((e) => Effect.logWarning("send failed", e)),
      ),
    ),
  )
  yield* Effect.forkScoped(Effect.forever(Effect.sleep(Duration.millis(settings.heartbeatMs)).pipe(Effect.zipRight(conn.send({ _tag: "Heartbeat" })))))

  let room: Room | undefined
  // Token bucket: 20 messages of burst, refilled at 10 a second.
  let tokens = 20
  let refilled = Date.now()

  const handle = (data: string | Uint8Array) =>
    Effect.gen(function* () {
      const now = Date.now()
      tokens = Math.min(20, tokens + ((now - refilled) / 1000) * 10)
      refilled = now
      if (tokens < 1) return yield* conn.send({ _tag: "Problem", reason: "too-fast", message: "Slow down." })
      tokens -= 1
      const text = typeof data === "string" ? data : new TextDecoder().decode(data)
      if (text.length > MAX_CLIENT_MESSAGE) return yield* conn.send({ _tag: "Problem", reason: "bad-message", message: "Message too large." })
      const decoded = Schema.decodeUnknownOption(ClientMessageJson)(text)
      if (Option.isNone(decoded)) return yield* conn.send({ _tag: "Problem", reason: "bad-message", message: "Unreadable message." })
      const msg = decoded.value
      switch (msg._tag) {
        case "Join": {
          if (room !== undefined) return
          const found = yield* rooms.get(msg.room)
          if (Option.isNone(found)) return yield* conn.send({ _tag: "Problem", reason: "no-such-room", message: "That table doesn't exist (or has closed)." })
          room = found.value
          return yield* room.join(conn, msg.name, msg.token)
        }
        case "Act":
          if (room === undefined) return yield* conn.send({ _tag: "Problem", reason: "not-joined", message: "Join a table first." })
          return yield* room.act(conn.id, msg.command)
      }
    })

  yield* ws.runRaw(handle).pipe(
    Effect.catchAll(() => Effect.void),
    Effect.ensuring(Effect.suspend(() => (room === undefined ? Effect.void : room.leave(conn.id)))),
  )
  return HttpServerResponse.empty()
}).pipe(Effect.scoped)

export const router = HttpRouter.empty.pipe(
  HttpRouter.get("/healthz", HttpMiddleware.withLoggerDisabled(Effect.succeed(HttpServerResponse.text("ok")))),
  HttpRouter.post(
    "/api/rooms",
    Effect.gen(function* () {
      const settings = yield* ServerConfig
      const req = yield* HttpServerRequest.HttpServerRequest
      if (!allowCreate(clientIp(req), settings.roomsPerIpPerHour)) return HttpServerResponse.unsafeJson({ error: "Too many new tables; try again later." }, { status: 429 })
      const code = yield* (yield* Rooms).create
      return HttpServerResponse.unsafeJson({ room: code }, { status: 201 })
    }),
  ),
  HttpRouter.get("/ws", socket),
  HttpRouter.get("*", serveStatic),
)
