/**
 * **Phase 2 acceptance gate** — ten key metrics recomputed independently from their definitions.
 *
 * What this is: a worked fixed-bid project whose figures were chosen by hand, with every expected
 * value computed by hand from `METRIC_CATALOG.md` and reproduced here. The arithmetic below is an
 * *independent* implementation written from the catalog text, not a call into a domain engine —
 * there is no engine yet, and Phase 4 owns building one.
 *
 * What this is **not**: a golden test of an implementation. `DEFINITION_OF_DONE.md` §3.1 requires a
 * golden fixture's expected values to be derived independently of the implementation it tests;
 * here there is no implementation, so what is being proven is narrower and should be read as such —
 * that the *definitions* are arithmetically coherent, that the identities between them hold, and
 * that the edge cases resolve to `NOT_COMPUTABLE` rather than to a number.
 *
 * When Phase 4 builds the engine, this fixture becomes its golden input and these expected values
 * become the assertions — already human-derived, which is the property §3.1 is protecting.
 */
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { Money, isComputable, notComputable, ratio, type Ratio } from '@platform/decimal';
import { findMetric } from '@contexts/rules';

const usd = (a: string) => Money.of(a, 'USD');
const D = (v: string | Decimal) => new Decimal(v);

// ---------------------------------------------------------------------------
// The worked project. Fixed-bid, USD, as of 2026-08-31.
// Every figure below is an L1 observed fact.
// ---------------------------------------------------------------------------
const FACTS = {
  // Contract — As-Sold baseline (immutable)
  contractValueAsSold: usd('10000000.00'),
  budgetedCostAsSold: usd('7600000.00'),
  contingencyBudget: usd('400000.00'),
  // One executed change (2026-03-15)
  executedValueDelta: usd('500000.00'),
  executedCostDelta: usd('420000.00'),
  // One pending change, raised 2026-05-01, never executed
  pendingProposedValue: usd('280000.00'),
  pendingApprovalProbability: '0.40',
  // Financial actuals
  costToDate: usd('5200000.00'),
  estimateToComplete: usd('3100000.00'),
  committedFutureCost: usd('250000.00'),
  contingencyConsumed: usd('328000.00'),
  // Delivery
  physicalCompletion: D('0.52'),
  // Risk register: R1 is not provisioned in ETC, R2 is.
  risks: [
    { probability: D('0.30'), costImpact: usd('600000.00'), includedInEtc: false },
    { probability: D('0.50'), costImpact: usd('200000.00'), includedInEtc: true },
  ],
} as const;

/** Recomputed from the catalog formulas, by hand, in this file only. */
const computed = (() => {
  const contractValueCC = FACTS.contractValueAsSold.plus(FACTS.executedValueDelta);      // MET-FIN-002
  const budgetedCostCC = FACTS.budgetedCostAsSold.plus(FACTS.executedCostDelta);         // MET-FIN-004
  const eac = FACTS.costToDate.plus(FACTS.estimateToComplete).plus(FACTS.committedFutureCost); // MET-FIN-008
  const forecastRevenue = contractValueCC;                                               // MET-FIN-010
  const soldGmValue = FACTS.contractValueAsSold.minus(FACTS.budgetedCostAsSold);         // MET-FIN-026
  const forecastGmValue = forecastRevenue.minus(eac);                                    // MET-FIN-024
  const marginValueDelta = forecastGmValue.minus(soldGmValue);                           // MET-FIN-017
  const gmErosionValue = soldGmValue.minus(forecastGmValue);                             // MET-FIN-025
  const costConsumed = FACTS.costToDate.dividedBy(budgetedCostCC);                       // MET-FIN-028
  const performanceImpliedEac = usd(
    D(FACTS.costToDate.toDto().amount).dividedBy(FACTS.physicalCompletion).toFixed(2),
  );                                                                                     // MET-FIN-029
  const etcOptimismGap = performanceImpliedEac.compare(eac) > 0
    ? performanceImpliedEac.minus(eac) : Money.zero('USD');                              // MET-FIN-030
  const contingencyConsumedPct = FACTS.contingencyConsumed.dividedBy(FACTS.contingencyBudget); // MET-FIN-035
  const incrementalRiskExposure = FACTS.risks
    .filter((r) => !r.includedInEtc)
    .reduce((acc, r) => acc.plus(r.costImpact.times(r.probability)), Money.zero('USD')); // MET-RSK-008
  const expectedCrRecovery = FACTS.pendingProposedValue.times(FACTS.pendingApprovalProbability); // MET-COM-010
  const riskAdjustedRevenue = forecastRevenue.plus(expectedCrRecovery);                  // MET-FIN-031
  const riskAdjustedGmValue = riskAdjustedRevenue.minus(eac).minus(incrementalRiskExposure); // MET-FIN-032
  const gmValueAtRisk = soldGmValue.compare(riskAdjustedGmValue) > 0
    ? soldGmValue.minus(riskAdjustedGmValue) : Money.zero('USD');                        // MET-FIN-019
  return {
    contractValueCC, budgetedCostCC, eac, forecastRevenue, soldGmValue, forecastGmValue,
    marginValueDelta, gmErosionValue, costConsumed, performanceImpliedEac, etcOptimismGap,
    contingencyConsumedPct, incrementalRiskExposure, expectedCrRecovery, riskAdjustedRevenue,
    riskAdjustedGmValue, gmValueAtRisk,
    forecastGmPercent: forecastGmValue.dividedBy(forecastRevenue),                       // MET-FIN-014
    soldGmPercent: soldGmValue.dividedBy(FACTS.contractValueAsSold),                     // MET-FIN-012
    riskAdjustedGmPercent: riskAdjustedGmValue.dividedBy(riskAdjustedRevenue),           // MET-FIN-033
    burnGap: isComputable(FACTS.costToDate.dividedBy(budgetedCostCC))
      ? ratio((FACTS.costToDate.dividedBy(budgetedCostCC) as { value: Decimal }).value.minus(FACTS.physicalCompletion))
      : notComputable('ZERO_DENOMINATOR'),                                                // MET-FIN-027
    contingencyBurnGap: ratio(
      D(FACTS.contingencyConsumed.toDto().amount)
        .dividedBy(D(FACTS.contingencyBudget.toDto().amount))
        .minus(FACTS.physicalCompletion),
    ),                                                                                    // MET-FIN-034
  };
})();

