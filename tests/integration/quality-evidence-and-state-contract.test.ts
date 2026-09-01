/**
 * Product & Quality evidence semantics, and the dimension-input state contract (ADR-0028).
 *
 * The defect this closes: `MET-QUA-003` was `NOT_COMPUTABLE` whenever `defects.length === 0`, which
 * covered two opposite realities — **a source reporting zero defects** and **no defect telemetry at
 * all**. `scoreDimension` then dropped the null and renormalised, so a dead feed read as excellent
 * quality: Quality 41.67 → 56.41, composite 68.38 → 72.21, **AMBER → GREEN, still COMPLETE**.
 *
 * Fixtures Q1–Q6 assert from constructed source facts, never from the production rule under test.
 */
import { describe, expect, it } from 'vitest';
import { evaluateQuality } from '@contexts/quality';
import { evaluateHealth } from '@contexts/health';
import { Money } from '@platform/decimal';
import { HEALTH_MODEL_V2, type SignalReading, signalStateOf } from '@contexts/rules';

const AS_OF = '2026-08-31T00:00:00.000Z' as never;
const EV = [{ context: 'quality', recordType: 'Fixture', recordId: 'Q' }] as never;
const USD = 'USD' as const;

const defect = (i: number, escaped: boolean) => ({
  id: `d-${String(i)}`, severity: 'MAJOR' as const,
  raisedOn: '2026-06-01' as never, escapedToClient: escaped,
});

const quality = (opts: {
  defects: ReturnType<typeof defect>[];
  sourceAvailable: boolean;
  ageDays: number | null;
  history: number;
}) => evaluateQuality({
  projectId: 'Q', asOf: AS_OF,
  defects: opts.defects as never,
  acceptanceItems: [], effort: [], actualCost: Money.zero(USD),
  reworkAllowance: '0.05' as never, backlogWindowWeeks: 8,
  openDefectHistory: Array.from({ length: opts.history }, (_, i) => ({
    week: `2026-W${String(20 + i).padStart(2, '0')}`, open: 2,
  })),
  defectSource: {
    available: opts.sourceAvailable, ageDays: opts.ageDays, expectedCadenceDays: 90,
  },
});

// ---------------------------------------------------------------------------
// Q1–Q6 — the six evidence realities, kept apart
// ---------------------------------------------------------------------------

describe('quality evidence states are distinguishable at the metric', () => {
  it('Q1 — adverse evidence present is OBSERVED', () => {
    const q = quality({
      defects: [defect(1, true), defect(2, true), defect(3, false)],
      sourceAvailable: true, ageDays: 3, history: 12,
    });
    expect(q.escapedDefectRate.value).not.toBeNull();
    expect(q.escapedDefectRate.state ?? 'OBSERVED').toBe('OBSERVED');
  });

  it('Q2 — no defect telemetry is NOT_COMPUTABLE, and says so', () => {
    const q = quality({ defects: [], sourceAvailable: false, ageDays: null, history: 12 });
    expect(q.escapedDefectRate.value).toBeNull();
    expect(q.escapedDefectRate.state).toBe('NOT_COMPUTABLE');
    expect(q.escapedDefectRate.notComputableReason).toMatch(/NOT a statement that there are no defects/);
  });

  it('Q3 — a reporting source with zero defects is KNOWN_ZERO, and scores healthy', () => {
    const q = quality({ defects: [], sourceAvailable: true, ageDays: 3, history: 12 });
    expect(q.escapedDefectRate.state).toBe('KNOWN_ZERO');
    expect(q.escapedDefectRate.value).toBe('0');
  });

  it('Q4 — a stale source proves nothing, and is not KNOWN_ZERO', () => {
    const q = quality({ defects: [], sourceAvailable: true, ageDays: 200, history: 12 });
    expect(q.escapedDefectRate.state).toBe('NOT_COMPUTABLE');
    expect(q.escapedDefectRate.notComputableReason).toMatch(/beyond its 90-day cadence/);
  });

  it('Q5 — insufficient backlog history is unknown, never a healthy trend', () => {
    const q = quality({ defects: [defect(1, false)], sourceAvailable: true, ageDays: 3, history: 2 });
    expect(q.defectBacklogTrend.value).toBeNull();
    expect(signalStateOf({ signalId: 'x', value: null, evidence: [] })).toBe('NOT_COMPUTABLE');
  });

  it('distinguishes Q2 from Q3 — the whole point', () => {
    const noFeed = quality({ defects: [], sourceAvailable: false, ageDays: null, history: 12 });
    const cleanFeed = quality({ defects: [], sourceAvailable: true, ageDays: 3, history: 12 });
    expect(noFeed.escapedDefectRate.state).not.toBe(cleanFeed.escapedDefectRate.state);
  });
});

// ---------------------------------------------------------------------------
// The S4 itself: losing evidence may not produce GREEN + COMPLETE
// ---------------------------------------------------------------------------

const BASE: Record<string, string> = {
  RISK_ADJUSTED_GM_PERCENT: '0.18', GM_VALUE_AT_RISK_RATIO: '0.10', LD_EXPOSURE_RATIO: '0.000',
  FORECAST_GM_PERCENT: '0.130', MARGIN_EROSION_PP: '-0.02', BURN_GAP: '0.05',
  CONTINGENCY_BURN_GAP: '0.10', PROGRESS_VARIANCE: '-0.04', REQUIRED_VELOCITY_RATIO: '1.20',
  MILESTONES_AT_RISK: '1', DEPENDENCY_AGEING_DAYS: '30', UNCOMPENSATED_SCOPE_RATIO: '0.03',
  PENDING_CR_AGE_DAYS: '50', UNSECURED_UPSIDE_RATIO: '0.04', REWORK_RATIO: '0.10',
  ACCEPTANCE_BLOCKERS: '1', ESCAPED_DEFECT_RATE: '0.30', DEFECT_BACKLOG_TREND: '3',
};

