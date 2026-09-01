/**
 * Forward Risk, Early Warning & Recovery — intervention before Red (Phase 10).
 *
 * **The question this surface answers**: *what will break first, why, how much is at risk, what
 * should happen now, who owns it, by when, and what value can be protected?* Phase 8 says a project
 * is in trouble; Phase 9 says what destroyed the margin; this says what to do while there is still
 * time to change the outcome.
 *
 * ### Four rules this file enforces
 *
 * 1. **A warning is an inference and is labelled as one.** Every warning here is `L3_ASSESSED`
 *    (ADR-0004). It is a rule firing against a stated threshold — **not a probability**. Nothing is
 *    trained, fitted or sampled, and the outlook section says so in those words rather than dressing
 *    a rules engine in the language of a model.
 *
 * 2. **Delivery owns execution; assurance owns follow-through.** A corrective action carries a
 *    delivery owner and a status. A disposition carries an assurance actor and a control clock.
 *    Overdue assurance is an **assurance exception** — a failure of the control, reported against
 *    assurance, never folded into the project's health.
 *
 * 3. **Nothing here changes anything.** No action, warning or scenario mutates a baseline, an ETC or
 *    an official band. Recovery economics is a *scenario* beside the forecast, exactly as
 *    `MET-COM-010` is. The surface proposes; an authorised workflow disposes, and this repository
 *    has no such workflow (DR-036).
 *
 * 4. **Recovery benefit is never double counted.** `computeRecoveryEconomics` banks only the largest
 *    benefit within an incompatibility group, and the actions it discarded are shown with the reason
 *    rather than silently dropped.
 */
import {
  type CurrencyCode, type Money, type Quantity, type Ratio,
  qFixed, qMul, qToNumber, qty,
} from '@platform/decimal';
import type { RuleVersion } from '@platform/provenance';
import type { Instant, WeekId } from '@platform/time';
import type { EarlyWarningAssessment, LateDetectionRate } from '@contexts/forecast';
import type { RecoveryEconomics } from '@contexts/recovery';
import type { ProjectAssessment } from '../metrics/metric-calculation-service.js';
import {
  type EpistemicTreatment, type EvidenceDto, type EvidenceLineDto,
  formatMoneyCompact, formatRatio, formatWeeks, trimDecidingTier,
} from '../portfolio/command-center.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ForwardRiskInput {
  readonly asOf: Instant;
  readonly week: WeekId;
  readonly currency: CurrencyCode;
  readonly zero: Money;
  readonly ruleVersion: RuleVersion;
  readonly projectId: string;
  readonly projectName: string;
  readonly customerAlias: string;
  readonly assessment: ProjectAssessment;
  readonly warnings: EarlyWarningAssessment;
  /** `null` where no recovery plan exists — which is itself a finding, not an empty section. */
  readonly recovery: RecoveryEconomics | null;
  readonly recoveryPlan: {
    readonly id: string;
    readonly openedOn: string;
    readonly targetExitOn: string;
    readonly sponsorActorId: string;
  } | null;
  /**
   * The corrective actions as recorded, joined to the engine's counted result by id.
   *
   * `CountedAction` deliberately carries only what the *economics* needed — whether it counted, the
   * applied benefit and why. Owner, due date and status are delivery facts, so they travel
   * separately rather than being duplicated into the engine's output.
   */
  readonly actionDetails: readonly {
    readonly id: string;
    readonly description: string;
    readonly ownerActorId: string | null;
    readonly dueOn: string | null;
    readonly status: string;
    readonly scheduleBenefitWeeks: number;
    readonly confidence: Quantity;
    readonly executiveDecisionRequired: boolean;
    readonly respondsToSignal: string | null;
  }[];
  /** This project's place in the portfolio's intervention ranking (`MET-PORT-007`). */
  readonly rankNarrative: string | null;
  readonly decidingTier: string | null;
  readonly rankOf: number | null;
  readonly rankedOutOf: number | null;
  /** Portfolio-level late detection (`MET-FCST-030`), where the caller supplied a scope. */
  readonly lateDetection: LateDetectionRate | null;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface SignalRowDto {
  readonly ruleId: string;
  readonly name: string;
  readonly signalId: string;
  readonly metricId: string;
  readonly currentValue: string;
  readonly expectedState: string;
  readonly trend: string;
  readonly severity: string;
  readonly severityDetail: string;
  readonly economicImpact: string;
  readonly scheduleImpact: string;
  readonly ruleVersion: string;
  readonly evidenceAsOf: string;
  readonly narrative: string;
  readonly lifecycle: string;
  readonly lifecycleDetail: string;
  readonly ownerActorId: string;
  readonly dueOn: string;
  readonly executiveDecisionRequired: boolean;
}

