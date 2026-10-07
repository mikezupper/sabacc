// One card: face up (with `card`), face down (without), optionally locked in the
// interference field. Stateless: the view is a function of its props. One inline <svg>
// per side (SVG fragments can't be templates of their own in Gyral 0.3).
import { css, define, html, prop, type PropsOf, type Stateless } from "@gyral/core"
import { cardTitle, describeCard, type Card, type Suit } from "../domain/cards.ts"
import { base } from "../styles/shared.ts"
import { cardSchema } from "./prop-schemas.ts"

/** Suit marks as path data, centred on (0, 0), about 12 units across. */
const SUIT_PATH: Record<Suit, string> = {
  Flasks: "M-5 5 L0 -5 L5 5 Z",
  Sabers: "M0 -6 L4 0 L0 6 L-4 0 Z",
  Staves: "M-1.6 -5 Q-1.6 -6 -0.6 -6 L0.6 -6 Q1.6 -6 1.6 -5 L1.6 5 Q1.6 6 0.6 6 L-0.6 6 Q-1.6 6 -1.6 5 Z",
  Coins: "M-5 0 A5 5 0 1 0 5 0 A5 5 0 1 0 -5 0 Z",
}

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0")

/** Greedy word wrap for names (full name, never truncated). */
const wrap = (name: string, width = 13): ReadonlyArray<string> =>
  name.split(" ").reduce<ReadonlyArray<string>>((lines, word) => {
    const last = lines.at(-1)
    return last !== undefined && `${last} ${word}`.length <= width ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, word]
  }, [])

/** The edge colour family: suited green, face red, the Idiot gold. */
const kind = (c: Card): string => (c._tag === "Suited" ? "kind-suited" : c.value === 0 ? "kind-idiot" : "kind-face")

const props = {
  card: prop.value(cardSchema),
  /** In the interference field: frozen against shifts. */
  locked: prop.boolean(),
}
type Props = PropsOf<typeof props>

const back = (locked: boolean) =>
  html`<svg viewBox="0 0 80 120" class="back-card" role="img" aria-label=${locked ? "Face-down card in the interference field" : "Face-down card"}>
    <rect class="field" x="-3" y="-3" width="86" height="126" rx="12" display=${locked ? "inline" : "none"}></rect>
    <text class="field-label" x="40" y="-6" text-anchor="middle" display=${locked ? "inline" : "none"}>FIELD</text>
    <rect class="back" x="1.5" y="1.5" width="77" height="117" rx="9"></rect>
    <path class="back-art" d="M14 14 L66 106 M66 14 L14 106"></path>
    <circle class="back-art" cx="40" cy="60" r="16"></circle>
  </svg>`

const face = (c: Card, locked: boolean) => {
  const label = `${describeCard(c)}${locked ? ", in the interference field" : ""}`
  const corner = c._tag === "Suited" ? (c.value > 11 ? cardTitle(c).slice(0, 2) : String(c.value)) : signed(c.value)
  const names = c._tag === "Face" ? wrap(c.name) : c.value > 11 ? [cardTitle(c)] : []
  const suit = c._tag === "Suited" ? SUIT_PATH[c.suit] : ""
  // A suited card without a name carries a big suit mark where the name would go.
  const bigSuit = c._tag === "Suited" && names.length === 0
  return html`<svg viewBox="0 0 80 120" class=${kind(c)} role="img" aria-label=${label}>
    <title>${label}</title>
    <rect class="field" x="-3" y="-3" width="86" height="126" rx="12" display=${locked ? "inline" : "none"}></rect>
    <text class="field-label" x="40" y="-6" text-anchor="middle" display=${locked ? "inline" : "none"}>FIELD</text>
    <rect class="face" x="1.5" y="1.5" width="77" height="117" rx="9"></rect>
    <text class="corner" x="8" y="17">${corner}</text>
    <text class="corner" x="72" y="111" text-anchor="end">${corner}</text>
    <text class="value" x="40" y="58" text-anchor="middle" dominant-baseline="middle">${signed(c.value)}</text>
    <path class="suit" d=${suit} transform="translate(12 28) scale(0.7)"></path>
    <path class="suit" d=${bigSuit ? suit : ""} transform="translate(40 90)"></path>
    <text class="name" x="40" y="84" text-anchor="middle">${names[0] ?? ""}</text>
    <text class="name" x="40" y="95" text-anchor="middle">${names[1] ?? ""}</text>
    <text class="name" x="40" y="106" text-anchor="middle">${names[2] ?? ""}</text>
  </svg>`
}

export const SabaccCard = define<Stateless, never, Props>("sabacc-card", {
  props,
  intent: {},
  update: {},
  view: (_s, _i, { props: p }) => (p.card === undefined ? back(p.locked) : face(p.card, p.locked)),
  styles: [
    base,
    css`
      :host { display: inline-block; inline-size: var(--card-size, 5rem); }
      svg { inline-size: 100%; block-size: auto; overflow: visible; }
      .face { fill: var(--surface-raised); stroke: var(--edge); stroke-width: 2.5; }
      .back { fill: var(--surface-sunken); stroke: var(--accent); stroke-width: 2.5; }
      .back-art { fill: none; stroke: var(--accent); stroke-width: 2; opacity: 0.8; }
      .value { fill: var(--text); font: 700 25px var(--font-display); }
      .corner { fill: var(--text); font: 600 11px var(--font-body); }
      .suit { fill: var(--edge); }
      .name { fill: var(--edge); font: 600 9px var(--font-body); }
      .field { fill: none; stroke: var(--neutral); stroke-width: 3; stroke-dasharray: 5 3; }
      .field-label { fill: var(--neutral); font: 700 8px var(--font-body); letter-spacing: 0.08em; }
      .kind-suited { --edge: var(--positive); }
      .kind-face { --edge: var(--negative); }
      .kind-idiot { --edge: var(--accent); }
    `,
  ],
})

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-card": InstanceType<typeof SabaccCard>
  }
}
