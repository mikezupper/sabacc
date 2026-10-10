// Small browser side effects as Gyral drivers, so reducers stay pure: where this page is,
// going to a table, the clipboard, and the reduced-motion setting.
import { command, defineDriver, subscription, type Command } from "@gyral/core"

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
  command(page, { _tag: "Where" }, { onSuccess: (w) => (w === undefined ? undefined : toMsg(w)) })

/** Load another address (a new table's link). */
export const go = (url: string): Command<never> => command(page, { _tag: "Go", url })

/** Copy text to the clipboard. */
export const copy = <M>(text: string, onDone: M, onFailure: (reason: string) => M): Command<M> =>
  command(page, { _tag: "Copy", text }, { onSuccess: () => onDone, onFailure })

// ── motion: prefers-reduced-motion, now and when it changes ──────────────────

const motion = subscription<boolean>("motion", (emit) => {
  if (typeof matchMedia !== "function") {
    emit(false)
    return () => {}
  }
  const query = matchMedia("(prefers-reduced-motion: reduce)")
  emit(query.matches)
  const changed = () => emit(query.matches)
  query.addEventListener("change", changed)
  return () => query.removeEventListener("change", changed)
})

/** Whether the visitor asked for reduced motion (now, then on every change). */
export const reducedMotion = <M>(toMsg: (reduce: boolean) => M): Command<M> =>
  command(motion, undefined, { onSuccess: toMsg, key: "motion" })
