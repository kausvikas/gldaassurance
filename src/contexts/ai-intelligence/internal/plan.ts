/**
 * The typed query plan (ADR-0034) — the unit of interpretation that replaced the single intent
 * label.
 *
 * ## Why an intent was not enough
 *
 * A Phase 11 question resolved to one of thirteen labels. That is sufficient for *"why is Atlas
 * red?"* and silently wrong for:
 *
 * > *"Which current Green projects are expected to deteriorate over the next 60 days?"*
 * > *"Only Automotive."*  ·  *"Only North America."*  ·  *"Which has the greatest exposure?"*
 *
 * The label carries the family of the question and discards its **scope, filters, ordering and
 * limit** — which is most of what the executive said. And the failure is invisible: the router
 * matches on one word, answers a different question correctly, and nothing on the screen reveals
 * that the filter was dropped. A correct number under a question nobody asked is the same defect
 * class as a correct number under the wrong label, which is the one this product exists to catch.
 *
 * ## What makes a plan safe
 *
 * Every field is drawn from a **closed vocabulary** declared in this file. There is no predicate, no
 * field name, no expression, no ordering clause, no identifier list a caller composes — the things
 * a query language has and this deliberately does not. A plan is therefore *totally* validatable:
 * `validatePlan` is a complete function over a finite domain, which is not true of validating a
 * sentence and is the reason the model is allowed to propose one.
 *
 * ## Business language in, governed vocabulary out
 *
 * `SYNONYMS` maps what executives say to what the model holds. A CDO says *"automotive"*; the
 * governed vertical is `Mobility`. Resolving that here, once, in a rendered table, is the difference
 * between a product that speaks the business's language and one that has quietly invented a second
 * taxonomy nobody can reconcile.
 */
import { parseBoundedCount } from '@platform/decimal';

// ---------------------------------------------------------------------------
// Shapes — what kind of question this is.
// ---------------------------------------------------------------------------

/**
 * The closed set of answer shapes.
 *
 * Superset of the Phase 11 intents: every previous `IntentId` still exists here under the same
 * meaning, so nothing that used to be answerable stopped being. The additions are the population,
 * change, concentration, milestone, evidence and knowledge shapes Phase 13 requires.
 */
export type PlanShape =
  | 'population.list'
  | 'population.rank'
  | 'population.compare'
  | 'population.aggregate'
  | 'population.change'
  | 'population.concentration'
  | 'population.reportedGreenRisk'
  | 'population.emergingRisk'
  | 'population.recovering'
  | 'project.health'
  | 'project.margin'
  | 'project.burn'
  | 'project.scope'
  | 'project.confidence'
  | 'project.forwardRisk'
  | 'project.recovery'
  | 'project.milestones'
  | 'project.acceptanceEvidence'
  | 'project.compare'
  | 'evidence.lookup'
  | 'metric.definition'
  | 'knowledge.document'
  | 'source.provenance'
  | 'source.dataQuality';

export const ALL_SHAPES: readonly PlanShape[] = [
  'population.list', 'population.rank', 'population.compare', 'population.aggregate',
  'population.change', 'population.concentration', 'population.reportedGreenRisk',
  'population.emergingRisk', 'population.recovering',
  'project.health', 'project.margin', 'project.burn', 'project.scope', 'project.confidence',
  'project.forwardRisk', 'project.recovery', 'project.milestones', 'project.acceptanceEvidence',
  'project.compare',
  'evidence.lookup', 'metric.definition', 'knowledge.document', 'source.provenance',
  'source.dataQuality',
];

const PROJECT_SHAPES: ReadonlySet<PlanShape> = new Set<PlanShape>([
  'project.health', 'project.margin', 'project.burn', 'project.scope', 'project.confidence',
  'project.forwardRisk', 'project.recovery', 'project.milestones', 'project.acceptanceEvidence',
  'evidence.lookup', 'knowledge.document',
]);

export function requiresProject(shape: PlanShape): boolean {
  return PROJECT_SHAPES.has(shape);
}

// ---------------------------------------------------------------------------
// Governed vocabularies.
// ---------------------------------------------------------------------------

export type Band = 'GREEN' | 'AMBER' | 'RED';
export const ALL_BANDS: readonly Band[] = ['GREEN', 'AMBER', 'RED'];

export type TrajectoryState = 'IMPROVING' | 'STABLE' | 'DETERIORATING' | 'RAPIDLY_DETERIORATING';
export const ALL_TRAJECTORIES: readonly TrajectoryState[] = [
  'IMPROVING', 'STABLE', 'DETERIORATING', 'RAPIDLY_DETERIORATING',
];

/**
 * Governed driver categories — conditions the engines already assessed.
 *
 * These are *read*, never re-derived. `executive-facts.ts` attaches them from conditions the health,
 * commercial and trajectory engines evaluated, so a filter on `margin-erosion` selects projects the
 * domain says are eroding, not projects a query decided are.
 */
