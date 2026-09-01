/**
 * Data confidence, forecast confidence, and the forecast-reliability profile.
 *
 * The property under test throughout is separation. `PRODUCT_SPEC.md` §3.4 requires health and
 * confidence to stay two numbers; this suite asserts that data confidence and forecast confidence
 * also stay two numbers, and that MET-DQ-009 stays a profile rather than becoming an eighth score.
 */
import { describe, expect, it } from 'vitest';
import { qty } from '@platform/decimal';
import { ruleVersion } from '@platform/provenance';
import type { Instant, WeekId } from '@platform/time';
import {
  type DomainObservationInput, type ReliabilityFactor,
  assessDataConfidence, assessForecastConfidence, forecastReliabilityProfile,
} from '@contexts/data-quality';

const AS_OF = '2026-08-31T00:00:00.000Z' as Instant;
const WEEK = '2026-W35' as WeekId;
const RULE = ruleVersion('DQ-v1');

const domain = (
  name: string, overrides: Partial<DomainObservationInput> = {},
): DomainObservationInput => ({
  domain: name,
  requiredFields: 10, populatedFields: 10,
  valuesChecked: 10, valuesValid: 10, invalidFields: [],
  assertionsEvaluated: 4, assertionsPassed: 4, failedAssertions: [],
  ageDays: 3, expectedCadenceDays: 7,
  evidence: [{ context: name, entityType: 'snapshot', entityId: 'prj-1' }],
  ...overrides,
});

const weights = {
  completeness: qty('0.25'), freshness: qty('0.20'), consistency: qty('0.25'),
  coverage: qty('0.15'), validity: qty('0.15'),
  highBandFloor: qty('75'), mediumBandFloor: qty('50'), stalenessRedMultiple: qty('3'),
  // DR-018 — the critical-freshness ceiling.
  criticalDomains: ['financial', 'delivery'],
  criticalStalenessTolerance: qty('3'),
  freshnessPolicyVersion: 'DQ-FRESHNESS-v1',
};


const request = (observations: readonly DomainObservationInput[], expected: string[]) => ({
  projectId: 'prj-1', week: WEEK, assessedAt: AS_OF, ruleVersion: RULE,
  metricCatalogVersion: '2.0.0', expectedDomains: expected, observations, weights,
  assessmentEvidence: [{ context: 'project', entityType: 'snapshot', entityId: 'prj-1' }],
});

