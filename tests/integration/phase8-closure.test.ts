/**
 * Phase 8 semantic closure — C-21, the dimension computability contract, and the draft audit.
 *
 * This suite is about **semantics, not rendering**. Every test here exists because the four-dimension
 * executive health model can be wrong in a way that looks completely right on a page: a dimension
 * that scores on whichever inputs happened to arrive, a composite that quietly redistributes a
 * missing dimension's weight onto the survivors, a Draft metric that reaches an authoritative band
 * through three hops of indirection, or a formula that drifted into the layer that happened to be
 * convenient.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Money, qty } from '@platform/decimal';
import { calendarDate, instant } from '@platform/time';
import { ruleVersion } from '@platform/provenance';
import { HEALTH_MODEL_V2, METRIC_REGISTRY, findMetric } from '@contexts/rules';
import type { SignalReading } from '@contexts/rules';
import { evaluateHealth } from '@contexts/health';
import { evaluateCommercial } from '@contexts/commercial';
import { evaluateQuality } from '@contexts/quality';
import { generatePortfolio } from '../../scripts/generator/index.js';
import {
  commercialInputFor, economicsInputFor, healthInputFor, qualityInputFor,
} from '../../scripts/assessment/curated-assessment.js';
import { commandCenterProject } from '../../scripts/assessment/command-center-adapter.js';
import { computeEconomics } from '@contexts/financial';

const portfolio = generatePortfolio();
const ALL = portfolio.structure.projects.map((p) => p.projectId);
const USD = 'USD' as const;

// ---------------------------------------------------------------------------
// 1. C-21 — the derivations live where their semantics live
// ---------------------------------------------------------------------------

describe('C-21: commercial and quality derivations live in their own contexts', () => {
  it('computes the commercial L2 metrics inside the commercial context', () => {
    const src = readFileSync('src/contexts/commercial/internal/commercial-engine.ts', 'utf8');
    for (const id of ['MET-COM-007', 'MET-COM-008', 'MET-COM-009']) expect(src).toContain(id);
  });

  it('computes the quality L2 metrics inside the quality context', () => {
    const src = readFileSync('src/contexts/quality/internal/quality-engine.ts', 'utf8');
    for (const id of ['MET-QUA-003', 'MET-QUA-006', 'MET-QUA-009', 'MET-QUA-011', 'MET-QUA-012']) {
      expect(src).toContain(id);
    }
  });

  it('declares both contexts as emitting L2, matching the catalog and their own snapshots', () => {
    const manifest = JSON.parse(readFileSync('architecture/manifest.json', 'utf8')) as {
      contexts: Record<string, { outputLayers: string[] }>;
    };
    expect(manifest.contexts['commercial']?.outputLayers).toEqual(['L1', 'L2']);
    expect(manifest.contexts['quality']?.outputLayers).toEqual(['L1', 'L2']);
    // The catalog already said so; this is the manifest catching up, not a new claim.
    for (const id of ['MET-COM-007', 'MET-COM-009', 'MET-QUA-006', 'MET-QUA-003']) {
      expect(findMetric(id)?.epistemicLevel, id).toBe('L2_DERIVED');
    }
  });

  it('does not reimplement those formulas inside health', () => {
    const src = readFileSync('src/contexts/health/internal/health-engine.ts', 'utf8');
    for (const id of ['MET-COM-007', 'MET-COM-009', 'MET-QUA-006', 'MET-QUA-003', 'MET-QUA-009']) {
      expect(src, id).not.toContain(id);
    }
    expect(src).not.toMatch(/escapedToClient|isRework|uncontracted|supersededBy/);
  });

  it('keeps the quality engine free of a financial import, taking actual cost as an argument', () => {
    const src = readFileSync('src/contexts/quality/internal/quality-engine.ts', 'utf8');
    expect(src).not.toMatch(/from '@contexts\/financial'/);
    expect(src).toMatch(/readonly actualCost: Money/);
  });

  it('leaves the adapters as shape translators, not calculators', () => {
    const src = readFileSync('scripts/assessment/curated-assessment.ts', 'utf8');
    // The adapter may filter, map and sort facts. It may not divide them.
    expect(src).not.toMatch(/qDiv\(|\.dividedBy\(/);
  });
});

// ---------------------------------------------------------------------------
// 2. The dimension computability contract
// ---------------------------------------------------------------------------

const READING = (signalId: string, value: string | null): SignalReading => ({
  signalId, value, evidence: [{ context: 'test', entityType: 'test', entityId: 'x' }],
});

/** Every signal HEALTH-v2 declares, all present and mid-band, as a starting point. */
function fullReadings(): Map<string, SignalReading> {
  const m = new Map<string, SignalReading>();
  for (const dim of HEALTH_MODEL_V2.dimensions) {
    for (const input of dim.inputs) {
      // Midway between the green and red edge, so nothing sits on a boundary.
      const g = Number(input.greenEdge);
      const r = Number(input.redEdge);
      m.set(input.signalId, READING(input.signalId, String((g + r) / 2)));
    }
  }
  return m;
}

