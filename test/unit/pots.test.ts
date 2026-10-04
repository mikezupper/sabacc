import { FastCheck as fc } from "effect"
import { describe, expect, it } from "vitest"
import { layers, split } from "../../src/domain/pots.ts"

describe("side pots", () => {
  it("is one layer when everyone put in the same", () => {
    expect(layers([
      { seat: 0, committed: 300, folded: false },
      { seat: 1, committed: 300, folded: false },
    ])).toEqual([{ amount: 600, eligible: [0, 1] }])
  })

  it("caps a short all-in at what they could cover", () => {
    // Seat 1 is all-in for 200; seats 0 and 2 went to 500.
    expect(layers([
      { seat: 0, committed: 500, folded: false },
      { seat: 1, committed: 200, folded: false },
      { seat: 2, committed: 500, folded: false },
    ])).toEqual([
      { amount: 600, eligible: [0, 1, 2] },
      { amount: 600, eligible: [0, 2] },
    ])
  })

  it("keeps folded money in the pot without making the folder eligible", () => {
    expect(layers([
      { seat: 0, committed: 400, folded: false },
      { seat: 1, committed: 300, folded: true },
      { seat: 2, committed: 400, folded: false },
    ])).toEqual([{ amount: 1100, eligible: [0, 2] }])
  })

  it("puts a folder's money above every live stake into the top layer", () => {
    expect(layers([
      { seat: 0, committed: 100, folded: false },
      { seat: 1, committed: 700, folded: true },
    ])).toEqual([{ amount: 800, eligible: [0] }])
  })

  it("conserves every credit (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ committed: fc.integer({ min: 0, max: 5000 }), folded: fc.boolean() }), { minLength: 1, maxLength: 5 }),
        (raw) => {
          const cs = raw.map((c, seat) => ({ ...c, seat }))
          const total = cs.reduce((s, c) => s + c.committed, 0)
          expect(layers(cs).reduce((s, l) => s + l.amount, 0)).toBe(total)
        },
      ),
    )
  })

  it("splits evenly and reports the remainder", () => {
    expect(split(1001, [1, 2])).toEqual({ shares: [{ seat: 1, amount: 500 }, { seat: 2, amount: 500 }], remainder: 1 })
    expect(split(300, [])).toEqual({ shares: [], remainder: 300 })
  })
})
