import { Option } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Command, GameEvent, InvalidBet, type Beat } from "../../src/domain/model.ts"
import { newTable } from "../../src/domain/table.ts"
import { beatDelay, BeatPlayer } from "../../src/presentation/playback.ts"
import { promptFor, yourStep } from "../../src/presentation/prompt.ts"
import { createStore } from "../../src/state/store.ts"
import { sceneBeatDelay } from "../../src/scene/timing.ts"

const beats = (n: number): ReadonlyArray<Beat> =>
  Array.from({ length: n }, (_, i) => ({ event: GameEvent.RoundStarted({ round: i + 1 }), game: newTable() }))

describe("BeatPlayer (shared by the 2D and 3D views)", () => {
  afterEach(() => vi.useRealTimers())

  it("shows beats one at a time with the given delay, then the live game", async () => {
    vi.useFakeTimers()
    let changes = 0
    const player = new BeatPlayer({ onChange: () => changes++, instant: () => false, delay: () => 100 })
    const bs = beats(3)
    player.sync(bs)
    expect(player.revealed).toHaveLength(1)
    expect(player.frame).toBe(bs[0]?.game)
    await vi.advanceTimersByTimeAsync(100)
    expect(player.revealed).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(100)
    expect(player.playing).toBe(false)
    expect(player.frame).toBeUndefined()
    expect(changes).toBe(2)
  })

  it("is instant under reduced motion, and skip shows everything", () => {
    const instant = new BeatPlayer({ onChange: () => {}, instant: () => true })
    instant.sync(beats(4))
    expect(instant.playing).toBe(false)
    const player = new BeatPlayer({ onChange: () => {}, instant: () => false })
    player.sync(beats(4))
    expect(player.pending).toBe(3)
    player.skip()
    expect(player.pending).toBe(0)
    player.stop()
  })

  it("ignores the same beats twice (re-renders don't restart playback)", () => {
    const player = new BeatPlayer({ onChange: () => {}, instant: () => false })
    const bs = beats(3)
    player.sync(bs)
    player.skip()
    player.sync(bs)
    expect(player.playing).toBe(false)
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

  it("tells you what to do on your turn", () => {
    const store = createStore(42)
    store.dispatch(Command.StartHand())
    const game = store.game.get()
    expect(yourStep(game)?._tag).toBe("Betting")
    expect(promptFor({ game, notice: Option.none() })).toMatch(/^Betting:/)
  })
})
