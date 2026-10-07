// Multiplayer around either view. Solo: a "Play with friends" button that opens a new
// table. At a table: your name (asked once), the invite link, who's here, and whose
// clock is running. Shared by the classic table and the 3D view; it watches the table
// itself, so a parent only places it.
import { css, define, html, nothing, prop, type PropsOf } from "@gyral/core"
import { delay } from "@gyral/time"
import { request, type HttpError } from "@gyral/http"
import { YOU } from "../domain/model.ts"
import { base, buttons } from "../styles/shared.ts"
import { copy, go, ticking, where, type Where } from "./browser-drivers.ts"
import { checked } from "./prop-schemas.ts"
import { join, watchTable, type RoomSnapshot, type TableSnapshot } from "./table-driver.ts"

const props = {
  /** Compact (3D overlay): folded into a one-line summary until opened. */
  compact: prop.boolean(),
}
type Props = PropsOf<typeof props>

interface State {
  readonly table: TableSnapshot | undefined
  readonly page: Where | undefined
  readonly creating: boolean
  readonly error: string | undefined
  readonly copied: boolean
  /** The clock (ms) while someone's turn is counting down. */
  readonly now: number | undefined
}

type Msg =
  | { readonly _tag: "TableChanged"; readonly table: TableSnapshot }
  | { readonly _tag: "Located"; readonly page: Where }
  | { readonly _tag: "PlayWithFriends" }
  | { readonly _tag: "Opened"; readonly room: string }
  | { readonly _tag: "OpenFailed"; readonly reason: string }
  | { readonly _tag: "Join"; readonly name: string }
  | { readonly _tag: "Copy" }
  | { readonly _tag: "Copied" }
  | { readonly _tag: "CopyDone" }
  | { readonly _tag: "CopyFailed" }
  | { readonly _tag: "Tick"; readonly now: number }

const NewRoom = checked<{ readonly room: string }>("a new table", (u): u is { readonly room: string } => typeof u === "object" && u !== null && typeof (u as { room?: unknown }).room === "string")

/** What went wrong opening a table, in words. */
const openFailure = (e: HttpError): string => {
  if (e._tag === "HttpStatusError") {
    const body = e.body as { readonly error?: unknown } | undefined
    return typeof body?.error === "string" ? body.error : "The server couldn't open a table."
  }
  return "Multiplayer needs the game server, and it can't be reached."
}

const inviteOf = (s: State, room: RoomSnapshot): string => (s.page === undefined ? `?room=${room.code}` : `${s.page.origin}${s.page.pathname}?room=${room.code}`)

const solo = (s: State, i: { readonly PlayWithFriends: string }, compact: boolean) =>
  html`<div class="row">
    <button type="button" data-intent=${i.PlayWithFriends} ?disabled=${s.creating}>${s.creating ? "Opening a table…" : "Play with friends"}</button>
    ${compact ? nothing : html`<span class="muted">Opens a private table and gives you a link to share.</span>`}
    ${s.error ? html`<span class="problem" role="alert">${s.error}</span>` : nothing}
  </div>`

const naming = (room: RoomSnapshot, i: { readonly Join: string }) =>
  html`<form class="box" data-intent=${i.Join}>
    <p>Table <strong class="code">${room.code}</strong>: choose a name to sit down.</p>
    <div class="row">
      <label>Your name <input name="name" maxlength="24" required autocomplete="nickname" value=${room.name} /></label>
      <button class="primary" type="submit">Join the table</button>
    </div>
  </form>`

const players = (table: TableSnapshot, room: RoomSnapshot) => {
  const turn = room.presence.deadline?.seat
  return html`<ul class="players" aria-label="Players">
    ${table.game.seats.map((seat) => {
      const you = seat.index === YOU && !room.spectator
      const on = room.presence.connected[seat.index] === true
      const what = seat.controller === "Ai" ? (on ? "joining" : "AI") : on || you ? "here" : "away"
      return html`<li class=${turn === seat.index ? "turn" : ""}>
        <span class=${on || you ? "dot on" : "dot"} aria-hidden="true"></span>${you ? `${seat.name} (you)` : seat.name}<span class="muted">${what}</span>
      </li>`
    })}
  </ul>`
}

