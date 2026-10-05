// The multiplayer server, end to end: a real HTTP server on a random port, real
// WebSocket clients (Node's built-in WebSocket), short timers.
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HttpServer } from "@effect/platform"
import { Context, Effect, Exit, Layer, Logger, Option, Schema, Scope } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { Game } from "../../src/domain/model.ts"
import { hiddenCard } from "../../src/domain/view.ts"
import { ServerMessageJson, type ClientMessage, type ServerMessage } from "../../src/protocol/messages.ts"
import { appLayer } from "../../src/server/app.ts"
import { ServerConfig, type Settings } from "../../src/server/config.ts"
import { timeoutMove } from "../../src/server/room.ts"

const staticDir = mkdtempSync(join(tmpdir(), "sabacc-static-"))
writeFileSync(join(staticDir, "index.html"), "<!doctype html><title>Sabacc</title>")

const settings = (dataDir: string): Settings => ({
  port: 0,
  dataDir,
  staticDir,
  turnMs: 2500,
  graceMs: 400,
  autoDealMs: 60_000,
  heartbeatMs: 60_000,
  idleCloseMs: 60_000,
  deleteAfterMs: 86_400_000,
  roomsPerIpPerHour: 1000,
})

interface Running {
  readonly base: string
  readonly stop: () => Promise<void>
}

const start = async (s: Settings): Promise<Running> => {
  const scope = Effect.runSync(Scope.make())
  const layer = appLayer(0).pipe(Layer.provide(Layer.succeed(ServerConfig, s)), Layer.provide(Logger.replace(Logger.defaultLogger, Logger.none)))
  const ctx = await Effect.runPromise(Layer.buildWithScope(layer, scope))
  const address = Context.get(ctx, HttpServer.HttpServer).address
  const port = address._tag === "TcpAddress" ? address.port : 0
  return { base: `127.0.0.1:${port}`, stop: () => Effect.runPromise(Scope.close(scope, Exit.void)) }
}

/** A test player: a WebSocket that records every decoded message. */
class Client {
  readonly messages: Array<ServerMessage> = []
  private readonly ws: WebSocket
  readonly open: Promise<void>
  constructor(base: string) {
    this.ws = new WebSocket(`ws://${base}/ws`)
    this.open = new Promise((resolve) => this.ws.addEventListener("open", () => resolve()))
    this.ws.addEventListener("message", (e) => this.messages.push(Schema.decodeUnknownSync(ServerMessageJson)(String(e.data))))
  }
  send(m: ClientMessage | string): void {
    this.ws.send(typeof m === "string" ? m : JSON.stringify(m))
  }
  close(): void {
    this.ws.close()
  }
  /** The first message (after `from`) matching `pick`, waiting up to `ms`. */
  async waitFor<T extends ServerMessage>(pick: (m: ServerMessage) => m is T, ms = 6000, from = 0): Promise<T> {
    const end = Date.now() + ms
    for (;;) {
      const hit = this.messages.slice(from).find(pick)
      if (hit !== undefined) return hit
      if (Date.now() > end) throw new Error(`timed out; got ${this.messages.map((m) => m._tag).join(", ")}`)
      await new Promise((r) => setTimeout(r, 20))
    }
  }
  /** The latest game this player has been shown. */
  get game(): Game | undefined {
    const last = [...this.messages].reverse().find((m) => m._tag === "Update" || m._tag === "Snapshot")
    return last === undefined ? undefined : (last as { game: Game }).game
  }
}

const tag = <K extends ServerMessage["_tag"]>(k: K) => (m: ServerMessage): m is Extract<ServerMessage, { _tag: K }> => m._tag === k

const newRoom = async (base: string): Promise<string> => {
  const res = await fetch(`http://${base}/api/rooms`, { method: "POST" })
  expect(res.status).toBe(201)
  return ((await res.json()) as { room: string }).room
}

const sit = async (base: string, room: string, name: string, token?: string) => {
  const c = new Client(base)
  await c.open
  c.send({ _tag: "Join", room, name, ...(token ? { token } : {}) })
  const welcome = await c.waitFor(tag("Welcome"))
  await c.waitFor(tag("Snapshot"))
  return { c, welcome }
}

/** Seat 0 is always the viewer: is it my turn in this game? */
const myTurn = (g: Game | undefined) => g?.phase._tag === "Playing" && g.phase.step.toAct[0] === 0

