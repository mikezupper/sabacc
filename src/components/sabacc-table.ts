import { SignalWatcher } from "@lit-labs/signals"
import { Option } from "effect"
import { css, html, LitElement, nothing, type PropertyValues } from "lit"
import { customElement, property } from "lit/decorators.js"
import { Command, YOU, type Game, type HandResult, type Seat, type SeatResult, type Step } from "../domain/model.ts"
import { deckSize, handPot, playing, seatAt, type Playing } from "../domain/table.ts"
import { formatCredits } from "../presentation/describe.ts"
import { promptFor, yourStep } from "../presentation/prompt.ts"
import type { Store } from "../state/store.ts"
import { base } from "../styles/shared.ts"
import { Playback } from "./playback.ts"
import type { ControlsOutput } from "./sabacc-controls.ts"
import "./sabacc-controls.ts"
import { provideTable } from "./table-driver.ts"
import "./sabacc-room.ts"
import { tableContext, type TableContext } from "./table-context.ts"
import "./sabacc-log.ts"
import "./sabacc-seat.ts"
import type { CardActionDetail } from "./sabacc-seat.ts"

/** The game. Owns the store; every child is presentational. */
@customElement("sabacc-table")
export class SabaccTable extends SignalWatcher(LitElement) {
  static override styles = [
    base,
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
      h2 { font-size: var(--step-2); }
      .opponents { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr)); gap: var(--space); }
      .seed { color: var(--text-muted); font-size: var(--step--1); }
      .seed a { color: inherit; }
    `,
  ]

  @property({ attribute: false }) store: Store | undefined = undefined
  /** Plays opponents' turns back beat by beat (presentation only). */
  readonly playback = new Playback(this)

  private unprovide: (() => void) | undefined

  override willUpdate(changed: PropertyValues<this>): void {
    if (this.store === undefined) return
    // Gyral components below (the controls) reach this store through the table driver.
    if (changed.has("store")) {
      this.unprovide?.()
      this.unprovide = provideTable(this, this.store)
    }
    this.playback.sync(this.store.last.get())
  }

  /** Outputs from the Gyral controls (a Lit parent hears them as a DOM event). */
  private readonly onControls = (e: CustomEvent<ControlsOutput>): void => {
    if (e.detail._tag === "Skip") this.playback.skip()
  }

  private send(command: Command): void {
    this.store?.dispatch(command)
  }

  private onCardAction(e: CustomEvent<CardActionDetail>): void {
    this.send(e.detail.action === "lock" ? Command.Lock({ cardId: e.detail.cardId }) : Command.Trade({ cardId: e.detail.cardId }))
  }

  private prompt(game: Game, ctx: TableContext): string {
    const store = this.store
    if (store === undefined) return ""
    return promptFor({
      game,
      notice: store.notice.get(),
      beat: this.playback.playing ? this.playback.revealed.at(-1)?.event : undefined,
      // Until anything happens after a reload, say the table came back from storage.
      welcomeBack: store.restored && store.log.get().length === 0,
      who: ctx.narrator,
      spectator: ctx.spectator,
    })
  }

  private seatView(game: Game, ctx: TableContext, index: number) {
    const lastHand = game.phase._tag === "Lobby" ? Option.getOrUndefined(game.phase.lastHand) : undefined
    const p = Option.getOrUndefined(playing(game))
    return html`<sabacc-seat
      .seat=${game.seats[index]}
      ?reveal=${ctx.revealed.has(index)}
      ?winner=${lastHand?.winners.includes(index) ?? false}
      ?dealer=${p !== undefined && game.dealer === index}
      ?spectating=${ctx.spectator}
      .presence=${ctx.presence(index)}
      .result=${lastHand?.seats.find((s) => s.seat === index)}
    ></sabacc-seat>`
  }

  override render() {
    const store = this.store
    if (store === undefined) return nothing
    // While a playback runs, draw the snapshot being shown; otherwise the live game.
    const game = this.playback.frame ?? store.game.get()
    const ctx = tableContext(store, game)
    const you = Option.getOrUndefined(seatAt(game, YOU))
    const p = Option.getOrUndefined(playing(game))
    const step = ctx.spectator ? undefined : yourStep(game)
    const lastHand = game.phase._tag === "Lobby" ? Option.getOrUndefined(game.phase.lastHand) : undefined
    const result = (seat: number) => lastHand?.seats.find((s) => s.seat === seat)
    const shifted = this.playback.revealed.some((b) => b.event._tag === "Shifted")
    const drawing = step?._tag === "Drawing"
    const others = game.seats.filter((s) => ctx.spectator || s.index !== YOU)
    const seated = store.room === undefined || store.room.connection.get() !== "naming"

    return html`<div class="stack">
      <sabacc-room .store=${store}></sabacc-room>
      ${seated ? this.table(game, ctx, { you, p, step, lastHand, result, shifted, drawing, others }) : nothing}
      <p class="seed">
        ${store.room !== undefined
          ? html`Multiplayer table <strong>${store.room.code}</strong>: the server keeps the game. <a href="/">Play solo</a>`
          : html`${store.persistent ? "Your table is saved in this browser." : "Replay table: not saved."}
            Seed <data value=${store.seed}>${store.seed}</data> · <a href=${`?seed=${store.seed}`}>Replay from this seed</a>`}
      </p>
    </div>`
  }

  private table(
    game: Game,
    ctx: TableContext,
    v: {
      you: Seat | undefined
      p: Playing | undefined
      step: Step | undefined
      lastHand: HandResult | undefined
      result: (seat: number) => SeatResult | undefined
      shifted: boolean
      drawing: boolean
      others: ReadonlyArray<Seat>
    },
  ) {
    const store = this.store
    if (store === undefined) return nothing
    const { you, p, step, lastHand, result, shifted, drawing, others } = v
    return html`
      <dl class="status">
        <div><dt>${ctx.spectator ? "Watching" : "Your credits"}</dt><dd>${ctx.spectator ? "—" : formatCredits(you?.credits ?? 0)}</dd></div>
        <div><dt>Hand pot</dt><dd>${formatCredits(p ? handPot(game) : 0)}</dd></div>
        <div><dt>Sabacc pot</dt><dd>${formatCredits(game.sabaccPot)}</dd></div>
        <div><dt>Round</dt><dd>${p ? p.round : "—"}</dd></div>
        <div><dt>Dealer</dt><dd>${p ? ctx.narrator.name(game.dealer) : "—"}</dd></div>
        <div><dt>Deck</dt><dd>${deckSize(game)}</dd></div>
      </dl>

      ${shifted ? html`<p class="shift" role="alert">Sabacc Shift! Every card outside the interference field changed.</p>` : nothing}
      <output aria-live="polite" ?data-error=${Option.isSome(store.notice.get())}>${this.prompt(game, ctx)}</output>

      ${ctx.spectator ? nothing : html`<section class="stack" aria-labelledby="you-heading" @card-action=${this.onCardAction}>
        <h2 id="you-heading" class="visually-hidden">Your seat</h2>
        <sabacc-seat
          .seat=${you}
          ?reveal=${ctx.revealed.has(YOU)}
          ?winner=${lastHand?.winners.includes(YOU) ?? false}
          ?dealer=${p !== undefined && game.dealer === YOU}
          ?card-actions=${drawing}
          ?can-lock=${drawing && step?._tag === "Drawing" && !step.lockedThisTurn}
          ?can-trade=${drawing && deckSize(game) > 0}
          .result=${result(YOU)}
          .presence=${ctx.presence(YOU)}
        ></sabacc-seat>
        <sabacc-controls
          .game=${game}
          ?playing=${this.playback.playing}
          .pending=${this.playback.pending}
          ?hide-new-table=${!ctx.canStartNewTable}
          @gyral-output=${this.onControls}
        ></sabacc-controls>
      </section>`}

      <section class="stack" aria-labelledby="opponents-heading">
        <h2 id="opponents-heading">${ctx.spectator ? "Players" : "Opponents"}</h2>
        <ul class="opponents">
          ${others.map((s) => html`<li>${this.seatView(game, ctx, s.index)}</li>`)}
        </ul>
      </section>
      ${ctx.spectator
        ? html`<sabacc-controls spectator ?playing=${this.playback.playing} .pending=${this.playback.pending} .game=${game}
            @gyral-output=${this.onControls}></sabacc-controls>`
        : nothing}

      <sabacc-log .narrator=${ctx.narrator} .events=${store.log.get().slice(0, store.log.get().length - this.playback.pending)}></sabacc-log>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-table": SabaccTable
  }
}
