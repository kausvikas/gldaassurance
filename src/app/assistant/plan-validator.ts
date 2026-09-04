/**
 * The query-plan validator (ADR-0034 §4, §22 of the Phase 13 contract).
 *
 * Every plan is validated before any tool runs, whatever produced it — the deterministic planner,
 * a model proposal, or a conversational refinement. There is no path from planner to tool that
 * skips this function, and that is asserted by test rather than by convention.
 *
 * ## What this is actually protecting against
 *
 * Not "a malicious plan", mostly. A model that has read a poisoned document will propose a plan for
 * data the caller is entitled to, which is harmless. The realistic failures are duller and worse:
 *
 *   - a plan referencing a **metric the catalogue does not define**, which would render a figure
 *     under a label nothing computes — the semantic defect class this product exists to catch;
 *   - a plan whose **filter value is not in the governed vocabulary**, which silently selects an
 *     empty population and reads as "nothing matches" rather than "that word means nothing here";
 *   - a plan with an **unbounded limit**, which is how a bounded answer becomes a data export;
 *   - a plan whose **scope exceeds the caller's**, which authorisation would catch downstream but
 *     which should never have been executable in the first place.
 *
 * ## Rejection, never repair
 *
 * A rejected plan is discarded. It is not clamped, defaulted or partially honoured, because a
 * repaired plan answers a question nobody asked while looking like it answered the one they did —
 * and the reader has no way to tell. The only exception is stated where it happens: an out-of-range
 * limit on an otherwise valid plan is rejected too, for the same reason.
 */
import type {
  Band, GroupSelector, MetricSelector, PlanShape, QueryPlan, SortSelector, TimeSelector,
  TrajectoryState,
} from '@contexts/ai-intelligence';
import {
  ALL_BANDS, ALL_COMPARISONS, ALL_DRIVERS, ALL_FINDINGS, ALL_GROUPS, ALL_METRICS, ALL_SHAPES,
  ALL_SORTS, ALL_TIMES, ALL_TRAJECTORIES, LIMIT_MAX, LIMIT_MIN, requiresProject,
} from '@contexts/ai-intelligence';
import type { PlannerVocabulary } from './planner.js';

/** Stable codes. Audited, so they may not be renamed casually. */
export type PlanRejectionCode =
  | 'UNKNOWN_SHAPE'
  | 'UNKNOWN_METRIC'
  | 'UNKNOWN_FILTER_VALUE'
  | 'UNKNOWN_SORT'
  | 'UNKNOWN_TIME'
  | 'UNKNOWN_COMPARISON'
  | 'UNKNOWN_GROUP'
  | 'LIMIT_OUT_OF_RANGE'
  | 'PROJECT_REQUIRED'
  | 'PROJECT_NOT_AUTHORISED'
  | 'SCOPE_EXCEEDS_CALLER'
  | 'MALFORMED_METRIC_ID'
  | 'MALFORMED_THRESHOLD'
  | 'MUTATION_NOT_SUPPORTED'
  | 'EXECUTABLE_CONTENT'
  | 'TOO_MANY_FILTER_VALUES'
  | 'EVIDENCE_QUERY_TOO_LONG';

export interface PlanRejection {
  readonly code: PlanRejectionCode;
  readonly field: string;
  /** What the reader is told. Names the governed vocabulary rather than the internal field. */
  readonly detail: string;
}

export type PlanVerdict =
  | { readonly ok: true; readonly plan: QueryPlan }
  | { readonly ok: false; readonly rejections: readonly PlanRejection[] };

export interface ValidationContext {
  readonly vocabulary: PlannerVocabulary;
  /** The set the enforcement point resolved. A plan may narrow it and can never widen it. */
  readonly authorisedProjectIds: readonly string[];
  /** Metric ids the catalogue actually defines. */
  readonly knownMetricIds: readonly string[];
}

