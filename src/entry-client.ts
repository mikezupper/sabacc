// App wiring: the only module allowed to touch everything (ARCHITECTURE.md).
import { Option, Schema } from "effect"
import "./components/sabacc-table.ts"
import { createStore } from "./state/store.ts"

/** `?seed=<int>` replays a table exactly; otherwise a random seed and your saved table. */
const Seed = Schema.NumberFromString.pipe(Schema.int(), Schema.between(0, 2 ** 31 - 1))

const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0

const requested = Schema.decodeUnknownOption(Seed)(new URLSearchParams(location.search).get("seed"))
const seed = Option.getOrElse(requested, () => randomSeed() % 2 ** 31)

// A ?seed= link is a replay: it starts a fresh table and never touches your saved one.
const table = document.querySelector("sabacc-table")
if (table !== null) table.store = createStore(seed, Option.isSome(requested) ? {} : { storage: "browser" })
