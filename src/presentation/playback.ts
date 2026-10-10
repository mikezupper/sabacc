// Beat playback shared by every view (classic table, 3D table), as a pure model: which
// beats are on screen and how long the current one stays. No timers here: a view turns
// `nextDelay` into a timer subscription and feeds `Advance` back. The game itself is already
// final in the store; playback only decides which snapshot to show.
import type { Beat, Game, GameEvent } from "../domain/model.ts"

/** How long each kind of beat stays on screen before the next one (ms). */
export const beatDelay = (event: GameEvent): number => {
  switch (event._tag) {
    case "Shifted":
      return 1100
    case "HandStarted":
    case "RoundStarted":
    case "Called":
    case "Penalty":
    case "SuddenDemise":
      return 700
    case "Checked":
    case "Passed":
    case "Dice":
    case "SatOut":
      return 350
    default:
      return 550
  }
}

export interface Playback {
  readonly beats: ReadonlyArray<Beat>
  /** Beats on screen so far. */
  readonly shown: number
  /** Bumped by every new playback, so a timer from an older one is ignored. */
  readonly run: number
}

export const noPlayback: Playback = { beats: [], shown: 0, run: 0 }

/** Play a new transition's beats: all at once when `instant`, else one at a time. */
export const startPlayback = (p: Playback, beats: ReadonlyArray<Beat>, instant: boolean): Playback => ({
  beats,
  shown: instant || beats.length <= 1 ? beats.length : 1,
  run: p.run + 1,
})

export const isPlaying = (p: Playback): boolean => p.shown < p.beats.length

/** Show the next beat only if the timer still belongs to this run and step. */
export const advancePlayback = (p: Playback, run: number, shown: number): Playback =>
  run === p.run && shown === p.shown && isPlaying(p) ? { ...p, shown: p.shown + 1 } : p

export const skipPlayback = (p: Playback): Playback => ({ ...p, shown: p.beats.length })

export const revealed = (p: Playback): ReadonlyArray<Beat> => p.beats.slice(0, p.shown)

export const pending = (p: Playback): number => p.beats.length - p.shown

/** The beat on screen while playing; undefined when the live game is shown. */
export const currentBeat = (p: Playback): Beat | undefined => (isPlaying(p) ? p.beats[p.shown - 1] : undefined)

/** The snapshot to draw: the current beat's game while playing, else the live game. */
export const frame = (p: Playback, live: Game): Game => currentBeat(p)?.game ?? live

/** How long until the next beat, or undefined when there is nothing more to show. */
export const nextDelay = (p: Playback, delay: (event: GameEvent) => number = beatDelay): number | undefined => {
  const beat = currentBeat(p)
  return beat === undefined ? undefined : delay(beat.event)
}
