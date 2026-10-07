// Name plates and pot labels over the 3D table: small Gyral components the board places
// with CSS2DRenderer and updates through one property each. The same facts as the classic
// seats, with the same wording.
import { Option } from "effect"
import { css, define, html, nothing, prop, type PropsOf, type Stateless } from "@gyral/core"
import type { Seat, SeatResult } from "../domain/model.ts"
import { describeEvaluation, evaluate } from "../domain/scoring.ts"
import { formatCredits } from "../presentation/describe.ts"
import { checked } from "../components/prop-schemas.ts"

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

const plateSchema = checked<PlateData | undefined>("a plate", (u): u is PlateData | undefined => u === undefined || (typeof u === "object" && u !== null && "seat" in u))

const status = (s: Seat): string =>
  s.status._tag === "Folded" ? "Folded" : s.status._tag === "SittingOut" ? "Sitting out" : s.credits === 0 && s.hand.length > 0 ? "All-in" : ""

const plateProps = { plate: prop.value(plateSchema) }

export const SabaccPlate = define<Stateless, never, PropsOf<typeof plateProps>>("sabacc-plate", {
  props: plateProps,
  intent: {},
  update: {},
  view: (_s, _i, { props: { plate: d } }) => {
    if (d === undefined) return nothing
    const { seat, mine } = d
    const evaluation = d.result?.evaluation.pipe(Option.getOrUndefined) ?? (mine && seat.hand.length > 0 ? evaluate(seat.hand) : undefined)
    const showHand = (mine || d.revealed) && evaluation !== undefined
    const classes = [d.active ? "active" : "", d.winner ? "winner" : "", seat.status._tag !== "Active" ? "out" : ""].join(" ")
    return html`<div class="plate ${classes}">
      <strong>${mine ? "You" : seat.name}</strong>
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
        ? html`<span class="hand" ?data-bomb=${evaluation.bombedOut} ?data-sabacc=${evaluation.idiotsArray || evaluation.pureSabacc}>${describeEvaluation(evaluation)}</span>`
        : nothing}
    </div>`
  },
  styles: css`
    :host { display: block; pointer-events: none; }
    .plate {
      display: grid;
      justify-items: center;
      gap: 1px;
      min-inline-size: 7.5rem;
      padding: 0.3rem 0.6rem;
      border: 1px solid oklch(80% 0.1 82 / 0.35);
      border-radius: 10px;
      background: oklch(14% 0.035 262 / 0.82);
      color: oklch(95% 0.012 262);
      font-family: var(--font-body);
      font-size: 0.78rem;
      line-height: 1.25;
      text-align: center;
      box-shadow: 0 6px 18px oklch(5% 0.02 262 / 0.5);
      transition: border-color 200ms, box-shadow 200ms, opacity 200ms;
    }
    strong { font-size: 0.9rem; letter-spacing: 0.02em; }
    .credits { font-variant-numeric: tabular-nums; color: oklch(85% 0.03 262); }
    .tags { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; }
    .tags:empty { display: none; }
    .tag { padding: 0 0.45em; border-radius: 999px; background: oklch(30% 0.04 262); font-size: 0.7rem; font-weight: 600; }
    .tag.dealer, .tag.bet { color: oklch(84% 0.15 82); }
    .tag.win { background: oklch(80% 0.15 82); color: oklch(18% 0.04 262); }
    .tag.loss { color: oklch(75% 0.17 27); }
    .hand { font-weight: 700; color: oklch(85% 0.15 150); }
    .hand[data-bomb] { color: oklch(74% 0.17 27); }
    .hand[data-sabacc] { color: oklch(84% 0.15 82); }
    .plate.active { border-color: oklch(82% 0.12 210); box-shadow: 0 0 0 2px oklch(82% 0.12 210 / 0.7), 0 6px 18px oklch(5% 0.02 262 / 0.5); }
    .plate.winner { border-color: oklch(82% 0.15 82); box-shadow: 0 0 0 2px oklch(82% 0.15 82), 0 0 28px oklch(82% 0.15 82 / 0.6); }
    .plate.out { opacity: 0.6; }
    @media (max-width: 40rem) {
      .plate { min-inline-size: 0; padding: 0.15rem 0.4rem; font-size: 0.68rem; }
      strong { font-size: 0.75rem; }
      .hand, .tags { font-size: 0.62rem; }
    }
  `,
})

const potProps = {
  label: prop.string({ default: "" }),
  amount: prop.number({ default: 0 }),
}

export const SabaccPot = define<Stateless, never, PropsOf<typeof potProps>>("sabacc-pot", {
  props: potProps,
  intent: {},
  update: {},
  view: (_s, _i, { props: p }) => html`<span class="pot"><span>${p.label}</span> <strong>${formatCredits(p.amount)}</strong></span>`,
  styles: css`
    :host { display: block; pointer-events: none; }
    .pot {
      padding: 0.15rem 0.55rem;
      border-radius: 999px;
      background: oklch(14% 0.035 262 / 0.75);
      color: oklch(92% 0.02 262);
      font-family: var(--font-body);
      font-size: 0.72rem;
      white-space: nowrap;
    }
    strong { color: oklch(84% 0.15 82); font-variant-numeric: tabular-nums; }
    /* On a phone the status bar already shows both pots. */
    @media (max-width: 40rem) {
      :host { display: none; }
    }
  `,
})

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-plate": InstanceType<typeof SabaccPlate>
    "sabacc-pot": InstanceType<typeof SabaccPot>
  }
}