export interface OutlookRowDto {
  readonly horizon: string;
  readonly band: string;
  readonly basis: string;
}

export interface RecoveryActionDto {
  readonly id: string;
  readonly issue: string;
  readonly whyItMatters: string;
  readonly recommendedAction: string;
  readonly owner: string;
  readonly dueDate: string;
  readonly gmBenefit: string;
  readonly scheduleBenefit: string;
  readonly confidence: string;
  readonly status: string;
  readonly executiveDecisionRequired: boolean;
  readonly counted: boolean;
  readonly notCountedReason: string;
}

export interface ForwardRiskView {
  readonly asOf: string;
  readonly week: string;
  readonly currency: string;
  readonly ruleVersion: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly customerAlias: string;
  readonly demoMarker: string;
  readonly headline: string;
  readonly signals: readonly SignalRowDto[];
  readonly clearSignals: readonly { readonly ruleId: string; readonly narrative: string }[];
  readonly notEvaluated: readonly { readonly ruleId: string; readonly reason: string }[];
  readonly signalsEvidence: EvidenceDto;
  readonly outlook: {
    readonly rows: readonly OutlookRowDto[];
    readonly derivation: string;
    readonly evidence: EvidenceDto;
  };
  readonly recoveryActions: readonly RecoveryActionDto[];
  readonly recoveryEconomics: {
    readonly available: boolean;
    readonly currentForecastGm: string;
    readonly riskAdjustedGm: string;
    readonly recoveryCaseGm: string;
    readonly probabilityAdjustedGm: string;
    readonly planCredibility: string;
    readonly upliftPoints: string;
    readonly scheduleBenefitWeeks: string;
    readonly narrative: string;
    readonly doubleCountNarrative: string;
    readonly evidence: EvidenceDto;
  };
  readonly assurance: {
    readonly exceptions: readonly SignalRowDto[];
    readonly validatedWithoutAction: readonly SignalRowDto[];
    readonly narrative: string;
    readonly ownershipNarrative: string;
    readonly evidence: EvidenceDto;
  };
  readonly interventionPriority: {
    readonly rank: string;
    readonly narrative: string;
    readonly decidingTier: string;
    readonly evidence: EvidenceDto;
  };
  readonly lateDetection: {
    readonly available: boolean;
    readonly rate: string;
    readonly detail: string;
    readonly narrative: string;
    /** `false` while the historical replay is partial — the figure may not be quoted as a conclusion. */
    readonly executiveAuthoritative: boolean;
    readonly historicalCoverage: string;
    readonly reconstructedDimensions: string;
    readonly unavailableDimensions: string;
    readonly claimQualification: string;
    readonly evidence: EvidenceDto;
  };
  /** Stated on every page: nothing here mutates a baseline, an ETC or an official band. */
  readonly authorityNotice: string;
}

// ---------------------------------------------------------------------------

const NC = 'not computable';

const money = (m: Money | null | undefined): string =>
  (m === null || m === undefined ? NC : formatMoneyCompact(m));

const pct = (r: Ratio | null | undefined): string =>
  (r === null || r === undefined ? NC : formatRatio(r));

const qPct = (q: Quantity | null, decimals = 1): string =>
  (q === null ? NC : `${qFixed(qMul(q, qty('100')), decimals)}%`);

const LIFECYCLE_DETAIL: Readonly<Record<string, string>> = {
  AWAITING_DISPOSITION: 'Detected. Assurance has not yet validated or challenged it, and is inside its control window.',
  OVERDUE_DISPOSITION: 'Detected. Assurance has not dispositioned it and the control window has passed — an assurance exception.',
  VALIDATED_NO_ACTION: 'Validated by assurance, and no corrective action exists against it. Agreed to be real, and nobody is acting.',
  VALIDATED_ACTION_OPEN: 'Validated, with a corrective action open and inside its due date.',
  VALIDATED_ACTION_OVERDUE: 'Validated, with a corrective action past its due date and not complete.',
  VALIDATED_ACTION_COMPLETE: 'Validated, and every linked corrective action is complete.',
  CHALLENGED: 'Assurance challenged the signal — the evidence is disputed, not the delivery position.',
  ACCEPTED_RISK: 'Assurance accepted the risk explicitly. A decision, not an oversight.',
};

