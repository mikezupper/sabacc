// App wiring: the only module allowed to touch everything (ARCHITECTURE.md).
import { Option, Schema } from "effect"
import "./components/sabacc-table.ts"
import { createStore } from "./state/store.ts"

/** `?seed=<int>` replays a table exactly; anything else gets a fresh random seed. */
const Seed = Schema.NumberFromString.pipe(Schema.int(), Schema.between(0, 2 ** 31 - 1))

const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0

const seed = Option.getOrElse(
  Schema.decodeUnknownOption(Seed)(new URLSearchParams(location.search).get("seed")),
  () => randomSeed() % 2 ** 31,
)

const table = document.querySelector("sabacc-table")
if (table !== null) table.store = createStore(seed)
