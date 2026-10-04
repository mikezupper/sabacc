// Spec "Showdown and payouts" 6: the hand pot as layered side pots. Pure arithmetic.

export interface Contribution {
  readonly seat: number
  readonly committed: number
  /** Folded players' credits stay in the pot, but they can't win any layer. */
  readonly folded: boolean
}

export interface Layer {
  readonly amount: number
  /** Seats that paid into this layer and didn't fold. */
  readonly eligible: ReadonlyArray<number>
}

/**
 * Split contributions into layers. Each layer's cap is the next smallest stake among
 * players who didn't fold. Money from folded players above the top cap joins the top layer.
 */
export const layers = (cs: ReadonlyArray<Contribution>): ReadonlyArray<Layer> => {
  const caps = [...new Set(cs.filter((c) => !c.folded && c.committed > 0).map((c) => c.committed))].sort((a, b) => a - b)
  const out = caps.map((cap, i) => {
    const floor = i === 0 ? 0 : (caps[i - 1] ?? 0)
    const amount = cs.reduce((sum, c) => sum + Math.max(0, Math.min(c.committed, cap) - floor), 0)
    const eligible = cs.filter((c) => !c.folded && c.committed >= cap).map((c) => c.seat)
    return { amount, eligible }
  })
  const top = caps.at(-1) ?? 0
  const overflow = cs.reduce((sum, c) => sum + Math.max(0, c.committed - top), 0)
  if (overflow === 0) return out
  const last = out.at(-1)
  return last === undefined
    ? [{ amount: overflow, eligible: [] }]
    : [...out.slice(0, -1), { ...last, amount: last.amount + overflow }]
}

export interface Split {
  readonly shares: ReadonlyArray<{ readonly seat: number; readonly amount: number }>
  readonly remainder: number
}

/** Split an amount evenly; the indivisible remainder is reported separately. */
export const split = (amount: number, seats: ReadonlyArray<number>): Split => {
  if (seats.length === 0) return { shares: [], remainder: amount }
  const each = Math.floor(amount / seats.length)
  return { shares: seats.map((seat) => ({ seat, amount: each })), remainder: amount - each * seats.length }
}
