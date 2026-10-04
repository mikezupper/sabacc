import { FastCheck as fc } from "effect"
import { describe, expect, it } from "vitest"
import { Card, DESIGNS, describeCard, fullDeck } from "../../src/domain/cards.ts"
import { evaluate } from "../../src/domain/scoring.ts"

let nextId = 1000
const n = (value: number, suit: "Coins" | "Sabers" = "Coins") => Card.Suited({ id: nextId++, suit, value })
const face = (name: "The Idiot" | "Balance" | "The Star", value: number) => Card.Face({ id: nextId++, name, value })
const idiot = () => face("The Idiot", 0)

describe("Legends deck [L]", () => {
  it("has 76 cards with unique ids", () => {
    expect(fullDeck).toHaveLength(76)
    expect(DESIGNS).toHaveLength(76)
    expect(new Set(fullDeck.map((c) => c.id)).size).toBe(76)
  })

  it("has four suits of ranks 1–15", () => {
    for (const suit of ["Coins", "Flasks", "Sabers", "Staves"]) {
      const values = fullDeck.filter((c) => c._tag === "Suited" && c.suit === suit).map((c) => c.value)
      expect(values).toEqual(Array.from({ length: 15 }, (_, i) => i + 1))
    }
  })

  it("has two of each of the eight face cards at their Legends values", () => {
    const faces = fullDeck.filter((c) => c._tag === "Face").map((c) => `${c._tag === "Face" ? c.name : ""}=${c.value}`)
    expect(faces).toHaveLength(16)
    for (const [name, value] of [
      ["The Idiot", 0], ["Queen of Air and Darkness", -2], ["Endurance", -8], ["Balance", -11],
      ["Demise", -13], ["Moderation", -14], ["The Evil One", -15], ["The Star", -17],
    ] as const) {
      expect(faces.filter((f) => f === `${name}=${value}`)).toHaveLength(2)
    }
  })

  it("names ranked cards: the Master of Coins is +14, not a special card", () => {
    expect(describeCard(n(14))).toBe("Master of Coins (+14)")
    expect(describeCard(face("Balance", -11))).toBe("Balance (-11)")
  })
})

describe("hand value [L][F]", () => {
  it("bombs out above +23, below −23 and at exactly 0", () => {
    expect(evaluate([n(15), n(9)]).bombedOut).toBe(true) // +24
    expect(evaluate([face("The Star", -17), n(7)]).bombedOut).toBe(false) // −10
    expect(evaluate([face("The Star", -17), face("Balance", -11)]).bombedOut).toBe(true) // −28
    expect(evaluate([n(2), n(3), idiot(), face("Balance", -11), n(6)]).bombedOut).toBe(false) // Idiot's Array totalling 0
    expect(evaluate([n(11), face("Balance", -11)]).bombedOut).toBe(true) // 0
  })

  it("recognises Pure Sabacc at +23 and −23", () => {
    expect(evaluate([n(14), n(9)]).pureSabacc).toBe(true)
    expect(evaluate([face("The Star", -17), face("The Star", -17), n(11)]).pureSabacc).toBe(true)
  })

  it("recognises the Idiot's Array in any suits, with extra cards (Darth Bane's 2, 3, Idiot, 9, 9)", () => {
    expect(evaluate([idiot(), n(2), n(3, "Sabers")]).idiotsArray).toBe(true)
    expect(evaluate([n(2), n(3), idiot(), n(9), n(9)]).idiotsArray).toBe(true)
    expect(evaluate([idiot(), n(2), n(4)]).idiotsArray).toBe(false)
  })

  it("ranks Idiot's Array > +23 > −23 > others; positive beats negative at equal distance", () => {
    const order = [
      evaluate([idiot(), n(2), n(3)]),
      evaluate([n(14), n(9)]),
      evaluate([face("The Star", -17), face("The Star", -17), n(11)]),
      evaluate([n(15), n(6)]), // +21
      evaluate([face("The Star", -17), face("Balance", -11), n(7)]), // −21
      evaluate([n(15), n(5)]), // +20
      evaluate([n(15), n(9)]), // bomb
    ]
    expect(order.map((e) => e.total)).toEqual([5, 23, -23, 21, -21, 20, 24])
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.rank).toBeGreaterThan(order[i]!.rank)
  })

  it("ranks every live hand by |total| with + breaking ties (property)", () => {
    // Evaluation only reads card values, so a one-card hand with a synthetic value
    // stands in for any hand with that total.
    const v = (value: number) => Card.Suited({ id: nextId++, suit: "Staves", value })
    fc.assert(
      fc.property(fc.integer({ min: -22, max: 22 }), fc.integer({ min: -22, max: 22 }), (a, b) => {
        fc.pre(a !== 0 && b !== 0 && a !== b)
        const better = Math.abs(a) !== Math.abs(b) ? Math.abs(a) > Math.abs(b) : a > b
        expect(evaluate([v(a)]).rank > evaluate([v(b)]).rank).toBe(better)
      }),
    )
  })
})
