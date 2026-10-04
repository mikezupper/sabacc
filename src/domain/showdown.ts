// Spec "Showdown and payouts". Pure: sudden demise deals from the existing deck.
import { Option } from "effect"
import { SUDDEN_DEMISE_CARDS } from "./constants.ts"
import { GameEvent, Phase, type Beat, type Game, type HandResult, type SeatResult, type Transition } from "./model.ts"
import { layers, split } from "./pots.ts"
import { evaluate, winsSabaccPot, type Evaluation } from "./scoring.ts"
import { handPot, inHand, isIn, seatAt, takeCard, transition, updateSeat } from "./table.ts"

const bestOf = (seats: ReadonlyArray<number>, rank: ReadonlyMap<number, number>): ReadonlyArray<number> => {
  const top = Math.max(...seats.map((s) => rank.get(s) ?? -1))
  return top < 0 ? [] : seats.filter((s) => rank.get(s) === top)
}

const evalOf = (game: Game, seat: number): Evaluation =>
  evaluate(Option.match(seatAt(game, seat), { onNone: () => [], onSome: (s) => s.hand }))

interface Demise {
  readonly game: Game
  readonly beats: ReadonlyArray<Beat>
  /** Rank of every hand that can still win; bombed hands are absent. */
  readonly rank: ReadonlyMap<number, number>
}

/** Sudden demise [L]: tied leaders get up to two extra cards; bombing out drops you from the tie. */
const suddenDemise = (start: Demise): Demise => {
  const step = (d: Demise, round: number): Demise => {
    const tied = bestOf([...d.rank.keys()], d.rank)
    if (tied.length < 2 || round >= SUDDEN_DEMISE_CARDS) return d
    const dealt = tied.reduce<Option.Option<Transition>>(
      (acc, seat) =>
        Option.flatMap(acc, (a) =>
          Option.map(takeCard(a.game, seat), ([g, card]) => ({ game: g, beats: [...a.beats, { event: GameEvent.SuddenDemise({ seat, card }), game: g }] })),
        ),
      Option.some(transition(d.game)),
    )
    // Deck ran out [H]: the tie stands and is split.
    if (Option.isNone(dealt)) return d
    const { game, beats } = dealt.value
    const rank = new Map(d.rank)
    for (const seat of tied) {
      const e = evalOf(game, seat)
      if (e.bombedOut) rank.delete(seat)
      else rank.set(seat, e.rank)
    }
    return step({ game, beats: [...d.beats, ...beats], rank }, round + 1)
  }
  return step(start, 0)
}

export const showdown = (game: Game, caller: Option.Option<number>): Transition => {
  const pot = handPot(game)
  const revealed = new Map(inHand(game).map((s) => [s.index, evaluate(s.hand)] as const))
  const bombed = [...revealed].filter(([, e]) => e.bombedOut).map(([seat]) => seat)
  const live = new Map([...revealed].filter(([, e]) => !e.bombedOut).map(([seat, e]) => [seat, e.rank] as const))
  const demise = suddenDemise({ game, beats: [], rank: live })

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
  const final = { ...settled, sabaccPot: sabaccSplit.remainder, phase: Phase.Lobby({ lastHand: Option.some(result) }) }
  // Demise cards were dealt on the way; penalties and the result land on the settled table.
  return {
    game: final,
    beats: [
      ...demise.beats,
      ...transition(final, ...penalties.filter((p) => p.amount > 0).map((p) => GameEvent.Penalty(p)), GameEvent.HandEnded({ result })).beats,
    ],
  }
}

/** Everyone else folded [F]: the last player takes the hand pot, no reveal, no penalties. */
export const lastStanding = (game: Game, seat: number): Transition => {
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
  return transition({ ...settled, phase: Phase.Lobby({ lastHand: Option.some(result) }) }, GameEvent.HandEnded({ result }))
}
