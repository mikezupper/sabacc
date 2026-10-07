// Turns a game snapshot into targets for the 3D objects, and a new beat into one-off
// effects. Holds views keyed by card id, never game state: every call to `show` is
// given the full snapshot to draw.
import { Option } from "effect"
import * as THREE from "three"
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js"
import type { Card } from "../domain/cards.ts"
import { YOU, type Game, type GameEvent, type HandResult } from "../domain/model.ts"
import { deckSize, handPot, playing } from "../domain/table.ts"
import { CardView, type Glow } from "./card-view.ts"
import { betSpot, cardPlacement, CARD_Y, dealerSpot, handSpot, labelSpot, SPOTS, type CardRow } from "./layout.ts"
import { ChipStack, Deck, makeDealerButton, TurnRing } from "./props.ts"
import { burst, rollDice, tossChips } from "./effects.ts"
import "./plates.ts"
import { approach, easeInOutSine, Tweens } from "./motion.ts"

export interface BoardView {
  readonly game: Game
  /** The beat just reached, to animate once; undefined when nothing new happened. */
  readonly beat: GameEvent | undefined
  readonly selected: number | undefined
  readonly hover: number | undefined
  /** Your cards you may pick right now (your draw, outside the field). */
  readonly pickable: ReadonlySet<number>
  /** Reduced motion or skip: jump straight to the snapshot. */
  readonly instant: boolean
  /** Watching a multiplayer table: seat 0 isn't yours. */
  readonly spectator: boolean
  /** Seats whose hands the last reveal showed. */
  readonly revealed: ReadonlySet<number>
  /** Multiplayer: is a seat's person here, away, or is the AI playing it? */
  readonly presence: (seat: number) => "here" | "away" | "ai" | undefined
}

export interface BoardHooks {
  /** A Sabacc Shift landed: shake the camera, flash the lights. */
  readonly onShift: () => void
}

interface Slot {
  readonly card: Card
  readonly seat: number
  readonly row: CardRow
  readonly index: number
  readonly count: number
}

const lastHandOf = (game: Game): HandResult | undefined =>
  game.phase._tag === "Lobby" ? Option.getOrUndefined(game.phase.lastHand) : undefined

const slotsOf = (game: Game): ReadonlyArray<Slot> =>
  game.seats.flatMap((s) => {
    const field = s.hand.filter((c) => s.field.includes(c.id))
    const free = s.hand.filter((c) => !s.field.includes(c.id))
    return [
      ...free.map((card, index) => ({ card, seat: s.index, row: "hand" as const, index, count: free.length })),
      ...field.map((card, index) => ({ card, seat: s.index, row: "field" as const, index, count: field.length })),
    ]
  })

const at = (xz: readonly [number, number], y = 0) => new THREE.Vector3(xz[0], y, xz[1])

export class Board {
  readonly group = new THREE.Group()
  private readonly views = new Map<number, CardView>()
  private readonly seatOf = new Map<number, number>()
  private readonly leaving = new Set<CardView>()
  private readonly tweens = new Tweens()
  private readonly deck = new Deck()
  private readonly handPot = new ChipStack()
  private readonly sabaccPot = new ChipStack()
  private readonly bets: Array<ChipStack> = []
  private readonly plates: Array<{ el: HTMLElementTagNameMap["sabacc-plate"]; obj: CSS2DObject }> = []
  private readonly pots: Array<HTMLElementTagNameMap["sabacc-pot"]> = []
  private readonly dealer = makeDealerButton()
  private readonly dealerTarget = new THREE.Vector3()
  private readonly ring = new TurnRing()
  private readonly dice: ReadonlyArray<THREE.Mesh>
  private time = 0

  constructor(
    private readonly seats: number,
    private readonly hooks: BoardHooks,
  ) {
    this.deck.group.position.copy(at(SPOTS.deck))
    this.handPot.group.position.copy(at(SPOTS.handPot))
    this.sabaccPot.group.position.copy(at(SPOTS.sabaccPot))
    this.group.add(this.deck.group, this.handPot.group, this.sabaccPot.group, this.dealer, this.ring.mesh)
    for (let i = 0; i < seats; i++) {
      const stack = new ChipStack()
      stack.group.position.copy(at(betSpot(i, seats)))
      this.bets.push(stack)
      this.group.add(stack.group)
      const el = document.createElement("sabacc-plate")
      const obj = new CSS2DObject(el)
      obj.position.copy(at(labelSpot(i, seats), i === YOU ? 0.1 : 0.25))
      this.plates.push({ el, obj })
      this.group.add(obj)
    }
    for (const [spot, side] of [[SPOTS.handPot, "hand"], [SPOTS.sabaccPot, "sabacc"]] as const) {
      const el = document.createElement("sabacc-pot")
      el.label = side === "hand" ? "Hand pot" : "Sabacc pot"
      const obj = new CSS2DObject(el)
      obj.position.copy(at([spot[0], spot[1] + 0.55], 0.05))
      this.pots.push(el)
      this.group.add(obj)
    }
    this.dice = rollDice.make(this.group)
    this.dealer.position.copy(at(dealerSpot(0, seats), 0.04))
  }

