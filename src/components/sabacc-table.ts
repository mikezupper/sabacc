import { SignalWatcher } from "@lit-labs/signals"
import { Option } from "effect"
import { css, html, LitElement, nothing } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { BUY_IN, MIN_BET } from "../domain/constants.ts"
import { Command, YOU, type Game, type Step } from "../domain/model.ts"
import { deckSize, handPot, playing, seatAt } from "../domain/table.ts"
import type { Store } from "../state/store.ts"
import { base, buttons } from "../styles/shared.ts"
import { describeError, describeEvent, describeResult, formatCredits, seatName } from "./describe.ts"
import { Playback } from "./playback.ts"
import "./sabacc-log.ts"
import "./sabacc-seat.ts"
import type { CardActionDetail } from "./sabacc-seat.ts"

const yourStep = (game: Game): Step | undefined => {
  const p = Option.getOrUndefined(playing(game))
  return p !== undefined && p.step.toAct[0] === YOU ? p.step : undefined
}

/** The game. Owns the store; every child is presentational. */
@customElement("sabacc-table")
export class SabaccTable extends SignalWatcher(LitElement) {
  static override styles = [
    base,
    buttons,
    css`
      :host { container-type: inline-size; }
      .stack { display: grid; gap: var(--space); }
      dl.status { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(8rem, 100%), 1fr)); gap: var(--space-xs); }
      dl.status div { padding: var(--space-xs) var(--space-s); border-radius: var(--radius-s); background: var(--surface-raised); border: 1px solid var(--border); }
      dt { font-size: var(--step--1); color: var(--text-muted); }
      dd { font-weight: 700; font-variant-numeric: tabular-nums; font-size: var(--step-1); }
      output {
        display: block;
        padding: var(--space-s) var(--space);
        border-radius: var(--radius);
        border-inline-start: 4px solid var(--accent);
        background: color-mix(in oklch, var(--accent) 10%, var(--surface-raised));
        font-weight: 600;
      }
      output[data-error] { border-color: var(--danger); background: color-mix(in oklch, var(--danger) 10%, var(--surface-raised)); }
      .shift {
        padding: var(--space-xs) var(--space);
        border-radius: var(--radius);
        background: color-mix(in oklch, var(--danger) 18%, var(--surface-raised));
        color: var(--text);
        font-weight: 700;
        letter-spacing: 0.04em;
      }
      @media (prefers-reduced-motion: no-preference) {
        .shift { animation: flash 0.5s ease-in-out 3; }
      }
      @keyframes flash { 50% { opacity: 0.55; } }
      .controls { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-xs); }
      .controls label { display: grid; gap: var(--space-2xs); font-size: var(--step--1); font-weight: 600; }
      .controls input {
        inline-size: 9rem;
        min-block-size: var(--tap);
        padding-inline: var(--space-s);
        border: 1px solid var(--border);
        border-radius: var(--radius-s);
        background: var(--surface-raised);
        color: var(--text);
        font: inherit;
        font-variant-numeric: tabular-nums;
      }
      .controls .push { margin-inline-start: auto; }
      .hint { color: var(--text-muted); font-size: var(--step--1); }
      h2 { font-size: var(--step-2); }
      .opponents { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr)); gap: var(--space); }
      .seed { color: var(--text-muted); font-size: var(--step--1); }
      .seed a { color: inherit; }
    `,
  ]

  @property({ attribute: false }) store: Store | undefined = undefined
  /** Draft amount for Bet / Raise to. */
  @state() private amount = MIN_BET
  /** Plays opponents' turns back beat by beat (presentation only). */
  readonly playback = new Playback(this)

  override willUpdate(): void {
    if (this.store !== undefined) this.playback.sync(this.store.last.get())
  }

  private send(command: Command): void {
    this.store?.dispatch(command)
  }

  private onCardAction(e: CustomEvent<CardActionDetail>): void {
    this.send(e.detail.action === "lock" ? Command.Lock({ cardId: e.detail.cardId }) : Command.Trade({ cardId: e.detail.cardId }))
  }

