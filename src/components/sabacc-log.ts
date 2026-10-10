// The game log as a native disclosure, newest entry first. Stateless: the open/closed
// state belongs to <details> itself.
import { css, define, html, prop, type PropsOf, type Stateless } from "@gyral/core"
import { YOU } from "../domain/model.ts"
import { describeEvent, narratorOf } from "../presentation/describe.ts"
import { base } from "../styles/shared.ts"
import { isEventList, isNames } from "./prop-schemas.ts"

const props = {
  events: prop.value(isEventList, { default: [] }),
  /** Seat names for the narration; empty for solo play ("You", "Opponent N"). */
  names: prop.value(isNames, { default: [] }),
  /** Watching a multiplayer table: no seat is "you". */
  spectator: prop.boolean(),
}
type Props = PropsOf<typeof props>

const SOLO = ["You", "Opponent 1", "Opponent 2", "Opponent 3", "Opponent 4"]

export const SabaccLog = define<Stateless, never, Props>()("sabacc-log", {
  props,
  view: (_s, _i, { props: p }) => {
    const who = narratorOf(p.names.length > 0 ? p.names : SOLO, p.spectator ? undefined : YOU)
    return html`<details>
      <summary>Game log (${p.events.length})</summary>
      <ol reversed>
        ${[...p.events].reverse().map((e) => html`<li>${describeEvent(e, who)}</li>`)}
      </ol>
    </details>`
  },
  styles: [
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
  ],
})
