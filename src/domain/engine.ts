// Players' commands. Each validates, applies the acting seat's move, then lets
// `advance` run the table until a person is needed again: one command → one
// complete transition. Solo play acts as seat 0 (YOU); the server passes the seat.
import { Array, Chunk, Effect, Either, Option, Random } from "effect"
import { applyBet } from "./betting.ts"
import { fullDeck } from "./cards.ts"
import { BUY_IN, HAND_ANTE, HAND_SIZE, SABACC_ANTE } from "./constants.ts"
import { advance, callHand, draw, lock } from "./flow.ts"
import {
  Command,
  DeckEmpty,
  GameEvent,
  HandInProgress,
  InsufficientCredits,
  InvalidCard,
  NotYourTurn,
  Phase,
  SeatStatus,
  Step,
  YOU,
  type Controller,
  type Game,
  type GameError,
  type Seat,
  type Transition,
} from "./model.ts"
import { lastStanding } from "./showdown.ts"
import { clockwiseFromDealer, deckSize, newTable, playing, seatAt, setStep, takeCard, followedBy, transition, updateSeat } from "./table.ts"
import { openBetting } from "./betting.ts"

type Result = Effect.Effect<Transition, GameError>

const STEP_NAMES = { Betting: "betting", Drawing: "drawing", CallWindow: "the call window" } as const

/** The acting seat, if it's that seat's turn in the given step. */
const yourTurn = (game: Game, actor: number, tag: keyof typeof STEP_NAMES): Effect.Effect<Seat, NotYourTurn | HandInProgress> =>
  Option.match(playing(game), {
    onNone: () => Effect.fail(new NotYourTurn({ expected: "a hand in progress" })),
    onSome: (p) =>
      p.step._tag === tag && p.step.toAct[0] === actor
        ? Option.match(seatAt(game, actor), { onNone: () => Effect.fail(new NotYourTurn({ expected: "your seat" })), onSome: Effect.succeed })
        : Effect.fail(new NotYourTurn({ expected: STEP_NAMES[p.step._tag] })),
  })

const yourCard = (seat: Seat, cardId: number) =>
  Option.match(Option.fromNullable(seat.hand.find((c) => c.id === cardId)), {
    onNone: () => Effect.fail(new InvalidCard({ reason: "That card isn't in your hand." })),
    onSome: (card) =>
      seat.field.includes(card.id) ? Effect.fail(new InvalidCard({ reason: "That card is locked in the interference field." })) : Effect.succeed(card),
  })

const startHand = (game: Game, actor: number): Result =>
  Effect.gen(function* () {
    if (game.phase._tag !== "Lobby") return yield* Effect.fail(new HandInProgress())
    const available = Option.match(seatAt(game, actor), { onNone: () => 0, onSome: (s) => s.credits })
    if (available < BUY_IN) return yield* Effect.fail(new InsufficientCredits({ needed: BUY_IN, available }))

    const dealer = (game.dealer + 1) % game.seats.length
    const seated = game.seats.filter((s) => s.credits >= BUY_IN).map((s) => s.index)
    const deck = Chunk.toReadonlyArray(yield* Random.shuffle(fullDeck))
    const anted: Game = {
      ...game,
      dealer,
      sabaccPot: game.sabaccPot + SABACC_ANTE * seated.length,
      seats: game.seats.map((s) => ({
        ...s,
        hand: [],
        field: [],
        roundBet: 0,
        committed: seated.includes(s.index) ? HAND_ANTE : 0,
        credits: seated.includes(s.index) ? s.credits - BUY_IN : s.credits,
        status: seated.includes(s.index) ? SeatStatus.Active() : SeatStatus.SittingOut(),
      })),
      phase: Phase.Playing({ deck, round: 1, step: Step.Betting({ toAct: [], currentBet: 0, minRaise: 0 }), nextCardId: fullDeck.length }),
    }
    // Deal one card at a time, clockwise from left of the dealer [L][F].
    const dealOrder = Array.flatten(Array.replicate(clockwiseFromDealer(anted).filter((i) => seated.includes(i)), HAND_SIZE))
    const dealt = dealOrder.reduce((g, i) => Option.match(takeCard(g, i), { onNone: () => g, onSome: ([next]) => next }), anted)
    const t: Transition = transition(
      openBetting(dealt),
      GameEvent.HandStarted({ dealer, seated }),
      ...game.seats.filter((s) => !seated.includes(s.index)).map((s) => GameEvent.SatOut({ seat: s.index })),
      GameEvent.RoundStarted({ round: 1 }),
    )
    const [only] = seated
    return seated.length === 1 && only !== undefined ? followedBy(t, lastStanding(t.game, only)) : yield* advance(t)
  })

