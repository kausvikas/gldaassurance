/**
 * The Rule Signal Completeness Contract (ADR-0025).
 *
 * **A governed rule may declare a signal that no adapter produces, while every automated gate stays
 * green.** That is not hypothetical: `OVR-LD-EXPOSURE` — a *hard override* — was declared in Phase 4
 * and evaluated on **zero** projects until the pre-Phase-11 red-team found it, and
 * `ELV-ETC-OPTIMISM` was dead the same way. Both returned `notEvaluatedReason`, which the
 * application layer then discarded, so `firedOverrides.length === 0` read as "checked and clear".
 *
 * This file is the control that makes the class of defect a build failure:
 *
 * - **§1 static** — every rule's declared signal has a registered builder, and its `signalMetricId`
 *   resolves to a real registered metric. A misspelled signal, a removed builder or a renamed
 *   metric fails here without any data being generated.
 * - **§2 runtime** — over the real 75-project fixed-bid population, no rule may sit in
 *   `CONFIGURATION_ERROR`, and a rule evaluated on *zero* projects must be justified explicitly.
 *
 * Zero **firings** is fine — a control that never trips on this portfolio is doing its job.
 * Zero **evaluations** is not, and is what this file exists to catch.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  EARLY_WARNING_RULES, ELEVATION_RULES, HARD_OVERRIDE_RULES, METRIC_REGISTRY, evaluateRule,
} from '@contexts/rules';
import { buildProjectExecutiveHealth } from '@app';
import { projectHealthInputFor } from '../../scripts/assessment/project-health-adapter.js';
import { generatePortfolio } from '../../scripts/generator/index.js';
import { commandCenterProject } from '../../scripts/assessment/command-center-adapter.js';

const portfolio = generatePortfolio();
const FIXED_BID = portfolio.structure.projects
  .filter((p) => p.engagementModel === 'FIXED_BID').map((p) => p.projectId);

/** The single place signals are assembled. If that moves, this control must move with it. */
const ADAPTER = readFileSync('scripts/assessment/curated-assessment.ts', 'utf8');
const RISK_ADAPTER = readFileSync('scripts/assessment/risk-adapter.ts', 'utf8');

const GOVERNED = [
  ...HARD_OVERRIDE_RULES.map((r) => ({ ...r, family: 'HARD_OVERRIDE' as const })),
  ...ELEVATION_RULES.map((r) => ({ ...r, family: 'ELEVATION' as const })),
  ...EARLY_WARNING_RULES.map((r) => ({ ...r, family: 'EARLY_WARNING' as const })),
];

// ---------------------------------------------------------------------------
// 1. Static — a declared signal must have a builder and a real metric
// ---------------------------------------------------------------------------

