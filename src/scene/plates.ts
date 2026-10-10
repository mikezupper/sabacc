// Name plates and pot labels over the 3D table: small Gyral components the board places
// with CSS2DRenderer and updates through one property each. The same facts as the classic
// seats, with the same wording.
import { Option } from "effect"
import { css, define, html, nothing, prop, type PropsOf, type Stateless } from "@gyral/core"
import { YOU, type Game, type Seat, type SeatResult } from "../domain/model.ts"
import { describeEvaluation, evaluate } from "../domain/scoring.ts"
import { playing } from "../domain/table.ts"
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

interface PlateView {
  readonly game: Game
  readonly spectator: boolean
  readonly revealed: ReadonlySet<number>
  readonly presence: (seat: number) => PlateData["presence"]
}

/** The same playback snapshot drives projected plates and the narrow player list. */
export const platesFor = ({ game, spectator, revealed, presence }: PlateView): ReadonlyArray<PlateData> => {
  const p = Option.getOrUndefined(playing(game))
  const last = game.phase._tag === "Lobby" ? Option.getOrUndefined(game.phase.lastHand) : undefined
  return game.seats.map((seat) => ({
    seat,
    mine: seat.index === YOU && !spectator,
    presence: presence(seat.index),
    dealer: p !== undefined && game.dealer === seat.index,
    active: p?.step.toAct[0] === seat.index,
    revealed: revealed.has(seat.index),
    result: last?.seats.find((r) => r.seat === seat.index),
    winner: last?.winners.includes(seat.index) ?? false,
  }))
}

const isPlate = (u: unknown): u is PlateData => typeof u === "object" && u !== null && "seat" in u

const status = (s: Seat): string =>
  s.status._tag === "Folded" ? "Folded" : s.status._tag === "SittingOut" ? "Sitting out" : s.credits === 0 && s.hand.length > 0 ? "All-in" : ""

const plateProps = { plate: prop.value(isPlate), listed: prop.boolean() }

export const SabaccPlate = define<Stateless, never, PropsOf<typeof plateProps>>()("sabacc-plate", {
  props: plateProps,
  view: (_s, _i, { props: { plate: d } }) => {
    if (d === undefined) return nothing
    const { seat, mine } = d
    const evaluation = d.result?.evaluation.pipe(Option.getOrUndefined) ?? (mine && seat.hand.length > 0 ? evaluate(seat.hand) : undefined)
    const showHand = (mine || d.revealed) && evaluation !== undefined
    const classes = [d.active ? "active" : "", d.winner ? "winner" : "", seat.status._tag !== "Active" ? "out" : ""].join(" ")
    return html`<div class="plate ${classes}">
      <span class="seat-marker" aria-hidden="true">${seat.index + 1}</span>
      <strong><span class="seat-label">Seat ${seat.index + 1} · </span><bdi>${mine ? "You" : seat.name}</bdi></strong>
      <span class="credits">${formatCredits(seat.credits)} cr</span>
      <span class="tags">
        ${d.active ? html`<span class="tag turn">To act</span>` : nothing}
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
    .seat-marker, .seat-label { display: none; }
    .credits { font-variant-numeric: tabular-nums; color: oklch(85% 0.03 262); }
    .tags { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; }
    .tags:empty { display: none; }
    .tag { padding: 0 0.45em; border-radius: 999px; background: oklch(30% 0.04 262); font-size: 0.7rem; font-weight: 600; }
    .tag.turn { display: none; }
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
    /* The list uses normal flow and wraps full names, including 24-character names. */
    :host([listed]) .plate {
      box-sizing: border-box;
      min-inline-size: 0;
      inline-size: 100%;
      justify-items: start;
      gap: 0.2rem;
      padding: var(--space-xs) var(--space-s);
      border-color: var(--border);
      background: var(--surface-raised);
      color: var(--text);
      font-size: 0.875rem;
      line-height: 1.4;
      text-align: start;
      overflow-wrap: anywhere;
      box-shadow: none;
      opacity: 1;
    }
    :host([listed]) strong { min-inline-size: 0; max-inline-size: 100%; font-size: 0.9rem; }
    :host([listed]) .seat-label { display: inline; }
    :host([listed]) .credits { color: var(--text-muted); }
    :host([listed]) .tags { justify-content: start; }
    :host([listed]) .tag { font-size: 0.75rem; background: var(--surface-sunken); color: var(--text); }
    :host([listed]) .tag.turn { display: inline; }
    :host([listed]) .tag.dealer, :host([listed]) .tag.bet { color: var(--accent); }
    :host([listed]) .tag.win { background: var(--accent); color: var(--accent-text); }
    :host([listed]) .tag.loss, :host([listed]) .hand[data-bomb] { color: var(--negative); }
    :host([listed]) .hand { color: var(--positive); }
    :host([listed]) .hand[data-sabacc] { color: var(--accent); }
    :host([listed]) .plate.active { border-color: var(--neutral); box-shadow: 0 0 0 1px var(--neutral); }
    :host([listed]) .plate.winner { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    @container sabacc-table (max-width: 18rem) {
      :host(:not([listed])) .plate {
        min-inline-size: 0;
        inline-size: 1.6rem;
        min-block-size: 1.6rem;
        align-items: center;
        padding: 0;
        border-radius: 50%;
      }
      :host(:not([listed])) .plate > :not(.seat-marker) { display: none; }
      :host(:not([listed])) .seat-marker { display: block; font-size: 0.9rem; font-weight: 700; }
    }
  `,
})

const potProps = {
  label: prop.string({ default: "" }),
  amount: prop.number({ default: 0 }),
}

export const SabaccPot = define<Stateless, never, PropsOf<typeof potProps>>()("sabacc-pot", {
  props: potProps,
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