export type DriverId =
  | 'margin-erosion'
  | 'scope-leakage'
  | 'burn-ahead-of-progress'
  | 'behind-plan'
  | 'deteriorating'
  | 'reporting-divergence'
  | 'emerging-risk';

export const ALL_DRIVERS: readonly DriverId[] = [
  'margin-erosion', 'scope-leakage', 'burn-ahead-of-progress', 'behind-plan', 'deteriorating',
  'reporting-divergence', 'emerging-risk',
];

export const DRIVER_LABEL: Readonly<Record<DriverId, string>> = {
  'margin-erosion': 'margin erosion against the as-sold position',
  'scope-leakage': 'scope delivered without commercial cover',
  'burn-ahead-of-progress': 'cost running ahead of delivered progress',
  'behind-plan': 'delivery behind the planned position',
  deteriorating: 'a deteriorating trajectory',
  'reporting-divergence': 'reported status ahead of the evidence',
  'emerging-risk': 'a governed outlook that turns within 60 days',
};

/** The three executive findings, which are groupings over governed facts, not new rules. */
export type FindingId = 'reportedGreenRisk' | 'emergingRisk' | 'recovering';
export const ALL_FINDINGS: readonly FindingId[] = ['reportedGreenRisk', 'emergingRisk', 'recovering'];

/**
 * Governed metric selectors.
 *
 * A plan **selects** a metric; it never defines one. Each of these resolves to a catalogue entry,
 * and the resolution table is the only place the two vocabularies meet — which is why a plan cannot
 * ask for a metric the catalogue does not hold.
 */
export type MetricSelector =
  | 'tcv'
  | 'soldGm'
  | 'forecastGm'
  | 'riskAdjustedGm'
  | 'gmErosion'
  | 'gmAtRisk'
  | 'eac'
  | 'etc'
  | 'scopeExposure'
  | 'pendingChange'
  | 'milestoneStatus'
  | 'qualityExposure';

export const ALL_METRICS: readonly MetricSelector[] = [
  'tcv', 'soldGm', 'forecastGm', 'riskAdjustedGm', 'gmErosion', 'gmAtRisk', 'eac', 'etc',
  'scopeExposure', 'pendingChange', 'milestoneStatus', 'qualityExposure',
];

export const METRIC_LABEL: Readonly<Record<MetricSelector, string>> = {
  tcv: 'total contract value',
  soldGm: 'as-sold gross margin',
  forecastGm: 'forecast gross margin',
  riskAdjustedGm: 'risk-adjusted gross margin',
  gmErosion: 'gross-margin erosion',
  gmAtRisk: 'gross margin at risk',
  eac: 'cost at completion',
  etc: 'estimate to complete',
  scopeExposure: 'uncommercialised scope exposure',
  pendingChange: 'pending change requests',
  milestoneStatus: 'milestone status',
  qualityExposure: 'quality exposure',
};

export type TimeSelector = 'current' | 'previousPeriod' | 'day30' | 'day60';
export const ALL_TIMES: readonly TimeSelector[] = ['current', 'previousPeriod', 'day30', 'day60'];

export type ComparisonSelector = 'none' | 'soldVsCurrent' | 'currentVsPrior' | 'currentVsOutlook';
export const ALL_COMPARISONS: readonly ComparisonSelector[] = [
  'none', 'soldVsCurrent', 'currentVsPrior', 'currentVsOutlook',
];

export type SortSelector =
  | 'economicExposure'
  | 'gmErosion'
  | 'trajectorySeverity'
  | 'milestoneProximity'
  | 'interventionPriority'
  | 'recovery'
  | 'contractValue'
  | 'name';

export const ALL_SORTS: readonly SortSelector[] = [
  'economicExposure', 'gmErosion', 'trajectorySeverity', 'milestoneProximity',
  'interventionPriority', 'recovery', 'contractValue', 'name',
];

/** Which dimension a concentration or comparison question groups by. */
export type GroupSelector = 'region' | 'industry' | 'account' | 'deliveryGroup' | 'driver' | 'customer';
export const ALL_GROUPS: readonly GroupSelector[] = [
  'region', 'industry', 'account', 'deliveryGroup', 'driver', 'customer',
];

/**
 * A numeric condition on a governed metric.
 *
 * Deliberately not an expression. `{ metric, operator, value, unit }` covers *"which projects have
 * lost more than three margin points"* and cannot express anything a validator would have to
 * interpret. Adding a second operand or a boolean combinator here would be the moment this stopped
 * being a plan and started being a query language.
 */
export interface ThresholdCondition {
  readonly metric: MetricSelector;
  readonly operator: 'gte' | 'lte';
  /** Decimal string. Never a float — thresholds are compared under the same arithmetic as money. */
  readonly value: string;
  readonly unit: 'points' | 'currency' | 'count';
}

