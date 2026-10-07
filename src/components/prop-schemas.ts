// Standard Schemas for Gyral props that carry app values (properties, not attributes).
// They check the shape and return the same object, so a prop keeps its identity and a
// component re-renders only when the value really changed.
import type { Game } from "../domain/model.ts"

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
