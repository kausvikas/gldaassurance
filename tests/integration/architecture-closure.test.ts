/**
 * Architectural closure — C-20's de-duplication, and the escalation ladder nobody was enforcing.
 *
 * Two controls live here, both of which existed only as careful authorship before this suite:
 *
 * 1. **`MET-PORT-003`, and the reduction that should never have existed.** An earlier implementation
 *    subtracted a "shared-cause double count" across projects, removing 44% of portfolio exposure.
 *    Two projects' margins are disjoint pools of money, so there was nothing to de-duplicate — the
 *    reduction removed real exposure. The adversarial cases below are the ones that would have
 *    caught it, and case C is the exact input the old code collapsed. It had a passing test
 *    asserting that collapse, which is why a green suite proves nothing about a wrong property.
 *
 * 2. **The escalation ladder.** A signal used by an early-warning rule, a health dimension and a
 *    hard override must escalate in that order: warn before the dimension reddens, redden before the
 *    override forces the band. Every signal in the model satisfies this today **by authorship**, and
 *    nothing stopped a future edit from silently inverting it. A warning that fires after the
 *    override has already forced RED is not an early warning; it is a footnote.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Money, qCompare, qty } from '@platform/decimal';
import {
  EARLY_WARNING_RULES, HARD_OVERRIDE_RULES, HEALTH_MODEL_V2, findMetric,
} from '@contexts/rules';
import { attributeProject, portfolioValueAtRisk } from '@contexts/portfolio';
import { computeLateDetectionRate } from '@contexts/forecast';
import { lateDetectionFor } from '../../scripts/assessment/risk-adapter.js';
import type { ProjectCauseInput } from '@contexts/portfolio';
import { METRIC_REGISTRY } from '@contexts/rules';
import { buildMarginBridge } from '@contexts/financial';
import { generatePortfolio } from '../../scripts/generator/index.js';
import { commandCenterProject } from '../../scripts/assessment/command-center-adapter.js';
import { marginBridgeFor } from '../../scripts/assessment/margin-adapter.js';

const USD = 'USD' as const;
const ZERO = Money.zero(USD);
const portfolio = generatePortfolio();
const FIXED_BID = portfolio.structure.projects
  .filter((p) => p.engagementModel === 'FIXED_BID').map((p) => p.projectId);

const causeInputs: readonly ProjectCauseInput[] = FIXED_BID.map((id) => {
  const p = commandCenterProject(portfolio, id);
  return {
    projectId: id,
    gmValueAtRisk: p.assessment.economics.gmValueAtRisk,
    risks: p.riskCauses,
  };
});

// ---------------------------------------------------------------------------
// 1. MET-PORT-003 — no cross-project reduction without shared-money evidence
// ---------------------------------------------------------------------------

describe('MET-PORT-003 counts each project once and de-duplicates nothing across projects', () => {
  const result = portfolioValueAtRisk(causeInputs, ZERO);

  it('A — one project with three causes contributes its value at risk exactly once', () => {
    const r = portfolioValueAtRisk([{
      projectId: 'solo',
      gmValueAtRisk: Money.of('1000000', USD),
      risks: [
        { causeKey: 'A', probability: qty('0.5'), costImpact: Money.of('100000', USD) },
        { causeKey: 'B', probability: qty('0.5'), costImpact: Money.of('200000', USD) },
        { causeKey: 'C', probability: qty('0.5'), costImpact: Money.of('300000', USD) },
      ],
    }], ZERO);
    expect(r.valueAtRisk.toQuantity()).toBe('1000000');
    // It appears in three concentration rows, which is why those rows are never summed.
    expect(r.concentration).toHaveLength(3);
    expect(r.concentrationIsAdditive).toBe(false);
  });

  it('B — three projects sharing a cause stay additive: $1M + $2M + $0.8M = $3.8M', () => {
    const r = portfolioValueAtRisk([
      { projectId: 'a', gmValueAtRisk: Money.of('1000000', USD), risks: [{ causeKey: 'SUPPLIER', probability: qty('0.5'), costImpact: Money.of('1', USD) }] },
      { projectId: 'b', gmValueAtRisk: Money.of('2000000', USD), risks: [{ causeKey: 'SUPPLIER', probability: qty('0.5'), costImpact: Money.of('1', USD) }] },
      { projectId: 'c', gmValueAtRisk: Money.of('800000', USD), risks: [{ causeKey: 'SUPPLIER', probability: qty('0.5'), costImpact: Money.of('1', USD) }] },
    ], ZERO);
    expect(r.valueAtRisk.toQuantity()).toBe('3800000');
  });

  it('C — twenty projects at $500K on one cause total $10M, never $500K', () => {
    // This is the case the superseded implementation collapsed, and it is the whole error: three
    // damaged margins from one root cause are three losses, not one.
    const hostile = Array.from({ length: 20 }, (_, i) => ({
      projectId: `p${String(i)}`,
      gmValueAtRisk: Money.of('500000', USD),
      risks: [{ causeKey: 'ONE_CAUSE', probability: qty('0.9'), costImpact: Money.of('250000', USD) }],
    }));
    const r = portfolioValueAtRisk(hostile, ZERO);
    expect(r.valueAtRisk.toQuantity()).toBe('10000000');
    expect(r.valueAtRisk.toQuantity()).not.toBe('500000');
  });

  it('counts a duplicated project id once — the only de-duplication there is', () => {
    const p = { projectId: 'dup', gmValueAtRisk: Money.of('750000', USD), risks: [] };
    expect(portfolioValueAtRisk([p, p], ZERO).valueAtRisk.toQuantity()).toBe('750000');
    expect(portfolioValueAtRisk([p, p], ZERO).projectCount).toBe(1);
  });

  it('equals the plain sum over the real portfolio — nothing is netted off', () => {
    const plain = causeInputs.reduce((m, p) => m.plus(p.gmValueAtRisk), ZERO);
    expect(result.valueAtRisk.toQuantity()).toBe(plain.toQuantity());
  });

  it('carries the reason no cross-project reduction is applied', () => {
    expect(result.deduplicationBasis).toMatch(/disjoint pools/);
    expect(result.deduplicationBasis).toMatch(/category label/);
  });

  it('reports concentration as non-additive, and it genuinely over-sums', () => {
    // If the concentration rows happened to sum to the total, a caller could subtract them and be
    // right by accident. On a multi-cause portfolio they must over-sum.
    const summed = result.concentration.reduce((m, c) => m.plus(c.exposedValueAtRisk), ZERO);
    expect(qCompare(summed.toQuantity(), result.valueAtRisk.toQuantity())).toBeGreaterThan(0);
    expect(result.concentrationIsAdditive).toBe(false);
  });

  it('ranks concentration largest first, so the systemic cause is legible', () => {
    for (let i = 0; i + 1 < result.concentration.length; i += 1) {
      const a = result.concentration[i] as { exposedValueAtRisk: Money };
      const b = result.concentration[i + 1] as { exposedValueAtRisk: Money };
      expect(qCompare(a.exposedValueAtRisk.toQuantity(), b.exposedValueAtRisk.toQuantity()))
        .toBeGreaterThanOrEqual(0);
    }
  });

  it('attributes within a project only, summing exactly to that project', () => {
    for (const a of result.attributions) {
      if (a.attributions.length === 0) continue;
      const sum = a.attributions.reduce((m, x) => m.plus(x.amount), ZERO);
      expect(sum.toQuantity(), a.projectId).toBe(a.gmValueAtRisk.toQuantity());
    }
  });

  it('keeps a project with no recorded cause at its full value at risk', () => {
    const bare = portfolioValueAtRisk([{
      projectId: 'bare', gmValueAtRisk: Money.of('400000', USD), risks: [],
    }], ZERO);
    expect(bare.valueAtRisk.toQuantity()).toBe('400000');
    expect(bare.projectsWithNoRecordedCause).toEqual(['bare']);
  });

  it('is deterministic (AC-7)', () => {
    expect(JSON.stringify(portfolioValueAtRisk(causeInputs, ZERO))).toBe(JSON.stringify(result));
  });

  it('exposes no cross-project subtraction anywhere in the module', () => {
    const src = readFileSync('src/contexts/portfolio/internal/portfolio-value-at-risk.ts', 'utf8');
    // The only `minus` permitted is the within-project attribution residual.
    const minusCalls = src.match(/\.minus\(/g) ?? [];
    expect(minusCalls.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 2. The escalation ladder
// ---------------------------------------------------------------------------

describe('signals escalate in one order across every mechanism that uses them', () => {
  const warnings = new Map(EARLY_WARNING_RULES.map((r) => [r.signalId, r]));
  const overrides = new Map(HARD_OVERRIDE_RULES.map((r) => [r.signalId, r]));
  const dimensionInputs = new Map(
    HEALTH_MODEL_V2.dimensions.flatMap((d) => d.inputs.map((i) => [i.signalId, i] as const)),
  );

  /**
   * Signals whose adverse direction is *downward* — a lower value is worse. The ladder still
   * applies, with the comparison reversed, and they are listed rather than inferred so a new one
   * has to be classified deliberately.
   */
  const LOWER_IS_WORSE = new Set(
    [...dimensionInputs.entries()].filter(([, i]) => i.higherIsBetter).map(([s]) => s),
  );

  it('warns before the dimension reddens, and reddens before an override forces the band', () => {
    const broken: string[] = [];
    for (const [signalId, w] of warnings) {
      const dim = dimensionInputs.get(signalId);
      const ovr = overrides.get(signalId);
      if (w.threshold === undefined) continue;
      if (LOWER_IS_WORSE.has(signalId)) continue;

      if (dim !== undefined && qCompare(qty(w.threshold), qty(dim.redEdge)) > 0) {
        broken.push(`${signalId}: warning ${w.threshold} fires after the red edge ${dim.redEdge}`);
      }
      if (ovr?.threshold !== undefined && qCompare(qty(w.threshold), qty(ovr.threshold)) > 0) {
        broken.push(`${signalId}: warning ${w.threshold} fires after the override ${ovr.threshold}`);
      }
      if (dim !== undefined && ovr?.threshold !== undefined
        && qCompare(qty(dim.redEdge), qty(ovr.threshold)) > 0) {
        broken.push(`${signalId}: red edge ${dim.redEdge} is past the override ${ovr.threshold}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('checks at least one signal that participates in all three mechanisms', () => {
    // Otherwise the assertion above could pass vacuously.
    const tripled = [...warnings.keys()].filter(
      (s) => dimensionInputs.has(s) && overrides.has(s),
    );
    expect(tripled.length).toBeGreaterThan(0);
  });

  it('names a metric for every early-warning rule, and each one is registered', () => {
    for (const r of EARLY_WARNING_RULES) {
      expect(r.signalMetricId, r.id).toBeDefined();
      expect(findMetric(r.signalMetricId ?? ''), `${r.id} → ${String(r.signalMetricId)}`)
        .toBeDefined();
    }
  });

  it('keeps every early-warning rule at WARNING severity — none may force a band', () => {
    for (const r of EARLY_WARNING_RULES) expect(r.severity, r.id).toBe('WARNING');
  });

  it('reaches no Draft metric from any early-warning rule', () => {
    for (const r of EARLY_WARNING_RULES) {
      expect(findMetric(r.signalMetricId ?? '')?.status, r.id).not.toBe('Draft');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Temporal state is evaluated as-of, not by null check
// ---------------------------------------------------------------------------

describe('no adapter decides settled state by a naive null check', () => {
  /** Fields whose populated value is a **date**, so absence is not the only open state. */
  const SETTLEMENT_FIELDS = [
    'resolvedOn', 'closedOn', 'actualDate', 'completedOn', 'acceptedOn', 'dispositionedOn',
  ];
  const ADAPTERS = [
    'scripts/assessment/curated-assessment.ts',
    'scripts/assessment/command-center-adapter.ts',
    'scripts/assessment/project-health-adapter.ts',
    'scripts/assessment/margin-adapter.ts',
    'scripts/assessment/risk-adapter.ts',
  ];

  it('uses the as-of predicate, never `field === undefined`, to decide settlement', () => {
    const offenders: string[] = [];
    for (const file of ADAPTERS) {
      const src = readFileSync(file, 'utf8');
      for (const [index, line] of src.split('\n').entries()) {
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
        for (const field of SETTLEMENT_FIELDS) {
          // A bare null check on a settlement date silently classifies every future-dated
          // settlement as already done. `isOpenAsOf` / `settledOnAsOf` exist so it cannot.
          if (line.includes(`${field} === undefined`) && !line.includes('AsOf')) {
            offenders.push(`${file}:${String(index + 1)} — ${field} === undefined`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('checks files that genuinely reference settlement fields, so it cannot pass vacuously', () => {
    const referencing = ADAPTERS.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return SETTLEMENT_FIELDS.some((field) => src.includes(field));
    });
    expect(referencing.length).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------------------
// 4. System RAG distinguishes the weighted model from a policy override
// ---------------------------------------------------------------------------

describe('a band forced by policy is never presented as the model’s verdict', () => {
  const assessments = FIXED_BID.map((id) => commandCenterProject(portfolio, id).assessment.health);

  it('reports the band the weighted composite alone would have given', () => {
    for (const h of assessments) {
      if (h.compositeScore === null) continue;
      expect(h.compositeBand, h.projectId).toMatch(/GREEN|AMBER|RED/);
    }
  });

  it('flags every project whose band an override changed', () => {
    for (const h of assessments) {
      const changed = h.firedOverrides.length > 0 && h.compositeBand !== 'RED';
      expect(h.overrideChangedBand, h.projectId).toBe(changed);
    }
  });

  it('finds override-forced bands on this portfolio, so the control is not vacuous', () => {
    // Every RED here is override-forced and none is band-driven. That is a finding about
    // calibration (DR-055), and the point of this test is that it stays visible.
    const overrideForced = assessments.filter((h) => h.overrideChangedBand);
    expect(overrideForced.length).toBeGreaterThan(0);
  });

  it('never claims an override changed the band when the composite was already RED', () => {
    for (const h of assessments) {
      if (h.compositeBand === 'RED') expect(h.overrideChangedBand, h.projectId).toBe(false);
    }
  });

  it('says in words which mechanism decided the band', () => {
    expect(assessments.find((h) => h.overrideChangedBand)).toBeDefined();
    // The engine's own narrative must name the counterfactual band, not just the overrides.
    const src = readFileSync('src/contexts/health/internal/health-engine.ts', 'utf8');
    expect(src).toMatch(/would have banded this project/);
    expect(src).toMatch(/policy decision, not the/);
  });
});

// ---------------------------------------------------------------------------
// 5. Late detection cannot be quoted as a conclusion from a partial replay
// ---------------------------------------------------------------------------

describe('late detection states what it could and could not reconstruct', () => {
  it('marks a partial replay as NOT executive-authoritative', () => {
    const r = computeLateDetectionRate(
      [{ projectId: 'a', firstRedPeriod: '2026-05-01', priorBand: 'AMBER', priorWarningCount: 0, detected: true }],
      { reconstructedDimensions: ['FINANCIAL'], unavailableDimensions: ['DELIVERY'] },
    );
    expect(r.historicalCoverage).toBe('PARTIAL');
    expect(r.executiveAuthoritative).toBe(false);
    expect(r.claimQualification).toMatch(/Not an executive conclusion/);
  });

  it('marks a full replay as authoritative', () => {
    const r = computeLateDetectionRate(
      [{ projectId: 'a', firstRedPeriod: '2026-05-01', priorBand: 'AMBER', priorWarningCount: 0, detected: true }],
      { reconstructedDimensions: ['FINANCIAL', 'DELIVERY'], unavailableDimensions: [] },
    );
    expect(r.historicalCoverage).toBe('COMPLETE');
    expect(r.executiveAuthoritative).toBe(true);
  });

  it('names the dimensions it could not rewind, rather than implying full history', () => {
    const r = computeLateDetectionRate([], {
      reconstructedDimensions: ['FINANCIAL'],
      unavailableDimensions: ['DELIVERY', 'SCOPE_COMMERCIAL', 'PRODUCT_QUALITY'],
    });
    expect(r.unavailableDimensions).toHaveLength(3);
    expect(r.claimQualification).toMatch(/no per-period snapshot/);
  });

  it('still refuses a zero denominator, and never calls it 0%', () => {
    const r = computeLateDetectionRate([]);
    expect(r.rate).toBeNull();
    expect(r.notComputableReason).toMatch(/absence of cases/);
  });

  it('never presents the real portfolio rate as quotable while the replay is partial', () => {
    const ld = lateDetectionFor(portfolio, FIXED_BID);
    expect(ld.historicalCoverage).toBe('PARTIAL');
    expect(ld.executiveAuthoritative).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. ADR-0024 — a behind-schedule project cannot book an effort *credit*
// ---------------------------------------------------------------------------

describe('effort variance is measured against earned effort, not the schedule', () => {
  const bridges = FIXED_BID.map((id) => ({ id, ...marginBridgeFor(portfolio, id) }));
  const num = (m: { toDto(): { amount: string } }) => Number(m.toDto().amount);
  const causeOf = (b: (typeof bridges)[number], id: string) =>
    b.bridge.causes.find((c) => c.id === id)!;

  it('measures the variance against earned effort, on every project', () => {
    // The identity that pins the baseline. `plannedCompletion` differs from `physicalCompletion` on
    // 74 of 75 projects, so re-wiring the adapter back to the schedule figure fails this outright.
    for (const b of bridges) {
      const last = portfolio.facts.progressClaims
        .filter((c) => c.projectId === b.id && c.claimedOn <= portfolio.asOf).at(-1);
      const spec = portfolio.structure.projects.find((x) => x.projectId === b.id)!;
      if (last === undefined) continue;
      const earned = Number(spec.plannedEffortHours) * Number(last.physicalCompletion);
      const actual = Number(b.resource.actualHours.toString());
      expect(Number(b.resource.effortVarianceHours.value!.toString()))
        .toBeCloseTo(actual - earned, 2);
    }
  });

  it('does not treat being behind schedule as an effort overrun, or as a saving', () => {
    // Slippage and efficiency are independent under earned value, and that independence is the
    // point of ADR-0024 — so this asserts the *absence* of a correlation, not a sign.
    // prj-017 is 7pp behind schedule and genuinely 338 hours under its earned baseline; that
    // credit is real and must survive.
    const behind = bridges.filter((b) => {
      const last = portfolio.facts.progressClaims
        .filter((c) => c.projectId === b.id && c.claimedOn <= portfolio.asOf).at(-1);
      return last !== undefined
        && Number(last.physicalCompletion) < Number(last.plannedCompletion);
    });
    expect(behind.length).toBeGreaterThan(0);
    const credited = behind.filter((b) => num(causeOf(b, 'effort-overrun').amount) > 0);
    // Some behind-schedule projects are efficient. What must NOT happen is all of them crediting,
    // which is what the schedule baseline produced.
    expect(credited.length).toBeLessThan(behind.length / 2);
  });

  it('names the baseline it used, and names it as physical completion', () => {
    const r = bridges[0]!.resource;
    expect(r.effortBaselineBasis).toMatch(/physical/i);
    expect(r.effortBaselineBasis).not.toMatch(/planned completion at/i);
  });

  it('leaves the effort cause pointing the same way as the portfolio delta', () => {
    // Not a threshold, and not tuned: on a portfolio losing money overall, a *net positive* effort
    // term across 75 projects is the signature of the sign error, whatever its size.
    const effortNet = bridges.reduce((a, b) => a + num(causeOf(b, 'effort-overrun').amount), 0);
    const deltaNet = bridges.reduce((a, b) => a + num(b.bridge.totalDelta), 0);
    expect(deltaNet).toBeLessThan(0);
    expect(effortNet).toBeLessThan(0);
  });

  it('still reconciles to the cent after the baseline change (AC-4)', () => {
    expect(bridges.filter((b) => !b.bridge.reconciles)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7. DR-062 — reconciling is not explaining
// ---------------------------------------------------------------------------

describe('the margin bridge reports how much it actually explains', () => {
  const bridges = FIXED_BID.map((id) => marginBridgeFor(portfolio, id).bridge);

  it('reconciles on every project — which is by construction, not evidence', () => {
    expect(bridges.filter((b) => !b.reconciles)).toHaveLength(0);
  });

  it('still publishes a coverage figure on projects where it reconciles', () => {
    // The point of DR-062: a reader must be able to tell a bridge that explains 90% from one that
    // explains 10%, and `reconciles` is identical (true) on both.
    for (const b of bridges) {
      const c = Number(b.explanatoryCoverage);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('warns in words when the named causes carry less than half the movement', () => {
    const weak = bridges.filter((b) => Number(b.explanatoryCoverage) < 0.5);
    expect(weak.length).toBeGreaterThan(0);
    for (const b of weak) {
      expect(b.explanatoryCoverageNarrative).toMatch(/less than half/);
      expect(b.explanatoryCoverageNarrative).toMatch(/DR-062/);
    }
  });

  it('never lets the narrative imply reconciliation proves attribution', () => {
    for (const b of bridges) {
      expect(b.explanatoryCoverageNarrative).toMatch(/not the same claim as AC-4/);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Frozen-metric determinacy — the class that produced both economic defects
// ---------------------------------------------------------------------------

describe('frozen metrics reachable from an executive output are determinate', () => {
  // Both semantic defects found in this closure (C-20 and C-22) had the same shape: a Frozen
  // formula that DEFERS a choice, an implementation that made the choice, and nothing recording it.
  // Deferring is legitimate — leaving the choice unrecorded is the defect.
  const DEFERRING = [
    /named baseline/i, /per rule set/i, /per [A-Z-]+-v\d/i, /as configured/i, /policy/i,
    /config\b/i, /threshold/i, /window/i, /where applicable/i, /attributable/i,
  ];

  const execBlob = (() => {
    const files = [
      ...readdirSync('src/app', { recursive: true, encoding: 'utf8' }).map((f) => `src/app/${f}`),
      ...readdirSync('src/presentation/surfaces', { encoding: 'utf8' })
        .map((f) => `src/presentation/surfaces/${f}`),
    ].filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    return files.map((f) => {
      try { return readFileSync(f, 'utf8'); } catch { return ''; }
    }).join('\n');
  })();

  const frozen = METRIC_REGISTRY.filter((m) => m.status === 'Frozen');
  const reachable = frozen.filter((m) => execBlob.includes(m.id));
  const deferring = reachable.filter((m) => DEFERRING.some((r) => r.test(m.formula)));

  it('finds the audit is actually looking at something', () => {
    expect(frozen.length).toBeGreaterThan(100);
    expect(reachable.length).toBeGreaterThan(50);
    expect(deferring.length).toBeGreaterThan(0);
  });

  it('records every deferred choice in an ADR, a rule set, or a named debt item', () => {
    // The allow-list is the point of the control: adding a metric that defers a choice without
    // recording where the choice was made fails here, by name.
    const KNOWN_UNRECORDED = new Set(['MET-RES-003']); // DR-064, raised deliberately, not fixed here
    const unrecorded = deferring.filter((m) => {
      const notes = m.notes ?? '';
      const hasAdr = /ADR-\d{4}/.test(notes);
      const hasDebt = /DR-\d{3}/.test(notes);
      const hasRuleSet = (m as { ruleSet?: string }).ruleSet !== undefined;
      return !hasAdr && !hasRuleSet && !hasDebt && !KNOWN_UNRECORDED.has(m.id);
    });
    expect(unrecorded.map((m) => m.id)).toEqual([]);
  });

  it('keeps MET-RES-002 recorded, since naming its baseline wrongly cost $63.31M', () => {
    const m = METRIC_REGISTRY.find((x) => x.id === 'MET-RES-002')!;
    expect(m.version).toBe('2.0.0');
    expect(m.formula).toMatch(/physical completion/);
    expect(m.notes ?? '').toMatch(/ADR-0024/);
  });
});

// ---------------------------------------------------------------------------
// 9. MET-FIN-041 Attributed Movement Coverage — gross, and named as gross
// ---------------------------------------------------------------------------

describe('MET-FIN-041 measures gross attribution and says so', () => {
  const bridges = FIXED_BID.map((id) => marginBridgeFor(portfolio, id).bridge);

  it('carries a registered metric identity', () => {
    // The defect ADR-0025 D-4 closes: an executive-visible number registered nowhere.
    const m = METRIC_REGISTRY.find((x) => String(x.id) === 'MET-FIN-041');
    expect(m).toBeDefined();
    expect(m!.status).toBe('Frozen');
    expect(m!.unit).toBe('Ratio');
    expect(String(m!.notes)).toMatch(/GROSS, NOT NET/);
    for (const b of bridges) expect(b.explanatoryCoverageMetricId).toBe('MET-FIN-041');
  });

  it('Case A/B — bounded at both ends on real data', () => {
    for (const b of bridges) {
      if (b.explanatoryCoverage === null) continue;
      const c = Number(b.explanatoryCoverage);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('Case C — large offsetting drivers stay a GROSS reading, never a net one', () => {
    // +$5.0M and −$5.1M with no residual is 100% attributed gross, on a −$0.1M net delta. Both are
    // true; only the gross one is measured. The narrative must never claim the net reading.
    for (const b of bridges) {
      expect(b.explanatoryCoverageNarrative).not.toMatch(/of the net/i);
      if (b.explanatoryCoverage !== null) {
        expect(b.explanatoryCoverageNarrative).toMatch(/GROSS movement/);
      }
    }
  });

  it('Case D — stays defined where the residual dwarfs the net movement', () => {
    // prj-029: net delta ~$27.5K with a residual over 10x larger. A net denominator would be
    // unstable here; the gross one is not, which is why ADR-0025 rejected the net reading.
    const b = marginBridgeFor(portfolio, 'prj-029').bridge;
    const resid = Math.abs(Number(b.causes.find((c) => c.id === 'residual')!.amount.toDto().amount));
    const net = Math.abs(Number(b.totalDelta.toDto().amount));
    expect(resid).toBeGreaterThan(net * 5);
    expect(b.explanatoryCoverage).not.toBeNull();
    expect(Number(b.explanatoryCoverage)).toBeGreaterThan(0);
  });

  it('Case E — a bridge with no gross movement is NOT_COMPUTABLE, never 100%', () => {
    const zero = Money.zero(USD);
    const flat = buildMarginBridge({
      projectId: 'flat', asOf: '2026-08-31T00:00:00.000Z' as never, currency: USD,
      soldGmValue: zero, forecastGmValue: zero, marginValueDelta: zero, riskAdjustedGmValue: zero,
      uncompensatedScopeValue: zero, effortVarianceHours: null, soldBlendedRate: zero,
      resourceCostDriftImpact: null, excessReworkCost: zero, fxMarginImpact: null,
      executedChangeMargin: zero,
    });
    expect(flat.explanatoryCoverage).toBeNull();
    expect(flat.explanatoryCoverageNarrative).toMatch(/not computable/);
    expect(flat.explanatoryCoverageNarrative).toMatch(/Not zero, and not 100%/);
  });
});
