// The 3D table. Same model as the classic table (it watches the table store and plays
// each transition back beat by beat, with longer delays so cards can fly and dice can
// tumble), drawn by the Three.js stage (<sabacc-stage>), with the shared HUD pieces
// (prompt, <sabacc-controls>, <sabacc-room>, <sabacc-log>) around it.
import { Option } from "effect"
import { child, define, html, nothing, type IntentNames } from "@gyral/core"
import { OPPONENT_COUNT } from "../domain/constants.ts"
import { YOU, type Game } from "../domain/model.ts"
import { describeEvaluation, evaluate } from "../domain/scoring.ts"
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
import { base, buttons } from "../styles/shared.ts"
import { reducedMotion } from "../components/browser-drivers.ts"
import { nextBeat } from "../components/playback-commands.ts"
import { SabaccControls, type ControlsOutput } from "../components/sabacc-controls.ts"
import "../components/sabacc-log.ts"
import "../components/sabacc-room.ts"
import { tableContext } from "../components/table-context.ts"
import { watchTable, type TableSnapshot } from "../components/table-driver.ts"
import { hud } from "./hud-styles.ts"
import { type StageEvent, type StageView } from "./sabacc-stage.ts"
import "./sabacc-stage.ts"
import { sceneBeatDelay } from "./timing.ts"

export interface State {
  readonly table: TableSnapshot | undefined
  readonly playback: Playback
  readonly reduce: boolean
  /** Your chosen card for Lock / Trade, and the card under the pointer (UI state only). */
  readonly selected: number | undefined
  readonly hover: number | undefined
  /** The browser can't draw WebGL: show the fallback. */
  readonly failed: boolean
  /** Bumped by "Reset view". */
  readonly reset: number
}

export type Msg =
  | { readonly _tag: "TableChanged"; readonly table: TableSnapshot }
  | { readonly _tag: "Advance"; readonly run: number; readonly shown: number }
  | { readonly _tag: "Skip" }
  | { readonly _tag: "Motion"; readonly reduce: boolean }
  | { readonly _tag: "Controls"; readonly out: ControlsOutput }
  | { readonly _tag: "Stage"; readonly event: StageEvent }
  | { readonly _tag: "ResetView" }

const advance = (run: number, shown: number): Msg => ({ _tag: "Advance", run, shown })

/** Your free cards you may pick right now: your draw, outside the field, nothing playing. */
const pickable = (s: State, game: Game): ReadonlySet<number> => {
  if (s.table?.room?.spectator === true || isPlaying(s.playback)) return new Set()
  const step = yourStep(game)
  const you = Option.getOrUndefined(seatAt(game, YOU))
  if (step?._tag !== "Drawing" || you === undefined) return new Set()
  return new Set(you.hand.filter((c) => !you.field.includes(c.id)).map((c) => c.id))
}

/** Drop a selection that's no longer pickable (the card was locked, traded, or the turn moved on). */
const tidy = (s: State): State => {
  if (s.selected === undefined || s.table === undefined) return s
  return pickable(s, frame(s.playback, s.table.game)).has(s.selected) ? s : { ...s, selected: undefined }
}

const tableChanged = (s: State, table: TableSnapshot): State => {
  if (s.table !== undefined && table.last === s.table.last) return tidy({ ...s, table })
  const playback = startPlayback(s.playback, table.last, s.table === undefined || s.reduce)
  return tidy({ ...s, table, playback })
}

const isStageEvent = (u: unknown): u is StageEvent =>
  typeof u === "object" && u !== null && ["Picked", "Hovered", "Failed"].includes((u as { _tag?: string })._tag ?? "")

