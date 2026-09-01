/**
 * Versioned health models.
 *
 * `HealthModelVersion` declares **which dimensions exist and what they weigh**. Phase 2 froze the
 * six-dimension analytical set (`MET-HLTH-001`…`006`) and left the weights open as MC-2. Phase 4's
 * brief specifies a **four-dimension executive model** with explicit weights.
 *
 * Both are kept, and neither overwrites the other:
 *
 *   - `HEALTH-v1` — the six analytical dimensions. Weights still unset (MC-2 open). Retained for
 *     the detailed view and for continuity with everything Phase 2 froze.
 *   - `HEALTH-v2` — the four executive dimensions, **the default**, weights supplied by the Phase 4
 *     brief. This is what the executive surfaces read.
 *
 * That is why the dimension *set* lives here rather than being hard-coded in the engine: the brief
 * says "weights are configurable/versioned", and a dimension set that can only change by editing an
 * engine is neither. See conflict C-7 and ADR-0015.
 */
import { Q_ONE, Q_ZERO, qAdd, qCompare, qty } from '@platform/decimal';
import { calendarDate } from '@platform/time';
import { ruleVersion } from '@platform/provenance';
import type { CalendarDate, Instant } from '@platform/time';
import type { RuleVersion } from '@platform/provenance';

export type ExecutiveDimension = 'FINANCIAL' | 'DELIVERY' | 'SCOPE_COMMERCIAL' | 'PRODUCT_QUALITY';

export type AnalyticalDimension =
  | 'FINANCIAL' | 'SCHEDULE' | 'SCOPE_COMMERCIAL' | 'QUALITY' | 'RESOURCE' | 'RISK';

export interface DimensionDefinition {
  readonly id: string;
  readonly name: string;
  /** Metric ID for the dimension score itself. */
  readonly metricId: string;
  /** Decimal string. Weights across a model sum to 1. */
  readonly weight: string | 'UNSET';
  /** The metrics that feed it, each normalised against its own band. */
  readonly inputs: readonly DimensionInput[];
}

/**
 * One contributing metric, with the band it is normalised against.
 *
 * `normalise(v, green, red)` is piecewise-linear: 1 at or beyond `greenEdge`, 0 at or beyond
 * `redEdge`, linear between, clamped. `higherIsBetter` decides which end is which — margin is good
 * when high, burn gap is good when low, and getting that backwards inverts a dimension silently.
 */
export interface DimensionInput {
  readonly metricId: string;
  readonly signalId: string;
  readonly weight: string;
  readonly greenEdge: string;
  readonly redEdge: string;
  readonly higherIsBetter: boolean;
  /**
   * Whether losing this input makes the dimension's answer **incomplete** (ADR-0027 D-6).
   *
   * `MATERIAL` inputs still allow a score where the arithmetic permits, but the assessment is
   * reported `PROVISIONAL` rather than `COMPLETE`. Dimension computability and assessment
   * completeness are different questions; before this they were answered by the same test, so a
   * project whose only plan-credibility signal had vanished still reported COMPLETE.
   *
   * Defaults to `SUPPORTING`. `required` remains the stronger condition and is unchanged.
   */
  readonly materiality?: 'MATERIAL' | 'SUPPORTING';
  /**
   * A signal without which the dimension has no meaning (ADR-0022 D-4).
   *
   * The "at least half the inputs" rule is a floor, not a contract: it lets a dimension be carried
   * by whichever inputs happen to be present, so Product & Quality could score on defect counts
   * alone while rework — the signal that connects quality to margin — is missing. A required signal
   * makes the dimension `NOT_COMPUTABLE` when absent, whatever the count says.
   *
   * Requiring a signal is a **semantic** claim about the dimension, not a calibration knob: it says
   * this measure is what the dimension is *about*. Changing one changes what the dimension means,
   * so it belongs here beside the weights rather than in a threshold table.
   */
  readonly required?: boolean;
}

