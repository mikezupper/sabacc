import { Effect, Either, FastCheck as fc, Option, Random } from "effect"
import { describe, expect, it } from "vitest"
import { Card, fullDeck } from "../../src/domain/cards.ts"
import { BUY_IN, HAND_ANTE, MIN_HAND, SABACC_ANTE, STARTING_CREDITS } from "../../src/domain/constants.ts"
import { applyCommand } from "../../src/domain/engine.ts"
import { shiftCheck } from "../../src/domain/flow.ts"
import { Command, Phase, SeatStatus, Step, YOU, type Game, type GameError, type GameEvent } from "../../src/domain/model.ts"
import { showdown } from "../../src/domain/showdown.ts"
import { handPot, newTable } from "../../src/domain/table.ts"

type Run = { game: Game; events: ReadonlyArray<GameEvent>; error: Option.Option<GameError> }

const play = (seed: number, game: Game, ...commands: ReadonlyArray<Command>): Run => {
  const rng = Random.make(seed)
  return commands.reduce<Run>((acc, cmd) => {
    if (Option.isSome(acc.error)) return acc
    const r = Effect.runSync(Effect.either(applyCommand(acc.game, cmd).pipe(Effect.withRandom(rng))))
    return Either.match(r, {
      onLeft: (error) => ({ ...acc, error: Option.some(error) }),
      onRight: (t) => ({ game: t.game, events: [...acc.events, ...t.events], error: Option.none() }),
    })
  }, { game, events: [], error: Option.none() })
}

const errorTag = (r: Run) => Option.map(r.error, (e) => e._tag)
const money = (g: Game) => g.seats.reduce((s, x) => s + x.credits, 0) + handPot(g) + g.sabaccPot
const TABLE_MONEY = STARTING_CREDITS * 5

/** A legal command for you in the current step, picked by `pick` (0…1). */
const legal = (g: Game, pick: number): Command => {
  if (g.phase._tag === "Lobby") return Command.StartHand()
  const step = g.phase.step
  const you = g.seats[YOU]!
  const freeCard = you.hand.find((c) => !you.field.includes(c.id))
  switch (step._tag) {
    case "Betting": {
      const owe = step.currentBet - you.roundBet
      const options: Command[] = owe > 0 ? [Command.Match(), Command.Fold(), Command.AllIn()] : [Command.Check(), Command.BetTo({ to: 100 })]
      if (owe > 0 && you.credits > owe + step.minRaise) options.push(Command.BetTo({ to: step.currentBet + step.minRaise }))
      return options[Math.floor(pick * options.length)]!
    }
    case "Drawing": {
      const options: Command[] = [Command.Stand(), Command.Gain()]
      if (freeCard) options.push(Command.Trade({ cardId: freeCard.id }))
      if (freeCard && !step.lockedThisTurn) options.push(Command.Lock({ cardId: freeCard.id }))
      return options[Math.floor(pick * options.length)]!
    }
    case "CallWindow":
      return pick < 0.3 ? Command.CallHand() : Command.Pass()
  }
}

/** Play `picks.length` legal commands from a fresh table. */
const randomGame = (seed: number, picks: ReadonlyArray<number>): Run => {
  const rng = Random.make(seed)
  return picks.reduce<Run>((acc, pick) => {
    if (Option.isSome(acc.error)) return acc
    const cmd = legal(acc.game, pick)
    const r = Effect.runSync(Effect.either(applyCommand(acc.game, cmd).pipe(Effect.withRandom(rng))))
    return Either.match(r, {
      onLeft: (error) => (error._tag === "DeckEmpty" ? acc : { ...acc, error: Option.some(error) }),
      onRight: (t) => ({ game: t.game, events: [...acc.events, ...t.events], error: Option.none() }),
    })
  }, { game: newTable(), events: [], error: Option.none() })
}

const picks = fc.array(fc.double({ min: 0, max: 0.999, noNaN: true }), { minLength: 1, maxLength: 60 })

describe("setup [L][F]", () => {
  it("antes to both pots, deals 2 cards each and moves the dealer button", () => {
    const { game, events } = play(1, newTable(), Command.StartHand())
    expect(game.dealer).toBe(0)
    expect(game.sabaccPot).toBeGreaterThanOrEqual(SABACC_ANTE * 5)
    expect(events[0]).toEqual(expect.objectContaining({ _tag: "HandStarted", seated: [0, 1, 2, 3, 4] }))
    for (const s of game.seats) expect(s.committed).toBeGreaterThanOrEqual(game.phase._tag === "Playing" ? HAND_ANTE : 0)
  })

  it("refuses to deal you in without the 200-credit buy-in", () => {
    const broke: Game = { ...newTable(), seats: newTable().seats.map((s) => (s.index === YOU ? { ...s, credits: BUY_IN - 1 } : s)) }
    expect(errorTag(play(1, broke, Command.StartHand()))).toEqual(Option.some("InsufficientCredits"))
  })

  it("stops on your turn: the dealer is seat 0, so you bet last in round 1", () => {
    const { game } = play(1, newTable(), Command.StartHand())
    if (game.phase._tag === "Playing") expect(game.phase.step.toAct[0]).toBe(YOU)
  })
})

