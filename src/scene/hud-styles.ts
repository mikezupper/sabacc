import { css } from "@gyral/core"

/**
 * Layout for <sabacc-3d>: status bar on top, the 3D stage in the middle (never covered
 * by the panels, so your cards stay visible), your prompt and controls at the bottom.
 * The room/log has a reserved column on desktop and a separate row on phones.
 * The shift banner stays over the stage.
 */
export const hud = css`
  :host {
    display: grid;
    grid-template-rows: auto minmax(16rem, 1fr) auto;
    grid-template-columns: minmax(0, 1fr) min(20rem, 30%);
    block-size: 100%;
    position: relative;
    container: sabacc-table / inline-size;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--surface);
  }

  .stage {
    grid-row: 2;
    grid-column: 1;
    position: relative;
    min-block-size: 0;
    overflow: hidden;
    /* Keep projected label depths below HUD controls, including the join form. */
    isolation: isolate;
    background:
      radial-gradient(70% 60% at 50% 45%, oklch(30% 0.06 262), transparent 70%),
      radial-gradient(90% 80% at 50% 110%, oklch(22% 0.08 40 / 0.6), transparent 70%),
      oklch(11% 0.03 262);
    touch-action: none;
  }
  .stage .gl, .stage .labels { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; }
  .stage .gl { display: block; outline: none; }
  .stage .labels { pointer-events: none; }

  /* The aside and scene share a row, never their available width. */
  .overlay { display: contents; }
  .stage:has(~ .overlay .naming) { grid-column: 1 / -1; }

  .top {
    grid-row: 1;
    grid-column: 1 / -1;
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
    grid-row: 2;
    z-index: 1;
    justify-self: center;
    align-self: start;
    margin: var(--space-xs) var(--space-s);
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
    grid-row: 2;
    min-inline-size: 0;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: grid;
    align-content: start;
    gap: var(--space-2xs);
    padding: var(--space-xs) var(--space-s);
    border-inline-start: 1px solid var(--border);
    background: var(--surface-raised);
  }
  .side > * { min-inline-size: 0; }
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
    grid-column: 1 / -1;
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
    grid-row: 2;
    z-index: 1;
    place-self: center;
    inline-size: min(28rem, 100%);
  }

  .players { display: none; }
  @container sabacc-table (max-width: 18rem) {
    .players {
      display: grid;
      grid-column: 1;
      grid-row: 5;
      gap: var(--space-xs);
      padding: var(--space-s);
      border-block-start: 1px solid var(--border);
      background: var(--surface);
    }
    .players h2 { font-size: var(--step-0); }
    .players ol { display: grid; gap: var(--space-xs); min-inline-size: 0; }
    .players li { min-inline-size: 0; }
  }

  .fallback {
    grid-row: 2;
    grid-column: 1;
    z-index: 1;
    place-self: center;
    max-inline-size: 28rem;
    padding: var(--space);
    border-radius: var(--radius);
    background: var(--surface-raised);
    text-align: center;
  }

  @media (max-width: 40rem) {
    :host {
      grid-template-rows: auto auto minmax(16rem, 1fr) auto;
      grid-template-columns: minmax(0, 1fr);
    }
    .stage, .fallback { grid-row: 3; }
    .panel { grid-row: 4; }
    dl.status div:nth-child(n + 4) { display: none; }
    .side {
      grid-column: 1;
      grid-row: 2;
      inline-size: 100%;
      min-block-size: 6rem;
      max-block-size: min(12rem, 25dvh);
      overflow-y: auto;
      overscroll-behavior: contain;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-self: stretch;
      align-items: start;
      gap: var(--space-xs);
      padding: var(--space-xs) var(--space-s);
      border-inline-start: 0;
      border-block-end: 1px solid var(--border);
      background: var(--surface-raised);
      --sabacc-log-max-block-size: min(7rem, 16dvh);
    }
    .shift { grid-column: 1; grid-row: 3; margin: var(--space-xs) var(--space-s); font-size: var(--step--1); }
    .naming { grid-row: 3; }
    .seed { display: none; }
  }
`