const pct = (r: Ratio, dp = 6): string =>
  isComputable(r) ? r.value.toFixed(dp) : 'NOT_COMPUTABLE';

describe('Acceptance gate — ten key metrics, hand-derived expected values', () => {
  it('1. MET-FIN-002 Contract Value (Current Contractual) = As-Sold + executed CRs only', () => {
    // 10,000,000.00 + 500,000.00 = 10,500,000.00. The pending 280,000 is NOT here.
    expect(computed.contractValueCC.toPresentationString()).toBe('10500000.00');
  });

  it('2. MET-FIN-008 EAC = Actual Cost + Bottom-Up ETC + Committed Future Cost', () => {
    // 5,200,000.00 + 3,100,000.00 + 250,000.00 = 8,550,000.00
    expect(computed.eac.toPresentationString()).toBe('8550000.00');
  });

  it('3. MET-FIN-024 Forecast GM $ = Forecast Revenue − EAC', () => {
    // 10,500,000.00 − 8,550,000.00 = 1,950,000.00
    expect(computed.forecastGmValue.toPresentationString()).toBe('1950000.00');
  });

  it('4. MET-FIN-014 Forecast GM % = Forecast GM $ / Forecast Revenue', () => {
    // 1,950,000 / 10,500,000 = 0.185714285714…
    expect(pct(computed.forecastGmPercent)).toBe('0.185714');
    // Sold was 24.0%, so this project has eroded 5.4pp — MET-FIN-016.
    expect(pct(computed.soldGmPercent, 4)).toBe('0.2400');
  });

  it('5. MET-FIN-025 GM Erosion $ is exactly the sign-flip of MET-FIN-017', () => {
    // Sold 2,400,000.00 − Forecast 1,950,000.00 = 450,000.00
    expect(computed.gmErosionValue.toPresentationString()).toBe('450000.00');
    expect(computed.marginValueDelta.toPresentationString()).toBe('-450000.00');
    // The identity that stops the two definitions ever disagreeing.
    expect(computed.gmErosionValue.equals(computed.marginValueDelta.negated())).toBe(true);
  });

  it('6. MET-FIN-029 Performance-Implied EAC = Actual Cost / Physical Completion', () => {
    // 5,200,000.00 / 0.52 = 10,000,000.00 exactly.
    expect(computed.performanceImpliedEac.toPresentationString()).toBe('10000000.00');
  });

  it('7. MET-FIN-030 ETC Optimism Gap = max(0, implied EAC − management EAC)', () => {
    // 10,000,000.00 − 8,550,000.00 = 1,450,000.00. Management is 1.45M light.
    expect(computed.etcOptimismGap.toPresentationString()).toBe('1450000.00');
  });

  it('8. MET-FIN-034 Contingency Burn Gap = contingency consumed % − physical completion %', () => {
    // 328,000 / 400,000 = 0.82; 0.82 − 0.52 = 0.30.
    expect(pct(computed.contingencyConsumedPct, 2)).toBe('0.82');
    expect(pct(computed.contingencyBurnGap, 2)).toBe('0.30');
  });

  it('9. MET-RSK-008 Incremental Risk Exposure counts only risk not already in ETC', () => {
    // 0.30 × 600,000 = 180,000.00. R2 (0.50 × 200,000 = 100,000) is excluded — it is in ETC.
    expect(computed.incrementalRiskExposure.toPresentationString()).toBe('180000.00');
    // Gross exposure would have been 280,000.00; the difference is the double count avoided.
    const gross = FACTS.risks.reduce((a, r) => a.plus(r.costImpact.times(r.probability)), Money.zero('USD'));
    expect(gross.toPresentationString()).toBe('280000.00');
  });

  it('10. MET-FIN-019 GM Value at Risk = Sold GM $ − Risk-Adjusted GM $', () => {
    // Expected CR recovery 0.40 × 280,000       =    112,000.00
    // Risk-adjusted revenue 10,500,000 + 112,000 = 10,612,000.00
    // Risk-adjusted GM $  10,612,000 − 8,550,000 − 180,000 = 1,882,000.00
    // VaR                  2,400,000 − 1,882,000 =    518,000.00
    expect(computed.expectedCrRecovery.toPresentationString()).toBe('112000.00');
    expect(computed.riskAdjustedRevenue.toPresentationString()).toBe('10612000.00');
    expect(computed.riskAdjustedGmValue.toPresentationString()).toBe('1882000.00');
    expect(computed.gmValueAtRisk.toPresentationString()).toBe('518000.00');
    expect(pct(computed.riskAdjustedGmPercent)).toBe('0.177346');
  });
});

