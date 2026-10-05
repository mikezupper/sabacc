import { SignalWatcher } from "@lit-labs/signals"
import { css, html, LitElement, nothing } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { YOU } from "../domain/model.ts"
import { createRoom } from "../state/rooms-api.ts"
import type { RoomState, Store } from "../state/store.ts"
import { base, buttons } from "../styles/shared.ts"

/**
 * Multiplayer around either view. Solo: a "Play with friends" button that opens a new
 * table. At a table: your name (asked once), the invite link, who's here, and whose
 * clock is running. Shared by the classic table and the 3D view.
 */
@customElement("sabacc-room")
export class SabaccRoom extends SignalWatcher(LitElement) {
  static override styles = [
    base,
    buttons,
    css`
      :host { display: block; }
      .box {
        display: grid;
        gap: var(--space-xs);
        padding: var(--space-s);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface-raised);
      }
      .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs); }
      .muted { color: var(--text-muted); font-size: var(--step--1); }
      .problem { color: var(--danger); font-weight: 600; }
      input {
        min-block-size: var(--tap);
        padding-inline: var(--space-s);
        border: 1px solid var(--border);
        border-radius: var(--radius-s);
        background: var(--surface);
        color: var(--text);
        font: inherit;
      }
      .link { font-family: var(--font-mono); font-size: var(--step--1); overflow-wrap: anywhere; }
      ul.players { display: flex; flex-wrap: wrap; gap: var(--space-2xs); }
      ul.players li {
        display: inline-flex;
        align-items: center;
        gap: 0.4em;
        padding: 0.15em 0.6em;
        border-radius: 999px;
        background: var(--surface-sunken);
        font-size: var(--step--1);
        font-weight: 600;
      }
      .dot { inline-size: 0.6em; block-size: 0.6em; border-radius: 50%; background: var(--text-muted); }
      .dot[data-on] { background: var(--positive); }
      li[data-turn] { outline: 2px solid var(--accent); }
      .clock { font-variant-numeric: tabular-nums; color: var(--accent); }
      strong.code { font-family: var(--font-mono); letter-spacing: 0.12em; }
      details > summary { cursor: pointer; min-block-size: var(--tap); list-style-position: inside; }
      details[open] > summary { margin-block-end: var(--space-xs); }
    `,
  ]

  @property({ attribute: false }) store: Store | undefined = undefined
  /** Compact (3D overlay): fewer words. */
  @property({ type: Boolean }) compact = false
  @state() private creating = false
  @state() private error: string | undefined = undefined
  @state() private copied = false
  @state() private now = Date.now()
  private ticker: ReturnType<typeof setInterval> | undefined

  /** Presentation only: tick once a second while someone's clock is running. */
  override updated(): void {
    const running = this.store?.room?.presence.get().deadline !== undefined
    if (running && this.ticker === undefined) this.ticker = setInterval(() => (this.now = Date.now()), 1000)
    if (!running) this.stopTicker()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.stopTicker()
  }

  private stopTicker(): void {
    if (this.ticker !== undefined) clearInterval(this.ticker)
    this.ticker = undefined
  }

  private async playWithFriends(): Promise<void> {
    this.creating = true
    this.error = undefined
    const result = await createRoom()
    this.creating = false
    if ("error" in result) this.error = result.error
    else location.assign(`${location.pathname}?room=${result.room}`)
  }

  private invite(room: RoomState): string {
    return `${location.origin}${location.pathname}?room=${room.code}`
  }

