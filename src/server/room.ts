// One table on the server. It owns the authoritative game, runs every command through
// the same `applyCommand` the browser uses (one at a time, under a lock), and sends each
// connection only its own view (`transitionFor`). Timers live here: the turn clock, the
// disconnect grace period and the pause before the next hand.
import { createHash, randomBytes } from "node:crypto"
import { Duration, Effect, Either, Fiber, Option, Random } from "effect"
import { BUY_IN } from "../domain/constants.ts"
import { applyCommand } from "../domain/engine.ts"
import { Command, type Game, type GameError, type GameEvent, type Transition } from "../domain/model.ts"
import { playing } from "../domain/table.ts"
import { eventFor, rotate, transitionFor, viewFor } from "../domain/view.ts"
import { fromGameError, type PlayerCommand, type ServerMessage, asCommand } from "../protocol/messages.ts"
import type { Settings } from "./config.ts"
import type { Claim, RoomDb, SavedRoom } from "./db.ts"

/** A browser connection, as the room sees it. */
export interface Conn {
  readonly id: number
  readonly send: (message: ServerMessage) => Effect.Effect<void>
}

interface Member {
  readonly conn: Conn
  /** The table seat this connection plays; undefined for a spectator. */
  readonly seat: number | undefined
}

const LOG_LIMIT = 300
/** Seats in the order new players get them, spread round the table. */
const SEAT_ORDER = [0, 2, 3, 1, 4]

/**
 * Start a timer fiber. Always interruptible: a timer started from a finalizer (a
 * connection closing) would otherwise inherit uninterruptibility, and cancelling it
 * would wait out the whole delay while holding the room's lock.
 */
const timer = <A>(effect: Effect.Effect<A>) => Effect.forkDaemon(Effect.interruptible(effect))

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("base64url")
const newToken = (): string => randomBytes(24).toString("base64url")

/** The move the clock makes for a player who runs out of time. */
export const timeoutMove = (game: Game, seat: number): Command | undefined => {
  const p = Option.getOrUndefined(playing(game))
  if (p === undefined || p.step.toAct[0] !== seat) return undefined
  const s = game.seats[seat]
  switch (p.step._tag) {
    case "Betting":
      return s !== undefined && p.step.currentBet > s.roundBet ? Command.Fold() : Command.Check()
    case "Drawing":
      return Command.Stand()
    case "CallWindow":
      return Command.Pass()
  }
}

export interface RoomDeps {
  readonly settings: Settings
  readonly db: RoomDb
}

export class Room {
  private game: Game
  private log: Array<GameEvent> = []
  private readonly claims: Array<Claim | null>
  private host: number
  private readonly created: number
  private readonly members = new Map<number, Member>()
  private readonly grace = new Map<number, Fiber.RuntimeFiber<void>>()
  private turn: { readonly seat: number; readonly at: number; readonly fiber: Fiber.RuntimeFiber<void> } | undefined
  private deal: Fiber.RuntimeFiber<void> | undefined
  /** Bumped on every change, so a timer that fires late can tell it's stale. */
  private version = 0
  private readonly random: Random.Random
  private readonly lock = Effect.unsafeMakeSemaphore(1)
  readonly code: string
  lastActivity: number
  private readonly deps: RoomDeps

  // No parameter properties: the server runs on Node's type stripping.
  constructor(saved: SavedRoom, deps: RoomDeps) {
    this.deps = deps
    this.code = saved.code
    this.game = saved.game
    this.claims = [...saved.claims]
    this.host = saved.host
    this.created = saved.created
    this.lastActivity = Date.now()
    this.random = Random.make(randomBytes(4).readUInt32LE(0))
  }

  get connections(): number {
    return this.members.size
  }

  /** Sit down (a token reclaims your seat), or watch if the table is full. */
  join(conn: Conn, name: string, token: string | undefined): Effect.Effect<void> {
    return this.lock.withPermits(1)(
      Effect.gen(this, function* () {
        const hash = token === undefined ? undefined : hashToken(token)
        let seat: number | undefined = hash === undefined ? -1 : this.claims.findIndex((c) => c?.tokenHash === hash)
        let issued = token ?? ""
        if (seat === -1) {
          const free = SEAT_ORDER.find((i) => i < this.game.seats.length && this.claims[i] === null)
          if (free !== undefined) {
            issued = newToken()
            this.claims[free] = { tokenHash: hashToken(issued), name: this.uniqueName(name, free) }
            if (this.host < 0) this.host = free
          }
          seat = free
        } else {
          const claim = this.claims[seat]
          if (claim) this.claims[seat] = { ...claim, name: this.uniqueName(name, seat) }
        }
        this.members.set(conn.id, { conn, seat })
        this.lastActivity = Date.now()

        let changed = false
        if (seat !== undefined) {
          yield* this.cancelGrace(seat)
          const claimName = this.claims[seat]?.name ?? name
          const current = this.game.seats[seat]
          if (current?.controller !== "Human" || current.name !== claimName) {
            const t = yield* this.apply(Command.Control({ seat, controller: "Human", name: claimName }), seat)
            // Everyone else sees the seat change as a move; the newcomer gets the result in its snapshot.
            if (Either.isRight(t)) {
              yield* this.commit(t.right, conn.id)
              changed = true
            }
          }
        }
        yield* conn.send({ _tag: "Welcome", room: this.code, token: issued, spectator: seat === undefined, host: seat === this.host })
        yield* conn.send({
          _tag: "Snapshot",
          game: viewFor(this.game, seat),
          log: this.log.map((e) => eventFor(e, seat, this.game.seats.length)),
          presence: this.presenceFor(seat),
        })
        if (!changed) yield* this.broadcastPresence(conn.id)
        yield* this.save()
        yield* this.schedule()
      }),
    )
  }

