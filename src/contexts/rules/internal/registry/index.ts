/**
 * The metric registry — one definition per metric, for the whole system.
 *
 * `METRIC_CATALOG.md` §1.1 rule 2: "One definition, one implementation, one owner context."
 * `validateRegistry()` below is what makes that checkable rather than aspirational, and it runs in
 * the test suite on every commit.
 */
import { type MetricDefinition, type MetricId } from '../metric-types.js';
import { FINANCIAL_METRICS } from './financial.js';
import { DELIVERY_METRICS } from './delivery.js';
import {
  COMMERCIAL_METRICS, QUALITY_METRICS, RESOURCE_METRICS, RISK_METRICS,
} from './commercial-quality-resource-risk.js';
import {
  HEALTH_METRICS, FORECAST_METRICS, DATA_QUALITY_METRICS, PORTFOLIO_METRICS,
} from './health-forecast-dq-portfolio.js';
import {
  EXECUTIVE_HEALTH_METRICS, PHASE4_FORECAST_METRICS, PHASE4_DATA_QUALITY_METRICS, RECOVERY_METRICS,
} from './phase4.js';

export const METRIC_REGISTRY: readonly MetricDefinition[] = [
  ...FINANCIAL_METRICS,
  ...COMMERCIAL_METRICS,
  ...DELIVERY_METRICS,
  ...QUALITY_METRICS,
  ...RESOURCE_METRICS,
  ...RISK_METRICS,
  ...HEALTH_METRICS,
  ...EXECUTIVE_HEALTH_METRICS,
  ...FORECAST_METRICS,
  ...PHASE4_FORECAST_METRICS,
  ...DATA_QUALITY_METRICS,
  ...PHASE4_DATA_QUALITY_METRICS,
  ...RECOVERY_METRICS,
  ...PORTFOLIO_METRICS,
];

const BY_ID = new Map<string, MetricDefinition>(METRIC_REGISTRY.map((m) => [m.id, m]));

export function findMetric(id: MetricId | string): MetricDefinition | undefined {
  return BY_ID.get(id);
}

export function metricsOwnedBy(context: string): readonly MetricDefinition[] {
  return METRIC_REGISTRY.filter((m) => m.sourceDomain === context);
}

export interface RegistryViolation {
  readonly code:
    | 'DUPLICATE_ID'
    | 'DUPLICATE_FORMULA'
    | 'UNKNOWN_INPUT_METRIC'
    | 'SELF_REFERENCE'
    | 'CYCLE'
    | 'UNNAMED_BASELINE'
    | 'MISSING_EVIDENCE_EXPECTATION'
    | 'FROZEN_DEPENDS_ON_DRAFT'
    | 'MISSING_EPISTEMIC_LEVEL'
    | 'MISSING_AUTHORITATIVE_SOURCE'
    | 'OBSERVED_FACT_CLAIMED_AS_DERIVED'
    | 'DERIVED_CLAIMS_EXTERNAL_AUTHORITY'
    | 'DERIVED_DEPENDS_ON_ASSESSMENT'
    | 'UNNAMED_CALIBRATION'
    | 'DRAFT_WITHOUT_SEMANTIC_REASON';
  readonly metricId: string;
  readonly detail: string;
}

const METRIC_REF = /^MET-[A-Z]+-\d{3}$/;

/** Metric IDs a metric depends on, ignoring L1 fact references like `contract:AsSoldBaseline`. */
export function metricInputsOf(m: MetricDefinition): string[] {
  return m.inputs.filter((i) => METRIC_REF.test(i));
}

/**
 * The acceptance-gate check: no duplicate or conflicting definition exists anywhere in the repo.
 *
 * A "duplicate formula" is two metrics computing the same expression from the same inputs. That is
 * how drift begins — two IDs, one meaning, and eventually two implementations that disagree.
 */
