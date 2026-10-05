import type { GameEvent } from "../domain/model.ts"
import { beatDelay } from "../presentation/playback.ts"

/** Beats stay up longer in 3D: cards fly, dice tumble, the shift spins every card. */
export const sceneBeatDelay = (event: GameEvent): number => {
  switch (event._tag) {
    case "HandStarted":
      return 1700
    case "Dice":
      return 1150
    case "Shifted":
      return 1700
    case "Called":
    case "Penalty":
      return 1100
    case "HandEnded":
      return 900
    default:
      return Math.round(beatDelay(event) * 1.3)
  }
}
