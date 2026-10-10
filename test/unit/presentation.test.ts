import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { Command, GameEvent, InvalidBet, type Beat } from "../../src/domain/model.ts"
import { newTable } from "../../src/domain/table.ts"
import { advancePlayback, beatDelay, frame, isPlaying, nextDelay, noPlayback, pending, revealed, skipPlayback, startPlayback } from "../../src/presentation/playback.ts"
import { promptFor, yourStep } from "../../src/presentation/prompt.ts"
import { createStore } from "../../src/state/store.ts"
import { sceneBeatDelay } from "../../src/scene/timing.ts"

const beats = (n: number): ReadonlyArray<Beat> =>
  Array.from({ length: n }, (_, i) => ({ event: GameEvent.RoundStarted({ round: i + 1 }), game: newTable() }))

describe("playback model (shared by the classic and 3D views)", () => {
  it("shows beats one at a time, then the live game", () => {
    const bs = beats(3)
    let p = startPlayback(noPlayback, bs, false)
    expect(revealed(p)).toHaveLength(1)
    expect(frame(p, newTable())).toBe(bs[0]?.game)
    expect(nextDelay(p, () => 100)).toBe(100)
    p = advancePlayback(p, p.run, p.shown)
    expect(revealed(p)).toHaveLength(2)
    p = advancePlayback(p, p.run, p.shown)
    expect(isPlaying(p)).toBe(false)
    expect(nextDelay(p)).toBeUndefined()
    const live = newTable()
    expect(frame(p, live)).toBe(live)
  })

  it("is instant when asked (reduced motion), and skip shows everything", () => {
    expect(isPlaying(startPlayback(noPlayback, beats(4), true))).toBe(false)
    const p = startPlayback(noPlayback, beats(4), false)
    expect(pending(p)).toBe(3)
    expect(pending(skipPlayback(p))).toBe(0)
  })

  it("ignores a timer from an older playback", () => {
    const first = startPlayback(noPlayback, beats(3), false)
    const second = startPlayback(first, beats(3), false)
    expect(advancePlayback(second, first.run, first.shown)).toBe(second)
  })

  it("ignores a duplicate timer from an earlier step of the same playback", () => {
    const first = startPlayback(noPlayback, beats(3), false)
    const second = advancePlayback(first, first.run, first.shown)
    expect(advancePlayback(second, first.run, first.shown)).toBe(second)
  })

  it("holds every beat at least as long in 3D as in 2D", () => {
    const events = [
      GameEvent.HandStarted({ dealer: 0, seated: [0, 1] }),
      GameEvent.Dice({ dice: [3, 3], shift: true }),
      GameEvent.Shifted({ changed: [] }),
      GameEvent.Checked({ seat: 1 }),
      GameEvent.Folded({ seat: 2 }),
    ]
    for (const e of events) expect(sceneBeatDelay(e)).toBeGreaterThanOrEqual(beatDelay(e))
  })
})

describe("promptFor (shared status line)", () => {
  it("welcomes you at a new table and narrates a beat being played", () => {
    const game = newTable()
    expect(promptFor({ game, notice: Option.none() })).toContain("Deal a hand")
    expect(promptFor({ game, notice: Option.none(), beat: GameEvent.Folded({ seat: 2 }) })).toBe("Opponent 2 folds.")
    expect(promptFor({ game, notice: Option.none(), welcomeBack: true })).toMatch(/^Welcome back/)
  })

  it("puts a rejected command first", () => {
    const text = promptFor({ game: newTable(), notice: Option.some(new InvalidBet({ reason: "Too small." })) })
    expect(text).toBe("Too small.")
  })

  it("names the person you're waiting for at a multiplayer table", async () => {
    const { narratorFor } = await import("../../src/presentation/describe.ts")
    const { setStep } = await import("../../src/domain/table.ts")
    const { Phase, Step } = await import("../../src/domain/model.ts")
    const base = newTable()
    const game = setStep(
      { ...base, seats: base.seats.map((s) => (s.index === 2 ? { ...s, name: "Lando", controller: "Human" as const } : s)), phase: Phase.Playing({ deck: [], round: 1, step: Step.Drawing({ toAct: [], lockedThisTurn: false }), nextCardId: 0 }) },
      Step.Betting({ toAct: [2, 0], currentBet: 0, minRaise: 100 }),
    )
    expect(promptFor({ game, notice: Option.none(), who: narratorFor(game, 0) })).toBe("Waiting for Lando…")
  })

  it("tells you what to do on your turn", () => {
    const store = createStore(42)
    store.dispatch(Command.StartHand())
    const game = store.game.get()
    expect(yourStep(game)?._tag).toBe("Betting")
    expect(promptFor({ game, notice: Option.none() })).toMatch(/^Betting:/)
  })
})
