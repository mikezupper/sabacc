// The multiplayer wire protocol: every message between the browser and the server,
// as Effect Schemas. Both sides decode what they receive (parse, don't validate), so
// a bad message is rejected at the edge and never reaches the engine or the views.
import { Schema } from "effect"
import { CardSchema, ControllerSchema, GameShape, HandResultSchema } from "../domain/schema.ts"
import {
  DeckEmpty,
  HandInProgress,
  InsufficientCredits,
  InvalidBet,
  InvalidCard,
  NotYourTurn,
  type Command,
  type GameError,
  type GameEvent,
} from "../domain/model.ts"

const Seat = Schema.Int.pipe(Schema.between(0, 15))
const Credits = Schema.Int.pipe(Schema.nonNegative())
const CardId = Schema.Int

/** Room codes: six characters, no look-alikes (0/O, 1/I). */
export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export const RoomCode = Schema.String.pipe(Schema.pattern(/^[A-HJ-NP-Z2-9]{6}$/))

/** A display name: 1–24 visible characters. */
export const PlayerName = Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(24))

/** Commands a player may send. `Control` is the server's own and never accepted from a browser. */
export const PlayerCommand = Schema.Union(
  Schema.TaggedStruct("NewTable", {}),
  Schema.TaggedStruct("StartHand", {}),
  Schema.TaggedStruct("Check", {}),
  Schema.TaggedStruct("BetTo", { to: Schema.Int.pipe(Schema.positive()) }),
  Schema.TaggedStruct("Match", {}),
  Schema.TaggedStruct("AllIn", {}),
  Schema.TaggedStruct("Fold", {}),
  Schema.TaggedStruct("Gain", {}),
  Schema.TaggedStruct("Trade", { cardId: CardId }),
  Schema.TaggedStruct("Stand", {}),
  Schema.TaggedStruct("Lock", { cardId: CardId }),
  Schema.TaggedStruct("CallHand", {}),
  Schema.TaggedStruct("Pass", {}),
)
export type PlayerCommand = Schema.Schema.Type<typeof PlayerCommand>
// Every player command is a domain command (checked by the compiler).
export const asCommand = (c: PlayerCommand): Command => c as Command

const SeatOnly = { seat: Seat }

export const GameEventSchema = Schema.Union(
  Schema.TaggedStruct("TableReset", {}),
  Schema.TaggedStruct("HandStarted", { dealer: Seat, seated: Schema.Array(Seat) }),
  Schema.TaggedStruct("SatOut", SeatOnly),
  Schema.TaggedStruct("RoundStarted", { round: Schema.Int }),
  Schema.TaggedStruct("Checked", SeatOnly),
  Schema.TaggedStruct("BetTo", { seat: Seat, to: Credits, raise: Schema.Boolean }),
  Schema.TaggedStruct("Matched", { seat: Seat, to: Credits }),
  Schema.TaggedStruct("WentAllIn", { seat: Seat, to: Credits }),
  Schema.TaggedStruct("Folded", SeatOnly),
  Schema.TaggedStruct("Gained", { seat: Seat, card: CardSchema }),
  Schema.TaggedStruct("Traded", { seat: Seat, discarded: CardSchema, card: CardSchema }),
  Schema.TaggedStruct("Stood", SeatOnly),
  Schema.TaggedStruct("Locked", { seat: Seat, card: CardSchema }),
  Schema.TaggedStruct("Dice", { dice: Schema.Tuple(Schema.Int, Schema.Int), shift: Schema.Boolean }),
  Schema.TaggedStruct("Shifted", { changed: Schema.Array(Schema.Struct({ seat: Seat, count: Schema.Int })) }),
  Schema.TaggedStruct("Passed", SeatOnly),
  Schema.TaggedStruct("Called", { seat: Seat, forced: Schema.Boolean }),
  Schema.TaggedStruct("SuddenDemise", { seat: Seat, card: CardSchema }),
  Schema.TaggedStruct("Penalty", { seat: Seat, amount: Credits, reason: Schema.Literal("bombed out", "failed call") }),
  Schema.TaggedStruct("HandEnded", { result: HandResultSchema }),
  Schema.TaggedStruct("Seated", { seat: Seat, controller: ControllerSchema, name: Schema.String }),
)
// The domain's events and these schemas must describe the same values.
export const asEvent = (e: Schema.Schema.Type<typeof GameEventSchema>): GameEvent => e as GameEvent
export const fromEvent = (e: GameEvent): Schema.Schema.Type<typeof GameEventSchema> => e

