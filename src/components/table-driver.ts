// The bridge between Gyral components and the table store (solo or multiplayer). Game
// state stays in the store, which runs the engine; Gyral components reach it only
// through two drivers: `play(command)` / `join(name)` send to it, `watchTable(toMsg)`
// streams what the views read. Pages (and tests) bind both to their store with
// `provideTable(element, store)`.
import { command, defineDriver, provideDrivers, subscription, type Command, type Driver } from "@gyral/core"
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

export type TableInput = { readonly _tag: "Play"; readonly command: GameCommand } | { readonly _tag: "Join"; readonly name: string }

const DRIVER = "table"
const WATCH = "table-watch"

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

/** Every observable value of the store (the room's too, at a multiplayer table). */
const cellsOf = (store: Store) => {
  const r = store.room
  const room = r === undefined ? [] : [r.connection, r.spectator, r.host, r.presence, r.problem, r.name]
  return [store.game, store.last, store.log, store.notice, ...room]
}

/** The moves driver bound to one store: play a command, or sit down at a multiplayer table. */
export const tableDriver = (store: Store): Driver<TableInput, undefined> =>
  defineDriver<TableInput, undefined>({
    name: DRIVER,
    run: (input) => {
      if (input._tag === "Play") store.dispatch(input.command)
      else store.room?.join(input.name)
      return undefined
    },
  })

/**
 * The watch over one store (Gyral's `subscription()`): a snapshot now and after every
 * change. Changes made in one task (a command sets several values) arrive as one snapshot,
 * a microtask later. Gyral unsubscribes when the component disconnects and ignores emits
 * after that. (The Gyral docs' "outside stores" recipe is based on this.)
 */
export const tableWatch = (store: Store): Driver<undefined, TableSnapshot> =>
  subscription<TableSnapshot>(WATCH, (emit) => {
    let queued = false
    const changed = () => {
      if (queued) return
      queued = true
      queueMicrotask(() => {
        queued = false
        emit(snapshotOf(store))
      })
    }
    const unsubscribe = cellsOf(store).map((c) => c.subscribe(changed))
    emit(snapshotOf(store))
    return () => unsubscribe.forEach((off) => off())
  })

const NO_TABLE = "No table: call provideTable(element, store) on an ancestor of this component."

/** The defaults, before a page provides its store: a clear error instead of silence. */
const unbound = defineDriver<TableInput, undefined, string>({
  name: DRIVER,
  run: () => {
    throw new Error(NO_TABLE)
  },
  toError: (e) => (e instanceof Error ? e.message : String(e)),
})
const unwatched = subscription<TableSnapshot>(WATCH, (_emit, { fail }) => {
  fail(new Error(NO_TABLE))
  return () => {}
})

/** Make `store` the table for every Gyral component under `element`. Returns an undo. */
export const provideTable = (element: Element, store: Store): (() => void) =>
  provideDrivers(element, { [DRIVER]: tableDriver(store), [WATCH]: tableWatch(store) })

/** Send a move to the table. The result comes back through `watchTable`, never here. */
export const play = <M>(move: GameCommand): Command<M> =>
  command<TableInput, undefined, string, M>(unbound, { _tag: "Play", command: move }, { onSuccess: () => undefined })

/** Sit down at a multiplayer table with this display name (asked once, then remembered). */
export const join = <M>(name: string): Command<M> =>
  command<TableInput, undefined, string, M>(unbound, { _tag: "Join", name }, { onSuccess: () => undefined })

/** Stream the table: one message now, then one per change, while the component is connected. */
export const watchTable = <M>(toMsg: (s: TableSnapshot) => M): Command<M> =>
  command(unwatched, undefined, { onSuccess: toMsg, key: "table" })
