import { settled } from "@gyral/core"
import { Signal } from "signal-polyfill"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Card } from "../../src/domain/cards.ts"
import { Command, GameEvent, YOU, type Game } from "../../src/domain/model.ts"
import { SabaccTable } from "../../src/components/sabacc-table.ts"
import { provideTable } from "../../src/components/table-driver.ts"
import { isPlaying, revealed } from "../../src/presentation/playback.ts"
import { createStore, type Store } from "../../src/state/store.ts"

type TableEl = InstanceType<typeof SabaccTable>

/** Let the store's change reach the table (microtasks), then let every component render. */
const flush = async () => {
  for (let n = 0; n < 20; n++) await Promise.resolve()
  await settled()
}

/** Mount a table on `store`, provided by a host element as the page does. */
const mountOn = async (store: Store) => {
  const host = document.createElement("div")
  provideTable(host, store)
  const el = document.createElement("sabacc-table") as TableEl
  host.append(el)
  document.body.append(host)
  await flush()
  return el
}

const mount = async (seed = 42) => {
  const store = createStore(seed)
  return { el: await mountOn(store), store }
}

/** Let the table render the final state: finish any playback, then wait for children. */
const settle = async (el: TableEl, finishPlayback = true) => {
  await flush()
  if (finishPlayback) {
    el.send({ _tag: "Skip" })
    await flush()
  }
}

const shadow = (el: Element) => el.shadowRoot ?? el.attachShadow({ mode: "open" })
const seats = (el: TableEl) => [...shadow(el).querySelectorAll("sabacc-seat")]
const cardLabels = (seat: Element) =>
  [...shadow(seat).querySelectorAll("sabacc-card")].map((c) => shadow(c).querySelector("svg")?.getAttribute("aria-label") ?? "")
/** Buttons in `root`'s shadow, including its shared <sabacc-controls>. */
const button = (root: Element, text: string) =>
  [...shadow(root).querySelectorAll("button"), ...[...shadow(root).querySelectorAll("sabacc-controls")].flatMap((c) => [...shadow(c).querySelectorAll("button")])]
    .find((b) => b.textContent?.trim().startsWith(text))
const output = (el: TableEl) => shadow(el).querySelector("output")

