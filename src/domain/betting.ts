// Spec "Each round › 1. Betting": no-limit check / bet / match / raise / fold / all-in.
// Pure functions over Game; the engine decides who acts and when.
import { Either } from "effect"
import { MIN_BET } from "./constants.ts"
import { GameEvent, InvalidBet, SeatStatus, Step, type Game, type GameEvent as Event, type Seat } from "./model.ts"
import { isAllIn, order, playing, seatIs, setStep, updateSeat } from "./table.ts"

type Betting = Extract<Step, { readonly _tag: "Betting" }>

export const bettingStep = (game: Game): Betting | undefined => {
  const p = playing(game)
  return p._tag === "Some" && p.value.step._tag === "Betting" ? p.value.step : undefined
}

/** Seats that must act again after `seat` raised: everyone else who can still bet, clockwise from the raiser. */
export const reopenAfter = (game: Game, seat: number): ReadonlyArray<number> => {
  const n = game.seats.length
  const distance = (i: number) => (i - seat + n) % n
  return [...order(game, (s) => !isAllIn(s) && s.index !== seat)].sort((a, b) => distance(a) - distance(b))
}

const put = (game: Game, seat: Seat, to: number): Game => {
  const amount = to - seat.roundBet
  return updateSeat(game, seat.index, (s) => ({
    ...s,
    credits: s.credits - amount,
    committed: s.committed + amount,
    roundBet: to,
  }))
}

export interface BetResult {
  readonly game: Game
  readonly event: Event
}

/** Apply one betting action for `seat` (the head of the queue). */
export const applyBet = (
  game: Game,
  seat: Seat,
  action: "check" | "match" | "allIn" | "fold" | { readonly to: number },
): Either.Either<BetResult, InvalidBet> => {
  const step = bettingStep(game)
  if (step === undefined) return Either.left(new InvalidBet({ reason: "There is no betting right now." }))
  const rest = step.toAct.filter((i) => i !== seat.index)
  const toMatch = step.currentBet - seat.roundBet
  const maxTo = seat.roundBet + seat.credits

  if (action === "fold") {
    const g = updateSeat(game, seat.index, (s) => ({ ...s, status: SeatStatus.Folded() }))
    return Either.right({ game: setStep(g, { ...step, toAct: rest }), event: GameEvent.Folded({ seat: seat.index }) })
  }
  if (action === "check") {
    if (toMatch > 0) return Either.left(new InvalidBet({ reason: `You can't check: ${toMatch} credits to match.` }))
    return Either.right({ game: setStep(game, { ...step, toAct: rest }), event: GameEvent.Checked({ seat: seat.index }) })
  }
  if (action === "match") {
    if (toMatch <= 0) return Either.left(new InvalidBet({ reason: "There's no bet to match. Check instead." }))
    if (toMatch >= seat.credits) return applyBet(game, seat, "allIn")
    const g = put(game, seat, step.currentBet)
    return Either.right({ game: setStep(g, { ...step, toAct: rest }), event: GameEvent.Matched({ seat: seat.index, to: step.currentBet }) })
  }
  if (action === "allIn") {
    if (seat.credits === 0) return Either.left(new InvalidBet({ reason: "You have no credits left to bet." }))
    const g = put(game, seat, maxTo)
    const raisedBy = maxTo - step.currentBet
    // A short all-in doesn't reopen betting; a full raise does.
    const next: Betting =
      raisedBy >= step.minRaise
        ? { ...step, currentBet: maxTo, minRaise: raisedBy, toAct: reopenAfter(g, seat.index) }
        : { ...step, currentBet: Math.max(step.currentBet, maxTo), toAct: raisedBy > 0 ? reopenAfter(g, seat.index) : rest }
    return Either.right({ game: setStep(g, next), event: GameEvent.WentAllIn({ seat: seat.index, to: maxTo }) })
  }
  const to = action.to
  const minTo = step.currentBet === 0 ? MIN_BET : step.currentBet + step.minRaise
  if (!Number.isInteger(to) || to < minTo)
    return Either.left(new InvalidBet({ reason: `${step.currentBet === 0 ? "Bet" : "Raise to"} at least ${minTo} credits.` }))
  if (to > maxTo) return Either.left(new InvalidBet({ reason: `You only have ${seat.credits} credits.` }))
  if (to === maxTo) return applyBet(game, seat, "allIn")
  const g = put(game, seat, to)
  return Either.right({
    game: setStep(g, { ...step, currentBet: to, minRaise: to - step.currentBet, toAct: reopenAfter(g, seat.index) }),
    event: GameEvent.BetTo({ seat: seat.index, to, raise: step.currentBet > 0 }),
  })
}

/** A new betting round: everyone in the hand who can still bet, from left of the dealer. */
export const openBetting = (game: Game): Game =>
  setStep(
    { ...game, seats: game.seats.map((s) => ({ ...s, roundBet: 0 })) },
    Step.Betting({ toAct: order(game, (s) => !isAllIn(s)), currentBet: 0, minRaise: MIN_BET }),
  )

/** Betting is pointless when at most one player in the hand can still bet and owes nothing. */
export const bettingIsMoot = (game: Game): boolean => {
  const step = bettingStep(game)
  const canBet = order(game, (s) => !isAllIn(s))
  return step !== undefined && canBet.length <= 1 && canBet.every((i) => seatIs(game, i, (s) => s.roundBet >= step.currentBet))
}
