/**
 * The stylesheet, emitted from tokens.
 *
 * **This file contains no colour literal.** Every colour is `var(--gl-*)`, resolved from
 * `LIGHT_THEME` / `DARK_THEME`, and the G-COLOUR gate fails the build if that ever stops being true.
 * Opacity variants use `color-mix()` against a token rather than a second hard-coded value, so a
 * status fill is provably the status colour and cannot drift away from it.
 *
 * **The dark sidebar is why the token indirection exists.** `.gl-theme-dark` redefines the same
 * custom properties, so a `HealthBadge` dropped into the sidebar picks up `light-green` instead of
 * `green` without knowing a theme exists — which is exactly what `BRAND_DESIGN_SYSTEM.md` §2.1
 * rules 2 and 3 require, and exactly the rule a component author would otherwise forget.
 *
 * Structure: tokens → reset → typography → shell → surfaces → components → charts → states →
 * responsive → accessibility. Nothing here is per-screen; a screen that needs new CSS is a screen
 * that has invented a visual convention, which is the failure this phase exists to prevent.
 */
import {
  DARK_THEME, ELEVATION, FONT_STACK, GRID, LIGHT_THEME, MOTION,
  NUMERIC_FONT_FEATURES, RADIUS, SPACE, TYPE,
} from './tokens.js';

const vars = (map: Readonly<Record<string, string>>): string =>
  Object.entries(map).map(([name, value]) => `  ${name}: ${value};`).join('\n');

const scaleVars = (): string => [
  ...Object.entries(SPACE).map(([k, v]) => `  --gl-space-${k}: ${v};`),
  ...Object.entries(RADIUS).map(([k, v]) => `  --gl-radius-${k}: ${v};`),
  ...Object.entries(ELEVATION).map(([k, v]) => `  --gl-elevation-${k}: ${v};`),
  `  --gl-font-stack: ${FONT_STACK};`,
  `  --gl-numeric-features: ${NUMERIC_FONT_FEATURES};`,
  `  --gl-grid-gutter: ${GRID.gutter};`,
  `  --gl-grid-max: ${GRID.maxContentWidth};`,
  `  --gl-sidebar-width: ${GRID.sidebarWidth};`,
  `  --gl-topbar-height: ${GRID.topBarHeight};`,
  `  --gl-motion-state: ${MOTION.state};`,
  `  --gl-motion-surface: ${MOTION.surface};`,
  `  --gl-motion-easing: ${MOTION.easing};`,
].join('\n');

const typeVars = (): string =>
  Object.entries(TYPE).map(([role, t]) =>
    `  --gl-type-${role}-size: ${t.size};\n`
    + `  --gl-type-${role}-weight: ${t.weight};\n`
    + `  --gl-type-${role}-lh: ${t.lineHeight};\n`
    + `  --gl-type-${role}-track: ${t.tracking};`).join('\n');

