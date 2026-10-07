// Your actions for the game being shown: deal, bet, draw, call. Shared by the classic
// table and the 3D view. A Gyral component: intents name the buttons, reducers are pure,
// moves go to the table store through the table driver (`play`). Skip ahead and the card
// you choose are the parent's business, so they go up as outputs.
//
// Card actions on your draw: with `pick`, this element lists your free cards to choose one
// (the 3D view also picks by clicking a card) and offers Lock / Trade for it. Without
// `pick`, the classic table shows Lock / Trade under each card instead.
import { Option } from "effect"
import { css, define, each, emit, html, intents, nothing, prop, type PropsOf } from "@gyral/core"
import { cardTitle, describeCard, type Card } from "../domain/cards.ts"
import { BUY_IN, MIN_BET } from "../domain/constants.ts"
import { Command, YOU, type Game, type Seat } from "../domain/model.ts"
import { deckSize, seatAt } from "../domain/table.ts"
import { formatCredits } from "../presentation/describe.ts"
import { yourStep } from "../presentation/prompt.ts"
import { base, buttons } from "../styles/shared.ts"
import { cardIdSchema, gameSchema } from "./prop-schemas.ts"
import { play } from "./table-driver.ts"

const props = {
  /** The game as currently shown (a playback snapshot or the live game). */
  game: prop.value(gameSchema),
  /** A playback is running: offer Skip ahead instead of moves. */
  playing: prop.boolean(),
  pending: prop.number({ default: 0 }),
  /** Choose a card here for Lock / Trade (3D view). */
  pick: prop.boolean(),
  /** The chosen card id in `pick` mode. */
  selected: prop.value(cardIdSchema),
  /** Watching a multiplayer table: no moves to offer. */
  spectator: prop.boolean(),
  /** A multiplayer guest: only the host may start a new table. */
  hideNewTable: prop.boolean(),
}
export type ControlsProps = PropsOf<typeof props>

interface State {
  /** Draft amount for Bet / Raise to, before it's clamped to what's allowed. */
  readonly amount: number
}

type Msg =
  | { readonly _tag: "Deal" }
  | { readonly _tag: "NewTable" }
  | { readonly _tag: "Check" }
  | { readonly _tag: "Match" }
  | { readonly _tag: "AllIn" }
  | { readonly _tag: "Fold" }
  | { readonly _tag: "Amount"; readonly amount: number }
  | { readonly _tag: "Bet" }
  | { readonly _tag: "Gain" }
  | { readonly _tag: "Stand" }
  | { readonly _tag: "Choose"; readonly cardId: number }
  | { readonly _tag: "Lock" }
  | { readonly _tag: "Trade" }
  | { readonly _tag: "CallHand" }
  | { readonly _tag: "Pass" }
  | { readonly _tag: "Skip" }

/** What the parent hears: skip the playback, or the card you chose (pick mode). */
export type ControlsOutput = { readonly _tag: "Skip" } | { readonly _tag: "CardSelected"; readonly cardId: number | undefined }

/**
 * The DOM event that carries a Gyral child's outputs. A Gyral parent listens with
 * `child()`; the remaining Lit parents listen for this event until they're converted.
 */
export const OUTPUT_EVENT = "gyral-output"

const i = intents<Msg>()

const you = (game: Game | undefined): Seat | undefined => (game === undefined ? undefined : Option.getOrUndefined(seatAt(game, YOU)))

/** Bet limits on your betting turn: the least you may bet or raise to, and the most. */
const betRange = (game: Game | undefined) => {
  const step = game === undefined ? undefined : yourStep(game)
  const me = you(game)
  if (step?._tag !== "Betting" || me === undefined) return undefined
  return {
    owe: step.currentBet - me.roundBet,
    opening: step.currentBet === 0,
    minTo: step.currentBet === 0 ? MIN_BET : step.currentBet + step.minRaise,
    maxTo: me.roundBet + me.credits,
  }
}

const clamp = (amount: number, r: { readonly minTo: number; readonly maxTo: number }): number => Math.min(Math.max(amount, r.minTo), r.maxTo)

/** Your free cards (outside the interference field), and the chosen one. */
const freeCards = (p: ControlsProps): ReadonlyArray<Card> => {
  const me = you(p.game)
  return me === undefined ? [] : me.hand.filter((c) => !me.field.includes(c.id))
}
const chosen = (p: ControlsProps): Card | undefined => freeCards(p).find((c) => c.id === p.selected)

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n))

/** One card to choose in pick mode (a pure row: reads only its arguments). */
const PickRow = (c: Card, pressed: boolean) =>
  html`<button type="button" value=${c.id} aria-pressed=${pressed ? "true" : "false"} aria-label=${describeCard(c)} data-intent=${i.Choose}>
    ${cardTitle(c)} ${signed(c.value)}
  </button>`

const picker = (p: ControlsProps, canLock: boolean, canTrade: boolean) => {
  const pickedId = chosen(p)?.id
  return html`<div class="pick" role="group" aria-label="Choose a card to lock or trade">
      ${each(freeCards(p), (c) => c.id, PickRow, (c) => c.id === pickedId)}
    </div>
    <button type="button" data-intent=${i.Lock} ?disabled=${pickedId === undefined || !canLock}>Lock</button>
    <button type="button" data-intent=${i.Trade} ?disabled=${pickedId === undefined || !canTrade}>Trade</button>`
}

