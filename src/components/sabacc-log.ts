import { css, html, LitElement } from "lit"
import { customElement, property } from "lit/decorators.js"
import type { GameEvent } from "../domain/model.ts"
import { base } from "../styles/shared.ts"
import { describeEvent } from "./describe.ts"

/** The game log as a native disclosure, newest entry first. */
@customElement("sabacc-log")
export class SabaccLog extends LitElement {
  static override styles = [
    base,
    css`
      details {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface-raised);
      }
      summary {
        display: flex;
        align-items: center;
        min-block-size: var(--tap);
        padding-inline: var(--space-s);
        font-weight: 600;
        cursor: pointer;
      }
      ol {
        max-block-size: 16rem;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 0 var(--space-s) var(--space-s);
        display: grid;
        gap: var(--space-2xs);
        font-size: var(--step--1);
      }
      li { padding-block: var(--space-2xs); border-block-start: 1px solid var(--border); }
    `,
  ]

  @property({ attribute: false }) events: ReadonlyArray<GameEvent> = []

  override render() {
    return html`<details>
      <summary>Game log (${this.events.length})</summary>
      <ol reversed>
        ${[...this.events].reverse().map((e) => html`<li>${describeEvent(e)}</li>`)}
      </ol>
    </details>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sabacc-log": SabaccLog
  }
}