const assess = (over: Record<string, SignalReading | undefined>) => {
  const readings = new Map<string, SignalReading>(
    Object.entries(BASE).map(([k, v]) => [k, { signalId: k, value: v, evidence: EV }]),
  );
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) readings.delete(k); else readings.set(k, v);
  }
  return evaluateHealth({
    projectId: 'Q', week: '2026-W35' as never, assessedAt: AS_OF,
    metricCatalogVersion: '1.0.0', model: HEALTH_MODEL_V2, reportedRag: 'GREEN',
    readings, evidence: EV,
    applicability: {
      physicalCompletion: '0.5' as never, daysToBaselineCompletion: 200,
      elapsedDeliveryWeeks: 20, velocityWindowWeeks: 8,
      contractType: 'FIXED_BID', lifecycleStage: 'EXECUTING',
    },
    declaredSignals: new Set(Object.keys(BASE)),
  });
};

describe('Control B — losing material evidence cannot silently preserve COMPLETE authority', () => {
  const withEvidence = assess({});
  const feedDead = assess({
    ESCAPED_DEFECT_RATE: {
      signalId: 'ESCAPED_DEFECT_RATE', value: null, evidence: EV,
      state: 'NOT_COMPUTABLE', stateReasonCode: 'REQUIRED_EVIDENCE_MISSING',
      notComputableReason: 'no defect telemetry is available',
    },
    DEFECT_BACKLOG_TREND: {
      signalId: 'DEFECT_BACKLOG_TREND', value: null, evidence: EV,
      state: 'NOT_COMPUTABLE', stateReasonCode: 'REQUIRED_EVIDENCE_MISSING',
      notComputableReason: 'no defect telemetry is available',
    },
  });

  it('reproduces the numeric optimism — the score still renormalises', () => {
    // No health penalty is invented for missingness; the number genuinely rises.
    const q = (h: typeof withEvidence) =>
      Number(h.dimensions.find((d) => d.metricId === 'MET-HLTH-024')!.score);
    expect(q(feedDead)).toBeGreaterThan(q(withEvidence));
  });

  it('but never lets it read COMPLETE', () => {
    expect(withEvidence.assessmentStatus).toBe('COMPLETE');
    expect(feedDead.assessmentStatus).toBe('PROVISIONAL');
  });

  it('names the missing evidence rather than leaving it inferred', () => {
    expect(feedDead.missingMaterialInputs.join()).toMatch(/ESCAPED_DEFECT_RATE/);
    expect(feedDead.missingMaterialInputs.join()).toMatch(/DEFECT_BACKLOG_TREND/);
  });

  it('forbids the exact S4: a band improvement with COMPLETE and no warning', () => {
    const improved = feedDead.systemAssessedRag !== withEvidence.systemAssessedRag;
    if (improved) expect(feedDead.assessmentStatus).toBe('PROVISIONAL');
    // GREEN + COMPLETE + no missing evidence is the forbidden triple.
    expect(
      feedDead.systemAssessedRag === 'GREEN'
      && feedDead.assessmentStatus === 'COMPLETE'
      && feedDead.missingMaterialInputs.length === 0,
    ).toBe(false);
  });

  it('KNOWN_ZERO scores healthy and costs nothing — it is an observation', () => {
    const knownZero = assess({
      ESCAPED_DEFECT_RATE: {
        signalId: 'ESCAPED_DEFECT_RATE', value: '0', evidence: EV, state: 'KNOWN_ZERO',
      },
    });
    expect(knownZero.assessmentStatus).toBe('COMPLETE');
    expect(knownZero.missingMaterialInputs).toEqual([]);
  });

  it('NOT_APPLICABLE costs nothing either — the risk object does not exist', () => {
    const noDeps = assess({
      DEPENDENCY_AGEING_DAYS: {
        signalId: 'DEPENDENCY_AGEING_DAYS', value: null, evidence: EV,
        state: 'NOT_APPLICABLE', stateReasonCode: 'RISK_OBJECT_ABSENT',
        notComputableReason: 'no open customer dependencies exist',
      },
    });
    expect(noDeps.assessmentStatus).toBe('COMPLETE');
    expect(noDeps.missingMaterialInputs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Control E — every executive input null carries a state
// ---------------------------------------------------------------------------

describe('Control E — no executive dimension input is a bare null', () => {
  it('gives every input an explicit state on every dimension', () => {
    const h = assess({});
    for (const d of h.dimensions) {
      for (const i of d.inputs) {
        expect(i.state, `${d.dimensionId}/${i.signalId}`).toBeDefined();
      }
    }
  });

  it('defaults an unstated null to the conservative reading, never the optimistic one', () => {
    // An un-migrated caller must not be able to produce silent optimism.
    expect(signalStateOf(undefined)).toBe('NOT_COMPUTABLE');
    expect(signalStateOf({ signalId: 'x', value: null, evidence: [] })).toBe('NOT_COMPUTABLE');
    expect(signalStateOf({ signalId: 'x', value: '1', evidence: [] })).toBe('OBSERVED');
  });
});
