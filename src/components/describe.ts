// Player-facing wording for domain events and errors. Presentation only: the
// domain decides what happened, this file decides how to say it.
import { Option } from "effect"
import { describeCard } from "../domain/cards.ts"
import { BUY_IN } from "../domain/constants.ts"
import { YOU, type GameError, type GameEvent, type HandResult } from "../domain/model.ts"
import { describeEvaluation } from "../domain/scoring.ts"

const credits = new Intl.NumberFormat("en")
export const formatCredits = (n: number): string => credits.format(n)

export const seatName = (seat: number): string => (seat === YOU ? "You" : `Opponent ${seat}`)
const verb = (seat: number, you: string, them: string) => (seat === YOU ? you : them)

const names = (seats: ReadonlyArray<number>): string => {
  const list = seats.map(seatName)
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`
}

export const describeEvent = (e: GameEvent): string => {
  switch (e._tag) {
    case "TableReset":
      return "New table. Everyone starts with fresh credits."
    case "HandStarted":
      return `New hand. ${seatName(e.dealer)} ${verb(e.dealer, "deal", "deals")}; ${e.seated.length} players ante to both pots.`
    case "SatOut":
      return `${seatName(e.seat)} can't cover the antes and sits this hand out.`
    case "RoundStarted":
      return `Round ${e.round}.`
    case "Checked":
      return `${seatName(e.seat)} ${verb(e.seat, "check", "checks")}.`
    case "BetTo":
      return `${seatName(e.seat)} ${e.raise ? verb(e.seat, "raise", "raises") : verb(e.seat, "bet", "bets")} to ${formatCredits(e.to)}.`
    case "Matched":
      return `${seatName(e.seat)} ${verb(e.seat, "match", "matches")} ${formatCredits(e.to)}.`
    case "WentAllIn":
      return `${seatName(e.seat)} ${verb(e.seat, "go", "goes")} all-in for ${formatCredits(e.to)}.`
    case "Folded":
      return `${seatName(e.seat)} ${verb(e.seat, "fold", "folds")}.`
    case "Gained":
      return e.seat === YOU ? `You gain ${describeCard(e.card)}.` : `${seatName(e.seat)} gains a card.`
    case "Traded":
      return e.seat === YOU
        ? `You trade ${describeCard(e.discarded)} for ${describeCard(e.card)}.`
        : `${seatName(e.seat)} trades a card.`
    case "Stood":
      return `${seatName(e.seat)} ${verb(e.seat, "stand", "stands")}.`
    case "Locked":
      return e.seat === YOU
        ? `You lock ${describeCard(e.card)} in the interference field.`
        : `${seatName(e.seat)} locks a card in the interference field.`
    case "Dice":
      return e.shift ? `The dice show double ${e.dice[0]}.` : `The dice show ${e.dice[0]} and ${e.dice[1]}: no shift.`
    case "Shifted":
      return "Sabacc Shift! Every card outside the interference field changes."
    case "Passed":
      return `${seatName(e.seat)} ${verb(e.seat, "let", "lets")} play continue.`
    case "Called":
      return e.forced ? `The round limit is reached: ${seatName(e.seat)} ${verb(e.seat, "call", "calls")} the hand.` : `${seatName(e.seat)} ${verb(e.seat, "call", "calls")} the hand!`
    case "SuddenDemise":
      return `Sudden demise: ${seatName(e.seat)} ${verb(e.seat, "get", "gets")} ${describeCard(e.card)}.`
    case "Penalty":
      return `${seatName(e.seat)} ${e.reason === "bombed out" ? verb(e.seat, "bomb out and pay", "bombs out and pays") : verb(e.seat, "lose the call and pay", "loses the call and pays")} ${formatCredits(e.amount)} into the Sabacc pot.`
    case "HandEnded":
      return describeResult(e.result)
  }
}

export const describeResult = (r: HandResult): string => {
  if (!r.revealed) return `Everyone else folded. ${names(r.winners)} ${r.winners[0] === YOU ? "win" : "wins"} ${formatCredits(r.handPot)} credits.`
  if (r.winners.length === 0) return `Every hand bombed out. The ${formatCredits(r.handPot)}-credit hand pot goes into the Sabacc pot.`
  const best = Option.getOrUndefined(r.seats.find((s) => s.seat === r.winners[0])?.evaluation ?? Option.none())
  const hand = best === undefined ? "" : ` with ${describeEvaluation(best)}`
  const total = r.seats.filter((s) => r.winners.includes(s.seat)).reduce((sum, s) => sum + s.won, 0)
  const who = names(r.winners)
  const how = r.winners.length > 1 ? "split" : r.winners[0] === YOU ? "win" : "wins"
  const sabacc = r.sabaccPotWon > 0 ? `, including the ${formatCredits(r.sabaccPotWon)}-credit Sabacc pot` : ""
  return `${who} ${how} ${formatCredits(total)} credits${hand}${sabacc}.`
}

export const describeError = (e: GameError): string => {
  switch (e._tag) {
    case "NotYourTurn":
      return `It isn't your turn (waiting on ${e.expected}).`
    case "HandInProgress":
      return "Finish this hand first."
    case "InsufficientCredits":
      return `You need ${formatCredits(BUY_IN)} credits for the antes but have ${formatCredits(e.available)}. Start a new table.`
    case "InvalidBet":
      return e.reason
    case "InvalidCard":
      return e.reason
    case "DeckEmpty":
      return "The deck is empty. You can only stand."
  }
}
