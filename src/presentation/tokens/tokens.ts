/**
 * Semantic tokens — the layer components are allowed to name.
 *
 * `BRAND_DESIGN_SYSTEM.md` §3: *"Components reference semantic tokens; only the token layer
 * references brand hex values."* This module is that boundary. It imports the palette, maps it onto
 * roles (`surface/card`, `text/secondary`, `status/critical`), and exposes CSS custom-property names
 * — so a component says `var(--gl-text-secondary)` and never learns what colour that is.
 *
 * The indirection earns its keep in one specific way: **a theme swap is a token-layer change.** The
 * dark theme below redefines the same custom properties, and no component knows it happened.
 */
import { BRAND, DARK_ELEVATION, SHADOW_INK, STATUS } from './palette.js';

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

/**
 * Spacing. `BRAND_DESIGN_SYSTEM.md` §5: 4px base, scale 4/8/12/16/24/32/48/64.
 *
 * The Phase 6 brief asks for an "8px spacing system"; the approved scale is 4px-based and contains
 * every multiple of 8 the brief implies, plus 4px and 12px for control-level padding. The brand
 * document outranks a phase instruction, and the finer base is a superset rather than a
 * disagreement — 8px rhythm is what the layout actually uses; 4 and 12 exist for chip and control
 * interiors, where an 8px minimum makes controls balloon.
 */
export const SPACE = {
  xxs: '4px',
  xs: '8px',
  sm: '12px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
  xxxl: '64px',
} as const;

/** §5 — 4px controls, 8px cards, 999px chips. The brief's "8–12px maximum" is honoured: nothing
 *  square-cornered exceeds 8px, and 999px is a pill, not a large radius. */
export const RADIUS = {
  control: '4px',
  card: '8px',
  pill: '999px',
} as const;

/** §4 — type scale. Numeric styles carry tabular lining figures; see `stylesheet.ts`. */
export const TYPE = {
  display: { size: '44px', weight: '600', lineHeight: '1.05', tracking: '-0.02em' },
  h1: { size: '28px', weight: '600', lineHeight: '1.2', tracking: '-0.01em' },
  h2: { size: '22px', weight: '600', lineHeight: '1.25', tracking: '-0.01em' },
  h3: { size: '17px', weight: '600', lineHeight: '1.3', tracking: '0' },
  body: { size: '15px', weight: '400', lineHeight: '1.5', tracking: '0' },
  bodySm: { size: '13px', weight: '400', lineHeight: '1.45', tracking: '0' },
  caption: { size: '12px', weight: '400', lineHeight: '1.4', tracking: '0.01em' },
} as const;

/**
 * §4 — "Font family: the GlobalLogic product typeface where licensed; otherwise a neutral system
 * stack. Do not embed or fabricate a licensed font file."
 *
 * Helvetica Neue is named first per the phase brief and is used only if the viewing machine already
 * has it. Nothing is downloaded, nothing is embedded, and the stack degrades to Inter, Arial and the
 * platform sans in that order.
 */
export const FONT_STACK =
  '"Helvetica Neue", Helvetica, Inter, "Segoe UI", Roboto, Arial, sans-serif';

/** Tabular lining figures for every number a reader compares down a column (§4). */
export const NUMERIC_FONT_FEATURES = '"tnum" 1, "lnum" 1';

/** §5 — three elevation levels only; elevation means layering, never importance. */
export const ELEVATION = {
  flat: 'none',
  raised: `0 1px 2px ${SHADOW_INK}`,
  overlay: `0 8px 24px ${SHADOW_INK}`,
} as const;

/** §5 — 12 columns, 24px gutters, 1440px max content width. */
export const GRID = {
  columns: 12,
  gutter: SPACE.lg,
  maxContentWidth: '1440px',
  sidebarWidth: '248px',
  sidebarCollapsedWidth: '64px',
  topBarHeight: '56px',
} as const;

