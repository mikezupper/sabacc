// The one-line status every view shows: what just happened, or what you can do now.
import { Option } from "effect"
import { BUY_IN } from "../domain/constants.ts"
import { YOU, type Game, type GameError, type GameEvent, type Step } from "../domain/model.ts"
import { playing, seatAt } from "../domain/table.ts"
import { describeError, describeEvent, describeResult, formatCredits } from "./describe.ts"

/** Your step when it's your turn to act; undefined otherwise. */
export const yourStep = (game: Game): Step | undefined => {
  const p = Option.getOrUndefined(playing(game))
  return p !== undefined && p.step.toAct[0] === YOU ? p.step : undefined
}

export interface PromptInput {
  readonly game: Game
  readonly notice: Option.Option<GameError>
  /** The beat being played back right now, if any. */
  readonly beat?: GameEvent | undefined
  /** Greet a table restored from storage (until anything happens). */
  readonly welcomeBack?: boolean
}

const basePrompt = ({ game, notice, beat }: PromptInput): string => {
  if (Option.isSome(notice)) return describeError(notice.value)
  if (beat !== undefined) return describeEvent(beat)
  if (game.phase._tag === "Lobby") {
    const last = Option.getOrUndefined(game.phase.lastHand)
    if (last !== undefined) return describeResult(last)
    return Option.exists(seatAt(game, YOU), (s) => s.credits < BUY_IN)
      ? "You can't cover the antes. Start a new table."
      : "Welcome to the table. Deal a hand to play."
  }
  const step = yourStep(game)
  const you = Option.getOrUndefined(seatAt(game, YOU))
  if (step === undefined || you === undefined) return "Waiting for the table…"
  switch (step._tag) {
    case "Betting": {
      const owe = step.currentBet - you.roundBet
      return owe > 0 ? `Betting: ${formatCredits(owe)} credits to match.` : "Betting: check or open with a bet."
    }
    case "Drawing":
      return "Your draw: gain a card, trade one, or stand. You may lock one card in the interference field first."
    case "CallWindow":
      return "Call the hand and reveal, or let play continue?"
  }
}

export const promptFor = (input: PromptInput): string => {
  const text = basePrompt(input)
  return input.welcomeBack ? `Welcome back: your saved table is restored. ${text}` : text
}
