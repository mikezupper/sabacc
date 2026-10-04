// Saving the table across reloads (bead sabacc-3nc). Browser storage is untrusted
// input: everything read back is decoded with SavedGameJson, and anything that
// doesn't decode is discarded rather than repaired.
import { Effect, Option, Schema } from "effect"
import type { Game } from "../domain/model.ts"
import { SAVE_VERSION, SavedGameJson } from "../domain/schema.ts"

/** The slice of the Web Storage API we use; tests pass an in-memory version. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const TABLE_KEY = "sabacc:table"

/** `localStorage`, if this browser lets us use it (private modes may throw). */
export const browserStorage: Effect.Effect<Option.Option<KeyValueStore>> = Effect.try(() => {
  const s = window.localStorage
  const probe = `${TABLE_KEY}:probe`
  s.setItem(probe, "1")
  s.removeItem(probe)
  return s
}).pipe(Effect.option)

/** The saved table, or None when there is none or it doesn't decode (it is then removed). */
export const loadGame = (store: KeyValueStore): Effect.Effect<Option.Option<Game>> =>
  Effect.gen(function* () {
    const text = yield* Effect.try(() => store.getItem(TABLE_KEY)).pipe(Effect.option, Effect.map(Option.flatMap(Option.fromNullable)))
    if (Option.isNone(text)) return Option.none()
    const saved = Schema.decodeUnknownOption(SavedGameJson)(text.value)
    if (Option.isNone(saved)) yield* Effect.try(() => store.removeItem(TABLE_KEY)).pipe(Effect.ignore)
    return Option.map(saved, (s) => s.game)
  })

/** Save the table; a game that fails its own invariants is never written. */
export const saveGame = (store: KeyValueStore, game: Game): Effect.Effect<void> =>
  Schema.encode(SavedGameJson)({ version: SAVE_VERSION, game }).pipe(
    Effect.flatMap((json) => Effect.try(() => store.setItem(TABLE_KEY, json))),
    Effect.ignore,
  )