  /** A player's move, checked by the engine; a refusal goes back to that player only. */
  act(connId: number, command: PlayerCommand): Effect.Effect<void> {
    return this.lock.withPermits(1)(
      Effect.gen(this, function* () {
        const member = this.members.get(connId)
        if (member === undefined) return
        const seat = member.seat
        if (seat === undefined) return yield* member.conn.send({ _tag: "Problem", reason: "not-allowed", message: "Spectators can't play." })
        if (command._tag === "NewTable" && (seat !== this.host || this.game.phase._tag !== "Lobby"))
          return yield* member.conn.send({ _tag: "Problem", reason: "not-allowed", message: "Only the host can start a new table, between hands." })
        this.lastActivity = Date.now()
        const r = yield* this.apply(asCommand(command), seat)
        yield* Either.match(r, {
          onLeft: (error) => member.conn.send({ _tag: "Rejected", error: fromGameError(error) }),
          onRight: (t) => this.commit(t),
        })
        yield* this.save()
        yield* this.schedule()
      }),
    )
  }

  /** A connection closed. The seat stays yours for the grace period, then the AI plays it. */
  leave(connId: number): Effect.Effect<void> {
    return this.lock.withPermits(1)(
      Effect.gen(this, function* () {
        const member = this.members.get(connId)
        this.members.delete(connId)
        this.lastActivity = Date.now()
        if (member?.seat !== undefined && !this.isConnected(member.seat)) yield* this.startGrace(member.seat)
        yield* this.broadcastPresence()
        yield* this.schedule()
      }),
    )
  }

  /** People's seats that nobody is connected to get the grace period (after a restart). */
  wake(): Effect.Effect<void> {
    return this.lock.withPermits(1)(
      Effect.gen(this, function* () {
        for (const s of this.game.seats) if (s.controller === "Human" && !this.isConnected(s.index)) yield* this.startGrace(s.index)
        yield* this.schedule()
      }),
    )
  }

  /** Stop every timer (the room is leaving memory or the server is stopping). */
  close(): Effect.Effect<void> {
    return Effect.gen(this, function* () {
      // A closed room never changes or saves again: a newer copy may be loaded elsewhere.
      this.closed = true
      for (const f of this.grace.values()) yield* Fiber.interrupt(f)
      this.grace.clear()
      if (this.turn) yield* Fiber.interrupt(this.turn.fiber)
      if (this.deal) yield* Fiber.interrupt(this.deal)
      this.turn = undefined
      this.deal = undefined
    })
  }

  // ── internals (call with the lock held) ──────────────────────────────────────

  private apply(command: Command, seat: number): Effect.Effect<Either.Either<Transition, GameError>> {
    return Effect.either(applyCommand(this.game, command, seat).pipe(Effect.withRandom(this.random)))
  }

  private commit(t: Transition, skip?: number): Effect.Effect<void> {
    this.game = t.game
    this.log = [...this.log, ...t.beats.map((b) => b.event)].slice(-LOG_LIMIT)
    this.version++
    return Effect.forEach(
      [...this.members.values()].filter((m) => m.conn.id !== skip),
      (m) => {
        const seen = transitionFor(t, m.seat)
        return m.conn.send({ _tag: "Update", game: seen.game, beats: seen.beats, presence: this.presenceFor(m.seat) })
      },
      { discard: true },
    )
  }

  private broadcastPresence(skip?: number): Effect.Effect<void> {
    return Effect.forEach(
      [...this.members.values()].filter((m) => m.conn.id !== skip),
      (m) => m.conn.send({ _tag: "PresenceChanged", presence: this.presenceFor(m.seat) }),
      { discard: true },
    )
  }

  private isConnected(seat: number): boolean {
    return [...this.members.values()].some((m) => m.seat === seat)
  }

  /** Who is connected, and whose clock is running, in `viewer`'s seat numbering. */
  private presenceFor(viewer: number | undefined) {
    const lens = { viewer, seats: this.game.seats.length }
    const connected = this.game.seats.map(() => false)
    for (const s of this.game.seats) connected[rotate(lens, s.index)] = this.isConnected(s.index)
    return {
      connected,
      deadline: Option.fromNullable(this.turn).pipe(
        Option.map((t) => ({ seat: rotate(lens, t.seat), remainingMs: Math.max(0, Math.round(t.at - Date.now())) })),
      ),
    }
  }

