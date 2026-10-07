// Standard Schemas for Gyral props that carry app values (properties, not attributes).
// They check the shape and return the same object, so a prop keeps its identity and a
// component re-renders only when the value really changed.
import type { Card } from "../domain/cards.ts"
import type { Game, Seat, SeatResult } from "../domain/model.ts"

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
export const gameSchema = checked<Game>("a game", (u): u is Game => {
  if (!isRecord(u) || !Array.isArray(u["seats"]) || typeof u["sabaccPot"] !== "number") return false
  const phase = u["phase"]
  return isRecord(phase) && (phase["_tag"] === "Lobby" || phase["_tag"] === "Playing")
})

/** A card id, or nothing chosen. */
export const cardIdSchema = checked<number | undefined>("a card id", (u): u is number | undefined => u === undefined || Number.isInteger(u))

/** A card (face up), or none: the card is shown face down. */
export const cardSchema = checked<Card | undefined>("a card", (u): u is Card | undefined =>
  u === undefined || (isRecord(u) && (u["_tag"] === "Suited" || u["_tag"] === "Face") && Number.isInteger(u["id"]) && typeof u["value"] === "number"),
)

/** A seat at the table. */
export const seatSchema = checked<Seat | undefined>("a seat", (u): u is Seat | undefined =>
  u === undefined || (isRecord(u) && Number.isInteger(u["index"]) && typeof u["name"] === "string" && Array.isArray(u["hand"])),
)

/** One seat's line of a hand result. */
export const seatResultSchema = checked<SeatResult | undefined>("a seat result", (u): u is SeatResult | undefined =>
  u === undefined || (isRecord(u) && Number.isInteger(u["seat"]) && typeof u["won"] === "number"),
)

/** A list of anything the views draw as is (events, beats): checked to be an array. */
export const listSchema = <T>(what: string) => checked<ReadonlyArray<T>>(`a list of ${what}`, (u): u is ReadonlyArray<T> => Array.isArray(u))

/** Seat names, by seat. */
export const namesSchema = checked<ReadonlyArray<string>>("seat names", (u): u is ReadonlyArray<string> => Array.isArray(u) && u.every((x) => typeof x === "string"))

/** A seat number, or nobody (a spectator). */
export const seatNumberSchema = checked<number | undefined>("a seat number", (u): u is number | undefined => u === undefined || Number.isInteger(u))