const hudView = (s: State, table: TableSnapshot, game: Game, i: IntentNames<"Controls" | "ResetView">) => {
  const ctx = tableContext(table, game)
  const room = html`<sabacc-room compact></sabacc-room>`
  if (table.room?.connection === "naming") return html`<div class="overlay"><div class="naming">${room}</div></div>`
  const you = Option.getOrUndefined(seatAt(game, YOU))
  const p = Option.getOrUndefined(playing(game))
  const shifted = revealed(s.playback).some((b) => b.event._tag === "Shifted")
  const evaluation = !ctx.spectator && you !== undefined && you.hand.length > 0 ? evaluate(you.hand) : undefined
  const prompt = promptFor({
    game,
    notice: table.notice,
    beat: currentBeat(s.playback)?.event,
    welcomeBack: table.restored && table.log.length === 0,
    who: ctx.narrator,
    spectator: ctx.spectator,
  })
  return html`
    <header class="top">
      <slot name="title"></slot>
      <dl class="status">
        <div><dt>${ctx.spectator ? "Watching" : "Your credits"}</dt><dd>${ctx.spectator ? "—" : formatCredits(you?.credits ?? 0)}</dd></div>
        <div><dt>Hand pot</dt><dd>${formatCredits(p ? handPot(game) : 0)}</dd></div>
        <div><dt>Sabacc pot</dt><dd>${formatCredits(game.sabaccPot)}</dd></div>
        <div><dt>Round</dt><dd>${p ? p.round : "—"}</dd></div>
        <div><dt>Deck</dt><dd>${deckSize(game)}</dd></div>
      </dl>
      <nav aria-label="Views">
        <button type="button" data-intent=${i.ResetView}>Reset view</button>
        <a href="/">Classic table</a>
      </nav>
    </header>
    <div class="overlay">
      ${shifted ? html`<p class="shift" role="alert">Sabacc Shift! Every card outside the interference field changed.</p>` : nothing}
      <aside class="side" aria-label="Table and game log">
        ${room}
        <sabacc-log .events=${table.log.slice(0, table.log.length - pending(s.playback))} .names=${ctx.names} ?spectator=${ctx.spectator}></sabacc-log>
        ${table.room === undefined
          ? html`<p class="seed">
              ${table.persistent ? "Saved in this browser (shared with the classic table)." : "Replay table: not saved."}
              Seed <data value=${table.seed}>${table.seed}</data> ·
              <a href=${`?seed=${table.seed}`}>Replay</a>
            </p>`
          : nothing}
      </aside>
    </div>
    <section class="panel" aria-label="Your seat">
      <output aria-live="polite" ?data-error=${Option.isSome(table.notice)}>${prompt}</output>
      ${evaluation !== undefined ? html`<p class="mine" ?data-bomb=${evaluation.bombedOut}>Your hand: ${describeEvaluation(evaluation)}</p>` : nothing}
      <sabacc-controls
        pick
        ?spectator=${ctx.spectator}
        ?hide-new-table=${!ctx.canStartNewTable}
        .game=${game}
        .selected=${s.selected}
        ?playing=${isPlaying(s.playback)}
        .pending=${pending(s.playback)}
        data-intent=${i.Controls}
      ></sabacc-controls>
    </section>
  `
}

export const Sabacc3d = define<State, Msg>()("sabacc-3d", {
  init: () => ({ table: undefined, playback: noPlayback, reduce: false, selected: undefined, hover: undefined, failed: false, reset: 0 }),
  subscriptions: (s) => [
    watchTable((table): Msg => ({ _tag: "TableChanged", table })),
    reducedMotion((reduce): Msg => ({ _tag: "Motion", reduce })),
    ...nextBeat(s.playback, advance, sceneBeatDelay),
  ],
  intent: {
    Controls: child(SabaccControls, (out) => ({ _tag: "Controls" as const, out })),
    Stage: ({ detail }) => (isStageEvent(detail) ? { _tag: "Stage", event: detail } : undefined),
    ResetView: true,
  },
  update: {
    TableChanged: (s, m) => tableChanged(s, m.table),
    Advance: (s, m) => {
      const playback = advancePlayback(s.playback, m.run, m.shown)
      return playback === s.playback ? s : tidy({ ...s, playback })
    },
    Skip: (s) => tidy({ ...s, playback: skipPlayback(s.playback) }),
    Motion: (s, m) => ({ ...s, reduce: m.reduce, playback: m.reduce ? skipPlayback(s.playback) : s.playback }),
    Controls: (s, m) => (m.out._tag === "Skip" ? tidy({ ...s, playback: skipPlayback(s.playback) }) : { ...s, selected: m.out.cardId }),
    Stage: (s, m) => {
      switch (m.event._tag) {
        case "Picked":
          return { ...s, selected: s.selected === m.event.cardId ? undefined : m.event.cardId }
        case "Hovered":
          return { ...s, hover: m.event.cardId }
        case "Failed":
          return { ...s, failed: true }
      }
    },
    ResetView: (s) => ({ ...s, reset: s.reset + 1 }),
  },
  view: (s, i) => {
    const table = s.table
    // While a playback runs, draw the snapshot being shown; otherwise the live game.
    const game = table === undefined ? undefined : frame(s.playback, table.game)
    const ctx = table === undefined || game === undefined ? undefined : tableContext(table, game)
    const stage: StageView | undefined =
      game === undefined || ctx === undefined
        ? undefined
        : {
            seats: game.seats.length || OPPONENT_COUNT + 1,
            board: {
              game,
              beat: revealed(s.playback).at(-1),
              reduce: s.reduce,
              selected: s.selected,
              hover: s.hover,
              pickable: pickable(s, game),
              spectator: ctx.spectator,
              revealed: ctx.revealed,
              presence: ctx.presence,
            },
            reset: s.reset,
          }
    return html`
      <!-- The stage reports picks, hovers and a missing WebGL as "stage-event" (sabacc-stage.ts). -->
      <sabacc-stage class="stage" role="img" aria-label="3D Sabacc table. Your moves and the table's state are in the panels." .view=${stage} data-intent=${i.Stage} data-intent-on="stage-event"></sabacc-stage>
      ${s.failed
        ? html`<div class="fallback" role="alert">
            <p>This browser can't draw the 3D table (WebGL is unavailable).</p>
            <p><a href="/">Play on the classic table instead</a>.</p>
          </div>`
        : nothing}
      ${table !== undefined && game !== undefined ? hudView(s, table, game, i) : nothing}
    `
  },
  styles: [base, buttons, hud],
})
