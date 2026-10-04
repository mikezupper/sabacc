import { Data, type Option } from "effect"
import type { Card } from "./cards.ts"
import type { Evaluation } from "./scoring.ts"

/** Seat 0 is always you; seats 1…n are opponents, clockwise. */
export const YOU = 0

export type SeatStatus = Data.TaggedEnum<{
  Active: {}
  Folded: {}
  SittingOut: {}
}>
export const SeatStatus = Data.taggedEnum<SeatStatus>()

export interface Seat {
  readonly index: number
  readonly name: string
  readonly credits: number
  readonly hand: ReadonlyArray<Card>
  /** Ids of hand cards in the interference field (face-down, never shifted). */
  readonly field: ReadonlyArray<number>
  readonly status: SeatStatus
  /** Credits put into the hand pot this hand (ante + bets): drives side pots. */
  readonly committed: number
  /** Credits bet in the current betting round. */
  readonly roundBet: number
}

/** Where the hand is within a round (spec "Each round"). `toAct` is the queue of seats. */
export type Step = Data.TaggedEnum<{
  Betting: { readonly toAct: ReadonlyArray<number>; readonly currentBet: number; readonly minRaise: number }
  Drawing: { readonly toAct: ReadonlyArray<number>; readonly lockedThisTurn: boolean }
  CallWindow: { readonly toAct: ReadonlyArray<number> }
}>
export const Step = Data.taggedEnum<Step>()

export interface SeatResult {
  readonly seat: number
  readonly evaluation: Option.Option<Evaluation>
  readonly won: number
  readonly penalty: number
}

export interface HandResult {
  readonly handPot: number
  /** Seats that won (a share of) the main hand pot; empty if it went to the Sabacc pot. */
  readonly winners: ReadonlyArray<number>
  readonly sabaccPotWon: number
  readonly caller: Option.Option<number>
  /** None when the hand ended because everyone else folded (no reveal). */
  readonly revealed: boolean
  readonly seats: ReadonlyArray<SeatResult>
}

export type Phase = Data.TaggedEnum<{
  Lobby: { readonly lastHand: Option.Option<HandResult> }
  Playing: {
    readonly deck: ReadonlyArray<Card>
    readonly round: number
    readonly step: Step
    readonly nextCardId: number
  }
}>
export const Phase = Data.taggedEnum<Phase>()

export interface Game {
  readonly seats: ReadonlyArray<Seat>
  readonly sabaccPot: number
  /** Seat holding the dealer button for the current or most recent hand. */
  readonly dealer: number
  readonly phase: Phase
}

export type Command = Data.TaggedEnum<{
  NewTable: {}
  StartHand: {}
  Check: {}
  /** Bet or raise so your bet this round totals `to`. */
  BetTo: { readonly to: number }
  Match: {}
  AllIn: {}
  Fold: {}
  Gain: {}
  Trade: { readonly cardId: number }
  Stand: {}
  Lock: { readonly cardId: number }
  CallHand: {}
  Pass: {}
}>
export const Command = Data.taggedEnum<Command>()

export type GameEvent = Data.TaggedEnum<{
  TableReset: {}
  HandStarted: { readonly dealer: number; readonly seated: ReadonlyArray<number> }
  SatOut: { readonly seat: number }
  RoundStarted: { readonly round: number }
  Checked: { readonly seat: number }
  BetTo: { readonly seat: number; readonly to: number; readonly raise: boolean }
  Matched: { readonly seat: number; readonly to: number }
  WentAllIn: { readonly seat: number; readonly to: number }
  Folded: { readonly seat: number }
  Gained: { readonly seat: number; readonly card: Card }
  Traded: { readonly seat: number; readonly discarded: Card; readonly card: Card }
  Stood: { readonly seat: number }
  Locked: { readonly seat: number; readonly card: Card }
  Dice: { readonly dice: readonly [number, number]; readonly shift: boolean }
  Shifted: { readonly changed: ReadonlyArray<{ readonly seat: number; readonly count: number }> }
  Passed: { readonly seat: number }
  Called: { readonly seat: number; readonly forced: boolean }
  SuddenDemise: { readonly seat: number; readonly card: Card }
  Penalty: { readonly seat: number; readonly amount: number; readonly reason: "bombed out" | "failed call" }
  HandEnded: { readonly result: HandResult }
}>
export const GameEvent = Data.taggedEnum<GameEvent>()

export interface Transition {
  readonly game: Game
  readonly events: ReadonlyArray<GameEvent>
}

export class NotYourTurn extends Data.TaggedError("NotYourTurn")<{ readonly expected: string }> {}
export class HandInProgress extends Data.TaggedError("HandInProgress")<{}> {}
export class InsufficientCredits extends Data.TaggedError("InsufficientCredits")<{
  readonly needed: number
  readonly available: number
}> {}
export class InvalidBet extends Data.TaggedError("InvalidBet")<{ readonly reason: string }> {}
export class InvalidCard extends Data.TaggedError("InvalidCard")<{ readonly reason: string }> {}
export class DeckEmpty extends Data.TaggedError("DeckEmpty")<{}> {}

export type GameError = NotYourTurn | HandInProgress | InsufficientCredits | InvalidBet | InvalidCard | DeckEmpty