export interface PlanFilters {
  readonly regions: readonly string[];
  readonly industries: readonly string[];
  readonly accounts: readonly string[];
  readonly customers: readonly string[];
  readonly deliveryGroups: readonly string[];
  readonly systemRag: readonly Band[];
  readonly reportedRag: readonly Band[];
  readonly trajectory: readonly TrajectoryState[];
  readonly outlook30: readonly Band[];
  readonly outlook60: readonly Band[];
  readonly drivers: readonly DriverId[];
  readonly findings: readonly FindingId[];
  readonly projectIds: readonly string[];
  readonly thresholds: readonly ThresholdCondition[];
}

export const EMPTY_FILTERS: PlanFilters = {
  regions: [], industries: [], accounts: [], customers: [], deliveryGroups: [],
  systemRag: [], reportedRag: [], trajectory: [], outlook30: [], outlook60: [],
  drivers: [], findings: [], projectIds: [], thresholds: [],
};

export type PlanScope = 'enterprise' | 'portfolio' | 'account' | 'customer' | 'project';

/**
 * One resolved question.
 *
 * `origin` records how the plan was produced. That is not diagnostics — it is disclosure. A plan a
 * model proposed and a validator accepted is a different epistemic object from one a deterministic
 * grammar resolved, and a reader inspecting an answer is entitled to know which they are looking at.
 */
export interface QueryPlan {
  readonly shape: PlanShape;
  readonly scope: PlanScope;
  readonly filters: PlanFilters;
  readonly metrics: readonly MetricSelector[];
  readonly time: TimeSelector;
  readonly comparison: ComparisonSelector;
  readonly sort: SortSelector;
  readonly limit: number;
  readonly groupBy: GroupSelector | null;
  /** Set for project shapes. Re-checked against the caller's authorised set at execution. */
  readonly projectId: string | null;
  /** Set for `metric.definition`. Validated against the catalogue, never free text. */
  readonly metricId: string | null;
  /** Set for `knowledge.document`: what the reader wants from the evidence, in their own words. */
  readonly evidenceQuery: string | null;
  readonly origin: 'DETERMINISTIC' | 'MODEL_PROPOSED' | 'CONVERSATION_REFINEMENT';
}

/** Bounds. A limit outside these is a rejected plan, not a clamped one (§84). */
export const LIMIT_MIN = 1;
export const LIMIT_MAX = 50;
export const DEFAULT_LIMIT = 10;

export function emptyPlan(shape: PlanShape): QueryPlan {
  return {
    shape,
    scope: 'portfolio',
    filters: EMPTY_FILTERS,
    metrics: [],
    time: 'current',
    comparison: 'none',
    sort: 'interventionPriority',
    limit: DEFAULT_LIMIT,
    groupBy: null,
    projectId: null,
    metricId: null,
    evidenceQuery: null,
    origin: 'DETERMINISTIC',
  };
}

// ---------------------------------------------------------------------------
// Business language → governed vocabulary.
// ---------------------------------------------------------------------------

/**
 * What executives say, mapped to what the model holds.
 *
 * Every entry is a *synonym*, never a new category: `automotive → Mobility` names the same governed
 * vertical the Command Center filters on. Nothing here creates a grouping the domain does not
 * already have, which is what keeps this a translation table rather than a shadow taxonomy.
 */
export const REGION_SYNONYMS: Readonly<Record<string, string>> = {
  'north america': 'North America',
  'north-america': 'North America',
  namer: 'North America',
  'the us': 'North America',
  'united states': 'North America',
  usa: 'North America',
  america: 'North America',
  americas: 'North America',
  latam: 'LATAM',
  'latin america': 'LATAM',
  europe: 'Europe',
  european: 'Europe',
  emea: 'Europe',
  uk: 'Europe',
  india: 'India/APAC',
  apac: 'India/APAC',
  'asia pacific': 'India/APAC',
  asia: 'India/APAC',
  'india/apac': 'India/APAC',
};

export const INDUSTRY_SYNONYMS: Readonly<Record<string, string>> = {
  automotive: 'Mobility',
  auto: 'Mobility',
  mobility: 'Mobility',
  transport: 'Mobility',
  industrial: 'Industrial & Energy',
  energy: 'Industrial & Energy',
  'industrial & energy': 'Industrial & Energy',
  media: 'Media & Entertainment',
  entertainment: 'Media & Entertainment',
  'media & entertainment': 'Media & Entertainment',
  technology: 'Technology',
  tech: 'Technology',
  'financial services': 'Financial Services',
  finserv: 'Financial Services',
  banking: 'Financial Services',
  finance: 'Financial Services',
  healthcare: 'Healthcare & Life Sciences',
  health: 'Healthcare & Life Sciences',
  'life sciences': 'Healthcare & Life Sciences',
  pharma: 'Healthcare & Life Sciences',
  communications: 'Communications',
  telco: 'Communications',
  telecom: 'Communications',
  retail: 'Retail & Consumer',
  consumer: 'Retail & Consumer',
  'retail & consumer': 'Retail & Consumer',
};

