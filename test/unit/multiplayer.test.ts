import { Effect, Either, FastCheck as fc, Option, Random } from "effect"
import { describe, expect, it } from "vitest"
import { BUY_IN } from "../../src/domain/constants.ts"
import { applyCommand } from "../../src/domain/engine.ts"
import { Command, eventsOf, type Controller, type Game, type GameError, type Transition } from "../../src/domain/model.ts"
import { SavedGameJson } from "../../src/domain/schema.ts"
import { newTable, playing } from "../../src/domain/table.ts"
import { hiddenCard, rotate, transitionFor, unrotate, viewFor } from "../../src/domain/view.ts"
import { narratorFor, describeEvent } from "../../src/presentation/describe.ts"
import { Schema } from "effect"

const run = (rng: Random.Random, game: Game, command: Command, actor: number): Either.Either<Transition, GameError> =>
  Effect.runSync(Effect.either(applyCommand(game, command, actor).pipe(Effect.withRandom(rng))))

const ok = (r: Either.Either<Transition, GameError>): Transition =>
  Either.getOrThrowWith(r, (e) => new Error(`unexpected ${e._tag}`))

const seatAs = (game: Game, seat: number, controller: Controller, name: string, rng = Random.make(1)): Game =>
  ok(run(rng, game, Command.Control({ seat, controller, name }), 0)).game

/** Seat 0 (Han) and seat 2 (Lando) are people; the rest is the AI. */
const twoPlayers = (): Game => seatAs(seatAs(newTable(), 0, "Human", "Han"), 2, "Human", "Lando")

/** Whose turn it is, if any. */
const toAct = (g: Game): number | undefined => Option.getOrUndefined(playing(g))?.step.toAct[0]

/** A legal move for the seat to act, chosen by `pick`. */
const legal = (g: Game, pick: number): Command => {
  if (g.phase._tag === "Lobby") return (g.seats[0]?.credits ?? 0) < BUY_IN ? Command.NewTable() : Command.StartHand()
  const step = g.phase.step
  const seat = g.seats[step.toAct[0] ?? 0]!
  const free = seat.hand.find((c) => !seat.field.includes(c.id))
  switch (step._tag) {
    case "Betting": {
      const owe = step.currentBet - seat.roundBet
      const options = owe > 0 ? [Command.Match(), Command.Fold(), Command.AllIn()] : [Command.Check(), Command.BetTo({ to: 100 })]
      return options[Math.floor(pick * options.length)]!
    }
    case "Drawing": {
      const options = [Command.Stand(), Command.Gain(), ...(free ? [Command.Trade({ cardId: free.id })] : []), ...(free && !step.lockedThisTurn ? [Command.Lock({ cardId: free.id })] : [])]
      return options[Math.floor(pick * options.length)]!
    }
    case "CallWindow":
      return pick < 0.3 ? Command.CallHand() : Command.Pass()
  }
}

/** Play random legal moves for whichever person is to act; collect every transition. */
const playMany = (seed: number, picks: ReadonlyArray<number>): ReadonlyArray<Transition> => {
  const rng = Random.make(seed)
  const out: Array<Transition> = []
  let game = twoPlayers()
  for (const pick of picks) {
    const actor = toAct(game) ?? 0
    const r = run(rng, game, legal(game, pick), actor)
    if (Either.isLeft(r)) continue
    out.push(r.right)
    game = r.right.game
  }
  return out
}