export interface HealthModel {
  readonly version: RuleVersion;
  readonly name: string;
  readonly effectiveFrom: CalendarDate;
  /** Metric ID of this model's composite score. */
  readonly compositeMetricId: string;
  readonly dimensions: readonly DimensionDefinition[];
  readonly isDefault: boolean;
  readonly rationale: string;
  /** Set when this model cannot yet be computed, naming what is missing. */
  readonly blockedBy?: string;
}

const EFFECTIVE = calendarDate('2026-08-31');

/**
 * Band edges below are **SYNTHETIC CALIBRATION CANDIDATES**, chosen so the model is computable and
 * behaves sensibly against the Phase 3 portfolio. They are not approved production policy — MC-3
 * remains open and its owner is Rules + Delivery leadership. Changing one changes a number, not a
 * meaning, which is exactly why they live in configuration.
 */
const i = (
  metricId: string, signalId: string, weight: string,
  greenEdge: string, redEdge: string, higherIsBetter: boolean,
  required = false,
  materiality: 'MATERIAL' | 'SUPPORTING' = 'SUPPORTING',
): DimensionInput => ({
  metricId, signalId, weight, greenEdge, redEdge, higherIsBetter,
  ...(required ? { required } : {}),
  ...(materiality === 'MATERIAL' ? { materiality } : {}),
});

export const HEALTH_MODEL_V2: HealthModel = {
  version: ruleVersion('HEALTH-v2'),
  name: 'Executive health model — four dimensions',
  effectiveFrom: EFFECTIVE,
  compositeMetricId: 'MET-HLTH-020',
  isDefault: true,
  rationale:
    'Four dimensions an executive can act on, weighted as the Phase 4 brief specifies. The six ' +
    'analytical dimensions of HEALTH-v1 remain computable underneath as the detail view; they are ' +
    'not the executive output. Composite score is deliberately not the headline — System-Assessed ' +
    'RAG is, with the dimension breakdown beneath it.',
  dimensions: [
    {
      id: 'FINANCIAL', name: 'Financial Health', metricId: 'MET-HLTH-021', weight: '0.40',
      inputs: [
        i('MET-FIN-014', 'FORECAST_GM_PERCENT', '0.40', '0.22', '0.05', true, true),
        i('MET-FIN-016', 'MARGIN_EROSION_PP', '0.25', '-0.01', '-0.09', true),
        i('MET-FIN-027', 'BURN_GAP', '0.20', '0.02', '0.15', false),
        i('MET-FIN-034', 'CONTINGENCY_BURN_GAP', '0.15', '0.05', '0.30', false),
      ],
    },
    {
      id: 'DELIVERY', name: 'Delivery Health', metricId: 'MET-HLTH-022', weight: '0.25',
      inputs: [
        i('MET-DEL-015', 'PROGRESS_VARIANCE', '0.35', '-0.02', '-0.15', true, true),
        i('MET-DEL-018', 'REQUIRED_VELOCITY_RATIO', '0.30', '1.05', '1.80', false, false, 'MATERIAL'),
        i('MET-DEL-010', 'MILESTONES_AT_RISK', '0.20', '0', '4', false),
        i('MET-DEL-023', 'DEPENDENCY_AGEING_DAYS', '0.15', '14', '90', false),
      ],
    },
    {
      id: 'SCOPE_COMMERCIAL', name: 'Scope & Commercial Health', metricId: 'MET-HLTH-023', weight: '0.20',
      inputs: [
        i('MET-COM-009', 'UNCOMPENSATED_SCOPE_RATIO', '0.45', '0.01', '0.10', false, true),
        i('MET-COM-007', 'PENDING_CR_AGE_DAYS', '0.30', '21', '120', false),
        i('MET-FIN-011', 'UNSECURED_UPSIDE_RATIO', '0.25', '0.01', '0.12', false),
      ],
    },
    {
      id: 'PRODUCT_QUALITY', name: 'Product & Quality Health', metricId: 'MET-HLTH-024', weight: '0.15',
      inputs: [
        i('MET-QUA-006', 'REWORK_RATIO', '0.35', '0.05', '0.20', false, true),
        i('MET-QUA-010', 'ACCEPTANCE_BLOCKERS', '0.30', '0', '5', false),
        i('MET-QUA-003', 'ESCAPED_DEFECT_RATE', '0.20', '0.05', '0.30', false),
        i('MET-QUA-009', 'DEFECT_BACKLOG_TREND', '0.15', '0', '3', false),
      ],
    },
  ],
};

