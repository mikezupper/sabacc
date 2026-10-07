// The store's observable values: a value with get/set and change listeners. All the
// views need is "tell me when something changed" (the table driver coalesces changes
// into one snapshot per microtask), so this replaces a signals library.

export interface Cell<T> {
  get(): T
  /** Notifies listeners only when the value actually changes (`Object.is`). */
  set(value: T): void
  /** Call `listener` after every change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
}

export const cell = <T>(initial: T): Cell<T> => {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      for (const listener of [...listeners]) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
