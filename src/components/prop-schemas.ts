// Checks for Gyral props that carry app values (properties, not attributes): plain type
// guards, which `prop.value()` accepts directly. Gyral runs them on property sets in
// development only and always keeps the value it was given; production builds drop them.
// `checked()` turns a guard into a Standard Schema, for APIs that need one (`@gyral/http`).
import type { Card } from "../domain/cards.ts"
import type { Game, GameEvent, Seat, SeatResult } from "../domain/model.ts"

interface Issue {
  readonly message: string
}
type Result<T> = { readonly value: T; readonly issues?: undefined } | { readonly issues: ReadonlyArray<Issue> }

/** A synchronous Standard Schema (v1) from a type guard. */
export interface Checked<T> {
  readonly "~standard": {
    readonly version: 1
    readonly vendor: "sabacc"
    readonly validate: (value: unknown) => Result<T>
    readonly types?: { readonly input: T; readonly output: T }
  }
}

export const checked = <T>(expected: string, guard: (value: unknown) => value is T): Checked<T> => ({
  "~standard": {
    version: 1,
    vendor: "sabacc",
    validate: (value) => (guard(value) ? { value } : { issues: [{ message: `expected ${expected}` }] }),
  },
})

const isRecord = (u: unknown): u is Readonly<Record<string, unknown>> => typeof u === "object" && u !== null

/** A game as the views draw it: its shape, not its rules (the engine guarantees those). */
export const isGame = (u: unknown): u is Game => {
  if (!isRecord(u) || !Array.isArray(u["seats"]) || typeof u["sabaccPot"] !== "number") return false
  const phase = u["phase"]
  return isRecord(phase) && (phase["_tag"] === "Lobby" || phase["_tag"] === "Playing")
}

/** A card id (nothing chosen is `undefined`, which a prop leaves unset). */
export const isCardId = (u: unknown): u is number => Number.isInteger(u)

/** A card (no card: shown face down). */
export const isCard = (u: unknown): u is Card =>
  isRecord(u) && (u["_tag"] === "Suited" || u["_tag"] === "Face") && Number.isInteger(u["id"]) && typeof u["value"] === "number"

/** A seat at the table. */
export const isSeat = (u: unknown): u is Seat => isRecord(u) && Number.isInteger(u["index"]) && typeof u["name"] === "string" && Array.isArray(u["hand"])

/** One seat's line of a hand result. */
export const isSeatResult = (u: unknown): u is SeatResult => isRecord(u) && Number.isInteger(u["seat"]) && typeof u["won"] === "number"

/** Events as the log draws them (an array; the engine guarantees each event). */
export const isEventList = (u: unknown): u is ReadonlyArray<GameEvent> => Array.isArray(u)

/** Seat names, by seat. */
export const isNames = (u: unknown): u is ReadonlyArray<string> => Array.isArray(u) && u.every((x) => typeof x === "string")