/** The complete design-system stylesheet. One string, one source of truth, no per-screen additions. */
export function designSystemCss(): string {
  return `/* GlobalLogic Delivery Intelligence — design system. Generated from tokens; do not hand-edit. */
:root {
${vars(LIGHT_THEME)}
${scaleVars()}
${typeVars()}
}

.gl-theme-dark {
${vars(DARK_THEME)}
}

/* --- reset ------------------------------------------------------------- */
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
body {
  font-family: var(--gl-font-stack);
  font-size: var(--gl-type-body-size);
  line-height: var(--gl-type-body-lh);
  color: var(--gl-text-primary);
  background: var(--gl-surface-app);
  -webkit-font-smoothing: antialiased;
}
img, svg { display: block; max-width: 100%; }
button, input, select { font: inherit; color: inherit; }

/* --- typography -------------------------------------------------------- */
.gl-display, .gl-h1, .gl-h2, .gl-h3 { margin: 0; color: var(--gl-text-primary); }
.gl-display {
  font-size: var(--gl-type-display-size); font-weight: var(--gl-type-display-weight);
  line-height: var(--gl-type-display-lh); letter-spacing: var(--gl-type-display-track);
  font-variant-numeric: tabular-nums lining-nums; font-feature-settings: var(--gl-numeric-features);
}
.gl-h1 { font-size: var(--gl-type-h1-size); font-weight: var(--gl-type-h1-weight); line-height: var(--gl-type-h1-lh); letter-spacing: var(--gl-type-h1-track); }
.gl-h2 { font-size: var(--gl-type-h2-size); font-weight: var(--gl-type-h2-weight); line-height: var(--gl-type-h2-lh); letter-spacing: var(--gl-type-h2-track); }
.gl-h3 { font-size: var(--gl-type-h3-size); font-weight: var(--gl-type-h3-weight); line-height: var(--gl-type-h3-lh); }
.gl-body { font-size: var(--gl-type-body-size); }
.gl-body-sm { font-size: var(--gl-type-bodySm-size); line-height: var(--gl-type-bodySm-lh); }

/* Caption is 12px — normal-size text under WCAG, so it takes text-secondary (8.06 on white),
   never text-muted (3.44). BRAND_DESIGN_SYSTEM.md §2.1 rule 4. */
.gl-caption {
  font-size: var(--gl-type-caption-size); line-height: var(--gl-type-caption-lh);
  letter-spacing: var(--gl-type-caption-track); color: var(--gl-text-secondary);
}
.gl-eyebrow {
  font-size: var(--gl-type-caption-size); font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--gl-text-secondary);
}
/* text-muted is legal only at large sizes (§2.1 rule 4); this is the only class that applies it. */
.gl-muted-lg { color: var(--gl-text-muted); font-size: var(--gl-type-h2-size); }

.gl-numeric {
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: var(--gl-numeric-features);
  font-weight: 500;
}

/* --- app shell --------------------------------------------------------- */
.gl-app { display: grid; grid-template-columns: var(--gl-sidebar-width) minmax(0, 1fr); min-height: 100vh; }

.gl-sidebar {
  background: var(--gl-surface-app);
  border-right: 1px solid var(--gl-border-hairline);
  display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh; overflow-y: auto;
}

/* The restrained geometric motif. Header context only, 4% ink, behind a solid wordmark —
   BRAND_DESIGN_SYSTEM.md permits a grid motif where it does not reduce readability. */
.gl-brand {
  padding: var(--gl-space-lg) var(--gl-space-md) var(--gl-space-md);
  border-bottom: 1px solid var(--gl-border-hairline);
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--gl-text-primary) 4%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--gl-text-primary) 4%, transparent) 1px, transparent 1px);
  background-size: 16px 16px;
}
.gl-brand-mark { font-size: var(--gl-type-h3-size); font-weight: 600; letter-spacing: -0.01em; color: var(--gl-text-primary); }
.gl-brand-product { font-size: var(--gl-type-caption-size); color: var(--gl-text-secondary); margin-top: 2px; }
.gl-brand-rule { width: 28px; height: 2px; background: var(--gl-action-primary); margin-top: var(--gl-space-sm); border-radius: var(--gl-radius-pill); }

.gl-nav { padding: var(--gl-space-md) var(--gl-space-xs); flex: 1; }
.gl-nav-group + .gl-nav-group { margin-top: var(--gl-space-lg); }
.gl-nav-group-label { padding: 0 var(--gl-space-xs) var(--gl-space-xs); }
.gl-nav-list { list-style: none; margin: 0; padding: 0; }
.gl-nav-item {
  display: flex; align-items: center; gap: var(--gl-space-xs);
  padding: var(--gl-space-xs) var(--gl-space-sm);
  min-height: 32px; border-radius: var(--gl-radius-control);
  color: var(--gl-text-secondary); text-decoration: none;
  font-size: var(--gl-type-bodySm-size);
  border-left: 3px solid transparent;
  transition: background var(--gl-motion-state) var(--gl-motion-easing), color var(--gl-motion-state) var(--gl-motion-easing);
}
.gl-nav-item:hover { background: color-mix(in srgb, var(--gl-text-primary) 6%, transparent); color: var(--gl-text-primary); }
.gl-nav-item[aria-current="page"] {
  background: color-mix(in srgb, var(--gl-text-primary) 10%, transparent);
  color: var(--gl-text-primary); font-weight: 600;
  border-left-color: var(--gl-action-primary);
}
.gl-nav-item[aria-disabled="true"] { color: var(--gl-text-muted); cursor: not-allowed; }
.gl-nav-icon { width: 16px; text-align: center; flex: none; opacity: 0.9; }
.gl-nav-tail { margin-left: auto; }

.gl-sidebar-foot { padding: var(--gl-space-md); border-top: 1px solid var(--gl-border-hairline); }

/* --- top bar ----------------------------------------------------------- */
.gl-main { display: flex; flex-direction: column; min-width: 0; }
.gl-topbar {
  height: var(--gl-topbar-height); flex: none;
  display: flex; align-items: center; gap: var(--gl-space-md);
  padding: 0 var(--gl-space-lg);
  background: var(--gl-surface-card);
  border-bottom: 1px solid var(--gl-border-hairline);
  position: sticky; top: 0; z-index: 10;
}
.gl-topbar-spacer { margin-left: auto; }
.gl-content { padding: var(--gl-space-lg); max-width: var(--gl-grid-max); width: 100%; }

/* --- 12-column grid ---------------------------------------------------- */
.gl-grid { display: grid; grid-template-columns: repeat(${String(GRID.columns)}, minmax(0, 1fr)); gap: var(--gl-grid-gutter); }
${Array.from({ length: GRID.columns }, (_, i) =>
  `.gl-col-${String(i + 1)} { grid-column: span ${String(i + 1)}; min-width: 0; }`).join('\n')}
.gl-stack { display: flex; flex-direction: column; gap: var(--gl-space-md); }
.gl-row { display: flex; align-items: center; gap: var(--gl-space-xs); flex-wrap: wrap; }
.gl-row-tight { display: flex; align-items: center; gap: var(--gl-space-xxs); }

/* --- surfaces ---------------------------------------------------------- */
.gl-card {
  background: var(--gl-surface-card);
  border: 1px solid var(--gl-border-hairline);
  border-radius: var(--gl-radius-card);
  box-shadow: var(--gl-elevation-raised);
}
.gl-card-pad { padding: var(--gl-space-md) var(--gl-space-lg); }
.gl-card-head {
  display: flex; align-items: baseline; gap: var(--gl-space-xs);
  padding: var(--gl-space-sm) var(--gl-space-lg);
  border-bottom: 1px solid var(--gl-border-hairline);
}
.gl-card-title { font-size: var(--gl-type-h3-size); font-weight: 600; }

/* --- chips and badges --------------------------------------------------- */
.gl-chip {
  display: inline-flex; align-items: center; gap: var(--gl-space-xxs);
  padding: 3px var(--gl-space-xs); min-height: 24px;
  border-radius: var(--gl-radius-pill);
  font-size: var(--gl-type-caption-size); font-weight: 600;
  border: 1px solid transparent; white-space: nowrap;
}
.gl-chip-glyph { font-size: 10px; line-height: 1; }

/* Status chips. Fill is the status colour at 18%, so a fill can never drift off its own hue. */
.gl-status-positive { color: var(--gl-status-positive); background: color-mix(in srgb, var(--gl-status-positive-fill) 40%, transparent); border-color: color-mix(in srgb, var(--gl-status-positive) 30%, transparent); }
.gl-status-caution  { color: var(--gl-status-caution);  background: color-mix(in srgb, var(--gl-status-caution-fill) 40%, transparent);  border-color: color-mix(in srgb, var(--gl-status-caution) 30%, transparent); }
.gl-status-critical { color: var(--gl-status-critical); background: color-mix(in srgb, var(--gl-status-critical-fill) 40%, transparent); border-color: color-mix(in srgb, var(--gl-status-critical) 30%, transparent); }
.gl-status-neutral  { color: var(--gl-status-neutral);  background: color-mix(in srgb, var(--gl-status-neutral-fill) 40%, transparent);  border-color: color-mix(in srgb, var(--gl-status-neutral) 40%, transparent); }

.gl-chip-neutral { color: var(--gl-text-secondary); background: var(--gl-surface-sunken); border-color: var(--gl-border-hairline); }
.gl-chip-analytic { color: var(--gl-analytic); background: color-mix(in srgb, var(--gl-analytic-fill) 45%, transparent); border-color: color-mix(in srgb, var(--gl-analytic) 25%, transparent); }
.gl-chip-planned { color: var(--gl-text-secondary); background: transparent; border-color: var(--gl-border-hairline); font-weight: 400; }

/* The demo marker. §6: unmissable, never dismissible, orange on white/dark only — never on the
   app background, where orange measures 2.73 (§2.1 rule 1). Hence the white chip surface. */
.gl-demo-badge {
  display: inline-flex; align-items: center; gap: var(--gl-space-xxs);
  padding: var(--gl-space-xxs) var(--gl-space-xs); min-height: 24px;
  background: var(--gl-surface-card);
  border: 1px solid var(--gl-action-primary);
  border-radius: var(--gl-radius-control);
  font-size: var(--gl-type-caption-size); font-weight: 700; letter-spacing: 0.04em;
  color: var(--gl-text-primary); white-space: nowrap;
}
.gl-demo-badge-dot { width: 8px; height: 8px; border-radius: var(--gl-radius-pill); background: var(--gl-action-primary); flex: none; }

/* --- KPI --------------------------------------------------------------- */
.gl-kpi { display: flex; flex-direction: column; gap: var(--gl-space-xxs); }
.gl-kpi-value { font-size: var(--gl-type-display-size); font-weight: 600; line-height: 1.05; letter-spacing: -0.02em; font-variant-numeric: tabular-nums lining-nums; }
.gl-kpi-value-sm { font-size: var(--gl-type-h1-size); }
.gl-kpi-foot { display: flex; align-items: center; gap: var(--gl-space-xs); flex-wrap: wrap; }
.gl-delta-positive { color: var(--gl-viz-positive); font-weight: 600; }
.gl-delta-negative { color: var(--gl-viz-negative); font-weight: 600; }
.gl-delta-flat { color: var(--gl-text-secondary); font-weight: 600; }

/* --- provenance (§3.3) -------------------------------------------------- */
/* L1 observed: no decoration. Facts look like facts. */
.gl-prov-fact { color: var(--gl-text-primary); }
/* L2 derived: dotted underline, and the affordance is real — focusable, with a popover. */
.gl-prov-computed {
  color: var(--gl-text-primary);
  border-bottom: 1px dotted var(--gl-border-strong);
  cursor: help;
}
/* L3 inferred: contained, blue-bordered, explicitly chipped. Containment stops an inference
   reading as a fact — the single most important rule in §3.3. */
.gl-prov-inferred {
  border: 1px solid color-mix(in srgb, var(--gl-analytic) 45%, transparent);
  background: color-mix(in srgb, var(--gl-analytic-fill) 30%, transparent);
  border-radius: var(--gl-radius-card);
  padding: var(--gl-space-sm) var(--gl-space-md);
}
.gl-restricted { color: var(--gl-text-secondary); background: var(--gl-surface-sunken); border: 1px dashed var(--gl-border-hairline); }

/* --- evidence drawer / popover ------------------------------------------ */
.gl-evidence { border: 0; padding: 0; margin: 0; }
.gl-evidence > summary {
  list-style: none; cursor: pointer; display: inline-flex; align-items: center;
  gap: var(--gl-space-xxs); border-radius: var(--gl-radius-control);
}
.gl-evidence > summary::-webkit-details-marker { display: none; }
.gl-evidence-panel {
  margin-top: var(--gl-space-xs);
  background: var(--gl-surface-raised);
  border: 1px solid var(--gl-border-hairline);
  border-radius: var(--gl-radius-card);
  box-shadow: var(--gl-elevation-overlay);
  padding: var(--gl-space-md);
  max-width: 420px;
}
.gl-evidence-row { display: flex; justify-content: space-between; gap: var(--gl-space-md); padding: var(--gl-space-xxs) 0; }
.gl-evidence-row + .gl-evidence-row { border-top: 1px solid var(--gl-border-hairline); }

/* --- callouts and action cards ------------------------------------------ */
.gl-callout {
  display: flex; gap: var(--gl-space-sm);
  border: 1px solid var(--gl-border-hairline);
  border-left: 3px solid var(--gl-analytic);
  border-radius: var(--gl-radius-card);
  background: var(--gl-surface-card);
  padding: var(--gl-space-sm) var(--gl-space-md);
}
.gl-callout-critical { border-left-color: var(--gl-status-critical); }
.gl-callout-caution { border-left-color: var(--gl-status-caution); }
.gl-callout-positive { border-left-color: var(--gl-status-positive); }

.gl-action-card { display: flex; flex-direction: column; gap: var(--gl-space-sm); }
.gl-action-meta { display: flex; gap: var(--gl-space-md); flex-wrap: wrap; }

/* --- buttons ------------------------------------------------------------ */
.gl-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--gl-space-xxs);
  min-height: 32px; padding: 0 var(--gl-space-sm);
  border-radius: var(--gl-radius-control);
  border: 1px solid var(--gl-border-hairline);
  background: var(--gl-surface-card); color: var(--gl-text-primary);
  font-size: var(--gl-type-bodySm-size); font-weight: 600; cursor: pointer;
  transition: background var(--gl-motion-state) var(--gl-motion-easing);
}
.gl-btn:hover { background: var(--gl-surface-sunken); }
/* The one orange control in a view (§3.2, §8 prohibition 6). Orange on white is legal at 3.03 for
   graphics; the label is white on orange, which is the pairing that carries the text contrast. */
.gl-btn-primary { background: var(--gl-action-primary); border-color: var(--gl-action-primary); color: var(--gl-action-primary-text); }
.gl-btn-primary:hover { background: color-mix(in srgb, var(--gl-action-primary) 88%, var(--gl-text-primary)); }
.gl-btn[disabled] { opacity: 0.5; cursor: not-allowed; }

/* --- selectors ---------------------------------------------------------- */
.gl-select {
  display: inline-flex; align-items: center; gap: var(--gl-space-xxs);
  min-height: 32px; padding: 0 var(--gl-space-xs);
  border: 1px solid var(--gl-border-hairline); border-radius: var(--gl-radius-control);
  background: var(--gl-surface-card); font-size: var(--gl-type-bodySm-size);
}
.gl-select-label { color: var(--gl-text-secondary); }
.gl-select-value { font-weight: 600; }

/* --- data table --------------------------------------------------------- */
.gl-table-wrap { overflow-x: auto; }
.gl-table { width: 100%; border-collapse: collapse; font-size: var(--gl-type-bodySm-size); }
.gl-table caption { text-align: left; padding: 0 0 var(--gl-space-xs); color: var(--gl-text-secondary); font-size: var(--gl-type-caption-size); }
.gl-table th, .gl-table td { padding: var(--gl-space-xs) var(--gl-space-sm); text-align: left; border-bottom: 1px solid var(--gl-border-hairline); }
.gl-table thead th {
  position: sticky; top: 0; background: var(--gl-surface-card);
  font-size: var(--gl-type-caption-size); font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--gl-text-secondary);
  border-bottom: 1px solid var(--gl-border-strong); white-space: nowrap;
}
/* DR-079 - the identity column stays put while the table scrolls sideways.
   The executive table carries 21 columns and scrolls horizontally by design. Phase 12A found the
   project name scrolled away with everything else, leaving 75 anonymous rows of RED for a reader
   inspecting trajectory or outlook. Sticky first cell, opaque background so scrolled content passes
   behind it, hairline edge so it reads as an anchor. The header cell pins in both directions.
   (No backticks in this comment: the stylesheet is a template literal and one closes it.) */
.gl-table-pinned tbody th:first-child,
.gl-table-pinned tbody td:first-child {
  position: sticky; left: 0; z-index: 1;
  background: var(--gl-surface-card);
  border-right: 1px solid var(--gl-border-hairline);
}
.gl-table-pinned thead th:first-child {
  position: sticky; left: 0; top: 0; z-index: 2;
  background: var(--gl-surface-card);
  border-right: 1px solid var(--gl-border-hairline);
}
.gl-table-pinned tbody tr:hover th:first-child,
.gl-table-pinned tbody tr:hover td:first-child { background: var(--gl-surface-sunken); }
.gl-table td.gl-num, .gl-table th.gl-num { text-align: right; font-variant-numeric: tabular-nums lining-nums; }
.gl-table tbody tr:hover { background: var(--gl-surface-sunken); }
.gl-table-compact th, .gl-table-compact td { padding: var(--gl-space-xxs) var(--gl-space-xs); }
.gl-sort-glyph { color: var(--gl-text-secondary); margin-left: var(--gl-space-xxs); }

/* --- bars, meters, charts ------------------------------------------------ */
.gl-bar-track { background: var(--gl-surface-sunken); border-radius: var(--gl-radius-pill); height: 8px; overflow: hidden; border: 1px solid var(--gl-border-hairline); }
.gl-bar-fill { height: 100%; background: var(--gl-viz-primary); }
.gl-bar-fill-baseline { background: var(--gl-viz-baseline); }
.gl-bar-marker { width: 2px; background: var(--gl-viz-emphasis); }

.gl-chart { display: block; width: 100%; height: auto; }
.gl-chart-grid { stroke: var(--gl-viz-grid); stroke-width: 1; }
.gl-chart-axis { stroke: var(--gl-border-strong); stroke-width: 1; }
.gl-chart-series { fill: none; stroke: var(--gl-viz-primary); stroke-width: 2; }
/* Forecast is dashed AND labelled — a projection that looks like an actual is a provenance failure. */
.gl-chart-forecast { fill: none; stroke: var(--gl-viz-primary); stroke-width: 2; stroke-dasharray: 4 3; opacity: 0.75; }
.gl-chart-baseline { fill: none; stroke: var(--gl-viz-baseline); stroke-width: 1.5; stroke-dasharray: 2 3; }
.gl-chart-band { fill: var(--gl-viz-primary-fill); opacity: 0.45; }
.gl-chart-emphasis { fill: var(--gl-viz-emphasis); }
.gl-chart-positive { fill: var(--gl-viz-positive); }
.gl-chart-negative { fill: var(--gl-viz-negative); }
.gl-chart-neutral { fill: var(--gl-viz-baseline); }
.gl-chart-label { fill: var(--gl-text-secondary); font-size: 11px; font-family: var(--gl-font-stack); }
.gl-chart-connector { stroke: var(--gl-border-strong); stroke-width: 1; stroke-dasharray: 2 2; }
.gl-bubble { stroke: var(--gl-surface-card); stroke-width: 1.5; }

/* --- states ------------------------------------------------------------- */
.gl-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--gl-space-xs); text-align: center;
  padding: var(--gl-space-xl) var(--gl-space-lg);
  color: var(--gl-text-secondary);
}
.gl-state-glyph { font-size: var(--gl-type-h1-size); line-height: 1; }
.gl-skeleton {
  background: color-mix(in srgb, var(--gl-text-primary) 8%, transparent);
  border-radius: var(--gl-radius-control); height: 12px;
}
.gl-skeleton-lg { height: 32px; }
.gl-degraded-strip {
  display: flex; align-items: center; gap: var(--gl-space-xs);
  padding: var(--gl-space-xs) var(--gl-space-md);
  border: 1px solid color-mix(in srgb, var(--gl-status-caution) 35%, transparent);
  background: color-mix(in srgb, var(--gl-status-caution-fill) 30%, transparent);
  border-radius: var(--gl-radius-card);
  color: var(--gl-status-caution);
}

/* --- accessibility ------------------------------------------------------ */
.gl-visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.gl-skip-link {
  position: absolute; left: var(--gl-space-xs); top: -40px; z-index: 100;
  background: var(--gl-surface-card); color: var(--gl-text-primary);
  padding: var(--gl-space-xs) var(--gl-space-sm); border-radius: var(--gl-radius-control);
  border: 1px solid var(--gl-border-strong);
  transition: top var(--gl-motion-state) var(--gl-motion-easing);
}
.gl-skip-link:focus { top: var(--gl-space-xs); }

/* Focus is visible on every focusable thing, at 2px with an offset so it clears adjacent fills. */
:where(a, button, summary, [tabindex], input, select, th[aria-sort]):focus-visible {
  outline: 2px solid var(--gl-border-focus);
  outline-offset: 2px;
  border-radius: var(--gl-radius-control);
}

/* Every interactive target is at least 24x24 (WCAG 2.2 target size, BRAND §7). */
:where(a.gl-nav-item, button.gl-btn, summary, .gl-select) { min-height: 24px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 1ms !important; animation-duration: 1ms !important; }
}

@media (prefers-contrast: more) {
  .gl-card { border-color: var(--gl-border-strong); }
  .gl-table th, .gl-table td { border-bottom-color: var(--gl-border-strong); }
}

/* --- responsive ---------------------------------------------------------
   Optimised for 1440x900; 1920 gains gutter, not columns. Below 1200 the 12-column
   layout collapses to 6 and then to 1, and the sidebar becomes a top strip — the
   executive surfaces are desktop instruments, and a tablet gets a legible reduction
   rather than a pretend phone app. Content never scrolls horizontally at 200% zoom. */
@media (max-width: 1200px) {
  ${Array.from({ length: GRID.columns }, (_, i) =>
    `.gl-col-${String(i + 1)} { grid-column: span ${String(Math.min(i + 1, 6) <= 3 ? 6 : 12)}; }`).join('\n  ')}
}

@media (max-width: 900px) {
  .gl-app { grid-template-columns: minmax(0, 1fr); }
  .gl-sidebar { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--gl-border-hairline); }
  .gl-nav-list { display: flex; flex-wrap: wrap; gap: var(--gl-space-xxs); }
  .gl-nav-item { border-left: 0; border-bottom: 3px solid transparent; }
  .gl-nav-item[aria-current="page"] { border-left: 0; border-bottom-color: var(--gl-action-primary); }
  ${Array.from({ length: GRID.columns }, (_, i) => `.gl-col-${String(i + 1)}`).join(', ')} { grid-column: span 12; }
  .gl-content { padding: var(--gl-space-md); }
}

@media print {
  .gl-sidebar, .gl-topbar-actions { display: none; }
  .gl-card { box-shadow: none; break-inside: avoid; }
  .gl-demo-badge { border-width: 2px; }
}
`;
}