function signalRow(w: EarlyWarningAssessment['warnings'][number]): SignalRowDto {
  const openAction = w.linkedActions.find((a) => a.status !== 'COMPLETE') ?? w.linkedActions[0];
  return {
    ruleId: w.ruleId,
    name: w.ruleName,
    signalId: w.signalId,
    metricId: w.metricId ?? '—',
    currentValue: w.observedValue ?? NC,
    expectedState: w.threshold === undefined
      ? 'no threshold set'
      : `${w.comparison} ${w.threshold} fires`,
    trend: w.trend ?? 'not established',
    severity: w.severity,
    severityDetail: w.thresholdMultiple === null
      ? 'past its threshold; distance not expressible against a zero threshold'
      : `${qFixed(w.thresholdMultiple, 2)}× its own threshold`,
    economicImpact: w.estimatedImpact === undefined
      ? 'not estimated for this signal'
      : `${w.estimatedImpact.currency} ${qFixed(qty(w.estimatedImpact.amount), 0)}`,
    scheduleImpact: w.scheduleImpactWeeks === null
      ? 'not estimated'
      : formatWeeks(w.scheduleImpactWeeks),
    ruleVersion: String(w.ruleVersion),
    evidenceAsOf: w.evidenceAsOf,
    narrative: w.narrative,
    lifecycle: w.lifecycle,
    lifecycleDetail: w.assuranceExceptionReason
      ?? LIFECYCLE_DETAIL[w.lifecycle]
      ?? 'Lifecycle state not described.',
    ownerActorId: openAction?.ownerActorId ?? 'unowned',
    dueOn: openAction?.dueOn ?? 'no due date',
    executiveDecisionRequired: w.linkedActions.some((a) => a.executiveDecisionRequired),
  };
}