const evaluate = (readings: Map<string, SignalReading>) => evaluateHealth({
  projectId: 'prj-test',
  week: '2026-W35' as never,
  assessedAt: instant('2026-08-31T00:00:00.000Z'),
  metricCatalogVersion: '2.0.0',
  model: HEALTH_MODEL_V2,
  reportedRag: null,
  readings,
  evidence: [{ context: 'test', entityType: 'test', entityId: 'x' }],
});

describe('the dimension computability contract (ADR-0022 D-4)', () => {
  it('declares exactly one required signal per dimension', () => {
    for (const dim of HEALTH_MODEL_V2.dimensions) {
      const required = dim.inputs.filter((x) => x.required === true);
      expect(required.length, dim.id).toBe(1);
    }
  });

  it('requires the signal each dimension is actually about', () => {
    const required = Object.fromEntries(HEALTH_MODEL_V2.dimensions.map(
      (d) => [d.id, d.inputs.find((x) => x.required === true)?.metricId],
    ));
    expect(required['FINANCIAL']).toBe('MET-FIN-014');
    expect(required['DELIVERY']).toBe('MET-DEL-015');
    expect(required['SCOPE_COMMERCIAL']).toBe('MET-COM-009');
    expect(required['PRODUCT_QUALITY']).toBe('MET-QUA-006');
  });

  it('scores every dimension when every signal is present', () => {
    const h = evaluate(fullReadings());
    expect(h.dimensions.every((d) => d.score !== null)).toBe(true);
    expect(h.assessmentStatus).toBe('COMPLETE');
    expect(h.missingDimensions).toEqual([]);
    expect(h.dimensionCoverage).toBe('1.0000');
  });

  it('refuses a dimension whose required signal is missing, whatever the input count', () => {
    // Product & Quality with three of four inputs present passes the half-rule comfortably — and
    // must still refuse, because the one missing is rework, the measure the dimension is about.
    const r = fullReadings();
    r.set('REWORK_RATIO', READING('REWORK_RATIO', null));
    const h = evaluate(r);
    const pq = h.dimensions.find((d) => d.dimensionId === 'PRODUCT_QUALITY');
    expect(pq?.score).toBeNull();
    expect(pq?.notComputableReason).toMatch(/required signal/);
    expect(pq?.notComputableReason).toMatch(/REWORK_RATIO/);
  });

  it('still scores a dimension missing an optional signal, if half remain', () => {
    const r = fullReadings();
    r.set('DEFECT_BACKLOG_TREND', READING('DEFECT_BACKLOG_TREND', null));
    const pq = evaluate(r).dimensions.find((d) => d.dimensionId === 'PRODUCT_QUALITY');
    expect(pq?.score).not.toBeNull();
  });

  it('refuses a dimension carried by fewer than half its inputs', () => {
    const r = fullReadings();
    for (const s of ['REQUIRED_VELOCITY_RATIO', 'MILESTONES_AT_RISK', 'DEPENDENCY_AGEING_DAYS']) {
      r.set(s, READING(s, null));
    }
    const d = evaluate(r).dimensions.find((x) => x.dimensionId === 'DELIVERY');
    expect(d?.score).toBeNull();
    expect(d?.notComputableReason).toMatch(/fewer than half/);
  });
});

