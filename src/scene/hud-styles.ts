import { css } from "@gyral/core"

/**
 * Layout for <sabacc-3d>: status bar on top, the 3D stage in the middle (never covered
 * by the panels, so your cards stay visible), your prompt and controls at the bottom.
 * The log and the shift banner float over the stage.
 */
export const hud = css`
  :host {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-columns: minmax(0, 1fr);
    block-size: 100%;
    position: relative;
    overflow: hidden;
    background: var(--surface);
  }

  .stage {
    grid-row: 2;
    grid-column: 1;
    position: relative;
    min-block-size: 0;
    overflow: hidden;
    background:
      radial-gradient(70% 60% at 50% 45%, oklch(30% 0.06 262), transparent 70%),
      radial-gradient(90% 80% at 50% 110%, oklch(22% 0.08 40 / 0.6), transparent 70%),
      oklch(11% 0.03 262);
    touch-action: none;
  }
  .stage .gl, .stage .labels { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; }
  .stage .gl { display: block; outline: none; }
  .stage .labels { pointer-events: none; }

  .overlay {
    grid-row: 2;
    grid-column: 1;
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-s);
    pointer-events: none;
  }
  .overlay > * { pointer-events: auto; }

  .top {
    grid-row: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs) var(--space);
    padding: var(--space-xs) var(--space-s);
    border-block-end: 1px solid var(--border);
    background: var(--surface-raised);
  }
  ::slotted(h1) { font-size: var(--step-1) !important; letter-spacing: 0.06em; white-space: nowrap; }
  dl.status { display: flex; flex-wrap: wrap; gap: var(--space-2xs) var(--space-s); margin-inline-end: auto; }
  dl.status div { display: grid; padding-inline: var(--space-xs); border-inline-start: 2px solid var(--border); }
  dt { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
  dd { font-weight: 700; font-variant-numeric: tabular-nums; }
  nav { display: flex; align-items: center; gap: var(--space-xs); }
  nav a {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    padding-inline: var(--space-s);
    border-radius: var(--radius-s);
    color: var(--accent);
    font-weight: 600;
  }

  .shift {
    grid-column: 1;
    grid-row: 1;
    justify-self: center;
    align-self: start;
    padding: var(--space-xs) var(--space);
    border-radius: var(--radius);
    background: color-mix(in oklch, var(--danger) 30%, oklch(15% 0.04 262 / 0.85));
    color: oklch(97% 0.01 262);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-align: center;
  }
  @media (prefers-reduced-motion: no-preference) {
    .shift { animation: flash 0.5s ease-in-out 3; }
  }
  @keyframes flash { 50% { opacity: 0.55; } }

  .side {
    grid-column: 2;
    grid-row: 1 / -1;
    justify-self: end;
    align-self: start;
    inline-size: min(20rem, 70vw);
    display: grid;
    gap: var(--space-2xs);
  }
  .seed {
    padding: var(--space-2xs) var(--space-xs);
    border-radius: var(--radius-s);
    background: oklch(12% 0.03 262 / 0.7);
    color: oklch(85% 0.02 262);
    font-size: 0.75rem;
  }
  .seed a { color: inherit; }

  .panel {
    grid-row: 3;
    display: grid;
    gap: var(--space-xs);
    padding: var(--space-s) var(--space);
    border-block-start: 1px solid var(--border);
    background: var(--surface-raised);
  }
  .panel > * { inline-size: 100%; max-inline-size: 64rem; justify-self: center; }
  output {
    display: block;
    padding: var(--space-xs) var(--space-s);
    border-radius: var(--radius-s);
    border-inline-start: 4px solid var(--accent);
    background: color-mix(in oklch, var(--accent) 10%, var(--surface));
    font-weight: 600;
  }
  output[data-error] { border-color: var(--danger); background: color-mix(in oklch, var(--danger) 10%, var(--surface)); }
  .mine { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--positive); }
  .mine[data-bomb] { color: var(--negative); }

  .naming {
    grid-column: 1 / -1;
    place-self: center;
    inline-size: min(28rem, 100%);
  }

  .fallback {
    grid-row: 2;
    grid-column: 1;
    place-self: center;
    max-inline-size: 28rem;
    padding: var(--space);
    border-radius: var(--radius);
    background: var(--surface-raised);
    text-align: center;
  }

  @media (max-width: 40rem) {
    dl.status div:nth-child(n + 4) { display: none; }
    .side { inline-size: min(16rem, 60vw); grid-row: 1; justify-self: end; }
    .shift { grid-column: 1 / -1; grid-row: 2; font-size: var(--step--1); }
    .seed { display: none; }
  }
`
