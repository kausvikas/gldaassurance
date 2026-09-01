/**
 * The Project Executive Health service — everything one project's executive review displays.
 *
 * **The question this surface answers**, and the only one it is designed around: *are we delivering
 * the scope we sold, by the date committed, at the economics sold — what evidence proves it, and
 * where is it heading?* A Global Delivery Head must be able to work that in three to five minutes
 * and, crucially, to **challenge an unsupported Green with evidence rather than with an opinion**.
 *
 * ### What that demands of this file
 *
 * 1. **Every figure is computed and formatted here, server-side.** The presentation layer receives
 *    strings. ADR-0002 forbids the browser being the system of record for money, and
 *    `PRODUCT_SPEC.md` §8 calls a metric computed in a component a defect. There is no numerator and
 *    denominator in a view model for a component to divide.
 *
 * 2. **Nothing is computed twice.** Economics comes from `computeEconomics`, health from
 *    `evaluateHealth`, trajectory and outlook from the forecast engines, delivery from
 *    `evaluateDelivery`. This service *arranges* an assessment; it does not produce one. A second
 *    implementation of a margin or a band would be the most expensive kind of bug here, because both
 *    copies would look right in isolation.
 *
 * 3. **Absence is reported, never rendered as zero.** A metric that is not computable arrives with
 *    the reason it is not, and the reason is displayed. This is the difference between "quality is
 *    fine" and "nobody measured quality", and on a page whose purpose is challenging a Green status
 *    it is the whole game.
 *
 * 4. **The three epistemic layers stay apart** (ADR-0004). An observed fact, a deterministic
 *    derivation and an assessment are labelled differently everywhere they appear, so a reader can
 *    always tell what kind of claim they are being asked to accept.
 *
 * ### What this file deliberately does not do
 *
 * It does not decide health, trajectory or outlook, and it does not narrate freely. The executive
 * summary below is **generated from the assessment by fixed rules** — the same inputs always produce
 * the same five sentences. No language model is involved anywhere in this path, because the
 * assistant is never the system of record for project economics or official health.
 */
import {
  type CurrencyCode, type Money, type Quantity, type Ratio,
  isComputable, qAbs, qCompare, qDiv, qFixed, qMul, qSub, qToNumber, qty, ratioToQuantity,
} from '@platform/decimal';
import type { RuleVersion } from '@platform/provenance';
import type { RuleCoverage } from '@contexts/health';
import type { NotEvaluatedReasonCode, SignalState } from '@platform/explainability';
import type { CalendarDate, Instant, WeekId } from '@platform/time';
import type { DeliveryEvaluation } from '@contexts/delivery';
import type { ProjectAssessment } from '../metrics/metric-calculation-service.js';
import {
  type DeltaDto, type EvidenceDto, type EvidenceLineDto, type EpistemicTreatment,
  formatMoneyCompact, formatPercentagePoints, formatRatio, formatWeeks,
} from '../portfolio/command-center.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * The commercial and organisational facts a header needs.
 *
 * `customerAlias` rather than a customer name: the demo portfolio is synthetic and its accounts are
 * fictional, and a page that looks like a real client review is exactly the artefact that must not
 * escape into a real one.
 */
export interface ProjectIdentity {
  readonly projectId: string;
  readonly name: string;
  readonly customerAlias: string;
  readonly industry: string;
  readonly region: string;
  readonly deliveryLeader: string;
  readonly daOwner: string;
  readonly engagementModel: string;
  readonly startDate: CalendarDate;
  readonly committedEndDate: CalendarDate;
}

/** One row of the as-sold baseline, which `contract` owns and this service never recomputes. */
export interface SoldBaseline {
  /** `MET-FIN-001` — the original contract value, immutable once written (ADR-0003 §1). */
  readonly contractValueAsSold: Money;
  /** `MET-FIN-003` — the original budgeted cost. */
  readonly budgetedCostAsSold: Money;
  /**
   * `MET-FIN-012` Gross Margin — As-Sold, taken from the economics engine.
   *
   * Supplied rather than derived: the metric is `MET-FIN-026 / MET-FIN-001`, both as-sold, and the
   * engine already computes it. A caller passing anything else here is passing a different metric.
   */
  readonly soldGmPercentAsSold: Ratio;
  readonly committedEndDate: CalendarDate;
}

/**
 * L1 facts the Scope/Commercial and Quality sections report **as facts**.
 *
 * These are counts and sums of records, not derivations — which is exactly why they may be reported
 * while their L2 siblings cannot (`CONFLICT C-21`, ADR-0022 D-2). Each is labelled `fact` on the
 * page so a reader is never invited to mistake a count for an assessment.
 */
export interface ObservedSignals {
  /** `MET-QUA-001` — open defects, by severity. */
  readonly openDefectsBySeverity: Readonly<Record<string, number>>;
  /** `MET-QUA-010` — unresolved blocking acceptance items. */
  readonly acceptanceBlockers: number;
  readonly acceptedDeliverables: number;
  readonly submittedDeliverables: number;
  /** Executed change requests: count and net value moved onto the contract. */
  readonly executedChangeCount: number;
  readonly executedChangeValue: Money;
  /** Pending change requests: count and the value not yet secured. */
  readonly pendingChangeCount: number;
  readonly pendingChangeValue: Money;
  /** Scope items delivered without an executed change covering them. */
  readonly uncontractedScopeItems: number;
  readonly openRisks: number;
  readonly openCriticalRisks: number;
}

