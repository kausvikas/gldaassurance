/**
 * Foreign exchange — explicit, dated, and recorded with the result.
 *
 * Authority: ADR-0002 §Decision 6 — "Currency is explicit on every amount. Aggregating mixed
 * currencies without conversion is a runtime error, not a silent sum. Conversion requires an FX
 * rate with a rate date and source; the converted result records both (REQ-DATA-006)."
 *
 * The Phase 2 brief names the fields a monetary value must carry: amount, currency_code,
 * reporting_currency, fx_rate, fx_rate_type, fx_effective_date, normalized_amount. `ConvertedMoney`
 * below is exactly that tuple, and it is the *only* way a cross-currency figure is produced.
 *
 * **OQ-1 remains open** (reporting currency and FX source). Nothing here defaults it: every
 * conversion takes an explicit reporting currency and an explicit rate. A missing rate is an error,
 * never an assumed 1.0.
 */
import { Money } from './money.js';
import type { CurrencyCode } from './currency.js';

/**
 * Which rate was used. Conflating these is a classic restatement bug: a portfolio valued at
 * spot on Monday and at monthly-average on Tuesday appears to have moved when nothing did.
 */
export type FxRateType = 'SPOT' | 'MONTHLY_AVERAGE' | 'BUDGET' | 'CLOSING';

export interface FxRate {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
  /** Decimal string. `1 from = <rate> to`. Never a JS number. */
  readonly rate: string;
  readonly rateType: FxRateType;
  /** The date the rate is effective for — not the date it was fetched. */
  readonly effectiveDate: string;
  /** Provenance: which source published this rate. */
  readonly source: string;
}

/**
 * A converted amount that carries its own audit trail. Both the original and the normalized
 * amount are retained — a reporting-currency figure whose original is lost cannot be defended
 * when the rate is questioned.
 */
export interface ConvertedMoney {
  readonly original: Money;
  readonly reportingCurrency: CurrencyCode;
  readonly normalized: Money;
  readonly rate: FxRate;
}

export class FxRateMissingError extends Error {
  constructor(
    readonly from: CurrencyCode,
    readonly to: CurrencyCode,
    readonly asOf: string,
  ) {
    super(
      `No FX rate for ${from}→${to} effective ${asOf}. A missing rate is an error, never an ` +
        `assumed 1.0 (ADR-0002 §Decision 6, REQ-DATA-006).`,
    );
    this.name = 'FxRateMissingError';
  }
}

export class FxRateMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FxRateMismatchError';
  }
}

/** Resolves the rate in force for a currency pair on a date. Implemented by `financial`. */
export interface FxRateProvider {
  rateFor(
    from: CurrencyCode,
    to: CurrencyCode,
    asOf: string,
    rateType: FxRateType,
  ): FxRate | undefined;
}

export function convert(amount: Money, to: CurrencyCode, rate: FxRate): ConvertedMoney {
  if (rate.from !== amount.currency) {
    throw new FxRateMismatchError(
      `Rate is ${rate.from}→${rate.to} but the amount is ${amount.currency}.`,
    );
  }
  if (rate.to !== to) {
    throw new FxRateMismatchError(
      `Rate targets ${rate.to} but conversion to ${to} was requested.`,
    );
  }
  if (amount.currency === to) {
    return { original: amount, reportingCurrency: to, normalized: amount, rate };
  }
  return {
    original: amount,
    reportingCurrency: to,
    normalized: Money.of(amount.times(rate.rate).toDto().amount, to),
    rate,
  };
}

/**
 * Aggregate mixed-currency amounts into a single reporting currency.
 *
 * Every conversion is recorded, so a portfolio total can always name the rates that produced it.
 * A missing rate throws rather than silently dropping or mis-summing a project — a portfolio
 * figure that quietly excludes a EUR project is worse than one that fails to compute
 * (`METRIC_CATALOG.md` §1.1 rule 7).
 */
export function sumInReportingCurrency(
  amounts: readonly Money[],
  reportingCurrency: CurrencyCode,
  asOf: string,
  rateType: FxRateType,
  provider: FxRateProvider,
): { total: Money; conversions: readonly ConvertedMoney[] } {
  const conversions: ConvertedMoney[] = [];
  let total = Money.zero(reportingCurrency);
  for (const amount of amounts) {
    if (amount.currency === reportingCurrency) {
      total = total.plus(amount);
      continue;
    }
    const rate = provider.rateFor(amount.currency, reportingCurrency, asOf, rateType);
    if (rate === undefined) {
      throw new FxRateMissingError(amount.currency, reportingCurrency, asOf);
    }
    const converted = convert(amount, reportingCurrency, rate);
    conversions.push(converted);
    total = total.plus(converted.normalized);
  }
  return { total, conversions };
}
