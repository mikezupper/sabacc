// Small browser side effects as Gyral drivers, so reducers stay pure: where this page is,
// going to a table, the clipboard, a clock for countdowns, and the reduced-motion setting.
import { command, defineDriver, type Command } from "@gyral/core"

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// ── page: address, navigation, clipboard ─────────────────────────────────────

export interface Where {
  readonly origin: string
  readonly pathname: string
}

type PageInput = { readonly _tag: "Where" } | { readonly _tag: "Go"; readonly url: string } | { readonly _tag: "Copy"; readonly text: string }

const page = defineDriver<PageInput, Where | undefined, string>({
  name: "page",
  run: async (input) => {
    switch (input._tag) {
      case "Where":
        return { origin: location.origin, pathname: location.pathname }
      case "Go":
        location.assign(input.url)
        return undefined
      case "Copy":
        await navigator.clipboard.writeText(input.text)
        return undefined
    }
  },
  toError: message,
})

/** This page's origin and path (for links that keep you on the same view). */
export const where = <M>(toMsg: (w: Where) => M): Command<M> =>
  command<PageInput, Where | undefined, string, M>(page, { _tag: "Where" }, { onSuccess: (w) => (w === undefined ? undefined : toMsg(w)) })

/** Load another address (a new table's link). */
export const go = <M>(url: string): Command<M> => command<PageInput, Where | undefined, string, M>(page, { _tag: "Go", url }, { onSuccess: () => undefined })

/** Copy text to the clipboard. */
export const copy = <M>(text: string, onDone: M, onFailure: (reason: string) => M): Command<M> =>
  command<PageInput, Where | undefined, string, M>(page, { _tag: "Copy", text }, { onSuccess: () => onDone, onFailure })

// ── clock: the time, once a second, while something counts down ─────────────

const clock = defineDriver<boolean, number>({
  name: "clock",
  run: (on, { signal, emit }) =>
    on
      ? new Promise<number>(() => {
          emit(Date.now())
          const timer = setInterval(() => emit(Date.now()), 1000)
          signal.addEventListener("abort", () => clearInterval(timer), { once: true })
        })
      : Date.now(),
})

/** Start (or stop) a once-a-second clock; one lane per component, the latest wins. */
export const ticking = <M>(on: boolean, toMsg: (now: number) => M): Command<M> =>
  command(clock, on, { onSuccess: (now) => toMsg(now), key: "clock", concurrency: "switch" })

// ── motion: prefers-reduced-motion, now and when it changes ──────────────────

const motion = defineDriver<null, boolean>({
  name: "motion",
  run: (_, { signal, emit }) =>
    new Promise<boolean>(() => {
      if (typeof matchMedia !== "function") return emit(false)
      const query = matchMedia("(prefers-reduced-motion: reduce)")
      emit(query.matches)
      const changed = () => emit(query.matches)
      query.addEventListener("change", changed)
      signal.addEventListener("abort", () => query.removeEventListener("change", changed), { once: true })
    }),
})

/** Whether the visitor asked for reduced motion (now, then on every change). */
export const reducedMotion = <M>(toMsg: (reduce: boolean) => M): Command<M> =>
  command(motion, null, { onSuccess: toMsg, key: "motion", concurrency: "switch" })
