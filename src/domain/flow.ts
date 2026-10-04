// Spec "A hand, step by step": the loop that moves a hand forward until it needs
// your input or ends. Opponents act here; your commands are applied in engine.ts.
import { Effect, Either, Option, Random } from "effect"
import { decideBet, decideCall, decideDraw } from "./ai.ts"
import { DESIGNS, makeCard, type Card } from "./cards.ts"
import { CALL_FROM_ROUND, DICE_SIDES, MAX_ROUNDS } from "./constants.ts"
import { applyBet, bettingIsMoot, openBetting } from "./betting.ts"
import { GameEvent, Step, YOU, type Game, type GameEvent as Event, type Seat, type Transition } from "./model.ts"
import { lastStanding, showdown } from "./showdown.ts"
import { append, deckSize, handPot, inHand, order, playing, seatAt, setStep, takeCard, updatePlaying, updateSeat, type Playing } from "./table.ts"

export type Flow = Effect.Effect<Transition>

const then = (t: Transition, next: { readonly game: Game; readonly events: ReadonlyArray<Event> }): Transition =>
  append(t, next.game, ...next.events)

// ── Drawing ──────────────────────────────────────────────────────────────────

export const lock = (game: Game, seat: number, card: Card): Game =>
  setStep(
    updateSeat(game, seat, (s) => ({ ...s, field: [...s.field, card.id] })),
    Step.Drawing({ toAct: drawingQueue(game), lockedThisTurn: true }),
  )

const drawingQueue = (game: Game): ReadonlyArray<number> =>
  Option.match(playing(game), { onNone: () => [], onSome: (p) => (p.step._tag === "Drawing" ? p.step.toAct : []) })

/** Finish the head player's drawing turn: Gain, Trade or Stand, then pass the turn on. */
export const draw = (game: Game, seat: number, action: "gain" | "stand" | { readonly trade: Card }): Transition => {
  const passTurn = (g: Game) => setStep(g, Step.Drawing({ toAct: drawingQueue(g).filter((i) => i !== seat), lockedThisTurn: false }))
  if (action === "stand") return { game: passTurn(game), events: [GameEvent.Stood({ seat })] }
  const discarded = action === "gain" ? undefined : action.trade
  const without = discarded === undefined ? game : updateSeat(game, seat, (s) => ({ ...s, hand: s.hand.filter((c) => c.id !== discarded.id) }))
  return Option.match(takeCard(without, seat), {
    onNone: () => ({ game: passTurn(game), events: [GameEvent.Stood({ seat })] }),
    onSome: ([g, card]) => ({
      game: passTurn(g),
      events: [discarded === undefined ? GameEvent.Gained({ seat, card }) : GameEvent.Traded({ seat, discarded, card })],
    }),
  })
}

// ── Shift ────────────────────────────────────────────────────────────────────

/** Roll two dice; doubles shift every card outside the interference field [L][F PG]. */
export const shiftCheck = (game: Game): Flow =>
  Effect.gen(function* () {
    const d1 = yield* Random.nextIntBetween(1, DICE_SIDES + 1)
    const d2 = yield* Random.nextIntBetween(1, DICE_SIDES + 1)
    const dice = GameEvent.Dice({ dice: [d1, d2], shift: d1 === d2 })
    if (d1 !== d2) return { game, events: [dice] }
    const p = Option.getOrUndefined(playing(game))
    const startId = p?.nextCardId ?? 1000
    const exposed = inHand(game).map((s) => ({ seat: s.index, cards: s.hand.filter((c) => !s.field.includes(c.id)) }))
    const total = exposed.reduce((n, x) => n + x.cards.length, 0)
    const picks = yield* Effect.forEach(Array.from({ length: total }), () => Random.nextIntBetween(0, DESIGNS.length))
    const replacement = new Map(
      exposed.flatMap((x) => x.cards).map((c, i) => [c.id, makeCard(startId + i, DESIGNS[picks[i] ?? 0] ?? { _tag: "Face", name: "The Idiot", value: 0 })] as const),
    )
    const shifted = exposed.reduce(
      (g, x) => updateSeat(g, x.seat, (s) => ({ ...s, hand: s.hand.map((c) => replacement.get(c.id) ?? c) })),
      updatePlaying(game, (q) => ({ ...q, nextCardId: startId + total })),
    )
    return { game: shifted, events: [dice, GameEvent.Shifted({ changed: exposed.map((x) => ({ seat: x.seat, count: x.cards.length })) })] }
  })