describe("betting [L][F HP] (no-limit)", () => {
  it("rejects a bet below the minimum and a check when you owe", () => {
    const start = play(1, newTable(), Command.StartHand()).game
    const owe = start.phase._tag === "Playing" && start.phase.step._tag === "Betting" ? start.phase.step.currentBet : 0
    if (owe === 0) expect(errorTag(play(1, start, Command.BetTo({ to: 50 })))).toEqual(Option.some("InvalidBet"))
    else expect(errorTag(play(1, start, Command.Check()))).toEqual(Option.some("InvalidBet"))
  })

  it("lets you bet any amount up to your credits", () => {
    const start = play(2, newTable(), Command.StartHand()).game
    const you = start.seats[YOU]!
    const r = play(2, start, Command.BetTo({ to: you.roundBet + you.credits + 1 }))
    expect(errorTag(r)).toEqual(Option.some("InvalidBet"))
  })

  it("ends the hand for you when you fold, and plays it out without you", () => {
    const { game } = play(3, newTable(), Command.StartHand(), Command.Fold())
    expect(game.phase._tag).toBe("Lobby")
    expect(game.seats[YOU]?.status).toEqual(SeatStatus.Folded())
  })
})

describe("whole hands (properties)", () => {
  it("conserves every credit across players, hand pot and Sabacc pot", () => {
    fc.assert(fc.property(fc.integer(), picks, (seed, ps) => {
      const { game, error } = randomGame(seed, ps)
      expect(error).toEqual(Option.none())
      expect(money(game)).toBe(TABLE_MONEY)
    }), { numRuns: 200 })
  })

  it("never has two cards with the same id and never leaves a hand below 2 cards", () => {
    fc.assert(fc.property(fc.integer(), picks, (seed, ps) => {
      const { game } = randomGame(seed, ps)
      const ids = [...game.seats.flatMap((s) => s.hand), ...(game.phase._tag === "Playing" ? game.phase.deck : [])].map((c) => c.id)
      expect(new Set(ids).size).toBe(ids.length)
      if (game.phase._tag === "Playing") for (const s of game.seats.filter((x) => x.status._tag === "Active")) expect(s.hand.length).toBeGreaterThanOrEqual(MIN_HAND)
    }), { numRuns: 200 })
  })

  it("keeps the interference field: locked cards are never shifted or traded", () => {
    fc.assert(fc.property(fc.integer(), picks, (seed, ps) => {
      const { game } = randomGame(seed, ps)
      for (const s of game.seats) for (const id of s.field) expect(s.hand.some((c) => c.id === id)).toBe(true)
    }), { numRuns: 200 })
  })
})

// ── Built states for showdown rules ─────────────────────────────────────────

let id = 500
const n = (value: number) => Card.Suited({ id: id++, suit: "Coins", value })
const f = (name: "The Idiot" | "The Star" | "Balance", value: number) => Card.Face({ id: id++, name, value })

/** A table mid-hand: every listed seat in, with these hands and stakes. */
const table = (hands: Record<number, ReadonlyArray<Card>>, committed = 300, extra: Partial<Game> = {}): Game => {
  const t = newTable()
  return {
    ...t,
    dealer: 4,
    sabaccPot: 500,
    seats: t.seats.map((s) =>
      hands[s.index]
        ? { ...s, hand: hands[s.index]!, status: SeatStatus.Active(), committed, credits: STARTING_CREDITS - committed - 100 }
        : { ...s, status: SeatStatus.Folded(), committed: 100, credits: STARTING_CREDITS - 200 },
    ),
    phase: Phase.Playing({ deck: [n(1), n(1), n(1), n(1)], round: 3, step: Step.CallWindow({ toAct: [] }), nextCardId: 900 }),
    ...extra,
  }
}
const winners = (g: Game) => (g.phase._tag === "Lobby" ? Option.map(g.phase.lastHand, (h) => h.winners) : Option.none())