/** Everyone plays safe moves whenever it's their turn, until the hand ends. */
const playOut = async (players: ReadonlyArray<Client>) => {
  for (let i = 0; i < 200; i++) {
    if (players.every((p) => p.game?.phase._tag === "Lobby")) return
    for (const p of players) {
      const g = p.game
      if (!myTurn(g) || g?.phase._tag !== "Playing") continue
      const step = g.phase.step
      const me = g.seats[0]!
      const command = step._tag === "Betting" ? (step.currentBet > me.roundBet ? "Fold" : "Check") : step._tag === "Drawing" ? "Stand" : "CallHand"
      const n = p.messages.length
      p.send({ _tag: "Act", command: { _tag: command } })
      await p.waitFor((m): m is ServerMessage => m._tag === "Update" || m._tag === "Rejected", 6000, n)
    }
    await new Promise((r) => setTimeout(r, 10))
  }
}

let server: Running
const dataDir = mkdtempSync(join(tmpdir(), "sabacc-data-"))
beforeAll(async () => {
  server = await start(settings(dataDir))
})
afterAll(async () => {
  await server.stop()
})

describe("multiplayer server", () => {
  it("serves the site and a health check, and refuses paths outside it", async () => {
    expect(await (await fetch(`http://${server.base}/healthz`)).text()).toBe("ok")
    expect((await fetch(`http://${server.base}/`)).status).toBe(200)
    expect((await fetch(`http://${server.base}/%2e%2e/%2e%2e/etc/passwd`)).status).toBe(404)
  })

  it("seats two people, shows each only their own cards, and plays a hand", async () => {
    const room = await newRoom(server.base)
    const han = await sit(server.base, room, "Han")
    const lando = await sit(server.base, room, "Lando")
    expect(han.welcome.host).toBe(true)
    expect(lando.welcome.host).toBe(false)
    expect(lando.welcome.spectator).toBe(false)
    expect(lando.c.game?.seats[0]?.name).toBe("Lando")

    const before = lando.c.messages.length
    han.c.send({ _tag: "Act", command: { _tag: "StartHand" } })
    await lando.c.waitFor(tag("Update"), 3000, before)
    const seen = lando.c.game!
    const hanSeat = seen.seats.find((s) => s.name === "Han")!
    for (const c of hanSeat.hand) expect(c).toEqual({ ...hiddenCard(c.id) })
    expect(seen.seats[0]!.hand.length).toBe(2)
    if (seen.phase._tag === "Playing") expect(seen.phase.deck.every((c) => c.id < 0)).toBe(true)

    await playOut([han.c, lando.c])
    expect(han.c.game?.phase._tag).toBe("Lobby")
    // Regression: the turn clock kept showing after the hand ended.
    await new Promise((r) => setTimeout(r, 200))
    const latest = [...han.c.messages].reverse().find((m) => m._tag === "Update" || m._tag === "PresenceChanged") as { presence: { deadline: Option.Option<unknown> } }
    expect(Option.isNone(latest.presence.deadline)).toBe(true)
    han.c.close()
    lando.c.close()
  })

  it("doesn't lock up a table when players leave between hands", async () => {
    // Regression: the next-hand timer, started while a connection closed, couldn't be
    // cancelled, so the room's lock was held for the whole auto-deal delay.
    const room = await newRoom(server.base)
    const han = await sit(server.base, room, "Han")
    const lando = await sit(server.base, room, "Lando")
    han.c.send({ _tag: "Act", command: { _tag: "StartHand" } })
    await han.c.waitFor(tag("Update"))
    await lando.c.waitFor(tag("Update"))
    await playOut([han.c, lando.c])
    lando.c.close()
    await new Promise((r) => setTimeout(r, 100))
    han.c.close()
    await new Promise((r) => setTimeout(r, 100))
    const t0 = Date.now()
    const chewie = await sit(server.base, room, "Chewie")
    expect(Date.now() - t0).toBeLessThan(2000)
    chewie.c.close()
  })

  it("refuses a move out of turn, and a spectator's move", async () => {
    const room = await newRoom(server.base)
    const han = await sit(server.base, room, "Han")
    const n = han.c.messages.length
    han.c.send({ _tag: "Act", command: { _tag: "Check" } })
    const rejected = await han.c.waitFor(tag("Rejected"), 3000, n)
    expect(rejected.error._tag).toBe("NotYourTurn")
    han.c.close()
  })

  it("lets a sixth visitor watch with every hand hidden", async () => {
    const room = await newRoom(server.base)
    const players = await Promise.all(["A", "B", "C", "D", "E"].map((name) => sit(server.base, room, name)))
    players[0]!.c.send({ _tag: "Act", command: { _tag: "StartHand" } })
    await players[0]!.c.waitFor(tag("Update"))
    const watcher = await sit(server.base, room, "Watcher")
    expect(watcher.welcome.spectator).toBe(true)
    const g = watcher.c.game!
    for (const s of g.seats) for (const c of s.hand) expect(c).toEqual(hiddenCard(c.id))
    const n = watcher.c.messages.length
    watcher.c.send({ _tag: "Act", command: { _tag: "Fold" } })
    expect((await watcher.c.waitFor(tag("Problem"), 3000, n)).reason).toBe("not-allowed")
    for (const p of [...players, watcher]) p.c.close()
  })

  it("hands a dropped seat to the AI after the grace period, and gives it back on rejoin", async () => {
    const room = await newRoom(server.base)
    const han = await sit(server.base, room, "Han")
    const lando = await sit(server.base, room, "Lando")
    const token = lando.welcome.token
    const n = han.c.messages.length
    lando.c.close()
    const update = await han.c.waitFor(tag("Update"), 3000, n)
    expect(update.beats.some((b) => b.event._tag === "Seated" && b.event.controller === "Ai" && b.event.name === "Lando")).toBe(true)
    const back = await sit(server.base, room, "Lando", token)
    expect(back.welcome.spectator).toBe(false)
    expect(back.c.game?.seats[0]?.controller).toBe("Human")
    expect(back.c.game?.seats[0]?.name).toBe("Lando")
    han.c.close()
    back.c.close()
  })

  it("plays a safe move for a player who runs out of time", async () => {
    const room = await newRoom(server.base)
    const han = await sit(server.base, room, "Han")
    const lando = await sit(server.base, room, "Lando")
    han.c.send({ _tag: "Act", command: { _tag: "StartHand" } })
    await han.c.waitFor(tag("Update"))
    await lando.c.waitFor(tag("Update"))
    const whose = [han, lando].find((p) => myTurn(p.c.game))!
    const presence = [...whose.c.messages].reverse().find((m) => m._tag === "Update" || m._tag === "PresenceChanged") as { presence: { deadline: Option.Option<{ seat: number }> } }
    expect(Option.isSome(presence.presence.deadline)).toBe(true)
    const n = whose.c.messages.length
    const timedOut = await whose.c.waitFor((m): m is ServerMessage => m._tag === "Update" && m.beats.some((b) => "seat" in b.event && b.event.seat === 0), 8000, n)
    expect(timedOut._tag).toBe("Update")
    han.c.close()
    lando.c.close()
  })

  it("answers nonsense and unknown rooms with a problem, not a crash", async () => {
    const c = new Client(server.base)
    await c.open
    c.send("{nope")
    expect((await c.waitFor(tag("Problem"))).reason).toBe("bad-message")
    c.send({ _tag: "Join", room: "ZZZZZZ", name: "Han" })
    expect((await c.waitFor((m): m is Extract<ServerMessage, { _tag: "Problem" }> => m._tag === "Problem" && m.reason === "no-such-room")).reason).toBe("no-such-room")
    c.close()
  })

  it("keeps a room and its seats across a restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sabacc-restart-"))
    const first = await start(settings(dir))
    const room = await newRoom(first.base)
    const han = await sit(first.base, room, "Han")
    han.c.send({ _tag: "Act", command: { _tag: "StartHand" } })
    await han.c.waitFor(tag("Update"))
    const credits = han.c.game?.seats[0]?.credits
    han.c.close()
    await first.stop()
    const second = await start(settings(dir))
    const back = await sit(second.base, room, "Han", han.welcome.token)
    expect(back.welcome.spectator).toBe(false)
    expect(back.c.game?.seats[0]?.credits).toBe(credits)
    back.c.close()
    await second.stop()
  })
})

