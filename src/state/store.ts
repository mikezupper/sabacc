import { signal } from "@lit-labs/signals"
import { Effect, Either, Option, Random } from "effect"
import { applyCommand } from "../domain/engine.ts"
import type { Command, Game, GameError, GameEvent } from "../domain/model.ts"
import { newTable } from "../domain/table.ts"

/**
 * The app's single runtime boundary (ARCHITECTURE.md "Data flow"). Every command
 * runs `applyCommand` once, synchronously, with this store's seeded Random, so a
 * seed plus a command sequence always reproduces the same game.
 */
export const createStore = (seed: number) => {
  const random = Random.make(seed)
  const game = signal<Game>(newTable())
  const log = signal<ReadonlyArray<GameEvent>>([])
  /** Events from the most recent successful command only. */
  const last = signal<ReadonlyArray<GameEvent>>([])
  const notice = signal<Option.Option<GameError>>(Option.none())

  const dispatch = (command: Command): void => {
    const result = Effect.runSync(Effect.either(applyCommand(game.get(), command).pipe(Effect.withRandom(random))))
    Either.match(result, {
      onLeft: (error) => notice.set(Option.some(error)),
      onRight: (t) => {
        game.set(t.game)
        last.set(t.events)
        log.set(command._tag === "NewTable" ? t.events : [...log.get(), ...t.events])
        notice.set(Option.none())
      },
    })
  }

  return { seed, game, log, last, notice, dispatch } as const
}

export type Store = ReturnType<typeof createStore>
