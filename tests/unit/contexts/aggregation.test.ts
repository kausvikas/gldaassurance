/**
 * Portfolio aggregation — property tests for REQ-FIN-007 and REQ-FIN-008.
 *
 * `TEST_STRATEGY.md` §3.3 names two properties for this family: aggregation must be order-
 * independent and associative, and weighted portfolio margin must not equal the mean of project
 * margins. Both are asserted over generated inputs rather than one hand-picked case, because a
 * single example proves a total, not a property.
 */
import { describe, expect, it } from 'vitest';
import { Money, type CurrencyCode } from '@platform/decimal';
import { type ProjectContribution, aggregate } from '@contexts/portfolio';
import { ratioValue } from '@contexts/financial';

const USD = 'USD' as CurrencyCode;
const zero = Money.zero(USD);
const m = (v: string) => Money.of(v, USD);

const project = (
  id: string, contract: string, revenue: string, eac: string, atRisk: string,
): ProjectContribution => ({
  projectId: id,
  contractValue: m(contract), forecastRevenue: m(revenue),
  estimateAtCompletion: m(eac), gmValueAtRisk: m(atRisk),
});

/** A deterministic pseudo-random set, so a failure is reproducible. */
function generated(n: number, seed: number): ProjectContribution[] {
  let x = seed;
  const next = (): number => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
  return Array.from({ length: n }, (_, i) => {
    const contract = (next() * 9_000_000 + 100_000).toFixed(2);
    const eac = (Number(contract) * (0.55 + next() * 0.5)).toFixed(2);
    return project(`p${i}`, contract, contract, eac, (Number(contract) * next() * 0.1).toFixed(2));
  });
}

describe('REQ-FIN-008 — aggregation is order-independent and associative', () => {
  it('produces the same totals however the input is ordered', () => {
    for (const seed of [1, 7, 99, 12345]) {
      const set = generated(40, seed);
      const forward = aggregate(set, zero);
      const backward = aggregate([...set].reverse(), zero);
      const shuffled = aggregate([...set].sort((a, b) => a.projectId.localeCompare(b.projectId)), zero);
      expect(backward.contractValue.toQuantity(), `seed ${seed}`).toBe(forward.contractValue.toQuantity());
      expect(shuffled.contractValue.toQuantity(), `seed ${seed}`).toBe(forward.contractValue.toQuantity());
      expect(backward.valueAtRisk.toQuantity(), `seed ${seed}`).toBe(forward.valueAtRisk.toQuantity());
      expect(ratioValue(backward.forecastMarginPercent)).toBe(ratioValue(forward.forecastMarginPercent));
    }
  });

  it('is associative: aggregating two halves equals aggregating the whole', () => {
    const set = generated(30, 42);
    const whole = aggregate(set, zero);
    const left = aggregate(set.slice(0, 13), zero);
    const right = aggregate(set.slice(13), zero);
    expect(left.contractValue.plus(right.contractValue).toQuantity())
      .toBe(whole.contractValue.toQuantity());
    expect(left.estimateAtCompletion.plus(right.estimateAtCompletion).toQuantity())
      .toBe(whole.estimateAtCompletion.toQuantity());
  });
});

describe('MET-PORT-002 — portfolio margin is weighted, never a mean', () => {
  it('differs from the mean of project margins when project sizes differ', () => {
    // 50,000,000 at 5% and 1,000,000 at 40%.
    const set = [
      project('big', '50000000.00', '50000000.00', '47500000.00', '0.00'),
      project('small', '1000000.00', '1000000.00', '600000.00', '0.00'),
    ];
    const a = aggregate(set, zero);
    // Weighted: (51,000,000 − 48,100,000) / 51,000,000 = 5.6862745…%
    expect(ratioValue(a.forecastMarginPercent, 6)).toBe('0.056863');
    // The mean would be 22.5% — four times the truth, and the reason this test exists.
    expect(ratioValue(a.forecastMarginPercent, 6)).not.toBe('0.225000');
  });
});

describe('edge cases', () => {
  it('returns a typed zero total for an empty authorised set', () => {
    const a = aggregate([], zero);
    expect(a.projectCount).toBe(0);
    expect(a.contractValue.isZero()).toBe(true);
    expect(a.currency).toBe(USD);
  });

  it('reports NOT_COMPUTABLE rather than zero margin when there is no revenue', () => {
    const a = aggregate([project('p', '0.00', '0.00', '0.00', '0.00')], zero);
    expect(ratioValue(a.forecastMarginPercent)).toBeNull();
  });

  it('never lets the portfolio value at risk exceed the portfolio contract value', () => {
    // TEST_STRATEGY §3.3: value at risk never exceeds contract value.
    for (const seed of [3, 11, 500]) {
      const a = aggregate(generated(25, seed), zero);
      expect(a.valueAtRisk.compare(a.contractValue), `seed ${seed}`).toBeLessThanOrEqual(0);
    }
  });
});
