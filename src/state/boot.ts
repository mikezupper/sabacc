// Start-up shared by both views (2D and 3D): solo play with a seed, or a multiplayer
// table when the address has `?room=CODE`.
import { Option, Schema } from "effect"
import { RoomCode } from "../protocol/messages.ts"
import { createRemoteStore } from "./remote-store.ts"
import { createStore, openBrowserStorage, type Store } from "./store.ts"

/** `?seed=<int>` replays a table exactly; otherwise a random seed and your saved table. */
const Seed = Schema.NumberFromString.pipe(Schema.int(), Schema.between(0, 2 ** 31 - 1))

const randomSeed = (): number => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 2 ** 31

/** The room in the address, if it's a well-formed code (`?room=ABC234`). */
export const roomFrom = (search: string): Option.Option<string> =>
  Schema.decodeUnknownOption(RoomCode)(new URLSearchParams(search).get("room")?.toUpperCase())

/** A ?seed= link is a replay: it starts a fresh table and never touches your saved one. */
export const bootStore = (search: string): Store =>
  Option.match(roomFrom(search), {
    onSome: (room) => createRemoteStore({ room, storage: openBrowserStorage() }),
    onNone: () => {
      const requested = Schema.decodeUnknownOption(Seed)(new URLSearchParams(search).get("seed"))
      const seed = Option.getOrElse(requested, randomSeed)
      return createStore(seed, Option.isSome(requested) ? {} : { storage: "browser" })
    },
  })