  private async copy(room: RoomState): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.invite(room))
      this.copied = true
      setTimeout(() => (this.copied = false), 2000)
    } catch {
      this.error = "Copy failed; select the link and copy it."
    }
  }

  private solo() {
    return html`<div class="row">
      <button type="button" @click=${() => this.playWithFriends()} ?disabled=${this.creating}>
        ${this.creating ? "Opening a table…" : "Play with friends"}
      </button>
      ${this.compact ? nothing : html`<span class="muted">Opens a private table and gives you a link to share.</span>`}
      ${this.error ? html`<span class="problem" role="alert">${this.error}</span>` : nothing}
    </div>`
  }

  private naming(room: RoomState) {
    let draft = room.name.get()
    return html`<form class="box" @submit=${(e: Event) => (e.preventDefault(), room.join(draft))}>
      <p>Table <strong class="code">${room.code}</strong>: choose a name to sit down.</p>
      <div class="row">
        <label>Your name <input name="name" maxlength="24" required autocomplete="nickname" .value=${draft}
          @input=${(e: Event) => (draft = (e.target as HTMLInputElement).value)} /></label>
        <button class="primary" type="submit">Join the table</button>
      </div>
    </form>`
  }

  private seated(room: RoomState) {
    const store = this.store
    if (store === undefined) return nothing
    const game = store.game.get()
    const presence = room.presence.get()
    const spectator = room.spectator.get()
    const deadline = presence.deadline
    const left = deadline === undefined ? undefined : Math.max(0, Math.ceil((deadline.at - this.now) / 1000))
    const connection = room.connection.get()
    const clock =
      left !== undefined && deadline !== undefined
        ? html`<span class="clock" role="timer" aria-live="off">${deadline.seat === YOU && !spectator ? "Your turn" : (game.seats[deadline.seat]?.name ?? "")}: ${left}s</span>`
        : nothing
    const status = connection !== "open" ? html`<span class="muted" role="status">${connection === "gone" ? "Closed" : "Reconnecting…"}</span>` : nothing
    const heading = html`<span>Table <strong class="code">${room.code}</strong>${room.host.get() ? " · host" : ""}${spectator ? " · watching" : ""}</span>`
    // Over the 3D table: folded away to a one-line summary until opened.
    if (this.compact)
      return html`<details class="box">
        <summary class="row">${heading} ${status} ${clock}</summary>
        ${this.players(room, spectator, deadline?.seat)}
        <div class="row"><button type="button" @click=${() => this.copy(room)}>${this.copied ? "Link copied" : "Copy invite link"}</button>
          <a href=${location.pathname}>Leave</a></div>
        ${room.problem.get() ? html`<p class="problem" role="alert">${room.problem.get()}</p>` : nothing}
        ${this.error ? html`<p class="problem" role="alert">${this.error}</p>` : nothing}
      </details>`
    return html`<div class="box">
      <div class="row">${heading} ${status} ${clock}</div>
      ${this.players(room, spectator, deadline?.seat)}
      <div class="row">
        <span class="muted">Invite:</span> <span class="link">${this.invite(room)}</span>
        <button type="button" @click=${() => this.copy(room)}>${this.copied ? "Link copied" : "Copy link"}</button>
        <a href=${location.pathname}>Leave the table</a>
      </div>
      ${room.problem.get() ? html`<p class="problem" role="alert">${room.problem.get()}</p>` : nothing}
      ${this.error ? html`<p class="problem" role="alert">${this.error}</p>` : nothing}
    </div>`
  }

  private players(room: RoomState, spectator: boolean, turn: number | undefined) {
    const game = this.store?.game.get()
    const presence = room.presence.get()
    return html`<ul class="players" aria-label="Players">
      ${(game?.seats ?? []).map((s) => {
        const you = s.index === YOU && !spectator
        const on = presence.connected[s.index] === true
        const label = you ? `${s.name} (you)` : s.name
        const what = s.controller === "Ai" ? (on ? "joining" : "AI") : on || you ? "here" : "away"
        return html`<li ?data-turn=${turn === s.index}>
          <span class="dot" ?data-on=${on || you} aria-hidden="true"></span>${label}<span class="muted">${what}</span>
        </li>`
      })}
    </ul>`
  }

  override render() {
    const room = this.store?.room
    if (this.store === undefined) return nothing
    if (room === undefined) return this.solo()
    if (room.connection.get() === "naming") return this.naming(room)
    if (room.connection.get() === "gone")
      return html`<div class="box" role="alert"><p>${room.problem.get() ?? "This table has closed."}</p><a href=${location.pathname}>Play solo</a></div>`
    return this.seated(room)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-room": SabaccRoom
  }
}