describe('data confidence (MET-DQ-001…005, 008)', () => {
  it('scores a fully-reporting, fully-populated project at 100', () => {
    const a = assessDataConfidence(request([domain('financial'), domain('delivery')], ['financial', 'delivery']));
    expect(a.completeness).toBe('1');
    expect(a.consistency).toBe('1');
    expect(a.validity).toBe('1');
    expect(a.sourceCoverage).toBe('1');
    expect(a.confidenceScore).toBe('100.00');
    expect(a.band).toBe('HIGH');
  });

  it('computes completeness as a pooled share, not a mean of per-domain shares', () => {
    // 5/10 and 90/100 pool to 95/110 = 0.8636…, not (0.5 + 0.9)/2 = 0.70. Pooling is the catalog
    // definition (Σ populated / Σ required) and the difference is not small.
    const a = assessDataConfidence(request([
      domain('financial', { populatedFields: 5 }),
      domain('delivery', { requiredFields: 100, populatedFields: 90 }),
    ], ['financial', 'delivery']));
    expect(a.completeness?.startsWith('0.863636')).toBe(true);
  });

  it('names the silent domains rather than only lowering coverage', () => {
    const a = assessDataConfidence(request([domain('financial')], ['financial', 'delivery', 'quality']));
    expect(a.missingDomains).toEqual(['delivery', 'quality']);
    const rule = a.explanation.evaluations.find((e) => e.ruleId === 'DQ-MISSING-DOMAINS');
    expect(rule?.narrative).toContain('delivery, quality');
  });

  /**
   * Freshness is taken at the **worst** domain rather than averaged, so a single silent source
   * cannot be hidden behind nine fresh ones. 60 days against a 7-day cadence is past the
   * `stalenessRedMultiple` of 3, so the freshness component scores exactly 0 and the composite
   * falls by its full 0.20 weight to 80.00.
   *
   * **Open calibration, recorded rather than legislated here (DR-018).** 80.00 is still HIGH under
   * the current band floors, which means a two-month-stale delivery feed can sit behind a
   * "high confidence" label. Whether that is acceptable — or whether worst-domain staleness should
   * cap the band outright — is a policy question owned by Assurance, not something this engine may
   * decide by adding an unapproved rule. What the test pins is the arithmetic.
   */
  it('takes freshness at the worst domain rather than averaging it away', () => {
    const a = assessDataConfidence(request([
      domain('financial', { ageDays: 1 }),
      domain('delivery', { ageDays: 60 }),
    ], ['financial', 'delivery']));
    expect(a.freshnessDays).toBe(60);
    expect(a.confidenceScore).toBe('80.00');
    const freshness = a.explanation.evaluations.find((e) => e.ruleId === 'DQ-FRESHNESS');
    expect(freshness?.observedValue).toBe('0');

    // **DR-018, reproduced exactly.** The arithmetic says 80, which is above the 75 HIGH floor —
    // and `delivery`, a critical domain on a 7-day cadence, last reported 60 days ago. The score is
    // left alone because it is a true statement about the components; the *band* is capped, because
    // it is the claim a reader acts on.
    expect(a.arithmeticBand).toBe('HIGH');
    expect(a.band).toBe('MEDIUM');
    expect(a.bandCappedBy).toMatch(/delivery \(60d against a 21d tolerance on a 7d cadence\)/);
    expect(a.staleCriticalDomains).toEqual([
      { domain: 'delivery', ageDays: 60, expectedCadenceDays: 7, toleranceDays: '21' },
    ]);
    expect(a.freshnessPolicyVersion).toBe('DQ-FRESHNESS-v1');
  });

  it('excludes an unmeasurable component instead of scoring it zero', () => {
    const a = assessDataConfidence(request([
      domain('financial', { assertionsEvaluated: 0, assertionsPassed: 0 }),
    ], ['financial']));
    expect(a.consistency).toBeNull();
    const rule = a.explanation.evaluations.find((e) => e.ruleId === 'DQ-CONSISTENCY');
    expect(rule?.notEvaluatedReason).toBeDefined();
    // Still HIGH: the components that could be measured were all perfect.
    expect(a.band).toBe('HIGH');
  });

  /**
   * DR-018 — a materially stale critical domain must not be able to coexist with a HIGH label.
   *
   * The tests below assert the *shape* of the fix, not only that it fires once: score and band are
   * separated, the cap only ever moves the band down, silence and staleness are distinguished, the
   * tolerance follows each domain's own cadence, and the explanation names the evidence.
   */
  describe('DR-018 — the critical-domain freshness ceiling', () => {
    it('leaves the arithmetic alone and caps only the displayed band', () => {
      const a = assessDataConfidence(request([
        domain('financial', { ageDays: 2 }),
        domain('delivery', { ageDays: 60 }),
      ], ['financial', 'delivery']));
      expect(a.confidenceScore).toBe('80.00');
      expect(a.arithmeticBand).toBe('HIGH');
      expect(a.band).toBe('MEDIUM');
    });

    it('does not cap when the same age is inside the domain\'s own tolerance', () => {
      // 60 days against a 30-day cadence is 2x — inside the 3x tolerance — where the same 60 days
      // against a weekly cadence is not. This is why the tolerance is a multiple and not a number
      // of days.
      const a = assessDataConfidence(request([
        domain('financial', { ageDays: 60, expectedCadenceDays: 30 }),
        domain('delivery', { ageDays: 2 }),
      ], ['financial', 'delivery']));
      expect(a.staleCriticalDomains).toEqual([]);
      expect(a.band).toBe(a.arithmeticBand);
      expect(a.bandCappedBy).toBeUndefined();
    });

    it('distinguishes a silent critical domain from a stale one, and caps harder', () => {
      const silent = assessDataConfidence(request([
        domain('delivery', { ageDays: 2 }),
      ], ['financial', 'delivery']));
      expect(silent.silentCriticalDomains).toEqual(['financial']);
      expect(silent.band).toBe('LOW');
      expect(silent.bandCappedBy).toMatch(/reported nothing at all/);
    });

    it('never raises a band — the ceiling is a ceiling', () => {
      const a = assessDataConfidence(request([
        domain('financial', { ageDays: 2, populatedFields: 1, valuesValid: 1, assertionsPassed: 1 }),
        domain('delivery', { ageDays: 2 }),
      ], ['financial', 'delivery']));
      // A poor score stays poor; the ceiling has nothing to cap.
      expect(a.band).toBe(a.arithmeticBand);
    });

    it('ignores a critical domain the project was never expected to report', () => {
      const a = assessDataConfidence(request([
        domain('financial', { ageDays: 2 }),
      ], ['financial']));
      expect(a.silentCriticalDomains).toEqual([]);
      expect(a.band).toBe('HIGH');
    });

    it('always emits the ceiling rule, firing or not, and records the policy version', () => {
      const clean = assessDataConfidence(request([
        domain('financial', { ageDays: 2 }), domain('delivery', { ageDays: 2 }),
      ], ['financial', 'delivery']));
      const rule = clean.explanation.evaluations.find((e) => e.ruleId === 'DQ-CRITICAL-FRESHNESS');
      expect(rule).toBeDefined();
      expect(rule?.fired).toBe(false);
      expect(rule?.narrative).toContain('DQ-FRESHNESS-v1');
      expect(clean.freshnessPolicyVersion).toBe('DQ-FRESHNESS-v1');
    });

    it('cites the freshness evidence behind a cap, not merely the fact of it', () => {
      const a = assessDataConfidence(request([
        domain('financial', { ageDays: 2 }), domain('delivery', { ageDays: 60 }),
      ], ['financial', 'delivery']));
      const rule = a.explanation.evaluations.find((e) => e.ruleId === 'DQ-CRITICAL-FRESHNESS');
      expect(rule?.fired).toBe(true);
      expect(rule?.observedValue).toContain('delivery=60d');
      expect(rule?.evidence.length).toBeGreaterThan(0);
      expect(rule?.contribution).toBe('band capped from HIGH to MEDIUM');
    });

    it('makes the misleading HIGH state unreachable for a stale critical domain', () => {
      // The property DR-018 asks for, asserted across the whole staleness range rather than at one
      // point: past tolerance, HIGH is not obtainable no matter how good everything else is.
      for (const ageDays of [22, 30, 45, 60, 120, 365]) {
        const a = assessDataConfidence(request([
          domain('financial', { ageDays: 1 }),
          domain('delivery', { ageDays }),
        ], ['financial', 'delivery']));
        expect(a.band, `delivery at ${ageDays}d`).not.toBe('HIGH');
      }
    });
  });

  it('scores zero and bands LOW when no domain reported at all', () => {
    // Coverage is still measurable — 0 of 1 expected domains reported — so the score is a real
    // 0.00 rather than NOT_COMPUTABLE. The other four components are excluded, not zeroed.
    const a = assessDataConfidence(request([], ['financial']));
    expect(a.sourceCoverage).toBe('0');
    expect(a.completeness).toBeNull();
    expect(a.confidenceScore).toBe('0.00');
    expect(a.band).toBe('LOW');
    expect(a.missingDomains).toEqual(['financial']);
  });

  it('names every invalid field so validity is actionable', () => {
    const a = assessDataConfidence(request([
      domain('financial', { valuesValid: 8, invalidFields: ['etc.amount', 'contract.currency'] }),
    ], ['financial']));
    expect(a.validity).toBe('0.8');
    expect(a.invalidFields).toEqual(['etc.amount', 'contract.currency']);
  });
});