export interface ProjectExecutiveHealthInput {
  readonly asOf: Instant;
  readonly week: WeekId;
  readonly currency: CurrencyCode;
  readonly zero: Money;
  readonly ruleVersion: RuleVersion;
  readonly identity: ProjectIdentity;
  readonly sold: SoldBaseline;
  readonly assessment: ProjectAssessment;
  readonly delivery: DeliveryEvaluation;
  readonly observed: ObservedSignals;
  /** `MET-COM-009` exposure, an L1 commercial exposure record. */
  readonly uncommercialisedExposure: Money;
  /** The most recent independent/DA review, where one exists. Absence is itself reportable. */
  readonly lastIndependentReview?: {
    readonly reviewedOn: CalendarDate;
    readonly reviewer: string;
    readonly outcome: string;
  };
  /** Domain freshness, in days since each last produced a fact. */
  readonly domainAgeDays: Readonly<Record<string, number | null>>;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface HeaderDto {
  readonly projectId: string;
  readonly name: string;
  readonly customerAlias: string;
  readonly industry: string;
  readonly region: string;
  readonly deliveryLeader: string;
  readonly daOwner: string;
  readonly contractType: string;
  readonly totalContractValue: string;
  readonly startDate: string;
  readonly committedEndDate: string;
  readonly demoMarker: string;
}

/** A headline verdict, with the layer it belongs to and the evidence behind it. */
export interface VerdictDto {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly treatment: EpistemicTreatment;
  readonly metricId: string;
  readonly detail: string;
  readonly evidence: EvidenceDto;
}

export interface DimensionDto {
  readonly id: string;
  readonly name: string;
  readonly metricId: string;
  readonly weight: string;
  /** The dimension score, or the stated reason there is none. Never both, never neither. */
  readonly score: string;
  readonly contribution: string;
  readonly computable: boolean;
  readonly notComputableReason?: string;
  readonly inputs: readonly {
    readonly metricId: string;
    readonly label: string;
    readonly observed: string;
    readonly weight: string;
    readonly band: string;
    /**
     * The governed epistemic state of this input (ADR-0028 D-1).
     *
     * **Added at the Phase 11C certification.** The health engine has computed this since ADR-0028
     * and ADR-0028 D-1 states it is "carried through to the application DTO so **Phase 11 never
     * parses prose**" — but the DTO dropped it, so the only signal a consumer had was the word
     * `not supplied` inside `observed`. The assistant was re-deriving state by matching that
     * display string, which is precisely the flattening the epistemic algebra exists to prevent:
     * `KNOWN_ZERO`, `NOT_APPLICABLE`, `UNBOUNDED` and `CONFIGURATION_ERROR` were all indistinguishable
     * from `NOT_COMPUTABLE` at the boundary.
     *
     * No number changes by exposing it. The value was already computed and already governed.
     */
    readonly state: SignalState;
    readonly reasonCode?: NotEvaluatedReasonCode;
    /** `MATERIAL` inputs are the ones whose absence costs the assessment its COMPLETE claim. */
    readonly materiality?: 'MATERIAL' | 'SUPPORTING';
  }[];
  readonly evidence: EvidenceDto;
}

export interface ComparisonRowDto {
  readonly label: string;
  readonly originalSold: string;
  readonly currentContract: string;
  readonly currentForecast: string;
  readonly variance: string;
  readonly sentiment: 'positive' | 'negative' | 'neutral';
  readonly treatment: EpistemicTreatment;
  readonly metricId: string;
}

export interface FinancialLineDto {
  readonly label: string;
  readonly value: string;
  readonly metricId: string;
  readonly treatment: EpistemicTreatment;
}

export interface SignalLineDto {
  readonly label: string;
  readonly value: string;
  readonly metricId: string;
  readonly treatment: EpistemicTreatment;
  /** Set where the metric could not be computed; the surface prints it in place of a value. */
  readonly notComputableReason?: string;
}

export interface MilestoneDto {
  readonly name: string;
  readonly baselineDate: string;
  readonly forecastDate: string;
  readonly actualDate: string;
  readonly slip: string;
  readonly state: string;
  readonly paymentGating: boolean;
}

/** The five-part executive summary. Deterministic: same assessment, same words. */
export interface ExecutiveSummaryDto {
  readonly status: string;
  readonly cause: string;
  readonly outlook: string;
  readonly economicImpact: string;
  readonly action: string;
  readonly evidence: EvidenceDto;
}

export interface StatusConflictDto {
  readonly present: boolean;
  readonly reportedRag: string;
  readonly systemAssessedRag: string;
  readonly effectiveRag: string;
  readonly overrideApplied: boolean;
  readonly direction: string;
  readonly narrative: string;
  /** The rule firings the reporter's declaration does not account for. */
  readonly unexplainedBy: readonly string[];
  readonly evidence: EvidenceDto;
}

export interface ConfidenceDto {
  readonly dataBand: string;
  readonly dataScore: string;
  readonly arithmeticBand: string;
  readonly cappedBy?: string;
  readonly forecastBand: string;
  readonly forecastScore: string;
  readonly staleDomains: readonly string[];
  readonly silentDomains: readonly string[];
  readonly domainFreshness: readonly { readonly domain: string; readonly age: string }[];
  readonly independentReview: string;
  /**
   * The rule the section exists to enforce: **no evidence means no high confidence in Green**.
   * Computed here, server-side, and stated on the page whether or not it is currently breached.
   */
  readonly greenClaimSupported: boolean;
  readonly greenClaimNarrative: string;
  readonly evidence: EvidenceDto;
}

/** How much of the health model this assessment actually rests on (ADR-0022 D-4). */
export interface AssessmentCoverageDto {
  readonly status: string;
  readonly coverage: string;
  readonly availableWeight: string;
  readonly declaredWeight: string;
  readonly missing: readonly { readonly name: string; readonly weight: string; readonly reason: string }[];
  /**
   * Materially applicable inputs whose evidence could have existed and does not (ADR-0028 D-2).
   *
   * Distinct from `missing`, which lists whole dimensions that could not be scored. An assessment
   * can have all four dimensions **and** be incomplete, which is the case a reader most needs told.
   */
  readonly missingEvidence: readonly string[];
  readonly narrative: string;
}

export interface ProjectExecutiveHealthView {
  readonly asOf: string;
  readonly week: string;
  readonly currency: string;
  readonly ruleVersion: string;
  readonly header: HeaderDto;
  readonly verdicts: readonly VerdictDto[];
  readonly dimensions: readonly DimensionDto[];
  readonly commitment: readonly ComparisonRowDto[];
  readonly financial: readonly FinancialLineDto[];
  readonly progressBurn: {
    readonly plannedCompletion: string;
    readonly actualCompletion: string;
    readonly costConsumed: string;
    readonly progressVariance: string;
    readonly burnGap: string;
    readonly narrative: string;
    readonly plannedValue: number;
    readonly actualValue: number;
    readonly costValue: number;
    readonly evidence: EvidenceDto;
  };
  readonly etcCredibility: {
    readonly applicable: boolean;
    readonly managementEac: string;
    readonly performanceImpliedEac: string;
    readonly optimismGap: string;
    readonly narrative: string;
    readonly evidence: EvidenceDto;
  };
  readonly milestones: {
    readonly last: MilestoneDto | null;
    readonly next: MilestoneDto | null;
    readonly hitRate: string;
    readonly slippageDays: string;
    readonly atRisk: string;
    readonly scheduleVariance: string;
    readonly all: readonly MilestoneDto[];
    readonly evidence: EvidenceDto;
  };
  readonly scopeCommercial: readonly SignalLineDto[];
  readonly quality: readonly SignalLineDto[];
  readonly statusConflict: StatusConflictDto;
  readonly confidence: ConfidenceDto;
  readonly summary: ExecutiveSummaryDto;
  readonly coverage: AssessmentCoverageDto;
  /**
   * Which mechanism produced the System-Assessed band.
   *
   * A hard override forces RED as policy. Rendering only the final band tells a reader the weighted
   * model produced Red when a rule did — and on this portfolio **every** RED is override-forced,
   * so without this the model would appear to be deciding something it is not.
   */
  readonly bandProvenance: {
    readonly systemAssessedRag: string;
    readonly compositeBand: string;
    readonly decidedBy: 'WEIGHTED_MODEL' | 'POLICY_OVERRIDE';
    readonly firedOverrides: readonly string[];
    readonly narrative: string;
    /**
     * Control completeness over **applicable** Red-forcing rules (ADR-0026 D-4).
     *
     * Reads `7/7`, not `7/8`, when one rule does not apply: counting an inapplicable control as an
     * unevaluated one asserts a gap that does not exist. ADR-0025 did exactly that, and described
     * every case as missing evidence — false on all thirteen.
     */
    readonly applicableControlsEvaluated: string;
    readonly allApplicableCriticalControlsEvaluated: boolean;
    /** Structured, so a future assistant never parses prose to learn why (ADR-0026 D-1). */
    readonly notApplicableControls: readonly {
      readonly ruleId: string;
      readonly reasonCode: string;
      readonly reason: string;
    }[];
    readonly unevaluatedApplicableControls: readonly {
      readonly ruleId: string;
      readonly reasonCode: string;
      readonly reason: string;
      readonly requiredEvidence: readonly string[];
      readonly missingEvidence: readonly string[];
    }[];
    /** A **system control defect**, reported separately from project performance. */
    readonly configurationErrorControls: readonly string[];
    readonly coverageNarrative: string;
  };
  readonly interventionRequired: boolean;
}

// ---------------------------------------------------------------------------
// Formatting helpers — every one of them decimal-safe
// ---------------------------------------------------------------------------

const NOT_COMPUTABLE = 'not computable';

const pct = (r: Ratio, decimals = 1): string => formatRatio(r, decimals);

/** A quantity already in [0,1], as a percentage. `null` becomes the stated absence, never `0%`. */
function qtyAsPercent(q: Quantity | null, decimals = 1): string {
  return q === null ? NOT_COMPUTABLE : `${qFixed(qMul(q, qty('100')), decimals)}%`;
}

/** A 0–100 score. Kept distinct from a percentage: a health score is not a proportion. */
function scoreOf(q: Quantity | null, decimals = 1): string {
  return q === null ? NOT_COMPUTABLE : qFixed(q, decimals);
}

const days = (n: number | null): string =>
  n === null ? NOT_COMPUTABLE : `${String(n)} day${Math.abs(n) === 1 ? '' : 's'}`;

/** Signed days, so `+12 days late` and `12 days early` cannot be confused. */
function signedDays(n: number | null): string {
  if (n === null) return NOT_COMPUTABLE;
  if (n === 0) return 'on baseline';
  return n > 0 ? `${String(n)} days late` : `${String(-n)} days early`;
}

const dateLabel = (d: string | null): string => d ?? '—';

/** The delta between two money figures, formatted with sentiment decided, never inferred later. */
function moneyVariance(from: Money, to: Money, higherIsBetter: boolean): {
  display: string; sentiment: 'positive' | 'negative' | 'neutral';
} {
  const delta = to.minus(from);
  const q = delta.toQuantity();
  const cmp = qCompare(q, qty('0'));
  if (cmp === 0) return { display: 'no change', sentiment: 'neutral' };
  const better = higherIsBetter ? cmp > 0 : cmp < 0;
  const sign = cmp > 0 ? '+' : '−';
  return {
    display: `${sign}${formatMoneyCompact(delta.isNegative() ? delta.negated() : delta)}`,
    sentiment: better ? 'positive' : 'negative',
  };
}

/** Percentage-point variance between two ratios. */
function ratioVariance(from: Ratio, to: Ratio): {
  display: string; sentiment: 'positive' | 'negative' | 'neutral';
} {
  const a = ratioToQuantity(from);
  const b = ratioToQuantity(to);
  if (a === null || b === null) return { display: NOT_COMPUTABLE, sentiment: 'neutral' };
  const delta = qSub(qty(b), qty(a));
  const cmp = qCompare(delta, qty('0'));
  return {
    display: `${cmp > 0 ? '+' : cmp < 0 ? '−' : ''}${qFixed(qMul(qAbs(delta), qty('100')), 1)}pp`,
    sentiment: cmp === 0 ? 'neutral' : cmp > 0 ? 'positive' : 'negative',
  };
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

/**
 * What an executive is told when a metric is declared on this surface but produced elsewhere.
 *
 * **Phase 12A found the previous text rendered 24 times on this page**, reading:
 * *"BLOCKED by CONFLICT C-21 (ADR-0022 D-2): an L2 derivation may not be placed in the quality
 * context while ARCHITECTURE_DECISIONS.md §4 declares it L1-only."* An internal conflict id, an ADR
 * reference and a source filename, in six metric slots, on a page a Delivery Head reads before a
 * client meeting. It reads as a broken product, and no executive can act on it.
 *
 * The **state** is unchanged and still honest — the value is not computed here. Only the sentence
 * changes, which is what Phase 12A permits.
 *
 * **A separate semantic question is recorded, not resolved here** (Phase 12A §32): these same
 * metrics compute and display on the Margin & Driver Intelligence page, and ADR-0022 records
 * CONFLICT C-21 as resolved. Whether this surface should therefore show them is a domain decision
 * for the metric owner, and inventing an answer during a UX pass is the failure this project guards
 * against. Carried as **DR-078**.
 */
const NOT_PLACED_REASON =
  'Not shown on this page. This measure is owned by another domain and is reported on the '
  + 'Margin & Driver Intelligence surface, where its evidence sits. '
  // The governance trail stays, in a trailing clause rather than as the headline. An existing test
  // asserts C-21 is named, and it is right to: a reader who wants the reason must be able to find
  // it. What changed is which half an executive meets first.
  + '(Governance: CONFLICT C-21, ADR-0022 D-2.)';

export function buildProjectExecutiveHealth(
  input: ProjectExecutiveHealthInput,
): ProjectExecutiveHealthView {
  const { assessment: a, delivery: d, identity: id, sold, observed, zero } = input;
  const e = a.economics;
  const h = a.health;
  const ruleVersionLabel = String(input.ruleVersion);

  const ev = (
    title: string, metricId: string, lines: readonly EvidenceLineDto[],
    sources: readonly string[] = ['financial', 'delivery', 'commercial', 'quality'],
  ): EvidenceDto => ({
    title, metricId, ruleVersion: ruleVersionLabel, computedAt: input.asOf, lines, sources,
  });

  // --- Header ---------------------------------------------------------------
  const header: HeaderDto = {
    projectId: id.projectId,
    name: id.name,
    customerAlias: id.customerAlias,
    industry: id.industry,
    region: id.region,
    deliveryLeader: id.deliveryLeader,
    daOwner: id.daOwner,
    contractType: id.engagementModel,
    totalContractValue: formatMoneyCompact(e.contractualRevenue),
    startDate: id.startDate,
    committedEndDate: id.committedEndDate,
    demoMarker: 'DEMO — SYNTHETIC DATA',
  };

  // --- Primary verdicts -----------------------------------------------------
  // Six headline statements. Each is labelled with the layer it comes from, because "Amber" as an
  // assessment and "$4.2M" as an observed fact are not the same kind of claim.
  const outlook30 = a.greenAtRisk.outlook30;
  const outlook60 = a.greenAtRisk.outlook60;
  const interventionRequired =
    h.systemAssessedRag !== 'GREEN'
    || a.greenAtRisk.isSystemGreenAtRisk
    || a.greenAtRisk.isReportedGreenRisk
    || h.statusConflict !== null;

  const verdicts: readonly VerdictDto[] = [
    {
      id: 'overall-health',
      label: 'Overall health',
      value: h.systemAssessedRag,
      treatment: 'inferred',
      metricId: 'MET-HLTH-011',
      detail: h.overrideChangedBand
        ? `${h.systemAssessedRag} by policy override — the weighted model banded this `
          + `${h.compositeBand ?? 'not computable'} at composite ${scoreOf(h.compositeScore)}`
        : `Composite ${scoreOf(h.compositeScore)} of 100, ${String(h.dimensions.filter((x) => x.score !== null).length)} of ${String(h.dimensions.length)} dimensions scored`,
      evidence: ev('System-Assessed RAG', 'MET-HLTH-011', [
        { label: 'Composite score', value: scoreOf(h.compositeScore), treatment: 'computed' },
        { label: 'Band from the weighted model alone', value: h.compositeBand ?? NOT_COMPUTABLE, treatment: 'inferred' },
        { label: 'Hard overrides fired', value: h.firedOverrides.length === 0 ? 'none' : h.firedOverrides.join(', ') },
        {
          label: 'Which mechanism decided this band',
          value: h.overrideChangedBand
            ? `A **policy override**, not the weighted model. The four dimensions banded this `
              + `${h.compositeBand ?? 'not computable'}; ${h.firedOverrides.join(', ')} forced RED `
              + 'because a weighted average can absorb a catastrophe in one dimension. Challenge the '
              + 'override, not the model, if you disagree.'
            : 'The weighted composite, banded against the HEALTH-v2 thresholds. No override changed it.',
        },
        { label: 'Health model', value: String(h.healthModelVersion) },
        { label: 'Reported RAG', value: h.reportedRag ?? 'not reported', treatment: 'fact' },
      ], ['health']),
    },
    {
      id: 'trajectory',
      label: 'Trajectory',
      value: a.trajectory.state,
      treatment: 'inferred',
      metricId: 'MET-FCST-001',
      detail: `${String(a.trajectory.adverseConfluence)} signal${a.trajectory.adverseConfluence === 1 ? '' : 's'} moving materially adversely`,
      evidence: ev('Trajectory', 'MET-FCST-001', [
        { label: 'State', value: a.trajectory.state, treatment: 'inferred' },
        { label: 'Adverse confluence', value: String(a.trajectory.adverseConfluence), treatment: 'computed' },
        { label: 'Signals evaluated', value: String(a.trajectory.trends.length), treatment: 'computed' },
      ], ['forecast']),
    },
    {
      id: 'outlook-30',
      label: '30-day outlook',
      value: outlook30 ?? 'not projected',
      treatment: 'inferred',
      metricId: 'MET-FCST-020',
      detail: outlook30 === null
        ? 'no projection: the signals do not support one'
        : `projected band at 30 days`,
      evidence: ev('30-day outlook', 'MET-FCST-020', [
        { label: 'Projected band', value: outlook30 ?? 'not projected', treatment: 'inferred' },
        { label: 'Current band', value: h.systemAssessedRag, treatment: 'inferred' },
      ], ['forecast']),
    },
    {
      id: 'outlook-60',
      label: '60-day outlook',
      value: outlook60 ?? 'not projected',
      treatment: 'inferred',
      metricId: 'MET-FCST-021',
      detail: outlook60 === null
        ? 'no projection: the signals do not support one'
        : `projected band at 60 days`,
      evidence: ev('60-day outlook', 'MET-FCST-021', [
        { label: 'Projected band', value: outlook60 ?? 'not projected', treatment: 'inferred' },
        { label: 'Current band', value: h.systemAssessedRag, treatment: 'inferred' },
      ], ['forecast']),
    },
    {
      id: 'forecast-confidence',
      label: 'Forecast confidence',
      value: a.forecastConfidence.band,
      treatment: 'computed',
      metricId: 'MET-DQ-007',
      detail: `score ${scoreOf(a.forecastConfidence.score)} of 100`,
      evidence: ev('Forecast confidence', 'MET-DQ-007', [
        { label: 'Band', value: a.forecastConfidence.band, treatment: 'computed' },
        { label: 'Score', value: scoreOf(a.forecastConfidence.score), treatment: 'computed' },
      ], ['data-quality']),
    },
    {
      id: 'intervention',
      label: 'Executive intervention',
      value: interventionRequired ? 'REQUIRED' : 'Not indicated',
      treatment: 'inferred',
      metricId: 'MET-HLTH-011',
      detail: interventionRequired
        ? 'the assessment, the forward outlook or a status conflict warrants an executive decision'
        : 'no assessed breach, no forward deterioration and no status conflict',
      evidence: ev('Executive intervention', 'MET-HLTH-011', [
        { label: 'System-Assessed RAG', value: h.systemAssessedRag, treatment: 'inferred' },
        { label: 'System Green-at-Risk', value: a.greenAtRisk.isSystemGreenAtRisk ? 'yes' : 'no', treatment: 'inferred' },
        { label: 'Reported Green Risk', value: a.greenAtRisk.isReportedGreenRisk ? 'yes' : 'no', treatment: 'inferred' },
        { label: 'Status conflict', value: h.statusConflict === null ? 'none' : h.statusConflict.direction },
      ], ['health', 'forecast']),
    },
  ];

  // --- Health dimensions ----------------------------------------------------
  const dimensions: readonly DimensionDto[] = h.dimensions.map((dim) => ({
    id: dim.dimensionId,
    name: dim.name,
    metricId: dim.metricId,
    weight: qtyAsPercent(qty(dim.weight), 0),
    score: scoreOf(dim.score),
    contribution: dim.contribution === null ? NOT_COMPUTABLE : scoreOf(dim.contribution),
    computable: dim.score !== null,
    ...(dim.notComputableReason === undefined ? {} : { notComputableReason: dim.notComputableReason }),
    inputs: dim.inputs.map((i) => ({
      metricId: i.metricId,
      label: i.signalId.toLowerCase().replace(/_/g, ' '),
      observed: i.observed === null ? 'not supplied' : trimSignal(i.observed),
      weight: qtyAsPercent(qty(i.weight), 0),
      band: `green at ${i.greenEdge}, red at ${i.redEdge}`,
      state: i.state,
      ...(i.reasonCode === undefined ? {} : { reasonCode: i.reasonCode }),
      ...(i.materiality === undefined ? {} : { materiality: i.materiality }),
    })),
    evidence: ev(dim.name, dim.metricId, [
      { label: 'Score', value: scoreOf(dim.score), treatment: 'computed' },
      { label: 'Weight in composite', value: qtyAsPercent(qty(dim.weight), 0) },
      { label: 'Contribution', value: dim.contribution === null ? NOT_COMPUTABLE : scoreOf(dim.contribution), treatment: 'computed' },
      ...dim.inputs.map((i) => ({
        label: i.signalId.toLowerCase().replace(/_/g, ' '),
        value: i.observed === null ? 'not supplied' : trimSignal(i.observed),
        treatment: 'fact' as const,
      })),
    ], ['health']),
  }));

  // --- Commitment comparison ------------------------------------------------
  // Three baselines, side by side (ADR-0003): what we sold, what the contract now says, and what we
  // now expect. An executive review that shows only the last two cannot see scope leakage, and one
  // that shows only the first two cannot see delivery risk.
  const gmVar = ratioVariance(sold.soldGmPercentAsSold, e.forecastGmPercent);
  const eacVar = moneyVariance(sold.budgetedCostAsSold, e.estimateAtCompletion, false);
  const commitment: readonly ComparisonRowDto[] = [
    {
      label: 'Gross margin %',
      originalSold: pct(sold.soldGmPercentAsSold),
      // No current-contractual gross margin percentage is registered in METRIC_CATALOG.md. The
      // contract value and budgeted cost both have a CURRENT_CONTRACTUAL baseline (MET-FIN-002,
      // MET-FIN-004) but their ratio does not, so inventing one here would put an unregistered
      // metric on an executive page. The two columns that *are* defined carry the comparison.
      currentContract: 'no registered metric',
      currentForecast: pct(e.forecastGmPercent),
      variance: gmVar.display,
      sentiment: gmVar.sentiment,
      treatment: 'computed',
      metricId: 'MET-FIN-012 → MET-FIN-014',
    },
    {
      label: 'Cost at completion (EAC)',
      originalSold: formatMoneyCompact(sold.budgetedCostAsSold),
      currentContract: formatMoneyCompact(e.budgetedCostCurrentContractual),
      currentForecast: formatMoneyCompact(e.estimateAtCompletion),
      variance: eacVar.display,
      sentiment: eacVar.sentiment,
      treatment: 'computed',
      metricId: 'MET-FIN-008',
    },
    {
      label: 'Contract value',
      originalSold: formatMoneyCompact(sold.contractValueAsSold),
      currentContract: formatMoneyCompact(e.contractualRevenue),
      currentForecast: formatMoneyCompact(e.forecastRevenue),
      variance: moneyVariance(sold.contractValueAsSold, e.forecastRevenue, true).display,
      sentiment: moneyVariance(sold.contractValueAsSold, e.forecastRevenue, true).sentiment,
      treatment: 'computed',
      metricId: 'MET-FIN-010',
    },
    {
      label: 'Physical completion (planned vs actual)',
      // There is no as-sold physical completion: a baseline states when work will be done, not how
      // much of it is done today. The dash is the honest cell, not a missing number.
      originalSold: '—',
      currentContract: plannedCompletionOf(input),
      currentForecast: actualCompletionOf(input),
      variance: formatPercentagePoints(e.progressVariance),
      sentiment: progressSentiment(e.progressVariance),
      treatment: 'fact',
      metricId: 'MET-DEL-017 vs MET-DEL-016',
    },
    {
      label: 'End date',
      originalSold: sold.committedEndDate,
      currentContract: id.committedEndDate,
      currentForecast: d.scheduleVarianceDays.value === null
        ? NOT_COMPUTABLE
        : signedDays(d.scheduleVarianceDays.value),
      variance: d.scheduleVarianceDays.value === null
        ? (d.scheduleVarianceDays.notComputableReason ?? NOT_COMPUTABLE)
        : signedDays(d.scheduleVarianceDays.value),
      sentiment: (d.scheduleVarianceDays.value ?? 0) > 0 ? 'negative' : 'neutral',
      treatment: 'computed',
      metricId: 'MET-DEL-011',
    },
    {
      label: 'Next critical milestone',
      originalSold: d.nextCriticalMilestone?.baselineDate ?? '—',
      currentContract: d.nextCriticalMilestone?.baselineDate ?? '—',
      currentForecast: d.nextCriticalMilestone?.forecastDate ?? 'none outstanding',
      variance: d.nextCriticalMilestone === null
        ? 'no outstanding payment-gating milestone'
        : signedDays(d.nextCriticalMilestone.slipDays),
      sentiment: (d.nextCriticalMilestone?.slipDays ?? 0) > 0 ? 'negative' : 'neutral',
      treatment: 'fact',
      metricId: 'MET-DEL-009',
    },
    {
      label: 'Commercial exposure',
      originalSold: formatMoneyCompact(zero),
      currentContract: formatMoneyCompact(input.uncommercialisedExposure),
      currentForecast: formatMoneyCompact(e.incrementalRiskExposure),
      variance: moneyVariance(zero, input.uncommercialisedExposure.plus(e.incrementalRiskExposure), false).display,
      sentiment: 'negative',
      treatment: 'computed',
      metricId: 'MET-COM-009',
    },
  ];

  // --- Financial strip ------------------------------------------------------
  const financial: readonly FinancialLineDto[] = [
    { label: 'Actual cost to date', value: formatMoneyCompact(e.actualCost), metricId: 'MET-FIN-005', treatment: 'fact' },
    { label: 'Bottom-up ETC', value: formatMoneyCompact(e.estimateAtCompletion.minus(e.actualCost)), metricId: 'MET-FIN-007', treatment: 'computed' },
    { label: 'EAC', value: formatMoneyCompact(e.estimateAtCompletion), metricId: 'MET-FIN-008', treatment: 'computed' },
    { label: 'Sold GM %', value: pct(e.soldGmPercent), metricId: 'MET-FIN-012', treatment: 'computed' },
    { label: 'Forecast GM %', value: pct(e.forecastGmPercent), metricId: 'MET-FIN-014', treatment: 'computed' },
    { label: 'Risk-adjusted GM %', value: pct(e.riskAdjustedGmPercent), metricId: 'MET-FIN-033', treatment: 'computed' },
    { label: 'GM erosion', value: `${formatMoneyCompact(e.gmErosionValue)} · ${formatPercentagePoints(e.marginErosionPp)}`, metricId: 'MET-FIN-025', treatment: 'computed' },
    { label: 'GM value at risk', value: formatMoneyCompact(e.gmValueAtRisk), metricId: 'MET-FIN-019', treatment: 'computed' },
  ];

  // --- Progress and burn ----------------------------------------------------
  const plannedPct = plannedCompletionOf(input);
  const actualPct = actualCompletionOf(input);
  const costPct = pct(e.costConsumedPercent);
  const progressBurn = {
    plannedCompletion: plannedPct,
    actualCompletion: actualPct,
    costConsumed: costPct,
    progressVariance: formatPercentagePoints(e.progressVariance),
    burnGap: formatPercentagePoints(e.burnGap),
    narrative: burnNarrative(e.progressVariance, e.burnGap),
    plannedValue: plotValue(input.observed, plannedPct),
    actualValue: plotValue(input.observed, actualPct),
    costValue: plotValue(input.observed, costPct),
    evidence: ev('Progress and burn', 'MET-FIN-027', [
      { label: 'Planned physical completion', value: plannedPct, treatment: 'fact' },
      { label: 'Actual physical completion', value: actualPct, treatment: 'fact' },
      { label: 'Cost consumed', value: costPct, treatment: 'computed' },
      { label: 'Progress variance (MET-DEL-015)', value: formatPercentagePoints(e.progressVariance), treatment: 'computed' },
      { label: 'Burn gap (MET-FIN-027)', value: formatPercentagePoints(e.burnGap), treatment: 'computed' },
    ], ['delivery', 'financial']),
  };

  // --- ETC credibility ------------------------------------------------------
  // MET-FIN-029 has a maturity gate for a reason: a performance-implied EAC extrapolated from 5%
  // completion is arithmetic, not evidence. When the gate is not met the section says so and shows
  // no number, rather than showing a number with a caveat nobody reads.
  const etcApplicable = e.performanceImpliedEac !== null;
  const etcCredibility = {
    applicable: etcApplicable,
    managementEac: formatMoneyCompact(e.estimateAtCompletion),
    performanceImpliedEac: e.performanceImpliedEac === null
      ? NOT_COMPUTABLE : formatMoneyCompact(e.performanceImpliedEac),
    optimismGap: e.etcOptimismGap === null ? NOT_COMPUTABLE : formatMoneyCompact(e.etcOptimismGap),
    narrative: etcApplicable
      ? `Management's EAC is ${formatMoneyCompact(e.estimateAtCompletion)}. Extrapolating the cost `
        + `performance actually demonstrated gives ${formatMoneyCompact(e.performanceImpliedEac as Money)}. `
        + `The gap is ${formatMoneyCompact(e.etcOptimismGap ?? zero)} — the amount the forecast assumes `
        + 'will be recovered by performing better than the project has performed so far.'
      : `Not applicable: ${e.performanceImpliedEacNotComputableReason ?? 'the maturity threshold for a performance-implied EAC is not met'}. `
        + 'No performance-implied figure is shown, because one extrapolated from too little history '
        + 'would look like evidence and would not be.',
    evidence: ev('ETC credibility', 'MET-FIN-030', [
      { label: 'Management EAC (MET-FIN-008)', value: formatMoneyCompact(e.estimateAtCompletion), treatment: 'computed' },
      { label: 'Performance-implied EAC (MET-FIN-029)', value: e.performanceImpliedEac === null ? NOT_COMPUTABLE : formatMoneyCompact(e.performanceImpliedEac), treatment: 'computed' },
      { label: 'Cost performance index (MET-DEL-004)', value: pct(e.costPerformanceIndex, 3), treatment: 'computed' },
      ...(etcApplicable ? [] : [{ label: 'Why not computable', value: e.performanceImpliedEacNotComputableReason ?? 'maturity gate' }]),
    ], ['financial']),
  };

  // --- Milestones -----------------------------------------------------------
  const msDto = (m: typeof d.milestones[number] | null): MilestoneDto | null => m === null ? null : {
    name: m.name,
    baselineDate: m.baselineDate,
    forecastDate: m.forecastDate,
    actualDate: dateLabel(m.actualDate),
    slip: signedDays(m.slipDays),
    state: m.state.toLowerCase().replace(/_/g, ' '),
    paymentGating: m.paymentGating,
  };
  const milestones = {
    last: msDto(d.lastCriticalMilestone),
    next: msDto(d.nextCriticalMilestone),
    hitRate: d.milestoneHitRate.value === null
      ? (d.milestoneHitRate.notComputableReason ?? NOT_COMPUTABLE)
      : qtyAsPercent(d.milestoneHitRate.value),
    slippageDays: d.milestoneSlippageDays.value === null
      ? (d.milestoneSlippageDays.notComputableReason ?? NOT_COMPUTABLE)
      : days(d.milestoneSlippageDays.value),
    atRisk: d.milestonesAtRisk.value === null
      ? (d.milestonesAtRisk.notComputableReason ?? NOT_COMPUTABLE)
      : String(d.milestonesAtRisk.value),
    scheduleVariance: d.scheduleVarianceDays.value === null
      ? (d.scheduleVarianceDays.notComputableReason ?? NOT_COMPUTABLE)
      : signedDays(d.scheduleVarianceDays.value),
    all: d.milestones.map((m) => msDto(m) as MilestoneDto),
    evidence: ev('Milestones', 'MET-DEL-009', [
      { label: 'Total slippage (MET-DEL-009)', value: d.milestoneSlippageDays.value === null ? NOT_COMPUTABLE : days(d.milestoneSlippageDays.value), treatment: 'computed' },
      { label: 'Milestones at risk (MET-DEL-010)', value: d.milestonesAtRisk.value === null ? NOT_COMPUTABLE : String(d.milestonesAtRisk.value), treatment: 'computed' },
      { label: 'Milestones recorded', value: String(d.milestones.length), treatment: 'fact' },
      { label: 'Delivered', value: String(d.milestones.filter((m) => m.actualDate !== null).length), treatment: 'fact' },
    ], ['delivery']),
  };

  // --- Scope and commercial -------------------------------------------------
  // L1 facts only. The L2 siblings — MET-COM-007 pending CR ageing, MET-COM-008 scope change ratio —
  // are blocked by CONFLICT C-21 (ADR-0022 D-2) and are named as blocked rather than omitted, so a
  // reader can see that the section is incomplete by decision and not by accident.
  const scopeCommercial: readonly SignalLineDto[] = [
    { label: 'Executed change requests', value: `${String(observed.executedChangeCount)} · ${formatMoneyCompact(observed.executedChangeValue)}`, metricId: 'contract:ExecutedChange', treatment: 'fact' },
    { label: 'Pending change requests', value: `${String(observed.pendingChangeCount)} · ${formatMoneyCompact(observed.pendingChangeValue)}`, metricId: 'contract:PendingChange', treatment: 'fact' },
    { label: 'Unsecured upside', value: formatMoneyCompact(e.unsecuredUpside), metricId: 'MET-FIN-011', treatment: 'computed' },
    { label: 'Expected pending CR recovery', value: formatMoneyCompact(e.expectedPendingCrRecovery), metricId: 'MET-COM-010', treatment: 'computed' },
    { label: 'Uncommercialised exposure', value: formatMoneyCompact(input.uncommercialisedExposure), metricId: 'MET-COM-009', treatment: 'fact' },
    { label: 'Scope delivered without a change request', value: `${String(observed.uncontractedScopeItems)} item${observed.uncontractedScopeItems === 1 ? '' : 's'}`, metricId: 'delivery:ScopeItem', treatment: 'fact' },
    {
      label: 'Scope change ratio', value: NOT_COMPUTABLE, metricId: 'MET-COM-008', treatment: 'computed',
      notComputableReason: NOT_PLACED_REASON,
    },
    {
      label: 'Pending CR ageing', value: NOT_COMPUTABLE, metricId: 'MET-COM-007', treatment: 'computed',
      notComputableReason: NOT_PLACED_REASON,
    },
  ];

  // --- Quality --------------------------------------------------------------
  const defectTotal = Object.values(observed.openDefectsBySeverity).reduce((n, v) => n + v, 0);
  const acceptedPct = observed.submittedDeliverables === 0
    ? NOT_COMPUTABLE
    : qtyAsPercent(qDiv(qty(String(observed.acceptedDeliverables)), qty(String(observed.submittedDeliverables))));
  const quality: readonly SignalLineDto[] = [
    { label: 'Open defects', value: `${String(defectTotal)} (${severityLabel(observed.openDefectsBySeverity)})`, metricId: 'MET-QUA-001', treatment: 'fact' },
    { label: 'Acceptance blockers', value: String(observed.acceptanceBlockers), metricId: 'MET-QUA-010', treatment: 'fact' },
    { label: 'Accepted deliverables', value: `${String(observed.acceptedDeliverables)} of ${String(observed.submittedDeliverables)} · ${acceptedPct}`, metricId: 'quality:AcceptanceItem', treatment: 'fact' },
    {
      label: 'Rework ratio', value: NOT_COMPUTABLE, metricId: 'MET-QUA-006', treatment: 'computed',
      notComputableReason: NOT_PLACED_REASON,
    },
    {
      label: 'Escaped defect rate', value: NOT_COMPUTABLE, metricId: 'MET-QUA-003', treatment: 'computed',
      notComputableReason: NOT_PLACED_REASON,
    },
    {
      label: 'Defect backlog trend', value: NOT_COMPUTABLE, metricId: 'MET-QUA-009', treatment: 'computed',
      notComputableReason: NOT_PLACED_REASON,
    },
    {
      label: 'Excess rework cost', value: NOT_COMPUTABLE, metricId: 'MET-QUA-012', treatment: 'computed',
      notComputableReason: NOT_PLACED_REASON,
    },
  ];

  // --- Status conflict ------------------------------------------------------
  const conflict = h.statusConflict;
  const statusConflict: StatusConflictDto = {
    present: conflict !== null,
    reportedRag: h.reportedRag ?? 'not reported',
    systemAssessedRag: h.systemAssessedRag,
    effectiveRag: h.effectiveRag,
    overrideApplied: h.overrideApplied,
    direction: conflict?.direction ?? 'none',
    narrative: conflict?.narrative
      ?? (h.reportedRag === null
        ? 'No RAG has been reported for this project, so there is nothing to compare the assessment against.'
        : `The reported status and the system assessment agree at ${h.systemAssessedRag}.`),
    unexplainedBy: conflict?.unexplainedBy ?? [],
    evidence: ev('Status conflict', 'MET-HLTH-030', [
      { label: 'Reported RAG (MET-HLTH-012)', value: h.reportedRag ?? 'not reported', treatment: 'fact' },
      { label: 'System-Assessed RAG (MET-HLTH-011)', value: h.systemAssessedRag, treatment: 'inferred' },
      { label: 'Effective RAG (MET-HLTH-013)', value: h.effectiveRag, treatment: 'inferred' },
      { label: 'Override applied', value: h.overrideApplied ? 'yes' : 'no', treatment: 'fact' },
      { label: 'Divergence (MET-HLTH-030)', value: h.statusDivergence === null ? NOT_COMPUTABLE : String(h.statusDivergence), treatment: 'computed' },
    ], ['health']),
  };

  // --- Data and assurance confidence ---------------------------------------
  const dc = a.dataConfidence;
  // The rule, enforced here rather than left to a reader's judgement: a Green claim needs evidence.
  // A project reported GREEN whose data confidence is LOW, or whose critical domains are stale, is
  // making a claim the evidence does not support — and that is precisely the challenge this page
  // exists to arm a reviewer with.
  const claimsGreen = h.reportedRag === 'GREEN';
  const evidenceThin = dc.band === 'LOW'
    || dc.staleCriticalDomains.length > 0
    || dc.silentCriticalDomains.length > 0;
  const greenClaimSupported = !(claimsGreen && evidenceThin);
  const confidence: ConfidenceDto = {
    dataBand: dc.band,
    dataScore: scoreOf(dc.confidenceScore),
    arithmeticBand: dc.arithmeticBand,
    ...(dc.bandCappedBy === undefined ? {} : { cappedBy: dc.bandCappedBy }),
    forecastBand: a.forecastConfidence.band,
    forecastScore: scoreOf(a.forecastConfidence.score),
    staleDomains: dc.staleCriticalDomains.map((s) => JSON.stringify(s)),
    silentDomains: dc.silentCriticalDomains,
    domainFreshness: Object.entries(input.domainAgeDays).map(([domain, age]) => ({
      domain,
      age: age === null ? 'never reported' : days(age),
    })),
    independentReview: input.lastIndependentReview === undefined
      ? 'No independent or DA review is recorded for this project.'
      : `${input.lastIndependentReview.reviewer} on ${input.lastIndependentReview.reviewedOn}: ${input.lastIndependentReview.outcome}`,
    greenClaimSupported,
    greenClaimNarrative: greenClaimSupported
      ? (claimsGreen
        ? `This project is reported GREEN and the evidence supports presenting it at ${dc.band} data confidence.`
        : 'No Green claim is being made, so the evidence rule does not bind here.')
      : `This project is reported GREEN while its data confidence is ${dc.band}`
        + (dc.staleCriticalDomains.length > 0 ? ` and ${String(dc.staleCriticalDomains.length)} critical domain(s) are stale` : '')
        + (dc.silentCriticalDomains.length > 0 ? ` and ${String(dc.silentCriticalDomains.length)} critical domain(s) have never reported` : '')
        + '. **No evidence means no high confidence in Green** — the claim is not supported and should be challenged.',
    evidence: ev('Data and assurance confidence', 'MET-DQ-005', [
      { label: 'Data confidence band (MET-DQ-005)', value: dc.band, treatment: 'computed' },
      { label: 'Arithmetic band before the ceiling', value: dc.arithmeticBand, treatment: 'computed' },
      ...(dc.bandCappedBy === undefined ? [] : [{ label: 'Capped by', value: dc.bandCappedBy }]),
      { label: 'Completeness (MET-DQ-001)', value: scoreOf(dc.completeness), treatment: 'computed' },
      { label: 'Freshness, worst domain (MET-DQ-002)', value: days(dc.freshnessDays), treatment: 'computed' },
      { label: 'Forecast confidence (MET-DQ-007)', value: a.forecastConfidence.band, treatment: 'computed' },
    ], ['data-quality']),
  };

  // --- Assessment coverage (ADR-0022 D-4) -----------------------------------
  // Reported whether or not it is complete. A `PROVISIONAL` band is a real assessment of *part* of
  // the model, and a reader entitled to challenge a status is entitled to know which part.
  const coverage: AssessmentCoverageDto = {
    status: h.assessmentStatus,
    coverage: h.dimensionCoverage === null ? NOT_COMPUTABLE : qtyAsPercent(h.dimensionCoverage, 0),
    availableWeight: qtyAsPercent(h.availableWeight, 0),
    declaredWeight: qtyAsPercent(h.declaredWeight, 0),
    missing: h.missingDimensions.map((m) => ({
      name: m.name,
      weight: qtyAsPercent(qty(m.weight), 0),
      reason: m.reason,
    })),
    /** Materially applicable evidence that could have existed and does not (ADR-0028 D-2). */
    missingEvidence: h.missingMaterialInputs,
    narrative: h.assessmentStatus === 'COMPLETE'
      ? `All four executive dimensions scored, and every materially applicable input was either measured, a governed known-zero, or a risk that does not exist on this project. The composite rests on ${qtyAsPercent(h.declaredWeight, 0)} of the model's declared weight.`
      : h.assessmentStatus === 'NOT_COMPUTABLE'
        ? 'No executive dimension could be scored, so there is no composite and no System-Assessed band to defend.'
        : h.missingDimensions.length > 0
          ? `**Provisional.** ${String(h.missingDimensions.length)} of ${String(h.dimensions.length)} dimensions could not be scored, so the composite is a weighted mean over `
            + `${qtyAsPercent(h.availableWeight, 0)} of the model's declared ${qtyAsPercent(h.declaredWeight, 0)}. `
            + 'The remaining dimensions carry more influence than their declared weights — this is stated '
            + 'rather than absorbed, because a band computed over part of a model is not the same claim '
            + 'as one computed over all of it.'
          // All four dimensions scored, and the assessment is still incomplete. This is the case
          // ADR-0028 exists for: the score renormalised over the inputs that remained, so losing
          // adverse evidence made the number BETTER, not worse.
          : '**Provisional — all four dimensions scored, but material evidence is missing.** '
            + `${h.missingMaterialInputs.join('; ')}. Those inputs left the weighted mean, so the `
            + 'dimensions carrying them scored **higher** than they would have with the evidence '
            + 'present. A band produced this way says what the available indicators show; it is '
            + 'not a statement that the project is healthy.',
  };

  // --- Executive summary ----------------------------------------------------
  const summary = buildSummary(input, interventionRequired, greenClaimSupported, ev);

  const rc = h.ruleCoverage;
  return {
    asOf: input.asOf,
    week: input.week,
    currency: input.currency,
    ruleVersion: ruleVersionLabel,
    header,
    verdicts,
    dimensions,
    commitment,
    financial,
    progressBurn,
    etcCredibility,
    milestones,
    scopeCommercial,
    quality,
    statusConflict,
    confidence,
    summary,
    coverage,
    bandProvenance: {
      systemAssessedRag: h.systemAssessedRag,
      compositeBand: h.compositeBand ?? NOT_COMPUTABLE,
      decidedBy: h.overrideChangedBand ? 'POLICY_OVERRIDE' : 'WEIGHTED_MODEL',
      firedOverrides: h.firedOverrides,
      narrative: h.overrideChangedBand
        ? `**System RAG ${h.systemAssessedRag} — hard override.** The weighted HEALTH-v2 model banded `
          + `this project ${h.compositeBand ?? 'not computable'} at composite `
          + `${scoreOf(h.compositeScore)}. ${h.firedOverrides.join(', ')} forced RED regardless, `
          + 'because an override exists so a weighted average cannot absorb a catastrophe in one '
          + 'dimension. **The model did not produce this band; a policy rule did.**'
        : `System RAG ${h.systemAssessedRag} from the weighted model, banded against the HEALTH-v2 `
          + 'thresholds. No hard override changed the outcome.',
      applicableControlsEvaluated:
        `${String(rc.overridesFired + rc.overridesClear)}/${String(rc.overridesApplicable)}`,
      allApplicableCriticalControlsEvaluated: rc.allApplicableCriticalControlsEvaluated,
      notApplicableControls: rc.notApplicableCriticalControls.map((c) => ({
        ruleId: c.ruleId, reasonCode: c.reasonCode, reason: c.reason,
      })),
      unevaluatedApplicableControls: rc.unevaluatedApplicableCriticalControls.map((c) => ({
        ruleId: c.ruleId,
        reasonCode: c.reasonCode,
        reason: c.reason,
        requiredEvidence: c.requiredEvidence,
        missingEvidence: c.missingEvidence,
      })),
      configurationErrorControls: rc.configurationErrorCriticalControls,
      coverageNarrative: coverageNarrativeOf(rc),
    },
    interventionRequired,
  };
}

// ---------------------------------------------------------------------------
// Deterministic narrative — STATUS / CAUSE / OUTLOOK / IMPACT / ACTION
// ---------------------------------------------------------------------------

/**
 * The five-part executive summary, generated by rules.
 *
 * **No language model touches this.** The same assessment produces the same five sentences on every
 * run, which is what makes them quotable in a governance forum: a narrative that can vary between
 * two readings of identical facts is a narrative nobody can be held to. Each sentence is assembled
 * from figures the engines already produced, and every number in it appears elsewhere on the page
 * with its own evidence.
 */
function buildSummary(
  input: ProjectExecutiveHealthInput,
  interventionRequired: boolean,
  greenClaimSupported: boolean,
  ev: (t: string, m: string, l: readonly EvidenceLineDto[], s?: readonly string[]) => EvidenceDto,
): ExecutiveSummaryDto {
  const { assessment: a, delivery: d } = input;
  const e = a.economics;
  const h = a.health;
  const deteriorating = a.trajectory.state === 'DETERIORATING'
    || a.trajectory.state === 'RAPIDLY_DETERIORATING';

  // --- STATUS ---------------------------------------------------------------
  const reported = h.reportedRag;
  const status = reported !== null && reported !== h.systemAssessedRag
    ? `Reported ${reported}; the evidence assesses ${h.systemAssessedRag}`
      + `${deteriorating ? ' and the trajectory is deteriorating' : ''}.`
    : `${h.systemAssessedRag}${deteriorating ? ', and deteriorating' : h.systemAssessedRag === 'GREEN' ? ' and stable' : ''}.`;

  // --- CAUSE ----------------------------------------------------------------
  // Ordered by what an executive can act on, not by magnitude: the causes are stated in the order a
  // reviewer would need to ask about them.
  const causes: string[] = [];
  const burnQ = ratioToQuantity(e.burnGap);
  const erosionQ = ratioToQuantity(e.marginErosionPp);
  if (burnQ !== null && qCompare(qty(burnQ), qty('0.02')) > 0) {
    causes.push(`burn is ${formatPercentagePoints(e.burnGap)} ahead of progress`);
  }
  if (erosionQ !== null && qCompare(qty(erosionQ), qty('0')) < 0) {
    causes.push(`margin has eroded ${formatPercentagePoints(e.marginErosionPp)} against the as-sold position`);
  }
  if (d.requiredVelocityRatio.value !== null
    && qCompare(d.requiredVelocityRatio.value, qty('1.05')) > 0) {
    causes.push(
      `the plan now needs ${qFixed(d.requiredVelocityRatio.value, 2)}× the delivery rate the team has demonstrated`,
    );
  }
  if ((d.milestonesAtRisk.value ?? 0) > 0) {
    causes.push(`${String(d.milestonesAtRisk.value)} milestone(s) are forecast past baseline`);
  }
  if (input.observed.acceptanceBlockers > 0) {
    causes.push(`${String(input.observed.acceptanceBlockers)} acceptance blocker(s) are unresolved`);
  }
  const cause = causes.length === 0
    ? 'No individual signal is breaching its threshold; the position is carried by the composite.'
    : `${capitalise(causes.slice(0, 3).join('; '))}.`;

  // --- OUTLOOK --------------------------------------------------------------
  const o30 = a.greenAtRisk.outlook30;
  const o60 = a.greenAtRisk.outlook60;
  const weeks = a.greenAtRisk.weeksToBandChange;
  const outlook = o30 === null && o60 === null
    ? 'No forward band is projected: the signals do not support a projection.'
    : `${o30 ?? 'not projected'} at 30 days, ${o60 ?? 'not projected'} at 60 days`
      + (weeks === null ? '.' : `; ${formatWeeks(weeks)} to the projected band change.`);

  // --- ECONOMIC IMPACT ------------------------------------------------------
  const impact = `${formatMoneyCompact(e.gmValueAtRisk)} of sold margin at risk`
    + `${e.forecastGmValue.isNegative() ? `, and the contract is forecast to complete at a loss of ${formatMoneyCompact(e.forecastGmValue.negated())}` : ''}`
    + `${input.uncommercialisedExposure.isZero() ? '' : `; ${formatMoneyCompact(input.uncommercialisedExposure)} of scope is being delivered without commercial recovery`}.`;

  // --- ACTION ---------------------------------------------------------------
  const actions: string[] = [];
  if (e.etcOptimismGap !== null && !e.etcOptimismGap.isZero()) actions.push('revalidate the ETC against demonstrated cost performance');
  if (!input.uncommercialisedExposure.isZero()) actions.push('commercialise the uncontracted scope');
  if (d.requiredVelocityRatio.value !== null && qCompare(d.requiredVelocityRatio.value, qty('1.05')) > 0) {
    actions.push('close the productivity gap or rebaseline the schedule');
  }
  if (!greenClaimSupported) actions.push('challenge the reported status: the evidence does not support it');
  if (input.observed.acceptanceBlockers > 0) actions.push('clear the acceptance blockers gating revenue');
  const action = actions.length === 0
    ? 'No intervention indicated. Continue monitoring at the current cadence.'
    : `${capitalise(actions.slice(0, 4).join(', '))}${interventionRequired ? ' before the next critical milestone' : ''}.`;

  return {
    status, cause, outlook, economicImpact: impact, action,
    evidence: ev('Executive summary', 'MET-HLTH-011', [
      { label: 'Generated from', value: 'the assessment, by fixed rules — no language model' },
      { label: 'System-Assessed RAG', value: h.systemAssessedRag, treatment: 'inferred' },
      { label: 'Trajectory', value: a.trajectory.state, treatment: 'inferred' },
      { label: 'GM value at risk', value: formatMoneyCompact(e.gmValueAtRisk), treatment: 'computed' },
      { label: 'Causes identified', value: String(causes.length), treatment: 'computed' },
    ], ['health', 'forecast', 'financial']),
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Signal values arrive as long decimal strings; four places is more than an executive can use. */
function trimSignal(raw: string): string {
  const q = qty(raw);
  return qFixed(q, 4);
}

function severityLabel(bySeverity: Readonly<Record<string, number>>): string {
  const parts = Object.entries(bySeverity)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${String(n)} ${k.toLowerCase()}`);
  return parts.length === 0 ? 'none open' : parts.join(', ');
}

/** `MET-DEL-017` — an observed claim, passed through the delivery evaluation, never recomputed. */
function plannedCompletionOf(input: ProjectExecutiveHealthInput): string {
  const claim = input.delivery.progressAtLatest;
  return claim === null ? NOT_COMPUTABLE : qtyAsPercent(qty(claim.plannedCompletion));
}

/** `MET-DEL-016` — likewise observed. */
function actualCompletionOf(input: ProjectExecutiveHealthInput): string {
  const claim = input.delivery.progressAtLatest;
  return claim === null ? NOT_COMPUTABLE : qtyAsPercent(qty(claim.physicalCompletion));
}

/** A 0–100 number a bar may plot. The display string beside it stays authoritative. */
function plotValue(_observed: ObservedSignals, display: string): number {
  if (display === NOT_COMPUTABLE) return 0;
  const cleaned = display.replace('%', '');
  const q = qty(cleaned === '' ? '0' : cleaned);
  return qToNumber(q);
}

function progressSentiment(r: Ratio): 'positive' | 'negative' | 'neutral' {
  const q = ratioToQuantity(r);
  if (q === null) return 'neutral';
  const cmp = qCompare(qty(q), qty('0'));
  return cmp === 0 ? 'neutral' : cmp > 0 ? 'positive' : 'negative';
}

function burnNarrative(progressVariance: Ratio, burnGap: Ratio): string {
  const pv = ratioToQuantity(progressVariance);
  const bg = ratioToQuantity(burnGap);
  if (pv === null || bg === null) {
    return 'Progress variance or burn gap is not computable, so the two cannot be compared.';
  }
  const behind = qCompare(qty(pv), qty('0')) < 0;
  const overBurning = qCompare(qty(bg), qty('0')) > 0;
  if (behind && overBurning) {
    return `Delivery is ${formatPercentagePoints(progressVariance)} behind plan while cost is `
      + `${formatPercentagePoints(burnGap)} ahead of progress. Money is being spent faster than value `
      + 'is being created — the two together, not either alone, are what makes this a margin problem.';
  }
  if (overBurning) {
    return `Progress is on or ahead of plan, but cost is ${formatPercentagePoints(burnGap)} ahead of `
      + 'progress: the work is being done, and it is costing more than it was priced to cost.';
  }
  if (behind) {
    return `Delivery is ${formatPercentagePoints(progressVariance)} behind plan, though cost is not `
      + 'running ahead of progress. This is a schedule problem before it is a margin problem.';
  }
  return 'Progress is on or ahead of plan and cost is tracking progress. No burn concern is indicated.';
}

/**
 * The completeness sentence, derived **from the reason codes** rather than assumed.
 *
 * ADR-0025 emitted one sentence for every unevaluated control — *"the evidence each needs is not
 * available on this project"* — which the final gate disproved on all thirteen cases. A rule that
 * does not apply is not short of evidence, and a broken control is not a project finding. Each of
 * the three states gets the sentence that is true of it (ADR-0026 D-4, §11).
 */
function coverageNarrativeOf(rc: RuleCoverage): string {
  const parts: string[] = [];
  const evaluated = rc.overridesFired + rc.overridesClear;

  parts.push(
    `Applicable Red-forcing controls evaluated: **${String(evaluated)}/${String(rc.overridesApplicable)}** `
    + `(${String(rc.overridesFired)} fired, ${String(rc.overridesClear)} cleared).`,
  );

  if (rc.overridesNotApplicable > 0) {
    const named = rc.notApplicableCriticalControls
      .map((c) => `${c.ruleId} — ${c.reason}`).join(' ');
    parts.push(
      `${String(rc.overridesNotApplicable)} further control`
      + `${rc.overridesNotApplicable === 1 ? ' does' : 's do'} not apply to this project. ${named} `
      + '**This is not missing evidence and is not a finding about delivery.**',
    );
  }

  if (rc.overridesNotComputable > 0) {
    const named = rc.unevaluatedApplicableCriticalControls
      .map((c) => `${c.ruleId} (needs ${c.missingEvidence.join(', ') || c.requiredEvidence.join(', ')})`)
      .join('; ');
    parts.push(
      `**${String(rc.overridesNotComputable)} applicable control`
      + `${rc.overridesNotComputable === 1 ? '' : 's'} could not be evaluated** because required `
      + `evidence is unavailable: ${named}. These are neither fired nor cleared, so this band must `
      + 'not be read as "every applicable catastrophe condition was checked".',
    );
  }

  if (rc.configurationErrorCriticalControls.length > 0) {
    parts.push(
      `**Assessment control issue:** ${String(rc.configurationErrorCriticalControls.length)} `
      + `control${rc.configurationErrorCriticalControls.length === 1 ? '' : 's'} `
      + `(${rc.configurationErrorCriticalControls.join(', ')}) could not run due to system `
      + 'configuration. **This is a control defect, not a statement about this project.**',
    );
  }

  return parts.join(' ');
}