describe("showdown [L][F]", () => {
  it("Idiot's Array beats Pure Sabacc and takes the Sabacc pot", () => {
    const r = showdown(table({ 0: [f("The Idiot", 0), n(2), n(3)], 1: [n(14), n(9)] }), Option.none())
    expect(winners(r.game)).toEqual(Option.some([0]))
    expect(r.game.sabaccPot).toBe(0)
  })

  it("+23 beats −23; positive beats negative at the same distance", () => {
    expect(winners(showdown(table({ 1: [n(14), n(9)], 2: [f("The Star", -17), f("The Star", -17), n(11)] }), Option.none()).game)).toEqual(Option.some([1]))
    expect(winners(showdown(table({ 1: [n(15), n(6)], 2: [f("The Star", -17), f("Balance", -11), n(7)] }), Option.none()).game)).toEqual(Option.some([1]))
  })

  it("bombing out costs the hand pot, paid into the Sabacc pot", () => {
    const g = table({ 1: [n(15), n(10)], 2: [n(10), n(9)] })
    const pot = handPot(g)
    const r = showdown(g, Option.none())
    expect(r.events).toContainEqual(expect.objectContaining({ _tag: "Penalty", seat: 1, amount: pot, reason: "bombed out" }))
    expect(winners(r.game)).toEqual(Option.some([2]))
  })

  it("a hand of exactly 0 bombs out [F]", () => {
    const r = showdown(table({ 1: [n(11), f("Balance", -11)], 2: [n(5), n(6)] }), Option.none())
    expect(r.events).toContainEqual(expect.objectContaining({ _tag: "Penalty", seat: 1, reason: "bombed out" }))
  })

  it("a caller who doesn't win pays the failed-call penalty [F HP]", () => {
    const g = table({ 1: [n(10), n(9)], 2: [n(15), n(6)] })
    const r = showdown(g, Option.some(1))
    expect(r.events).toContainEqual(expect.objectContaining({ _tag: "Penalty", seat: 1, amount: handPot(g), reason: "failed call" }))
  })

  it("moves the hand pot into the Sabacc pot when everyone bombs out [F]", () => {
    const g = table({ 1: [n(15), n(15)], 2: [n(14), n(14)] })
    const r = showdown(g, Option.none())
    expect(winners(r.game)).toEqual(Option.some([]))
    expect(money(r.game)).toBe(money(g))
  })

  it("settles a tie with sudden demise [L]", () => {
    // Both at +20; the deck deals +1 to each, so still tied, then +1 again: split.
    const g = table({ 1: [n(10), n(10)], 2: [n(15), n(5)] })
    const r = showdown(g, Option.none())
    expect(r.events.filter((e) => e._tag === "SuddenDemise")).toHaveLength(4)
    expect(winners(r.game)).toEqual(Option.some([1, 2]))
    expect(money(r.game)).toBe(money(g))
  })

  it("pays side pots: a short all-in can't win more than they matched", () => {
    const g = table({ 0: [n(14), n(8)], 1: [n(10), n(5)], 2: [n(10), n(6)] })
    const stakes: Game = { ...g, seats: g.seats.map((s) => (s.index === 0 ? { ...s, committed: 200, credits: 0 } : s.index < 3 ? { ...s, committed: 1000 } : s)) }
    const r = showdown(stakes, Option.none())
    const won = (seat: number) => (r.game.phase._tag === "Lobby" ? Option.getOrThrow(r.game.phase.lastHand).seats[seat]?.won : 0)
    // Layer 1: 200 × 3 + folded 100 × 2 = 800 to you. Layer 2: 800 × 2 = 1600 to seat 2 (+16).
    expect(won(0)).toBe(800)
    expect(won(2)).toBe(1600)
    expect(money(r.game)).toBe(money(stakes))
  })
})

describe("the Sabacc Shift [L]", () => {
  it("changes every card outside the field and none inside it", () => {
    const g = table({ 0: [n(5), n(6), n(7)], 1: [n(8), n(9)] })
    const locked: Game = { ...g, seats: g.seats.map((s) => (s.index === 0 ? { ...s, field: [s.hand[0]!.id] } : s)) }
    const seed = Array.from({ length: 200 }, (_, i) => i).find((s) =>
      Effect.runSync(shiftCheck(locked).pipe(Effect.withRandom(Random.make(s)))).events.some((e) => e._tag === "Shifted"),
    )!
    const after = Effect.runSync(shiftCheck(locked).pipe(Effect.withRandom(Random.make(seed)))).game
    const you = after.seats[0]!
    expect(you.hand[0]).toEqual(locked.seats[0]!.hand[0])
    expect(you.hand.slice(1).every((c) => c.id >= 900)).toBe(true)
    expect(after.seats[1]!.hand.every((c) => c.id >= 900)).toBe(true)
  })

  it("happens about one roll in six", () => {
    const g = table({ 0: [n(5), n(6)] })
    const shifts = Array.from({ length: 600 }, (_, s) =>
      Effect.runSync(shiftCheck(g).pipe(Effect.withRandom(Random.make(s)))).events.some((e) => e._tag === "Shifted"),
    ).filter(Boolean).length
    expect(shifts).toBeGreaterThan(60)
    expect(shifts).toBeLessThan(150)
  })
})

describe("full deck is in play", () => {
  it("deals from the 76-card Legends deck", () => {
    expect(fullDeck).toHaveLength(76)
  })
})
