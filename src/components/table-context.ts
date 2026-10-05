// What a view needs to know about the table beyond the game itself: who "you" are,
// names for the narration, who's here, and which hands the last reveal showed.
// Shared by the classic table and the 3D view; the same for solo and multiplayer.
import { Option } from "effect"
import { YOU, type Game } from "../domain/model.ts"
import { narratorFor, solo, type Narrator } from "../presentation/describe.ts"
import type { Store } from "../state/store.ts"

export interface TableContext {
  /** Watching a multiplayer table: no seat is yours. */
  readonly spectator: boolean
  readonly narrator: Narrator
  /** Multiplayer only: is a seat's person here, away, or is the AI playing it? */
  readonly presence: (seat: number) => "here" | "away" | "ai" | undefined
  /** Solo, or the host of a multiplayer table. */
  readonly canStartNewTable: boolean
  /** Seats whose hands the last reveal showed (folded hands stay face down). */
  readonly revealed: ReadonlySet<number>
}

export const revealedSeats = (game: Game): ReadonlySet<number> => {
  const last = game.phase._tag === "Lobby" ? Option.getOrUndefined(game.phase.lastHand) : undefined
  return new Set(last?.revealed ? last.seats.filter((r) => Option.isSome(r.evaluation)).map((r) => r.seat) : [])
}

export const tableContext = (store: Store, game: Game): TableContext => {
  const room = store.room
  if (room === undefined) return { spectator: false, narrator: solo, presence: () => undefined, canStartNewTable: true, revealed: revealedSeats(game) }
  const spectator = room.spectator.get()
  const connected = room.presence.get().connected
  return {
    spectator,
    narrator: narratorFor(game, spectator ? undefined : YOU),
    presence: (seat) => (game.seats[seat]?.controller === "Ai" ? "ai" : connected[seat] === true || (seat === YOU && !spectator) ? "here" : "away"),
    canStartNewTable: room.host.get(),
    revealed: revealedSeats(game),
  }
}
