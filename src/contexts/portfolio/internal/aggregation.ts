/**
 * Portfolio aggregation — pure over the inputs the application layer supplies.
 *
 * Tier 1, so this context imports no other (ADR-0001 §4.1). It never reaches into `financial` or
 * `health` for its inputs; the caller passes an already-authorised set, because filtering a total
 * after computing it has still computed it over projects the caller may not see (ADR-0005 §5).
 *
 * Two properties are structural rather than incidental and are property-tested:
 *
 *   1. **Order independence.** `Σ` over a set is a set operation. If reordering the input changes
 *      the total, the total is a floating-point artifact and every reconciliation built on it is
 *      unfalsifiable (REQ-FIN-008). `Money` makes this true by construction; the tests make it
 *      checkable.
 *   2. **Portfolio margin is weighted, never a mean of margins.** A £50m project at 5% and a £1m
 *      project at 40% do not average to 22.5%, and reporting that they do is how a portfolio comes
 *      to look healthier than the sum of its parts (MET-PORT-002).
 */
import { type CurrencyCode, type Money, type Ratio, notComputable } from '@platform/decimal';

/** One project's already-converted contribution. Conversion happens before this point, dated. */
export interface ProjectContribution {
  readonly projectId: string;
  /** MET-FIN-002, in the reporting currency. */
  readonly contractValue: Money;
  /** MET-FIN-010, in the reporting currency. */
  readonly forecastRevenue: Money;
  /** MET-FIN-008, in the reporting currency. */
  readonly estimateAtCompletion: Money;
  /** MET-FIN-019, in the reporting currency. */
  readonly gmValueAtRisk: Money;
}

export interface PortfolioAggregate {
  readonly currency: CurrencyCode;
  readonly projectCount: number;
  /** MET-PORT-001 */ readonly contractValue: Money;
  readonly forecastRevenue: Money;
  readonly estimateAtCompletion: Money;
  /** MET-PORT-002 — weighted, not a mean of project margins. */
  readonly forecastMarginPercent: Ratio;
  /**
   * **A plain sum of per-project `MET-FIN-019`. This is NOT `MET-PORT-003`.**
   *
   * `MET-PORT-003` additionally de-duplicates exposure shared across projects through a common
   * `riskCauseKey`, and that rule is **not implemented** — it is under-determined as written
   * (ADR-0021, CONFLICT C-20, DR-048). Callers must label this figure `MET-FIN-019`, and must not
   * describe it as free of double counting: where a cause is shared, it **overstates** exposure.
   */
  readonly valueAtRisk: Money;
}

/**
 * Sums an authorised set of project contributions.
 *
 * `zero` is passed rather than derived so the currency of an **empty** portfolio is still explicit:
 * a total of nothing still has to be a total of something, and inferring the currency from the first
 * row would make an empty set untyped.
 */
export function aggregate(
  contributions: readonly ProjectContribution[],
  zero: Money,
): PortfolioAggregate {
  const currency = zero.toDto().currency as CurrencyCode;
  const contractValue = contributions.reduce((m, c) => m.plus(c.contractValue), zero);
  const forecastRevenue = contributions.reduce((m, c) => m.plus(c.forecastRevenue), zero);
  const estimateAtCompletion = contributions.reduce((m, c) => m.plus(c.estimateAtCompletion), zero);
  const valueAtRisk = contributions.reduce((m, c) => m.plus(c.gmValueAtRisk), zero);

  const forecastMarginPercent = forecastRevenue.isZero()
    ? notComputable('ZERO_DENOMINATOR')
    : forecastRevenue.minus(estimateAtCompletion).dividedBy(forecastRevenue);

  return {
    currency,
    projectCount: contributions.length,
    contractValue, forecastRevenue, estimateAtCompletion,
    forecastMarginPercent, valueAtRisk,
  };
}