  private prompt(game: Game): string {
    const text = this.basePrompt(game)
    // Until anything happens after a reload, say the table came back from storage.
    return this.store?.restored && this.store.log.get().length === 0 ? `Welcome back: your saved table is restored. ${text}` : text
  }

  private basePrompt(game: Game): string {
    const store = this.store
    if (store === undefined) return ""
    const notice = store.notice.get()
    if (Option.isSome(notice)) return describeError(notice.value)
    const beat = this.playback.playing ? this.playback.revealed.at(-1) : undefined
    if (beat !== undefined) return describeEvent(beat.event)
    if (game.phase._tag === "Lobby") {
      const last = Option.getOrUndefined(game.phase.lastHand)
      if (last !== undefined) return describeResult(last)
      return Option.exists(seatAt(game, YOU), (s) => s.credits < BUY_IN)
        ? "You can't cover the antes. Start a new table."
        : "Welcome to the table. Deal a hand to play."
    }
    const step = yourStep(game)
    const you = Option.getOrUndefined(seatAt(game, YOU))
    if (step === undefined || you === undefined) return "Waiting for the table…"
    switch (step._tag) {
      case "Betting": {
        const owe = step.currentBet - you.roundBet
        return owe > 0 ? `Betting: ${formatCredits(owe)} credits to match.` : "Betting: check or open with a bet."
      }
      case "Drawing":
        return "Your draw: gain a card, trade one, or stand. You may lock one card in the interference field first."
      case "CallWindow":
        return "Call the hand and reveal, or let play continue?"
    }
  }

  private controls(game: Game) {
    const you = Option.getOrUndefined(seatAt(game, YOU))
    if (you === undefined) return nothing
    if (this.playback.playing)
      return html`<div class="controls" role="group" aria-label="Playback">
        <button @click=${() => this.playback.skip()}>Skip ahead</button>
        <p class="hint">${this.playback.pending} more ${this.playback.pending === 1 ? "move" : "moves"} to show.</p>
      </div>`
    if (game.phase._tag === "Lobby")
      return html`<div class="controls" role="group" aria-label="Table">
        <button class="primary" @click=${() => this.send(Command.StartHand())} ?disabled=${you.credits < BUY_IN}>
          Deal a hand (${formatCredits(BUY_IN)} in antes)
        </button>
        <button class="push" @click=${() => this.send(Command.NewTable())}>New table</button>
      </div>`
    const step = yourStep(game)
    if (step === undefined) return html`<p class="hint">${you.status._tag === "Active" ? "Waiting for the table…" : "You're out of this hand."}</p>`
    switch (step._tag) {
      case "Betting": {
        const owe = step.currentBet - you.roundBet
        const minTo = step.currentBet === 0 ? MIN_BET : step.currentBet + step.minRaise
        const maxTo = you.roundBet + you.credits
        const amount = Math.min(Math.max(this.amount, minTo), maxTo)
        return html`<div class="controls" role="group" aria-label="Your bet">
          ${owe > 0
            ? html`<button class="primary" @click=${() => this.send(Command.Match())}>Match ${formatCredits(Math.min(owe, you.credits))}</button>`
            : html`<button class="primary" @click=${() => this.send(Command.Check())}>Check</button>`}
          ${maxTo > minTo
            ? html`<label>
                  ${step.currentBet === 0 ? "Bet" : "Raise to"}
                  <input type="number" inputmode="numeric" min=${minTo} max=${maxTo} step=${MIN_BET} .value=${String(amount)}
                    @input=${(e: Event) => (this.amount = Number((e.target as HTMLInputElement).value))} />
                </label>
                <button @click=${() => this.send(Command.BetTo({ to: amount }))}>${step.currentBet === 0 ? "Bet" : "Raise"}</button>`
            : nothing}
          <button @click=${() => this.send(Command.AllIn())} ?disabled=${you.credits === 0}>All-in (${formatCredits(you.credits)})</button>
          <button class="danger push" @click=${() => this.send(Command.Fold())}>Fold</button>
        </div>`
      }
      case "Drawing":
        return html`<div class="controls" role="group" aria-label="Your draw">
          <button class="primary" @click=${() => this.send(Command.Gain())} ?disabled=${deckSize(game) === 0}>Gain a card</button>
          <button @click=${() => this.send(Command.Stand())}>Stand</button>
          <p class="hint">Trade or lock a card with the buttons under it.</p>
        </div>`
      case "CallWindow":
        return html`<div class="controls" role="group" aria-label="Call window">
          <button class="primary" @click=${() => this.send(Command.CallHand())}>Call the hand</button>
          <button @click=${() => this.send(Command.Pass())}>Keep playing</button>
          <p class="hint">Losing a call costs a penalty equal to the hand pot.</p>
        </div>`
    }
  }

