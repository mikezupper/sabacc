// Mounts the Three.js stage on the element it sits on, and hands it each snapshot to draw.
// The stage is imperative, so it lives behind a Gyral hook: the view stays a pure template,
// and the stage's own events (a card picked or hovered, WebGL missing) come back as one DOM
// event, `stage-event`, that an intent turns into a message.
import { defineHook } from "@gyral/core"
import type { Beat } from "../domain/model.ts"
import type { BoardView } from "./board.ts"
import { Stage, webglAvailable } from "./stage.ts"

export type StageEvent =
  | { readonly _tag: "Picked"; readonly cardId: number }
  | { readonly _tag: "Hovered"; readonly cardId: number | undefined }
  | { readonly _tag: "Failed" }

export const STAGE_EVENT = "stage-event"

export interface StageArgs {
  readonly seats: number
  /** What to draw; `beat` is the newest beat shown (its effects play once, when it changes). */
  readonly view: Omit<BoardView, "beat" | "instant"> & { readonly beat: Beat | undefined; readonly reduce: boolean }
  /** Bump to swing the camera back to the default view. */
  readonly reset: number
}

const stages = new WeakMap<Element, Stage>()

/** The stage on an element (tests read its frame count and card objects). */
export const stageOf = (el: Element): Stage | undefined => stages.get(el)

const tell = (el: Element, detail: StageEvent) => el.dispatchEvent(new CustomEvent(STAGE_EVENT, { detail, bubbles: true }))

export const stageHook = defineHook<[StageArgs]>({
  client: (el, [args], prev) => {
    if (!(el instanceof HTMLElement)) return
    let stage = stages.get(el)
    const fresh = stage === undefined || stage.disposed
    if (fresh) {
      if (!webglAvailable()) return void tell(el, { _tag: "Failed" })
      try {
        stage = new Stage(el, {
          seats: args.seats,
          onPick: (cardId) => tell(el, { _tag: "Picked", cardId }),
          onHover: (cardId) => tell(el, { _tag: "Hovered", cardId }),
        })
        stages.set(el, stage)
      } catch {
        return void tell(el, { _tag: "Failed" })
      }
    }
    if (stage === undefined) return
    const { beat, reduce, ...view } = args.view
    const before = prev?.[0]
    stage.show({
      ...view,
      // A new beat plays its effects once; the first draw (and reduced motion) jumps
      // straight to the table as it stands.
      beat: !fresh && beat !== undefined && beat !== before?.view.beat ? beat.event : undefined,
      instant: fresh || reduce,
    })
    if (before !== undefined && args.reset !== before.reset) stage.resetView()
  },
})
