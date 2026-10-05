import { Option } from "effect"
import { css, html, LitElement, nothing } from "lit"
import { customElement, property } from "lit/decorators.js"
import { YOU, type Seat, type SeatResult } from "../domain/model.ts"
import { describeEvaluation, evaluate } from "../domain/scoring.ts"
import { base, buttons } from "../styles/shared.ts"
import { formatCredits } from "../presentation/describe.ts"
import "./sabacc-card.ts"

export interface CardActionDetail {
  readonly action: "lock" | "trade"
  readonly cardId: number
}

const statusLabel = (seat: Seat): string =>
  seat.status._tag === "Folded" ? "Folded" : seat.status._tag === "SittingOut" ? "Sitting out" : seat.credits === 0 ? "All-in" : "In the hand"

/**
 * One player's seat. Opponents' cards stay face-down until `reveal`. On your drawing
 * turn (`cardActions`), each card offers Lock and Trade, sent up as `card-action` events.
 */
@customElement("sabacc-seat")
export class SabaccSeat extends LitElement {
  static override styles = [
    base,
    buttons,
    css`
      :host { container-type: inline-size; }
      article {
        display: grid;
        gap: var(--space-xs);
        padding: var(--space-s);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface-raised);
        box-shadow: var(--shadow);
        transition: opacity 200ms ease-out;
      }
      :host([data-out]) article { opacity: 0.6; }
      :host([data-winner]) article { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent), var(--shadow); }
      header { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2xs) var(--space-xs); }
      h3 { font-size: var(--step-1); }
      .credits { margin-inline-start: auto; font-variant-numeric: tabular-nums; color: var(--text-muted); }
      .badges { display: flex; flex-wrap: wrap; gap: var(--space-2xs); }
      .badge { padding: 0.1em 0.6em; border-radius: 999px; font-size: var(--step--1); font-weight: 600; background: var(--surface-sunken); }
      .badge.out { color: var(--text-muted); }
      .badge.dealer, .badge.bet { color: var(--accent); }
      .badge.winner { background: var(--accent); color: var(--accent-text); }
      .badge.penalty { color: var(--negative); }
      ul.cards { display: flex; flex-wrap: wrap; gap: var(--space-s) var(--space-xs); --card-size: clamp(3.5rem, 17cqi, 5.5rem); padding-block-start: var(--space-xs); }
      ul.cards li { display: grid; gap: var(--space-2xs); justify-items: center; }
      .card-actions { display: flex; gap: var(--space-2xs); }
      .card-actions button { min-block-size: 2.75rem; padding-inline: var(--space-xs); font-size: var(--step--1); }
      .total { font-weight: 700; font-variant-numeric: tabular-nums; }
      .total[data-bomb] { color: var(--negative); }
      .total[data-sabacc] { color: var(--accent); }
      .empty { color: var(--text-muted); font-size: var(--step--1); }
    `,
  ]

  @property({ attribute: false }) seat: Seat | undefined = undefined
  @property({ type: Boolean }) reveal = false
  @property({ type: Boolean }) winner = false
  @property({ type: Boolean }) dealer = false
  /** Your drawing turn: show Lock / Trade on each free card. */
  @property({ type: Boolean, attribute: "card-actions" }) cardActions = false
  @property({ type: Boolean, attribute: "can-lock" }) canLock = false
  @property({ type: Boolean, attribute: "can-trade" }) canTrade = false
  @property({ attribute: false }) result: SeatResult | undefined = undefined
  /** Watching a multiplayer table: seat 0 is someone else's. */
  @property({ type: Boolean }) spectating = false
  /** Multiplayer: is the seat's person here, away, or is the AI playing it? */
  @property() presence: "here" | "away" | "ai" | undefined = undefined

  override willUpdate(): void {
    this.toggleAttribute("data-winner", this.winner)
    this.toggleAttribute("data-out", this.seat !== undefined && this.seat.status._tag !== "Active")
  }

  private act(action: CardActionDetail["action"], cardId: number): void {
    this.dispatchEvent(new CustomEvent<CardActionDetail>("card-action", { detail: { action, cardId }, bubbles: true, composed: true }))
  }

  override render() {
    const seat = this.seat
    if (seat === undefined) return nothing
    const mine = seat.index === YOU && !this.spectating
    const show = this.reveal || mine
    const evaluation = this.result?.evaluation.pipe(Option.getOrUndefined) ?? (mine ? evaluate(seat.hand) : undefined)
    const headingId = `seat-${seat.index}`
    return html`<article aria-labelledby=${headingId}>
      <header>
        <h3 id=${headingId}>${mine ? "You" : seat.name}</h3>
        <span class="credits"><span class="visually-hidden">Credits: </span>${formatCredits(seat.credits)} cr</span>
      </header>
      <p class="badges">
        <span class="badge ${seat.status._tag === "Active" ? "" : "out"}">${statusLabel(seat)}</span>
        ${this.dealer ? html`<span class="badge dealer">Dealer</span>` : nothing}
        ${this.presence === "away" ? html`<span class="badge out">Away</span>` : this.presence === "ai" ? html`<span class="badge out">AI</span>` : nothing}
        ${seat.roundBet > 0 ? html`<span class="badge bet">Bet ${formatCredits(seat.roundBet)}</span>` : nothing}
        ${this.winner ? html`<span class="badge winner">Winner</span>` : nothing}
        ${this.result && this.result.penalty > 0 ? html`<span class="badge penalty">Paid ${formatCredits(this.result.penalty)}</span>` : nothing}
      </p>
      ${seat.hand.length === 0
        ? html`<p class="empty">No cards.</p>`
        : html`<ul class="cards" aria-label=${mine ? "Your cards" : `${seat.name}'s cards`}>
            ${seat.hand.map((card) => {
              const locked = seat.field.includes(card.id)
              return html`<li>
                <sabacc-card .card=${show ? card : undefined} ?locked=${locked}></sabacc-card>
                ${this.cardActions && !locked
                  ? html`<span class="card-actions">
                      <button type="button" ?disabled=${!this.canLock} @click=${() => this.act("lock", card.id)}>Lock</button>
                      <button type="button" ?disabled=${!this.canTrade} @click=${() => this.act("trade", card.id)}>Trade</button>
                    </span>`
                  : nothing}
              </li>`
            })}
          </ul>`}
      ${show && evaluation !== undefined && seat.hand.length > 0
        ? html`<p class="total" ?data-bomb=${evaluation.bombedOut} ?data-sabacc=${evaluation.idiotsArray || evaluation.pureSabacc}>
            ${mine && !this.reveal ? "Current hand" : "Hand"}: ${describeEvaluation(evaluation)}${mine && !this.reveal && evaluation.bombedOut ? " (if revealed now)" : ""}
          </p>`
        : nothing}
    </article>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-seat": SabaccSeat
  }
  interface HTMLElementEventMap {
    "card-action": CustomEvent<CardActionDetail>
  }
}