export function validateRegistry(): RegistryViolation[] {
  const out: RegistryViolation[] = [];
  const seenIds = new Set<string>();
  const byFormula = new Map<string, string[]>();

  for (const m of METRIC_REGISTRY) {
    if (seenIds.has(m.id)) {
      out.push({ code: 'DUPLICATE_ID', metricId: m.id, detail: 'Metric ID appears more than once.' });
    }
    seenIds.add(m.id);

    // Normalised formula, so whitespace differences do not hide a duplicate.
    const key = `${m.formula.replace(/\s+/g, ' ').trim()}::${[...m.inputs].sort().join(',')}`;
    byFormula.set(key, [...(byFormula.get(key) ?? []), m.id]);

    for (const input of metricInputsOf(m)) {
      if (input === m.id) {
        out.push({ code: 'SELF_REFERENCE', metricId: m.id, detail: 'Metric lists itself as an input.' });
      } else if (!BY_ID.has(input)) {
        out.push({ code: 'UNKNOWN_INPUT_METRIC', metricId: m.id, detail: `Input "${input}" is not a registered metric.` });
      }
    }

    // --- Phase 2 closure, Decisions 6 and 7 ---------------------------------
    if (!['L1_OBSERVED', 'L2_DERIVED', 'L3_ASSESSED'].includes(m.epistemicLevel)) {
      out.push({ code: 'MISSING_EPISTEMIC_LEVEL', metricId: m.id, detail: 'Every metric must declare what kind of claim it is.' });
    }
    if (!m.authoritativeSourceType) {
      out.push({ code: 'MISSING_AUTHORITATIVE_SOURCE', metricId: m.id, detail: 'Every metric must name the system that is authoritative for it.' });
    }
    // An observed fact comes from somewhere. Claiming DERIVED authority for one means Delivery
    // Intelligence is inventing a fact it should be consuming — the exact failure OQ-2 closed.
    if (m.epistemicLevel === 'L1_OBSERVED' && ['DERIVED', 'RULE_ENGINE'].includes(m.authoritativeSourceType)) {
      out.push({
        code: 'OBSERVED_FACT_CLAIMED_AS_DERIVED', metricId: m.id,
        detail: `L1_OBSERVED must name a real source system, not "${m.authoritativeSourceType}". Delivery Intelligence consumes facts; it does not author them.`,
      });
    }
    // The converse: a derived value may not claim to come from an external system of record.
    if (m.epistemicLevel === 'L2_DERIVED' && m.authoritativeSourceType !== 'DERIVED') {
      out.push({
        code: 'DERIVED_CLAIMS_EXTERNAL_AUTHORITY', metricId: m.id,
        detail: `L2_DERIVED must declare DERIVED authority, not "${m.authoritativeSourceType}".`,
      });
    }
    if (m.epistemicLevel === 'L3_ASSESSED' && m.authoritativeSourceType !== 'RULE_ENGINE') {
      out.push({
        code: 'DERIVED_CLAIMS_EXTERNAL_AUTHORITY', metricId: m.id,
        detail: `L3_ASSESSED must declare RULE_ENGINE authority, not "${m.authoritativeSourceType}".`,
      });
    }
    // --- Phase 2 closure, Decision 8 ----------------------------------------
    // A metric parameterised by a rule set must name which parameters, so the boundary between
    // "settled meaning" and "open calibration" is explicit rather than implied.
    if (m.ruleSet !== undefined && m.calibrationParameters === undefined) {
      out.push({
        code: 'UNNAMED_CALIBRATION', metricId: m.id,
        detail: `Declares rule set "${m.ruleSet}" but names no calibration parameters. If none are read, declare an empty list.`,
      });
    }
    // --- Phase 2 closure, exit criterion 4 ----------------------------------
    // A Draft metric must state a genuine semantic gap, not merely await a number.
    if (m.status === 'Draft' && !/Type A/i.test(m.notes ?? '')) {
      out.push({
        code: 'DRAFT_WITHOUT_SEMANTIC_REASON', metricId: m.id,
        detail: 'A metric may be Draft only while its meaning is unresolved. Say which Type A gap it is and who owns it, or freeze it and move the calibration into a rule set.',
      });
    }

    if (m.evidenceExpectations.length === 0) {
      out.push({
        code: 'MISSING_EVIDENCE_EXPECTATION', metricId: m.id,
        detail: 'Every metric must state what evidence makes a value of it defensible (AC-3, REQ-DATA-010).',
      });
    }

    // §1.1 rule 6 — a variance with no named baseline is a defect.
    if (/variance|erosion|drift|delta|at risk/i.test(m.name) && m.baseline === undefined) {
      out.push({
        code: 'UNNAMED_BASELINE', metricId: m.id,
        detail: `"${m.name}" reads as a variance but names no baseline.`,
      });
    }

    for (const input of metricInputsOf(m)) {
      const dep = BY_ID.get(input);
      if (!dep) continue;
      // A frozen definition resting on a draft one is frozen in name only.
      if (m.status === 'Frozen' && dep.status === 'Draft') {
        out.push({
          code: 'FROZEN_DEPENDS_ON_DRAFT', metricId: m.id,
          detail: `Frozen metric depends on ${input}, which is still Draft.`,
        });
      }
      // A deterministic derived value may not rest on a judgement. If it does, it is a judgement.
      if (m.epistemicLevel !== 'L3_ASSESSED' && dep.epistemicLevel === 'L3_ASSESSED') {
        out.push({
          code: 'DERIVED_DEPENDS_ON_ASSESSMENT', metricId: m.id,
          detail: `${m.epistemicLevel} metric depends on ${input}, which is L3_ASSESSED. Counting or combining assessments produces an assessment.`,
        });
      }
    }
  }

  for (const [key, ids] of byFormula) {
    if (ids.length > 1) {
      out.push({
        code: 'DUPLICATE_FORMULA', metricId: ids.join(' / '),
        detail: `Identical formula and inputs — one definition, one implementation (§1.1 rule 2). Key: ${key}`,
      });
    }
  }

  // Dependency cycles: a metric cannot be defined in terms of itself, however indirectly.
  const state = new Map<string, 'open' | 'closed'>();
  const stack: string[] = [];
  const visit = (id: string): void => {
    state.set(id, 'open');
    stack.push(id);
    for (const next of metricInputsOf(BY_ID.get(id) as MetricDefinition)) {
      if (!BY_ID.has(next)) continue;
      if (state.get(next) === 'open') {
        out.push({
          code: 'CYCLE', metricId: id,
          detail: `Definition cycle: ${[...stack.slice(stack.indexOf(next)), next].join(' -> ')}`,
        });
      } else if (!state.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    state.set(id, 'closed');
  };
  for (const m of METRIC_REGISTRY) if (!state.has(m.id)) visit(m.id);

  return out;
}

export { METRIC_VERSION_HISTORY, PHASE_2_DEFINITION_REFINEMENTS } from './versions.js';
