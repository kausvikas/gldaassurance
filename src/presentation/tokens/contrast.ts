/**
 * WCAG 2.2 relative luminance and contrast ratio.
 *
 * `BRAND_DESIGN_SYSTEM.md` §2 states measured ratios and §2.1 derives binding rules from them —
 * "orange may never be body text on a light surface", "impact-blue may not be used on dark". §2 ends
 * with an instruction: *"Phase 6 must encode these as lint-checkable token pairings, not as
 * documentation alone."* This module is how that instruction is met: the ratios are **recomputed**
 * from the palette by test, so a token pairing that violates §2.1 fails the build rather than
 * failing review.
 *
 * It contains no colour literal — it takes hex in and returns a number — so it sits outside the
 * G-COLOUR exemption with the rest of the layer.
 */

/** WCAG 2.2 thresholds. Named rather than inlined, because a bare `4.5` explains nothing. */
export const WCAG = {
  /** Normal-size body text, AA. */
  normalText: 4.5,
  /** ≥24px, or ≥19px bold, AA. */
  largeText: 3,
  /** Boundaries, icons and meaningful graphics, AA. */
  graphics: 3,
  /** Normal-size body text, AAA. */
  normalTextAaa: 7,
} as const;

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_DIGITS = '0123456789abcdef';

/**
 * Parses `#RGB` or `#RRGGBB`. Throws on anything else — a silent fallback would hide a typo.
 *
 * Digits are summed by table lookup rather than by `parseInt`. That is not fastidiousness: the
 * G-FLOAT gate now covers `src/presentation`, and it covers it precisely so that a component cannot
 * quietly start coercing text into numbers. A utility that exempted itself because its coercion was
 * "obviously fine" is how that gate stops meaning anything.
 */
export function parseHex(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, '').toLowerCase();
  const full = raw.length === 3
    ? raw.split('').map((c) => `${c}${c}`).join('')
    : raw;
  if (!/^[0-9a-f]{6}$/.test(full)) {
    throw new Error(`"${hex}" is not a 3- or 6-digit hex colour.`);
  }
  const byteAt = (index: number): number => {
    const high = HEX_DIGITS.indexOf(full[index] as string);
    const low = HEX_DIGITS.indexOf(full[index + 1] as string);
    return high * 16 + low;
  };
  return { r: byteAt(0), g: byteAt(2), b: byteAt(4) };
}

/** WCAG 2.x relative luminance. The 0.03928 knee and 2.4 exponent are from the specification. */
export function relativeLuminance(colour: Rgb): number {
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
}

/** Contrast ratio between two hex colours, 1–21. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHex(a));
  const lb = relativeLuminance(parseHex(b));
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Rounded to two places, which is how `BRAND_DESIGN_SYSTEM.md` §2 states its measurements. */
export function contrastRatioRounded(a: string, b: string): number {
  return Math.round(contrastRatio(a, b) * 100) / 100;
}

export type ContrastUse = 'normalText' | 'largeText' | 'graphics' | 'normalTextAaa';

/** Does this foreground/background pair clear the threshold for this use? */
export function meetsContrast(
  foreground: string,
  background: string,
  use: ContrastUse,
): boolean {
  return contrastRatio(foreground, background) >= WCAG[use];
}
