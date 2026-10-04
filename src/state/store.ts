import { signal } from "@lit-labs/signals"
import { Effect, Either, Option, Random } from "effect"
import { applyCommand } from "../domain/engine.ts"
import { eventsOf, type Beat, type Command, type Game, type GameError, type GameEvent } from "../domain/model.ts"
import { newTable } from "../domain/table.ts"
import { browserStorage, loadGame, saveGame, type KeyValueStore } from "./persistence.ts"

export interface StoreOptions {
  /** Where to save the table: a store, the browser's localStorage, or nowhere (default). */
  readonly storage?: KeyValueStore | "browser"
}

/**
 * The app's single runtime boundary (ARCHITECTURE.md "Data flow"). Every command
 * runs `applyCommand` once, synchronously, with this store's seeded Random, so a
 * seed plus a command sequence always reproduces the same game. With `storage`,
 * the table is restored on start and saved after every successful command.
 */
export const createStore = (seed: number, options: StoreOptions = {}) => {
  const random = Random.make(seed)
  const storage: Option.Option<KeyValueStore> =
    options.storage === "browser" ? Effect.runSync(browserStorage) : Option.fromNullable(options.storage)
  const saved = Option.flatMap(storage, (s) => Effect.runSync(loadGame(s)))
  /** True when this table came back from storage rather than starting fresh. */
  const restored = Option.isSome(saved)
  const game = signal<Game>(Option.getOrElse(saved, newTable))
  const log = signal<ReadonlyArray<GameEvent>>([])
  /** Beats (event + snapshot) from the most recent successful command only, for playback. */
  const last = signal<ReadonlyArray<Beat>>([])
  const notice = signal<Option.Option<GameError>>(Option.none())

  const dispatch = (command: Command): void => {
    const result = Effect.runSync(Effect.either(applyCommand(game.get(), command).pipe(Effect.withRandom(random))))
    Either.match(result, {
      onLeft: (error) => notice.set(Option.some(error)),
      onRight: (t) => {
        game.set(t.game)
        Option.map(storage, (s) => Effect.runSync(saveGame(s, t.game)))
        last.set(t.beats)
        log.set(command._tag === "NewTable" ? eventsOf(t) : [...log.get(), ...eventsOf(t)])
        notice.set(Option.none())
      },
    })
  }

  return { seed, game, log, last, notice, dispatch, restored, persistent: Option.isSome(storage) } as const
}

export type Store = ReturnType<typeof createStore>
