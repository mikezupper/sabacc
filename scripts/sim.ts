// `npm run sim` — play many seeded hands headlessly and print table statistics as
// JSON. Use it to check how rule or opponent-policy changes affect play.
//
//   npm run sim                         # 2000 hands, your seat mirrors the opponent policy
//   npm run sim -- --hands 5000 --you fold   # opponents only (you fold every hand)
import { parseArgs } from "node:util"
import { Effect, Option, Random } from "effect"
import { decideBet, decideCall, decideDraw } from "../src/domain/ai.ts"
import { Command, YOU, type Game, type HandResult } from "../src/domain/model.ts"
import { evaluate } from "../src/domain/scoring.ts"
import { handPot } from "../src/domain/table.ts"
import { createStore } from "../src/state/store.ts"

const { values } = parseArgs({
  options: {
    hands: { type: "string", default: "2000" },
    you: { type: "string", default: "mirror" },
    "hands-per-table": { type: "string", default: "5" },
  },
})
const totalHands = Number(values.hands)
const perTable = Number(values["hands-per-table"])
const policyRandom = Random.make(12345)

/** Your move: fold, or mirror the opponent policy (betting, drawing, calling). */
const yourMove = (g: Game): Command => {
  if (g.phase._tag === "Lobby") return Command.StartHand()
  const step = g.phase.step
  const you = g.seats[YOU]
  if (you === undefined) return Command.Fold()
  if (values.you === "fold") return step._tag === "Betting" ? Command.Fold() : step._tag === "Drawing" ? Command.Stand() : Command.Pass()
  switch (step._tag) {
    case "Betting": {
      const choice = Effect.runSync(
        decideBet(you, { currentBet: step.currentBet, minRaise: step.minRaise, pot: handPot(g) }).pipe(Effect.withRandom(policyRandom)),
      )
      return choice === "check" ? Command.Check() : choice === "match" ? Command.Match() : choice === "allIn" ? Command.AllIn() : choice === "fold" ? Command.Fold() : Command.BetTo({ to: choice.to })
    }
    case "Drawing": {
      const choice = decideDraw(you, g.phase.deck.length)
      if (Option.isSome(choice.lock) && !step.lockedThisTurn) return Command.Lock({ cardId: choice.lock.value })
      return choice.action === "gain" ? Command.Gain() : choice.action === "stand" ? Command.Stand() : Command.Trade({ cardId: choice.action.trade })
    }
    case "CallWindow":
      return decideCall(you, g.phase.round) ? Command.CallHand() : Command.Pass()
  }
}

const results: Array<HandResult & { rounds: number; shifts: number; dealtPure: ReadonlyArray<number> }> = []
let errors = 0
for (let seed = 0; results.length < totalHands; seed++) {
  const store = createStore(seed)
  for (let h = 0; h < perTable && results.length < totalHands; h++) {
    if ((store.game.get().seats[YOU]?.credits ?? 0) < 200) store.dispatch(Command.NewTable())
    const logStart = store.log.get().length
    store.dispatch(Command.StartHand())
    // Before any drawing, hands are still the dealt two cards.
    const dealtPure = store.game.get().phase._tag === "Playing"
      ? store.game.get().seats.filter((s) => s.hand.length === 2 && evaluate(s.hand).pureSabacc).map((s) => s.index)
      : []
    for (let guard = 0; store.game.get().phase._tag === "Playing" && guard < 500; guard++) {
      const before = store.game.get()
      store.dispatch(yourMove(before))
      // A move the engine rejected (e.g. lock already used) falls back to standing pat.
      if (Option.isSome(store.notice.get())) store.dispatch(Command.Stand())
      if (Option.isSome(store.notice.get())) store.dispatch(Command.Pass())
      if (Option.isSome(store.notice.get())) { errors++; break }
    }
    const events = store.log.get().slice(logStart)
    const ended = events.find((e) => e._tag === "HandEnded")
    if (ended?._tag === "HandEnded")
      results.push({
        ...ended.result,
        rounds: events.filter((e) => e._tag === "RoundStarted").length,
        shifts: events.filter((e) => e._tag === "Shifted").length,
        dealtPure,
      })
  }
}

const pct = (n: number) => `${((100 * n) / results.length).toFixed(1)}%`
const revealed = results.filter((r) => r.revealed)
const winnerEval = (r: HandResult) => Option.getOrUndefined(r.seats.find((s) => s.seat === r.winners[0])?.evaluation ?? Option.none())
const kinds = revealed.map((r) => {
  const e = winnerEval(r)
  return r.winners.length === 0 ? "everyone bombed" : e?.idiotsArray ? "Idiot's Array" : e?.pureSabacc ? "Pure Sabacc" : "best total"
})
const shown = revealed.flatMap((r) => r.seats.flatMap((s) => Option.toArray(s.evaluation)))
const winTotals = revealed.flatMap((r) => Option.toArray(Option.fromNullable(winnerEval(r)))).filter((e) => !e.idiotsArray && !e.pureSabacc)

console.log(JSON.stringify({
  hands: results.length,
  yourPolicy: values.you,
  errors,
  avgRounds: +(results.reduce((s, r) => s + r.rounds, 0) / results.length).toFixed(2),
  shiftsPerHand: +(results.reduce((s, r) => s + r.shifts, 0) / results.length).toFixed(2),
  endedByFolds: pct(results.length - revealed.length),
  winsBy: Object.fromEntries(["Idiot's Array", "Pure Sabacc", "best total", "everyone bombed"].map((k) => [k, pct(kinds.filter((x) => x === k).length)])),
  revealedHands: {
    count: shown.length,
    pureSabacc: `${((100 * shown.filter((e) => e.pureSabacc).length) / shown.length).toFixed(1)}%`,
    bombedOut: `${((100 * shown.filter((e) => e.bombedOut).length) / shown.length).toFixed(1)}%`,
  },
  pureSabaccOrigin: {
    handsWithAPureSabaccDealt: pct(results.filter((r) => r.dealtPure.length > 0).length),
    pureWinsThatWereDealt: (() => {
      const pureWins = revealed.filter((r) => winnerEval(r)?.pureSabacc && !winnerEval(r)?.idiotsArray)
      const dealt = pureWins.filter((r) => r.winners.some((w) => r.dealtPure.includes(w)))
      return `${dealt.length}/${pureWins.length}`
    })(),
  },
  medianWinningTotal: [...winTotals.map((e) => Math.abs(e.total))].sort((a, b) => a - b)[Math.floor(winTotals.length / 2)],
}, null, 2))
