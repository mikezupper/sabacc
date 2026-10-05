// Name plates over the 3D table (HTML, positioned by CSS2DRenderer): the same facts
// as the 2D seat cards, with the same wording. Styled by <sabacc-3d>.
import { Option } from "effect"
import { html, nothing, render } from "lit"
import type { Seat, SeatResult } from "../domain/model.ts"
import { describeEvaluation, evaluate } from "../domain/scoring.ts"
import { formatCredits } from "../presentation/describe.ts"

export interface PlateData {
  readonly seat: Seat
  /** This seat is the viewer's (never for a spectator). */
  readonly mine: boolean
  /** Multiplayer: is the seat's person here, away, or is the AI playing it? */
  readonly presence: "here" | "away" | "ai" | undefined
  readonly dealer: boolean
  readonly active: boolean
  readonly revealed: boolean
  readonly result: SeatResult | undefined
  readonly winner: boolean
}

const status = (s: Seat): string =>
  s.status._tag === "Folded" ? "Folded" : s.status._tag === "SittingOut" ? "Sitting out" : s.credits === 0 && s.hand.length > 0 ? "All-in" : ""

export const renderPlate = (el: HTMLElement, d: PlateData): void => {
  const { seat } = d
  const mine = d.mine
  const evaluation = d.result?.evaluation.pipe(Option.getOrUndefined) ?? (mine && seat.hand.length > 0 ? evaluate(seat.hand) : undefined)
  const showHand = (mine || d.revealed) && evaluation !== undefined
  el.toggleAttribute("data-active", d.active)
  el.toggleAttribute("data-winner", d.winner)
  el.toggleAttribute("data-out", seat.status._tag !== "Active")
  el.toggleAttribute("data-mine", mine)
  render(
    html`<strong>${mine ? "You" : seat.name}</strong>
      <span class="credits">${formatCredits(seat.credits)} cr</span>
      <span class="tags">
        ${d.dealer ? html`<span class="tag dealer">Dealer</span>` : nothing}
        ${d.presence === "away" ? html`<span class="tag">Away</span>` : d.presence === "ai" ? html`<span class="tag">AI</span>` : nothing}
        ${status(seat) !== "" ? html`<span class="tag">${status(seat)}</span>` : nothing}
        ${seat.roundBet > 0 ? html`<span class="tag bet">Bet ${formatCredits(seat.roundBet)}</span>` : nothing}
        ${d.winner ? html`<span class="tag win">Winner</span>` : nothing}
        ${d.result && d.result.penalty > 0 ? html`<span class="tag loss">Paid ${formatCredits(d.result.penalty)}</span>` : nothing}
      </span>
      ${showHand
        ? html`<span class="hand" ?data-bomb=${evaluation.bombedOut} ?data-sabacc=${evaluation.idiotsArray || evaluation.pureSabacc}
            >${describeEvaluation(evaluation)}</span
          >`
        : nothing}`,
    el,
  )
}

export const renderPot = (el: HTMLElement, label: string, amount: number): void => {
  render(html`<span>${label}</span> <strong>${formatCredits(amount)}</strong>`, el)
}
