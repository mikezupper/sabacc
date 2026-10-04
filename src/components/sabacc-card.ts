import { css, html, LitElement, svg } from "lit"
import { customElement, property } from "lit/decorators.js"
import { cardTitle, describeCard, type Card, type Suit } from "../domain/cards.ts"
import { base } from "../styles/shared.ts"

const suitShape: Record<Suit, ReturnType<typeof svg>> = {
  Flasks: svg`<path d="M-5 5 L0 -5 L5 5 Z" />`,
  Sabers: svg`<path d="M0 -6 L4 0 L0 6 L-4 0 Z" />`,
  Staves: svg`<rect x="-1.6" y="-6" width="3.2" height="12" rx="1" />`,
  Coins: svg`<circle r="5" />`,
}

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0")

/** Greedy word wrap for names (full name, never truncated). */
const wrap = (name: string, width = 13): ReadonlyArray<string> =>
  name.split(" ").reduce<ReadonlyArray<string>>((lines, word) => {
    const last = lines.at(-1)
    return last !== undefined && `${last} ${word}`.length <= width ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, word]
  }, [])

/** One card: face up (with `card`), face down (without), optionally locked in the field. */
@customElement("sabacc-card")
export class SabaccCard extends LitElement {
  static override styles = [
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
      :host([data-kind="suited"]) { --edge: var(--positive); }
      :host([data-kind="face"]) { --edge: var(--negative); }
      :host([data-kind="idiot"]) { --edge: var(--accent); }
    `,
  ]

  @property({ attribute: false }) card: Card | undefined = undefined
  /** In the interference field: frozen against shifts. */
  @property({ type: Boolean }) locked = false

  override willUpdate(): void {
    const c = this.card
    this.dataset["kind"] = c === undefined ? "back" : c._tag === "Suited" ? "suited" : c.value === 0 ? "idiot" : "face"
  }

  private fieldMark() {
    return this.locked
      ? svg`<rect class="field" x="-3" y="-3" width="86" height="126" rx="12" />
             <text class="field-label" x="40" y="-6" text-anchor="middle">FIELD</text>`
      : svg``
  }

  override render() {
    const c = this.card
    if (c === undefined) {
      return html`<svg viewBox="0 0 80 120" role="img" aria-label=${this.locked ? "Face-down card in the interference field" : "Face-down card"}>
        ${this.fieldMark()}
        <rect class="back" x="1.5" y="1.5" width="77" height="117" rx="9" />
        <path class="back-art" d="M14 14 L66 106 M66 14 L14 106" />
        <circle class="back-art" cx="40" cy="60" r="16" />
      </svg>`
    }
    const label = `${describeCard(c)}${this.locked ? ", in the interference field" : ""}`
    const value = signed(c.value)
    const corner = c._tag === "Suited" ? (c.value > 11 ? cardTitle(c).slice(0, 2) : String(c.value)) : value
    const nameLines = c._tag === "Face" ? wrap(c.name) : c.value > 11 ? [cardTitle(c)] : []
    return html`<svg viewBox="0 0 80 120" role="img" aria-label=${label}>
      <title>${label}</title>
      ${this.fieldMark()}
      <rect class="face" x="1.5" y="1.5" width="77" height="117" rx="9" />
      <text class="corner" x="8" y="17">${corner}</text>
      <text class="corner" x="72" y="111" text-anchor="end">${corner}</text>
      <text class="value" x="40" y="58" text-anchor="middle" dominant-baseline="middle">${value}</text>
      ${c._tag === "Suited" ? svg`<g class="suit" transform="translate(12 28) scale(0.7)">${suitShape[c.suit]}</g>` : svg``}
      ${nameLines.length > 0
        ? nameLines.map((line, i) => svg`<text class="name" x="40" y=${84 + i * 11} text-anchor="middle">${line}</text>`)
        : c._tag === "Suited"
          ? svg`<g class="suit" transform="translate(40 90)">${suitShape[c.suit]}</g>`
          : svg``}
    </svg>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-card": SabaccCard
  }
}