  /** Card meshes you can click (yours, for picking). */
  pickTargets(ids: ReadonlySet<number>): ReadonlyArray<THREE.Object3D> {
    return [...ids].flatMap((id) => {
      const v = this.views.get(id)
      return v === undefined || v.leaving ? [] : [v.group]
    })
  }

  show(view: BoardView): void {
    const { game, beat } = view
    const last = lastHandOf(game)
    const shown = view.revealed
    const slots = slotsOf(game)
    const wanted = new Set(slots.map((s) => s.card.id))

    // Cards that left a hand since the last snapshot.
    const gone = [...this.views.values()].filter((v) => !wanted.has(v.id))
    const fresh = slots.filter((s) => !this.views.has(s.card.id))
    // A shift swaps designs in place: reuse the old card's object and spin it over.
    if (beat?._tag === "Shifted")
      for (const s of fresh) {
        const old = gone.find((v) => this.seatOf.get(v.id) === s.seat && !v.leaving)
        if (old === undefined) continue
        gone.splice(gone.indexOf(old), 1)
        this.views.delete(old.id)
        this.views.set(s.card.id, old)
        old.rekey(s.card.id)
        this.spin(old, s.card, (s.seat === YOU && !view.spectator) || shown.has(s.seat), view.instant)
      }
    for (const v of gone) this.discard(v, view.instant)

    let deal = 0
    const deckTop = at(SPOTS.deck, this.deck.height + 0.02)
    for (const s of slots) {
      const seat = game.seats[s.seat]
      const mine = s.seat === YOU && !view.spectator
      const out = seat !== undefined && seat.status._tag !== "Active"
      const revealed = shown.has(s.seat)
      const faceUp = mine || revealed
      let v = this.views.get(s.card.id)
      if (v === undefined) {
        v = new CardView(s.card)
        v.mover.position.copy(deckTop)
        v.mover.quaternion.setFromEuler(new THREE.Euler(0, 0, Math.PI))
        v.mover.delay = deal++ * 0.09
        this.views.set(s.card.id, v)
        this.group.add(v.group)
      }
      this.seatOf.set(s.card.id, s.seat)
      if (v.spinLift === 0) v.show(s.card, faceUp)
      v.mover.place(cardPlacement({ seat: s.seat, seats: this.seats, row: s.row, index: s.index, count: s.count, mine, faceUp, showdown: revealed && !mine, out }))
      if (s.card.id === view.selected) v.mover.target.y += 0.14
      else if (s.card.id === view.hover && view.pickable.has(s.card.id)) v.mover.target.y += 0.07
      v.opacity = out && !revealed ? 0.55 : 1
      const winner = last?.winners.includes(s.seat) ?? false
      const glow: Glow =
        s.card.id === view.selected ? "selected"
        : s.card.id === view.hover && view.pickable.has(s.card.id) ? "hover"
        : winner && revealed ? "winner"
        : s.row === "field" ? "field"
        : "none"
      v.setGlow(glow)
      if (view.instant) v.mover.snap()
    }

    this.props(view, last)
    if (beat !== undefined && !view.instant) this.effect(beat)
    if (view.instant) this.tweens.finish()
  }

