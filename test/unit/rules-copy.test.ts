// Rules-copy drift guard: the player-facing rules in index.html must state the same
// rules as src/domain. If this fails, update the spec, then the code, then the copy
// (AGENTS.md invariant 3).
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { FACE_CARDS, SUITS } from "../../src/domain/cards.ts"
import * as C from "../../src/domain/constants.ts"

const html = readFileSync(join(import.meta.dirname, "../../index.html"), "utf8")
const rules = html.slice(html.indexOf('id="rules"'))
const fmt = new Intl.NumberFormat("en").format
const minus = (n: number) => (n < 0 ? `−${-n}` : String(n))

describe("rules copy matches the domain", () => {
  it.each([
    ["starting credits", `<data value="${C.STARTING_CREDITS}">${fmt(C.STARTING_CREDITS)}</data>`],
    ["hand-pot ante", `<data value="${C.HAND_ANTE}">${C.HAND_ANTE}</data> to the hand pot`],
    ["Sabacc-pot ante", `<data value="${C.SABACC_ANTE}">${C.SABACC_ANTE}</data> to the Sabacc pot`],
    ["buy-in", `both antes (${C.BUY_IN} credits)`],
    ["minimum bet", `at least <data value="${C.MIN_BET}">${C.MIN_BET}</data> credits`],
    ["no limit", "No limit"],
    ["opponent count", ["zero", "one", "two", "three", "four", "five"][C.OPPONENT_COUNT] + " opponents"],
    ["deal size", `dealt ${C.HAND_SIZE} cards`],
    ["minimum hand", `keep at least ${C.MIN_HAND} cards`],
    ["bomb-out line", `above +${C.SABACC}, below −${C.SABACC}, or exactly 0`],
    ["round cap", `After ${C.MAX_ROUNDS} rounds the hand is called automatically`],
    ["sudden demise cards", `up to ${["zero", "one", "two", "three"][C.SUDDEN_DEMISE_CARDS]}`],
    ["deck size", "76 cards"],
    ["suits", SUITS.slice(0, -1).join(", ") + " and " + SUITS.at(-1)],
    ["ranked cards", "Commander (12), Mistress (13), Master (14) and Ace (15)"],
  ])("states the %s", (_, phrase) => {
    expect(rules).toContain(phrase)
  })

  it.each(FACE_CARDS.map((f) => [f.name, f.value] as const))("lists %s at %i", (name, value) => {
    expect(rules).toContain(`<dt>${name}</dt><dd>${minus(value)}</dd>`)
  })

  it("no longer mentions the house-variant mechanics", () => {
    expect(rules).not.toMatch(/protection|Master of Coins|±10|shift chance/i)
  })

  it("has no meta keywords (google-seo-fundamentals)", () => {
    expect(html).not.toContain('name="keywords"')
  })
})
