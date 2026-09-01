/**
 * The brand palette — **the only file in the repository permitted to contain a colour literal.**
 *
 * `BRAND_DESIGN_SYSTEM.md` §1 says these values "are given, not chosen". They are transcribed here
 * exactly, and the G-COLOUR source gate exempts this one path and no other
 * (`architecture/manifest.json`). Everywhere else, a hex value is a build failure — which is what
 * makes "components reference semantic tokens" a property of the build rather than a house rule
 * somebody remembers.
 *
 * Two categories live here and they are not the same kind of thing:
 *
 *   - **Brand colours** (§1). Fixed by GlobalLogic. Not tinted, shaded or "improved".
 *   - **Functional status colours** (§3.2). The brand palette has no red, and `impact-orange` fails
 *     contrast on the app background — so RAG cannot be expressed in brand colours alone. These are
 *     chosen, documented, contrast-measured, and reserved **exclusively** for status. They are not
 *     brand colours and may not appear in a chart, a button, a link or a decoration.
 *
 * A third category — derived dark-surface elevation steps — is the only permitted palette extension
 * (§3.1), and only for elevation.
 */

/** `BRAND_DESIGN_SYSTEM.md` §1. Transcribed, not derived. */
export const BRAND = {
  steelGray100: '#181A24',
  white: '#FFFFFF',
  lightSteel: '#F2F3F6',
  steelGray25: '#C8CAD3',
  steelGray50: '#858A9B',
  steelGray75: '#484F6B',
  impactOrange: '#FF5F2D',
  impactBlue: '#4442E3',
  lightBlue: '#D5D4FF',
  green: '#2E776A',
  lightGreen: '#91C4BB',
} as const;

/**
 * Derived dark-surface elevation steps (`BRAND_DESIGN_SYSTEM.md` §3.1).
 *
 * The only sanctioned extension of the palette, and only because a dark surface with no elevation
 * steps cannot show layering at all. Both values are given in §3.1; neither is invented here.
 */
export const DARK_ELEVATION = {
  /** `surface/card` on dark — steel-gray-100 +1 step. */
  step1: '#20222E',
  /** `surface/raised` on dark — steel-gray-100 +2 steps. */
  step2: '#282B39',
} as const;

/**
 * Functional status colours (`BRAND_DESIGN_SYSTEM.md` §3.2).
 *
 * **Why these exist at all:** the brand palette has no red, and amber-adjacent `impact-orange`
 * measures 2.73:1 on `light-steel` — below even the 3:1 graphics threshold — so it cannot carry
 * meaning on the app background. A RAG system built from brand colours alone would either be
 * illegible or would overload the brand action colour with status meaning, and then a screen could
 * not distinguish "this is urgent" from "click this".
 *
 * **Why these specific values:** each is the darkest usable hue that clears 4.5:1 on both light
 * surfaces — amber `#8A5300` measures 6.33 on white and 5.70 on light-steel; red `#B3261E` measures
 * 6.54 and 5.89 — paired with a light fill for chips and a light-on-dark variant for dark surfaces
 * (amber 9.68, red 10.15 on `steel-gray-100`). Every one of those figures is asserted by test in
 * `tests/a11y/design-system.test.ts` rather than stated in prose: a documented contrast ratio nobody
 * recomputes is a documented contrast ratio that drifts, and the first draft of this comment carried
 * four numbers that were wrong.
 *
 * **Green reuses the brand `green`.** Healthy is the one status the brand palette can express, and
 * inventing a second green next to `#2E776A` would be a palette extension with no justification.
 */
export const STATUS = {
  /** Amber / At risk — chosen, not brand. Reserved exclusively for status. */
  amberOnLight: '#8A5300',
  amberFill: '#F5C77E',
  amberOnDark: '#F0B860',
  /** Red / Critical — chosen, not brand. Reserved exclusively for status. */
  redOnLight: '#B3261E',
  redFill: '#F4B4B0',
  redOnDark: '#F2B8B5',
} as const;

/**
 * Shadow ink.
 *
 * Elevation in this system is a hairline plus a very small shadow — `BRAND_DESIGN_SYSTEM.md` §5
 * allows three elevation levels and says elevation indicates layering, never importance. Expressed
 * as an alpha of the darkest brand colour so shadows sit in the palette rather than beside it.
 */
export const SHADOW_INK = 'rgba(24, 26, 36, 0.10)';

export type BrandColour = (typeof BRAND)[keyof typeof BRAND];
