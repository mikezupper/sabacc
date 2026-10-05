// Rooms saved in SQLite (node:sqlite, built into Node 24: no native module to build).
// One row per room; the game is stored with the same SavedGameJson as the browser save,
// so it is checked against the table's invariants on the way in and out.
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { Context, Effect, Layer, Option, Schema } from "effect"
import type { Game } from "../domain/model.ts"
import { SAVE_VERSION, SavedGameJson } from "../domain/schema.ts"
import { ServerConfig } from "./config.ts"

/** A seat someone has claimed: their token (hashed) and display name. */
export interface Claim {
  readonly tokenHash: string
  readonly name: string
}

export interface SavedRoom {
  readonly code: string
  readonly game: Game
  readonly claims: ReadonlyArray<Claim | null>
  readonly host: number
  readonly created: number
  readonly updated: number
}

const ClaimsJson = Schema.parseJson(Schema.Array(Schema.NullOr(Schema.Struct({ tokenHash: Schema.String, name: Schema.String }))))

export interface RoomDb {
  readonly save: (room: SavedRoom) => Effect.Effect<void>
  readonly load: (code: string) => Effect.Effect<Option.Option<SavedRoom>>
  readonly exists: (code: string) => Effect.Effect<boolean>
  /** Delete rooms not updated since `before` (epoch ms); returns how many. */
  readonly prune: (before: number) => Effect.Effect<number>
  /** Copy the database to `file` (a consistent snapshot, safe while running). */
  readonly backup: (file: string) => Effect.Effect<void, Error>
}

export class Db extends Context.Tag("Db")<Db, RoomDb>() {}

export const openDb = (file: string): RoomDb => {
  const db = new DatabaseSync(file)
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      game TEXT NOT NULL,
      claims TEXT NOT NULL,
      host INTEGER NOT NULL,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL
    )`)
  const upsert = db.prepare(`INSERT INTO rooms (code, game, claims, host, created, updated) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET game = excluded.game, claims = excluded.claims, host = excluded.host, updated = excluded.updated`)
  const select = db.prepare(`SELECT code, game, claims, host, created, updated FROM rooms WHERE code = ?`)
  const remove = db.prepare(`DELETE FROM rooms WHERE updated < ?`)

  const decode = (row: Record<string, unknown>): Option.Option<SavedRoom> => {
    const game = Schema.decodeUnknownOption(SavedGameJson)(row["game"])
    const claims = Schema.decodeUnknownOption(ClaimsJson)(row["claims"])
    if (Option.isNone(game) || Option.isNone(claims)) return Option.none()
    return Option.some({
      code: String(row["code"]),
      game: game.value.game,
      claims: claims.value,
      host: Number(row["host"]),
      created: Number(row["created"]),
      updated: Number(row["updated"]),
    })
  }

  return {
    save: (room) =>
      Effect.gen(function* () {
        const game = yield* Schema.encode(SavedGameJson)({ version: SAVE_VERSION, game: room.game })
        const claims = yield* Schema.encode(ClaimsJson)(room.claims)
        upsert.run(room.code, game, claims, room.host, room.created, room.updated)
      }).pipe(Effect.catchAll((e) => Effect.logError("room not saved", room.code, e))),
    load: (code) =>
      Effect.sync(() => {
        const row = select.get(code)
        return row === undefined ? Option.none() : decode(row)
      }),
    exists: (code) => Effect.sync(() => select.get(code) !== undefined),
    prune: (before) => Effect.sync(() => Number(remove.run(before).changes)),
    backup: (target) =>
      Effect.try({
        try: () => {
          db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`)
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }),
  }
}

export const DbLive = Layer.effect(
  Db,
  Effect.gen(function* () {
    const { dataDir } = yield* ServerConfig
    yield* Effect.sync(() => mkdirSync(dataDir, { recursive: true }))
    const file = join(dataDir, "sabacc.db")
    yield* Effect.logInfo("database", file)
    return openDb(file)
  }),
)
