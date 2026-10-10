// Real detach (a turn outside the document) differs from a move in the same task.
import { settled } from "@gyral/core"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Command, GameEvent } from "../../src/domain/model.ts"
import { cell } from "../../src/state/cell.ts"
import { createStore, type Presence, type Store } from "../../src/state/store.ts"
import { provideTable } from "../../src/components/table-driver.ts"
import { SabaccTable } from "../../src/components/sabacc-table.ts"
import { SabaccRoom } from "../../src/components/sabacc-room.ts"
import { Sabacc3d } from "../../src/scene/sabacc-3d.ts"
import { beatDelay, isPlaying } from "../../src/presentation/playback.ts"
import { sceneBeatDelay } from "../../src/scene/timing.ts"

const hostsFor = (store: Store) => {
  const host = document.createElement("div")
  const other = document.createElement("div")
  provideTable(host, store)
  provideTable(other, store)
  document.body.append(host, other)
  return { host, other }
}

afterEach(async () => {
  document.body.replaceChildren()
  await settled()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("component subscriptions (sabacc-jx3)", () => {
  for (const [label, Component] of [["classic table", SabaccTable], ["room panel", SabaccRoom], ["3D table", Sabacc3d]] as const) {
    it(`${label} releases its watches, catches up on reattach, and follows later changes`, async () => {
      const store = createStore(42)
      let watching = 0
      const subscribe = store.game.subscribe
      vi.spyOn(store.game, "subscribe").mockImplementation((listener) => {
        watching++
        const stop = subscribe(listener)
        return () => { watching--; stop() }
      })
      const { host, other } = hostsFor(store)
      const el = new Component()
      host.append(el)
      await settled()
      const connected = watching
      expect(connected).toBeGreaterThan(0)
      expect(el.state.table?.game.phase._tag).toBe("Lobby")
      other.append(el)
      await settled()
      expect(watching).toBe(connected)
      el.remove()
      await settled()
      expect(watching).toBe(0)
      store.dispatch(Command.StartHand())
      await settled()
      expect(el.state.table?.game.phase._tag).toBe("Lobby")
      host.append(el)
      await settled()
      expect(watching).toBe(connected)
      expect(el.state.table?.game).toBe(store.game.get())
      store.dispatch(Command.Fold())
      await settled()
      expect(el.state.table?.game).toBe(store.game.get())
    })
  }

  for (const [label, Component] of [["classic table", SabaccTable], ["3D table", Sabacc3d]] as const) {
    it(`${label} refreshes reduced motion on reattach without duplicating listeners`, async () => {
      let matches = false
      const listeners = new Set<EventListener>()
      const query = {
        get matches() { return matches },
        addEventListener: (_name: string, listener: EventListener) => { listeners.add(listener) },
        removeEventListener: (_name: string, listener: EventListener) => { listeners.delete(listener) },
      }
      vi.spyOn(window, "matchMedia").mockReturnValue(query as unknown as MediaQueryList)
      const { host, other } = hostsFor(createStore(42))
      const el = new Component()
      host.append(el)
      await settled()
      expect(el.state.reduce).toBe(false)
      expect(listeners.size).toBe(1)
      other.append(el)
      await settled()
      expect(listeners.size).toBe(1)
      el.remove()
      await settled()
      expect(listeners.size).toBe(0)
      matches = true
      host.append(el)
      await settled()
      expect(el.state.reduce).toBe(true)
      expect(listeners.size).toBe(1)
      matches = false
      for (const listener of listeners) listener(new Event("change"))
      await settled()
      expect(el.state.reduce).toBe(false)
    })
  }

  it("the room clock survives reattach, stays stable across updates and moves, and stops without a deadline", async () => {
    vi.useFakeTimers()
    const presence = cell<Presence>({ connected: [true], deadline: undefined })
    const store: Store = {
      ...createStore(42),
      room: {
        code: "ABCDEF", connection: cell("open" as const), spectator: cell(false), host: cell(true),
        presence, problem: cell<string | undefined>(undefined), name: cell("Han"), join: () => {},
      },
    }
    const intervals = vi.spyOn(window, "setInterval")
    const count = () => intervals.mock.calls.filter((args) => args[1] === 1000).length
    const { host, other } = hostsFor(store)
    const el = new SabaccRoom()
    host.append(el)
    await settled()
    expect(el.state.now).toBeUndefined()
    presence.set({ connected: [true], deadline: { seat: 0, at: Date.now() + 30_000 } })
    await settled()
    expect(el.state.now).toBeTypeOf("number")
    expect(count()).toBe(1)
    presence.set({ connected: [true], deadline: { seat: 0, at: Date.now() + 31_000 } })
    await settled()
    other.append(el)
    await settled()
    expect(count()).toBe(1)
    el.remove()
    await settled()
    const before = el.state.now!
    await vi.advanceTimersByTimeAsync(2000)
    expect(el.state.now).toBe(before)
    other.append(el)
    await settled()
    expect(count()).toBe(2)
    expect(el.state.now).toBeGreaterThan(before)
    const resumed = el.state.now!
    await vi.advanceTimersByTimeAsync(1000)
    await settled()
    expect(el.state.now).toBe(resumed + 1000)
    presence.set({ connected: [true], deadline: undefined })
    await settled()
    expect(el.state.now).toBeUndefined()
    // A reply already queued when the deadline ended must not restore the old clock.
    el.send({ _tag: "Tick", now: resumed + 1000 })
    await settled()
    expect(el.state.now).toBeUndefined()
    await vi.advanceTimersByTimeAsync(2000)
    await settled()
    expect(el.state.now).toBeUndefined()
  })
})

describe("playback recovery (sabacc-1c9)", () => {
  for (const [label, Component] of [["classic table", SabaccTable], ["3D table", Sabacc3d]] as const) {
    it(`${label} resumes an interrupted beat and completes equal-duration beats`, async () => {
      vi.useFakeTimers()
      const store = createStore(42)
      const { host, other } = hostsFor(store)
      const el = new Component()
      host.append(el)
      await settled()
      // Consecutive equal delays must still start a fresh timer for each beat.
      store.last.set(Array.from({ length: 4 }, (_, i) => ({ event: GameEvent.RoundStarted({ round: i + 1 }), game: store.game.get() })))
      await settled()
      expect(el.state.playback.shown).toBe(1)
      el.remove()
      await settled()
      await vi.advanceTimersByTimeAsync(5000)
      expect(el.state.playback.shown).toBe(1)
      host.append(el)
      await settled()
      expect(el.state.playback.shown).toBe(1)
      await vi.advanceTimersByTimeAsync(400)
      other.append(el)
      await settled()
      // An unrelated snapshot and a same-task move must not restart the beat's delay.
      store.log.set([...store.log.get()])
      await settled()
      const delay = (label === "3D table" ? sceneBeatDelay : beatDelay)(store.last.get()[0]!.event)
      await vi.advanceTimersByTimeAsync(delay - 400)
      await settled()
      expect(el.state.playback.shown).toBe(2)
      await vi.advanceTimersByTimeAsync(5000)
      await settled()
      expect(isPlaying(el.state.playback)).toBe(false)
      expect(el.state.playback.shown).toBe(4)
    })

    it(`${label} ignores stale timer replies and cancels playback for skip and reduced motion`, async () => {
      vi.useFakeTimers()
      const store = createStore(42)
      const { host } = hostsFor(store)
      const el = new Component()
      host.append(el)
      await settled()
      const beats = () => Array.from({ length: 4 }, (_, i) => ({ event: GameEvent.RoundStarted({ round: i + 1 }), game: store.game.get() }))
      store.last.set(beats())
      await settled()
      const first = el.state.playback
      const advance = { _tag: "Advance" as const, run: first.run, shown: first.shown }
      el.send(advance)
      await settled()
      expect(el.state.playback.shown).toBe(2)
      el.send(advance)
      await settled()
      expect(el.state.playback.shown).toBe(2)
      store.last.set(beats())
      await settled()
      el.send(advance)
      await settled()
      expect(el.state.playback.shown).toBe(1)
      el.send({ _tag: "Skip" })
      await settled()
      expect(isPlaying(el.state.playback)).toBe(false)
      store.last.set(beats())
      await settled()
      expect(isPlaying(el.state.playback)).toBe(true)
      el.send({ _tag: "Motion", reduce: true })
      await settled()
      expect(isPlaying(el.state.playback)).toBe(false)
      await vi.advanceTimersByTimeAsync(5000)
      await settled()
      expect(el.state.playback.shown).toBe(4)
    })
  }
})