export const BeatSchema = Schema.Struct({ event: GameEventSchema, game: GameShape })

const GameErrorWire = Schema.Union(
  Schema.TaggedStruct("NotYourTurn", { expected: Schema.String }),
  Schema.TaggedStruct("HandInProgress", {}),
  Schema.TaggedStruct("InsufficientCredits", { needed: Credits, available: Credits }),
  Schema.TaggedStruct("InvalidBet", { reason: Schema.String }),
  Schema.TaggedStruct("InvalidCard", { reason: Schema.String }),
  Schema.TaggedStruct("DeckEmpty", {}),
)
type GameErrorWire = Schema.Schema.Type<typeof GameErrorWire>

/** Rebuild the domain's error from its wire form (so `describeError` works unchanged). */
export const toGameError = (e: GameErrorWire): GameError => {
  switch (e._tag) {
    case "NotYourTurn":
      return new NotYourTurn({ expected: e.expected })
    case "HandInProgress":
      return new HandInProgress()
    case "InsufficientCredits":
      return new InsufficientCredits({ needed: e.needed, available: e.available })
    case "InvalidBet":
      return new InvalidBet({ reason: e.reason })
    case "InvalidCard":
      return new InvalidCard({ reason: e.reason })
    case "DeckEmpty":
      return new DeckEmpty()
  }
}

export const fromGameError = (e: GameError): GameErrorWire => {
  switch (e._tag) {
    case "NotYourTurn":
      return { _tag: e._tag, expected: e.expected }
    case "InsufficientCredits":
      return { _tag: e._tag, needed: e.needed, available: e.available }
    case "InvalidBet":
    case "InvalidCard":
      return { _tag: e._tag, reason: e.reason }
    case "HandInProgress":
    case "DeckEmpty":
      return { _tag: e._tag }
  }
}

/** Whose turn is on the clock, in the receiver's seat numbering, and how long is left. */
export const Deadline = Schema.Struct({ seat: Seat, remainingMs: Schema.Int.pipe(Schema.nonNegative()) })

/** Who's at the table, per seat in the receiver's numbering. */
export const Presence = Schema.Struct({
  connected: Schema.Array(Schema.Boolean),
  deadline: Schema.Option(Deadline),
})

// ── Browser → server ──────────────────────────────────────────────────────────

export const ClientMessage = Schema.Union(
  /** Sit down (or watch). A token from an earlier visit reclaims your seat. */
  Schema.TaggedStruct("Join", { room: RoomCode, name: PlayerName, token: Schema.optional(Schema.String.pipe(Schema.maxLength(64))) }),
  Schema.TaggedStruct("Act", { command: PlayerCommand }),
)
export type ClientMessage = Schema.Schema.Type<typeof ClientMessage>

// ── Server → browser ──────────────────────────────────────────────────────────

export const ServerMessage = Schema.Union(
  /** You're in. Keep `token` to reclaim the seat; a spectator has no seat. */
  Schema.TaggedStruct("Welcome", { room: RoomCode, token: Schema.String, spectator: Schema.Boolean, host: Schema.Boolean }),
  /** The whole table as you may see it, with the log so far (on join and rejoin). */
  Schema.TaggedStruct("Snapshot", { game: GameShape, log: Schema.Array(GameEventSchema), presence: Presence }),
  /** A command was applied: the beats to play back and the final table. */
  Schema.TaggedStruct("Update", { game: GameShape, beats: Schema.Array(BeatSchema), presence: Presence }),
  /** Someone connected or left, or the clock changed hands, without a move. */
  Schema.TaggedStruct("PresenceChanged", { presence: Presence }),
  /** Your command was refused; the table didn't change. */
  Schema.TaggedStruct("Rejected", { error: GameErrorWire }),
  /** Something about the connection itself went wrong. */
  Schema.TaggedStruct("Problem", { reason: Schema.Literal("no-such-room", "bad-message", "too-fast", "not-joined", "not-allowed"), message: Schema.String }),
  /** Keeps proxies from closing a quiet connection. */
  Schema.TaggedStruct("Heartbeat", {}),
)
export type ServerMessage = Schema.Schema.Type<typeof ServerMessage>

export const ClientMessageJson = Schema.parseJson(ClientMessage)
export const ServerMessageJson = Schema.parseJson(ServerMessage)

/** Largest message a browser may send (bytes). */
export const MAX_CLIENT_MESSAGE = 2048
