import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { Command } from "../../src/domain/model.ts"
import { createStore } from "../../src/state/store.ts"

const run = (seed: number) => {
  const store = createStore(seed)
  for (const cmd of [Command.StartHand(), Command.Fold(), Command.StartHand(), Command.Fold()]) store.dispatch(cmd)
  return store
}

describe("store", () => {
  it("replays the same game from the same seed", () => {
    expect(run(7).game.get()).toEqual(run(7).game.get())
    expect(run(7).log.get()).toEqual(run(7).log.get())
  })

  it("leaves the game unchanged and sets a notice when a command fails", () => {
    const store = createStore(1)
    const before = store.game.get()
    store.dispatch(Command.Gain())
    expect(store.game.get()).toBe(before)
    expect(Option.map(store.notice.get(), (e) => e._tag)).toEqual(Option.some("NotYourTurn"))
    store.dispatch(Command.StartHand())
    expect(Option.isNone(store.notice.get())).toBe(true)
  })

  it("clears the log on a new table", () => {
    const store = run(3)
    store.dispatch(Command.NewTable())
    expect(store.log.get().map((e) => e._tag)).toEqual(["TableReset"])
  })
})