/** §5 — 150ms for state, 250ms for surfaces; `prefers-reduced-motion` honoured in the stylesheet. */
export const MOTION = {
  state: '150ms',
  surface: '250ms',
  easing: 'cubic-bezier(0.2, 0, 0.2, 1)',
} as const;

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * The four status tones. `BRAND_DESIGN_SYSTEM.md` §3.2.
 *
 * `glyph` and `label` are **not optional and not decoration**: REQ-UX-002 forbids status by colour
 * alone, so the shape and the word travel with the tone as one value. A component cannot render the
 * colour without them, because there is no API that hands out the colour by itself.
 */
export type StatusTone = 'positive' | 'caution' | 'critical' | 'neutral';

export interface StatusDefinition {
  readonly tone: StatusTone;
  /** Distinct *shape*, not a colour-coded dot — legible in greyscale and in print. */
  readonly glyph: string;
  /** The default word. Callers may supply a domain-specific label; they may not supply none. */
  readonly label: string;
  readonly cssVar: string;
}

export const STATUS_TONES: Readonly<Record<StatusTone, StatusDefinition>> = {
  positive: { tone: 'positive', glyph: '●', label: 'Healthy', cssVar: '--gl-status-positive' },
  caution: { tone: 'caution', glyph: '▲', label: 'At risk', cssVar: '--gl-status-caution' },
  critical: { tone: 'critical', glyph: '■', label: 'Critical', cssVar: '--gl-status-critical' },
  neutral: { tone: 'neutral', glyph: '◌', label: 'No data', cssVar: '--gl-status-neutral' },
};

/** RAG as the domain names it, mapped to a tone. The mapping lives here so no screen invents one. */
export const RAG_TONE: Readonly<Record<'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN', StatusTone>> = {
  GREEN: 'positive',
  AMBER: 'caution',
  RED: 'critical',
  UNKNOWN: 'neutral',
};

// ---------------------------------------------------------------------------
// Semantic colour tokens
// ---------------------------------------------------------------------------

/**
 * Light theme, `BRAND_DESIGN_SYSTEM.md` §3.1 and §3.2.
 *
 * Read the omissions as carefully as the entries. There is no `text/orange`, because §2.1 rule 1
 * prohibits orange text on light surfaces. There is no `chart/amber`, because §3.2 reserves
 * functional amber for status alone. A token that does not exist cannot be misused.
 */
export const LIGHT_THEME: Readonly<Record<string, string>> = {
  '--gl-surface-app': BRAND.lightSteel,
  '--gl-surface-card': BRAND.white,
  '--gl-surface-raised': BRAND.white,
  '--gl-surface-sunken': BRAND.lightSteel,
  '--gl-surface-inverse': BRAND.steelGray100,
  '--gl-surface-selected': BRAND.lightBlue,

  '--gl-text-primary': BRAND.steelGray100,
  '--gl-text-secondary': BRAND.steelGray75,
  '--gl-text-muted': BRAND.steelGray50,
  '--gl-text-inverse': BRAND.white,
  '--gl-text-on-inverse-secondary': BRAND.steelGray25,

  '--gl-border-hairline': BRAND.steelGray25,
  '--gl-border-strong': BRAND.steelGray75,
  '--gl-border-focus': BRAND.impactBlue,

  // Brand action. Deliberate and scarce — §2.1 rule 1 makes this legal on white, never on app bg.
  '--gl-action-primary': BRAND.impactOrange,
  '--gl-action-primary-text': BRAND.white,

  // Analytical / predictive accent.
  '--gl-analytic': BRAND.impactBlue,
  '--gl-analytic-fill': BRAND.lightBlue,

  '--gl-status-positive': BRAND.green,
  '--gl-status-positive-fill': BRAND.lightGreen,
  '--gl-status-caution': STATUS.amberOnLight,
  '--gl-status-caution-fill': STATUS.amberFill,
  '--gl-status-critical': STATUS.redOnLight,
  '--gl-status-critical-fill': STATUS.redFill,
  '--gl-status-neutral': BRAND.steelGray50,
  '--gl-status-neutral-fill': BRAND.steelGray25,

  // Data visualisation (§3.4). Baselines recede; one orange mark per chart, at most.
  '--gl-viz-primary': BRAND.impactBlue,
  '--gl-viz-primary-fill': BRAND.lightBlue,
  '--gl-viz-baseline': BRAND.steelGray50,
  '--gl-viz-grid': BRAND.steelGray25,
  '--gl-viz-emphasis': BRAND.impactOrange,
  '--gl-viz-positive': BRAND.green,
  '--gl-viz-negative': STATUS.redOnLight,
};

