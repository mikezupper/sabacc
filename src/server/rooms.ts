// All tables: rooms in memory while anyone is around, in SQLite always. Rooms load
// on demand (after a restart, the first join brings a room back) and leave memory
// when idle; old rooms are deleted.
import { randomInt } from "node:crypto"
import { Context, Duration, Effect, Layer, Option, Schedule } from "effect"
import { newTable } from "../domain/table.ts"
import { ROOM_ALPHABET } from "../protocol/messages.ts"
import { ServerConfig } from "./config.ts"
import { Db } from "./db.ts"
import { Room } from "./room.ts"

export interface RoomRegistry {
  /** A new, empty table; returns its code. */
  readonly create: Effect.Effect<string>
  readonly get: (code: string) => Effect.Effect<Option.Option<Room>>
  /** Close idle rooms and delete old ones (runs every minute). */
  readonly sweep: Effect.Effect<void>
  readonly size: Effect.Effect<number>
}

export class Rooms extends Context.Tag("Rooms")<Rooms, RoomRegistry>() {}

const makeCode = (): string => Array.from({ length: 6 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join("")

/** A fresh multiplayer table: every seat starts with the AI until someone sits down. */
const emptyTable = () => {
  const t = newTable()
  return { ...t, seats: t.seats.map((s) => ({ ...s, controller: "Ai" as const, name: `Droid ${s.index + 1}` })) }
}

export const RoomsLive = Layer.scoped(
  Rooms,
  Effect.gen(function* () {
    const settings = yield* ServerConfig
    const db = yield* Db
    const live = new Map<string, Room>()

    const create = Effect.gen(function* () {
      let code = makeCode()
      while (live.has(code) || (yield* db.exists(code))) code = makeCode()
      const now = Date.now()
      const game = emptyTable()
      const saved = { code, game, claims: game.seats.map(() => null), host: -1, created: now, updated: now }
      yield* db.save(saved)
      live.set(code, new Room(saved, { settings, db }))
      yield* Effect.logInfo("room created", code)
      return code
    })

    const get = (code: string) =>
      Effect.gen(function* () {
        const hit = live.get(code)
        if (hit !== undefined) return Option.some(hit)
        const saved = yield* db.load(code)
        if (Option.isNone(saved)) return Option.none()
        const room = new Room(saved.value, { settings, db })
        live.set(code, room)
        yield* room.wake()
        return Option.some(room)
      })

    const sweep = Effect.gen(function* () {
      const now = Date.now()
      for (const [code, room] of live)
        if (room.connections === 0 && now - room.lastActivity > settings.idleCloseMs) {
          yield* room.close()
          live.delete(code)
        }
      const deleted = yield* db.prune(now - settings.deleteAfterMs)
      if (deleted > 0) yield* Effect.logInfo("rooms deleted", deleted)
    })

    yield* Effect.forkScoped(Effect.repeat(sweep, Schedule.spaced(Duration.minutes(1))))
    yield* Effect.addFinalizer(() => Effect.forEach(live.values(), (r) => r.close(), { discard: true }))
    return { create, get, sweep, size: Effect.sync(() => live.size) }
  }),
)
