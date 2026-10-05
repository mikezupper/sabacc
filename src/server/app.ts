// The server as a Layer: HTTP + WebSocket routes over rooms and the database. `main.ts`
// launches it; tests start it on a random port with short timers.
import { createServer } from "node:http"
import { HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { Layer } from "effect"
import { DbLive } from "./db.ts"
import { router } from "./http.ts"
import { RoomsLive } from "./rooms.ts"

/** Serve on `port` (0 = any free port); exposes `HttpServer` so callers can read the address. */
export const appLayer = (port: number) =>
  router.pipe(
    HttpServer.serve(HttpMiddleware.logger),
    HttpServer.withLogAddress,
    Layer.provide(RoomsLive),
    Layer.provide(DbLive),
    Layer.provideMerge(NodeHttpServer.layer(createServer, { port })),
  )
