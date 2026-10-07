// <sabacc-stage>: the Three.js table as its own custom element. A widget with a lifecycle
// (a render loop, WebGL resources), so it owns that lifecycle: it builds the stage when it
// is connected, tears it down in `disconnectedCallback`, and builds a new one if it comes
// back. The 3D view sets one property, `.view`, on every render; the stage reports picks,
// hovers and a missing WebGL as one DOM event, `stage-event`, that an intent listens for.
// (The Gyral team's recommended pattern for such widgets.)
import type { Beat } from "../domain/model.ts"
import type { BoardView } from "./board.ts"
import { Stage, webglAvailable } from "./stage.ts"

export type StageEvent =
  | { readonly _tag: "Picked"; readonly cardId: number }
  | { readonly _tag: "Hovered"; readonly cardId: number | undefined }
  | { readonly _tag: "Failed" }

export const STAGE_EVENT = "stage-event"

export interface StageView {
  readonly seats: number
  /** What to draw; `beat` is the newest beat shown (its effects play once, when it changes). */
  readonly board: Omit<BoardView, "beat" | "instant"> & { readonly beat: Beat | undefined; readonly reduce: boolean }
  /** Bump to swing the camera back to the default view. */
  readonly reset: number
}

export class SabaccStage extends HTMLElement {
  #view: StageView | undefined
  #stage: Stage | undefined
  /** The view last drawn by the current stage (to tell a new beat or a reset). */
  #drawn: StageView | undefined
  #failed = false

  /** The Three.js stage while connected (tests read its frame count and card objects). */
  get stage(): Stage | undefined {
    return this.#stage
  }

  get view(): StageView | undefined {
    return this.#view
  }

  set view(view: StageView | undefined) {
    this.#view = view
    this.#draw()
  }

  connectedCallback(): void {
    this.#draw()
  }

  disconnectedCallback(): void {
    this.#stage?.dispose()
    this.#stage = undefined
    this.#drawn = undefined
  }

  #tell(detail: StageEvent): void {
    this.dispatchEvent(new CustomEvent(STAGE_EVENT, { detail, bubbles: true }))
  }

  #draw(): void {
    const view = this.#view
    if (!this.isConnected || view === undefined || this.#failed) return
    const fresh = this.#stage === undefined
    if (fresh) {
      if (!webglAvailable()) return this.#fail()
      try {
        this.#stage = new Stage(this, {
          seats: view.seats,
          onPick: (cardId) => this.#tell({ _tag: "Picked", cardId }),
          onHover: (cardId) => this.#tell({ _tag: "Hovered", cardId }),
        })
      } catch {
        return this.#fail()
      }
    }
    const stage = this.#stage
    if (stage === undefined) return
    const { beat, reduce, ...board } = view.board
    const before = this.#drawn
    stage.show({
      ...board,
      // A new beat plays its effects once; the first draw (and reduced motion) jumps
      // straight to the table as it stands.
      beat: !fresh && beat !== undefined && beat !== before?.board.beat ? beat.event : undefined,
      instant: fresh || reduce,
    })
    if (before !== undefined && view.reset !== before.reset) stage.resetView()
    this.#drawn = view
  }

  #fail(): void {
    this.#failed = true
    this.#tell({ _tag: "Failed" })
  }
}

if (customElements.get("sabacc-stage") === undefined) customElements.define("sabacc-stage", SabaccStage)

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-stage": SabaccStage
  }
}
