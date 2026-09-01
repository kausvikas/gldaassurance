/**
 * Ratio results and the first-class `NOT_COMPUTABLE` state.
 *
 * Authority: ADR-0002 §Decision 8; METRIC_CATALOG.md §1.1 rule 5 — "`NOT_COMPUTABLE` is a
 * first-class result state, distinct from zero and from null. Never `NaN`, never `Infinity`,
 * never a silent dash."
 */
import Decimal from 'decimal.js';

export type NotComputableReason =
  | 'ZERO_DENOMINATOR'
  | 'NO_BASELINE'
  | 'INSUFFICIENT_HISTORY'
  | 'MIXED_CURRENCY'
  | 'SOURCE_UNAVAILABLE';

export interface ComputedRatio {
  readonly computable: true;
  readonly value: Decimal;
}

export interface NotComputable {
  readonly computable: false;
  readonly reason: NotComputableReason;
}

export type Ratio = ComputedRatio | NotComputable;

export function ratio(value: Decimal): ComputedRatio {
  return { computable: true, value };
}

export function notComputable(reason: NotComputableReason): NotComputable {
  return { computable: false, reason };
}

export function isComputable(r: Ratio): r is ComputedRatio {
  return r.computable;
}

/** The ratio as a decimal string, or `null` when NOT_COMPUTABLE. */
export function ratioToQuantity(r: Ratio): string | null {
  return isComputable(r) ? r.value.toFixed() : null;
}

/** Build a ratio from a decimal string, so contexts never touch a raw `Decimal`. */
export function ratioFromQuantity(q: string): ComputedRatio {
  return { computable: true, value: new Decimal(q) };
}

/** `a − b`, propagating NOT_COMPUTABLE. */
export function ratioSubtractQuantity(a: Ratio, b: string): Ratio {
  return isComputable(a) ? { computable: true, value: a.value.minus(new Decimal(b)) } : a;
}

/** Percentage string for presentation. Rounding is presentation-only (ADR-0002 §Decision 5). */
export function ratioToPercentString(r: Ratio, decimals = 1): string | null {
  return isComputable(r) ? r.value.times(100).toFixed(decimals, Decimal.ROUND_HALF_UP) : null;
}
