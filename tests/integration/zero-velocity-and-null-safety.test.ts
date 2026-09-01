/**
 * ZERO_VELOCITY_STALLED_ACTIVE_PROJECT and the model invariants it forced (ADR-0027).
 *
 * The final Phase-11 entry gate built a Fixed-Bid project that had **recorded every weekly progress
 * claim** and **not advanced for eight weeks**, sitting at 40% with 200 days of window left. The
 * product assessed it **GREEN, COMPLETE, Delivery 100.00, no override fired**, because:
 *
 *   1. `MET-DEL-018` divided by an observed zero and returned `null`;
 *   2. `scoreDimension` renormalised over *usable* inputs, so dropping the 0.30-weighted signal
 *      re-weighted the three clean ones to 1.00 — **the absence of the worst fact raised the score**;
 *   3. `assessmentStatus` asked "did every dimension score?" instead of "was everything evaluated?";
 *   4. the adapter discarded the engine's reason, so the payload said "signal not supplied".
 *
 * The fixture below is deterministic and **asserts from source facts** — 13 progress observations
 * built here, not read back from production rules.
 */
import { describe, expect, it } from 'vitest';
import { evaluateDelivery } from '@contexts/delivery';
import { evaluateHealth } from '@contexts/health';
import { HARD_OVERRIDE_RULES, HEALTH_MODEL_V2, type SignalReading, evaluateRule } from '@contexts/rules';

const AS_OF = '2026-08-31T00:00:00.000Z' as never;
const EV = [{ context: 'delivery', recordType: 'Fixture', recordId: 'ZERO-VELOCITY' }] as never;

/** `weeks` weekly observations, each at `completion`. Flat = zero demonstrated velocity. */
const flatProgress = (weeks: number, completion: string) =>
  Array.from({ length: weeks }, (_, i) => ({
    week: `2026-W${String(20 + i).padStart(2, '0')}` as never,
    physicalCompletion: completion,
    plannedCompletion: completion,
  }));

const delivery = (opts: {
  progress: ReturnType<typeof flatProgress>; baselineCompletionDate: string;
}) => evaluateDelivery({
  projectId: 'ZERO-VELOCITY', asOf: AS_OF,
  baselineCompletionDate: opts.baselineCompletionDate as never,
  milestones: [], dependencies: [], progress: opts.progress as never, velocityWindowWeeks: 8,
});

// ---------------------------------------------------------------------------
// 1. MET-DEL-018 — the full semantic domain (§17 A–H)
// ---------------------------------------------------------------------------