describe('forecast confidence (MET-DQ-007, frozen formula)', () => {
  const base = {
    projectId: 'prj-1', week: WEEK, assessedAt: AS_OF, ruleVersion: RULE,
    metricCatalogVersion: '2.0.0',
    weights: { replan: qty('0.34'), optimism: qty('0.33'), stability: qty('0.33') },
    edges: {
      replan: [qty('0'), qty('4')] as const,
      optimism: [qty('0'), qty('500000')] as const,
      stability: [qty('1'), qty('0')] as const,
    },
    evidence: [{ context: 'delivery', entityType: 'project', entityId: 'prj-1' }],
  };

  it('uses exactly the three frozen inputs and no others', () => {
    const a = assessForecastConfidence({
      ...base, replanFrequency: qty('0'), etcOptimismGap: qty('0'), velocityStability: qty('1'),
    }, qty('75'), qty('50'));
    expect(a.score).toBe('100.00');
    const signals = a.explanation.evaluations.map((e) => e.signalMetricId).sort();
    expect(signals).toEqual(['MET-DEL-013', 'MET-DEL-014', 'MET-FIN-030']);
  });

  it('falls to LOW when the team has replanned repeatedly and under-estimated', () => {
    const a = assessForecastConfidence({
      ...base, replanFrequency: qty('4'), etcOptimismGap: qty('500000'), velocityStability: qty('0'),
    }, qty('75'), qty('50'));
    expect(a.score).toBe('0.00');
    expect(a.band).toBe('LOW');
  });

  it('renormalises over available components rather than penalising a missing one', () => {
    const a = assessForecastConfidence({
      ...base, replanFrequency: null, etcOptimismGap: qty('0'), velocityStability: qty('1'),
    }, qty('75'), qty('50'));
    expect(a.score).toBe('100.00');
    const skipped = a.explanation.evaluations.find((e) => e.signalId === 'REPLAN_FREQUENCY');
    expect(skipped?.notEvaluatedReason).toBeDefined();
  });
});

