// The table driver: Gyral components reach the store only through it.
import { describe, expect, it } from "vitest"
import { Command } from "../../src/domain/model.ts"
import { play, tableDriver, watchTable, type TableSnapshot } from "../../src/components/table-driver.ts"
import { createStore } from "../../src/state/store.ts"

const tick = () => new Promise((r) => setTimeout(r, 0))

describe("table driver", () => {
  it("plays a move on the store", async () => {
    const store = createStore(42)
    const driver = tableDriver(store)
    const out = await driver.run({ _tag: "Play", command: Command.StartHand() }, { signal: new AbortController().signal, emit: () => {} })
    expect(out).toBeUndefined()
    expect(store.game.get().phase._tag).toBe("Playing")
  })

  it("streams the table now and after every change, until aborted", async () => {
    const store = createStore(42)
    const seen: Array<TableSnapshot> = []
    const abort = new AbortController()
    void tableDriver(store).run({ _tag: "Watch" }, { signal: abort.signal, emit: (s) => s && seen.push(s) })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.game.phase._tag).toBe("Lobby")

    store.dispatch(Command.StartHand())
    await tick()
    expect(seen.at(-1)?.game.phase._tag).toBe("Playing")
    expect(seen.at(-1)?.last.length).toBeGreaterThan(0)

    // Several changes in one task arrive as one snapshot.
    const before = seen.length
    store.dispatch(Command.Fold())
    await tick()
    expect(seen.length).toBe(before + 1)

    abort.abort()
    store.dispatch(Command.StartHand())
    await tick()
    expect(seen.length).toBe(before + 1)
  })

  it("describes moves and the watch as commands (data), keyed so a re-watch replaces the old one", () => {
    const move = play<never>(Command.Check())
    expect(move.input).toEqual({ _tag: "Play", command: Command.Check() })
    const watching = watchTable((s) => ({ _tag: "TableChanged" as const, s }))
    expect(watching.key).toBe("table")
    expect(watching.concurrency).toBe("switch")
  })
})
