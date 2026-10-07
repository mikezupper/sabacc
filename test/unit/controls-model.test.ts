// <sabacc-controls> as a model: messages in, state and commands out. No DOM, no store.
import { initial, step } from "@gyral/testing"
import { Effect, Random } from "effect"
import { describe, expect, it } from "vitest"
import { MIN_BET } from "../../src/domain/constants.ts"
import { applyCommand } from "../../src/domain/engine.ts"
import { Command, YOU, type Game } from "../../src/domain/model.ts"
import { newTable } from "../../src/domain/table.ts"
import { SabaccControls, type ControlsProps } from "../../src/components/sabacc-controls.ts"

const spec = SabaccControls.spec
const props = (over: Partial<ControlsProps> = {}): ControlsProps => ({
  game: newTable(),
  playing: false,
  pending: 0,
  pick: false,
  selected: undefined,
  spectator: false,
  hideNewTable: false,
  ...over,
})

/** The game after `commands`, played as you with seed 42 (other seats are the AI). */
const after = (...commands: ReadonlyArray<Command>): Game =>
  commands.reduce((g, c) => Effect.runSync(applyCommand(g, c).pipe(Effect.withRandom(Random.make(42)))).game, newTable())

/** The moves a step sent to the table, as game commands. */
const moves = (commands: ReadonlyArray<{ readonly input: unknown }>) =>
  commands.flatMap((c) => {
    const input = c.input as { readonly _tag?: string; readonly command?: Command }
    return input._tag === "Play" && input.command !== undefined ? [input.command] : []
  })

describe("<sabacc-controls> model", () => {
  it("starts with the minimum bet as the draft", () => {
    expect(initial(spec, props()).state).toEqual({ amount: MIN_BET })
  })

  it("sends each button's move to the table, and nothing else", () => {
    const s = { amount: MIN_BET }
    expect(moves(step(spec, s, { _tag: "Deal" }, props()).commands)).toEqual([Command.StartHand()])
    expect(moves(step(spec, s, { _tag: "Fold" }, props()).commands)).toEqual([Command.Fold()])
    expect(moves(step(spec, s, { _tag: "Pass" }, props()).commands)).toEqual([Command.Pass()])
  })

  it("bets the draft amount, clamped to what's allowed right now", () => {
    const game = after(Command.StartHand())
    const me = game.seats[YOU]!
    const high = step(spec, { amount: 999_999 }, { _tag: "Bet" }, props({ game }))
    expect(moves(high.commands)).toEqual([Command.BetTo({ to: me.roundBet + me.credits })])
    const low = step(spec, { amount: 1 }, { _tag: "Bet" }, props({ game }))
    const [bet] = moves(low.commands)
    expect(bet?._tag === "BetTo" && bet.to >= MIN_BET).toBe(true)
  })

  it("keeps the typed amount as the draft", () => {
    expect(step(spec, { amount: MIN_BET }, { _tag: "Amount", amount: 700 }, props()).state).toEqual({ amount: 700 })
  })

  it("locks or trades only the chosen card, and choosing it again un-chooses it", () => {
    expect(moves(step(spec, { amount: MIN_BET }, { _tag: "Lock" }, props()).commands)).toEqual([])
    const game = after(Command.StartHand())
    const card = game.seats[YOU]!.hand[0]!
    const chosen = props({ game, pick: true, selected: card.id })
    expect(moves(step(spec, { amount: MIN_BET }, { _tag: "Trade" }, chosen).commands)).toEqual([Command.Trade({ cardId: card.id })])
    // Choosing goes up to the parent as an output, not to the table.
    const again = step(spec, { amount: MIN_BET }, { _tag: "Choose", cardId: card.id }, chosen)
    expect(moves(again.commands)).toEqual([])
    expect(again.commands).toHaveLength(1)
  })
})