  private props(view: BoardView, last: HandResult | undefined): void {
    const { game } = view
    const p = Option.getOrUndefined(playing(game))
    this.deck.set(p === undefined ? 76 : deckSize(game))
    this.handPot.set(p === undefined ? 0 : handPot(game))
    this.sabaccPot.set(game.sabaccPot)
    game.seats.forEach((s, i) => this.bets[i]?.set(p === undefined ? 0 : s.roundBet))
    this.dealerTarget.copy(at(dealerSpot(game.dealer, this.seats), 0.04))
    const toAct = p?.step.toAct[0]
    this.ring.shown = toAct !== undefined
    if (toAct !== undefined) this.ring.target.copy(at(handSpot(toAct, this.seats)))
    game.seats.forEach((s, i) => {
      const plate = this.plates[i]
      if (plate === undefined) return
      plate.el.plate = {
        seat: s,
        dealer: p !== undefined && game.dealer === s.index,
        active: toAct === s.index,
        revealed: view.revealed.has(s.index),
        result: last?.seats.find((r) => r.seat === s.index),
        mine: s.index === YOU && !view.spectator,
        presence: view.presence(s.index),
        winner: last?.winners.includes(s.index) ?? false,
      }
    })
    const [hand, sabacc] = this.pots
    if (hand !== undefined) hand.amount = p === undefined ? 0 : handPot(game)
    if (sabacc !== undefined) sabacc.amount = game.sabaccPot
    if (view.instant) this.dealer.position.copy(this.dealerTarget)
  }

  private effect(beat: GameEvent): void {
    const seatChips = (seat: number) => at(betSpot(seat, this.seats), 0.1)
    switch (beat._tag) {
      case "Dice":
        rollDice.throw(this.tweens, this.dice, beat.dice, beat.shift)
        break
      case "Shifted":
        this.hooks.onShift()
        break
      case "BetTo":
      case "Matched":
      case "WentAllIn":
        tossChips(this.tweens, this.group, at(labelSpot(beat.seat, this.seats), 0.3), seatChips(beat.seat), 3)
        break
      case "HandStarted":
        for (const seat of beat.seated) tossChips(this.tweens, this.group, at(labelSpot(seat, this.seats), 0.3), at(SPOTS.handPot, 0.2), 2)
        break
      case "Penalty":
        tossChips(this.tweens, this.group, at(labelSpot(beat.seat, this.seats), 0.3), at(SPOTS.sabaccPot, 0.2), 5)
        break
      case "HandEnded":
        for (const seat of beat.result.winners) {
          tossChips(this.tweens, this.group, at(SPOTS.handPot, 0.3), at(labelSpot(seat, this.seats), 0.3), 8)
          if (beat.result.sabaccPotWon > 0) tossChips(this.tweens, this.group, at(SPOTS.sabaccPot, 0.3), at(labelSpot(seat, this.seats), 0.3), 8)
          burst(this.tweens, this.group, at(betSpot(seat, this.seats), 0.4))
        }
        break
      default:
        break
    }
  }

  private spin(v: CardView, next: Card, faceVisible: boolean, instant: boolean): void {
    if (instant) {
      v.show(next, faceVisible)
      return
    }
    const axis = new THREE.Vector3(0, 0, 1)
    let swapped = false
    v.spinLift = 0.0001
    this.tweens.add({
      duration: 1.0,
      delay: Math.random() * 0.15,
      update: (t) => {
        const e = easeInOutSine(t)
        v.spin.setFromAxisAngle(axis, e * Math.PI * 2)
        v.spinLift = Math.sin(Math.PI * t) * 0.4 + 0.0001
        if (!swapped && t >= 0.5) {
          swapped = true
          v.show(next, faceVisible)
        }
      },
      done: () => {
        v.spin.identity()
        v.spinLift = 0
        v.show(next, faceVisible)
      },
    })
  }

  private discard(v: CardView, instant: boolean): void {
    if (v.leaving) return
    v.leaving = true
    this.views.delete(v.id)
    this.seatOf.delete(v.id)
    this.leaving.add(v)
    v.setGlow("none")
    v.mover.place({ x: SPOTS.discard[0], y: CARD_Y + 0.05, z: SPOTS.discard[1], yaw: Math.random() * 0.8 - 0.4, pitch: 0, roll: Math.PI, scale: 0.9 })
    const remove = () => {
      this.leaving.delete(v)
      this.group.remove(v.group)
      v.dispose()
    }
    if (instant) remove()
    else this.tweens.add({ duration: 0.4, delay: 0.55, update: (t) => (v.opacity = 1 - t), done: remove })
  }

  step(dt: number): void {
    this.time += dt
    this.tweens.step(dt)
    for (const v of this.views.values()) v.step(dt, this.time)
    for (const v of this.leaving) v.step(dt, this.time)
    this.ring.step(dt, this.time)
    this.dealer.position.lerp(this.dealerTarget, approach(5, dt))
  }

  /** The object drawing a card (tests). */
  viewOf(cardId: number): CardView | undefined {
    return this.views.get(cardId)
  }

  /** Number of card objects on the table (tests). */
  get cardCount(): number {
    return this.views.size
  }
}