const bet = (game: Game, actor: number, choice: Parameters<typeof applyBet>[2]): Result =>
  Effect.gen(function* () {
    const seat = yield* yourTurn(game, actor, "Betting")
    const r = yield* Either.match(applyBet(game, seat, choice), { onLeft: Effect.fail, onRight: Effect.succeed })
    return yield* advance(transition(r.game, r.event))
  })

const drawAction = (game: Game, actor: number, action: "gain" | "stand" | { readonly trade: number }): Result =>
  Effect.gen(function* () {
    const seat = yield* yourTurn(game, actor, "Drawing")
    if (action !== "stand" && deckSize(game) === 0) return yield* Effect.fail(new DeckEmpty())
    const resolved = typeof action === "object" ? { trade: yield* yourCard(seat, action.trade) } : action
    return yield* advance(draw(game, actor, resolved))
  })

const lockCard = (game: Game, actor: number, cardId: number): Result =>
  Effect.gen(function* () {
    const seat = yield* yourTurn(game, actor, "Drawing")
    const p = Option.getOrUndefined(playing(game))
    if (p?.step._tag === "Drawing" && p.step.lockedThisTurn)
      return yield* Effect.fail(new InvalidCard({ reason: "You can move only one card into the field per turn." }))
    const card = yield* yourCard(seat, cardId)
    return transition(lock(game, actor, card), GameEvent.Locked({ seat: actor, card }))
  })

const callWindow = (game: Game, actor: number, call: boolean): Result =>
  Effect.gen(function* () {
    yield* yourTurn(game, actor, "CallWindow")
    if (call) return yield* callHand(transition(game), actor, false)
    const p = Option.getOrUndefined(playing(game))
    const rest = p?.step._tag === "CallWindow" ? p.step.toAct.slice(1) : []
    return yield* advance(transition(setStep(game, Step.CallWindow({ toAct: rest })), GameEvent.Passed({ seat: actor })))
  })

/** A fresh table that keeps who sits where (names and controllers). */
const resetTable = (game: Game): Game => {
  const fresh = newTable()
  return { ...fresh, seats: fresh.seats.map((s) => Option.match(seatAt(game, s.index), { onNone: () => s, onSome: (old) => ({ ...s, name: old.name, controller: old.controller }) })) }
}

/** Hand a seat to a person or the AI; if it's that seat's turn, the AI plays on at once. */
const control = (game: Game, seat: number, controller: Controller, name: string): Result =>
  Option.match(seatAt(game, seat), {
    onNone: () => Effect.fail(new InvalidCard({ reason: "There is no such seat." })),
    onSome: () => advance(transition(updateSeat(game, seat, (s) => ({ ...s, controller, name })), GameEvent.Seated({ seat, controller, name }))),
  })

/** The only way game state changes. `actor` is the seat giving the command. */
export const applyCommand = (game: Game, command: Command, actor: number = YOU): Result =>
  Command.$match(command, {
    NewTable: () => Effect.succeed(transition(resetTable(game), GameEvent.TableReset())),
    StartHand: () => startHand(game, actor),
    Check: () => bet(game, actor, "check"),
    BetTo: ({ to }) => bet(game, actor, { to }),
    Match: () => bet(game, actor, "match"),
    AllIn: () => bet(game, actor, "allIn"),
    Fold: () => bet(game, actor, "fold"),
    Gain: () => drawAction(game, actor, "gain"),
    Trade: ({ cardId }) => drawAction(game, actor, { trade: cardId }),
    Stand: () => drawAction(game, actor, "stand"),
    Lock: ({ cardId }) => lockCard(game, actor, cardId),
    CallHand: () => callWindow(game, actor, true),
    Pass: () => callWindow(game, actor, false),
    Control: ({ seat, controller, name }) => control(game, seat, controller, name),
  })