describe('MET-DEL-018 distinguishes unknown from observed zero', () => {
  it('D — observed zero with work remaining is UNBOUNDED, not NOT_COMPUTABLE', () => {
    const d = delivery({ progress: flatProgress(13, '0.4000'), baselineCompletionDate: '2027-03-19' });
    expect(d.demonstratedVelocity.value).toBe('0');        // observed, computable
    expect(Number(d.requiredFutureVelocity.value)).toBeGreaterThan(0);
    expect(d.requiredVelocityRatio.value).toBeNull();
    expect(d.requiredVelocityRatio.adverseState).toBe('UNBOUNDED');
    expect(d.requiredVelocityRatio.notComputableReason).toMatch(/observed zero/);
    expect(d.requiredVelocityRatio.notComputableReason).toMatch(/unbounded/);
  });

  it('E — observed zero with NO work remaining is benign, never UNBOUNDED', () => {
    const d = delivery({ progress: flatProgress(13, '1.0000'), baselineCompletionDate: '2027-03-19' });
    expect(d.requiredFutureVelocity.value).toBe('0');
    expect(d.requiredVelocityRatio.adverseState).toBeUndefined();
    expect(d.requiredVelocityRatio.notComputableReason).toMatch(/no future velocity is required/);
  });

  it('F — too few observations is UNKNOWN, and never UNBOUNDED', () => {
    const d = delivery({ progress: flatProgress(3, '0.4000'), baselineCompletionDate: '2027-03-19' });
    expect(d.demonstratedVelocity.value).toBeNull();
    expect(d.requiredVelocityRatio.adverseState).toBeUndefined();
    expect(d.requiredVelocityRatio.notComputableReason).toMatch(/velocity window requires/);
  });

  it('A — healthy delivery produces an ordinary finite ratio', () => {
    const rising = Array.from({ length: 13 }, (_, i) => ({
      week: `2026-W${String(20 + i).padStart(2, '0')}` as never,
      physicalCompletion: (0.30 + i * 0.05).toFixed(4),
      plannedCompletion: (0.30 + i * 0.05).toFixed(4),
    }));
    const d = delivery({ progress: rising, baselineCompletionDate: '2027-03-19' });
    expect(d.requiredVelocityRatio.value).not.toBeNull();
    expect(d.requiredVelocityRatio.adverseState).toBeUndefined();
    expect(Number(d.requiredVelocityRatio.value)).toBeLessThan(1);
  });

  it('never emits a non-finite number into the decimal layer', () => {
    const d = delivery({ progress: flatProgress(13, '0.4000'), baselineCompletionDate: '2027-03-19' });
    const json = JSON.stringify(d);
    expect(json).not.toMatch(/Infinity|NaN|null,"adverseState":"UNBOUNDED","value"/);
    expect(Number.isFinite(Number(d.demonstratedVelocity.value))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Control A — observed zero is never reported as missing
// ---------------------------------------------------------------------------

describe('Control A — an observed zero is never classified as missing evidence', () => {
  const rule = HARD_OVERRIDE_RULES.find((r) => r.id === 'OVR-NO-CREDIBLE-PLAN')!;
  const ctx = {
    physicalCompletion: '0.4000' as never, daysToBaselineCompletion: 200,
    elapsedDeliveryWeeks: 13, velocityWindowWeeks: 8,
    contractType: 'FIXED_BID', lifecycleStage: 'EXECUTING',
  };

  it('fires the override on an unbounded observation', () => {
    const e = evaluateRule(rule, {
      signalId: 'REQUIRED_VELOCITY_RATIO', value: null, evidence: EV,
      adverseState: 'UNBOUNDED', notComputableReason: 'demonstrated velocity is an observed zero',
    }, ctx, new Set(['REQUIRED_VELOCITY_RATIO']));
    expect(e.status).toBe('FIRED');
    expect(e.fired).toBe(true);
    expect(e.observedValue).toBe('UNBOUNDED');
    expect(e.notEvaluatedReasonCode).toBeUndefined();
    expect(e.narrative).toMatch(/observed value is unbounded/);
  });

  it('still reports a genuinely unknown signal as NOT_COMPUTABLE', () => {
    const e = evaluateRule(rule, {
      signalId: 'REQUIRED_VELOCITY_RATIO', value: null, evidence: EV,
      notComputableReason: 'below the observation window',
    }, ctx, new Set(['REQUIRED_VELOCITY_RATIO']));
    expect(e.status).toBe('NOT_COMPUTABLE');
    expect(e.fired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Controls B and C — null cannot improve health; monotonicity
// ---------------------------------------------------------------------------

const CLEAN: Record<string, string> = {
  // Every override's signal, so the fixture isolates the zero-velocity behaviour rather than
  // tripping CONFIGURATION_ERROR on signals it simply forgot to declare.
  RISK_ADJUSTED_GM_PERCENT: '0.18', GM_VALUE_AT_RISK_RATIO: '0.10', LD_EXPOSURE_RATIO: '0.000',
  FORECAST_GM_PERCENT: '0.20', MARGIN_EROSION_PP: '0.01', BURN_GAP: '0.02',
  CONTINGENCY_BURN_GAP: '0.02', PROGRESS_VARIANCE: '0.00', MILESTONES_AT_RISK: '0',
  DEPENDENCY_AGEING_DAYS: '0', UNCOMPENSATED_SCOPE_RATIO: '0.00', PENDING_CR_AGE_DAYS: '0',
  UNSECURED_UPSIDE_RATIO: '0.00', REWORK_RATIO: '0.02', ACCEPTANCE_BLOCKERS: '0',
  ESCAPED_DEFECT_RATE: '0.01', DEFECT_BACKLOG_TREND: '0',
};

const assess = (rvr: string | null, unbounded = false) => {
  const readings = new Map<string, SignalReading>(
    Object.entries(CLEAN).map(([k, v]) => [k, { signalId: k, value: v, evidence: EV }]),
  );
  readings.set('REQUIRED_VELOCITY_RATIO', {
    signalId: 'REQUIRED_VELOCITY_RATIO', value: rvr, evidence: EV,
    ...(unbounded
      ? { adverseState: 'UNBOUNDED' as const, notComputableReason: 'observed zero, work remains' }
      : {}),
  });
  return evaluateHealth({
    projectId: 'ZERO-VELOCITY', week: '2026-W35' as never, assessedAt: AS_OF,
    metricCatalogVersion: '1.0.0', model: HEALTH_MODEL_V2, reportedRag: 'GREEN',
    readings, evidence: EV,
    applicability: {
      physicalCompletion: '0.4000' as never, daysToBaselineCompletion: 200,
      elapsedDeliveryWeeks: 13, velocityWindowWeeks: 8,
      contractType: 'FIXED_BID', lifecycleStage: 'EXECUTING',
    },
    declaredSignals: new Set(readings.keys()),
  });
};

const deliveryScore = (h: ReturnType<typeof assess>) =>
  Number(h.dimensions.find((d) => d.metricId === 'MET-HLTH-022')!.score);

describe('ZERO_VELOCITY_STALLED_ACTIVE_PROJECT — the golden case', () => {
  const stalled = assess(null, true);

  it('does not read GREEN', () => {
    expect(stalled.systemAssessedRag).toBe('RED');
  });

  it('fires the plan-credibility override', () => {
    expect(stalled.firedOverrides).toContain('OVR-NO-CREDIBLE-PLAN');
  });

  it('degrades the Delivery dimension instead of dropping the input', () => {
    // 0.70 clean + 0.30 at the red edge = 70. Previously this scored 100.00.
    expect(deliveryScore(stalled)).toBe(70);
  });

  it('counts the control as evaluated, because the observation is present', () => {
    expect(stalled.ruleCoverage.overridesNotComputable).toBe(0);
    expect(stalled.ruleCoverage.allApplicableCriticalControlsEvaluated).toBe(true);
    expect(stalled.assessmentStatus).toBe('COMPLETE');
  });

  it('preserves the pre-override composite beside the forced band', () => {
    expect(stalled.compositeBand).not.toBeNull();
    expect(stalled.overrideChangedBand).toBe(true);
  });
});

describe('Control C — worsening execution never improves the Delivery dimension', () => {
  it('is monotonically non-increasing across the whole velocity sweep', () => {
    const sweep = ['0.50', '1.00', '1.05', '1.40', '1.80', '1.99', '2.00', '5.00', '50.00']
      .map((v) => deliveryScore(assess(v)));
    for (let i = 1; i < sweep.length; i += 1) {
      expect(sweep[i]!).toBeLessThanOrEqual(sweep[i - 1]!);
    }
    // And the unbounded end sits no higher than the worst finite point.
    expect(deliveryScore(assess(null, true))).toBeLessThanOrEqual(sweep[sweep.length - 1]!);
  });

  it('Control B — an unbounded observation may never score above an adverse finite one', () => {
    expect(deliveryScore(assess(null, true))).toBeLessThanOrEqual(deliveryScore(assess('1.80')));
  });

  it('marks the assessment PROVISIONAL when the material input is genuinely unknown', () => {
    // Unknown does not fire and does not degrade the score — but it must not read COMPLETE either.
    const unknown = assess(null);
    expect(unknown.assessmentStatus).toBe('PROVISIONAL');
    expect(unknown.missingMaterialInputs.join()).toMatch(/REQUIRED_VELOCITY_RATIO/);
    expect(unknown.firedOverrides).not.toContain('OVR-NO-CREDIBLE-PLAN');
  });
});
