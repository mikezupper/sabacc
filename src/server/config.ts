// Server settings, read once from the environment (see .env.example and docs/DEPLOY.md).
import { Config, Context, Effect, Layer } from "effect"
import { AUTO_DEAL_SECONDS, GRACE_SECONDS, TURN_SECONDS } from "../domain/constants.ts"

export interface Settings {
  readonly port: number
  /** Where the SQLite database (and backups) live: a Docker volume in production. */
  readonly dataDir: string
  /** The built site (`dist/`) served next to the WebSocket endpoint. */
  readonly staticDir: string
  readonly turnMs: number
  /** How long a disconnected player keeps their seat before the AI plays it. */
  readonly graceMs: number
  /** Pause between hands before the next one is dealt automatically. */
  readonly autoDealMs: number
  readonly heartbeatMs: number
  /** A room nobody is connected to leaves memory after this long (it stays saved). */
  readonly idleCloseMs: number
  /** A saved room untouched for this long is deleted. */
  readonly deleteAfterMs: number
  readonly roomsPerIpPerHour: number
}

export class ServerConfig extends Context.Tag("ServerConfig")<ServerConfig, Settings>() {}

const seconds = (name: string, fallback: number) => Config.number(name).pipe(Config.withDefault(fallback), Config.map((s) => Math.round(s * 1000)))

export const ServerConfigLive = Layer.effect(
  ServerConfig,
  Effect.gen(function* () {
    return {
      port: yield* Config.port("PORT").pipe(Config.withDefault(8080)),
      dataDir: yield* Config.string("DATA_DIR").pipe(Config.withDefault(".data")),
      staticDir: yield* Config.string("STATIC_DIR").pipe(Config.withDefault("dist")),
      turnMs: yield* seconds("TURN_SECONDS", TURN_SECONDS),
      graceMs: yield* seconds("GRACE_SECONDS", GRACE_SECONDS),
      autoDealMs: yield* seconds("AUTO_DEAL_SECONDS", AUTO_DEAL_SECONDS),
      heartbeatMs: yield* seconds("HEARTBEAT_SECONDS", 25),
      idleCloseMs: yield* seconds("IDLE_CLOSE_SECONDS", 30 * 60),
      deleteAfterMs: yield* seconds("DELETE_AFTER_SECONDS", 24 * 60 * 60),
      roomsPerIpPerHour: yield* Config.integer("ROOMS_PER_IP_PER_HOUR").pipe(Config.withDefault(20)),
    }
  }),
)
