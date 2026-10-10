// Beat playback as Gyral commands: the pure model lives in presentation/playback.ts;
// this derives the current beat's timer for the component's subscriptions. Each step
// has its own key, even when adjacent delays match. Detaching cancels it; reattaching
// resumes that beat with its full delay. A same-task move keeps the timer running.
import type { Command } from "@gyral/core"
import { delay } from "@gyral/time"
import type { GameEvent } from "../domain/model.ts"
import { beatDelay, nextDelay, type Playback } from "../presentation/playback.ts"

/** Keep a timer while a beat is pending; identify its run and step in the reply. */
export const nextBeat = <M>(p: Playback, toMsg: (run: number, shown: number) => M, delayOf: (event: GameEvent) => number = beatDelay): ReadonlyArray<Command<M>> => {
  const ms = nextDelay(p, delayOf)
  return ms === undefined ? [] : [delay(ms, toMsg(p.run, p.shown), { key: `playback:${p.run}:${p.shown}`, concurrency: "switch" })]
}