export const SabaccControls = define<State, Msg, ControlsProps, ControlsOutput>("sabacc-controls", {
  props,
  init: () => ({ amount: MIN_BET }),
  intent: {
    Deal: () => ({ _tag: "Deal" }),
    NewTable: () => ({ _tag: "NewTable" }),
    Check: () => ({ _tag: "Check" }),
    Match: () => ({ _tag: "Match" }),
    AllIn: () => ({ _tag: "AllIn" }),
    Fold: () => ({ _tag: "Fold" }),
    Amount: ({ value }) => {
      const amount = Number(value)
      return value !== undefined && value !== "" && Number.isFinite(amount) ? { _tag: "Amount", amount } : undefined
    },
    Bet: () => ({ _tag: "Bet" }),
    Gain: () => ({ _tag: "Gain" }),
    Stand: () => ({ _tag: "Stand" }),
    Choose: ({ value }) => {
      const cardId = Number(value)
      return Number.isInteger(cardId) ? { _tag: "Choose", cardId } : undefined
    },
    Lock: () => ({ _tag: "Lock" }),
    Trade: () => ({ _tag: "Trade" }),
    CallHand: () => ({ _tag: "CallHand" }),
    Pass: () => ({ _tag: "Pass" }),
    Skip: () => ({ _tag: "Skip" }),
  },
  update: {
    Deal: (s) => [s, [play(Command.StartHand())]],
    NewTable: (s) => [s, [play(Command.NewTable())]],
    Check: (s) => [s, [play(Command.Check())]],
    Match: (s) => [s, [play(Command.Match())]],
    AllIn: (s) => [s, [play(Command.AllIn())]],
    Fold: (s) => [s, [play(Command.Fold())]],
    Amount: (s, m) => ({ ...s, amount: m.amount }),
    Bet: (s, _m, { props: p }) => {
      const r = betRange(p.game)
      return r === undefined ? s : [s, [play(Command.BetTo({ to: clamp(s.amount, r) }))]]
    },
    Gain: (s) => [s, [play(Command.Gain())]],
    Stand: (s) => [s, [play(Command.Stand())]],
    // Choosing the chosen card again un-chooses it.
    Choose: (s, m, { props: p }) => [s, [emit({ _tag: "CardSelected", cardId: m.cardId === p.selected ? undefined : m.cardId } satisfies ControlsOutput)]],
    Lock: (s, _m, { props: p }) => {
      const c = chosen(p)
      return c === undefined ? s : [s, [play(Command.Lock({ cardId: c.id }))]]
    },
    Trade: (s, _m, { props: p }) => {
      const c = chosen(p)
      return c === undefined ? s : [s, [play(Command.Trade({ cardId: c.id }))]]
    },
    CallHand: (s) => [s, [play(Command.CallHand())]],
    Pass: (s) => [s, [play(Command.Pass())]],
    Skip: (s) => [s, [emit({ _tag: "Skip" } satisfies ControlsOutput)]],
  },
  view: (s, i, { props: p }) => {
    const game = p.game
    const me = you(game)
    if (game === undefined || me === undefined) return nothing
    if (p.playing)
      return html`<div class="controls" role="group" aria-label="Playback">
        <button type="button" data-intent=${i.Skip}>Skip ahead</button>
        <p class="hint">${p.pending} more ${p.pending === 1 ? "move" : "moves"} to show.</p>
      </div>`
    if (p.spectator) return nothing
    if (game.phase._tag === "Lobby")
      return html`<div class="controls" role="group" aria-label="Table">
        <button type="button" class="primary" data-intent=${i.Deal} ?disabled=${me.credits < BUY_IN}>
          Deal a hand (${formatCredits(BUY_IN)} in antes)
        </button>
        ${p.hideNewTable ? nothing : html`<button type="button" class="push" data-intent=${i.NewTable}>New table</button>`}
      </div>`
    const step = yourStep(game)
    if (step === undefined) return html`<p class="hint">${me.status._tag === "Active" ? "Waiting for the table…" : "You're out of this hand."}</p>`
    switch (step._tag) {
      case "Betting": {
        const r = betRange(game)
        if (r === undefined) return nothing
        return html`<div class="controls" role="group" aria-label="Your bet">
          ${r.owe > 0
            ? html`<button type="button" class="primary" data-intent=${i.Match}>Match ${formatCredits(Math.min(r.owe, me.credits))}</button>`
            : html`<button type="button" class="primary" data-intent=${i.Check}>Check</button>`}
          ${r.maxTo > r.minTo
            ? html`<label>
                  ${r.opening ? "Bet" : "Raise to"}
                  <input type="number" inputmode="numeric" min=${r.minTo} max=${r.maxTo} step=${MIN_BET} value=${clamp(s.amount, r)} data-intent=${i.Amount} />
                </label>
                <button type="button" data-intent=${i.Bet}>${r.opening ? "Bet" : "Raise"}</button>`
            : nothing}
          <button type="button" data-intent=${i.AllIn} ?disabled=${me.credits === 0}>All-in (${formatCredits(me.credits)})</button>
          <button type="button" class="danger push" data-intent=${i.Fold}>Fold</button>
        </div>`
      }
      case "Drawing":
        return html`<div class="controls" role="group" aria-label="Your draw">
          ${p.pick ? picker(p, !step.lockedThisTurn, deckSize(game) > 0) : nothing}
          <button type="button" class="primary" data-intent=${i.Gain} ?disabled=${deckSize(game) === 0}>Gain a card</button>
          <button type="button" data-intent=${i.Stand}>Stand</button>
          ${p.pick ? nothing : html`<p class="hint">Trade or lock a card with the buttons under it.</p>`}
        </div>`
      case "CallWindow":
        return html`<div class="controls" role="group" aria-label="Call window">
          <button type="button" class="primary" data-intent=${i.CallHand}>Call the hand</button>
          <button type="button" data-intent=${i.Pass}>Keep playing</button>
          <p class="hint">Losing a call costs a penalty equal to the hand pot.</p>
        </div>`
    }
  },
  styles: [
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
  ],
})

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-controls": InstanceType<typeof SabaccControls>
  }
}
