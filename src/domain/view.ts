// What one player may see (multiplayer). The server sends every client only its
// view: other players' cards and the deck are replaced by placeholders, and seats are
// rotated so the viewer is always seat 0 (YOU), which lets every UI stay as it is.
// A spectator (viewer undefined) sees no hidden cards and no rotation.
import { Option } from "effect"
import { Card } from "./cards.ts"
import { Phase, Step, GameEvent, type Beat, type Game, type HandResult, type Seat, type Transition } from "./model.ts"

/**
 * A card the viewer may not see. The id is kept (cards are tracked by id), the design
 * is a fixed placeholder that the views never show face up.
 */
export const hiddenCard = (id: number): Card => Card.Face({ id, name: "The Idiot", value: 0 })

/** Seats whose hands were shown at the last reveal (folded hands stay hidden). */
const shownAtReveal = (game: Game): ReadonlySet<number> => {
  const last = game.phase._tag === "Lobby" ? Option.getOrUndefined(game.phase.lastHand) : undefined
  return last !== undefined && last.revealed ? new Set(last.seats.filter((r) => Option.isSome(r.evaluation)).map((r) => r.seat)) : new Set()
}

export interface Lens {
  readonly viewer: number | undefined
  readonly seats: number
}

/** Seat index as the viewer sees it. */
export const rotate = (lens: Lens, seat: number): number =>
  lens.viewer === undefined ? seat : (((seat - lens.viewer) % lens.seats) + lens.seats) % lens.seats

/** Inverse of `rotate`: a seat in the viewer's numbering back to the table's. */
export const unrotate = (lens: Lens, seat: number): number =>
  lens.viewer === undefined ? seat : (seat + lens.viewer) % lens.seats

const rotateAll = (lens: Lens, seats: ReadonlyArray<number>): ReadonlyArray<number> => seats.map((s) => rotate(lens, s))

const rotateResult = (lens: Lens, r: HandResult): HandResult => ({
  ...r,
  winners: rotateAll(lens, r.winners),
  caller: Option.map(r.caller, (s) => rotate(lens, s)),
  seats: [...r.seats.map((s) => ({ ...s, seat: rotate(lens, s.seat) }))].sort((a, b) => a.seat - b.seat),
})

const rotateStep = (lens: Lens, step: Step): Step =>
  Step.$match(step, {
    Betting: (b) => Step.Betting({ ...b, toAct: rotateAll(lens, b.toAct) }),
    Drawing: (d) => Step.Drawing({ ...d, toAct: rotateAll(lens, d.toAct) }),
    CallWindow: (c) => Step.CallWindow({ toAct: rotateAll(lens, c.toAct) }),
  })

const seatView = (lens: Lens, shown: ReadonlySet<number>) => (s: Seat): Seat => ({
  ...s,
  index: rotate(lens, s.index),
  hand: s.index === lens.viewer || shown.has(s.index) ? s.hand : s.hand.map((c) => hiddenCard(c.id)),
})

/** The game as `viewer` may see it. */
export const viewFor = (game: Game, viewer: number | undefined): Game => {
  const lens: Lens = { viewer, seats: game.seats.length }
  const shown = shownAtReveal(game)
  const seats = [...game.seats.map(seatView(lens, shown))].sort((a, b) => a.index - b.index)
  const phase = Phase.$match(game.phase, {
    Lobby: (l) => Phase.Lobby({ lastHand: Option.map(l.lastHand, (r) => rotateResult(lens, r)) }),
    // The deck keeps its size; its order and contents never leave the server.
    Playing: (p) => Phase.Playing({ ...p, deck: p.deck.map((_, i) => hiddenCard(-1 - i)), step: rotateStep(lens, p.step) }),
  })
  return { ...game, seats, dealer: rotate(lens, game.dealer), phase }
}

/** An event as `viewer` may see it: other players' drawn and locked cards are hidden. */
export const eventFor = (event: GameEvent, viewer: number | undefined, seats: number): GameEvent => {
  const lens: Lens = { viewer, seats }
  const r = (seat: number) => rotate(lens, seat)
  const mine = (seat: number) => seat === viewer
  return GameEvent.$match(event, {
    TableReset: (e) => e,
    HandStarted: (e) => GameEvent.HandStarted({ dealer: r(e.dealer), seated: rotateAll(lens, e.seated) }),
    SatOut: (e) => GameEvent.SatOut({ seat: r(e.seat) }),
    RoundStarted: (e) => e,
    Checked: (e) => GameEvent.Checked({ seat: r(e.seat) }),
    BetTo: (e) => GameEvent.BetTo({ ...e, seat: r(e.seat) }),
    Matched: (e) => GameEvent.Matched({ ...e, seat: r(e.seat) }),
    WentAllIn: (e) => GameEvent.WentAllIn({ ...e, seat: r(e.seat) }),
    Folded: (e) => GameEvent.Folded({ seat: r(e.seat) }),
    Gained: (e) => GameEvent.Gained({ seat: r(e.seat), card: mine(e.seat) ? e.card : hiddenCard(e.card.id) }),
    Traded: (e) =>
      GameEvent.Traded({
        seat: r(e.seat),
        discarded: mine(e.seat) ? e.discarded : hiddenCard(e.discarded.id),
        card: mine(e.seat) ? e.card : hiddenCard(e.card.id),
      }),
    Stood: (e) => GameEvent.Stood({ seat: r(e.seat) }),
    Locked: (e) => GameEvent.Locked({ seat: r(e.seat), card: mine(e.seat) ? e.card : hiddenCard(e.card.id) }),
    Dice: (e) => e,
    Shifted: (e) => GameEvent.Shifted({ changed: e.changed.map((c) => ({ ...c, seat: r(c.seat) })) }),
    Passed: (e) => GameEvent.Passed({ seat: r(e.seat) }),
    Called: (e) => GameEvent.Called({ ...e, seat: r(e.seat) }),
    // Sudden demise cards are dealt face up at the reveal.
    SuddenDemise: (e) => GameEvent.SuddenDemise({ ...e, seat: r(e.seat) }),
    Penalty: (e) => GameEvent.Penalty({ ...e, seat: r(e.seat) }),
    HandEnded: (e) => GameEvent.HandEnded({ result: rotateResult(lens, e.result) }),
    Seated: (e) => GameEvent.Seated({ ...e, seat: r(e.seat) }),
  })
}

export const beatFor = (beat: Beat, viewer: number | undefined): Beat => ({
  event: eventFor(beat.event, viewer, beat.game.seats.length),
  game: viewFor(beat.game, viewer),
})

/** A whole transition as `viewer` may see it. */
export const transitionFor = (t: Transition, viewer: number | undefined): Transition => ({
  game: viewFor(t.game, viewer),
  beats: t.beats.map((b) => beatFor(b, viewer)),
})
