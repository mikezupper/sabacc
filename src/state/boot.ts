// Start-up shared by both views (2D and 3D): pick the seed and create the store.
import { Option, Schema } from "effect"
import { createStore, type Store } from "./store.ts"

/** `?seed=<int>` replays a table exactly; otherwise a random seed and your saved table. */
const Seed = Schema.NumberFromString.pipe(Schema.int(), Schema.between(0, 2 ** 31 - 1))

const randomSeed = (): number => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 2 ** 31

/** A ?seed= link is a replay: it starts a fresh table and never touches your saved one. */
export const bootStore = (search: string): Store => {
  const requested = Schema.decodeUnknownOption(Seed)(new URLSearchParams(search).get("seed"))
  const seed = Option.getOrElse(requested, randomSeed)
  return createStore(seed, Option.isSome(requested) ? {} : { storage: "browser" })
}
