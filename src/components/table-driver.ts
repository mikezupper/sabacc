// The bridge between Gyral components and the table store (solo or multiplayer). Game
// state stays in the store, which runs the engine; Gyral components reach it only
// through this driver: `play(command)` sends a move, `watchTable(toMsg)` streams what the
// views read. Pages (and tests) bind it to their store with `provideTable(element, store)`.
import { Signal } from "signal-polyfill"
import { command, defineDriver, provideDrivers, type Command, type Driver } from "@gyral/core"
import type { Beat, Command as GameCommand, Game, GameError, GameEvent } from "../domain/model.ts"
import type { Option } from "effect"
import type { Connection, Presence, Store } from "../state/store.ts"

/** A multiplayer table's connection, as plain values. */
export interface RoomSnapshot {
  readonly code: string
  readonly connection: Connection
  readonly spectator: boolean
  readonly host: boolean
  readonly presence: Presence
  readonly problem: string | undefined
  readonly name: string
}

/** Everything a view reads from the store, as one value. */
export interface TableSnapshot {
  readonly game: Game
  readonly last: ReadonlyArray<Beat>
  readonly log: ReadonlyArray<GameEvent>
  readonly notice: Option.Option<GameError>
  /** Solo: the replay seed, whether the table is saved, whether it came back from storage. */
  readonly seed: number
  readonly persistent: boolean
  readonly restored: boolean
  /** Present only at a multiplayer table. */
  readonly room: RoomSnapshot | undefined
}

export type TableInput =
  | { readonly _tag: "Play"; readonly command: GameCommand }
  | { readonly _tag: "Watch" }
  | { readonly _tag: "Join"; readonly name: string }

const DRIVER = "table"

const snapshotOf = (store: Store): TableSnapshot => {
  const r = store.room
  return {
    game: store.game.get(),
    last: store.last.get(),
    log: store.log.get(),
    notice: store.notice.get(),
    seed: store.seed,
    persistent: store.persistent,
    restored: store.restored,
    room:
      r === undefined
        ? undefined
        : {
            code: r.code,
            connection: r.connection.get(),
            spectator: r.spectator.get(),
            host: r.host.get(),
            presence: r.presence.get(),
            problem: r.problem.get(),
            name: r.name.get(),
          },
  }
}

/** Emit a snapshot now and after every change to the store's signals, until aborted. */
const watch = (store: Store, signal: AbortSignal, emit: (s: TableSnapshot) => void): Promise<TableSnapshot> =>
  new Promise(() => {
    const current = new Signal.Computed(() => snapshotOf(store))
    const watcher = new Signal.subtle.Watcher(() => {
      // Signals can't be read inside the notification: read and re-arm in a microtask.
      queueMicrotask(() => {
        if (signal.aborted) return
        watcher.watch()
        emit(current.get())
      })
    })
    watcher.watch(current)
    emit(current.get())
    signal.addEventListener("abort", () => watcher.unwatch(current), { once: true })
  })

/** The table driver bound to one store. */
export const tableDriver = (store: Store): Driver<TableInput, TableSnapshot | undefined> =>
  defineDriver<TableInput, TableSnapshot | undefined>({
    name: DRIVER,
    run: (input, { signal, emit }) => {
      if (input._tag === "Play") {
        store.dispatch(input.command)
        return undefined
      }
      if (input._tag === "Join") {
        store.room?.join(input.name)
        return undefined
      }
      return watch(store, signal, (s) => emit(s))
    },
  })

/** The default, before a page provides its store: a clear error instead of silence. */
const unbound = defineDriver<TableInput, TableSnapshot | undefined, string>({
  name: DRIVER,
  run: () => {
    throw new Error("No table: call provideTable(element, store) on an ancestor of this component.")
  },
  toError: (e) => (e instanceof Error ? e.message : String(e)),
})

/** Make `store` the table for every Gyral component under `element`. Returns an undo. */
export const provideTable = (element: Element, store: Store): (() => void) => provideDrivers(element, { [DRIVER]: tableDriver(store) })

/** Send a move to the table. The result comes back through `watchTable`, never here. */
export const play = <M>(move: GameCommand): Command<M> =>
  command<TableInput, TableSnapshot | undefined, string, M>(unbound, { _tag: "Play", command: move }, { onSuccess: () => undefined })

/** Sit down at a multiplayer table with this display name (asked once, then remembered). */
export const join = <M>(name: string): Command<M> =>
  command<TableInput, TableSnapshot | undefined, string, M>(unbound, { _tag: "Join", name }, { onSuccess: () => undefined })

/** Stream the table: one message now, then one per change, while the component is connected. */
export const watchTable = <M>(toMsg: (s: TableSnapshot) => M): Command<M> =>
  command<TableInput, TableSnapshot | undefined, string, M>(unbound, { _tag: "Watch" }, { onSuccess: (s) => (s === undefined ? undefined : toMsg(s)), key: "table", concurrency: "switch" })
