// The classic table. It watches the table store through the table driver, plays each
// transition back beat by beat (opponents' turns, shifts) as model state with timer
// subscriptions, and composes the seats, controls, room panel and log. The store's game is
// already final throughout; playback only chooses which snapshot to draw.
import { Option } from "effect"
import { child, css, define, html, nothing, type IntentNames } from "@gyral/core"
import { Command, YOU, type Game } from "../domain/model.ts"
import { deckSize, handPot, playing, seatAt } from "../domain/table.ts"
import { formatCredits } from "../presentation/describe.ts"
import {
  advancePlayback,
  currentBeat,
  frame,
  isPlaying,
  noPlayback,
  pending,
  revealed,
  skipPlayback,
  startPlayback,
  type Playback,
} from "../presentation/playback.ts"
import { promptFor, yourStep } from "../presentation/prompt.ts"
import { base } from "../styles/shared.ts"
import { reducedMotion } from "./browser-drivers.ts"
import { nextBeat } from "./playback-commands.ts"
import { SabaccControls, type ControlsOutput } from "./sabacc-controls.ts"
import "./sabacc-log.ts"
import "./sabacc-room.ts"
import { SabaccSeat, type SeatOutput } from "./sabacc-seat.ts"
import { tableContext, type TableContext } from "./table-context.ts"
import { play, watchTable, type TableSnapshot } from "./table-driver.ts"

export interface State {
  readonly table: TableSnapshot | undefined
  readonly playback: Playback
  /** The visitor asked for reduced motion: every playback is instant. */
  readonly reduce: boolean
}

export type Msg =
  | { readonly _tag: "TableChanged"; readonly table: TableSnapshot }
  | { readonly _tag: "Advance"; readonly run: number; readonly shown: number }
  | { readonly _tag: "Skip" }
  | { readonly _tag: "Motion"; readonly reduce: boolean }
  | { readonly _tag: "Seat"; readonly out: SeatOutput }
  | { readonly _tag: "Controls"; readonly out: ControlsOutput }

const advance = (run: number, shown: number): Msg => ({ _tag: "Advance", run, shown })

/** A new snapshot: a new transition starts a playback (the first one is shown as it stands). */
const tableChanged = (s: State, table: TableSnapshot): State => {
  if (s.table !== undefined && table.last === s.table.last) return { ...s, table }
  const playback = startPlayback(s.playback, table.last, s.table === undefined || s.reduce)
  return { ...s, table, playback }
}

const seatView = (game: Game, ctx: TableContext, index: number, i: IntentNames<"Seat">) => {
  const lastHand = game.phase._tag === "Lobby" ? Option.getOrUndefined(game.phase.lastHand) : undefined
  const p = Option.getOrUndefined(playing(game))
  return html`<sabacc-seat
    .seat=${game.seats[index]}
    ?reveal=${ctx.revealed.has(index)}
    ?winner=${lastHand?.winners.includes(index) ?? false}
    ?dealer=${p !== undefined && game.dealer === index}
    ?spectating=${ctx.spectator}
    .presence=${ctx.presence(index)}
    .result=${lastHand?.seats.find((r) => r.seat === index)}
    data-intent=${i.Seat}
  ></sabacc-seat>`
}