/**
 * The catalogue of business phrasings for each governed driver.
 *
 * Longest phrase first at match time, so *"cost is running ahead of progress"* selects
 * `burn-ahead-of-progress` rather than matching the bare word *"cost"* somewhere else.
 */
export const DRIVER_PHRASES: readonly (readonly [DriverId, readonly string[]])[] = [
  ['burn-ahead-of-progress', ['burn ahead', 'spending ahead', 'cost ahead of progress', 'cost running ahead', 'burn rate', 'overspend']],
  ['behind-plan', ['behind plan', 'behind schedule', 'behind the plan', 'slipping', 'late delivery', 'declining delivery performance', 'delivery performance']],
  ['scope-leakage', ['scope leakage', 'scope creep', 'unbilled scope', 'uncommercialised', 'uncommercialized', 'unsigned scope', 'without commercial cover', 'scope exposure']],
  ['margin-erosion', ['margin erosion', 'eroding margin', 'margin loss', 'losing margin', 'deteriorating economics', 'economic deterioration', 'margin decline']],
  ['reporting-divergence', ['reporting divergence', 'misreported', 'over-reported', 'status ahead of evidence']],
  ['emerging-risk', ['emerging risk', 'early warning']],
  ['deteriorating', ['deteriorating', 'getting worse', 'worsening', 'declining']],
];

/** Reads a bounded `top N` from a question. Returns `null` rather than guessing. */
export function readLimit(text: string): number | null {
  const words: Readonly<Record<string, string>> = {
    one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
    nine: '9', ten: '10', fifteen: '15', twenty: '20',
  };
  const digits = /\b(?:top|first|best|worst|largest|biggest|highest)\s+(\d{1,2})\b/.exec(text)
    ?? /\b(\d{1,2})\s+(?:projects?|of them|worst|largest)\b/.exec(text);
  if (digits?.[1] !== undefined) return parseBoundedCount(digits[1], LIMIT_MIN, LIMIT_MAX);
  const spelled = /\b(?:top|first|largest|biggest|worst|compare the)\s+(one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)\b/
    .exec(text);
  const word = spelled?.[1];
  if (word === undefined) return null;
  const mapped = words[word];
  return mapped === undefined ? null : parseBoundedCount(mapped, LIMIT_MIN, LIMIT_MAX);
}

/**
 * Renders a plan's scope in business language.
 *
 * This is the honesty control of ADR-0034 §7. An executive who asked for Automotive in North America
 * sees *"Automotive · North America"* above the answer, so a filter this product failed to
 * understand is visible as an absence rather than hidden behind a confident number.
 */
export function describeScope(plan: QueryPlan): string {
  const parts: string[] = [];
  const f = plan.filters;
  if (f.industries.length > 0) parts.push(f.industries.join(' or '));
  if (f.regions.length > 0) parts.push(f.regions.join(' or '));
  if (f.accounts.length > 0) parts.push(f.accounts.join(' or '));
  if (f.customers.length > 0) parts.push(f.customers.join(' or '));
  if (f.deliveryGroups.length > 0) parts.push(f.deliveryGroups.join(' or '));
  if (f.systemRag.length > 0) parts.push(`assessed ${f.systemRag.join('/').toLowerCase()}`);
  if (f.reportedRag.length > 0) parts.push(`reported ${f.reportedRag.join('/').toLowerCase()}`);
  if (f.trajectory.length > 0) {
    parts.push(f.trajectory.map((t) => t.toLowerCase().replace(/_/g, ' ')).join(' or '));
  }
  if (f.outlook60.length > 0) parts.push(`60-day outlook ${f.outlook60.join('/').toLowerCase()}`);
  if (f.outlook30.length > 0) parts.push(`30-day outlook ${f.outlook30.join('/').toLowerCase()}`);
  for (const d of f.drivers) parts.push(DRIVER_LABEL[d]);
  for (const finding of f.findings) {
    parts.push(finding === 'reportedGreenRisk' ? 'reported Green where the evidence disagrees'
      : finding === 'emergingRisk' ? 'assessed Green with an emerging risk'
        : 'showing recovery');
  }
  for (const t of f.thresholds) {
    parts.push(
      `${METRIC_LABEL[t.metric]} ${t.operator === 'gte' ? 'at or above' : 'at or below'} ${t.value}`
      + `${t.unit === 'points' ? ' points' : ''}`,
    );
  }
  if (parts.length === 0) return 'the whole fixed-bid portfolio';
  return parts.join(' · ');
}