export function buildForwardRisk(input: ForwardRiskInput): ForwardRiskView {
  const a = input.assessment;
  const e = a.economics;
  const w = input.warnings;
  const ruleVersionLabel = String(input.ruleVersion);

  const ev = (
    title: string, metricId: string, lines: readonly EvidenceLineDto[],
    sources: readonly string[] = ['forecast'],
  ): EvidenceDto => ({
    title, metricId, ruleVersion: ruleVersionLabel, computedAt: input.asOf, lines, sources,
  });

  const signals = w.warnings.map(signalRow);
  const severe = signals.filter((s) => s.severity === 'SEVERE').length;

  // --- headline -------------------------------------------------------------
  const headline = signals.length === 0
    ? `No early-warning rule is firing on this project. ${String(w.clear.length)} of `
      + `${String(w.clear.length + w.notEvaluated.length)} rules evaluated clear; `
      + `${String(w.notEvaluated.length)} could not be evaluated and are named below.`
    : `${String(signals.length)} early-warning rule${signals.length === 1 ? '' : 's'} firing`
      + `${severe > 0 ? `, ${String(severe)} of them severe` : ''}. `
      + `The system assesses this project ${a.health.systemAssessedRag} today; these signals are `
      + 'about where it is heading, and each one fired before a band edge moved.';

  // --- outlook --------------------------------------------------------------
  // The classification rule is stated in full. A rules engine that describes itself in the language
  // of a model — "high risk", "likely" — is making a claim it cannot support.
  const outlook = {
    rows: [
      { horizon: 'Current', band: a.health.systemAssessedRag, basis: 'MET-HLTH-011 — the four HEALTH-v2 dimensions scored against their band edges' },
      { horizon: '30 days', band: a.greenAtRisk.outlook30 ?? 'not projected', basis: 'MET-FCST-020 — the current band projected forward by trajectory state and adverse signal confluence' },
      { horizon: '60 days', band: a.greenAtRisk.outlook60 ?? 'not projected', basis: 'MET-FCST-021 — as 30 days, over the longer horizon' },
      { horizon: '90 days', band: 'not projected', basis: 'No 90-day horizon is registered in METRIC_CATALOG.md. It is absent rather than extrapolated from the 60-day band.' },
    ],
    derivation:
      '**These bands are rule outputs, not probabilities.** Nothing here is trained, fitted or '
      + 'sampled. A projected band is the current band moved by the trajectory state and the number '
      + 'of signals moving adversely at once, against thresholds held as data in TRAJECTORY-v1. '
      + 'Where the surface says a project is heading to Amber it means a stated rule fired against a '
      + 'stated threshold — it does not mean a model assigned it a likelihood, and it is never '
      + 'presented as one.',
    evidence: ev('Forward outlook', 'MET-FCST-022', [
      { label: 'Current band (MET-HLTH-011)', value: a.health.systemAssessedRag, treatment: 'inferred' },
      { label: 'Trajectory (MET-FCST-001)', value: a.trajectory.state, treatment: 'inferred' },
      { label: 'Adverse confluence (MET-FCST-006)', value: String(a.trajectory.adverseConfluence), treatment: 'computed' },
      { label: '30-day band (MET-FCST-020)', value: a.greenAtRisk.outlook30 ?? 'not projected', treatment: 'inferred' },
      { label: '60-day band (MET-FCST-021)', value: a.greenAtRisk.outlook60 ?? 'not projected', treatment: 'inferred' },
      { label: 'Method', value: 'deterministic rule evaluation — no probabilistic model is involved' },
    ], ['forecast', 'health']),
  };

  // --- recovery actions ------------------------------------------------------
  // The engine's verdict joined to the delivery facts. An action the engine discarded is shown
  // **with the reason**, never dropped: a plan that quietly loses half its actions between the
  // register and the page is a plan nobody can audit.
  const countedById = new Map((input.recovery?.actions ?? []).map((c) => [c.id, c]));
  const recoveryActions: readonly RecoveryActionDto[] = input.actionDetails.map((d) => {
    const c = countedById.get(d.id);
    const banked = c === undefined
      ? null
      : c.appliedRevenueBenefit.plus(c.appliedCostBenefit);
    return {
      id: d.id,
      issue: d.respondsToSignal ?? 'not linked to a detected signal',
      whyItMatters: c?.counted === true
        ? 'Counted in the recovery case: it addresses a live signal and nothing larger in its '
          + 'incompatibility group displaces it.'
        : (c?.reason ?? 'Not evaluated by the recovery economics engine.'),
      recommendedAction: d.description,
      owner: d.ownerActorId ?? 'unowned — an unowned action is not a plan',
      dueDate: d.dueOn ?? 'no due date set',
      gmBenefit: c?.counted === true ? money(banked) : money(input.zero),
      scheduleBenefit: formatWeeks(d.scheduleBenefitWeeks),
      confidence: qPct(d.confidence, 0),
      status: d.status,
      executiveDecisionRequired: d.executiveDecisionRequired,
      counted: c?.counted ?? false,
      notCountedReason: c?.counted === true ? '' : (c?.reason ?? 'not evaluated'),
    };
  });

  // --- recovery economics ----------------------------------------------------
  const r = input.recovery;
  const discarded = recoveryActions.filter((x) => !x.counted).length;
  const recoveryEconomics = {
    available: r !== null,
    currentForecastGm: pct(r?.currentForecastGmPercent),
    riskAdjustedGm: pct(r?.riskAdjustedGmPercent),
    recoveryCaseGm: pct(r?.recoveryCaseGmPercent),
    probabilityAdjustedGm: pct(r?.probabilityAdjustedGmPercent),
    planCredibility: r?.planCredibility === null || r?.planCredibility === undefined
      ? NC : qFixed(r.planCredibility, 1),
    upliftPoints: r?.recoveryUpliftPp === null || r?.recoveryUpliftPp === undefined
      ? NC : `${qFixed(qMul(r.recoveryUpliftPp, qty('100')), 1)}pp`,
    scheduleBenefitWeeks: r === null ? NC : formatWeeks(r.scheduleBenefitWeeks),
    narrative: r === null
      ? '**No recovery plan exists for this project.** That is a finding, not an empty section: a '
        + 'project carrying live warnings with nobody accountable for a corrective plan is exactly '
        + 'the gap this surface exists to make visible.'
      : 'Four figures, read together and never singly. The recovery case is what the plan would '
        + 'achieve if every counted action lands as written; the probability-adjusted case discounts '
        + 'each by its own confidence and discounts overdue incomplete actions again. **Both are '
        + 'scenarios beside the forecast, never a replacement for it.**',
    doubleCountNarrative: r === null
      ? 'No plan, so no benefit to double count.'
      : `${String(discarded)} action${discarded === 1 ? '' : 's'} contributed no benefit because a `
        + 'larger action in the same incompatibility group already addresses that root cause. '
        + 'Counting both would bank one saving twice and make the plan look twice as credible as it '
        + 'is — the discarded actions are listed above with the reason rather than dropped.',
    evidence: ev('Recovery economics', 'MET-REC-001', [
      { label: 'Current forecast GM % (MET-FIN-014)', value: pct(r?.currentForecastGmPercent), treatment: 'computed' },
      { label: 'Risk-adjusted GM % (MET-FIN-033)', value: pct(r?.riskAdjustedGmPercent), treatment: 'computed' },
      { label: 'Recovery case GM % (MET-REC-001)', value: pct(r?.recoveryCaseGmPercent), treatment: 'inferred' },
      { label: 'Probability-adjusted GM % (MET-REC-002)', value: pct(r?.probabilityAdjustedGmPercent), treatment: 'inferred' },
      { label: 'Plan credibility (MET-REC-003)', value: r?.planCredibility === null || r?.planCredibility === undefined ? NC : qFixed(r.planCredibility, 1), treatment: 'inferred' },
      { label: 'Actions not counted', value: String(discarded) },
    ], ['recovery', 'financial']),
  };

  // --- assurance -------------------------------------------------------------
  const exceptions = w.assuranceExceptions.map(signalRow);
  const validatedWithoutAction = w.validatedWithoutAction.map(signalRow);
  const assurance = {
    exceptions,
    validatedWithoutAction,
    narrative: exceptions.length === 0 && validatedWithoutAction.length === 0
      ? 'No assurance exception on this project: every fired warning is inside its control window or '
        + 'has been dispositioned, and every validated warning has a corrective action against it.'
      : `${String(exceptions.length)} warning${exceptions.length === 1 ? '' : 's'} past the assurance `
        + `control window and ${String(validatedWithoutAction.length)} validated with no corrective `
        + 'action. **Both are assurance findings, not project findings** — they say something about '
        + 'the control, and neither changes this project\'s health band.',
    ownershipNarrative:
      '**Delivery owns corrective execution. Assurance owns validation, follow-through and '
      + 'escalation.** Assurance does not execute a recovery action and is not accountable for one '
      + 'being late; it is accountable for the warning being reviewed, and for escalating when it '
      + 'is not. Overdue assurance is itself an assurance exception (`PRODUCT_SPEC.md` §3.4 keeps '
      + 'assurance as confidence and exception, not as a weighted health dimension).',
    evidence: ev('Assurance follow-through', 'MET-DQ-005', [
      { label: 'Warnings fired', value: String(signals.length), treatment: 'inferred' },
      { label: 'Past the control window', value: String(exceptions.length), treatment: 'fact' },
      { label: 'Validated with no action', value: String(validatedWithoutAction.length), treatment: 'fact' },
      { label: 'Assurance is', value: 'a confidence and exception surface, never a weighted health dimension' },
    ], ['assurance', 'forecast']),
  };

  // --- intervention priority -------------------------------------------------
  const interventionPriority = {
    rank: input.rankOf === null || input.rankedOutOf === null
      ? 'not ranked in this scope'
      : `${String(input.rankOf)} of ${String(input.rankedOutOf)}`,
    narrative: input.rankNarrative
      ?? 'This project was not part of a ranked scope in this request.',
    decidingTier: input.decidingTier === null || input.decidingTier === ''
      ? 'last in the ranked scope, so no adjacent project to compare against'
      // DR-075: the domain appends an unformatted twelve-digit comparison. Trimmed here for the
      // same reason as on the command centre - see `trimDecidingTier`.
      : trimDecidingTier(input.decidingTier),
    evidence: ev('Intervention priority', 'MET-PORT-007', [
      { label: 'Rank', value: input.rankOf === null ? 'not ranked' : String(input.rankOf), treatment: 'computed' },
      { label: 'Model', value: 'lexicographic over seven ordered tiers (ADR-0019)' },
      { label: 'Economic exposure', value: money(e.gmValueAtRisk), treatment: 'computed' },
      { label: 'Trajectory', value: a.trajectory.state, treatment: 'inferred' },
      { label: 'Data confidence', value: a.dataConfidence.band, treatment: 'computed' },
      { label: 'Note', value: 'A large Green deteriorating rapidly can outrank a small project already Red — exposure and urgency are separated from actionability by design' },
    ], ['portfolio']),
  };

  // --- late detection --------------------------------------------------------
  const ld = input.lateDetection;
  const lateDetection = {
    // "Available" now means *quotable*, not merely computed. A partial replay produces a number and
    // does not produce a conclusion, and the surface must not blur the two.
    available: ld !== null && ld.rate !== null && ld.executiveAuthoritative,
    executiveAuthoritative: ld?.executiveAuthoritative ?? false,
    historicalCoverage: ld?.historicalCoverage ?? 'NONE',
    reconstructedDimensions: (ld?.reconstructedDimensions ?? []).join(', ') || 'none',
    unavailableDimensions: (ld?.unavailableDimensions ?? []).join(', ') || 'none',
    claimQualification: ld?.claimQualification ?? 'Late detection was not computed for this request.',
    rate: ld === null || ld.rate === null
      ? NC
      : ld.executiveAuthoritative
        ? qPct(ld.rate, 1)
        : `${qPct(ld.rate, 1)} (partial history — not an executive conclusion)`,
    detail: ld === null
      ? 'Not computed for this request — no portfolio scope was supplied.'
      : `${String(ld.lateDetections)} of ${String(ld.projectsReachingRed)} projects reaching Red had `
        + 'neither a prior Amber band nor a fired early warning at the period before.',
    narrative: ld === null
      ? 'Late detection is a portfolio measure and needs a scope to compute over.'
      : ld.rate === null
        ? (ld.notComputableReason ?? NC)
        : `${ld.claimQualification} **This measures the product, not the portfolio.** A high rate `
          + 'means the system is confirming failures rather than preventing them, which is the one '
          + 'outcome this product exists to avoid — and it is reported whether or not it flatters us.',
    evidence: ev('Late detection rate', 'MET-FCST-030', [
      { label: 'Projects reaching Red', value: ld === null ? NC : String(ld.projectsReachingRed), treatment: 'computed' },
      { label: 'Late detections', value: ld === null ? NC : String(ld.lateDetections), treatment: 'computed' },
      { label: 'Definition', value: 'reached Red with neither a prior Amber nor a prior fired warning' },
      { label: 'Historical coverage', value: ld?.historicalCoverage ?? 'NONE' },
      { label: 'Dimensions reconstructed', value: (ld?.reconstructedDimensions ?? []).join(', ') || 'none', treatment: 'fact' },
      { label: 'Dimensions NOT reconstructable', value: (ld?.unavailableDimensions ?? []).join(', ') || 'none', treatment: 'fact' },
      { label: 'Quotable as an executive conclusion', value: ld?.executiveAuthoritative === true ? 'yes' : 'NO — partial history (DR-059)' },
      { label: 'Zero denominator', value: 'reported as not computable, never as a 0% rate' },
    ], ['forecast', 'health']),
  };

  return {
    asOf: input.asOf,
    week: input.week,
    currency: input.currency,
    ruleVersion: ruleVersionLabel,
    projectId: input.projectId,
    projectName: input.projectName,
    customerAlias: input.customerAlias,
    demoMarker: 'DEMO — SYNTHETIC DATA',
    headline,
    signals,
    clearSignals: w.clear.map((c) => ({ ruleId: c.ruleId, narrative: c.narrative })),
    notEvaluated: w.notEvaluated,
    signalsEvidence: ev('Emerging signals', 'MET-FCST-025', [
      { label: 'Rule set', value: String(w.ruleSetVersion) },
      { label: 'Rules fired', value: String(signals.length), treatment: 'inferred' },
      { label: 'Rules clear', value: String(w.clear.length), treatment: 'computed' },
      { label: 'Rules not evaluable', value: String(w.notEvaluated.length) },
      { label: 'Severity basis', value: 'distance past the threshold, as a multiple — comparable across signals in different units' },
    ], ['forecast', 'rules']),
    outlook,
    recoveryActions,
    recoveryEconomics,
    assurance,
    interventionPriority,
    lateDetection,
    authorityNotice:
      '**Nothing on this page changes anything.** No warning, action or scenario mutates a baseline, '
      + 'an estimate to complete, or an official RAG band. Recovery figures are scenarios beside the '
      + 'forecast, never a replacement for it, and a status override remains a separate authorised '
      + 'act with its own capability and audit trail (SECURITY_MODEL.md §4.2).',
  };
}

/** Exposed so a test can assert the ordering without reaching into the view. */
export function severityRank(severity: string): number {
  return severity === 'SEVERE' ? 3 : severity === 'HIGH' ? 2 : 1;
}

/** A signed number a chart may plot. The display string beside it stays authoritative. */
export function plotSeverity(multiple: Quantity | null): number {
  return multiple === null ? 0 : qToNumber(qty(qFixed(multiple, 2)));
}

/** Exposed for the surface's ordering assertions. */
export const SIGNAL_ORDER_NOTE =
  'Most severe first, ties broken by rule id so the order is deterministic (AC-7).';