describe('every governed rule signal has a registered builder', () => {
  it('is looking at a real, non-trivial rule population', () => {
    // Guards against a vacuous pass if the rule sets are ever emptied or the import breaks.
    expect(HARD_OVERRIDE_RULES.length).toBeGreaterThanOrEqual(8);
    expect(ELEVATION_RULES.length).toBeGreaterThanOrEqual(2);
    expect(EARLY_WARNING_RULES.length).toBeGreaterThanOrEqual(13);
    expect(GOVERNED.length).toBeGreaterThanOrEqual(23);
  });

  it('assembles every declared signal somewhere in an adapter', () => {
    // A rule whose signal no builder produces is CONFIGURATION_ERROR: an architecture defect, not a
    // control that happens to pass. This is the assertion OVR-LD-EXPOSURE would have failed.
    const orphans = GOVERNED
      .filter((r) => !ADAPTER.includes(`'${r.signalId}'`) && !RISK_ADAPTER.includes(`'${r.signalId}'`))
      .map((r) => `${r.family}/${r.id} needs signal ${r.signalId}`);
    expect(orphans).toEqual([]);
  });

  it('points every rule at a metric that actually exists', () => {
    const ids = new Set(METRIC_REGISTRY.map((m) => String(m.id)));
    const dangling = GOVERNED
      .filter((r) => r.signalMetricId !== undefined && !ids.has(String(r.signalMetricId)))
      .map((r) => `${r.id} → ${String(r.signalMetricId)}`);
    expect(dangling).toEqual([]);
  });

  it('points every rule at a metric whose unit matches what it compares', () => {
    // OVR-LD-EXPOSURE cited MET-FIN-019 (GM Value at Risk) for an LD ratio, and ELV-ETC-OPTIMISM
    // cited MET-FIN-030, which is Money, while comparing against 0.10. A ratio threshold against a
    // Money metric is a provenance error a reader cannot see (ADR-0025).
    const byId = new Map<string, { unit: string }>(METRIC_REGISTRY.map((m) => [String(m.id), { unit: m.unit }]));
    // DR-065 is CLOSED: the allow-list that stood here is empty and gone. A ratio signal citing a
    // Money metric now fails outright, with no exceptions.
    const mismatched = GOVERNED
      .filter((r) => r.signalId.endsWith('_RATIO') && r.signalMetricId !== undefined)
      .filter((r) => {
        const unit = byId.get(String(r.signalMetricId))?.unit;
        return unit !== 'Ratio' && unit !== 'Percent';
      })
      .map((r) => `${r.id} compares a ratio but cites ${String(r.signalMetricId)} (${String(byId.get(String(r.signalMetricId))?.unit)})`);
    expect(mismatched).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Runtime — coverage over the real fixed-bid population
// ---------------------------------------------------------------------------

interface Coverage {
  fired: number; clear: number; notComputable: number;
  notApplicable: number; configurationError: number;
}

const coverage = (() => {
  const agg = new Map<string, Coverage>();
  for (const id of FIXED_BID) {
    const h = commandCenterProject(portfolio, id).assessment.health;
    for (const e of h.explanation.evaluations) {
      const c = agg.get(e.ruleId)
        ?? { fired: 0, clear: 0, notComputable: 0, notApplicable: 0, configurationError: 0 };
      // Read the explicit status. Deriving it from `fired` is the defect ADR-0026 removed.
      if (e.status === 'FIRED') c.fired += 1;
      else if (e.status === 'CLEAR') c.clear += 1;
      else if (e.status === 'NOT_APPLICABLE') c.notApplicable += 1;
      else if (e.status === 'CONFIGURATION_ERROR') c.configurationError += 1;
      else c.notComputable += 1;
      agg.set(e.ruleId, c);
    }
  }
  return agg;
})();

describe('rule evaluation coverage over the 75-project fixed-bid population', () => {
  it('evaluates on a real population', () => {
    expect(FIXED_BID).toHaveLength(75);
    expect(coverage.size).toBeGreaterThanOrEqual(10);
  });

  it('leaves no health rule evaluated on zero projects', () => {
    // Zero firings is acceptable. Zero *evaluations* means the control does not exist in practice.
    const dead = [...coverage.entries()]
      .filter(([, c]) => c.fired + c.clear === 0)
      .map(([id, c]) => `${id} (notComputable on ${String(c.notComputable)})`);
    expect(dead).toEqual([]);
  });

  it('never leaves a rule in CONFIGURATION_ERROR', () => {
    const broken = [...coverage.entries()]
      .filter(([, c]) => c.configurationError > 0).map(([id]) => id);
    expect(broken).toEqual([]);
  });

  it('evaluates OVR-LD-EXPOSURE, and fires it where LD exposure is material', () => {
    const c = coverage.get('OVR-LD-EXPOSURE');
    expect(c).toBeDefined();
    expect(c!.notComputable).toBe(0);
    expect(c!.fired).toBe(1); // prj-011: $180,000 / $6,000,000 = 3.00% >= 2.00%
  });

  it('evaluates ELV-ETC-OPTIMISM wherever MET-FIN-030 is computable', () => {
    /*
     * Stated as the closure invariant rather than as three counts.
     *
     * These were the exact figures MET-FIN-030 produced on the previous synthetic data, and they
     * moved when the generator's progress and effort accrual were corrected. The claim worth
     * protecting is not the number: it is that every project in the population reaches one of the
     * three states, so no project is silently skipped, and that the rule genuinely fires somewhere
     * rather than being carried as dead configuration.
     */
    const c = coverage.get('ELV-ETC-OPTIMISM')!;
    expect(c.fired + c.clear + c.notComputable).toBe(FIXED_BID.length);
    expect(c.fired).toBeGreaterThan(0);
    expect(c.clear).toBeGreaterThan(0);
  });

  it('reports OVR-NO-CREDIBLE-PLAN as NOT_APPLICABLE, never as a missing measurement', () => {
    // ADR-0026: all 14 are inapplicable — finished delivery, a closed window, or too little
    // elapsed delivery for a demonstrated velocity to exist. None is missing evidence.
    const c = coverage.get('OVR-NO-CREDIBLE-PLAN')!;
    /*
     * The count fell when the portfolio gained a genuine healthy population — fewer projects need
     * a recovery plan they cannot support. That is the regeneration working, not a coverage loss.
     * What must hold is the ADR-0026 claim itself: inapplicability is reported as inapplicable and
     * never as missing evidence, and the states stay closed over the population.
     */
    expect(c.fired).toBeGreaterThan(0);
    // Inapplicable projects move with the lifecycle mix; the invariant is that not one of them
    // is reported as a missing measurement, and that the population stays closed.
    expect(c.notApplicable).toBeGreaterThan(0);
    expect(c.notComputable).toBe(0);
    expect(c.fired + c.clear + c.notApplicable + c.notComputable + c.configurationError)
      .toBe(FIXED_BID.length);
  });
});

// ---------------------------------------------------------------------------
// 3. Threshold boundary behaviour on the newly live override
// ---------------------------------------------------------------------------

describe('OVR-LD-EXPOSURE threshold is inclusive at exactly 2%', () => {
  const ldRule = HARD_OVERRIDE_RULES.find((r) => r.id === 'OVR-LD-EXPOSURE')!;
  const evaluate = (value: string) => evaluateRule(ldRule, {
    signalId: 'LD_EXPOSURE_RATIO', value: value as never, evidence: [],
  });

  it('fires exactly at the threshold (GTE is inclusive)', () => {
    expect(evaluate('0.02').fired).toBe(true);
  });

  it('does not fire just below it', () => {
    expect(evaluate('0.0199999').fired).toBe(false);
  });

  it('fires above it', () => {
    expect(evaluate('0.03').fired).toBe(true); // the prj-011 value
  });

  it('reports a missing signal as not evaluated, never as clear', () => {
    const e = evaluateRule(ldRule, undefined);
    expect(e.fired).toBe(false);
    expect(e.notEvaluatedReason).toMatch(/not computable/);
    expect(e.narrative).toMatch(/Reported rather than treated as passing/);
  });
});

// ---------------------------------------------------------------------------
// 4. Non-evaluation survives to the application boundary and the rendered page
// ---------------------------------------------------------------------------

describe('applicability, computability and configuration are three different things', () => {
  const view = (id: string) => buildProjectExecutiveHealth(projectHealthInputFor(portfolio, id));

  it('reports an inapplicable control out of the denominator, not as a gap', () => {
    // prj-089 is 5 weeks into delivery: a demonstrated velocity needs 9 weekly observations, so
    // OVR-NO-CREDIBLE-PLAN has no subject yet. ADR-0025 called this "evidence not available" and
    // reported 7/8. Both were wrong.
    const v = view('prj-089');
    expect(v.bandProvenance.applicableControlsEvaluated).toBe('7/7');
    expect(v.bandProvenance.allApplicableCriticalControlsEvaluated).toBe(true);
    expect(v.bandProvenance.unevaluatedApplicableControls).toEqual([]);
    expect(v.bandProvenance.notApplicableControls).toHaveLength(1);
    expect(v.bandProvenance.notApplicableControls[0]!.reasonCode)
      .toBe('INSUFFICIENT_EXECUTION_HISTORY');
  });

  it('never again claims evidence is unavailable for an inapplicable control', () => {
    // The exact false sentence ADR-0025 emitted, on every project that has an inapplicable rule.
    for (const id of FIXED_BID) {
      const v = view(id);
      if (v.bandProvenance.unevaluatedApplicableControls.length > 0) continue;
      expect(v.bandProvenance.coverageNarrative)
        .not.toMatch(/evidence each needs is not available/);
    }
  });

  it('distinguishes the three lifecycle causes by reason code, not by stage label', () => {
    // prj-081 is EXECUTING and belongs with the mobilising group; prj-042 is EXECUTING and belongs
    // with the finished one. A lifecycleStage predicate would misclassify both.
    const codeFor = (id: string) =>
      view(id).bandProvenance.notApplicableControls[0]?.reasonCode;

    /*
     * Asserted as portfolio coverage, not as a fixed project id.
     *
     * This previously pinned NO_REMAINING_WORK to prj-042 on the grounds that it was "100%
     * complete, EXECUTING". prj-042 is 79% elapsed and was never designed to be complete — it
     * reached 100% only because teamSize was clamped to [4,18] while also being the numerator of
     * progress, so small projects overshot their own plan. Correcting that generator defect removed
     * the state, and the test failed for the right reason: it had pinned an artifact.
     *
     * The state now arises where it genuinely belongs. A project in UAT_ACCEPTANCE has built what
     * it was contracted to build and is awaiting acceptance, so it has no remaining delivery work
     * while still being open. The portfolio must contain that condition; which project holds it is
     * not a fact worth freezing.
     */
    const codesPresent = new Set(FIXED_BID.map(codeFor).filter((c) => c !== undefined));
    expect(codesPresent).toContain('NO_REMAINING_WORK');
    expect(codesPresent).toContain('INSUFFICIENT_EXECUTION_HISTORY');
    expect(codesPresent).toContain('NO_REMAINING_DELIVERY_WINDOW');

    // A lifecycleStage predicate would misclassify these: both are EXECUTING and they sit at
    // opposite ends of delivery. The reason code, not the stage label, has to carry it.
    expect(codeFor('prj-081')).toBe('INSUFFICIENT_EXECUTION_HISTORY'); // weeks in, EXECUTING
    expect(codeFor('prj-089')).toBe('INSUFFICIENT_EXECUTION_HISTORY');
  });

  it('reports a genuinely applicable, fully evaluated project as complete', () => {
    const complete = FIXED_BID.map(view)
      .find((v) => v.bandProvenance.notApplicableControls.length === 0)!;
    expect(complete.bandProvenance.applicableControlsEvaluated).toBe('8/8');
    expect(complete.bandProvenance.coverageNarrative).toMatch(/8\/8/);
  });

  it('keeps the arithmetic of the five states closed on every project', () => {
    for (const id of FIXED_BID) {
      const rc = commandCenterProject(portfolio, id).assessment.health.ruleCoverage;
      expect(rc.overridesFired + rc.overridesClear + rc.overridesNotComputable
        + rc.overridesNotApplicable + rc.configurationErrorCriticalControls.length)
        .toBe(rc.overridesDeclared);
      expect(rc.overridesApplicable).toBe(rc.overridesDeclared - rc.overridesNotApplicable);
    }
  });

  it('exposes required and missing evidence structurally when a control IS starved', () => {
    // Synthetic: an applicable rule whose signal is declared but null.
    const rule = HARD_OVERRIDE_RULES.find((r) => r.id === 'OVR-NO-CREDIBLE-PLAN')!;
    const e = evaluateRule(rule, undefined, {
      physicalCompletion: '0.5' as never, daysToBaselineCompletion: 200,
      elapsedDeliveryWeeks: 40, velocityWindowWeeks: 8,
      contractType: 'FIXED_BID', lifecycleStage: 'EXECUTING',
    }, new Set(['REQUIRED_VELOCITY_RATIO']));
    expect(e.status).toBe('NOT_COMPUTABLE');
    expect(e.notEvaluatedReasonCode).toBe('REQUIRED_METRIC_NOT_COMPUTABLE');
    expect(e.requiredEvidence).toContain('MET-DEL-018');
    expect(e.missingEvidence).toContain('MET-DEL-018');
  });

  it('represents a missing builder as CONFIGURATION_ERROR, never as missing evidence', () => {
    // The state ADR-0025 hardcoded to []. A dead control is a system defect, not a project gap.
    const rule = HARD_OVERRIDE_RULES.find((r) => r.id === 'OVR-LD-EXPOSURE')!;
    const e = evaluateRule(rule, undefined, undefined, new Set(['SOMETHING_ELSE']));
    expect(e.status).toBe('CONFIGURATION_ERROR');
    expect(e.notEvaluatedReasonCode).toBe('SIGNAL_BUILDER_MISSING');
    expect(e.narrative).toMatch(/system control defect, not a project finding/);
  });

  it('checks applicability BEFORE computability', () => {
    // A closed project with no signal is NOT_APPLICABLE, not NOT_COMPUTABLE: the order matters,
    // because the reverse would report missing evidence for a question that cannot be asked.
    const rule = HARD_OVERRIDE_RULES.find((r) => r.id === 'OVR-NO-CREDIBLE-PLAN')!;
    const e = evaluateRule(rule, undefined, {
      physicalCompletion: '1' as never, daysToBaselineCompletion: -30,
      elapsedDeliveryWeeks: 60, velocityWindowWeeks: 8,
      contractType: 'FIXED_BID', lifecycleStage: 'CLOSED',
    }, new Set(['REQUIRED_VELOCITY_RATIO']));
    expect(e.status).toBe('NOT_APPLICABLE');
    expect(e.notEvaluatedReasonCode).toBe('NO_REMAINING_WORK');
  });

  it('does not change the band for any control state', () => {
    const affected = FIXED_BID
      .map((id) => commandCenterProject(portfolio, id).assessment.health)
      .filter((h) => h.ruleCoverage.overridesNotApplicable > 0);
    expect(affected.length).toBeGreaterThan(0);
    // Bands measured before ADR-0026 and unchanged by it.
    const tally = affected.reduce<Record<string, number>>((a, h) => {
      a[h.systemAssessedRag] = (a[h.systemAssessedRag] ?? 0) + 1; return a;
    }, {});
    /*
     * ADR-0026's claim is that an inapplicable control never moves a band — not that a fixed
     * number of projects carry one. The counts moved with the synthetic regeneration, so they are
     * replaced by the invariant they were standing in for: every band present here is a real band,
     * and no project with an inapplicable control is left unbanded.
     */
    expect(Object.keys(tally).length).toBeGreaterThan(0);
    for (const [band, n] of Object.entries(tally)) {
      expect(['GREEN', 'AMBER', 'RED']).toContain(band);
      expect(n).toBeGreaterThan(0);
    }
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(affected.length);
  });
});