  override render() {
    const store = this.store
    if (store === undefined) return nothing
    // While a playback runs, draw the snapshot being shown; otherwise the live game.
    const game = this.playback.frame ?? store.game.get()
    const you = Option.getOrUndefined(seatAt(game, YOU))
    const p = Option.getOrUndefined(playing(game))
    const step = yourStep(game)
    const lastHand = game.phase._tag === "Lobby" ? Option.getOrUndefined(game.phase.lastHand) : undefined
    const result = (seat: number) => lastHand?.seats.find((s) => s.seat === seat)
    const shifted = this.playback.revealed.some((b) => b.event._tag === "Shifted")
    const drawing = step?._tag === "Drawing"

    return html`<div class="stack">
      <dl class="status">
        <div><dt>Your credits</dt><dd>${formatCredits(you?.credits ?? 0)}</dd></div>
        <div><dt>Hand pot</dt><dd>${formatCredits(p ? handPot(game) : 0)}</dd></div>
        <div><dt>Sabacc pot</dt><dd>${formatCredits(game.sabaccPot)}</dd></div>
        <div><dt>Round</dt><dd>${p ? p.round : "—"}</dd></div>
        <div><dt>Dealer</dt><dd>${p ? seatName(game.dealer) : "—"}</dd></div>
        <div><dt>Deck</dt><dd>${deckSize(game)}</dd></div>
      </dl>

      ${shifted ? html`<p class="shift" role="alert">Sabacc Shift! Every card outside the interference field changed.</p>` : nothing}
      <output aria-live="polite" ?data-error=${Option.isSome(store.notice.get())}>${this.prompt(game)}</output>

      <section class="stack" aria-labelledby="you-heading" @card-action=${this.onCardAction}>
        <h2 id="you-heading" class="visually-hidden">Your seat</h2>
        <sabacc-seat
          .seat=${you}
          ?reveal=${lastHand?.revealed ?? false}
          ?winner=${lastHand?.winners.includes(YOU) ?? false}
          ?dealer=${p !== undefined && game.dealer === YOU}
          ?card-actions=${drawing}
          ?can-lock=${drawing && step?._tag === "Drawing" && !step.lockedThisTurn}
          ?can-trade=${drawing && deckSize(game) > 0}
          .result=${result(YOU)}
        ></sabacc-seat>
        ${this.controls(game)}
      </section>

      <section class="stack" aria-labelledby="opponents-heading">
        <h2 id="opponents-heading">Opponents</h2>
        <ul class="opponents">
          ${game.seats.filter((s) => s.index !== YOU).map(
            (s) => html`<li>
              <sabacc-seat
                .seat=${s}
                ?reveal=${lastHand?.revealed ?? false}
                ?winner=${lastHand?.winners.includes(s.index) ?? false}
                ?dealer=${p !== undefined && game.dealer === s.index}
                .result=${result(s.index)}
              ></sabacc-seat>
            </li>`,
          )}
        </ul>
      </section>

      <sabacc-log .events=${store.log.get().slice(0, store.log.get().length - this.playback.pending)}></sabacc-log>
      <p class="seed">
        ${store.persistent ? "Your table is saved in this browser." : "Replay table: not saved."}
        Seed <data value=${store.seed}>${store.seed}</data> · <a href=${`?seed=${store.seed}`}>Replay from this seed</a>
      </p>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-table": SabaccTable
  }
}
