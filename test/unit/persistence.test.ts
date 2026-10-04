import { Effect, FastCheck as fc, Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { BUY_IN } from "../../src/domain/constants.ts"
import { Command, YOU, type Game } from "../../src/domain/model.ts"
import { SavedGameJson } from "../../src/domain/schema.ts"
import { newTable } from "../../src/domain/table.ts"
import { loadGame, TABLE_KEY, type KeyValueStore } from "../../src/state/persistence.ts"
import { createStore, type Store } from "../../src/state/store.ts"

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

/** A legal move for you, or None when it's not your turn. */
const move = (g: Game, pick: number): Command => {
  if (g.phase._tag === "Lobby") return (g.seats[YOU]?.credits ?? 0) < BUY_IN ? Command.NewTable() : Command.StartHand()
  const step = g.phase.step
  const you = g.seats[YOU]!
  if (step._tag === "Betting") return step.currentBet > you.roundBet ? (pick < 0.8 ? Command.Match() : Command.Fold()) : Command.Check()
  if (step._tag === "Drawing") return pick < 0.5 ? Command.Gain() : Command.Stand()
  return pick < 0.3 ? Command.CallHand() : Command.Pass()
}

const playN = (store: Store, picks: ReadonlyArray<number>) => {
  for (const p of picks) store.dispatch(move(store.game.get(), p))
}

const load = (s: KeyValueStore) => Effect.runSync(loadGame(s))

describe("persistence (sabacc-3nc)", () => {
  it("restores the table after a reload, mid-hand, and play continues", () => {
    const storage = memory()
    const first = createStore(1, { storage })
    first.dispatch(Command.StartHand())
    expect(first.game.get().phase._tag).toBe("Playing")

    const reloaded = createStore(99, { storage })
    expect(reloaded.restored).toBe(true)
    expect(reloaded.game.get()).toEqual(first.game.get())
    reloaded.dispatch(move(reloaded.game.get(), 0))
    expect(reloaded.notice.get()).toEqual(Option.none())
  })

  it("round-trips any reachable game (property)", () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(fc.double({ min: 0, max: 0.999, noNaN: true }), { maxLength: 40 }), (seed, picks) => {
        const storage = memory()
        const store = createStore(seed, { storage })
        playN(store, picks)
        // Reloading gives the saved game, or a fresh table if nothing was saved yet.
        expect(Option.getOrElse(load(storage), newTable)).toEqual(store.game.get())
      }),
      { numRuns: 100 },
    )
  })

  it("starts fresh and removes a save that isn't valid JSON", () => {
    const storage = memory()
    storage.setItem(TABLE_KEY, "{not json")
    const store = createStore(1, { storage })
    expect(store.restored).toBe(false)
    expect(storage.data.has(TABLE_KEY)).toBe(false)
  })

  it("rejects a hand-edited save whose credits don't add up", () => {
    const storage = memory()
    createStore(1, { storage }).dispatch(Command.StartHand())
    const saved = JSON.parse(storage.getItem(TABLE_KEY)!)
    saved.game.seats[YOU].credits += 50_000
    storage.setItem(TABLE_KEY, JSON.stringify(saved))
    expect(load(storage)).toEqual(Option.none())
    expect(Schema.decodeUnknownEither(SavedGameJson)(JSON.stringify(saved))._tag).toBe("Left")
  })

  it("rejects a save from another version", () => {
    const storage = memory()
    createStore(1, { storage }).dispatch(Command.StartHand())
    const saved = JSON.parse(storage.getItem(TABLE_KEY)!)
    storage.setItem(TABLE_KEY, JSON.stringify({ ...saved, version: 0 }))
    expect(load(storage)).toEqual(Option.none())
  })

  it("never saves a replay table (no storage)", () => {
    const store = createStore(1)
    store.dispatch(Command.StartHand())
    expect(store.persistent).toBe(false)
    expect(store.restored).toBe(false)
  })
})
