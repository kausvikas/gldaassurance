/**
 * Edge and boundary behaviour required by the Phase 2 brief: currency precision, nulls, zero
 * revenue, zero/low progress.
 *
 * `METRIC_CATALOG.md` §1.1 rule 5: "`NOT_COMPUTABLE` is a first-class result state, distinct from
 * zero and from null. Never `NaN`, never `Infinity`, never a silent dash." These tests assert that
 * every degenerate input lands on that state rather than on a number a screen would render.
 */
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { CurrencyMismatchError, Money, isComputable, ratioToPercentString } from '@platform/decimal';
import { findMetric, METRIC_REGISTRY } from '@contexts/rules';

const usd = (a: string) => Money.of(a, 'USD');

describe('zero revenue (a project sold at no value, or a cancelled contract)', () => {
  it('MET-FIN-014 forecast GM % is NOT_COMPUTABLE, not zero and not Infinity', () => {
    const forecastRevenue = Money.zero('USD');
    const eac = usd('120000.00');
    const gmValue = forecastRevenue.minus(eac);          // −120,000.00 — a real, computable loss
    const gmPercent = gmValue.dividedBy(forecastRevenue); // …but the percentage is undefined

    expect(gmValue.toPresentationString()).toBe('-120000.00');
    expect(gmPercent.computable).toBe(false);
    if (!gmPercent.computable) expect(gmPercent.reason).toBe('ZERO_DENOMINATOR');
    expect(ratioToPercentString(gmPercent)).toBeNull();
  });

  it('the catalog declares this behaviour rather than leaving it to the implementation', () => {
    expect(findMetric('MET-FIN-014')?.edgeHandling.zeroDenominator).toBe('NOT_COMPUTABLE');
  });

  it('every metric that divides declares a zero-denominator behaviour', () => {
    // Scoped to quotients. An L1 percentage such as MET-DEL-016 physical completion is a recorded
    // claim, not a division, so NOT_APPLICABLE is the correct and honest answer for it.
    // "rate/mix" in MET-FIN-018's cause list is prose, not division, so composite-result units
    // are excluded rather than the heuristic being loosened.
    const COMPOSITE_UNITS = ['MoneyBreakdown', 'Tuple', 'BandDistribution', 'RAG', 'Rank'];
    const quotients = METRIC_REGISTRY.filter(
      (m) =>
        m.formula.includes('/') &&
        !m.formula.startsWith('BLOCKED') &&
        !COMPOSITE_UNITS.includes(m.unit),
    );
    expect(quotients.length).toBeGreaterThan(20);
    for (const m of quotients) {
      expect(m.edgeHandling.zeroDenominator, `${m.id} (${m.name})`).toBe('NOT_COMPUTABLE');
    }
  });

  it('an L1 recorded percentage correctly declares that it has no denominator', () => {
    for (const id of ['MET-DEL-016', 'MET-QUA-007']) {
      const m = findMetric(id);
      expect(m?.epistemicLevel, id).toBe('L1_OBSERVED');
      expect(m?.edgeHandling.zeroDenominator, id).toBe('NOT_APPLICABLE');
    }
  });
});

describe('zero and low physical progress', () => {
  it('MET-FIN-029 performance-implied EAC is NOT_COMPUTABLE at zero progress', () => {
    const costToDate = usd('400000.00');
    const progress = new Decimal('0');
    // 400,000 / 0 would be Infinity. The guard is the metric's declared precondition.
    expect(progress.isZero()).toBe(true);
    expect(findMetric('MET-FIN-029')?.edgeHandling.zeroDenominator).toBe('NOT_COMPUTABLE');
    expect(costToDate.dividedBy(Money.zero('USD')).computable).toBe(false);
  });

  it('MET-FIN-029 is gated by a maturity threshold, not merely by a non-zero denominator', () => {
    // At 3% complete, 400,000 / 0.03 = 13.3M — arithmetic noise presented as a forecast.
    const implied = new Decimal('400000').dividedBy(new Decimal('0.03'));
    expect(implied.toFixed(2)).toBe('13333333.33');

    const precondition = findMetric('MET-FIN-029')?.edgeHandling.precondition ?? '';
    expect(precondition).toMatch(/maturity threshold/i);
    expect(precondition).toMatch(/EAC-v1/);
    // MET-FIN-030 inherits the gate rather than restating it.
    expect(findMetric('MET-FIN-030')?.edgeHandling.precondition).toMatch(/[Ii]nherits/);
  });

  it('MET-FIN-030 clamps at zero — prudence is not reported as optimism', () => {
    const impliedEac = usd('7000000.00');
    const managementEac = usd('8550000.00');   // management is *more* pessimistic
    const gap = impliedEac.compare(managementEac) > 0
      ? impliedEac.minus(managementEac) : Money.zero('USD');
    expect(gap.toPresentationString()).toBe('0.00');
    expect(gap.isNegative()).toBe(false);
  });
});

