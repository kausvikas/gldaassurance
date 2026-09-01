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
    const c = coverage.get('ELV-ETC-OPTIMISM')!;
    expect(c.fired + c.clear).toBe(57); // the exact MET-FIN-030 computability measured on this data
    expect(c.notComputable).toBe(18);
    expect(c.fired).toBe(7);
  });

  it('reports OVR-NO-CREDIBLE-PLAN as NOT_APPLICABLE, never as a missing measurement', () => {
    // ADR-0026: all 14 are inapplicable — finished delivery, a closed window, or too little
    // elapsed delivery for a demonstrated velocity to exist. None is missing evidence.
    const c = coverage.get('OVR-NO-CREDIBLE-PLAN')!;
    expect(c.fired).toBe(33);
    expect(c.notApplicable).toBe(14);
    expect(c.notComputable).toBe(0);
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
    expect(codeFor('prj-042')).toBe('NO_REMAINING_WORK');          // 100% complete, EXECUTING
    expect(codeFor('prj-081')).toBe('INSUFFICIENT_EXECUTION_HISTORY'); // 5 weeks in, EXECUTING
    expect(codeFor('prj-033')).toBe('NO_REMAINING_DELIVERY_WINDOW');   // CLOSED, past its date
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
    expect(tally['RED']).toBe(6);
    expect(tally['AMBER']).toBe(8);
  });
});