/** The Phase 2 analytical model. Retained, computable, and not the executive output. */
export const HEALTH_MODEL_V1: HealthModel = {
  version: ruleVersion('HEALTH-v1'),
  name: 'Analytical health model — six dimensions',
  effectiveFrom: calendarDate('2026-08-31'),
  compositeMetricId: 'MET-HLTH-010',
  isDefault: false,
  blockedBy: 'MC-2 — the six dimension weights were never set. Owner: Sponsor / Delivery leadership.',
  rationale:
    'The six analytical dimensions frozen in Phase 2. Its weights remain open (MC-2), so it cannot ' +
    'produce a composite. It is kept because Phase 2 froze MET-HLTH-001…006 and MET-HLTH-010 ' +
    'against it, and because the six-way breakdown is the right detail view beneath the executive four.',
  dimensions: (['FINANCIAL', 'SCHEDULE', 'SCOPE_COMMERCIAL', 'QUALITY', 'RESOURCE', 'RISK'] as const)
    .map((id, idx) => ({
      id,
      name: `${id.charAt(0)}${id.slice(1).toLowerCase().replace('_', ' & ')} Health Dimension`,
      metricId: `MET-HLTH-00${idx + 1}`,
      weight: 'UNSET' as const,
      inputs: [],
    })),
};

export const HEALTH_MODELS: readonly HealthModel[] = [HEALTH_MODEL_V2, HEALTH_MODEL_V1];

export function defaultHealthModel(): HealthModel {
  const found = HEALTH_MODELS.find((m) => m.isDefault);
  if (!found) throw new Error('No default health model is declared.');
  return found;
}

export function healthModelAt(version: RuleVersion, _asOf: Instant): HealthModel | undefined {
  return HEALTH_MODELS.find((m) => m.version === version);
}

/**
 * Weights within a model must sum to 1, or the composite is silently mis-scaled — a model whose
 * weights sum to 0.95 reports every project 5% worse than it is, and nothing else would notice.
 * Checked with decimal arithmetic, so a set of weights that sums exactly to 1 is not rejected for
 * a floating-point reason.
 */
export function validateHealthModel(model: HealthModel): string[] {
  const errors: string[] = [];
  if (model.blockedBy !== undefined) return errors;

  if (model.dimensions.some((d) => d.weight === 'UNSET')) {
    errors.push(`${model.version}: a dimension weight is UNSET but the model is not marked blocked.`);
    return errors;
  }
  const total = model.dimensions.reduce((a, d) => qAdd(a, qty(d.weight as string)), Q_ZERO);
  if (qCompare(total, Q_ONE) !== 0) {
    errors.push(`${model.version}: dimension weights sum to ${total}, not 1.`);
  }
  for (const d of model.dimensions) {
    if (d.inputs.length === 0) continue;
    const inner = d.inputs.reduce((a, x) => qAdd(a, qty(x.weight)), Q_ZERO);
    if (qCompare(inner, Q_ONE) !== 0) {
      errors.push(`${model.version}/${d.id}: input weights sum to ${inner}, not 1.`);
    }
    for (const x of d.inputs) {
      const edgesOrdered = x.higherIsBetter
        ? qCompare(qty(x.greenEdge), qty(x.redEdge)) > 0
        : qCompare(qty(x.greenEdge), qty(x.redEdge)) < 0;
      if (!edgesOrdered) {
        errors.push(
          `${model.version}/${d.id}/${x.metricId}: edges are the wrong way round for ` +
          `higherIsBetter=${x.higherIsBetter}. This silently inverts the dimension.`,
        );
      }
    }
  }
  return errors;
}