const seated = (s: State, i: { readonly Copy: string }, table: TableSnapshot, room: RoomSnapshot, compact: boolean) => {
  const deadline = room.presence.deadline
  const left = deadline === undefined || s.now === undefined ? undefined : Math.max(0, Math.ceil((deadline.at - s.now) / 1000))
  const clock =
    left !== undefined && deadline !== undefined
      ? html`<span class="clock" role="timer" aria-live="off">${deadline.seat === YOU && !room.spectator ? "Your turn" : (table.game.seats[deadline.seat]?.name ?? "")}: ${left}s</span>`
      : nothing
  const status = room.connection !== "open" ? html`<span class="muted" role="status">Reconnecting…</span>` : nothing
  const heading = html`<span>Table <strong class="code">${room.code}</strong>${room.host ? " · host" : ""}${room.spectator ? " · watching" : ""}</span>`
  const problems = html`${room.problem ? html`<p class="problem" role="alert">${room.problem}</p>` : nothing}
  ${s.error ? html`<p class="problem" role="alert">${s.error}</p>` : nothing}`
  const leave = s.page?.pathname ?? "?"
  if (compact)
    return html`<details class="box">
      <summary class="row">${heading} ${status} ${clock}</summary>
      ${players(table, room)}
      <div class="row">
        <button type="button" data-intent=${i.Copy}>${s.copied ? "Link copied" : "Copy invite link"}</button>
        <a href=${leave}>Leave</a>
      </div>
      ${problems}
    </details>`
  return html`<div class="box">
    <div class="row">${heading} ${status} ${clock}</div>
    ${players(table, room)}
    <div class="row">
      <span class="muted">Invite:</span> <span class="link">${inviteOf(s, room)}</span>
      <button type="button" data-intent=${i.Copy}>${s.copied ? "Link copied" : "Copy link"}</button>
      <a href=${leave}>Leave the table</a>
    </div>
    ${problems}
  </div>`
}

export const SabaccRoom = define<State, Msg, Props>("sabacc-room", {
  props,
  init: () => [
    { table: undefined, page: undefined, creating: false, error: undefined, copied: false, now: undefined },
    [watchTable((table): Msg => ({ _tag: "TableChanged", table })), where((page): Msg => ({ _tag: "Located", page }))],
  ],
  intent: {
    PlayWithFriends: () => ({ _tag: "PlayWithFriends" }),
    Join: ({ formData }) => {
      const name = String(formData?.get("name") ?? "").trim()
      return name === "" ? undefined : { _tag: "Join", name }
    },
    Copy: () => ({ _tag: "Copy" }),
  },
  update: {
    // The clock runs only while someone's turn is counting down.
    TableChanged: (s, m) => {
      const counting = m.table.room?.presence.deadline !== undefined
      const was = s.table?.room?.presence.deadline !== undefined
      const next = { ...s, table: m.table }
      return counting === was ? next : [counting ? next : { ...next, now: undefined }, [ticking(counting, (now): Msg => ({ _tag: "Tick", now }))]]
    },
    Located: (s, m) => ({ ...s, page: m.page }),
    PlayWithFriends: (s) => [
      { ...s, creating: true, error: undefined },
      [
        request(
          { url: "/api/rooms", method: "POST" },
          {
            schema: NewRoom,
            onSuccess: (body): Msg => ({ _tag: "Opened", room: body.room }),
            onFailure: (e): Msg => ({ _tag: "OpenFailed", reason: openFailure(e) }),
            key: "open",
            concurrency: "exhaust",
          },
        ),
      ],
    ],
    Opened: (s, m) => [s, [go(`${s.page?.pathname ?? ""}?room=${m.room}`)]],
    OpenFailed: (s, m) => ({ ...s, creating: false, error: m.reason }),
    Join: (s, m) => [s, [join(m.name)]],
    Copy: (s) => {
      const room = s.table?.room
      return room === undefined ? s : [s, [copy<Msg>(inviteOf(s, room), { _tag: "Copied" }, () => ({ _tag: "CopyFailed" }))]]
    },
    Copied: (s) => [{ ...s, copied: true }, [delay<Msg>(2000, { _tag: "CopyDone" }, { key: "copied", concurrency: "switch" })]],
    CopyDone: (s) => ({ ...s, copied: false }),
    CopyFailed: (s) => ({ ...s, error: "Copy failed; select the link and copy it." }),
    Tick: (s, m) => ({ ...s, now: m.now }),
  },
  view: (s, i, { props: p }) => {
    const table = s.table
    if (table === undefined) return nothing
    const room = table.room
    if (room === undefined) return solo(s, i, p.compact)
    if (room.connection === "naming") return naming(room, i)
    if (room.connection === "gone")
      return html`<div class="box" role="alert"><p>${room.problem ?? "This table has closed."}</p><a href=${s.page?.pathname ?? "?"}>Play solo</a></div>`
    return seated(s, i, table, room, p.compact)
  },
  styles: [
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
      .dot.on { background: var(--positive); }
      li.turn { outline: 2px solid var(--accent); }
      .clock { font-variant-numeric: tabular-nums; color: var(--accent); }
      strong.code { font-family: var(--font-mono); letter-spacing: 0.12em; }
      details > summary { cursor: pointer; min-block-size: var(--tap); list-style-position: inside; }
      details[open] > summary { margin-block-end: var(--space-xs); }
    `,
  ],
})

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-room": InstanceType<typeof SabaccRoom>
  }
}
