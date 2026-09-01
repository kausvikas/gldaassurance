/**
 * Margin & Driver Intelligence — the economic diagnostic behind executive health (Phase 9).
 *
 * **The question this surface answers**: *what destroyed margin, how much has already gone, how much
 * more is at risk, how credible is the forecast, and which lever recovers the most?* Phase 8 tells a
 * reviewer a project is in trouble; this tells them **why, in dollars, and what to pull**.
 *
 * ### The four rules this file exists to enforce
 *
 * 1. **The bridge reconciles to the cent.** AC-4. `MET-FIN-018` is computed in the `financial`
 *    context and arrives already reconciled; this service presents it and never adjusts a cause to
 *    make a total work.
 *
 * 2. **Modelled attribution is labelled as modelled.** A cause derived from governed metrics over
 *    observed facts is a different claim from one produced by valuing hours at a chosen rate. Both
 *    appear; only one is accounting truth, and the page says which.
 *
 * 3. **Risk is never double counted, and pending change requests are never base revenue.**
 *    `MET-FIN-032` deducts only *incremental* risk — exposure already provisioned inside ETC is
 *    excluded and the excluded amount is shown, so the control is visible rather than asserted.
 *    `MET-COM-010` enters `MET-FIN-031` only, and only as a scenario (REQ-FIN-005, REQ-MRGN-003).
 *
 * 4. **Scenarios show their assumptions.** No hidden probabilistic maths: each scenario states the
 *    arithmetic that produced it, in the same units the reader is looking at.
 *
 * Every figure is computed and formatted here, server-side. The presentation layer receives strings.
 */
import {
  type CurrencyCode, type Money, type Quantity, type Ratio,
  qFixed, qMul, qToNumber, qty, ratioFromQuantity,} from '@platform/decimal';
import type { RuleVersion } from '@platform/provenance';
import type { Instant, WeekId } from '@platform/time';
import type { MarginBridge } from '@contexts/financial';
import type { CommercialEvaluation } from '@contexts/commercial';
import type { QualityEvaluation } from '@contexts/quality';
import type { ResourceEvaluation } from '@contexts/resource';
import type { DeliveryEvaluation } from '@contexts/delivery';
import type { ProjectAssessment } from '../metrics/metric-calculation-service.js';
import {
  type EpistemicTreatment, type EvidenceDto, type EvidenceLineDto,
  formatMoneyCompact, formatPercentagePoints, formatRatio,
} from '../portfolio/command-center.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** One risk, as the risk register holds it. Probability is a decimal string in [0,1]. */
export interface RiskLine {
  readonly id: string;
  readonly description: string;
  readonly severity: string;
  readonly probability: Quantity;
  readonly costImpact: Money;
  readonly includedInEtc: boolean;
  readonly state: string;
}

/** One historical reporting period, recomputed through the same economics engine. */
export interface TrendPoint {
  readonly period: string;
  readonly forecastGm: Money;
  readonly riskAdjustedGm: Money;
  readonly estimateAtCompletion: Money;
}

