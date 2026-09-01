/**
 * View models — the typed contract between the Application layer and every component.
 *
 * **The rule this file exists to make structural:** components do not compute business values. Not a
 * margin, not a variance, not a percentage, not a rounding, not a currency conversion, not a RAG
 * verdict. `PRODUCT_SPEC.md` §8 lists "a metric computed in a React component" as a *defect*, and
 * ADR-0002 §Decision 4 says the browser is never the system of record for money.
 *
 * So the types below carry **already-formatted strings**, produced upstream by decimal-safe domain
 * logic. A component that wants to show a margin renders `kpi.value`; there is no numerator and
 * denominator in scope for it to divide, because the shape never offers them.
 *
 * ### The one number a component is allowed to touch
 *
 * A chart has to turn a value into a coordinate, and pretending otherwise would mean shipping pixel
 * positions from the server. `PlottableValue` is the seam: it carries the authoritative `display`
 * string **and** the raw `value`, and the component may use `value` for one purpose only — mapping
 * it onto an axis. It may not sum, average, difference or re-round it, and it must never render
 * `value`; it renders `display`. That boundary is the difference between *rendering* a number and
 * *deriving* one, and it is enforced by the G-FLOAT gate (no coercion in `src/presentation`) plus
 * review of anything that touches `.value`.
 *
 * ### Why status carries its own glyph and label
 *
 * REQ-UX-002 forbids status by colour alone. `StatusViewModel` therefore requires `glyph` and
 * `label`; there is no way to obtain a tone without them, so a component *cannot* render a bare
 * coloured dot even carelessly.
 */
import type { ApplicationResponse, ProvenanceDto } from '@app';
import type { StatusTone } from './tokens/tokens.js';

// ---------------------------------------------------------------------------
// Provenance (ADR-0004, REQ-UX-004)
// ---------------------------------------------------------------------------

/**
 * How a value's epistemic layer is signalled. `BRAND_DESIGN_SYSTEM.md` §3.3 maps these to
 * treatments; the vocabulary is fixed here so no surface invents its own.
 */
export type ProvenanceTreatment = 'fact' | 'computed' | 'inferred';

export function treatmentFor(layer: ProvenanceDto<unknown>['layer']): ProvenanceTreatment {
  switch (layer) {
    case 'L1':
      return 'fact';
    case 'L2':
      return 'computed';
    case 'L3':
      return 'inferred';
  }
}

/** Every rendered figure arrives already computed, already formatted, already attributed. */
export interface MetricViewModel {
  readonly metricId: string;
  readonly label: string;
  /** Pre-formatted. The component renders this string and never reformats it. */
  readonly display: string;
  readonly treatment: ProvenanceTreatment;
  readonly sourceCount: number;
  readonly ruleVersion?: string;
  readonly computedAt?: string;
}

export function toMetricViewModel(
  metricId: string,
  label: string,
  envelope: ProvenanceDto<string>,
): MetricViewModel {
  const base = {
    metricId,
    label,
    display: envelope.value,
    treatment: treatmentFor(envelope.layer),
    sourceCount: envelope.sources.length,
  };
  return envelope.ruleVersion === undefined
    ? base
    : { ...base, ruleVersion: envelope.ruleVersion };
}