describe('forecast reliability profile (MET-DQ-009, CONFLICT C-9)', () => {
  const factor = (
    id: ReliabilityFactor['id'], metricId: string, observed: string | null,
    green: string, red: string,
  ): ReliabilityFactor => ({
    id, metricId, observed: observed === null ? null : qty(observed),
    edges: [qty(green), qty(red)],
    ...(observed === null ? { notMeasurableReason: 'no revision on record' } : {}),
    evidence: [{ context: 'delivery', entityType: 'project', entityId: 'prj-1', metricId }],
  });

  it('returns a band per factor and no overall number', () => {
    const profile = forecastReliabilityProfile([
      factor('ETC_FRESHNESS', 'MET-FIN-007', '7', '14', '90'),
      factor('SCOPE_STABILITY', 'MET-COM-008', '0.02', '0.01', '0.20'),
      factor('REQUIRED_FUTURE_PRODUCTIVITY', 'MET-DEL-021', '0.65', '0.05', '0.50'),
    ]);
    expect(profile).toHaveLength(3);
    expect(profile.map((f) => f.band)).toEqual(['HIGH', 'HIGH', 'LOW']);
    // The type carries no aggregate: collapsing seven named conditions into one score is the
    // failure mode this metric was registered separately to avoid.
    expect(Object.keys(profile[0] as object)).not.toContain('overallScore');
  });

  it('marks an unmeasurable factor NOT_MEASURABLE rather than passing it', () => {
    const [f] = forecastReliabilityProfile([factor('ETC_COVERAGE', 'MET-FIN-007', null, '1', '0')]);
    expect(f?.band).toBe('NOT_MEASURABLE');
    expect(f?.narrative).toContain('no revision on record');
  });
});