// ── Calling and rounds ───────────────────────────────────────────────────────

/** A call: one last shift check, then the reveal [L][F]. */
export const callHand = (t: Transition, seat: number, forced: boolean): Flow =>
  Effect.map(shiftCheck(t.game), (s) => {
    const shifted = then(append(t, t.game, GameEvent.Called({ seat, forced })), s)
    return then(shifted, showdown(shifted.game, Option.some(seat)))
  })

const nextRound = (t: Transition, p: Playing): Flow => {
  const round = p.round + 1
  if (round > MAX_ROUNDS) {
    const caller = inHand(t.game).some((s) => s.index === t.game.dealer) ? t.game.dealer : (order(t.game)[0] ?? YOU)
    return callHand(t, caller, true)
  }
  const g = openBetting(updatePlaying(t.game, (q) => ({ ...q, round })))
  return advance(append(t, g, GameEvent.RoundStarted({ round })))
}

// ── Opponent turns ───────────────────────────────────────────────────────────

const opponentBet = (t: Transition, seat: Seat, currentBet: number, minRaise: number): Flow =>
  Effect.flatMap(decideBet(seat, { currentBet, minRaise, pot: handPot(t.game) }), (choice) => {
    const applied = applyBet(t.game, seat, choice)
    // A rejected choice falls back to the safest legal move.
    const result = Either.isRight(applied) ? applied : applyBet(t.game, seat, currentBet > seat.roundBet ? "fold" : "check")
    return Either.match(result, {
      onLeft: () => Effect.succeed(t),
      onRight: (r) => advance(append(t, r.game, r.event)),
    })
  })

const opponentDraw = (t: Transition, seat: Seat): Flow => {
  const choice = decideDraw(seat, deckSize(t.game))
  const lockCard = Option.flatMap(choice.lock, (id) => Option.fromNullable(seat.hand.find((c) => c.id === id)))
  const locked = Option.match(lockCard, {
    onNone: () => t,
    onSome: (card) => append(t, lock(t.game, seat.index, card), GameEvent.Locked({ seat: seat.index, card })),
  })
  const tradeId = typeof choice.action === "object" ? choice.action.trade : undefined
  const tradeCard = seat.hand.find((c) => c.id === tradeId)
  const action = typeof choice.action !== "object" ? choice.action : tradeCard === undefined ? ("stand" as const) : { trade: tradeCard }
  return advance(then(locked, draw(locked.game, seat.index, action)))
}

// ── The loop ─────────────────────────────────────────────────────────────────

/** Run opponents and automatic steps until it's your turn or the hand is over. */
export const advance = (t: Transition): Flow =>
  Effect.suspend(() => {
    const p = Option.getOrUndefined(playing(t.game))
    if (p === undefined) return Effect.succeed(t)
    const players = inHand(t.game)
    if (players.length === 1 && players[0] !== undefined) return Effect.succeed(then(t, lastStanding(t.game, players[0].index)))

    const step = p.step
    const head = step.toAct[0]
    const seat = head === undefined ? undefined : Option.getOrUndefined(seatAt(t.game, head))
    switch (step._tag) {
      case "Betting":
        if (seat === undefined || bettingIsMoot(t.game))
          return advance({ ...t, game: setStep(t.game, Step.Drawing({ toAct: order(t.game), lockedThisTurn: false })) })
        if (seat.status._tag !== "Active" || seat.credits === 0)
          return advance({ ...t, game: setStep(t.game, { ...step, toAct: step.toAct.slice(1) }) })
        return seat.index === YOU ? Effect.succeed(t) : opponentBet(t, seat, step.currentBet, step.minRaise)
      case "Drawing":
        if (seat === undefined)
          return Effect.flatMap(shiftCheck(t.game), (s) =>
            advance(then(t, { game: setStep(s.game, Step.CallWindow({ toAct: p.round >= CALL_FROM_ROUND ? order(s.game) : [] })), events: s.events })),
          )
        return seat.index === YOU ? Effect.succeed(t) : opponentDraw(t, seat)
      case "CallWindow":
        if (seat === undefined) return nextRound(t, p)
        if (seat.index === YOU) return Effect.succeed(t)
        return decideCall(seat, p.round)
          ? callHand(t, seat.index, false)
          : advance(append(t, setStep(t.game, { ...step, toAct: step.toAct.slice(1) }), GameEvent.Passed({ seat: seat.index })))
    }
  })
