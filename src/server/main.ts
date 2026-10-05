// The multiplayer server: `node src/server/main.ts` (Node 24 runs the TypeScript
// directly). Serves the built site and the game over WebSockets on one port.
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Logger } from "effect"
import { appLayer } from "./app.ts"
import { ServerConfig, ServerConfigLive } from "./config.ts"

const MainLive = Layer.unwrapEffect(Effect.map(ServerConfig, ({ port }) => appLayer(port))).pipe(
  Layer.provide(ServerConfigLive),
  Layer.provide(Logger.json),
)

NodeRuntime.runMain(Layer.launch(MainLive), { disablePrettyLogger: true })
