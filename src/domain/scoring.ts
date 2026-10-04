import { Array, Number, Order, pipe } from "effect"
import { isIdiot, isSuitedValue, type Card } from "./cards.ts"
import { SABACC } from "./constants.ts"

/**
 * An evaluated hand (spec "Hand value"). `rank` is comparable: higher is better,
 * and bombed-out hands rank below every live hand.
 */
export interface Evaluation {
  readonly total: number
  readonly bombedOut: boolean
  readonly idiotsArray: boolean
  readonly pureSabacc: boolean
  readonly rank: number
}

export const handTotal = (hand: ReadonlyArray<Card>): number => pipe(hand, Array.map((c) => c.value), Number.sumAll)

/** The Idiot, a 2 and a 3 in any suits; extra cards allowed [L Darth Bane]. */
export const hasIdiotsArray = (hand: ReadonlyArray<Card>): boolean =>
  hand.some(isIdiot) && hand.some((c) => isSuitedValue(c, 2)) && hand.some((c) => isSuitedValue(c, 3))

/**
 * Rank encoding, best first:
 *   Idiot's Array 1000 > Pure Sabacc +23 (900) > −23 (800)
 *   > other totals: 2·|t| + (t > 0 ? 1 : 0)   (so +21 > −21 > +20)
 *   > bombed out −1
 */
export const evaluate = (hand: ReadonlyArray<Card>): Evaluation => {
  const total = handTotal(hand)
  const idiotsArray = hasIdiotsArray(hand)
  const pureSabacc = Math.abs(total) === SABACC
  const bombedOut = !idiotsArray && (Math.abs(total) > SABACC || total === 0)
  const rank = idiotsArray
    ? 1000
    : bombedOut
      ? -1
      : total === SABACC
        ? 900
        : total === -SABACC
          ? 800
          : 2 * Math.abs(total) + (total > 0 ? 1 : 0)
  return { total, bombedOut, idiotsArray, pureSabacc: pureSabacc && !bombedOut, rank }
}

export const evaluationOrder: Order.Order<Evaluation> = Order.mapInput(Number.Order, (e: Evaluation) => e.rank)

/** True when this hand wins the Sabacc pot if it wins the hand pot. */
export const winsSabaccPot = (e: Evaluation): boolean => e.idiotsArray || e.pureSabacc

export const describeEvaluation = (e: Evaluation): string =>
  e.idiotsArray
    ? "Idiot's Array"
    : e.bombedOut
      ? `${e.total > 0 ? "+" : ""}${e.total}, bombed out`
      : e.pureSabacc
        ? `Pure Sabacc (${e.total > 0 ? "+" : ""}${e.total})`
        : `${e.total > 0 ? "+" : ""}${e.total}`
