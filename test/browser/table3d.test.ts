import { settled } from "@gyral/core"
import { afterEach, describe, expect, it } from "vitest"
import { Card } from "../../src/domain/cards.ts"
import { Command, GameEvent, YOU, type Game } from "../../src/domain/model.ts"
import { newTable } from "../../src/domain/table.ts"
import { Board } from "../../src/scene/board.ts"
import { provideTable } from "../../src/components/table-driver.ts"
import { Sabacc3d } from "../../src/scene/sabacc-3d.ts"
import { createStore, type Store } from "../../src/state/store.ts"

type Table3d = InstanceType<typeof Sabacc3d>

const shadow = (el: Element) => el.shadowRoot ?? el.attachShadow({ mode: "open" })
const controls = (el: Table3d) => shadow(el).querySelector("sabacc-controls")!
const button = (el: Table3d, text: string) =>
  [...shadow(controls(el)).querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text))
const frame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)))
/** The Three.js stage inside the view's <sabacc-stage>. */
const stage = (el: Table3d) => shadow(el).querySelector("sabacc-stage")?.stage

/** Gyral's settled() waits until messages stop arriving, the store's snapshots included. */
const flush = () => settled()

const mount = async (seed = 42) => {
  const store = createStore(seed)
  const host = document.createElement("div")
  provideTable(host, store)
  const el = document.createElement("sabacc-3d") as Table3d
  el.style.cssText = "display:grid;inline-size:960px;block-size:640px"
  host.append(el)
  document.body.append(host)
  await flush()
  await frame()
  await frame()
  return { el, store }
}

/** Wait for the move and the render, finish playback, wait again. */
const settle = async (el: Table3d) => {
  await flush()
  el.send({ _tag: "Skip" })
  await flush()
  await frame()
}

const cardsIn = (game: Game) => game.seats.reduce((n, s) => n + s.hand.length, 0)

/** Safe default moves until it's your turn in `tag`. */
const until = (store: Store, tag: "Betting" | "Drawing" | "CallWindow") => {
  for (let i = 0; i < 100; i++) {
    const g = store.game.get()
    if (g.phase._tag === "Lobby") return false
    const step = g.phase.step
    if (step.toAct[0] === YOU && step._tag === tag) return true
    const you = g.seats[YOU]!
    store.dispatch(
      step._tag === "Betting" ? (step.currentBet > you.roundBet ? Command.Match() : Command.Check())
        : step._tag === "Drawing" ? Command.Stand()
        : Command.Pass(),
    )
  }
  return false
}

afterEach(() => document.body.replaceChildren())

describe("<sabacc-3d>", () => {
  it("draws the table with WebGL", async () => {
    const { el } = await mount()
    expect(stage(el)).toBeDefined()
    expect(stage(el)!.frames).toBeGreaterThan(0)
    expect(shadow(el).querySelector("canvas")).not.toBeNull()
    expect(shadow(el).querySelector(".fallback")).toBeNull()
  })

  it("redraws a resized canvas without waiting for the next animation-loop frame", async () => {
    const { el } = await mount()
    const current = stage(el)!
    current.renderer.setAnimationLoop(null)
    const before = current.frames
    const host = shadow(el).querySelector("sabacc-stage")!
    const height = host.clientHeight
    const resized = new Promise<void>((resolve) => {
      const observer = new ResizeObserver(() => {
        if (host.clientHeight === height) return
        observer.disconnect()
        resolve()
      })
      observer.observe(host)
    })
    el.style.blockSize = "720px"
    await resized
    expect(current.frames).toBeGreaterThan(before)
    expect(current.renderer.info.render.calls).toBeGreaterThan(0)
    // Leave the observer delivery before afterEach removes its observed host.
    await frame()
  }, 60_000)

  it("tears the stage down when the view leaves the page, and builds a new one when it returns", async () => {
    const { el } = await mount()
    const first = stage(el)!
    const host = el.parentElement!
    el.remove()
    expect(first.disposed).toBe(true)
    expect(stage(el)).toBeUndefined()
    host.append(el)
    await flush()
    await frame()
    const second = stage(el)
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
    await frame()
    expect(second!.frames).toBeGreaterThan(0)
  })

  it("deals through the shared controls and puts every card on the table", async () => {
    const { el, store } = await mount()
    button(el, "Deal a hand")?.click()
    await settle(el)
    expect(store.game.get().phase._tag).toBe("Playing")
    expect(stage(el)!.cardCount).toBe(cardsIn(store.game.get()))
    expect(shadow(el).querySelector("output")?.textContent).toMatch(/Betting/)
    expect(shadow(el).querySelectorAll(".stage sabacc-plate")).toHaveLength(store.game.get().seats.length)
  })

  it("picks one of your cards on your draw and locks it in the field", async () => {
    const { el, store } = await mount(7)
    store.dispatch(Command.StartHand())
    expect(until(store, "Drawing")).toBe(true)
    await settle(el)
    const pick = shadow(controls(el)).querySelector<HTMLButtonElement>('[aria-label="Choose a card to lock or trade"] button')
    expect(button(el, "Lock")?.disabled).toBe(true)
    pick?.click()
    await settle(el)
    expect(pick?.getAttribute("aria-pressed")).toBe("true")
    button(el, "Lock")?.click()
    await settle(el)
    expect(store.game.get().seats[YOU]!.field).toHaveLength(1)
    expect(stage(el)!.cardCount).toBe(cardsIn(store.game.get()))
  })

  it("plays a whole hand to the reveal and keeps the table in step", async () => {
    const { el, store } = await mount(5)
    store.dispatch(Command.StartHand())
    expect(until(store, "CallWindow")).toBe(true)
    await settle(el)
    button(el, "Call the hand")?.click()
    await settle(el)
    expect(store.game.get().phase._tag).toBe("Lobby")
    expect(stage(el)!.cardCount).toBe(cardsIn(store.game.get()))
    expect([...shadow(el).querySelectorAll(".stage sabacc-plate")].some((p) => shadow(p).querySelector(".plate.winner") !== null)).toBe(true)
  })
})

describe("Board", () => {
  it("hands a shifted card's object to its replacement instead of discarding it", () => {
    // Regression: the object kept its old id, so the next snapshot discarded it.
    const board = new Board(5, { onShift: () => {} })
    const view = { selected: undefined, hover: undefined, pickable: new Set<number>(), instant: false, spectator: false, revealed: new Set<number>(), presence: () => undefined }
    const base = newTable()
    const withHand = (cards: ReadonlyArray<Card>): Game => ({
      ...base,
      seats: base.seats.map((s, i) => (i === YOU ? { ...s, hand: cards } : s)),
    })
    const before = withHand([Card.Suited({ id: 1, suit: "Coins", value: 3 }), Card.Suited({ id: 2, suit: "Coins", value: 4 })])
    const after = withHand([Card.Suited({ id: 1, suit: "Coins", value: 3 }), Card.Face({ id: 90, name: "The Star", value: -17 })])
    board.show({ ...view, game: before, beat: undefined })
    const old = board.viewOf(2)
    board.show({ ...view, game: after, beat: GameEvent.Shifted({ changed: [{ seat: YOU, count: 1 }] }) })
    expect(board.viewOf(90)).toBe(old)
    board.show({ ...view, game: after, beat: undefined })
    expect(board.viewOf(90)).toBe(old)
    expect(board.viewOf(90)?.leaving).toBe(false)
    expect(board.cardCount).toBe(2)
  })
})
