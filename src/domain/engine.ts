// Your commands. Each validates, applies your action, then lets `advance` run the
// table until you're needed again: one command → one complete transition.
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
  type Game,
  type GameError,
  type Seat,
  type Transition,
} from "./model.ts"
import { lastStanding } from "./showdown.ts"
import { clockwiseFromDealer, deckSize, newTable, playing, seatAt, setStep, takeCard } from "./table.ts"
import { openBetting } from "./betting.ts"

type Result = Effect.Effect<Transition, GameError>

const STEP_NAMES = { Betting: "betting", Drawing: "drawing", CallWindow: "the call window" } as const

/** Your seat, if it's your turn in the given step. */
const yourTurn = (game: Game, tag: keyof typeof STEP_NAMES): Effect.Effect<Seat, NotYourTurn | HandInProgress> =>
  Option.match(playing(game), {
    onNone: () => Effect.fail(new NotYourTurn({ expected: "a hand in progress" })),
    onSome: (p) =>
      p.step._tag === tag && p.step.toAct[0] === YOU
        ? Option.match(seatAt(game, YOU), { onNone: () => Effect.fail(new NotYourTurn({ expected: "your seat" })), onSome: Effect.succeed })
        : Effect.fail(new NotYourTurn({ expected: STEP_NAMES[p.step._tag] })),
  })

const yourCard = (seat: Seat, cardId: number) =>
  Option.match(Option.fromNullable(seat.hand.find((c) => c.id === cardId)), {
    onNone: () => Effect.fail(new InvalidCard({ reason: "That card isn't in your hand." })),
    onSome: (card) =>
      seat.field.includes(card.id) ? Effect.fail(new InvalidCard({ reason: "That card is locked in the interference field." })) : Effect.succeed(card),
  })

const startHand = (game: Game): Result =>
  Effect.gen(function* () {
    if (game.phase._tag !== "Lobby") return yield* Effect.fail(new HandInProgress())
    const available = Option.match(seatAt(game, YOU), { onNone: () => 0, onSome: (s) => s.credits })
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
    const t: Transition = {
      game: openBetting(dealt),
      events: [
        GameEvent.HandStarted({ dealer, seated }),
        ...game.seats.filter((s) => !seated.includes(s.index)).map((s) => GameEvent.SatOut({ seat: s.index })),
        GameEvent.RoundStarted({ round: 1 }),
      ],
    }
    const [only] = seated
    return seated.length === 1 && only !== undefined
      ? { ...t, ...{ game: lastStanding(t.game, only).game, events: [...t.events, ...lastStanding(t.game, only).events] } }
      : yield* advance(t)
  })

const bet = (game: Game, choice: Parameters<typeof applyBet>[2]): Result =>
  Effect.gen(function* () {
    const seat = yield* yourTurn(game, "Betting")
    const r = yield* Either.match(applyBet(game, seat, choice), { onLeft: Effect.fail, onRight: Effect.succeed })
    return yield* advance({ game: r.game, events: [r.event] })
  })

const drawAction = (game: Game, action: "gain" | "stand" | { readonly trade: number }): Result =>
  Effect.gen(function* () {
    const seat = yield* yourTurn(game, "Drawing")
    if (action !== "stand" && deckSize(game) === 0) return yield* Effect.fail(new DeckEmpty())
    const resolved = typeof action === "object" ? { trade: yield* yourCard(seat, action.trade) } : action
    return yield* advance(draw(game, YOU, resolved))
  })

const lockCard = (game: Game, cardId: number): Result =>
  Effect.gen(function* () {
    const seat = yield* yourTurn(game, "Drawing")
    const p = Option.getOrUndefined(playing(game))
    if (p?.step._tag === "Drawing" && p.step.lockedThisTurn)
      return yield* Effect.fail(new InvalidCard({ reason: "You can move only one card into the field per turn." }))
    const card = yield* yourCard(seat, cardId)
    return { game: lock(game, YOU, card), events: [GameEvent.Locked({ seat: YOU, card })] }
  })

const callWindow = (game: Game, call: boolean): Result =>
  Effect.gen(function* () {
    yield* yourTurn(game, "CallWindow")
    if (call) return yield* callHand({ game, events: [] }, YOU, false)
    const p = Option.getOrUndefined(playing(game))
    const rest = p?.step._tag === "CallWindow" ? p.step.toAct.slice(1) : []
    return yield* advance({ game: setStep(game, Step.CallWindow({ toAct: rest })), events: [GameEvent.Passed({ seat: YOU })] })
  })

/** The only way game state changes. */
export const applyCommand = (game: Game, command: Command): Result =>
  Command.$match(command, {
    NewTable: () => Effect.succeed({ game: newTable(), events: [GameEvent.TableReset()] }),
    StartHand: () => startHand(game),
    Check: () => bet(game, "check"),
    BetTo: ({ to }) => bet(game, { to }),
    Match: () => bet(game, "match"),
    AllIn: () => bet(game, "allIn"),
    Fold: () => bet(game, "fold"),
    Gain: () => drawAction(game, "gain"),
    Trade: ({ cardId }) => drawAction(game, { trade: cardId }),
    Stand: () => drawAction(game, "stand"),
    Lock: ({ cardId }) => lockCard(game, cardId),
    CallHand: () => callWindow(game, true),
    Pass: () => callWindow(game, false),
  })