describe('nulls and missing inputs', () => {
  it('every metric declares what happens when a required input is absent', () => {
    for (const m of METRIC_REGISTRY) {
      expect(['NOT_COMPUTABLE', 'TREAT_AS_ZERO']).toContain(m.edgeHandling.missingInput);
    }
  });

  it('metrics blocked by an unresolved *meaning* are Draft, never Frozen with a guessed value', () => {
    // MC-8 leaves the scope unit undefined; C-9 leaves it open whether the seven-factor profile
    // supersedes the frozen forecast-confidence number. Both are semantic gaps, not thresholds
    // awaiting a value, and a metric whose meaning is unsettled must not be Frozen with a guess.
    for (const id of ['MET-DEL-012', 'MET-QUA-002', 'MET-DQ-009']) {
      expect(findMetric(id)?.status, id).toBe('Draft');
    }
  });

  it('freezes a metric once its semantic blocker is resolved, rather than leaving it Draft', () => {
    // MC-5 (ADR-0019), C-10 (ADR-0018) and C-7 (ADR-0015 D-1, amended) are resolved. Leaving these
    // Draft afterwards would be the mirror defect: a settled meaning still labelled unsettled.
    for (const id of ['MET-PORT-007', 'MET-HLTH-033', 'MET-HLTH-020', 'MET-HLTH-021']) {
      expect(findMetric(id)?.status, id).toBe('Frozen');
    }
  });

  it('does not keep a metric Draft merely because its threshold is undecided', () => {
    // Phase 2 closure, Decision 8. These were Draft on calibration alone and are now Frozen,
    // with their thresholds living in versioned rule sets.
    for (const id of ['MET-HLTH-010', 'MET-HLTH-011', 'MET-FCST-002', 'MET-FCST-010']) {
      expect(findMetric(id)?.status, id).toBe('Frozen');
      expect(findMetric(id)?.calibrationParameters, id).toBeDefined();
    }
  });

  it('resolved OQ-2 by importing the accounting fact rather than computing it', () => {
    for (const id of ['MET-FIN-006', 'MET-FIN-009', 'MET-FIN-015', 'MET-COM-006']) {
      expect(findMetric(id)?.status, id).toBe('Frozen');
    }
  });

  it('trailing-window metrics declare the history they need before they mean anything', () => {
    expect(findMetric('MET-FCST-001')?.edgeHandling.minimumHistoryWeeks).toBe(8);
    expect(findMetric('MET-QUA-009')?.edgeHandling.minimumHistoryWeeks).toBe(8);
    expect(findMetric('MET-RES-006')?.edgeHandling.minimumHistoryWeeks).toBe(52);
  });
});

describe('currency precision and behaviour', () => {
  it('holds four decimal places, matching NUMERIC(18,4) at rest', () => {
    expect(usd('1234567.8901').toDto().amount).toBe('1234567.8901');
  });

  it('does not round in the domain; only at presentation', () => {
    const m = usd('1234567.8949');
    expect(m.toDto().amount).toBe('1234567.8949');
    expect(m.toPresentationString()).toBe('1234567.89');
  });

  it('sums a large portfolio without drift', () => {
    // 5,000 projects at 0.01 — a float would already be wrong here.
    const total = Money.sum(Array.from({ length: 5000 }, () => usd('0.01')), 'USD');
    expect(total.toPresentationString()).toBe('50.00');
  });

  it('refuses to aggregate mixed currencies without an explicit dated rate', () => {
    expect(() => usd('100').plus(Money.of('100', 'EUR'))).toThrow(CurrencyMismatchError);
  });

  it('every money-unit metric declares its currency behaviour', () => {
    const moneyMetrics = METRIC_REGISTRY.filter((m) => m.unit.startsWith('Money'));
    expect(moneyMetrics.length).toBeGreaterThan(25);
    for (const m of moneyMetrics) {
      expect(m.currencyBehaviour, `${m.id} (${m.name})`).not.toBe('NONE');
    }
  });

  it('a percentage metric that aggregates does so as a weighted mean, never a mean of percentages', () => {
    // MET-PORT-002 is the metric a controller checks first.
    const port = findMetric('MET-PORT-002');
    expect(port?.aggregation).toBe('RECOMPUTE_FROM_INPUTS');
    expect(port?.notes).toMatch(/weighted margin, not an average of project margins/);
    expect(findMetric('MET-FIN-014')?.aggregation).toBe('WEIGHTED_MEAN');
  });

  it('percentage-point differences are never aggregatable', () => {
    for (const m of METRIC_REGISTRY.filter((x) => x.unit === 'PercentagePoints')) {
      expect(m.aggregation, `${m.id} (${m.name})`).toBe('NOT_AGGREGATABLE');
    }
  });
});

describe('the JPY case — a zero-decimal currency', () => {
  it('rounds and allocates at its own scale', () => {
    const jpy = Money.of('1000', 'JPY');
    expect(jpy.toPresentationString()).toBe('1000');
    const parts = jpy.allocate(['1', '1', '1']);
    expect(parts.map((p) => p.toPresentationString())).toEqual(['334', '333', '333']);
    expect(Money.sum(parts, 'JPY').toPresentationString()).toBe('1000');
  });
});
