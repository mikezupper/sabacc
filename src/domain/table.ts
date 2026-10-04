import { Array, Option } from "effect"
import type { Card } from "./cards.ts"
import { OPPONENT_COUNT, STARTING_CREDITS } from "./constants.ts"
import { Phase, SeatStatus, type Game, type GameEvent, type Seat, type Step, type Transition } from "./model.ts"

export type Playing = Extract<Phase, { readonly _tag: "Playing" }>

const seat = (index: number, name: string): Seat => ({
  index,
  name,
  credits: STARTING_CREDITS,
  hand: [],
  field: [],
  status: SeatStatus.SittingOut(),
  committed: 0,
  roundBet: 0,
})

/** The dealer starts on the last seat, so the first hand opens with you. */
export const newTable = (): Game => ({
  seats: [seat(0, "You"), ...Array.range(1, OPPONENT_COUNT).map((i) => seat(i, `Opponent ${i}`))],
  sabaccPot: 0,
  dealer: OPPONENT_COUNT,
  phase: Phase.Lobby({ lastHand: Option.none() }),
})

export const playing = (game: Game): Option.Option<Playing> =>
  game.phase._tag === "Playing" ? Option.some(game.phase) : Option.none()

export const isIn = (s: Seat): boolean => s.status._tag === "Active"
export const isAllIn = (s: Seat): boolean => isIn(s) && s.credits === 0

export const seatAt = (game: Game, index: number): Option.Option<Seat> => Array.get(game.seats, index)

export const seatIs = (game: Game, index: number, p: (s: Seat) => boolean): boolean =>
  Option.exists(seatAt(game, index), p)

export const inHand = (game: Game): ReadonlyArray<Seat> => game.seats.filter(isIn)

export const handPot = (game: Game): number => game.seats.reduce((sum, s) => sum + s.committed, 0)

export const updateSeat = (game: Game, index: number, f: (s: Seat) => Seat): Game => ({
  ...game,
  seats: game.seats.map((s) => (s.index === index ? f(s) : s)),
})

export const updatePlaying = (game: Game, f: (p: Playing) => Playing): Game =>
  Option.match(playing(game), { onNone: () => game, onSome: (p) => ({ ...game, phase: f(p) }) })

export const setStep = (game: Game, step: Step): Game => updatePlaying(game, (p) => ({ ...p, step }))

/** Seat indexes clockwise starting left of the dealer. */
export const clockwiseFromDealer = (game: Game): ReadonlyArray<number> => {
  const n = game.seats.length
  return Array.range(1, n).map((k) => (game.dealer + k) % n)
}

/** Seats still in the hand, clockwise from left of the dealer, filtered further by `p`. */
export const order = (game: Game, p: (s: Seat) => boolean = () => true): ReadonlyArray<number> =>
  clockwiseFromDealer(game).filter((i) => seatIs(game, i, (s) => isIn(s) && p(s)))

/** Move the top card of the deck into a seat's hand. None when the deck is empty. */
export const takeCard = (game: Game, index: number): Option.Option<readonly [Game, Card]> =>
  Option.flatMap(playing(game), (p) =>
    Array.matchLeft(p.deck, {
      onEmpty: () => Option.none(),
      onNonEmpty: (card, rest) =>
        Option.some([
          updateSeat(updatePlaying(game, (q) => ({ ...q, deck: rest })), index, (s) => ({ ...s, hand: [...s.hand, card] })),
          card,
        ] as const),
    }),
  )

export const deckSize = (game: Game): number => Option.match(playing(game), { onNone: () => 0, onSome: (p) => p.deck.length })

export const append = (t: Transition, game: Game, ...events: ReadonlyArray<GameEvent>): Transition => ({
  game,
  events: [...t.events, ...events],
})