/** REQ-UX-005 — the marker is read from the response, never hand-typed into a component. */
export function demoMarkerOf(response: ApplicationResponse<unknown>): string {
  return response.demoMarker;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * The minimum a status element must carry. `tone` alone is never sufficient — REQ-UX-002 requires a
 * shape and a word, so they are required fields rather than optional ones.
 */
export interface StatusViewModel {
  readonly tone: StatusTone;
  readonly glyph: string;
  readonly label: string;
  /** Optional supporting sentence, e.g. "3 of 6 dimensions breaching". Never the only signal. */
  readonly detail?: string;
}

/** A value the caller may plot. See the file header for what a component may do with `value`. */
export interface PlottableValue {
  readonly value: number;
  /** Authoritative, decimal-safe, produced upstream. This is what gets rendered. */
  readonly display: string;
}

// ---------------------------------------------------------------------------
// Executive primitives
// ---------------------------------------------------------------------------

export type DeltaDirection = 'up' | 'down' | 'flat';
/** Whether a movement is good news. Supplied — the UI does not decide that a fall is bad. */
export type DeltaSentiment = 'positive' | 'negative' | 'neutral';

export interface DeltaViewModel {
  readonly direction: DeltaDirection;
  readonly sentiment: DeltaSentiment;
  /** Pre-formatted, sign included, e.g. "−2.4pp". */
  readonly display: string;
  readonly comparisonLabel: string;
}

export interface KpiViewModel {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly unitHint?: string;
  readonly treatment: ProvenanceTreatment;
  readonly delta?: DeltaViewModel;
  readonly status?: StatusViewModel;
  readonly metricId?: string;
  readonly evidence?: EvidenceViewModel;
  /** Set when authorization removed the field. See `RESTRICTED` below. */
  readonly restricted?: boolean;
}

/**
 * What a restricted KPI looks like.
 *
 * `SECURITY_MODEL.md` §4.5 and ADR-0005 §4: an unauthorised field is **absent** from the payload.
 * The UI therefore learns of a restriction by a field not arriving, and renders a neutral chip that
 * discloses nothing about the withheld value's existence, magnitude or type. It must never receive a
 * masked value to display — if it ever does, the backend has regressed, not the UI.
 */
export const RESTRICTED_LABEL = 'Restricted' as const;

export type TrajectoryDirection = 'improving' | 'stable' | 'deteriorating' | 'unknown';

export interface TrajectoryViewModel {
  readonly direction: TrajectoryDirection;
  readonly glyph: string;
  readonly label: string;
  /** e.g. "over 6 weeks". Supplied, never computed here. */
  readonly windowLabel: string;
  readonly detail?: string;
}

export interface ConfidenceViewModel {
  readonly level: 'HIGH' | 'MEDIUM' | 'LOW';
  readonly label: string;
  /** Why the confidence is what it is — completeness, freshness, consistency. Supplied. */
  readonly rationale: string;
}

export interface ForecastOutlookViewModel {
  readonly headline: string;
  readonly basis: string;
  readonly confidence: ConfidenceViewModel;
  readonly rangeLabel?: string;
  readonly ruleVersion?: string;
}

/**
 * Reported status versus system-assessed status (AC-2).
 *
 * Both verdicts arrive decided. The component's job is to make the disagreement impossible to miss
 * and to route to the evidence — not to work out which one is right.
 */
export interface StatusConflictViewModel {
  readonly reported: StatusViewModel;
  readonly assessed: StatusViewModel;
  readonly reportedBy: string;
  readonly divergenceSummary: string;
  readonly evidence?: EvidenceViewModel;
}

// ---------------------------------------------------------------------------
// Evidence (AC-3)
// ---------------------------------------------------------------------------

export interface EvidenceLineViewModel {
  readonly label: string;
  readonly value: string;
  readonly treatment?: ProvenanceTreatment;
}

export interface EvidenceViewModel {
  readonly title: string;
  readonly metricId?: string;
  readonly ruleVersion?: string;
  readonly computedAt?: string;
  readonly lines: readonly EvidenceLineViewModel[];
  readonly sources: readonly string[];
}

export interface InsightViewModel {
  readonly id: string;
  readonly tone: 'analytic' | 'positive' | 'caution' | 'critical';
  readonly headline: string;
  readonly body: string;
  readonly treatment: ProvenanceTreatment;
  readonly evidence?: EvidenceViewModel;
}

export interface ExecutiveActionViewModel {
  readonly id: string;
  readonly title: string;
  readonly rationale: string;
  readonly owner: string;
  readonly dueLabel: string;
  readonly status: StatusViewModel;
  readonly valueAtRisk?: string;
  readonly primaryActionLabel?: string;
}

// ---------------------------------------------------------------------------
// Tables and filters
// ---------------------------------------------------------------------------

export type ColumnAlign = 'start' | 'end';

export interface ColumnViewModel {
  readonly key: string;
  readonly header: string;
  readonly align?: ColumnAlign;
  /** Sort state, when the column is sortable. The UI reports intent; the service sorts. */
  readonly sort?: 'ascending' | 'descending' | 'none';
  readonly widthHint?: string;
  /** Screen-reader description for a column whose header is a glyph or abbreviation. */
  readonly description?: string;
}

/** One cell. Either a pre-formatted string, or a status, or a restricted marker. */
export interface CellViewModel {
  readonly display?: string;
  readonly status?: StatusViewModel;
  readonly trajectory?: TrajectoryViewModel;
  readonly delta?: DeltaViewModel;
  readonly treatment?: ProvenanceTreatment;
  readonly restricted?: boolean;
  readonly emphasis?: boolean;
}

export interface RowViewModel {
  readonly id: string;
  readonly cells: Readonly<Record<string, CellViewModel>>;
  readonly href?: string;
}

export interface TableViewModel {
  readonly caption: string;
  readonly columns: readonly ColumnViewModel[];
  readonly rows: readonly RowViewModel[];
  readonly density?: 'comfortable' | 'compact';
  /** "12 of 91 projects" — supplied; the UI does not count what it was not given. */
  readonly summary?: string;
}

export interface FilterOptionViewModel {
  readonly value: string;
  readonly label: string;
  readonly count?: string;
}

export interface FilterViewModel {
  readonly id: string;
  readonly label: string;
  readonly options: readonly FilterOptionViewModel[];
  readonly selected: string;
}

// ---------------------------------------------------------------------------
// Scope, period, freshness
// ---------------------------------------------------------------------------

export interface ScopeNodeViewModel {
  readonly id: string;
  readonly label: string;
  readonly kind: 'BUSINESS_UNIT' | 'GEOGRAPHY' | 'PORTFOLIO' | 'ACCOUNT' | 'PROJECT';
}

/**
 * The scope the caller is *authorised* for, resolved server-side.
 *
 * `SECURITY_MODEL.md` §12.1: the UI consumes authorization results and never recreates the policy.
 * `available` is the authorised set the server returned — it is not a menu of everything that
 * exists, and the selector cannot widen it.
 */
export interface ScopeSelectionViewModel {
  readonly available: readonly ScopeNodeViewModel[];
  readonly selectedId: string;
  readonly label: string;
}

export interface ReportingPeriodViewModel {
  readonly periods: readonly { readonly id: string; readonly label: string }[];
  readonly selectedId: string;
  /** "as at 31 Aug 2026" — supplied by the service, from the injected clock. */
  readonly asAtLabel: string;
}

export type FreshnessState = 'CURRENT' | 'STALE' | 'DEGRADED' | 'UNAVAILABLE';

export interface FreshnessViewModel {
  readonly state: FreshnessState;
  readonly glyph: string;
  readonly label: string;
  /** "Finance 4h ago · Delivery 12d ago" — supplied, already relative-formatted. */
  readonly detail: string;
  readonly degradedSources: readonly string[];
  readonly servingLastKnownGood?: boolean;
}

// ---------------------------------------------------------------------------
// Chart view models
// ---------------------------------------------------------------------------

export interface TrendPointViewModel {
  readonly label: string;
  readonly value: PlottableValue;
  /** Projected points render dashed and are labelled — §3.4. */
  readonly projected?: boolean;
}

export interface TrendSeriesViewModel {
  readonly id: string;
  readonly label: string;
  readonly role: 'primary' | 'baseline' | 'emphasis';
  readonly points: readonly TrendPointViewModel[];
}

export interface TrendChartViewModel {
  readonly title: string;
  /** REQ-UX-006 — the sentence a screen reader gets instead of the picture. Required. */
  readonly textAlternative: string;
  readonly series: readonly TrendSeriesViewModel[];
  readonly yAxisLabel: string;
  readonly bands?: readonly { readonly fromLabel: string; readonly toLabel: string; readonly label: string }[];
  /** Accessible data table equivalent (§3.4, REQ-UX-006). Required, not optional. */
  readonly dataTable: TableViewModel;
}

export interface WaterfallStepViewModel {
  readonly label: string;
  readonly amount: PlottableValue;
  readonly kind: 'start' | 'increase' | 'decrease' | 'total';
}

export interface WaterfallViewModel {
  readonly title: string;
  readonly textAlternative: string;
  readonly steps: readonly WaterfallStepViewModel[];
  /** AC-4 requires the decomposition to reconcile. The service asserts it; the UI displays it. */
  readonly reconciliationNote: string;
  readonly dataTable: TableViewModel;
}

export interface BubbleViewModel {
  readonly id: string;
  readonly label: string;
  readonly x: PlottableValue;
  readonly y: PlottableValue;
  readonly size: PlottableValue;
  readonly status: StatusViewModel;
  readonly emphasis?: boolean;
}

export interface BubbleMatrixViewModel {
  readonly title: string;
  readonly textAlternative: string;
  readonly xAxisLabel: string;
  readonly yAxisLabel: string;
  readonly sizeLabel: string;
  readonly bubbles: readonly BubbleViewModel[];
  readonly dataTable: TableViewModel;
}

export interface BurnBarViewModel {
  readonly label: string;
  /** Both already computed upstream. The bar maps them to width; it does not divide anything. */
  readonly actual: PlottableValue;
  readonly planned: PlottableValue;
  readonly status?: StatusViewModel;
}

export interface ProgressBurnViewModel {
  readonly title: string;
  readonly textAlternative: string;
  readonly bars: readonly BurnBarViewModel[];
}

export interface MetricComparisonRowViewModel {
  readonly label: string;
  readonly left: string;
  readonly right: string;
  readonly delta: DeltaViewModel;
  readonly treatment?: ProvenanceTreatment;
}

export interface MetricComparisonViewModel {
  readonly title: string;
  readonly leftLabel: string;
  readonly rightLabel: string;
  readonly rows: readonly MetricComparisonRowViewModel[];
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export interface EmptyStateViewModel {
  readonly title: string;
  readonly body: string;
  readonly glyph?: string;
  readonly actionLabel?: string;
}

export interface ErrorStateViewModel {
  readonly title: string;
  readonly body: string;
  /** Correlation id, so a support conversation is possible. Never a stack trace (§4.5). */
  readonly correlationId?: string;
}