/**
 * Dark theme, §3.1. The sidebar and top bar use these tokens on every theme, which is why they are
 * defined even though the POC ships light-first.
 *
 * §2.1 rules 2 and 3 are load-bearing here: `impact-blue` measures 2.59 on `steel-gray-100` and is
 * therefore **absent** from this map — the analytical accent on dark is `light-blue` (12.12). Brand
 * `green` measures 3.27 on dark, so positive *text* on dark is `light-green` (8.92).
 */
export const DARK_THEME: Readonly<Record<string, string>> = {
  '--gl-surface-app': BRAND.steelGray100,
  '--gl-surface-card': DARK_ELEVATION.step1,
  '--gl-surface-raised': DARK_ELEVATION.step2,
  '--gl-surface-sunken': BRAND.steelGray100,
  '--gl-surface-inverse': BRAND.white,
  '--gl-surface-selected': BRAND.steelGray75,

  '--gl-text-primary': BRAND.white,
  '--gl-text-secondary': BRAND.steelGray25,
  '--gl-text-muted': BRAND.steelGray50,
  '--gl-text-inverse': BRAND.steelGray100,
  '--gl-text-on-inverse-secondary': BRAND.steelGray75,

  '--gl-border-hairline': BRAND.steelGray75,
  '--gl-border-strong': BRAND.steelGray50,
  '--gl-border-focus': BRAND.lightBlue,

  '--gl-action-primary': BRAND.impactOrange,
  '--gl-action-primary-text': BRAND.steelGray100,

  '--gl-analytic': BRAND.lightBlue,
  '--gl-analytic-fill': BRAND.steelGray75,

  '--gl-status-positive': BRAND.lightGreen,
  '--gl-status-positive-fill': BRAND.green,
  '--gl-status-caution': STATUS.amberOnDark,
  '--gl-status-caution-fill': STATUS.amberOnLight,
  '--gl-status-critical': STATUS.redOnDark,
  '--gl-status-critical-fill': STATUS.redOnLight,
  '--gl-status-neutral': BRAND.steelGray50,
  '--gl-status-neutral-fill': BRAND.steelGray75,

  '--gl-viz-primary': BRAND.lightBlue,
  '--gl-viz-primary-fill': BRAND.steelGray75,
  '--gl-viz-baseline': BRAND.steelGray50,
  '--gl-viz-grid': BRAND.steelGray75,
  '--gl-viz-emphasis': BRAND.impactOrange,
  '--gl-viz-positive': BRAND.lightGreen,
  '--gl-viz-negative': STATUS.redOnDark,
};

// ---------------------------------------------------------------------------
// Pairing rules — §2.1, encoded
// ---------------------------------------------------------------------------

export type Surface = 'white' | 'lightSteel' | 'steelGray100';

export const SURFACE_HEX: Readonly<Record<Surface, string>> = {
  white: BRAND.white,
  lightSteel: BRAND.lightSteel,
  steelGray100: BRAND.steelGray100,
};

/**
 * The §2.1 constraints, as data a test can iterate.
 *
 * §2 ends by requiring these be "lint-checkable token pairings, not documentation alone". Each entry
 * names a foreground, a surface, the use it is claimed legal (or illegal) for, and the rule it comes
 * from. `tests/a11y/design-system.test.ts` recomputes every ratio from the palette and asserts the
 * verdict — so if someone lightens `impact-orange` to make it "work" as body text, the build says
 * no, and says which rule.
 */
