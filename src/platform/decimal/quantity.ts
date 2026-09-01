/**
 * Decimal-safe arithmetic for non-monetary quantities: scores, ratios, percentages, counts.
 *
 * ADR-0001 §Rationale confines `decimal.js` to this module — "No context may reach a raw `Decimal`;
 * they receive `Money` and `Ratio`." That rule is enforced as `ARCH-006`, and it caught the first
 * draft of the Phase 4 engines importing `decimal.js` directly.
 *
 * A health score is not money, but it is not a float either: a composite of 68.33333… rounded
 * through IEEE-754 at three different points in a pipeline produces three different scores, and the
 * one that reaches a screen is whichever ran last. `Quantity` is a decimal string throughout, and
 * `G-FLOAT` makes `Number(` in domain code a build failure so it stays that way.
 */
import Decimal from 'decimal.js';

const Q = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -34, toExpPos: 34 });

/** A decimal quantity, as a string. Unitless — no currency, no implied scale. */
export type Quantity = string & { readonly __quantityBrand?: unique symbol };

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export function qty(value: string): Quantity {
  const trimmed = value.trim();
  if (!DECIMAL_RE.test(trimmed)) {
    throw new TypeError(
      `Quantity expects a plain decimal string, received "${value}". Scientific notation and JS ` +
        `numbers are rejected by design (ADR-0002 §Decision 3).`,
    );
  }
  return trimmed as Quantity;
}

const d = (q: Quantity) => new Q(q as string);
const out = (v: Decimal): Quantity => v.toFixed() as Quantity;

export const Q_ZERO = '0' as Quantity;
export const Q_ONE = '1' as Quantity;
export const Q_HUNDRED = '100' as Quantity;

export function qAdd(a: Quantity, b: Quantity): Quantity { return out(d(a).plus(d(b))); }
export function qSub(a: Quantity, b: Quantity): Quantity { return out(d(a).minus(d(b))); }
export function qMul(a: Quantity, b: Quantity): Quantity { return out(d(a).times(d(b))); }

/** Division guarded: a zero denominator returns `null`, never `NaN` or `Infinity`. */
export function qDiv(a: Quantity, b: Quantity): Quantity | null {
  const denom = d(b);
  return denom.isZero() ? null : out(d(a).dividedBy(denom));
}

export function qNeg(a: Quantity): Quantity { return out(d(a).negated()); }
export function qAbs(a: Quantity): Quantity { return out(d(a).abs()); }
export function qCompare(a: Quantity, b: Quantity): number { return d(a).comparedTo(d(b)); }
export function qIsZero(a: Quantity): boolean { return d(a).isZero(); }
export function qIsNegative(a: Quantity): boolean { return d(a).isNegative() && !d(a).isZero(); }
export function qMin(a: Quantity, b: Quantity): Quantity { return qCompare(a, b) <= 0 ? a : b; }
export function qMax(a: Quantity, b: Quantity): Quantity { return qCompare(a, b) >= 0 ? a : b; }
export function qClamp(v: Quantity, lo: Quantity, hi: Quantity): Quantity { return qMin(qMax(v, lo), hi); }

/** Fixed-scale rendering, half-up. Presentation only (ADR-0002 §Decision 5). */
export function qFixed(a: Quantity, dp: number): string { return d(a).toFixed(dp, Decimal.ROUND_HALF_UP); }

/**
 * Weighted mean. Returns `null` when the weights sum to zero — a mean over nothing is not zero,
 * it is undefined, and the difference matters when a dimension has no computable inputs.
 */
export function qWeightedMean(
  pairs: readonly { readonly value: Quantity; readonly weight: Quantity }[],
): Quantity | null {
  if (pairs.length === 0) return null;
  const totalWeight = pairs.reduce((a, p) => a.plus(d(p.weight)), new Q(0));
  if (totalWeight.isZero()) return null;
  const total = pairs.reduce((a, p) => a.plus(d(p.value).times(d(p.weight))), new Q(0));
  return out(total.dividedBy(totalWeight));
}

/**
 * Piecewise-linear normalisation onto 0–100.
 *
 * 100 at or beyond `greenEdge`, 0 at or beyond `redEdge`, linear between, clamped at both ends.
 * `higherIsBetter` decides which end is which — margin is good when high, burn gap is good when
 * low, and getting that backwards inverts a whole dimension silently.
 */
export function qNormaliseScore(
  value: Quantity, greenEdge: Quantity, redEdge: Quantity, higherIsBetter: boolean,
): Quantity {
  const v = d(value);
  const green = d(greenEdge);
  const red = d(redEdge);
  const span = higherIsBetter ? green.minus(red) : red.minus(green);
  if (span.isZero()) {
    const passes = higherIsBetter ? v.gte(green) : v.lte(green);
    return passes ? Q_HUNDRED : Q_ZERO;
  }
  const position = higherIsBetter ? v.minus(red).dividedBy(span) : red.minus(v).dividedBy(span);
  return out(Decimal.max(0, Decimal.min(1, position)).times(100));
}

/** For serialisation at a boundary only. Never for arithmetic. */
export function qToNumber(a: Quantity): number { return d(a).toNumber(); }

/**
 * Parses a small non-negative counting number from untrusted text.
 *
 * It lives in `platform/decimal` rather than at the API boundary for the reason the G-FLOAT gate
 * exists: numeric coercion belongs in the one layer that owns numbers, so that every `parseInt` in
 * the codebase is in a file a reviewer has already been pointed at. Counts — page sizes, offsets,
 * limits — are the one legitimate use of a JavaScript integer in this system. They are not money,
 * they are never a system of record, and they are bounded before they are returned.
 *
 * Returns `null` on anything that is not a plain decimal integer in range: no sign, no exponent, no
 * whitespace, no separators, no `Infinity`, no leading `+`.
 */
export function parseBoundedCount(value: string, min: number, max: number): number | null {
  if (!/^\d{1,15}$/.test(value)) return null;
  const n = globalThis.parseInt(value, 10);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
