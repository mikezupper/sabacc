import { Option } from "effect"
import { css, html, LitElement, nothing } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { cardTitle, describeCard } from "../domain/cards.ts"
import { BUY_IN, MIN_BET } from "../domain/constants.ts"
import { Command, YOU, type Game } from "../domain/model.ts"
import { deckSize, seatAt } from "../domain/table.ts"
import { formatCredits } from "../presentation/describe.ts"
import { yourStep } from "../presentation/prompt.ts"
import { base, buttons } from "../styles/shared.ts"

/**
 * Your actions for the game being shown: deal, bet, draw, call. Shared by the 2D table
 * and the 3D view. Sends `command` events up; never touches the store itself.
 *
 * Card actions on your draw: with `pick`, this element lists your free cards to choose
 * one (the 3D view also picks by clicking a card) and offers Lock / Trade for it.
 * Without `pick`, the table shows Lock / Trade under each card instead.
 */
@customElement("sabacc-controls")
export class SabaccControls extends LitElement {
  static override styles = [
    base,
    buttons,
    css`
      .controls { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-xs); }
      label { display: grid; gap: var(--space-2xs); font-size: var(--step--1); font-weight: 600; }
      input {
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
      .push { margin-inline-start: auto; }
      .hint { color: var(--text-muted); font-size: var(--step--1); }
      .pick { display: flex; flex-wrap: wrap; gap: var(--space-2xs); inline-size: 100%; }
      .pick button { padding-inline: var(--space-s); font-size: var(--step--1); }
      .pick button[aria-pressed="true"] { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
    `,
  ]

  /** The game as currently shown (a playback snapshot or the live game). */
  @property({ attribute: false }) game: Game | undefined = undefined
  /** A playback is running: offer Skip ahead instead of moves. */
  @property({ type: Boolean }) playing = false
  @property({ type: Number }) pending = 0
  /** Choose a card here for Lock / Trade (3D view). */
  @property({ type: Boolean }) pick = false
  /** The chosen card id in `pick` mode. */
  @property({ attribute: false }) selected: number | undefined = undefined
  /** Watching a multiplayer table: no moves to offer. */
  @property({ type: Boolean }) spectator = false
  /** Offer "New table" (solo, or the host of a multiplayer table). Set as a property. */
  @property({ attribute: false }) newTable = true
  /** Draft amount for Bet / Raise to. */
  @state() private amount = MIN_BET

  private send(command: Command): void {
    this.dispatchEvent(new CustomEvent<Command>("command", { detail: command, bubbles: true, composed: true }))
  }

  private choose(cardId: number | undefined): void {
    this.dispatchEvent(new CustomEvent<number | undefined>("card-select", { detail: cardId, bubbles: true, composed: true }))
  }

  private picker(game: Game, canLock: boolean) {
    const you = Option.getOrUndefined(seatAt(game, YOU))
    const free = you?.hand.filter((c) => !you.field.includes(c.id)) ?? []
    const chosen = free.find((c) => c.id === this.selected)
    const canTrade = deckSize(game) > 0
    return html`<div class="pick" role="group" aria-label="Choose a card to lock or trade">
        ${free.map(
          (c) => html`<button type="button" aria-pressed=${c.id === chosen?.id ? "true" : "false"} aria-label=${describeCard(c)}
            @click=${() => this.choose(c.id === chosen?.id ? undefined : c.id)}>${cardTitle(c)} ${c.value > 0 ? `+${c.value}` : c.value}</button>`,
        )}
      </div>
      <button @click=${() => chosen && this.send(Command.Lock({ cardId: chosen.id }))} ?disabled=${chosen === undefined || !canLock}>Lock</button>
      <button @click=${() => chosen && this.send(Command.Trade({ cardId: chosen.id }))} ?disabled=${chosen === undefined || !canTrade}>Trade</button>`
  }

  override render() {
    const game = this.game
    const you = game && Option.getOrUndefined(seatAt(game, YOU))
    if (game === undefined || you === undefined) return nothing
    if (this.playing)
      return html`<div class="controls" role="group" aria-label="Playback">
        <button @click=${() => this.dispatchEvent(new CustomEvent("skip", { bubbles: true, composed: true }))}>Skip ahead</button>
        <p class="hint">${this.pending} more ${this.pending === 1 ? "move" : "moves"} to show.</p>
      </div>`
    if (this.spectator) return nothing
    if (game.phase._tag === "Lobby")
      return html`<div class="controls" role="group" aria-label="Table">
        <button class="primary" @click=${() => this.send(Command.StartHand())} ?disabled=${you.credits < BUY_IN}>
          Deal a hand (${formatCredits(BUY_IN)} in antes)
        </button>
        ${this.newTable ? html`<button class="push" @click=${() => this.send(Command.NewTable())}>New table</button>` : nothing}
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
          ${this.pick ? this.picker(game, !step.lockedThisTurn) : nothing}
          <button class="primary" @click=${() => this.send(Command.Gain())} ?disabled=${deckSize(game) === 0}>Gain a card</button>
          <button @click=${() => this.send(Command.Stand())}>Stand</button>
          ${this.pick ? nothing : html`<p class="hint">Trade or lock a card with the buttons under it.</p>`}
        </div>`
      case "CallWindow":
        return html`<div class="controls" role="group" aria-label="Call window">
          <button class="primary" @click=${() => this.send(Command.CallHand())}>Call the hand</button>
          <button @click=${() => this.send(Command.Pass())}>Keep playing</button>
          <p class="hint">Losing a call costs a penalty equal to the hand pot.</p>
        </div>`
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-controls": SabaccControls
  }
  interface HTMLElementEventMap {
    command: CustomEvent<Command>
    "card-select": CustomEvent<number | undefined>
    skip: CustomEvent<unknown>
  }
}
