import { Option, Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Command, GameEvent } from "../../src/domain/model.ts"
import { newTable } from "../../src/domain/table.ts"
import { ServerMessageJson, type ServerMessage } from "../../src/protocol/messages.ts"
import { createRemoteStore, NAME_KEY, type SocketLike } from "../../src/state/remote-store.ts"
import type { KeyValueStore } from "../../src/state/persistence.ts"

const memory = (init: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map(Object.entries(init))
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}

class FakeSocket implements SocketLike {
  sent: Array<unknown> = []
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.closed = true
  }
  deliver(m: ServerMessage) {
    this.onmessage?.({ data: Schema.encodeSync(ServerMessageJson)(m) })
  }
}

const presence = { connected: [true, false, true, false, false], deadline: Option.some({ seat: 2, remainingMs: 30_000 }) }

const setup = (storage = memory({ [NAME_KEY]: "Han" })) => {
  const sockets: Array<FakeSocket> = []
  const store = createRemoteStore({
    room: "ABC234",
    storage: Option.some(storage),
    connect: () => {
      const s = new FakeSocket()
      sockets.push(s)
      return s
    },
    backoff: () => 50,
  })
  return { store, sockets, storage, room: store.room! }
}

afterEach(() => vi.useRealTimers())

describe("createRemoteStore", () => {
  it("asks for a name first, remembers it, then joins", () => {
    const { store, sockets, storage, room } = setup(memory())
    expect(room.connection.get()).toBe("naming")
    expect(sockets).toHaveLength(0)
    room.join("  Han  ")
    expect(storage.data.get(NAME_KEY)).toBe("Han")
    sockets[0]!.onopen?.()
    expect(sockets[0]!.sent[0]).toEqual({ _tag: "Join", room: "ABC234", name: "Han" })
    expect(store.seed).toBe(0)
  })

  it("rejoins with the seat token from an earlier visit", () => {
    const { sockets } = setup(memory({ [NAME_KEY]: "Han", "sabacc:room:ABC234": "tok" }))
    sockets[0]!.onopen?.()
    expect(sockets[0]!.sent[0]).toEqual({ _tag: "Join", room: "ABC234", name: "Han", token: "tok" })
  })

  it("fills the same signals the views read, from the server's messages", () => {
    const { store, sockets, storage, room } = setup()
    const s = sockets[0]!
    s.onopen?.()
    s.deliver({ _tag: "Welcome", room: "ABC234", token: "secret", spectator: false, host: true })
    expect(storage.data.get("sabacc:room:ABC234")).toBe("secret")
    expect(room.host.get()).toBe(true)
    const game = newTable()
    s.deliver({ _tag: "Snapshot", game, log: [GameEvent.TableReset()], presence })
    expect(store.log.get()).toHaveLength(1)
    expect(room.presence.get().deadline?.seat).toBe(2)
    expect(room.presence.get().deadline!.at).toBeGreaterThan(Date.now())
    s.deliver({ _tag: "Update", game, beats: [{ event: GameEvent.Folded({ seat: 2 }), game }], presence })
    expect(store.last.get()).toHaveLength(1)
    expect(store.log.get().map((e) => e._tag)).toEqual(["TableReset", "Folded"])
  })

  it("sends moves up and shows a refusal as a notice", () => {
    const { store, sockets } = setup()
    const s = sockets[0]!
    s.onopen?.()
    store.dispatch(Command.BetTo({ to: 300 }))
    expect(s.sent[1]).toEqual({ _tag: "Act", command: { _tag: "BetTo", to: 300 } })
    store.dispatch(Command.Control({ seat: 1, controller: "Ai", name: "x" }))
    expect(s.sent).toHaveLength(2)
    s.deliver({ _tag: "Rejected", error: { _tag: "InvalidBet", reason: "Too small." } })
    expect(Option.map(store.notice.get(), (e) => e._tag)).toEqual(Option.some("InvalidBet"))
  })

  it("reconnects after a drop, and stops for a table that no longer exists", async () => {
    vi.useFakeTimers()
    const { sockets, room } = setup()
    sockets[0]!.onopen?.()
    sockets[0]!.onclose?.()
    expect(room.connection.get()).toBe("reconnecting")
    await vi.advanceTimersByTimeAsync(60)
    expect(sockets).toHaveLength(2)
    sockets[1]!.onopen?.()
    sockets[1]!.deliver({ _tag: "Problem", reason: "no-such-room", message: "Gone." })
    expect(room.connection.get()).toBe("gone")
    sockets[1]!.onclose?.()
    await vi.advanceTimersByTimeAsync(200)
    expect(sockets).toHaveLength(2)
  })
})