  private uniqueName(name: string, seat: number): string {
    const taken = new Set(this.claims.flatMap((c, i) => (c !== null && i !== seat ? [c.name] : [])))
    if (!taken.has(name)) return name
    let n = 2
    while (taken.has(`${name} ${n}`)) n++
    return `${name} ${n}`
  }

  private startGrace(seat: number): Effect.Effect<void> {
    return Effect.gen(this, function* () {
      if (this.closed) return
      yield* this.cancelGrace(seat)
      const fiber = yield* timer(
        Effect.sleep(Duration.millis(this.deps.settings.graceMs)).pipe(
          Effect.zipRight(
            this.lock.withPermits(1)(
              Effect.gen(this, function* () {
                this.grace.delete(seat)
                const s = this.game.seats[seat]
                if (this.closed || this.isConnected(seat) || s?.controller !== "Human") return
                const r = yield* this.apply(Command.Control({ seat, controller: "Ai", name: s.name }), seat)
                if (Either.isRight(r)) yield* this.commit(r.right)
                yield* this.save()
                yield* this.schedule()
              }),
            ),
          ),
        ),
      )
      this.grace.set(seat, fiber)
    })
  }

  private cancelGrace(seat: number): Effect.Effect<void> {
    const f = this.grace.get(seat)
    this.grace.delete(seat)
    return f === undefined ? Effect.void : Fiber.interrupt(f)
  }

  /** Restart the turn clock and the next-hand timer for the table as it now stands. */
  private schedule(): Effect.Effect<void> {
    return Effect.gen(this, function* () {
      if (this.closed) return
      const previous = this.turn
      if (this.deal) yield* Fiber.interrupt(this.deal)
      this.deal = undefined
      const version = this.version
      const p = Option.getOrUndefined(playing(this.game))
      const head = p?.step.toAct[0]
      const seat = head === undefined ? undefined : this.game.seats[head]
      if (seat !== undefined && seat.controller === "Human" && this.isConnected(seat.index)) {
        // Same player, same move pending: keep their clock running.
        if (previous && previous.seat === seat.index && previous.at > Date.now() && this.turnVersion === version) return
        if (previous) yield* Fiber.interrupt(previous.fiber)
        const ms = this.deps.settings.turnMs
        const fiber = yield* timer(Effect.sleep(Duration.millis(ms)).pipe(Effect.zipRight(this.timeout(seat.index, version))))
        this.turn = { seat: seat.index, at: Date.now() + ms, fiber }
        this.turnVersion = version
        yield* this.broadcastPresence()
        return
      }
      if (previous) {
        yield* Fiber.interrupt(previous.fiber)
        this.turn = undefined
        // The clock stopped (the hand ended, or it's the AI's move): say so.
        yield* this.broadcastPresence()
      }
      const last = this.game.phase._tag === "Lobby" ? Option.getOrUndefined(this.game.phase.lastHand) : undefined
      const dealer = this.game.seats.find((s) => s.credits >= BUY_IN && (s.controller === "Ai" || this.isConnected(s.index)))
      const canPlay = this.game.seats.filter((s) => s.credits >= BUY_IN).length >= 2
      if (last !== undefined && this.members.size > 0 && dealer !== undefined && canPlay)
        this.deal = yield* timer(
          Effect.sleep(Duration.millis(this.deps.settings.autoDealMs)).pipe(
            Effect.zipRight(this.lock.withPermits(1)(this.whenCurrent(version, Command.StartHand(), dealer.index))),
          ),
        )
    })
  }

  private turnVersion = -1
  private closed = false

  private timeout(seat: number, version: number): Effect.Effect<void> {
    return this.lock.withPermits(1)(
      Effect.suspend(() => {
        const move = timeoutMove(this.game, seat)
        return move === undefined ? Effect.void : this.whenCurrent(version, move, seat)
      }),
    )
  }

  /** Apply a timer's move only if nothing else happened since it was set. */
  private whenCurrent(version: number, command: Command, seat: number): Effect.Effect<void> {
    return Effect.gen(this, function* () {
      // This runs on the timer's own fiber: forget it first so `schedule` never
      // interrupts (and waits on) itself. The commit below reports the clock as stopped.
      this.turn = undefined
      this.deal = undefined
      if (version !== this.version || this.closed) return
      const r = yield* this.apply(command, seat)
      if (Either.isRight(r)) yield* this.commit(r.right)
      yield* this.save()
      yield* this.schedule()
    })
  }

  private save(): Effect.Effect<void> {
    if (this.closed) return Effect.void
    return this.deps.db.save({ code: this.code, game: this.game, claims: this.claims, host: this.host, created: this.created, updated: Date.now() })
  }
}