describe("several people at one table", () => {
  it("waits for each person on their turn and refuses moves out of turn", () => {
    const rng = Random.make(3)
    let game = ok(run(rng, twoPlayers(), Command.StartHand(), 0)).game
    // Play until someone is asked to act; it must be one of the people.
    for (let i = 0; i < 30 && game.phase._tag === "Playing"; i++) {
      const who = toAct(game)
      expect(who === 0 || who === 2).toBe(true)
      const other = who === 0 ? 2 : 0
      expect(Either.isLeft(run(rng, game, legal(game, 0), other))).toBe(true)
      game = ok(run(rng, game, legal(game, 0), who ?? 0)).game
    }
  })

  it("lets the AI take a seat and play on at once", () => {
    const rng = Random.make(4)
    let game = ok(run(rng, twoPlayers(), Command.StartHand(), 0)).game
    for (let i = 0; i < 20 && toAct(game) !== 2 && game.phase._tag === "Playing"; i++) game = ok(run(rng, game, legal(game, 0), toAct(game) ?? 0)).game
    expect(toAct(game)).toBe(2)
    const t = ok(run(rng, game, Command.Control({ seat: 2, controller: "Ai", name: "Lando" }), 0))
    expect(eventsOf(t)[0]).toEqual(expect.objectContaining({ _tag: "Seated", seat: 2, controller: "Ai" }))
    expect(toAct(t.game)).not.toBe(2)
  })

  it("keeps names and who plays each seat on a new table", () => {
    const t = ok(run(Random.make(1), twoPlayers(), Command.NewTable(), 0))
    expect(t.game.seats.map((s) => [s.name, s.controller])).toEqual([
      ["Han", "Human"],
      ["Opponent 1", "Ai"],
      ["Lando", "Human"],
      ["Opponent 3", "Ai"],
      ["Opponent 4", "Ai"],
    ])
  })

  it("narrates with names, and 'you' only for the viewer", () => {
    const game = twoPlayers()
    expect(describeEvent({ _tag: "Folded", seat: 2 }, narratorFor(game, 0))).toBe("Lando folds.")
    expect(describeEvent({ _tag: "Folded", seat: 2 }, narratorFor(game, 2))).toBe("You fold.")
    expect(describeEvent({ _tag: "Folded", seat: 0 }, narratorFor(game, undefined))).toBe("Han folds.")
  })
})

describe("viewFor (what one player may see)", () => {
  it("rotates seats so the viewer is seat 0, and back", () => {
    const lens = { viewer: 2, seats: 5 }
    expect(rotate(lens, 2)).toBe(0)
    expect(rotate(lens, 1)).toBe(4)
    for (let s = 0; s < 5; s++) expect(unrotate(lens, rotate(lens, s))).toBe(s)
    const view = viewFor(twoPlayers(), 2)
    expect(view.seats[0]?.name).toBe("Lando")
    expect(view.seats.map((s) => s.index)).toEqual([0, 1, 2, 3, 4])
  })

  it("never shows another player's cards or the deck, at any beat", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), fc.array(fc.double({ min: 0, max: 0.999, noNaN: true }), { minLength: 5, maxLength: 50 }), (seed, picks) => {
        for (const t of playMany(seed, picks))
          for (const viewer of [0, 2, undefined]) {
            const seen = transitionFor(t, viewer)
            for (const beat of [...seen.beats, { game: seen.game, event: undefined }]) {
              const g = beat.game
              const last = g.phase._tag === "Lobby" ? Option.getOrUndefined(g.phase.lastHand) : undefined
              const shown = new Set(last?.revealed ? last.seats.filter((r) => Option.isSome(r.evaluation)).map((r) => r.seat) : [])
              for (const s of g.seats) {
                if ((viewer !== undefined && s.index === 0) || shown.has(s.index)) continue
                for (const c of s.hand) expect(c).toEqual(hiddenCard(c.id))
              }
              if (g.phase._tag === "Playing") for (const c of g.phase.deck) expect(c).toEqual(hiddenCard(c.id))
              const e = beat.event
              if (e && (e._tag === "Gained" || e._tag === "Locked") && !(viewer !== undefined && e.seat === 0)) expect(e.card).toEqual(hiddenCard(e.card.id))
              if (e && e._tag === "Traded" && !(viewer !== undefined && e.seat === 0)) expect(e.card).toEqual(hiddenCard(e.card.id))
            }
          }
      }),
      { numRuns: 40 },
    )
  })

  it("shows your own cards and the same credits as the table", () => {
    const [t] = playMany(9, [0.1])
    const game = t!.game
    const view = viewFor(game, 2)
    expect(view.seats[0]?.hand).toEqual(game.seats[2]?.hand)
    expect(view.seats.map((s) => s.credits).sort()).toEqual(game.seats.map((s) => s.credits).sort())
  })
})

describe("saved tables from before multiplayer", () => {
  it("load as solo tables (seat 0 is you, the rest the AI)", () => {
    const v2 = Schema.encodeSync(SavedGameJson)({ version: 2, game: newTable() })
    const v1 = JSON.parse(v2) as { version: number; game: { seats: Array<Record<string, unknown>> } }
    v1.version = 1
    for (const s of v1.game.seats) delete s["controller"]
    const loaded = Schema.decodeUnknownSync(SavedGameJson)(JSON.stringify(v1))
    expect(loaded.game.seats.map((s) => s.controller)).toEqual(["Human", "Ai", "Ai", "Ai", "Ai"])
  })
})
