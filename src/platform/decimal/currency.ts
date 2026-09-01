/**
 * ISO 4217 currency codes and minor-unit scales for the demo portfolio.
 *
 * Authority: ADR-0002 §Decision 5-6; SYNTHETIC_DATA_SPEC.md §3 fixes the demo currency set.
 * Adding a currency is a data change, not an architectural one.
 */

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY'] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/** ISO 4217 minor-unit exponent. Presentation rounding uses this scale (ADR-0002 §Decision 5). */
const MINOR_UNITS: Readonly<Record<CurrencyCode, number>> = Object.freeze({
  USD: 2,
  EUR: 2,
  GBP: 2,
  INR: 2,
  JPY: 0,
});

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function minorUnits(currency: CurrencyCode): number {
  return MINOR_UNITS[currency];
}

export class CurrencyMismatchError extends Error {
  constructor(
    readonly left: CurrencyCode,
    readonly right: CurrencyCode,
  ) {
    super(
      `Cannot combine ${left} and ${right} without an explicit, dated FX conversion ` +
        `(ADR-0002 §Decision 6, REQ-DATA-006).`,
    );
    this.name = 'CurrencyMismatchError';
  }
}
