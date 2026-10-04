// Spec "Showdown and payouts". Pure: sudden demise deals from the existing deck.
import { Option } from "effect"
import { SUDDEN_DEMISE_CARDS } from "./constants.ts"
import { GameEvent, Phase, type Game, type GameEvent as Event, type HandResult, type SeatResult } from "./model.ts"
import { layers, split } from "./pots.ts"
import { evaluate, winsSabaccPot, type Evaluation } from "./scoring.ts"
import { handPot, inHand, isIn, seatAt, takeCard, updateSeat } from "./table.ts"

const bestOf = (seats: ReadonlyArray<number>, rank: ReadonlyMap<number, number>): ReadonlyArray<number> => {
  const top = Math.max(...seats.map((s) => rank.get(s) ?? -1))
  return top < 0 ? [] : seats.filter((s) => rank.get(s) === top)
}

const evalOf = (game: Game, seat: number): Evaluation =>
  evaluate(Option.match(seatAt(game, seat), { onNone: () => [], onSome: (s) => s.hand }))

interface Demise {
  readonly game: Game
  readonly events: ReadonlyArray<Event>
  /** Rank of every hand that can still win; bombed hands are absent. */
  readonly rank: ReadonlyMap<number, number>
}

/** Sudden demise [L]: tied leaders get up to two extra cards; bombing out drops you from the tie. */
const suddenDemise = (start: Demise): Demise => {
  const step = (d: Demise, round: number): Demise => {
    const tied = bestOf([...d.rank.keys()], d.rank)
    if (tied.length < 2 || round >= SUDDEN_DEMISE_CARDS) return d
    const dealt = tied.reduce<Option.Option<{ game: Game; events: ReadonlyArray<Event> }>>(
      (acc, seat) =>
        Option.flatMap(acc, (a) =>
          Option.map(takeCard(a.game, seat), ([g, card]) => ({ game: g, events: [...a.events, GameEvent.SuddenDemise({ seat, card })] })),
        ),
      Option.some({ game: d.game, events: [] }),
    )
    // Deck ran out [H]: the tie stands and is split.
    if (Option.isNone(dealt)) return d
    const { game, events } = dealt.value
    const rank = new Map(d.rank)
    for (const seat of tied) {
      const e = evalOf(game, seat)
      if (e.bombedOut) rank.delete(seat)
      else rank.set(seat, e.rank)
    }
    return step({ game, events: [...d.events, ...events], rank }, round + 1)
  }
  return step(start, 0)
}

export const showdown = (game: Game, caller: Option.Option<number>): { readonly game: Game; readonly events: ReadonlyArray<Event> } => {
  const pot = handPot(game)
  const revealed = new Map(inHand(game).map((s) => [s.index, evaluate(s.hand)] as const))
  const bombed = [...revealed].filter(([, e]) => e.bombedOut).map(([seat]) => seat)
  const live = new Map([...revealed].filter(([, e]) => !e.bombedOut).map(([seat, e]) => [seat, e.rank] as const))
  const demise = suddenDemise({ game, events: [], rank: live })

  const potLayers = layers(demise.game.seats.map((s) => ({ seat: s.index, committed: s.committed, folded: !isIn(s) })))
  const awards = potLayers.map((layer) => {
    const winners = bestOf(layer.eligible.filter((s) => demise.rank.has(s)), demise.rank)
    return { winners, ...split(layer.amount, winners) }
  })
  const mainWinners = awards[0]?.winners ?? []
  const toSabacc = awards.reduce((sum, a) => sum + a.remainder, 0)

  const failedCaller = Option.filter(caller, (c) => !mainWinners.includes(c) && !bombed.includes(c))
  const penalised = [...bombed.map((seat) => ({ seat, reason: "bombed out" as const })),
    ...Option.toArray(failedCaller).map((seat) => ({ seat, reason: "failed call" as const }))]
  const penalties = penalised.map(({ seat, reason }) => ({
    seat,
    reason,
    amount: Math.min(pot, Option.match(seatAt(demise.game, seat), { onNone: () => 0, onSome: (s) => s.credits })),
  }))

  const sabaccBefore = demise.game.sabaccPot + toSabacc + penalties.reduce((sum, p) => sum + p.amount, 0)
  const pureWin = mainWinners.length > 0 && mainWinners.every((s) => winsSabaccPot(evalOf(demise.game, s)))
  const sabaccSplit = pureWin ? split(sabaccBefore, mainWinners) : { shares: [], remainder: sabaccBefore }

  const won = (seat: number) =>
    awards.reduce((sum, a) => sum + (a.shares.find((x) => x.seat === seat)?.amount ?? 0), 0) +
    (sabaccSplit.shares.find((x) => x.seat === seat)?.amount ?? 0)
  const paid = (seat: number) => penalties.filter((p) => p.seat === seat).reduce((sum, p) => sum + p.amount, 0)

  const seats: ReadonlyArray<SeatResult> = demise.game.seats.map((s) => ({
    seat: s.index,
    evaluation: revealed.has(s.index) ? Option.some(evalOf(demise.game, s.index)) : Option.none(),
    won: won(s.index),
    penalty: paid(s.index),
  }))
  const result: HandResult = {
    handPot: pot,
    winners: mainWinners,
    sabaccPotWon: sabaccBefore - sabaccSplit.remainder,
    caller,
    revealed: true,
    seats,
  }
  const settled = demise.game.seats.reduce(
    (g, s) => updateSeat(g, s.index, (x) => ({ ...x, credits: x.credits + won(s.index) - paid(s.index), committed: 0, roundBet: 0 })),
    demise.game,
  )
  return {
    game: { ...settled, sabaccPot: sabaccSplit.remainder, phase: Phase.Lobby({ lastHand: Option.some(result) }) },
    events: [
      ...demise.events,
      ...penalties.filter((p) => p.amount > 0).map((p) => GameEvent.Penalty(p)),
      GameEvent.HandEnded({ result }),
    ],
  }
}

/** Everyone else folded [F]: the last player takes the hand pot, no reveal, no penalties. */
export const lastStanding = (game: Game, seat: number): { readonly game: Game; readonly events: ReadonlyArray<Event> } => {
  const pot = handPot(game)
  const result: HandResult = {
    handPot: pot,
    winners: [seat],
    sabaccPotWon: 0,
    caller: Option.none(),
    revealed: false,
    seats: game.seats.map((s) => ({ seat: s.index, evaluation: Option.none(), won: s.index === seat ? pot : 0, penalty: 0 })),
  }
  const settled = game.seats.reduce(
    (g, s) => updateSeat(g, s.index, (x) => ({ ...x, credits: x.credits + (s.index === seat ? pot : 0), committed: 0, roundBet: 0 })),
    game,
  )
  return { game: { ...settled, phase: Phase.Lobby({ lastHand: Option.some(result) }) }, events: [GameEvent.HandEnded({ result })] }
}
