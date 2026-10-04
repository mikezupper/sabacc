// Opponent policy (spec "Opponent behaviour" [H]). Reads only the opponent's own
// cards and public table state (bets, pot, deck size) — never hidden information.
import { Effect, Option, Random } from "effect"
import type { Card } from "./cards.ts"
import { MIN_BET, SABACC } from "./constants.ts"
import type { Seat } from "./model.ts"
import { evaluate } from "./scoring.ts"

/** 0…1 confidence in a hand, from its own cards only. */
export const strength = (hand: ReadonlyArray<Card>): number => {
  const e = evaluate(hand)
  if (e.idiotsArray || e.pureSabacc) return 1
  if (e.bombedOut) return 0.1
  return (Math.abs(e.total) / SABACC) * 0.95 + (e.total > 0 ? 0.03 : 0)
}

const roundUp = (n: number) => Math.max(MIN_BET, Math.ceil(n / MIN_BET) * MIN_BET)

export type BetChoice = "check" | "match" | "allIn" | "fold" | { readonly to: number }

export interface BetSituation {
  readonly currentBet: number
  readonly minRaise: number
  readonly pot: number
}

export const decideBet = (seat: Seat, t: BetSituation): Effect.Effect<BetChoice> =>
  Effect.gen(function* () {
    const s = strength(seat.hand)
    const toMatch = t.currentBet - seat.roundBet
    const bluff = (yield* Random.nextIntBetween(0, 100)) < 8
    const affordable = (cost: number, minStrength: number): BetChoice =>
      cost >= seat.credits ? (s >= minStrength ? "allIn" : "fold") : "match"

    if (s >= 0.95 || (s >= 0.85 && toMatch === 0) || (bluff && toMatch === 0)) {
      const target = t.currentBet === 0 ? roundUp(t.pot * 0.5) : t.currentBet + Math.max(t.minRaise, roundUp(t.pot * 0.5))
      return target - seat.roundBet >= seat.credits ? "allIn" : { to: target }
    }
    if (toMatch === 0) return "check"
    const limit = s >= 0.6 ? Math.max(t.pot * 0.6, 3 * MIN_BET) : s >= 0.35 ? Math.max(t.pot * 0.25, 2 * MIN_BET) : MIN_BET
    return toMatch <= limit ? affordable(toMatch, 0.75) : "fold"
  })

export interface DrawChoice {
  readonly lock: Option.Option<number>
  readonly action: "gain" | "stand" | { readonly trade: number }
}

/** Draw toward ±23; trade away the card pushing a bombed hand furthest out. */
export const decideDraw = (seat: Seat, deckSize: number): DrawChoice => {
  const e = evaluate(seat.hand)
  const free = seat.hand.filter((c) => !seat.field.includes(c.id))
  const byValue = [...free].sort((a, b) => a.value - b.value)
  const action: DrawChoice["action"] =
    deckSize === 0 || e.idiotsArray || e.pureSabacc
      ? "stand"
      : e.total > SABACC && byValue.length > 0
        ? { trade: byValue[byValue.length - 1]?.id ?? 0 }
        : e.total < -SABACC && byValue.length > 0
          ? { trade: byValue[0]?.id ?? 0 }
          : e.total === 0 || Math.abs(e.total) <= 15
            ? "gain"
            : "stand"
  const traded = typeof action === "object" ? action.trade : -1
  const lockable = free.filter((c) => c.id !== traded).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  const lock = !e.bombedOut && Math.abs(e.total) >= 17 ? Option.fromNullable(lockable[0]?.id) : Option.none()
  return { lock, action }
}

/** Call with a strong hand, or a decent one once the hand has dragged on. */
export const decideCall = (seat: Seat, round: number): boolean => {
  const e = evaluate(seat.hand)
  if (e.bombedOut) return false
  return e.idiotsArray || e.pureSabacc || Math.abs(e.total) >= 21 || (round >= 5 && Math.abs(e.total) >= 18)
}
