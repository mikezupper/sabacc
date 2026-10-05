// Beat playback shared by every view (2D Lit table, 3D scene). Presentation state only:
// the game is already final in the store; this decides which snapshot to show and when.
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

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

export interface BeatPlayerOptions {
  /** Called whenever the shown beats change. */
  readonly onChange: () => void
  /** True to show every beat at once (default: `prefers-reduced-motion`). */
  readonly instant?: () => boolean
  /** Time each beat stays up before the next (default: `beatDelay`). */
  readonly delay?: (event: GameEvent) => number
}

/** Plays a transition's beats back one at a time, with no framework attached. */
export class BeatPlayer {
  private beats: ReadonlyArray<Beat> = []
  private shown = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly onChange: () => void
  private readonly instant: () => boolean
  private readonly delay: (event: GameEvent) => number

  constructor(options: BeatPlayerOptions) {
    this.onChange = options.onChange
    this.instant = options.instant ?? prefersReducedMotion
    this.delay = options.delay ?? beatDelay
  }

  /** Point playback at the store's latest beats; a new array starts a new playback. */
  sync(beats: ReadonlyArray<Beat>): void {
    if (beats === this.beats) return
    this.stop()
    this.beats = beats
    this.shown = this.instant() || beats.length <= 1 ? beats.length : 1
    this.schedule()
  }

  get playing(): boolean {
    return this.shown < this.beats.length
  }

  /** Beats on screen so far. */
  get revealed(): ReadonlyArray<Beat> {
    return this.beats.slice(0, this.shown)
  }

  /** Beats still to come. */
  get pending(): number {
    return this.beats.length - this.shown
  }

  /** The snapshot to draw while playing; undefined means "draw the live game". */
  get frame(): Game | undefined {
    return this.playing ? this.beats[this.shown - 1]?.game : undefined
  }

  skip(): void {
    this.stop()
    this.shown = this.beats.length
    this.onChange()
  }

  stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  private schedule(): void {
    const current = this.beats[this.shown - 1]
    if (!this.playing || current === undefined) return
    this.timer = setTimeout(() => {
      this.shown += 1
      this.onChange()
      this.schedule()
    }, this.delay(current.event))
  }
}
