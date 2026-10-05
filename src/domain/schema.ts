// Schemas for saving and restoring a game (parse, don't validate). Anything read
// back from storage, or off the network, is decoded here once; the rest of the code
// only sees a Game. src/protocol builds its messages from these pieces.
import { Schema } from "effect"
import { FACE_CARDS, SUITS } from "./cards.ts"
import { OPPONENT_COUNT, STARTING_CREDITS } from "./constants.ts"
import type { Game } from "./model.ts"

const Int = Schema.Int
const Credits = Schema.Int.pipe(Schema.nonNegative())

export const CardSchema = Schema.Union(
  Schema.TaggedStruct("Suited", { id: Int, suit: Schema.Literal(...SUITS), value: Schema.Int.pipe(Schema.between(1, 15)) }),
  Schema.TaggedStruct("Face", { id: Int, name: Schema.Literal(...FACE_CARDS.map((f) => f.name)), value: Int }),
)

const SeatStatusSchema = Schema.Union(
  Schema.TaggedStruct("Active", {}),
  Schema.TaggedStruct("Folded", {}),
  Schema.TaggedStruct("SittingOut", {}),
)

export const ControllerSchema = Schema.Literal("Human", "Ai")

const SeatSchema = Schema.Struct({
  index: Int,
  name: Schema.String.pipe(Schema.maxLength(40)),
  controller: ControllerSchema,
  credits: Credits,
  hand: Schema.Array(CardSchema),
  field: Schema.Array(Int),
  status: SeatStatusSchema,
  committed: Credits,
  roundBet: Credits,
})

const StepSchema = Schema.Union(
  Schema.TaggedStruct("Betting", { toAct: Schema.Array(Int), currentBet: Credits, minRaise: Credits }),
  Schema.TaggedStruct("Drawing", { toAct: Schema.Array(Int), lockedThisTurn: Schema.Boolean }),
  Schema.TaggedStruct("CallWindow", { toAct: Schema.Array(Int) }),
)

const EvaluationSchema = Schema.Struct({
  total: Int,
  bombedOut: Schema.Boolean,
  idiotsArray: Schema.Boolean,
  pureSabacc: Schema.Boolean,
  rank: Int,
})

export const HandResultSchema = Schema.Struct({
  handPot: Credits,
  winners: Schema.Array(Int),
  sabaccPotWon: Credits,
  caller: Schema.Option(Int),
  revealed: Schema.Boolean,
  seats: Schema.Array(Schema.Struct({ seat: Int, evaluation: Schema.Option(EvaluationSchema), won: Credits, penalty: Credits })),
})

const PhaseSchema = Schema.Union(
  Schema.TaggedStruct("Lobby", { lastHand: Schema.Option(HandResultSchema) }),
  Schema.TaggedStruct("Playing", { deck: Schema.Array(CardSchema), round: Schema.Int.pipe(Schema.positive()), step: StepSchema, nextCardId: Int }),
)

/** Every credit at the table: each player's starting stake. */
export const TABLE_CREDITS = STARTING_CREDITS * (OPPONENT_COUNT + 1)

const money = (g: Schema.Schema.Type<typeof GameShape>): number =>
  g.seats.reduce((sum, s) => sum + s.credits + s.committed, 0) + g.sabaccPot

const cardIds = (g: Schema.Schema.Type<typeof GameShape>): ReadonlyArray<number> => [
  ...g.seats.flatMap((s) => s.hand.map((c) => c.id)),
  ...(g.phase._tag === "Playing" ? g.phase.deck.map((c) => c.id) : []),
]

/** A game's shape without the whole-table invariants: what one player's view decodes as. */
export const GameShape = Schema.Struct({
  seats: Schema.Array(SeatSchema).pipe(Schema.itemsCount(OPPONENT_COUNT + 1)),
  sabaccPot: Credits,
  dealer: Schema.Int.pipe(Schema.between(0, OPPONENT_COUNT)),
  phase: PhaseSchema,
})

/** A whole game, with the invariants a hand-edited save could break. */
export const GameSchema: Schema.Schema<Game, Schema.Schema.Encoded<typeof GameShape>> = GameShape.pipe(
  Schema.filter((g) => money(g) === TABLE_CREDITS || `credits don't add up to ${TABLE_CREDITS}`),
  Schema.filter((g) => new Set(cardIds(g)).size === cardIds(g).length || "a card appears twice"),
  Schema.filter((g) => g.seats.every((s, i) => s.index === i) || "seats are out of order"),
)

/** What goes into storage. Bump `version` when the Game shape changes, and migrate. */
export const SAVE_VERSION = 2
export const SavedGame = Schema.Struct({ version: Schema.Literal(SAVE_VERSION), game: GameSchema })

const isRecord = (u: unknown): u is Readonly<Record<string, unknown>> => typeof u === "object" && u !== null

/**
 * v1 → v2: seats gained `controller` (multiplayer). A v1 table was always solo:
 * seat 0 is the person, the rest the AI. Anything else passes through to be decoded.
 */
export const migrateSave = (u: unknown): unknown => {
  if (!isRecord(u) || u["version"] !== 1 || !isRecord(u["game"])) return u
  const game = u["game"]
  const seats = Array.isArray(game["seats"]) ? game["seats"] : []
  return {
    version: SAVE_VERSION,
    game: { ...game, seats: seats.map((s: unknown, i: number) => (isRecord(s) ? { ...s, controller: i === 0 ? "Human" : "Ai" } : s)) },
  }
}

const Migrated = Schema.transform(Schema.Unknown, Schema.Unknown, { strict: true, decode: migrateSave, encode: (u) => u })

/** JSON text ⇄ SavedGame, reading older saves through `migrateSave`. */
export const SavedGameJson = Schema.compose(Schema.parseJson(Migrated), SavedGame, { strict: false })