const board = (s: State, table: TableSnapshot, game: Game, i: IntentNames<"Seat" | "Controls">) => {
  const ctx = tableContext(table, game)
  const you = Option.getOrUndefined(seatAt(game, YOU))
  const p = Option.getOrUndefined(playing(game))
  const step = ctx.spectator ? undefined : yourStep(game)
  const lastHand = game.phase._tag === "Lobby" ? Option.getOrUndefined(game.phase.lastHand) : undefined
  const shifted = revealed(s.playback).some((b) => b.event._tag === "Shifted")
  const drawing = step?._tag === "Drawing"
  const others = game.seats.filter((seat) => ctx.spectator || seat.index !== YOU)
  const prompt = promptFor({
    game,
    notice: table.notice,
    beat: currentBeat(s.playback)?.event,
    // Until anything happens after a reload, say the table came back from storage.
    welcomeBack: table.restored && table.log.length === 0,
    who: ctx.narrator,
    spectator: ctx.spectator,
  })
  const controls = html`<sabacc-controls
    .game=${game}
    ?playing=${isPlaying(s.playback)}
    .pending=${pending(s.playback)}
    ?spectator=${ctx.spectator}
    ?hide-new-table=${!ctx.canStartNewTable}
    data-intent=${i.Controls}
  ></sabacc-controls>`
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
    <output aria-live="polite" ?data-error=${Option.isSome(table.notice)}>${prompt}</output>

    ${ctx.spectator
      ? nothing
      : html`<section class="stack" aria-labelledby="you-heading">
          <h2 id="you-heading" class="visually-hidden">Your seat</h2>
          <sabacc-seat
            .seat=${you}
            ?reveal=${ctx.revealed.has(YOU)}
            ?winner=${lastHand?.winners.includes(YOU) ?? false}
            ?dealer=${p !== undefined && game.dealer === YOU}
            ?card-actions=${drawing}
            ?can-lock=${step?._tag === "Drawing" && !step.lockedThisTurn}
            ?can-trade=${drawing && deckSize(game) > 0}
            .result=${lastHand?.seats.find((r) => r.seat === YOU)}
            .presence=${ctx.presence(YOU)}
            data-intent=${i.Seat}
          ></sabacc-seat>
          ${controls}
        </section>`}

    <section class="stack" aria-labelledby="opponents-heading">
      <h2 id="opponents-heading">${ctx.spectator ? "Players" : "Opponents"}</h2>
      <ul class="opponents">
        ${others.map((seat) => html`<li>${seatView(game, ctx, seat.index, i)}</li>`)}
      </ul>
    </section>
    ${ctx.spectator ? controls : nothing}

    <sabacc-log .events=${table.log.slice(0, table.log.length - pending(s.playback))} .names=${ctx.names} ?spectator=${ctx.spectator}></sabacc-log>
  `
}

export const SabaccTable = define<State, Msg>()("sabacc-table", {
  init: () => ({ table: undefined, playback: noPlayback, reduce: false }),
  subscriptions: (s) => [
    watchTable((table): Msg => ({ _tag: "TableChanged", table })),
    reducedMotion((reduce): Msg => ({ _tag: "Motion", reduce })),
    ...nextBeat(s.playback, advance),
  ],
  intent: {
    Seat: child(SabaccSeat, (out) => ({ _tag: "Seat" as const, out })),
    Controls: child(SabaccControls, (out) => ({ _tag: "Controls" as const, out })),
  },
  update: {
    TableChanged: (s, m) => tableChanged(s, m.table),
    Advance: (s, m) => {
      const playback = advancePlayback(s.playback, m.run, m.shown)
      return playback === s.playback ? s : { ...s, playback }
    },
    Skip: (s) => ({ ...s, playback: skipPlayback(s.playback) }),
    Motion: (s, m) => ({ ...s, reduce: m.reduce, playback: m.reduce ? skipPlayback(s.playback) : s.playback }),
    Seat: (s, m) => [s, [play(m.out.action === "lock" ? Command.Lock({ cardId: m.out.cardId }) : Command.Trade({ cardId: m.out.cardId }))]],
    Controls: (s, m) => (m.out._tag === "Skip" ? { ...s, playback: skipPlayback(s.playback) } : s),
  },
  view: (s, i) => {
    const table = s.table
    if (table === undefined) return nothing
    // While a playback runs, draw the snapshot being shown; otherwise the live game.
    const game = frame(s.playback, table.game)
    const seated = table.room === undefined || table.room.connection !== "naming"
    return html`<div class="stack">
      <sabacc-room></sabacc-room>
      ${seated ? board(s, table, game, i) : nothing}
      <p class="seed">
        ${table.room !== undefined
          ? html`Multiplayer table <strong>${table.room.code}</strong>: the server keeps the game. <a href="/">Play solo</a>`
          : html`${table.persistent ? "Your table is saved in this browser." : "Replay table: not saved."}
              Seed <data value=${table.seed}>${table.seed}</data> · <a href=${`?seed=${table.seed}`}>Replay from this seed</a>`}
      </p>
    </div>`
  },
  styles: [
    base,
    css`
      :host { display: block; container-type: inline-size; }
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
  ],
})