describe("the turn clock's move", () => {
  it("checks when nothing is owed, folds when something is, stands, and passes", async () => {
    const { newTable, setStep, updateSeat } = await import("../../src/domain/table.ts")
    const { Command, Phase, Step } = await import("../../src/domain/model.ts")
    const at = (step: Parameters<typeof setStep>[1]) =>
      setStep({ ...newTable(), phase: Phase.Playing({ deck: [], round: 1, step: Step.CallWindow({ toAct: [] }), nextCardId: 0 }) }, step)
    expect(timeoutMove(newTable(), 0)).toBeUndefined()
    expect(timeoutMove(at(Step.Betting({ toAct: [0], currentBet: 0, minRaise: 100 })), 0)).toEqual(Command.Check())
    expect(timeoutMove(updateSeat(at(Step.Betting({ toAct: [0], currentBet: 300, minRaise: 100 })), 0, (s) => s), 0)).toEqual(Command.Fold())
    expect(timeoutMove(at(Step.Drawing({ toAct: [0], lockedThisTurn: false })), 0)).toEqual(Command.Stand())
    expect(timeoutMove(at(Step.CallWindow({ toAct: [0] })), 0)).toEqual(Command.Pass())
    expect(timeoutMove(at(Step.CallWindow({ toAct: [1] })), 0)).toBeUndefined()
  })
})
