import { css } from "lit"

/** Base styles shared by every shadow root. Tokens come from global.css. */
export const base = css`
  :host { display: block; color: var(--text); font-family: var(--font-body); }
  *, *::before, *::after { box-sizing: border-box; }
  * { margin: 0; }
  :focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
  h2, h3 { font-family: var(--font-display); line-height: 1.15; text-wrap: balance; }
  ul, ol { padding: 0; list-style: none; }
  .visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
`

export const buttons = css`
  button, select {
    min-block-size: var(--tap);
    padding-inline: var(--space);
    border-radius: var(--radius-s);
    border: 1px solid var(--border);
    background: var(--surface-raised);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    touch-action: manipulation;
    cursor: pointer;
    transition: background-color 150ms ease-out, transform 150ms ease-out;
  }
  button:hover:not(:disabled) { background: color-mix(in oklch, var(--accent) 14%, var(--surface-raised)); }
  button:active:not(:disabled) { transform: translateY(1px); }
  button:disabled, select:disabled { cursor: not-allowed; opacity: 0.55; }
  button.primary { background: var(--accent); border-color: transparent; color: var(--accent-text); }
  button.primary:hover:not(:disabled) { background: oklch(from var(--accent) calc(l - 0.06) c h); }
  button.danger { color: var(--danger); }
`
