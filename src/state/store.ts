import { signal, type Signal } from "@lit-labs/signals"
import { Effect, Either, Option, Random } from "effect"
import { applyCommand } from "../domain/engine.ts"
import { eventsOf, type Beat, type Command, type Game, type GameError, type GameEvent } from "../domain/model.ts"
import { newTable } from "../domain/table.ts"
import { browserStorage, loadGame, saveGame, type KeyValueStore } from "./persistence.ts"

/** Who's connected and whose clock is running, at a multiplayer table (viewer's numbering). */
export interface Presence {
  readonly connected: ReadonlyArray<boolean>
  /** The seat on the clock and when its time runs out (local `Date.now()` ms). */
  readonly deadline: { readonly seat: number; readonly at: number } | undefined
}

export type Connection = "naming" | "connecting" | "open" | "reconnecting" | "gone"

/** A multiplayer table's connection state; absent in solo play. */
export interface RoomState {
  readonly code: string
  readonly connection: Signal.State<Connection>
  readonly spectator: Signal.State<boolean>
  readonly host: Signal.State<boolean>
  readonly presence: Signal.State<Presence>
  /** A connection problem to show (not a game rule: those are `notice`). */
  readonly problem: Signal.State<string | undefined>
  readonly name: Signal.State<string>
  /** Join with this display name (asked once, then remembered). */
  readonly join: (name: string) => void
}

/** What every view reads: the same for solo play and a multiplayer table. */
export interface Store {
  /** Solo: the seed that replays this table. Multiplayer: 0 (the server keeps its seed). */
  readonly seed: number
  readonly game: Signal.State<Game>
  readonly log: Signal.State<ReadonlyArray<GameEvent>>
  /** Beats (event + snapshot) from the most recent successful command only, for playback. */
  readonly last: Signal.State<ReadonlyArray<Beat>>
  readonly notice: Signal.State<Option.Option<GameError>>
  readonly dispatch: (command: Command) => void
  /** True when this table came back from storage rather than starting fresh. */
  readonly restored: boolean
  readonly persistent: boolean
  readonly room: RoomState | undefined
}

/** The browser's localStorage, if usable (run here: the browser's single runtime boundary). */
export const openBrowserStorage = (): Option.Option<KeyValueStore> => Effect.runSync(browserStorage)

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
export const createStore = (seed: number, options: StoreOptions = {}): Store => {
  const random = Random.make(seed)
  const storage: Option.Option<KeyValueStore> =
    options.storage === "browser" ? openBrowserStorage() : Option.fromNullable(options.storage)
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

  return { seed, game, log, last, notice, dispatch, restored, persistent: Option.isSome(storage), room: undefined }
}