/** Anything that looks like code, a query or markup. Present in a plan, it is a rejection. */
const EXECUTABLE_SHAPE =
  /(\bselect\b[\s\S]{0,40}\bfrom\b|\bdrop\s+table\b|\bunion\s+select\b|--\s|;\s*delete|<script|javascript:|\$\{|\bfunction\s*\(|=>|\beval\s*\()/i;

const MAX_FILTER_VALUES = 12;
const MAX_EVIDENCE_QUERY_CHARS = 500;

export function validatePlan(plan: QueryPlan, context: ValidationContext): PlanVerdict {
  const rejections: PlanRejection[] = [];
  const reject = (code: PlanRejectionCode, field: string, detail: string): void => {
    rejections.push({ code, field, detail });
  };

  if (!ALL_SHAPES.includes(plan.shape)) {
    reject('UNKNOWN_SHAPE', 'shape', `"${String(plan.shape)}" is not a question this product answers.`);
  }

  for (const metric of plan.metrics) {
    if (!ALL_METRICS.includes(metric)) {
      reject('UNKNOWN_METRIC', 'metrics',
        `"${String(metric)}" is not a governed metric. A plan selects metrics the catalogue defines; `
        + 'it cannot introduce one.');
    }
  }
  if (!ALL_SORTS.includes(plan.sort)) {
    reject('UNKNOWN_SORT', 'sort', `"${String(plan.sort)}" is not an ordering this product supports.`);
  }
  if (!ALL_TIMES.includes(plan.time)) {
    reject('UNKNOWN_TIME', 'time', `"${String(plan.time)}" is not a governed period.`);
  }
  if (!ALL_COMPARISONS.includes(plan.comparison)) {
    reject('UNKNOWN_COMPARISON', 'comparison', `"${String(plan.comparison)}" is not a supported comparison.`);
  }
  if (plan.groupBy !== null && !ALL_GROUPS.includes(plan.groupBy)) {
    reject('UNKNOWN_GROUP', 'groupBy', `"${String(plan.groupBy)}" is not a dimension this product groups by.`);
  }

  if (!globalThis.Number.isSafeInteger(plan.limit) || plan.limit < LIMIT_MIN || plan.limit > LIMIT_MAX) {
    reject('LIMIT_OUT_OF_RANGE', 'limit',
      `A result limit must be between ${String(LIMIT_MIN)} and ${String(LIMIT_MAX)}. An out-of-range `
      + 'limit is rejected rather than clamped, because a clamped answer looks like a complete one.');
  }

  // --- Filter vocabulary -----------------------------------------------------
  const f = plan.filters;
  checkVocabulary('regions', f.regions, context.vocabulary.regions, reject);
  checkVocabulary('industries', f.industries, context.vocabulary.industries, reject);
  checkVocabulary('accounts', f.accounts, context.vocabulary.accounts, reject);
  checkVocabulary('customers', f.customers, context.vocabulary.customers, reject);
  checkVocabulary('deliveryGroups', f.deliveryGroups, context.vocabulary.deliveryGroups, reject);
  checkEnum<Band>('systemRag', f.systemRag, ALL_BANDS, reject);
  checkEnum<Band>('reportedRag', f.reportedRag, ALL_BANDS, reject);
  checkEnum<Band>('outlook30', f.outlook30, ALL_BANDS, reject);
  checkEnum<Band>('outlook60', f.outlook60, ALL_BANDS, reject);
  checkEnum<TrajectoryState>('trajectory', f.trajectory, ALL_TRAJECTORIES, reject);
  checkEnum('drivers', f.drivers, ALL_DRIVERS, reject);
  checkEnum('findings', f.findings, ALL_FINDINGS, reject);

  for (const threshold of f.thresholds) {
    if (!ALL_METRICS.includes(threshold.metric)) {
      reject('MALFORMED_THRESHOLD', 'filters.thresholds',
        `A threshold names "${String(threshold.metric)}", which is not a governed metric.`);
      continue;
    }
    if (threshold.operator !== 'gte' && threshold.operator !== 'lte') {
      reject('MALFORMED_THRESHOLD', 'filters.thresholds', 'A threshold operator must be gte or lte.');
    }
    if (!/^-?\d{1,15}(\.\d{1,6})?$/.test(threshold.value)) {
      reject('MALFORMED_THRESHOLD', 'filters.thresholds',
        'A threshold value must be a plain decimal figure. Expressions are not accepted.');
    }
  }

  // --- Project scope ---------------------------------------------------------
  if (requiresProject(plan.shape) && plan.projectId === null) {
    reject('PROJECT_REQUIRED', 'projectId',
      'That question is about one project, and no project was resolved.');
  }
  if (plan.projectId !== null && !context.authorisedProjectIds.includes(plan.projectId)) {
    // Deliberately indistinguishable from "no such project" at the rendering layer. The code is for
    // the audit record; the message the reader sees is the same generic decline either way
    // (SECURITY_MODEL.md §4.5).
    reject('PROJECT_NOT_AUTHORISED', 'projectId',
      'There is nothing to show for that request in your authorised scope.');
  }
  const unauthorised = f.projectIds.filter((id) => !context.authorisedProjectIds.includes(id));
  if (unauthorised.length > 0) {
    reject('SCOPE_EXCEEDS_CALLER', 'filters.projectIds',
      'The plan named projects outside the resolved scope. A plan may narrow the caller\'s scope and '
      + 'can never widen it.');
  }

  if (plan.metricId !== null && !/^MET-[A-Z]{2,5}-\d{3}$/.test(plan.metricId)) {
    reject('MALFORMED_METRIC_ID', 'metricId', 'A metric identifier must match the catalogue format.');
  }
  if (plan.metricId !== null && context.knownMetricIds.length > 0
    && !context.knownMetricIds.includes(plan.metricId)) {
    reject('UNKNOWN_METRIC', 'metricId',
      `${plan.metricId} is not defined in the metric catalogue.`);
  }

  // --- Injection and size ----------------------------------------------------
  if (plan.evidenceQuery !== null) {
    if (plan.evidenceQuery.length > MAX_EVIDENCE_QUERY_CHARS) {
      reject('EVIDENCE_QUERY_TOO_LONG', 'evidenceQuery',
        'The evidence query exceeds the retrieval bound.');
    }
    if (EXECUTABLE_SHAPE.test(plan.evidenceQuery)) {
      reject('EXECUTABLE_CONTENT', 'evidenceQuery',
        'The evidence query contains query- or code-shaped content. Retrieval takes words, not code.');
    }
  }
  for (const value of [...f.regions, ...f.industries, ...f.accounts, ...f.customers, ...f.deliveryGroups]) {
    if (EXECUTABLE_SHAPE.test(value)) {
      reject('EXECUTABLE_CONTENT', 'filters',
        'A filter value contains query- or code-shaped content.');
    }
  }
  for (const [field, values] of [
    ['regions', f.regions], ['industries', f.industries], ['accounts', f.accounts],
    ['customers', f.customers], ['deliveryGroups', f.deliveryGroups], ['projectIds', f.projectIds],
  ] as const) {
    if (values.length > MAX_FILTER_VALUES) {
      reject('TOO_MANY_FILTER_VALUES', `filters.${field}`,
        `A filter may name at most ${String(MAX_FILTER_VALUES)} values.`);
    }
  }

  return rejections.length === 0 ? { ok: true, plan } : { ok: false, rejections };
}

function checkVocabulary(
  field: string,
  values: readonly string[],
  governed: readonly string[],
  reject: (code: PlanRejectionCode, field: string, detail: string) => void,
): void {
  // An empty governed list means the caller did not supply that vocabulary, which is a caller
  // defect rather than a plan defect. Rejecting every value would turn a missing vocabulary into a
  // stream of misleading "unknown value" messages about perfectly valid input.
  if (governed.length === 0) return;
  for (const value of values) {
    if (!governed.includes(value)) {
      reject('UNKNOWN_FILTER_VALUE', `filters.${field}`,
        `"${value}" is not a value this portfolio holds for ${field}.`);
    }
  }
}

function checkEnum<T extends string>(
  field: string,
  values: readonly T[],
  permitted: readonly T[],
  reject: (code: PlanRejectionCode, field: string, detail: string) => void,
): void {
  for (const value of values) {
    if (!permitted.includes(value)) {
      reject('UNKNOWN_FILTER_VALUE', `filters.${field}`,
        `"${String(value)}" is not one of ${permitted.join(', ')}.`);
    }
  }
}

/**
 * Reads a model-proposed plan out of JSON.
 *
 * Every field is taken only if it is the right type and in the right vocabulary; anything else is
 * dropped rather than coerced, and the resulting plan still goes through `validatePlan`. So the
 * worst a model can do by returning nonsense is produce a plan that is rejected — and the worst it
 * can do by returning something plausible is request a read the caller was already entitled to.
 *
 * Returns `null` when there is no usable shape, which the caller renders as a decline rather than
 * as an error: a model that could not interpret a question has told us something useful.
 */
export function readProposedPlan(raw: string, base: QueryPlan): QueryPlan | null {
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const p = parsed as Record<string, unknown>;

  const shape = pickEnum<PlanShape>(p['shape'], ALL_SHAPES);
  if (shape === null) return null;

  const filtersRaw = typeof p['filters'] === 'object' && p['filters'] !== null
    ? p['filters'] as Record<string, unknown> : {};

  return {
    ...base,
    shape,
    scope: typeof p['projectId'] === 'string' ? 'project' : base.scope,
    filters: {
      regions: pickStrings(filtersRaw['regions']),
      industries: pickStrings(filtersRaw['industries']),
      accounts: pickStrings(filtersRaw['accounts']),
      customers: pickStrings(filtersRaw['customers']),
      deliveryGroups: pickStrings(filtersRaw['deliveryGroups']),
      systemRag: pickEnums<Band>(filtersRaw['systemRag'], ALL_BANDS),
      reportedRag: pickEnums<Band>(filtersRaw['reportedRag'], ALL_BANDS),
      trajectory: pickEnums<TrajectoryState>(filtersRaw['trajectory'], ALL_TRAJECTORIES),
      outlook30: pickEnums<Band>(filtersRaw['outlook30'], ALL_BANDS),
      outlook60: pickEnums<Band>(filtersRaw['outlook60'], ALL_BANDS),
      drivers: pickEnums(filtersRaw['drivers'], ALL_DRIVERS),
      findings: pickEnums(filtersRaw['findings'], ALL_FINDINGS),
      projectIds: pickStrings(filtersRaw['projectIds']),
      // A model may not propose a threshold. Thresholds carry a comparison operator and a figure,
      // and a mis-specified one silently changes which projects an executive sees; the
      // deterministic reader is the only thing permitted to produce them.
      thresholds: base.filters.thresholds,
    },
    metrics: pickEnums<MetricSelector>(p['metrics'], ALL_METRICS),
    time: pickEnum<TimeSelector>(p['time'], ALL_TIMES) ?? base.time,
    comparison: pickEnum(p['comparison'], ALL_COMPARISONS) ?? base.comparison,
    sort: pickEnum<SortSelector>(p['sort'], ALL_SORTS) ?? base.sort,
    limit: typeof p['limit'] === 'number' && globalThis.Number.isSafeInteger(p['limit'])
      ? p['limit'] : base.limit,
    groupBy: pickEnum<GroupSelector>(p['groupBy'], ALL_GROUPS),
    projectId: typeof p['projectId'] === 'string' ? p['projectId'].toLowerCase() : base.projectId,
    metricId: typeof p['metricId'] === 'string' ? p['metricId'].toUpperCase() : base.metricId,
    evidenceQuery: typeof p['evidenceQuery'] === 'string'
      ? p['evidenceQuery'].slice(0, MAX_EVIDENCE_QUERY_CHARS) : base.evidenceQuery,
    origin: 'MODEL_PROPOSED',
  };
}

function pickStrings(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').slice(0, MAX_FILTER_VALUES);
}

function pickEnum<T extends string>(value: unknown, permitted: readonly T[]): T | null {
  return typeof value === 'string' && (permitted as readonly string[]).includes(value)
    ? value as T : null;
}

function pickEnums<T extends string>(value: unknown, permitted: readonly T[]): readonly T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is T => typeof v === 'string' && (permitted as readonly string[]).includes(v));
}

/** The JSON schema the planner prompt describes. Generated from the vocabularies, never hand-typed. */
export function planSchemaDescription(shapes: readonly PlanShape[] = ALL_SHAPES): string {
  return [
    '{',
    `  "shape": one of ${shapes.map((s) => `"${s}"`).join(', ')} — or null if the question is not about delivery,`,
    '  "projectId": "prj-nnn" when the question is about one named project, else null,',
    '  "filters": {',
    '    "regions": [], "industries": [], "accounts": [], "customers": [], "deliveryGroups": [],',
    `    "systemRag": subset of ${ALL_BANDS.join('|')}, "reportedRag": same, "outlook30": same, "outlook60": same,`,
    `    "trajectory": subset of ${ALL_TRAJECTORIES.join('|')},`,
    `    "drivers": subset of ${ALL_DRIVERS.join('|')},`,
    `    "findings": subset of ${ALL_FINDINGS.join('|')}`,
    '  },',
    `  "metrics": subset of ${ALL_METRICS.join('|')},`,
    `  "time": one of ${ALL_TIMES.join('|')},`,
    `  "comparison": one of ${ALL_COMPARISONS.join('|')},`,
    `  "sort": one of ${ALL_SORTS.join('|')},`,
    `  "limit": integer ${String(LIMIT_MIN)}-${String(LIMIT_MAX)},`,
    `  "groupBy": one of ${ALL_GROUPS.join('|')} or null`,
    '}',
  ].join('\n');
}