export interface PairingRule {
  readonly foreground: string;
  readonly surface: Surface;
  readonly use: 'normalText' | 'largeText' | 'graphics';
  readonly permitted: boolean;
  readonly rule: string;
}

export const PAIRING_RULES: readonly PairingRule[] = [
  // §2.1 rule 1 — orange is never body text on light, and carries no meaning on light-steel at all.
  { foreground: BRAND.impactOrange, surface: 'white', use: 'normalText', permitted: false, rule: '§2.1.1' },
  { foreground: BRAND.impactOrange, surface: 'white', use: 'largeText', permitted: true, rule: '§2.1.1' },
  { foreground: BRAND.impactOrange, surface: 'white', use: 'graphics', permitted: true, rule: '§2.1.1' },
  { foreground: BRAND.impactOrange, surface: 'lightSteel', use: 'graphics', permitted: false, rule: '§2.1.1' },
  { foreground: BRAND.impactOrange, surface: 'steelGray100', use: 'normalText', permitted: true, rule: '§2.1.1' },
  // §2.1 rule 2 — impact-blue may not be used on dark.
  { foreground: BRAND.impactBlue, surface: 'steelGray100', use: 'graphics', permitted: false, rule: '§2.1.2' },
  { foreground: BRAND.impactBlue, surface: 'white', use: 'normalText', permitted: true, rule: '§2.1.2' },
  { foreground: BRAND.lightBlue, surface: 'steelGray100', use: 'normalText', permitted: true, rule: '§2.1.2' },
  // §2.1 rule 3 — green on dark is large/graphics only; positive text on dark is light-green.
  { foreground: BRAND.green, surface: 'steelGray100', use: 'normalText', permitted: false, rule: '§2.1.3' },
  { foreground: BRAND.green, surface: 'steelGray100', use: 'largeText', permitted: true, rule: '§2.1.3' },
  { foreground: BRAND.lightGreen, surface: 'steelGray100', use: 'normalText', permitted: true, rule: '§2.1.3' },
  // §2.1 rule 4 — steel-gray-50 is not body text on light; steel-gray-75 is.
  { foreground: BRAND.steelGray50, surface: 'white', use: 'normalText', permitted: false, rule: '§2.1.4' },
  { foreground: BRAND.steelGray50, surface: 'lightSteel', use: 'normalText', permitted: false, rule: '§2.1.4' },
  { foreground: BRAND.steelGray50, surface: 'white', use: 'largeText', permitted: true, rule: '§2.1.4' },
  { foreground: BRAND.steelGray75, surface: 'white', use: 'normalText', permitted: true, rule: '§2.1.4' },
  { foreground: BRAND.steelGray75, surface: 'lightSteel', use: 'normalText', permitted: true, rule: '§2.1.4' },
  // §3.2 — every functional status colour must clear body text on both light surfaces.
  { foreground: STATUS.amberOnLight, surface: 'white', use: 'normalText', permitted: true, rule: '§3.2' },
  { foreground: STATUS.amberOnLight, surface: 'lightSteel', use: 'normalText', permitted: true, rule: '§3.2' },
  { foreground: STATUS.redOnLight, surface: 'white', use: 'normalText', permitted: true, rule: '§3.2' },
  { foreground: STATUS.redOnLight, surface: 'lightSteel', use: 'normalText', permitted: true, rule: '§3.2' },
  { foreground: STATUS.amberOnDark, surface: 'steelGray100', use: 'normalText', permitted: true, rule: '§3.2' },
  { foreground: STATUS.redOnDark, surface: 'steelGray100', use: 'normalText', permitted: true, rule: '§3.2' },
  { foreground: BRAND.green, surface: 'white', use: 'normalText', permitted: true, rule: '§3.2' },
  { foreground: BRAND.green, surface: 'lightSteel', use: 'normalText', permitted: true, rule: '§3.2' },
];

/** Every semantic token name a component may reference. Asserted complete by test. */
export const TOKEN_NAMES: readonly string[] = Object.keys(LIGHT_THEME);
