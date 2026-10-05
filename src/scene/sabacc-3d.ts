import { SignalWatcher } from "@lit-labs/signals"
import { Option } from "effect"
import { html, LitElement, nothing } from "lit"
import { customElement, property, query, state } from "lit/decorators.js"
import { OPPONENT_COUNT } from "../domain/constants.ts"
import { YOU, type Beat, type Command, type Game } from "../domain/model.ts"
import { describeEvaluation, evaluate } from "../domain/scoring.ts"
import { deckSize, handPot, playing, seatAt } from "../domain/table.ts"
import { formatCredits } from "../presentation/describe.ts"
import { BeatPlayer, prefersReducedMotion } from "../presentation/playback.ts"
import { promptFor, yourStep } from "../presentation/prompt.ts"
import type { Store } from "../state/store.ts"
import { base, buttons } from "../styles/shared.ts"
import "../components/sabacc-controls.ts"
import "../components/sabacc-log.ts"
import { Stage, webglAvailable } from "./stage.ts"
import { hud } from "./hud-styles.ts"
import { sceneBeatDelay } from "./timing.ts"

/**
 * The 3D table. Owns the store connection and playback, draws through `Stage`, and
 * overlays the shared HUD pieces (prompt, <sabacc-controls>, <sabacc-log>).
 */
@customElement("sabacc-3d")
export class Sabacc3d extends SignalWatcher(LitElement) {
  static override styles = [base, buttons, hud]

  @property({ attribute: false }) store: Store | undefined = undefined
  /** Your chosen card for Lock / Trade (UI state only). */
  @state() private selected: number | undefined = undefined
  @state() private hover: number | undefined = undefined
  @state() private failed = false
  @query(".stage") private stageHost!: HTMLElement

  readonly playback = new BeatPlayer({ onChange: () => this.requestUpdate(), delay: sceneBeatDelay })
  stage: Stage | undefined = undefined
  private lastBeat: Beat | undefined
  private drawn = false

  override connectedCallback(): void {
    super.connectedCallback()
    if (this.store !== undefined) this.playback.sync(this.store.last.get())
    // Moved in the page: the stage was disposed on disconnect, so build it again.
    if (this.hasUpdated && this.stage === undefined) this.startStage()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.playback.stop()
    this.stage?.dispose()
    this.stage = undefined
    this.drawn = false
  }

  override willUpdate(): void {
    if (this.store !== undefined) this.playback.sync(this.store.last.get())
    const game = this.shown()
    if (game !== undefined && this.selected !== undefined && !this.pickable(game).has(this.selected)) this.selected = undefined
  }

  override firstUpdated(): void {
    this.startStage()
  }

  private startStage(): void {
    if (!webglAvailable()) {
      this.failed = true
      return
    }
    try {
      this.stage = new Stage(this.stageHost, {
        seats: this.store?.game.get().seats.length ?? OPPONENT_COUNT + 1,
        onPick: (id) => (this.selected = this.selected === id ? undefined : id),
        onHover: (id) => (this.hover = id),
      })
      this.requestUpdate()
    } catch {
      this.failed = true
    }
  }

  override updated(): void {
    const game = this.shown()
    if (this.stage === undefined || game === undefined) return
    const current = this.playback.revealed.at(-1)
    const fresh = current !== undefined && current !== this.lastBeat
    this.lastBeat = current
    this.stage.show({
      game,
      beat: fresh ? current.event : undefined,
      selected: this.selected,
      hover: this.hover,
      pickable: this.pickable(game),
      // The first draw (and reduced motion) jumps straight to the table as it stands.
      instant: !this.drawn || prefersReducedMotion(),
    })
    this.drawn = true
  }

  /** While a playback runs, the snapshot being shown; otherwise the live game. */
  private shown(): Game | undefined {
    return this.playback.frame ?? this.store?.game.get()
  }

  private pickable(game: Game): ReadonlySet<number> {
    const step = this.playback.playing ? undefined : yourStep(game)
    const you = Option.getOrUndefined(seatAt(game, YOU))
    if (step?._tag !== "Drawing" || you === undefined) return new Set()
    return new Set(you.hand.filter((c) => !you.field.includes(c.id)).map((c) => c.id))
  }

  private send(command: Command): void {
    this.selected = undefined
    this.store?.dispatch(command)
  }

  override render() {
    const store = this.store
    const game = this.shown()
    // One stable template: the stage's canvas must survive the store arriving.
    return html`
      <div class="stage" role="img" aria-label="3D Sabacc table. Your moves and the table's state are in the panels."></div>
      ${this.failed
        ? html`<div class="fallback" role="alert">
            <p>This browser can't draw the 3D table (WebGL is unavailable).</p>
            <p><a href="/">Play on the classic table instead</a>.</p>
          </div>`
        : nothing}
      ${store !== undefined && game !== undefined ? this.hud(store, game) : nothing}
    `
  }

  private hud(store: Store, game: Game) {
    const you = Option.getOrUndefined(seatAt(game, YOU))
    const p = Option.getOrUndefined(playing(game))
    const shifted = this.playback.revealed.some((b) => b.event._tag === "Shifted")
    const evaluation = you !== undefined && you.hand.length > 0 ? evaluate(you.hand) : undefined
    const prompt = promptFor({
      game,
      notice: store.notice.get(),
      beat: this.playback.playing ? this.playback.revealed.at(-1)?.event : undefined,
      welcomeBack: store.restored && store.log.get().length === 0,
    })
    return html`
      <header class="top">
        <slot name="title"></slot>
        <dl class="status">
          <div><dt>Your credits</dt><dd>${formatCredits(you?.credits ?? 0)}</dd></div>
          <div><dt>Hand pot</dt><dd>${formatCredits(p ? handPot(game) : 0)}</dd></div>
          <div><dt>Sabacc pot</dt><dd>${formatCredits(game.sabaccPot)}</dd></div>
          <div><dt>Round</dt><dd>${p ? p.round : "—"}</dd></div>
          <div><dt>Deck</dt><dd>${deckSize(game)}</dd></div>
        </dl>
        <nav aria-label="Views">
          <button type="button" @click=${() => this.stage?.resetView()}>Reset view</button>
          <a href="/">Classic table</a>
        </nav>
      </header>
      <div class="overlay">
        ${shifted ? html`<p class="shift" role="alert">Sabacc Shift! Every card outside the interference field changed.</p>` : nothing}
        <aside class="side" aria-label="Game log">
          <sabacc-log .events=${store.log.get().slice(0, store.log.get().length - this.playback.pending)}></sabacc-log>
          <p class="seed">
            ${store.persistent ? "Saved in this browser (shared with the classic table)." : "Replay table: not saved."}
            Seed <data value=${store.seed}>${store.seed}</data> ·
            <a href=${`?seed=${store.seed}`}>Replay</a>
          </p>
        </aside>
      </div>
      <section class="panel" aria-label="Your seat">
        <output aria-live="polite" ?data-error=${Option.isSome(store.notice.get())}>${prompt}</output>
        ${evaluation !== undefined
          ? html`<p class="mine" ?data-bomb=${evaluation.bombedOut}>Your hand: ${describeEvaluation(evaluation)}</p>`
          : nothing}
        <sabacc-controls
          pick
          .game=${game}
          .selected=${this.selected}
          ?playing=${this.playback.playing}
          .pending=${this.playback.pending}
          @command=${(e: CustomEvent<Command>) => this.send(e.detail)}
          @card-select=${(e: CustomEvent<number | undefined>) => (this.selected = e.detail)}
          @skip=${() => this.playback.skip()}
        ></sabacc-controls>
      </section>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-3d": Sabacc3d
  }
}