export interface MarginIntelligenceInput {
  readonly asOf: Instant;
  readonly week: WeekId;
  readonly currency: CurrencyCode;
  readonly zero: Money;
  readonly ruleVersion: RuleVersion;
  readonly projectId: string;
  readonly projectName: string;
  readonly customerAlias: string;
  readonly assessment: ProjectAssessment;
  readonly bridge: MarginBridge;
  readonly commercial: CommercialEvaluation;
  readonly quality: QualityEvaluation;
  readonly resource: ResourceEvaluation;
  readonly delivery: DeliveryEvaluation;
  readonly risks: readonly RiskLine[];
  /** `MET-FIN-036` / `MET-FIN-037`. */
  readonly contingencyBudget: Money;
  readonly contingencyConsumed: Money;
  /** Ordered oldest-first, 6–12 periods. */
  readonly trend: readonly TrendPoint[];
  /** Blocked person-days attributable to open customer dependencies, where measurable. */
  readonly blockedHours: Quantity | null;
  /** `contract:baseline.blendedRate` — shown beside the actual rate so the drift is legible. */
  readonly soldBlendedRate: Money;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface FigureDto {
  readonly label: string;
  readonly value: string;
  readonly metricId: string;
  readonly treatment: EpistemicTreatment;
  readonly notComputableReason?: string;
}

export interface BridgeStepDto {
  readonly id: string;
  readonly label: string;
  readonly metricId: string | null;
  readonly amount: string;
  /** Signed number for a waterfall to plot. The display string stays authoritative. */
  readonly value: number;
  readonly basis: string;
  /** `true` when the figure rests on a modelling choice rather than on observed accounting. */
  readonly modelled: boolean;
  readonly explanation: string;
}

export interface TrendRowDto {
  readonly period: string;
  readonly forecastGm: string;
  readonly riskAdjustedGm: string;
  readonly estimateAtCompletion: string;
  readonly movement: string;
  readonly note: string;
}

export interface RiskRowDto {
  readonly id: string;
  readonly description: string;
  readonly severity: string;
  readonly probability: string;
  readonly costImpact: string;
  readonly includedInEtc: string;
  readonly incrementalExposure: string;
}

export interface ScenarioDto {
  readonly id: string;
  readonly name: string;
  readonly gmValue: string;
  readonly gmPercent: string;
  readonly delta: string;
  readonly assumptions: readonly string[];
  readonly arithmetic: string;
  readonly tone: 'positive' | 'caution' | 'critical' | 'analytic';
}

export interface DriverRowDto {
  readonly projectId: string;
  readonly projectName: string;
  readonly amount: string;
  readonly value: number;
  readonly basis: string;
}

export interface PortfolioDriversDto {
  readonly scope: string;
  readonly projectCount: number;
  readonly topMarginLoss: readonly DriverRowDto[];
  readonly topRecoverable: readonly DriverRowDto[];
  readonly largestScopeLeakage: readonly DriverRowDto[];
  readonly largestResourceDrift: readonly DriverRowDto[];
  readonly evidence: EvidenceDto;
}

export interface MarginIntelligenceView {
  readonly asOf: string;
  readonly week: string;
  readonly currency: string;
  readonly ruleVersion: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly customerAlias: string;
  readonly demoMarker: string;
  readonly coreFinancials: readonly FigureDto[];
  readonly bridge: {
    readonly openingLabel: string;
    readonly opening: string;
    readonly openingValue: number;
    readonly steps: readonly BridgeStepDto[];
    readonly closingLabel: string;
    readonly closing: string;
    readonly closingValue: number;
    readonly riskAdjustedLabel: string;
    readonly riskAdjusted: string;
    readonly totalDelta: string;
    readonly causeSum: string;
    readonly reconciles: boolean;
    readonly reconciliationNarrative: string;
    /**
     * `MET-FIN-041` — share of the **gross** movement carried by the named causes.
     * Not implied by `reconciles`, and **not** the share of net margin change explained.
     */
    readonly explanatoryCoverage: string;
    readonly explanatoryCoverageMetricId: string;
    readonly explanatoryCoverageNarrative: string;
    readonly residualComponents: readonly BridgeStepDto[];
    readonly rankedDestroyers: readonly BridgeStepDto[];
    readonly evidence: EvidenceDto;
  };
  readonly trend: {
    readonly rows: readonly TrendRowDto[];
    readonly deteriorationStreak: number;
    readonly narrative: string;
    readonly evidence: EvidenceDto;
  };
  readonly riskEconomics: {
    readonly rows: readonly RiskRowDto[];
    readonly grossExposure: string;
    readonly provisionedInEtc: string;
    readonly incrementalExposure: string;
    readonly doubleCountNarrative: string;
    readonly pendingCrRecovery: string;
    readonly pendingCrNarrative: string;
    readonly evidence: EvidenceDto;
  };
  readonly contingency: readonly FigureDto[];
  readonly etcCredibility: {
    readonly applicable: boolean;
    readonly managementEac: string;
    readonly performanceImpliedEac: string;
    readonly optimismGap: string;
    readonly narrative: string;
    readonly evidence: EvidenceDto;
  };
  readonly resourceEconomics: readonly FigureDto[];
  readonly seniorityMix: readonly { readonly band: string; readonly people: string; readonly fte: string }[];
  readonly locationMix: readonly { readonly band: string; readonly people: string; readonly fte: string }[];
  readonly engagementMix: readonly { readonly band: string; readonly people: string; readonly fte: string }[];
  readonly resourceNarrative: string;
  readonly qualityEconomics: readonly FigureDto[];
  readonly dependencyEconomics: readonly FigureDto[];
  readonly dependencyNarrative: string;
  readonly scenarios: readonly ScenarioDto[];
  readonly contractLossWarning: string | null;
  readonly portfolio: PortfolioDriversDto | null;
}

// ---------------------------------------------------------------------------

const NC = 'not computable';

const money = (m: Money | null): string => (m === null ? NC : formatMoneyCompact(m));

const pct = (r: Ratio): string => formatRatio(r);

const qPct = (q: Quantity | null, decimals = 1): string =>
  q === null ? NC : `${qFixed(qMul(q, qty('100')), decimals)}%`;

const num = (q: Quantity | null, decimals = 1): string => (q === null ? NC : qFixed(q, decimals));

/**
 * A signed number a chart may plot, in millions.
 *
 * `qToNumber` is the sanctioned crossing point — the decimal value is scaled and fixed *first*, so
 * the float only ever carries a already-rounded display quantity. The authoritative figure is the
 * string beside it; nothing downstream computes from this number.
 */
function plot(m: Money): number {
  return qToNumber(qty(qFixed(qMul(m.toQuantity(), qty('0.000001')), 4)));
}

function stepOf(c: MarginBridge['causes'][number]): BridgeStepDto {
  return {
    id: c.id,
    label: c.label,
    metricId: c.metricId,
    amount: formatMoneyCompact(c.amount),
    value: plot(c.amount),
    basis: c.basis,
    modelled: c.basis === 'MODELLED',
    explanation: c.explanation,
  };
}

// ---------------------------------------------------------------------------

export function buildMarginIntelligence(
  input: MarginIntelligenceInput,
  portfolio?: PortfolioDriversDto,
): MarginIntelligenceView {
  const e = input.assessment.economics;
  const b = input.bridge;
  const ruleVersionLabel = String(input.ruleVersion);

  const ev = (
    title: string, metricId: string, lines: readonly EvidenceLineDto[],
    sources: readonly string[] = ['financial'],
  ): EvidenceDto => ({
    title, metricId, ruleVersion: ruleVersionLabel, computedAt: input.asOf, lines, sources,
  });

  // --- Core financials ------------------------------------------------------
  const coreFinancials: readonly FigureDto[] = [
    { label: 'Sold revenue', value: money(e.contractualRevenue), metricId: 'MET-FIN-001', treatment: 'fact' },
    { label: 'Current contractual revenue', value: money(e.contractualRevenue), metricId: 'MET-FIN-002', treatment: 'computed' },
    { label: 'Executed CR revenue', value: money(b.residualComponents[0]?.amount ?? input.zero), metricId: 'contract:ExecutedChange', treatment: 'fact' },
    { label: 'Forecast revenue', value: money(e.forecastRevenue), metricId: 'MET-FIN-010', treatment: 'computed' },
    { label: 'Actual cost', value: money(e.actualCost), metricId: 'MET-FIN-005', treatment: 'fact' },
    { label: 'Bottom-up ETC', value: money(e.estimateAtCompletion.minus(e.actualCost)), metricId: 'MET-FIN-007', treatment: 'computed' },
    { label: 'EAC', value: money(e.estimateAtCompletion), metricId: 'MET-FIN-008', treatment: 'computed' },
    { label: 'Sold GM $', value: money(e.soldGmValue), metricId: 'MET-FIN-026', treatment: 'computed' },
    { label: 'Sold GM %', value: pct(e.soldGmPercent), metricId: 'MET-FIN-012', treatment: 'computed' },
    { label: 'Forecast GM $', value: money(e.forecastGmValue), metricId: 'MET-FIN-024', treatment: 'computed' },
    { label: 'Forecast GM %', value: pct(e.forecastGmPercent), metricId: 'MET-FIN-014', treatment: 'computed' },
    { label: 'Risk-adjusted GM $', value: money(e.riskAdjustedGmValue), metricId: 'MET-FIN-032', treatment: 'computed' },
    { label: 'Risk-adjusted GM %', value: pct(e.riskAdjustedGmPercent), metricId: 'MET-FIN-033', treatment: 'computed' },
    { label: 'GM erosion', value: `${money(e.gmErosionValue)} · ${formatPercentagePoints(e.marginErosionPp)}`, metricId: 'MET-FIN-025', treatment: 'computed' },
    { label: 'GM value at risk', value: money(e.gmValueAtRisk), metricId: 'MET-FIN-019', treatment: 'computed' },
    {
      label: 'Potential contract loss',
      value: e.forecastGmValue.isNegative() ? money(e.forecastGmValue.negated()) : money(input.zero),
      metricId: 'MET-FIN-024', treatment: 'computed',
    },
  ];

  // --- Margin bridge --------------------------------------------------------
  const modelledCount = b.causes.filter((c) => c.basis === 'MODELLED').length;
  const bridge = {
    openingLabel: 'Sold GM (MET-FIN-026)',
    opening: money(b.soldGm),
    openingValue: plot(b.soldGm),
    steps: b.causes.map(stepOf),
    closingLabel: 'Forecast GM (MET-FIN-024)',
    closing: money(b.forecastGm),
    closingValue: plot(b.forecastGm),
    riskAdjustedLabel: 'Risk-adjusted GM (MET-FIN-032) — scenario, not accounting',
    riskAdjusted: money(b.riskAdjustedGm),
    totalDelta: money(b.totalDelta),
    causeSum: money(b.causeSum),
    reconciles: b.reconciles,
    reconciliationNarrative: b.reconciles
      ? `The ${String(b.causes.length)} named causes sum to ${money(b.causeSum)}, which is exactly `
        + `MET-FIN-017 (${money(b.totalDelta)}). AC-4 holds to the cent. `
        + `${String(modelledCount)} of them rest on a modelling choice and are marked; the residual `
        + 'is computed as the total less the named causes, so it is named rather than hidden.'
      : `**The bridge does not reconcile**: the causes sum to ${money(b.causeSum)} against a delta `
        + `of ${money(b.totalDelta)}. Do not use this decomposition — a bridge that does not add up `
        + 'is an attribution nobody can defend.',
    explanatoryCoverage: b.explanatoryCoverage === null ? NC : pct(ratioFromQuantity(b.explanatoryCoverage)),
    explanatoryCoverageMetricId: b.explanatoryCoverageMetricId,
    explanatoryCoverageNarrative: b.explanatoryCoverageNarrative,
    residualComponents: b.residualComponents.map(stepOf),
    rankedDestroyers: b.rankedDestroyers.map(stepOf),
    evidence: ev('Margin bridge', 'MET-FIN-018', [
      { label: 'Opening — Sold GM (MET-FIN-026)', value: money(b.soldGm), treatment: 'computed' },
      { label: 'Closing — Forecast GM (MET-FIN-024)', value: money(b.forecastGm), treatment: 'computed' },
      { label: 'Total delta (MET-FIN-017)', value: money(b.totalDelta), treatment: 'computed' },
      { label: 'Sum of causes', value: money(b.causeSum), treatment: 'computed' },
      { label: 'Reconciles to the cent (AC-4)', value: b.reconciles ? 'yes' : 'NO' },
      { label: 'Causes resting on a modelling choice', value: String(modelledCount) },
      { label: `Attributed Movement Coverage, gross (${b.explanatoryCoverageMetricId})`, value: b.explanatoryCoverage === null ? NC : pct(ratioFromQuantity(b.explanatoryCoverage)), treatment: 'computed' },
      { label: 'Gross, not net', value: 'MET-FIN-041 is the share of GROSS movement carried by named causes — not the share of net margin change explained' },
      { label: 'Reconciles vs explains', value: 'AC-4 reconciliation is by construction; coverage is the separate claim (DR-062)' },
    ], ['financial', 'commercial', 'quality', 'resource']),
  };

  // --- GM / EAC trend -------------------------------------------------------
  // A deterioration streak is consecutive periods of falling forecast GM. Counted here rather than
  // eyeballed from a chart, because "three periods in a row" is a claim someone will repeat.
  let streak = 0;
  let best = 0;
  const rows: TrendRowDto[] = [];
  for (let i = 0; i < input.trend.length; i += 1) {
    const point = input.trend[i] as TrendPoint;
    const prior = i === 0 ? null : (input.trend[i - 1] as TrendPoint);
    const delta = prior === null ? null : point.forecastGm.minus(prior.forecastGm);
    const falling = delta !== null && delta.isNegative();
    streak = falling ? streak + 1 : 0;
    best = Math.max(best, streak);
    rows.push({
      period: point.period,
      forecastGm: money(point.forecastGm),
      riskAdjustedGm: money(point.riskAdjustedGm),
      estimateAtCompletion: money(point.estimateAtCompletion),
      movement: delta === null ? 'first period' : `${delta.isNegative() ? '' : '+'}${money(delta)}`,
      note: delta === null
        ? 'Opening observation; there is nothing before it to compare against.'
        : falling
          ? 'Forecast margin fell against the prior period.'
          : delta.isZero()
            ? 'No movement in forecast margin.'
            : 'Forecast margin recovered against the prior period.',
    });
  }
  const trend = {
    rows,
    deteriorationStreak: best,
    narrative: input.trend.length === 0
      ? 'No historical periods are available, so no trend can be shown. This is stated rather than '
        + 'drawn as a flat line.'
      : best === 0
        ? `Forecast margin has not fallen in consecutive periods across the ${String(rows.length)} shown.`
        : `Forecast margin fell in **${String(best)} consecutive period${best === 1 ? '' : 's'}** across `
          + `the ${String(rows.length)} shown. Each point is the same economics engine re-run at that `
          + 'date, not a separately derived history — so the series ends at the figure above it.',
    evidence: ev('GM and EAC trend', 'MET-FIN-024', [
      { label: 'Periods shown', value: String(rows.length), treatment: 'computed' },
      { label: 'Longest deterioration streak', value: String(best), treatment: 'computed' },
      { label: 'Basis', value: 'MET-FIN-024, MET-FIN-032 and MET-FIN-008 recomputed at each period end' },
    ]),
  };

  // --- Risk-adjusted economics ---------------------------------------------
  const riskRows: readonly RiskRowDto[] = input.risks.map((r) => ({
    id: r.id,
    description: r.description,
    severity: r.severity,
    probability: qPct(r.probability, 0),
    costImpact: money(r.costImpact),
    includedInEtc: r.includedInEtc ? 'yes — already provisioned' : 'no',
    incrementalExposure: r.includedInEtc
      ? 'excluded, to avoid double counting'
      : money(r.costImpact.times(r.probability)),
  }));
  const riskEconomics = {
    rows: riskRows,
    grossExposure: money(e.grossRiskExposure),
    provisionedInEtc: money(e.riskProvisionedInEtc),
    incrementalExposure: money(e.incrementalRiskExposure),
    doubleCountNarrative:
      `Gross exposure is ${money(e.grossRiskExposure)}. Of that, ${money(e.riskProvisionedInEtc)} is `
      + 'already inside the ETC and is **excluded** from the risk-adjusted figure, leaving '
      + `${money(e.incrementalRiskExposure)} of incremental exposure. MET-FIN-032 deducts only the `
      + 'incremental amount — subtracting a risk the forecast already carries would charge the '
      + 'project for it twice.',
    pendingCrRecovery: money(e.expectedPendingCrRecovery),
    pendingCrNarrative:
      `${money(e.unsecuredUpside)} of change requests are pending, of which `
      + `${money(e.expectedPendingCrRecovery)} is the probability-weighted expectation (MET-COM-010). `
      + '**Neither figure is in forecast revenue.** MET-COM-010 enters MET-FIN-031 only, and only '
      + 'as a scenario (REQ-FIN-005, REQ-MRGN-003) — unsigned work is not revenue.',
    evidence: ev('Risk-adjusted economics', 'MET-FIN-032', [
      { label: 'Gross risk exposure (MET-RSK-001)', value: money(e.grossRiskExposure), treatment: 'computed' },
      { label: 'Already provisioned in ETC', value: money(e.riskProvisionedInEtc), treatment: 'computed' },
      { label: 'Incremental exposure (MET-RSK-008)', value: money(e.incrementalRiskExposure), treatment: 'computed' },
      { label: 'Unsecured upside (MET-FIN-011)', value: money(e.unsecuredUpside), treatment: 'computed' },
      { label: 'Expected pending CR recovery (MET-COM-010)', value: money(e.expectedPendingCrRecovery), treatment: 'computed' },
    ], ['financial', 'risk', 'commercial']),
  };

  // --- Contingency ----------------------------------------------------------
  const contingency: readonly FigureDto[] = [
    { label: 'Original contingency', value: money(input.contingencyBudget), metricId: 'MET-FIN-036', treatment: 'computed' },
    { label: 'Consumed', value: money(input.contingencyConsumed), metricId: 'MET-FIN-037', treatment: 'fact' },
    { label: 'Remaining', value: money(input.contingencyBudget.minus(input.contingencyConsumed)), metricId: 'MET-FIN-036', treatment: 'computed' },
    { label: '% consumed', value: pct(e.contingencyConsumedPercent), metricId: 'MET-FIN-035', treatment: 'computed' },
    { label: 'Physical completion', value: pct(e.costConsumedPercent), metricId: 'MET-DEL-016', treatment: 'fact' },
    { label: 'Contingency burn gap', value: formatPercentagePoints(e.contingencyBurnGap), metricId: 'MET-FIN-034', treatment: 'computed' },
  ];

  // --- ETC credibility ------------------------------------------------------
  const etcApplicable = e.performanceImpliedEac !== null;
  const etcCredibility = {
    applicable: etcApplicable,
    managementEac: money(e.estimateAtCompletion),
    performanceImpliedEac: money(e.performanceImpliedEac),
    optimismGap: money(e.etcOptimismGap),
    narrative: etcApplicable
      ? `Management forecasts ${money(e.estimateAtCompletion)}. Extrapolating the cost performance `
        + `actually demonstrated gives ${money(e.performanceImpliedEac)}, a gap of `
        + `${money(e.etcOptimismGap)} — the amount the forecast assumes will be recovered by `
        + 'performing better than this project has performed to date.'
      : `Not applicable: ${e.performanceImpliedEacNotComputableReason ?? 'the maturity threshold is not met'}. `
        + 'No performance-implied figure is shown, because one extrapolated from too little history '
        + 'would look like evidence and would not be.',
    evidence: ev('ETC credibility', 'MET-FIN-030', [
      { label: 'Management EAC (MET-FIN-008)', value: money(e.estimateAtCompletion), treatment: 'computed' },
      { label: 'Performance-implied EAC (MET-FIN-029)', value: money(e.performanceImpliedEac), treatment: 'computed' },
      { label: 'Cost performance index (MET-DEL-004)', value: pct(e.costPerformanceIndex), treatment: 'computed' },
      ...(etcApplicable ? [] : [{ label: 'Why not computable', value: e.performanceImpliedEacNotComputableReason ?? 'maturity gate' }]),
    ]),
  };

  // --- Resource economics ---------------------------------------------------
  const r = input.resource;
  const resourceEconomics: readonly FigureDto[] = [
    { label: 'As-sold blended rate', value: money(input.soldBlendedRate), metricId: 'contract:baseline.blendedRate', treatment: 'fact' },
    { label: 'Actual blended rate', value: money(r.actualBlendedRate.value), metricId: 'MET-RES-005', treatment: 'computed', ...(r.actualBlendedRate.notComputableReason === undefined ? {} : { notComputableReason: r.actualBlendedRate.notComputableReason }) },
    { label: 'Blended rate variance', value: money(r.blendedRateVariance.value), metricId: 'MET-RES-005', treatment: 'computed' },
    { label: 'Resource cost drift impact', value: money(r.resourceCostDriftImpact.value), metricId: 'MET-RES-010', treatment: 'computed' },
    { label: 'Hours delivered', value: num(r.actualHours, 0), metricId: 'resource:EffortRecord', treatment: 'fact' },
    { label: 'Planned hours to date', value: num(r.plannedEffortToDate.value, 0), metricId: 'MET-RES-002', treatment: 'computed', ...(r.plannedEffortToDate.notComputableReason === undefined ? {} : { notComputableReason: r.plannedEffortToDate.notComputableReason }) },
    { label: 'Effort variance', value: num(r.effortVarianceHours.value, 0), metricId: 'MET-RES-002', treatment: 'computed' },
    { label: 'Billable utilisation', value: qPct(r.billableUtilisation.value), metricId: 'MET-RES-001', treatment: 'computed' },
    { label: 'Pyramid ratio', value: num(r.pyramidRatio.value, 2), metricId: 'MET-RES-003', treatment: 'computed', ...(r.pyramidRatio.notComputableReason === undefined ? {} : { notComputableReason: r.pyramidRatio.notComputableReason }) },
    { label: 'Pyramid drift vs as-sold', value: num(r.pyramidDrift.value, 2), metricId: 'MET-RES-004', treatment: 'computed' },
    { label: 'Key-person concentration', value: qPct(r.keyPersonConcentration.value), metricId: 'MET-RES-007', treatment: 'computed' },
  ];

  // --- Scenarios ------------------------------------------------------------
  // No hidden probabilistic maths: each scenario states its arithmetic in full.
  const recovery = e.forecastGmValue.plus(e.expectedPendingCrRecovery);
  const downside = e.riskAdjustedGmValue.minus(input.quality.excessReworkCost.value ?? input.zero);
  const scenarios: readonly ScenarioDto[] = [
    {
      id: 'recovery',
      name: 'Recovery case',
      gmValue: money(recovery),
      gmPercent: pct(e.forecastGmPercent),
      delta: `${recovery.minus(e.forecastGmValue).isNegative() ? '' : '+'}${money(recovery.minus(e.forecastGmValue))}`,
      assumptions: [
        `Every pending change request is approved at its assessed probability, contributing ${money(e.expectedPendingCrRecovery)} (MET-COM-010).`,
        'No further risk materialises beyond what the ETC already provisions.',
        'Delivery performance does not deteriorate further.',
      ],
      arithmetic: `MET-FIN-024 ${money(e.forecastGmValue)} + MET-COM-010 ${money(e.expectedPendingCrRecovery)} = ${money(recovery)}`,
      tone: 'positive',
    },
    {
      id: 'most-likely',
      name: 'Most likely',
      gmValue: money(e.forecastGmValue),
      gmPercent: pct(e.forecastGmPercent),
      delta: money(input.zero),
      assumptions: [
        'The current bottom-up ETC is delivered as forecast.',
        'Pending change requests are excluded entirely — unsigned work is not revenue (REQ-FIN-005).',
        'Only risk already provisioned inside the ETC materialises.',
      ],
      arithmetic: `MET-FIN-024 as computed = ${money(e.forecastGmValue)}`,
      tone: 'analytic',
    },
    {
      id: 'downside',
      name: 'Downside',
      gmValue: money(downside),
      gmPercent: pct(e.riskAdjustedGmPercent),
      delta: money(downside.minus(e.forecastGmValue)),
      assumptions: [
        `All incremental unprovisioned risk materialises: ${money(e.incrementalRiskExposure)} (MET-RSK-008).`,
        'No pending change request is approved.',
        `Rework continues above the priced allowance, costing a further ${money(input.quality.excessReworkCost.value)}.`,
      ],
      arithmetic: `MET-FIN-032 ${money(e.riskAdjustedGmValue)} − excess rework ${money(input.quality.excessReworkCost.value)} = ${money(downside)}`,
      tone: 'critical',
    },
  ];

  const contractLossWarning = downside.isNegative() || e.forecastGmValue.isNegative()
    ? `**This contract is forecast to complete at a loss in at least one scenario.** Most likely `
      + `${money(e.forecastGmValue)}, downside ${money(downside)}. A negative gross margin on a `
      + 'fixed-bid contract is a commercial event, not a delivery one — the remedy is contractual '
      + 'before it is operational.'
    : null;

  const q = input.quality;
  const d = input.delivery;

  return {
    asOf: input.asOf,
    week: input.week,
    currency: input.currency,
    ruleVersion: ruleVersionLabel,
    projectId: input.projectId,
    projectName: input.projectName,
    customerAlias: input.customerAlias,
    demoMarker: 'DEMO — SYNTHETIC DATA',
    coreFinancials,
    bridge,
    trend,
    riskEconomics,
    contingency,
    etcCredibility,
    resourceEconomics,
    seniorityMix: r.seniorityMix.map((m) => ({
      band: m.band, people: String(m.people), fte: num(m.fte, 2),
    })),
    locationMix: r.locationMix.map((m) => ({
      band: m.location, people: String(m.people), fte: num(m.fte, 2),
    })),
    engagementMix: r.engagementMix.map((m) => ({
      band: m.engagementType, people: String(m.people), fte: num(m.fte, 2),
    })),
    resourceNarrative:
      'Rates and mix are project-level aggregates. **No individual compensation appears here or in '
      + 'the payload** — SECURITY_MODEL.md §4.3 classifies resource records PERSONAL_DATA, and the '
      + 'engine returns counts, ratios and blended rates only. Location and engagement mix are '
      + 'reported as **sites and contract forms** — never an address or a supplier name (DR-056 '
      + 'closed).',
    qualityEconomics: [
      { label: 'Rework ratio', value: qPct(q.reworkRatio.value), metricId: 'MET-QUA-006', treatment: 'computed' },
      { label: 'Excess rework cost', value: money(q.excessReworkCost.value), metricId: 'MET-QUA-012', treatment: 'computed' },
      { label: 'Acceptance blockers', value: String(q.acceptanceBlockers), metricId: 'MET-QUA-010', treatment: 'fact' },
      { label: 'Open defects', value: String(q.openDefectsTotal), metricId: 'MET-QUA-001', treatment: 'fact' },
      { label: 'Escaped defect rate', value: qPct(q.escapedDefectRate.value), metricId: 'MET-QUA-003', treatment: 'computed' },
    ],
    dependencyEconomics: [
      { label: 'Open customer dependencies', value: String(d.openCustomerDependencies), metricId: 'MET-DEL-023', treatment: 'fact' },
      { label: 'Oldest open dependency', value: d.customerDependencyAgeingDays.value === null ? NC : `${String(d.customerDependencyAgeingDays.value)} days`, metricId: 'MET-DEL-023', treatment: 'computed', ...(d.customerDependencyAgeingDays.notComputableReason === undefined ? {} : { notComputableReason: d.customerDependencyAgeingDays.notComputableReason }) },
      { label: 'Blocked hours', value: input.blockedHours === null ? NC : num(input.blockedHours, 0), metricId: 'MET-DEL-022', treatment: 'fact', ...(input.blockedHours === null ? { notComputableReason: 'no effort is recorded as blocked by a dependency in the synthetic portfolio (DR-057)' } : {}) },
    ],
    dependencyNarrative: input.blockedHours === null
      ? 'The synthetic portfolio records no effort as blocked by a customer dependency, so the cost '
        + 'and schedule impact of waiting cannot be valued (DR-057). The dependency count and age are '
        + 'facts; the economic consequence is **not measured**, and is not estimated here.'
      : `Blocked effort valued at the actual blended rate. Recoverability depends on whether the `
        + 'dependency is contractually the customer’s — which the register records but does not price.',
    scenarios,
    contractLossWarning,
    portfolio: portfolio ?? null,
  };
}
