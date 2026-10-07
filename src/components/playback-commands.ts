// Beat playback as Gyral commands: the pure model lives in presentation/playback.ts;
// this turns its next delay into a timer that sends `Advance` back. One lane per
// component, so a new playback replaces the old timer.
import type { Command } from "@gyral/core"
import { delay } from "@gyral/time/delay"
import type { GameEvent } from "../domain/model.ts"
import { beatDelay, nextDelay, type Playback } from "../presentation/playback.ts"

/** The timer for the beat on screen, if any: `toMsg(run)` arrives when it's time for the next. */
export const nextBeat = <M>(p: Playback, toMsg: (run: number) => M, delayOf: (event: GameEvent) => number = beatDelay): ReadonlyArray<Command<M>> => {
  const ms = nextDelay(p, delayOf)
  return ms === undefined ? [] : [delay(ms, toMsg(p.run), { key: "playback", concurrency: "switch" })]
}
