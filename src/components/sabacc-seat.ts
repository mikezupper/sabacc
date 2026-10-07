// One player's seat. Opponents' cards stay face-down until `reveal`. On your drawing
// turn (`card-actions`), each free card offers Lock and Trade, sent up as outputs.
import { Option } from "effect"
import { css, define, emit, html, intents, nothing, prop, type PropsOf, type Stateless } from "@gyral/core"
import { YOU, type Seat } from "../domain/model.ts"
import { describeEvaluation, evaluate } from "../domain/scoring.ts"
import { formatCredits } from "../presentation/describe.ts"
import { base, buttons } from "../styles/shared.ts"
import { checked, seatResultSchema, seatSchema } from "./prop-schemas.ts"
import "./sabacc-card.ts"

/** Lock or Trade one of your cards (the parent sends the move). */
export type SeatOutput = { readonly _tag: "CardAction"; readonly action: "lock" | "trade"; readonly cardId: number }

type Msg = { readonly _tag: "Lock"; readonly cardId: number } | { readonly _tag: "Trade"; readonly cardId: number }

const i = intents<Msg>()

const PRESENCE = ["here", "away", "ai"] as const
const presenceSchema = checked<(typeof PRESENCE)[number] | undefined>("here, away or ai", (u): u is (typeof PRESENCE)[number] | undefined =>
  u === undefined || PRESENCE.some((p) => p === u),
)

const props = {
  seat: prop.value(seatSchema),
  reveal: prop.boolean(),
  winner: prop.boolean(),
  dealer: prop.boolean(),
  /** Your drawing turn: show Lock / Trade on each free card. */
  cardActions: prop.boolean(),
  canLock: prop.boolean(),
  canTrade: prop.boolean(),
  result: prop.value(seatResultSchema),
  /** Watching a multiplayer table: seat 0 is someone else's. */
  spectating: prop.boolean(),
  /** Multiplayer: is the seat's person here, away, or is the AI playing it? */
  presence: prop.value(presenceSchema),
}
type Props = PropsOf<typeof props>

const statusLabel = (seat: Seat): string =>
  seat.status._tag === "Folded" ? "Folded" : seat.status._tag === "SittingOut" ? "Sitting out" : seat.credits === 0 ? "All-in" : "In the hand"

const cardId = (value: string | undefined): number | undefined => {
  const n = Number(value)
  return value !== undefined && value !== "" && Number.isInteger(n) ? n : undefined
}

export const SabaccSeat = define<Stateless, Msg, Props, SeatOutput>("sabacc-seat", {
  props,
  intent: {
    Lock: ({ value }) => {
      const id = cardId(value)
      return id === undefined ? undefined : { _tag: "Lock", cardId: id }
    },
    Trade: ({ value }) => {
      const id = cardId(value)
      return id === undefined ? undefined : { _tag: "Trade", cardId: id }
    },
  },
  update: {
    Lock: (s, m) => [s, [emit({ _tag: "CardAction", action: "lock", cardId: m.cardId } satisfies SeatOutput)]],
    Trade: (s, m) => [s, [emit({ _tag: "CardAction", action: "trade", cardId: m.cardId } satisfies SeatOutput)]],
  },
  view: (_s, _i, { props: p }) => {
    const seat = p.seat
    if (seat === undefined) return nothing
    const mine = seat.index === YOU && !p.spectating
    const show = p.reveal || mine
    const evaluation = p.result?.evaluation.pipe(Option.getOrUndefined) ?? (mine ? evaluate(seat.hand) : undefined)
    const headingId = `seat-${seat.index}`
    const out = seat.status._tag !== "Active"
    return html`<article aria-labelledby=${headingId} class="${p.winner ? "winner" : ""} ${out ? "out" : ""}">
      <header>
        <h3 id=${headingId}>${mine ? "You" : seat.name}</h3>
        <span class="credits"><span class="visually-hidden">Credits: </span>${formatCredits(seat.credits)} cr</span>
      </header>
      <p class="badges">
        <span class="badge ${out ? "out" : ""}">${statusLabel(seat)}</span>
        ${p.dealer ? html`<span class="badge dealer">Dealer</span>` : nothing}
        ${p.presence === "away" ? html`<span class="badge out">Away</span>` : p.presence === "ai" ? html`<span class="badge out">AI</span>` : nothing}
        ${seat.roundBet > 0 ? html`<span class="badge bet">Bet ${formatCredits(seat.roundBet)}</span>` : nothing}
        ${p.winner ? html`<span class="badge winner">Winner</span>` : nothing}
        ${p.result && p.result.penalty > 0 ? html`<span class="badge penalty">Paid ${formatCredits(p.result.penalty)}</span>` : nothing}
      </p>
      ${seat.hand.length === 0
        ? html`<p class="empty">No cards.</p>`
        : html`<ul class="cards" aria-label=${mine ? "Your cards" : `${seat.name}'s cards`}>
            ${seat.hand.map((card) => {
              const locked = seat.field.includes(card.id)
              return html`<li>
                <sabacc-card .card=${show ? card : undefined} ?locked=${locked}></sabacc-card>
                ${p.cardActions && !locked
                  ? html`<span class="card-actions">
                      <button type="button" value=${card.id} ?disabled=${!p.canLock} data-intent=${i.Lock}>Lock</button>
                      <button type="button" value=${card.id} ?disabled=${!p.canTrade} data-intent=${i.Trade}>Trade</button>
                    </span>`
                  : nothing}
              </li>`
            })}
          </ul>`}
      ${show && evaluation !== undefined && seat.hand.length > 0
        ? html`<p class="total" ?data-bomb=${evaluation.bombedOut} ?data-sabacc=${evaluation.idiotsArray || evaluation.pureSabacc}>
            ${mine && !p.reveal ? "Current hand" : "Hand"}: ${describeEvaluation(evaluation)}${mine && !p.reveal && evaluation.bombedOut ? " (if revealed now)" : ""}
          </p>`
        : nothing}
    </article>`
  },
  styles: [
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
      article.out { opacity: 0.6; }
      article.winner { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent), var(--shadow); }
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
  ],
})

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-seat": InstanceType<typeof SabaccSeat>
  }
}
