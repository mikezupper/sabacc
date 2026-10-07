import { describe, expect, it } from "vitest"
import { cell } from "../../src/state/cell.ts"

describe("cell (the store's observable values)", () => {
  it("notifies on a change, not on the same value, and stops after unsubscribe", () => {
    const c = cell(1)
    let calls = 0
    const off = c.subscribe(() => calls++)
    c.set(2)
    c.set(2)
    expect(c.get()).toBe(2)
    expect(calls).toBe(1)
    off()
    c.set(3)
    expect(calls).toBe(1)
  })
})