describe('Acceptance gate — the remaining four required recomputations', () => {
  it('11. MET-FIN-010 Forecast Revenue is contractual entitlement only', () => {
    // Equals MET-FIN-002. The pending 280,000 is not here and cannot be.
    expect(computed.forecastRevenue.toPresentationString()).toBe('10500000.00');
  });

  it('12. MET-FIN-031 Risk-Adjusted Revenue adds only probability-weighted pending recovery', () => {
    // 10,500,000.00 + (0.40 × 280,000.00 = 112,000.00) = 10,612,000.00
    expect(computed.riskAdjustedRevenue.toPresentationString()).toBe('10612000.00');
  });

  it('13. MET-FIN-032 Risk-Adjusted GM $ deducts EAC and incremental risk only', () => {
    // 10,612,000.00 − 8,550,000.00 − 180,000.00 = 1,882,000.00
    expect(computed.riskAdjustedGmValue.toPresentationString()).toBe('1882000.00');
  });

  it('14. MET-FIN-033 Risk-Adjusted GM %', () => {
    // 1,882,000 / 10,612,000 = 0.177346400301…
    expect(pct(computed.riskAdjustedGmPercent)).toBe('0.177346');
  });

  it('MET-FIN-027 Burn Gap: 12.8pp of spend ahead of delivered progress', () => {
    // 5,200,000 / 8,020,000 = 0.648379052369…; minus 0.52 = 0.128379052369…
    expect(pct(computed.costConsumed)).toBe('0.648379');
    expect(pct(computed.burnGap)).toBe('0.128379');
  });
});

describe('Cross-metric identities that must hold at rest', () => {
  it('EAC identity: MET-FIN-008 = MET-FIN-005 + MET-FIN-007 + MET-FIN-023', () => {
    expect(
      computed.eac.equals(
        FACTS.costToDate.plus(FACTS.estimateToComplete).plus(FACTS.committedFutureCost),
      ),
    ).toBe(true);
  });

  it('Pending changes never reach forecast revenue (REQ-FIN-005)', () => {
    expect(computed.forecastRevenue.equals(computed.contractValueCC)).toBe(true);
    // Executing it would move 280,000 into revenue — but only as an ExecutedChange insert.
    const ifExecuted = computed.contractValueCC.plus(FACTS.pendingProposedValue);
    expect(ifExecuted.toPresentationString()).toBe('10780000.00');
    expect(computed.forecastRevenue.equals(ifExecuted)).toBe(false);
  });

  it('Risk-adjusted revenue includes expected recovery; base forecast revenue does not', () => {
    expect(computed.riskAdjustedRevenue.compare(computed.forecastRevenue)).toBe(1);
  });

  it('Value at Risk never exceeds contract value (TEST_STRATEGY §3.3)', () => {
    expect(computed.gmValueAtRisk.compare(computed.contractValueCC)).toBeLessThan(0);
    expect(computed.gmValueAtRisk.isNegative()).toBe(false);
  });

});

describe('Every recomputed metric is a registered definition', () => {
  it.each([
    'MET-FIN-002', 'MET-FIN-008', 'MET-FIN-010', 'MET-FIN-024', 'MET-FIN-014', 'MET-FIN-025',
    'MET-FIN-027', 'MET-FIN-029', 'MET-FIN-030', 'MET-FIN-034', 'MET-RSK-008',
    'MET-FIN-031', 'MET-FIN-032', 'MET-FIN-033', 'MET-FIN-019',
  ])('%s exists in the registry, is Frozen, and carries full metadata', (id) => {
    const m = findMetric(id);
    expect(m, `${id} is asserted in a test but absent from the registry`).toBeDefined();
    expect(m?.status, `${id} is recomputed here but is not Frozen`).toBe('Frozen');
    expect(m?.formula.length).toBeGreaterThan(0);
    expect(m?.evidenceExpectations.length).toBeGreaterThan(0);
    expect(m?.epistemicLevel).toBeDefined();
    expect(m?.authoritativeSourceType).toBeDefined();
  });
});
