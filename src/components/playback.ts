import type { ReactiveController, ReactiveControllerHost } from "lit"
import { BeatPlayer, prefersReducedMotion } from "../presentation/playback.ts"

export { beatDelay } from "../presentation/playback.ts"

/** Lit adapter for `BeatPlayer`: each shown beat re-renders the host. */
export class Playback extends BeatPlayer implements ReactiveController {
  constructor(host: ReactiveControllerHost, instant: () => boolean = prefersReducedMotion) {
    super({ onChange: () => host.requestUpdate(), instant })
    host.addController(this)
  }

  hostDisconnected(): void {
    this.stop()
  }
}