/** Play safe default moves until it's your turn in `tag` (or the hand ends). */
const until = (store: Store, tag: "Betting" | "Drawing" | "CallWindow") => {
  for (let i = 0; i < 100; i++) {
    const g: Game = store.game.get()
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

describe("<sabacc-table>", () => {
  it("deals a hand and shows your cards face up, opponents face down, and betting controls", async () => {
    const { el } = await mount()
    button(el, "Deal a hand")?.click()
    await settle(el)
    const [you, ...opponents] = seats(el)
    expect(cardLabels(you!)).toHaveLength(2)
    expect(cardLabels(you!).every((l) => !l.startsWith("Face-down"))).toBe(true)
    expect(opponents.every((s) => cardLabels(s).every((l) => l.startsWith("Face-down")))).toBe(true)
    expect(button(el, "Check") ?? button(el, "Match")).toBeDefined()
    expect(button(el, "All-in")).toBeDefined()
  })

  it("reveals every hand after a call", async () => {
    const { el, store } = await mount(5)
    store.dispatch(Command.StartHand())
    expect(until(store, "CallWindow")).toBe(true)
    await settle(el)
    button(el, "Call the hand")?.click()
    await settle(el)
    expect(store.game.get().phase._tag).toBe("Lobby")
    for (const s of seats(el).slice(1)) expect(cardLabels(s).some((l) => l.startsWith("Face-down"))).toBe(false)
    expect(output(el)?.textContent).toMatch(/win|split|bombed out/)
  })

  it("locks one card per turn in the interference field, then trades", async () => {
    const { el, store } = await mount(7)
    store.dispatch(Command.StartHand())
    expect(until(store, "Drawing")).toBe(true)
    await settle(el)
    const you = seats(el)[0]!
    button(you, "Lock")?.click()
    await settle(el)
    expect(cardLabels(seats(el)[0]!).filter((l) => l.endsWith("in the interference field"))).toHaveLength(1)
    expect([...shadow(seats(el)[0]!).querySelectorAll("button")].filter((b) => b.textContent === "Lock").every((b) => b.disabled)).toBe(true)
    button(seats(el)[0]!, "Trade")?.click()
    await settle(el)
    expect(store.log.get().some((e) => e._tag === "Traded" && e.seat === YOU)).toBe(true)
  })

  it("shows a rejected bet as a notice without changing the game", async () => {
    const { el, store } = await mount(9)
    store.dispatch(Command.StartHand())
    expect(until(store, "Betting")).toBe(true)
    const before = store.game.get()
    store.dispatch(Command.BetTo({ to: 1 }))
    await settle(el)
    expect(store.game.get()).toBe(before)
    expect(output(el)?.hasAttribute("data-error")).toBe(true)
    expect(output(el)?.textContent).toMatch(/at least [\d,]+ credits/)
  })

  it("labels folded players", async () => {
    const { el, store } = await mount(3)
    store.dispatch(Command.StartHand())
    store.dispatch(Command.Fold())
    await settle(el)
    expect(shadow(seats(el)[0]!).querySelector(".badge")?.textContent).toBe("Folded")
  })

  it("announces a Sabacc Shift without any advance warning", async () => {
    const { el, store } = await mount()
    expect(shadow(el).querySelector("meter")).toBeNull()
    store.last.set([{ event: GameEvent.Shifted({ changed: [] }), game: store.game.get() }])
    await settle(el)
    expect(shadow(el).querySelector("[role=alert]")?.textContent).toContain("Sabacc Shift")
  })

  it("flashes the shift alert at most 2 times a second, and only without reduced motion", async () => {
    const { el } = await mount()
    const text = (el.shadowRoot?.adoptedStyleSheets ?? []).flatMap((sheet) => [...sheet.cssRules].map((r) => r.cssText)).join("\n")
    const gate = text.indexOf("@media (prefers-reduced-motion: no-preference)")
    // Chromium writes the shorthand duration first ("animation: 0.5s ease-in-out 3 flash").
    const anims = [...text.matchAll(/animation:[^;]*?(\d*\.?\d+)s\b/g)]
    expect(gate).toBeGreaterThan(-1)
    expect(anims.length).toBeGreaterThan(0)
    for (const m of anims) {
      expect(m.index ?? 0).toBeGreaterThan(gate)
      expect(Number(m[1])).toBeGreaterThanOrEqual(0.5)
    }
  })
})

describe("opponent turn playback (sabacc-jlp)", () => {
  afterEach(() => vi.useRealTimers())

  it("plays opponents' moves one at a time, narrates them, then hands control back", async () => {
    vi.useFakeTimers()
    const { el, store } = await mount(11)
    button(el, "Deal a hand")?.click()
    await settle(el, false)
    const total = store.last.get().length
    expect(total).toBeGreaterThan(2)
    expect(isPlaying(el.state.playback)).toBe(true)
    expect(button(el, "Skip ahead")).toBeDefined()
    expect(button(el, "Check") ?? button(el, "Match")).toBeUndefined()
    expect(output(el)?.textContent).toContain("New hand")
    // The log holds back moves that haven't been shown yet.
    expect(shadow(el).querySelector("sabacc-log")?.events.length).toBeLessThan(store.log.get().length)

    await vi.advanceTimersByTimeAsync(800)
    await flush()
    expect(revealed(el.state.playback).length).toBeGreaterThan(1)

    await vi.runAllTimersAsync()
    await settle(el, false)
    expect(isPlaying(el.state.playback)).toBe(false)
    expect(button(el, "Check") ?? button(el, "Match")).toBeDefined()
    expect(shadow(el).querySelector("sabacc-log")?.events.length).toBe(store.log.get().length)
  })

  it("skips straight to your turn", async () => {
    vi.useFakeTimers()
    const { el } = await mount(11)
    button(el, "Deal a hand")?.click()
    await settle(el, false)
    button(el, "Skip ahead")?.click()
    await settle(el, false)
    expect(isPlaying(el.state.playback)).toBe(false)
    expect(button(el, "Check") ?? button(el, "Match")).toBeDefined()
  })
})

describe("saved table (sabacc-3nc)", () => {
  it("greets you when your table was restored", async () => {
    const data = new Map<string, string>()
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) }
    const first = createStore(1, { storage })
    first.dispatch(Command.StartHand())
    first.dispatch(Command.Fold())
    const el = await mountOn(createStore(2, { storage }))
    await settle(el)
    expect(output(el)?.textContent).toContain("Welcome back")
    expect(shadow(el).querySelector(".seed")?.textContent).toContain("saved in this browser")
  })
})

describe("multiplayer table (sabacc-kiq)", () => {
  it("offers New table only to the host", async () => {
    // Regression: `?new-table=false` left the property's default `true` in place.
    const signal = <T>(v: T) => new Signal.State(v)
    const asGuest = (host: boolean) => ({
      ...createStore(1),
      room: {
        code: "ABC234",
        connection: signal("open" as const),
        spectator: signal(false),
        host: signal(host),
        presence: signal({ connected: [true, false, false, false, false], deadline: undefined }),
        problem: signal<string | undefined>(undefined),
        name: signal("Han"),
        join: () => {},
      },
    })
    for (const host of [true, false]) {
      const el = await mountOn(asGuest(host) as unknown as Store)
      await settle(el)
      expect(button(el, "New table") !== undefined).toBe(host)
      document.body.replaceChildren()
    }
  })
})

describe("<sabacc-card>", () => {
  it("names ranked and face cards in full, and marks field cards", async () => {
    const master = document.createElement("sabacc-card")
    master.card = Card.Suited({ id: 1, suit: "Coins", value: 14 })
    master.locked = true
    const queen = document.createElement("sabacc-card")
    queen.card = Card.Face({ id: 2, name: "Queen of Air and Darkness", value: -2 })
    document.body.append(master, queen)
    await settled()
    expect(shadow(master).querySelector("svg")?.getAttribute("aria-label")).toBe("Master of Coins (+14), in the interference field")
    expect(shadow(queen).querySelector("svg")?.getAttribute("aria-label")).toBe("Queen of Air and Darkness (-2)")
    expect(shadow(queen).querySelector("svg")?.textContent).toContain("and Darkness")
  })
})