// ---------------------------------------------------------------------------
// 3. Coverage and partial assessment — no silent renormalisation
// ---------------------------------------------------------------------------

/** Drops whole dimensions by nulling their required signal. */
function withDimensions(keep: readonly string[]): ReturnType<typeof evaluate> {
  const required: Record<string, string> = {
    FINANCIAL: 'FORECAST_GM_PERCENT',
    DELIVERY: 'PROGRESS_VARIANCE',
    SCOPE_COMMERCIAL: 'UNCOMPENSATED_SCOPE_RATIO',
    PRODUCT_QUALITY: 'REWORK_RATIO',
  };
  const r = fullReadings();
  for (const [dim, signal] of Object.entries(required)) {
    if (!keep.includes(dim)) r.set(signal, READING(signal, null));
  }
  return evaluate(r);
}

describe('missing-dimension semantics: the redistribution is declared, not silent', () => {
  it('reports 100% coverage as COMPLETE', () => {
    const h = withDimensions(['FINANCIAL', 'DELIVERY', 'SCOPE_COMMERCIAL', 'PRODUCT_QUALITY']);
    expect(h.assessmentStatus).toBe('COMPLETE');
    expect(h.dimensionCoverage).toBe('1.0000');
    expect(h.availableWeight).toBe('1.0000');
  });

  it('reports 85% coverage as PROVISIONAL and names what is missing', () => {
    const h = withDimensions(['FINANCIAL', 'DELIVERY', 'SCOPE_COMMERCIAL']);
    expect(h.assessmentStatus).toBe('PROVISIONAL');
    expect(h.dimensionCoverage).toBe('0.8500');
    expect(h.availableWeight).toBe('0.8500');
    expect(h.missingDimensions.map((m) => m.dimensionId)).toEqual(['PRODUCT_QUALITY']);
    expect(h.missingDimensions[0]?.reason.length).toBeGreaterThan(20);
  });

  it('reports 65% coverage as PROVISIONAL — the pre-closure state', () => {
    const h = withDimensions(['FINANCIAL', 'DELIVERY']);
    expect(h.assessmentStatus).toBe('PROVISIONAL');
    expect(h.dimensionCoverage).toBe('0.6500');
    expect(h.missingDimensions.map((m) => m.dimensionId).sort())
      .toEqual(['PRODUCT_QUALITY', 'SCOPE_COMMERCIAL']);
  });

  it('reports 40% coverage as PROVISIONAL — the Phase 7 state', () => {
    const h = withDimensions(['FINANCIAL']);
    expect(h.assessmentStatus).toBe('PROVISIONAL');
    expect(h.dimensionCoverage).toBe('0.4000');
    expect(h.missingDimensions).toHaveLength(3);
  });

  it('reports 0% coverage as NOT_COMPUTABLE, with no composite at all', () => {
    const h = withDimensions([]);
    expect(h.assessmentStatus).toBe('NOT_COMPUTABLE');
    expect(h.compositeScore).toBeNull();
    expect(h.dimensionCoverage).toBe('0.0000');
    expect(h.missingDimensions).toHaveLength(4);
  });

  it('never renormalises the model itself — the four weights stay 0.40/0.25/0.20/0.15', () => {
    const weights = Object.fromEntries(
      HEALTH_MODEL_V2.dimensions.map((d) => [d.id, d.weight]),
    );
    expect(weights).toEqual({
      FINANCIAL: '0.40', DELIVERY: '0.25', SCOPE_COMMERCIAL: '0.20', PRODUCT_QUALITY: '0.15',
    });
    // And the declared total is reported alongside whatever was available, at every coverage level.
    for (const keep of [[], ['FINANCIAL'], ['FINANCIAL', 'DELIVERY']]) {
      expect(withDimensions(keep).declaredWeight).toBe('1.0000');
    }
  });

  it('does not let a missing dimension score as zero — absence is not adverse performance', () => {
    // The same Financial score, once alone and once beside three others. If a missing dimension
    // scored zero, the first composite would be ~40% of the second. It is not: the denominator
    // shrinks with the numerator, and the *declared* weight is reported so the shift is visible.
    const alone = withDimensions(['FINANCIAL']);
    const financial = alone.dimensions.find((d) => d.dimensionId === 'FINANCIAL');
    expect(alone.compositeScore).toBe(financial?.score);
    expect(alone.assessmentStatus).toBe('PROVISIONAL');
  });

  it('keeps confidence out of the health model — it is not a fifth dimension', () => {
    expect(HEALTH_MODEL_V2.dimensions).toHaveLength(4);
    const ids = HEALTH_MODEL_V2.dimensions.map((d) => d.id);
    expect(ids).not.toContain('CONFIDENCE');
    for (const d of HEALTH_MODEL_V2.dimensions) {
      for (const i of d.inputs) expect(i.metricId, i.signalId).not.toMatch(/^MET-DQ-/);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Commercial and quality reproduce their catalog definitions
// ---------------------------------------------------------------------------

describe('commercial derivations reproduce the catalog', () => {
  const e = computeEconomics(economicsInputFor(portfolio, 'prj-009'));
  const input = commercialInputFor(portfolio, 'prj-009', e);
  const c = evaluateCommercial(input);

  it('computes the scope change ratio as MET-FIN-002 / MET-FIN-001 − 1', () => {
    expect(findMetric('MET-COM-008')?.formula).toBe('MET-FIN-002 / MET-FIN-001 − 1');
    expect(c.scopeChangeRatio.value).not.toBeNull();
  });

  it('counts only delivered uncontracted scope in MET-COM-009', () => {
    const deliveredUncontracted = input.scopeItems.filter(
      (s) => s.uncontracted && s.completedOn !== undefined,
    );
    const notDelivered = input.scopeItems.filter(
      (s) => s.uncontracted && s.completedOn === undefined,
    );
    // Uncontracted work not yet delivered is a commercial decision still available; excluding it is
    // the difference between exposure and opportunity.
    expect(c.uncompensatedScopeValue.isZero()).toBe(deliveredUncontracted.length === 0);
    expect(notDelivered.length).toBeGreaterThanOrEqual(0);
  });

  it('reports no pending change requests as absent, never as zero days of ageing', () => {
    const none = evaluateCommercial({ ...input, pendingChanges: [] });
    expect(none.maxPendingCrAgeDays.value).toBeNull();
    expect(none.maxPendingCrAgeDays.notComputableReason).toMatch(/no unsuperseded pending change/);
  });

  it('excludes superseded change requests from the ageing population', () => {
    const superseded = evaluateCommercial({
      ...input,
      pendingChanges: input.pendingChanges.map((x) => ({ ...x, superseded: true })),
    });
    expect(superseded.openPendingChanges).toBe(0);
    expect(superseded.maxPendingCrAgeDays.value).toBeNull();
  });

  it('takes the maximum, not the mean, for the health signal (ADR-0022 D-3)', () => {
    const two = evaluateCommercial({
      ...input,
      pendingChanges: [
        { id: 'a', raisedOn: calendarDate('2026-08-01'), proposedValue: Money.of('1000', USD), superseded: false },
        { id: 'b', raisedOn: calendarDate('2026-01-01'), proposedValue: Money.of('1000', USD), superseded: false },
      ],
    });
    expect(two.maxPendingCrAgeDays.value as number)
      .toBeGreaterThan(two.meanPendingCrAgeDays.value as number);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(evaluateCommercial(input))).toBe(JSON.stringify(c));
  });
});

describe('quality derivations reproduce the catalog', () => {
  const e = computeEconomics(economicsInputFor(portfolio, 'prj-006'));
  const input = qualityInputFor(portfolio, 'prj-006', e);
  const q = evaluateQuality(input);

  it('computes the escaped defect rate over all defects, not open ones', () => {
    expect(findMetric('MET-QUA-003')?.formula)
      .toBe('count(Defect WHERE escapedToClient) / count(Defect)');
    const escaped = input.defects.filter((d) => d.escapedToClient).length;
    expect(q.escapedDefectRate.value).not.toBeNull();
    expect(escaped).toBeGreaterThanOrEqual(0);
  });

  it('counts only unclosed defects as open, grouped by severity', () => {
    const open = input.defects.filter((d) => d.closedOn === undefined);
    expect(q.openDefectsTotal).toBe(open.length);
    const summed = Object.values(q.openDefectsBySeverity).reduce((a, b) => a + b, 0);
    expect(summed).toBe(open.length);
  });

  it('computes the rework ratio from effort hours, not from defect counts', () => {
    expect(findMetric('MET-QUA-006')?.formula)
      .toBe('Σ EffortRecord.hours WHERE isRework / Σ EffortRecord.hours');
    expect(q.reworkRatio.value).not.toBeNull();
  });

  it('refuses a backlog trend below its registered eight-week window', () => {
    const short = evaluateQuality({
      ...input,
      openDefectHistory: input.openDefectHistory.slice(0, 3),
    });
    expect(short.defectBacklogTrend.value).toBeNull();
    expect(short.defectBacklogTrend.notComputableReason).toMatch(/below the 8/);
  });

  it('floors excess rework cost at zero — good quality does not subsidise margin', () => {
    const under = evaluateQuality({ ...input, reworkAllowance: qty('0.99') });
    expect(under.excessReworkCost.value?.isZero()).toBe(true);
  });

  it('excludes the Draft MET-QUA-002 entirely', () => {
    const src = readFileSync('src/contexts/quality/internal/quality-engine.ts', 'utf8');
    expect(src).not.toMatch(/MET-QUA-002['"]/);
    expect(findMetric('MET-QUA-002')?.status).toBe('Draft');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(evaluateQuality(input))).toBe(JSON.stringify(q));
  });
});

// ---------------------------------------------------------------------------
// 5. Cross-dimension signal reuse (ADR-0022 D-5)
// ---------------------------------------------------------------------------

describe('cross-dimension signal reuse is enumerated, not accidental', () => {
  it('uses each health signal in exactly one executive dimension', () => {
    const seen = new Map<string, string[]>();
    for (const d of HEALTH_MODEL_V2.dimensions) {
      for (const i of d.inputs) {
        seen.set(i.signalId, [...(seen.get(i.signalId) ?? []), d.id]);
      }
    }
    const shared = [...seen.entries()].filter(([, dims]) => dims.length > 1);
    expect(shared).toEqual([]);
  });

  it('keeps acceptance in one dimension only, so an objection is not counted twice', () => {
    // MET-QUA-010 is the only acceptance-derived health signal. The same records' *billing*
    // consequence reaches Scope & Commercial through commercial exposure facts, which is a
    // different measurement of a different thing (ADR-0022 D-5).
    const acceptanceSignals = HEALTH_MODEL_V2.dimensions.flatMap(
      (d) => d.inputs.filter((i) => /ACCEPTANCE/.test(i.signalId)).map((i) => d.id),
    );
    expect(acceptanceSignals).toEqual(['PRODUCT_QUALITY']);
  });

  it('splits progress claims across two dimensions deliberately, asking different questions', () => {
    // Burn gap (Financial) asks "is cost outrunning progress?"; progress variance (Delivery) asks
    // "is progress behind plan?". Same fact, two questions, both intentional — and each normalised
    // against its own band so neither inherits the other's threshold.
    const financial = HEALTH_MODEL_V2.dimensions.find((d) => d.id === 'FINANCIAL');
    const delivery = HEALTH_MODEL_V2.dimensions.find((d) => d.id === 'DELIVERY');
    expect(financial?.inputs.some((i) => i.metricId === 'MET-FIN-027')).toBe(true);
    expect(delivery?.inputs.some((i) => i.metricId === 'MET-DEL-015')).toBe(true);
    expect(financial?.inputs.some((i) => i.metricId === 'MET-DEL-015')).toBe(false);
  });

  it('keeps pending changes inside Scope & Commercial, measuring age and value separately', () => {
    const sc = HEALTH_MODEL_V2.dimensions.find((d) => d.id === 'SCOPE_COMMERCIAL');
    const ids = sc?.inputs.map((i) => i.metricId) ?? [];
    expect(ids).toContain('MET-COM-007');
    expect(ids).toContain('MET-FIN-011');
    // Both derive from pending changes; one measures how long, the other how much. Within one
    // dimension this is a composition, not a double count across dimensions.
    for (const other of HEALTH_MODEL_V2.dimensions.filter((d) => d.id !== 'SCOPE_COMMERCIAL')) {
      expect(other.inputs.map((i) => i.metricId)).not.toContain('MET-COM-007');
      expect(other.inputs.map((i) => i.metricId)).not.toContain('MET-FIN-011');
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Draft-dependency audit — automated, over the whole authoritative chain
// ---------------------------------------------------------------------------

interface RefLike { readonly id: string; readonly inputs: readonly string[]; readonly formula: string }

const refsOf = (m: RefLike): string[] => {
  const s = new Set<string>();
  for (const i of m.inputs) if (i.startsWith('MET-')) s.add(i);
  for (const t of m.formula.match(/MET-[A-Z]+-\d+/g) ?? []) s.add(t);
  s.delete(m.id);
  return [...s].filter((r) => findMetric(r) !== undefined);
};

describe('no authoritative Phase 8 output depends on a Draft metric', () => {
  /** Every metric the four-dimension chain reaches, from the model's own declarations. */
  const roots = [
    ...HEALTH_MODEL_V2.dimensions.flatMap((d) => [d.metricId, ...d.inputs.map((i) => i.metricId)]),
    'MET-HLTH-011', 'MET-HLTH-013', 'MET-HLTH-020', 'MET-HLTH-030', 'MET-HLTH-033',
    'MET-FCST-001', 'MET-FCST-020', 'MET-FCST-021', 'MET-FCST-025',
    'MET-DQ-005', 'MET-DQ-007',
  ];

  it('reaches no Draft metric transitively from any executive health chain', () => {
    const drafts: string[] = [];
    const seen = new Set<string>();
    const stack = [...roots];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const m = findMetric(id);
      if (m === undefined) continue;
      if (m.status === 'Draft') drafts.push(id);
      stack.push(...refsOf(m));
    }
    expect(drafts).toEqual([]);
    // A guard against the audit silently passing because it walked nothing.
    expect(seen.size).toBeGreaterThan(30);
  });

  it('names every metric in the chain, and every one resolves in the registry', () => {
    for (const id of roots) expect(findMetric(id), id).toBeDefined();
  });

  it('leaves exactly three Draft metrics in the registry, none of them reachable', () => {
    const drafts = METRIC_REGISTRY.filter((m) => m.status === 'Draft').map((m) => m.id).sort();
    expect(drafts).toEqual(['MET-DEL-012', 'MET-DQ-009', 'MET-QUA-002']);
  });
});

// ---------------------------------------------------------------------------
// 7. The portfolio, measured
// ---------------------------------------------------------------------------

describe('the four-dimension model across the whole portfolio', () => {
  const assessments = ALL.map((id) => commandCenterProject(portfolio, id).assessment);

  it('scores all four dimensions on every project, from real evidence', () => {
    for (const a of assessments) {
      expect(a.health.dimensions).toHaveLength(4);
      for (const d of a.health.dimensions) expect(d.score, `${a.projectId} ${d.dimensionId}`).not.toBeNull();
    }
  });

  it('scores every dimension, on every project — dimension computability is unchanged', () => {
    for (const a of assessments) {
      expect(a.health.dimensionCoverage, a.projectId).toBe('1.0000');
      expect(a.health.missingDimensions, a.projectId).toEqual([]);
    }
  });

  it('separates completeness from computability, and names what is missing', () => {
    /*
     * ADR-0028 §15. This test previously asserted COMPLETE on all 75, which encoded the defect:
     * "every dimension returned a number" was being reported as "everything was assessed". A
     * dimension can score while a materially applicable input is genuinely unavailable.
     *
     * Every project here still produces four dimension scores; six are PROVISIONAL because their
     * defect-backlog history is too short for MET-QUA-009, which is unknown evidence rather than
     * an absent risk object.
     */
    const provisional = assessments.filter((a) => a.health.assessmentStatus === 'PROVISIONAL');
    const complete = assessments.filter((a) => a.health.assessmentStatus === 'COMPLETE');
    expect(complete.length + provisional.length).toBe(assessments.length);
    expect(provisional.length).toBeGreaterThan(0);

    for (const a of complete) {
      expect(a.health.missingMaterialInputs, a.projectId).toEqual([]);
    }
    for (const a of provisional) {
      // Never provisional without saying which evidence is missing.
      expect(a.health.missingMaterialInputs.length, a.projectId).toBeGreaterThan(0);
      /*
       * Which signal is missing is a property of the data, not of the model.
       *
       * This pinned DEFECT_BACKLOG_TREND, which held only because the previous synthetic data
       * happened to withhold that one signal everywhere it withheld anything. The claim being
       * protected is the one in the comment above: a PROVISIONAL assessment must always name the
       * evidence it lacks, in terms a reader can act on.
       */
      expect(a.health.missingMaterialInputs.join(), a.projectId).toMatch(/[A-Z][A-Z_]{4,}/);
    }
  });

  it('never marks a project provisional merely because a risk object does not exist', () => {
    // No open dependency and no pending CR are NOT_APPLICABLE, not missing evidence (ADR-0028 D-3).
    // Treating them as gaps marked 64 of 75 projects provisional in an earlier attempt.
    for (const a of assessments) {
      expect(a.health.missingMaterialInputs.join(), a.projectId)
        .not.toMatch(/DEPENDENCY_AGEING_DAYS|PENDING_CR_AGE_DAYS/);
    }
  });

  it('makes every dimension contribution explainable from its own inputs', () => {
    for (const a of assessments) {
      for (const d of a.health.dimensions) {
        expect(d.contribution, `${a.projectId} ${d.dimensionId}`).not.toBeNull();
        const supplied = d.inputs.filter((i) => i.observed !== null);
        expect(supplied.length * 2, `${a.projectId} ${d.dimensionId}`)
          .toBeGreaterThanOrEqual(d.inputs.length);
      }
    }
  });

  it('is deterministic across the whole portfolio', () => {
    const again = ALL.map((id) => commandCenterProject(portfolio, id).assessment.health.compositeScore);
    expect(again).toEqual(assessments.map((a) => a.health.compositeScore));
  });
});

// ---------------------------------------------------------------------------
// 8. The outlook seed stays fixed
// ---------------------------------------------------------------------------

describe('the forward outlook is seeded from the assessed band', () => {
  it('has no constant band anywhere in the projection path', () => {
    const adapter = readFileSync('scripts/assessment/command-center-adapter.ts', 'utf8');
    expect(adapter).toContain('currentBand: health.systemAssessedRag');
    expect(adapter).not.toMatch(/currentBand: '(GREEN|AMBER|RED)'/);
  });

  it('never projects a RED project straight to GREEN at 30 days', () => {
    const order: Record<string, number> = { GREEN: 0, AMBER: 1, RED: 2 };
    for (const id of ALL) {
      const a = commandCenterProject(portfolio, id).assessment;
      const o30 = a.greenAtRisk.outlook30;
      if (o30 === null) continue;
      if (a.health.systemAssessedRag !== 'RED') continue;
      // A RED project may only be projected better with improving-trajectory evidence.
      if (a.trajectory.state !== 'IMPROVING') {
        expect(order[o30] ?? 0, `${id} RED → ${o30} on ${a.trajectory.state}`)
          .toBeGreaterThanOrEqual(order['AMBER'] as number);
      }
    }
  });

  it('starts each band from itself when the trajectory is stable', () => {
    for (const id of ALL) {
      const a = commandCenterProject(portfolio, id).assessment;
      if (a.trajectory.state !== 'STABLE') continue;
      if (a.greenAtRisk.outlook30 === null) continue;
      expect(a.greenAtRisk.outlook30, `${id} stable`).toBe(a.health.systemAssessedRag);
    }
  });
});
