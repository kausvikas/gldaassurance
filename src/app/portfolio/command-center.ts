/**
 * The Portfolio Command Center service — everything the executive landing surface displays.
 *
 * **AC-1 is a thirty-second budget, and this file is where it is won or lost.** A CDO must go from
 * portfolio load to a named project needing intervention in under thirty seconds and under three
 * interactions. That is not a rendering problem: it is a *decision* about what eight numbers deserve
 * the top of the page, what order the table is in, and what the product is willing to say without
 * being asked. Those decisions are made here, server-side, once — never in a component.
 *
 * ### Three rules this file exists to enforce
 *
 * 1. **Every figure is computed here and formatted here.** The presentation layer receives strings.
 *    `PRODUCT_SPEC.md` §8 lists a metric computed in a component as a *defect*, and ADR-0002 forbids
 *    the browser being the system of record for money. There is no numerator and denominator in a
 *    view model for a component to divide.
 *
 * 2. **Every aggregate is computed over the caller's authorised set — never globally and filtered.**
 *    ADR-0005 §5. The `projects` array handed in *is* the authorised set; this service has no way to
 *    reach a project outside it, because it holds no repository and no query. A portfolio total is a
 *    sum of what the caller may see, so two directors legitimately see different totals (AC-5).
 *
 * 3. **Every number carries its evidence.** AC-3 requires any headline figure to drill to the L1
 *    facts beneath it in ≤3 steps. Each KPI is emitted with a `metricId`, a rule version, the inputs
 *    that produced it and the sources they came from — assembled here, where the inputs exist,
 *    rather than reconstructed later where they do not.
 *
 * ### What this service deliberately does not do
 *
 * It does not rank. It calls `rankInterventionPriority()` (`MET-PORT-007`, ADR-0019) and presents
 * the result, including the tier that decided each adjacent pair. Re-implementing the ordering here
 * would be a second copy of the most consequential semantics in the product.
 *
 * It does not decide Green-at-Risk. It reads `MET-FCST-025` and `MET-HLTH-033` from the assessment
 * and keeps them **separate** (ADR-0018) — a screen showing one label for both has lost the signal.
 */
import {
  type CurrencyCode, type Money, type Quantity, type Ratio,
  isComputable, qAbs, qAdd, qClamp, qCompare, qDiv, qFixed, qNeg, qToNumber, qty,
  ratioToPercentString,
} from '@platform/decimal';
import type { RecordRef, RuleVersion } from '@platform/provenance';
import type { Instant, WeekId } from '@platform/time';
import {
  type ActionabilityEvidence, type PriorityCandidate, type PriorityPolicy, type RiskCauseInput,
  aggregate, portfolioValueAtRisk, rankInterventionPriority,
} from '@contexts/portfolio';
import type { ProjectAssessment } from '../metrics/metric-calculation-service.js';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * One project the caller is authorised to see, with the organisational attributes the filters need.
 *
 * The attributes are **supplied**, not looked up: this service holds no data handle, which is what
 * makes "computed over the authorised set" a structural property rather than a promise.
 */
export interface CommandCenterProject {
  readonly projectId: string;
  readonly name: string;
  /**
   * The contracting model. **Load-bearing, not descriptive**: this surface is the *Fixed-Bid*
   * command centre, and a T&M engagement has no fixed margin to erode — including one in a GM
   * value-at-risk total would be a category error, not a rounding difference.
   */
  readonly engagementModel: string;
  readonly industry: string;
  readonly region: string;
  readonly deliveryGroup: string;
  readonly deliveryLeader: string;
  readonly daOwner: string;
  readonly sizeBand: string;
  readonly assessment: ProjectAssessment;
  /** `MET-COM-009` — scope being delivered without commercial recovery. */
  readonly uncommercialisedExposure: Money;
  /** Forecast loss at completion: the amount by which forecast margin is below zero. */
  readonly contractLossExposure: Money;
  /** Liquidated damages or equivalent already crystallising. */
  readonly contractualPenaltyExposure: Money;
  readonly weeksToCriticalMilestone: number | null;
  /** Evidence of a credible intervention. Never inferred from severity (ADR-0019 D-1). */
  readonly recovery: ActionabilityEvidence;
  /**
   * Open risks with their shared root-cause keys, for `MET-PORT-003` de-duplication.
   *
   * One root cause threatening six projects is **one** exposure; summing it six times inflates the
   * portfolio figure by exactly the amount an executive later has to explain away (ADR-0021, C-20).
   */
  readonly riskCauses: readonly RiskCauseInput[];
  /**
   * The project's position at the previous governed period, where one exists (Phase 13).
   *
   * **Financial position and reported status only** — not a prior health assessment. That asymmetry
   * is a property of the data, not an omission: reported RAG is a dated management declaration the
   * portfolio holds every one of, and forecast economics can be recomputed at an earlier period end
   * by the same engine that produced today's. A prior *system-assessed* band has neither property —
   * health is assessed at the current as-of and no per-period band is stored — so it is absent here
   * and every surface that reports movement says so rather than implying it covers all three.
   *
   * Optional. Its absence is reported, never rendered as no change: "unchanged" and "unknown" are
   * different claims and only one of them is reassuring.
   */
  readonly periodMovement?: {
    readonly priorLabel: string;
    readonly priorForecastRevenue: Money;
    readonly priorEstimateAtCompletion: Money;
    /**
     * The **same series'** latest point, not today's snapshot.
     *
     * Movement must be like-for-like. The governed margin trend is sampled at period ends, and its
     * latest point is not necessarily the current as-of date. Comparing the prior point against
     * today's economics mixes two bases and produces a different figure from the one the Command
     * Center reports for the same question — which is a cross-surface disagreement about a number,
     * not a rounding difference. Both endpoints therefore come from one series.
     */
    readonly currentForecastRevenue: Money;
    readonly currentEstimateAtCompletion: Money;
    readonly priorReportedRag: string | null;
  };
}

/**
 * Which contracting models this surface is about.
 *
 * Declared as data rather than hard-coded, so the population is **stated** where a reviewer can see
 * it rather than implied by a filter buried in a loop. A different surface — a T&M utilisation view,
 * say — supplies a different list and reuses everything else.
 */
export interface PopulationPolicy {
  readonly label: string;
  readonly engagementModels: readonly string[];
}

/** `PRODUCT_SPEC.md` §5: the Portfolio Command Center is the **fixed-bid** executive surface. */
export const FIXED_BID_POPULATION: PopulationPolicy = {
  label: 'Fixed-bid',
  engagementModels: ['FIXED_BID'],
};

export interface CommandCenterInput {
  readonly asOf: Instant;
  readonly week: WeekId;
  readonly currency: CurrencyCode;
  /** Typed zero, so an empty authorised portfolio still totals in a stated currency. */
  readonly zero: Money;
  readonly ruleVersion: RuleVersion;
  readonly priorityPolicy: PriorityPolicy;
  /**
   * **The caller's authorised set.** Nothing outside it may be passed.
   *
   * This is the *authorised universe*, which is not the same thing as the population this surface
   * reports on — see `population`. Both counts are returned, under names that cannot be confused.
   */
  readonly projects: readonly CommandCenterProject[];
  /**
   * The contracting models in scope for this surface. Defaults to fixed-bid.
   *
   * **The filter is applied here, before anything is computed** — before KPI aggregation, before
   * ranking, before the Green-at-Risk counts, before the bubbles, before the table, before the
   * narrative and before every denominator. Filtering at presentation time would leave every
   * aggregate wrong and only the visible rows right, which is the worst of both: a total nobody can
   * reconcile to a list.
   */
  readonly population?: PopulationPolicy;
  /**
   * The same authorised set assessed at the prior reporting period.
   *
   * Optional, and its absence is reported rather than papered over: a KPI with no prior period says
   * so instead of rendering a zero movement, because "unchanged" and "unknown" are different claims
   * and only one of them is reassuring.
   */
  readonly prior?: {
    readonly label: string;
    readonly projects: readonly CommandCenterProject[];
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type EpistemicTreatment = 'fact' | 'computed' | 'inferred';

export interface EvidenceLineDto {
  readonly label: string;
  readonly value: string;
  readonly treatment?: EpistemicTreatment;
}

export interface EvidenceDto {
  readonly title: string;
  readonly metricId?: string;
  readonly ruleVersion?: string;
  readonly computedAt?: string;
  readonly lines: readonly EvidenceLineDto[];
  readonly sources: readonly string[];
}

export interface DeltaDto {
  readonly direction: 'up' | 'down' | 'flat';
  readonly sentiment: 'positive' | 'negative' | 'neutral';
  readonly display: string;
  readonly comparisonLabel: string;
}

export interface KpiDto {
  readonly id: string;
  readonly metricId: string;
  readonly label: string;
  readonly display: string;
  readonly treatment: EpistemicTreatment;
  readonly delta?: DeltaDto;
  readonly evidence: EvidenceDto;
  /** The filter this KPI drills through to. Every KPI has one — AC-3 in one click. */
  readonly filterId: string;
}

export interface GreenAtRiskDriverDto {
  readonly code: string;
  readonly metricId: string;
  readonly projectCount: number;
  readonly exposure: string;
  readonly narrative: string;
}

export interface GreenAtRiskPanelDto {
  readonly systemGreenAtRiskCount: number;
  readonly reportedGreenRiskCount: number;
  readonly contractValue: string;
  readonly gmValueAtRisk: string;
  readonly drivers: readonly GreenAtRiskDriverDto[];
  readonly projectIds: readonly string[];
  readonly reportedGreenRiskProjectIds: readonly string[];
  readonly evidence: EvidenceDto;
}

export interface ExecutiveRowDto {
  readonly rank: number;
  readonly projectId: string;
  readonly name: string;
  readonly industry: string;
  readonly region: string;
  readonly deliveryGroup: string;
  readonly deliveryLeader: string;
  readonly daOwner: string;
  readonly sizeBand: string;
  readonly tcv: string;
  readonly soldGmPercent: string;
  readonly forecastGmPercent: string;
  readonly riskAdjustedGmPercent: string;
  readonly gmValueAtRisk: string;
  readonly progressVariance: string;
  readonly burnGap: string;
  readonly uncommercialisedExposure: string;
  readonly reportedRag: string;
  readonly systemAssessedRag: string;
  readonly trajectory: string;
  readonly outlook30: string;
  readonly outlook60: string;
  readonly forecastConfidence: string;
  readonly dataConfidence: string;
  readonly dataConfidenceCappedBy?: string;
  readonly isSystemGreenAtRisk: boolean;
  readonly isReportedGreenRisk: boolean;
  readonly executiveAction: string;
  readonly actionability: string;
  /**
   * Weeks until the nearest irreversible point — tier 3 of `MET-PORT-007`, already computed by the
   * ranker. Carried onto the row so a reader learns *how much time is left* in the same glance that
   * tells them where to intervene, rather than in a second interaction (AC-1).
   */
  readonly timeCriticality: string;
  /**
   * Tier 6 of `MET-PORT-007` — how much the ranking itself can be trusted, derived from how many
   * tiers could be evaluated. It **qualifies** the order and is never blended into it: a confident
   * ranking of a small problem still sits below an uncertain ranking of a large one.
   */
  readonly rankConfidence: string;
  /** The one tier that put this row above the next. Empty on the last row. */
  readonly outranksBecause: string;
  readonly rankNarrative: string;
  readonly evidenceGaps: readonly string[];
}

export interface BubbleDto {
  readonly projectId: string;
  readonly name: string;
  /** X — financial risk, 0–100. Higher is worse. */
  readonly financialRisk: { readonly value: number; readonly display: string };
  /** Y — delivery risk, 0–100. Higher is worse. */
  readonly deliveryRisk: { readonly value: number; readonly display: string };
  /** Size — TCV. */
  readonly tcv: { readonly value: number; readonly display: string };
  readonly systemAssessedRag: string;
  readonly trajectory: string;
  readonly outlook30: string;
  readonly topDriver: string;
  readonly soldGmPercent: string;
  readonly forecastGmPercent: string;
  readonly gmValueAtRisk: string;
  readonly emphasis: boolean;
}

export interface NarrativeDto {
  readonly id: string;
  readonly tone: 'analytic' | 'positive' | 'caution' | 'critical';
  readonly headline: string;
  readonly body: string;
  readonly treatment: EpistemicTreatment;
  readonly evidence: EvidenceDto;
}

export interface FilterOptionDto {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

export interface FilterDefinitionDto {
  readonly id: string;
  readonly label: string;
  readonly options: readonly FilterOptionDto[];
}

/**
 * The four governed components a portfolio aggregate is built from, per project.
 *
 * **This exists so that a *filtered* portfolio figure is computed by the same formula as the
 * unfiltered one.** `MET-PORT-002` is `(Σ MET-FIN-010 − Σ MET-FIN-008) / Σ MET-FIN-010` — the
 * catalogue states it as "weighted, never a mean of project margins". A caller that only had the
 * per-project percentages could not reproduce it for a subset: weighting those percentages by
 * contract value gives a different number wherever forecast revenue differs from contract value,
 * which is wherever a change request has been executed. That defect was found in the browser runtime
 * at Phase 12 and fixed there by emitting these same four components; the Assistant needs them for
 * the same reason and gets them the same way, so there is one business-truth path rather than two.
 *
 * Emitted as a **separate top-level field**, not folded into `ExecutiveRowDto`, because these are
 * `COMMERCIAL_CONFIDENTIAL` and `ranked` is `DELIVERY_SENSITIVE`. Nesting them would have widened
 * what a delivery-only caller receives, silently, through a field classified for a different
 * audience (DR-046). Separated, the classification is exact and a caller without the commercial
 * grant simply does not receive the array.
 *
 * Quantity strings, never numbers: the recipient reconstructs `Money` and sums decimally.
 */
export interface ProjectContributionDto {
  readonly projectId: string;
  /** MET-FIN-002 */ readonly contractValue: string;
  /** MET-FIN-010 */ readonly forecastRevenue: string;
  /** MET-FIN-008 */ readonly estimateAtCompletion: string;
  /** MET-FIN-019 */ readonly gmValueAtRisk: string;
  /** Sold margin value, so as-sold portfolio margin is aggregable on the same basis. */
  readonly soldGmValue: string;
  /**
   * The movement basis: two endpoints of one governed margin-trend series, plus the previous dated
   * management declaration. `null` where the project has no earlier period. See `periodMovement`
   * for why both endpoints come from the series rather than one from today's snapshot.
   */
  readonly priorForecastRevenue: string | null;
  readonly priorEstimateAtCompletion: string | null;
  readonly currentForecastRevenue: string | null;
  readonly currentEstimateAtCompletion: string | null;
  readonly priorReportedRag: string | null;
  readonly priorPeriodLabel: string | null;
}

export interface CommandCenterView {
  readonly asOf: Instant;
  readonly week: WeekId;
  readonly currency: CurrencyCode;
  /** The population this surface reports on. Every figure below is derived from it, and only it. */
  readonly populationLabel: string;
  /**
   * **The number of projects every figure on this surface is computed over.**
   *
   * The fixed-bid population within the caller's authorised universe — not the universe itself.
   */
  readonly projectCount: number;
  /**
   * How many projects the caller is authorised for **in total**, across all contracting models.
   *
   * Named `authorisedUniverseCount` and never `projectCount`, because the two differ and the
   * difference is exactly the kind that gets quoted into a board pack as portfolio size. A reader
   * who sees this number must not be able to mistake it for the fixed-bid count.
   */
  readonly authorisedUniverseCount: number;
  /** What was excluded and why, by contracting model. Reported, never silent. */
  readonly excludedFromPopulation: readonly { readonly engagementModel: string; readonly count: number }[];
  readonly priorPeriodLabel: string | null;
  readonly kpis: readonly KpiDto[];
  readonly greenAtRisk: GreenAtRiskPanelDto;
  readonly ranked: readonly ExecutiveRowDto[];
  /** Governed aggregation components. COMMERCIAL_CONFIDENTIAL; see `ProjectContributionDto`. */
  readonly contributions: readonly ProjectContributionDto[];
  readonly insufficientEvidence: readonly { readonly projectId: string; readonly reason: string }[];
  readonly bubbles: readonly BubbleDto[];
  readonly whatChanged: readonly NarrativeDto[];
  readonly filters: readonly FilterDefinitionDto[];
  readonly ragDistribution: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Formatting — decimal-safe, done once, here
// ---------------------------------------------------------------------------

const MILLION = qty('1000000');
const THOUSAND = qty('1000');

/**
 * Executive money formatting: `$4.82M`, `$812K`, `$940`.
 *
 * Scaling is `qDiv` on the decimal string, never a float divide, and the sign is handled explicitly
 * so `−$1.10M` reads as a loss rather than as a negative-looking string. Compact because AC-1 is a
 * scanning budget and `$4,820,000.00` costs a reader time no executive surface can afford.
 */
/**
 * The deciding-tier sentence, without the raw comparison the domain appends.
 *
 * **DR-075.** `MET-PORT-007` explains a ranking with a sentence ending in a parenthetical like
 * `(tier 4: 5552145.679817 vs 3224813.110147)` — unrounded, unformatted, twelve significant digits,
 * sitting on an executive page where every other figure reads `$5.55M`. It appeared eight times on
 * the command centre and twice on the forward-risk page.
 *
 * The tier that decided the ranking is the part an executive needs; the raw pair is redundant,
 * because the GM value at risk it is comparing already appears formatted in its own column. So the
 * parenthetical is trimmed here, at the one place executive formatting is owned (Phase 7).
 *
 * **This is a display trim of a display string.** No arithmetic, no rounding, no re-derivation, and
 * the underlying value is untouched — the domain still computes and compares exactly what it did.
 * The domain-side fix, which would carry the comparison as structured fields the application layer
 * formats, is the proper repair and remains open as DR-075.
 */
export function formatRankingFigures(text: string, formattedGmValueAtRisk: string): string {
  /*
   * `rankNarrative` embeds the same unformatted figure a second time - "GM value at risk
   * 5552145.679817" - so trimming the deciding-tier parenthetical alone left four instances on the
   * page. The governed, already-formatted value for this very row is in hand, so it is substituted
   * rather than recomputed: **no arithmetic, no parsing, no `Number()`** (G-FLOAT would reject one).
   */
  return text.replace(/GM value at risk [\d.]+/g, `GM value at risk ${formattedGmValueAtRisk}`);
}

export function trimDecidingTier(outranksBecause: string): string {
  // Keep `(tier 4)`, drop `: 5552145.679817 vs 3224813.110147`. An earlier form of this trim cut
  // the whole parenthetical and removed the tier identity with it - which four Phase 7 tests
  // correctly rejected, because *which tier decided* is the governed part of the explanation and
  // only the raw comparison is the defect.
  return outranksBecause.replace(/\(tier (\d)[^)]*\)/g, '(tier $1)').trim();
}

export function formatMoneyCompact(m: Money): string {
  const q = m.toQuantity();
  const negative = qCompare(q, qty('0')) < 0;
  const abs = qAbs(q);
  const sign = negative ? '−' : '';
  if (qCompare(abs, MILLION) >= 0) {
    const scaled = qDiv(abs, MILLION);
    return `${sign}$${qFixed(scaled ?? qty('0'), 2)}M`;
  }
  if (qCompare(abs, THOUSAND) >= 0) {
    const scaled = qDiv(abs, THOUSAND);
    return `${sign}$${qFixed(scaled ?? qty('0'), 0)}K`;
  }
  return `${sign}$${qFixed(abs, 0)}`;
}

/** A ratio as a percentage, or the stated reason it is not computable — never a silent dash. */
export function formatRatio(r: Ratio, decimals = 1): string {
  const pct = percentOf(r, decimals);
  return pct === null ? 'not computable' : `${qFixed(pct, decimals)}%`;
}

/**
 * A tier-3 clock, in the words a reader can act on.
 *
 * `null` is **not** rendered as `0` or as a dash: no clock known and no time left are opposite
 * statements, and the ranking treats them as opposites too (a project with no clock sorts *after*
 * one with a known clock at the same exposure).
 */
export function formatWeeks(weeks: number | null): string {
  if (weeks === null) return 'no clock known';
  if (weeks <= 0) return 'now';
  return weeks === 1 ? '1 week' : `${String(weeks)} weeks`;
}

/** Percentage points, signed. `−7.9pp` is a different statement from `−7.9%` and must look like one. */
export function formatPercentagePoints(r: Ratio, decimals = 1): string {
  const asPercent = percentOf(r, decimals);
  if (asPercent === null) return 'not computable';
  return `${qCompare(asPercent, qty('0')) > 0 ? '+' : ''}${qFixed(asPercent, decimals)}pp`;
}

/**
 * A ratio as a plain percentage `Quantity`, or `null` when it is not computable.
 *
 * One place converts a `Ratio` to a number-shaped value, and it is decimal-safe. Everything else in
 * this file goes through it, so "not computable" cannot silently become zero anywhere.
 */
function percentOf(r: Ratio, decimals = 4): Quantity | null {
  if (!isComputable(r)) return null;
  const s = ratioToPercentString(r, decimals);
  return s === null ? null : qty(s.replace('%', ''));
}

// ---------------------------------------------------------------------------
// Deltas
// ---------------------------------------------------------------------------

/**
 * A movement between two periods.
 *
 * `worseWhenUp` is supplied by the caller because only the domain knows which way is up for a given
 * metric: GM value at risk rising is bad, forecast margin rising is good, and no arrow knows which.
 * Conflating direction with sentiment is the classic dashboard bug and the type refuses to allow it.
 */
function moneyDelta(
  current: Money, previous: Money | null, label: string, worseWhenUp: boolean,
): DeltaDto | undefined {
  if (previous === null) return undefined;
  const delta = current.minus(previous);
  const q = delta.toQuantity();
  const cmp = qCompare(q, qty('0'));
  const direction = cmp > 0 ? 'up' : cmp < 0 ? 'down' : 'flat';
  const sentiment = cmp === 0
    ? 'neutral'
    : (cmp > 0) === worseWhenUp ? 'negative' : 'positive';
  return {
    direction,
    sentiment,
    display: cmp === 0 ? 'no change' : `${cmp > 0 ? '+' : ''}${formatMoneyCompact(delta)}`,
    comparisonLabel: label,
  };
}

function countDelta(
  current: number, previous: number | null, label: string, worseWhenUp: boolean,
): DeltaDto | undefined {
  if (previous === null) return undefined;
  const delta = current - previous;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const sentiment = delta === 0
    ? 'neutral'
    : (delta > 0) === worseWhenUp ? 'negative' : 'positive';
  return {
    direction,
    sentiment,
    display: delta === 0 ? 'no change' : `${delta > 0 ? '+' : ''}${String(delta)}`,
    comparisonLabel: label,
  };
}

// ---------------------------------------------------------------------------
// Totals over the authorised set
// ---------------------------------------------------------------------------

interface Totals {
  readonly tcv: Money;
  readonly soldGm: Money;
  readonly forecastGm: Money;
  /**
   * `MET-PORT-003` — Σ `MET-FIN-019` over **distinct** eligible projects, each counted once.
   *
   * No cross-project reduction: two projects' margins are disjoint pools, and a shared cause key is
   * a category, not evidence of shared money (ADR-0023).
   */
  readonly gmValueAtRisk: Money;
  /** The most concentrated root cause, for the evidence line. Non-additive with its siblings. */
  readonly topConcentrationCause: string | null;
  readonly topConcentrationValue: Money;
  readonly topConcentrationProjects: number;
  readonly contractLoss: Money;
  readonly uncommercialised: Money;
  readonly amberRedCount: number;
  readonly systemGreenAtRiskCount: number;
  readonly reportedGreenRiskCount: number;
}

/** Sums the authorised set. Every figure below is a sum of what the caller may see, and only that. */
function totalsOf(projects: readonly CommandCenterProject[], zero: Money): Totals {
  const sum = (pick: (p: CommandCenterProject) => Money): Money =>
    projects.reduce((m, p) => m.plus(pick(p)), zero);
  const var003 = portfolioValueAtRisk(
    projects.map((p) => ({
      projectId: p.projectId,
      gmValueAtRisk: p.assessment.economics.gmValueAtRisk,
      risks: p.riskCauses,
    })),
    zero,
  );
  const topCause = var003.concentration[0] ?? null;
  return {
    tcv: sum((p) => p.assessment.economics.contractualRevenue),
    soldGm: sum((p) => p.assessment.economics.soldGmValue),
    forecastGm: sum((p) => p.assessment.economics.forecastGmValue),
    // MET-PORT-003: each distinct project counted exactly once, and nothing subtracted between
    // projects. Shared root cause is concentration, reported separately and never netted off.
    gmValueAtRisk: var003.valueAtRisk,
    topConcentrationCause: topCause?.causeKey ?? null,
    topConcentrationValue: topCause?.exposedValueAtRisk ?? zero,
    topConcentrationProjects: topCause?.exposedProjectCount ?? 0,
    contractLoss: sum((p) => p.contractLossExposure),
    uncommercialised: sum((p) => p.uncommercialisedExposure),
    amberRedCount: projects.filter(
      (p) => p.assessment.health.systemAssessedRag !== 'GREEN',
    ).length,
    systemGreenAtRiskCount: projects.filter((p) => p.assessment.greenAtRisk.isSystemGreenAtRisk).length,
    reportedGreenRiskCount: projects.filter((p) => p.assessment.greenAtRisk.isReportedGreenRisk).length,
  };
}

const sourcesOf = (refs: readonly RecordRef[]): readonly string[] =>
  [...new Set(refs.map((r) => r.context))].sort();

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

/**
 * Builds the entire command-center view from an authorised set.
 *
 * Pure and synchronous. It holds no clock, no repository and no authorization context — the caller
 * has already authorised, resolved scope and fetched, which is why this function cannot leak: there
 * is nothing outside `input.projects` for it to reach.
 */
export function buildCommandCenter(input: CommandCenterInput): CommandCenterView {
  const { zero, asOf, week, ruleVersion } = input;
  const population = input.population ?? FIXED_BID_POPULATION;

  // --- population filter: authorised ∩ in-scope contracting model ------------
  // Applied here and nowhere else. Everything below this line operates on `projects`, which is
  // already the fixed-bid population — so there is no path by which a T&M engagement reaches a
  // total, a rank, a bubble or a denominator.
  const authorisedUniverse = input.projects;
  const projects = authorisedUniverse.filter(
    (p) => population.engagementModels.includes(p.engagementModel),
  );
  const excludedCounts = new Map<string, number>();
  for (const p of authorisedUniverse) {
    if (population.engagementModels.includes(p.engagementModel)) continue;
    excludedCounts.set(p.engagementModel, (excludedCounts.get(p.engagementModel) ?? 0) + 1);
  }
  const excludedFromPopulation = [...excludedCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([engagementModel, count]) => ({ engagementModel, count }));
  const now = totalsOf(projects, zero);
  const before = input.prior === undefined
    ? null
    : totalsOf(
        // The same population policy, or the comparison is between two different portfolios.
        input.prior.projects.filter((p) => population.engagementModels.includes(p.engagementModel)),
        zero,
      );
  const priorLabel = input.prior?.label ?? null;
  const vs = priorLabel === null ? '' : `vs ${priorLabel}`;

  const portfolio = aggregate(
    projects.map((p) => ({
      projectId: p.projectId,
      contractValue: p.assessment.economics.contractualRevenue,
      forecastRevenue: p.assessment.economics.forecastRevenue,
      estimateAtCompletion: p.assessment.economics.estimateAtCompletion,
      gmValueAtRisk: p.assessment.economics.gmValueAtRisk,
    })),
    zero,
  );

  const commonSources = sourcesOf(
    projects.flatMap((p) => p.assessment.health.explanation.evidence),
  );

  const ev = (
    title: string, metricId: string, lines: readonly EvidenceLineDto[],
  ): EvidenceDto => ({
    title,
    metricId,
    ruleVersion: ruleVersion as string,
    computedAt: asOf as string,
    lines,
    sources: commonSources.length > 0 ? commonSources : ['financial', 'delivery', 'commercial'],
  });

  const scopeLine: EvidenceLineDto = {
    label: `${population.label} projects in your authorised scope`,
    value: excludedFromPopulation.length === 0
      ? String(projects.length)
      : `${String(projects.length)} of ${String(authorisedUniverse.length)} authorised `
        + `(${excludedFromPopulation.map((e) => `${String(e.count)} ${e.engagementModel}`).join(', ')} excluded)`,
    treatment: 'fact',
  };

  // --- the eight KPIs ------------------------------------------------------
  // Eight is a ceiling from the brief and a discipline: a ninth number would cost a reader time the
  // thirty-second budget does not have, and every one of these answers a question a CDO actually
  // asks in the first half-minute.
  const kpis: readonly KpiDto[] = [
    {
      id: 'tcv', metricId: 'MET-PORT-001', label: `Total ${population.label.toLowerCase()} TCV`,
      display: formatMoneyCompact(now.tcv), treatment: 'computed',
      ...(moneyDelta(now.tcv, before?.tcv ?? null, vs, false) !== undefined
        ? { delta: moneyDelta(now.tcv, before?.tcv ?? null, vs, false) as DeltaDto } : {}),
      filterId: 'all',
      evidence: ev('Total fixed-bid TCV', 'MET-PORT-001', [
        scopeLine,
        { label: 'Sum of contractual revenue (MET-FIN-002)', value: formatMoneyCompact(now.tcv), treatment: 'fact' },
        { label: 'Aggregated over', value: 'your authorised scope only (ADR-0005 §5)' },
      ]),
    },
    {
      id: 'sold-gm', metricId: 'MET-FIN-026', label: 'Sold GM $',
      display: formatMoneyCompact(now.soldGm), treatment: 'computed',
      ...(moneyDelta(now.soldGm, before?.soldGm ?? null, vs, false) !== undefined
        ? { delta: moneyDelta(now.soldGm, before?.soldGm ?? null, vs, false) as DeltaDto } : {}),
      filterId: 'all',
      evidence: ev('Sold gross margin', 'MET-FIN-026', [
        scopeLine,
        { label: 'Contractual revenue (MET-FIN-002)', value: formatMoneyCompact(now.tcv), treatment: 'fact' },
        { label: 'Sold GM (MET-FIN-026)', value: formatMoneyCompact(now.soldGm), treatment: 'computed' },
      ]),
    },
    {
      id: 'forecast-gm', metricId: 'MET-FIN-024', label: 'Forecast GM $',
      display: formatMoneyCompact(now.forecastGm), treatment: 'computed',
      ...(moneyDelta(now.forecastGm, before?.forecastGm ?? null, vs, false) !== undefined
        ? { delta: moneyDelta(now.forecastGm, before?.forecastGm ?? null, vs, false) as DeltaDto } : {}),
      filterId: 'margin-erosion',
      evidence: ev('Forecast gross margin', 'MET-FIN-024', [
        scopeLine,
        { label: 'Sold GM (MET-FIN-026)', value: formatMoneyCompact(now.soldGm), treatment: 'computed' },
        { label: 'Forecast GM (MET-FIN-024)', value: formatMoneyCompact(now.forecastGm), treatment: 'computed' },
        { label: 'Portfolio forecast margin % (MET-PORT-002)', value: formatRatio(portfolio.forecastMarginPercent), treatment: 'computed' },
        { label: 'Weighted, never a mean of project margins', value: 'MET-PORT-002' },
      ]),
    },
    {
      // **Lineage, stated precisely.** This is `Σ MET-FIN-019` over the in-scope authorised set.
      // It is deliberately **not** labelled MET-PORT-003: that metric's canonical formula subtracts
      // shared-cause duplication (`Σ over shared riskCauseKey groups of (group total − largest
      // single-project contribution)`), and that de-duplication is declared in the portfolio port
      // but not implemented — `aggregate()` performs a plain sum. Labelling a plain sum as
      // MET-PORT-003 would let a UI aggregation silently redefine a frozen metric, which is exactly
      // the failure this closure exists to catch. Recorded as DR-048.
      id: 'gm-var', metricId: 'MET-PORT-003', label: 'GM value at risk',
      display: formatMoneyCompact(now.gmValueAtRisk), treatment: 'computed',
      ...(moneyDelta(now.gmValueAtRisk, before?.gmValueAtRisk ?? null, vs, true) !== undefined
        ? { delta: moneyDelta(now.gmValueAtRisk, before?.gmValueAtRisk ?? null, vs, true) as DeltaDto } : {}),
      filterId: 'gm-var',
      evidence: ev('Gross margin value at risk', 'MET-PORT-003', [
        scopeLine,
        { label: 'Σ per-project MET-FIN-019, each project once', value: formatMoneyCompact(now.gmValueAtRisk), treatment: 'computed' },
        { label: 'Each already net of its own risk double-count', value: 'MET-RSK-008' },
        {
          label: 'Cross-project reduction',
          value: 'none. Two projects\' margins are disjoint pools of money, so there is nothing to '
            + 'de-duplicate between them. A shared risk cause is a category label, not evidence '
            + 'that two projects share a monetary exposure (ADR-0023)',
        },
        {
          label: 'Largest risk concentration',
          value: now.topConcentrationCause === null
            ? 'no cause is recorded against any project in scope'
            : `${now.topConcentrationCause} — ${formatMoneyCompact(now.topConcentrationValue)} of `
              + `value at risk sits on ${String(now.topConcentrationProjects)} projects carrying it. `
              + 'Concentration, not duplication: it is **not** subtracted from the total above',
          treatment: 'computed',
        },
      ]),
    },
    {
      // MET-PORT-009, registered at Phase 7 closure. Previously — incorrectly — shared MET-FIN-024
      // with Forecast GM $, which is a different and much larger figure.
      id: 'contract-loss', metricId: 'MET-PORT-009', label: 'Forecast loss exposure',
      display: formatMoneyCompact(now.contractLoss), treatment: 'computed',
      ...(moneyDelta(now.contractLoss, before?.contractLoss ?? null, vs, true) !== undefined
        ? { delta: moneyDelta(now.contractLoss, before?.contractLoss ?? null, vs, true) as DeltaDto } : {}),
      filterId: 'contract-loss',
      evidence: ev('Forecast loss exposure', 'MET-PORT-009', [
        scopeLine,
        { label: 'Projects forecast to complete below cost', value: String(projects.filter((p) => !p.contractLossExposure.isZero()).length), treatment: 'computed' },
        { label: 'Exposure', value: formatMoneyCompact(now.contractLoss), treatment: 'computed' },
        { label: 'Formula (MET-PORT-009)', value: 'Σ max(0, −MET-FIN-024) over in-scope projects' },
        {
          label: 'Downside only',
          value: 'a profitable project contributes zero, never a negative offset — netting would '
            + 'understate exactly the exposure this figure exists to surface',
        },
      ]),
    },
    {
      id: 'amber-red', metricId: 'MET-PORT-004', label: 'Amber / Red projects',
      display: `${String(now.amberRedCount)} of ${String(projects.length)}`, treatment: 'inferred',
      ...(countDelta(now.amberRedCount, before?.amberRedCount ?? null, vs, true) !== undefined
        ? { delta: countDelta(now.amberRedCount, before?.amberRedCount ?? null, vs, true) as DeltaDto } : {}),
      filterId: 'amber-red',
      evidence: ev('Amber / Red projects', 'MET-PORT-004', [
        scopeLine,
        { label: 'System-Assessed RAG (MET-HLTH-011)', value: 'AMBER or RED', treatment: 'inferred' },
        { label: 'Count', value: String(now.amberRedCount), treatment: 'computed' },
        { label: 'Reported RAG is shown separately and never overwritten', value: 'PRODUCT_SPEC §3.3' },
      ]),
    },
    {
      /**
       * **Reported Green Risk holds the top-eight slot** (Phase 7 closure decision, ADR-0018
       * amendment).
       *
       * Both findings are valid and both are kept. The question is which one a CDO needs in the
       * first thirty seconds, and it is this one: *"where is the operating organisation telling me
       * everything is fine while the evidence says otherwise?"* That is the governance blind spot
       * the product exists to expose, and it is the number that starts a conversation with a
       * reporting line rather than with a trajectory.
       *
       * System Green-at-Risk (`MET-FCST-025`) is the forward-looking companion and remains
       * prominent in the Green-at-Risk panel below — it is a *prediction*, and a prediction is
       * second in an executive's ordering behind a *disagreement happening now*.
       */
      id: 'green-at-risk', metricId: 'MET-HLTH-033', label: 'Reported Green Risk',
      display: String(now.reportedGreenRiskCount), treatment: 'inferred',
      ...(countDelta(now.reportedGreenRiskCount, before?.reportedGreenRiskCount ?? null, vs, true) !== undefined
        ? { delta: countDelta(now.reportedGreenRiskCount, before?.reportedGreenRiskCount ?? null, vs, true) as DeltaDto } : {}),
      filterId: 'reported-green-risk',
      evidence: ev('Reported Green Risk', 'MET-HLTH-033', [
        scopeLine,
        { label: 'Reported RAG (MET-HLTH-012)', value: 'GREEN', treatment: 'fact' },
        { label: 'System evidence', value: 'System-Assessed AMBER/RED, or material deterioration', treatment: 'inferred' },
        { label: 'Reported RAG is never overwritten', value: 'PRODUCT_SPEC §3.3' },
        { label: 'Companion forward indicator', value: `${String(now.systemGreenAtRiskCount)} System Green / Emerging Risk (MET-FCST-025)` },
      ]),
    },
    {
      id: 'uncommercialised', metricId: 'MET-COM-009', label: 'Uncommercialised scope',
      display: formatMoneyCompact(now.uncommercialised), treatment: 'computed',
      ...(moneyDelta(now.uncommercialised, before?.uncommercialised ?? null, vs, true) !== undefined
        ? { delta: moneyDelta(now.uncommercialised, before?.uncommercialised ?? null, vs, true) as DeltaDto } : {}),
      filterId: 'scope-exposure',
      evidence: ev('Uncommercialised scope exposure', 'MET-COM-009', [
        scopeLine,
        { label: 'Projects with exposure', value: String(projects.filter((p) => !p.uncommercialisedExposure.isZero()).length), treatment: 'computed' },
        { label: 'Exposure', value: formatMoneyCompact(now.uncommercialised), treatment: 'computed' },
        { label: 'Definition', value: 'scope being delivered without commercial recovery' },
      ]),
    },
  ];

  // --- ranking (MET-PORT-007, ADR-0019) ------------------------------------
  const candidates: readonly PriorityCandidate[] = projects.map((p) => ({
    projectId: p.projectId,
    exposure: {
      systemAssessedBand: p.assessment.health.systemAssessedRag,
      gmValueAtRisk: p.assessment.economics.gmValueAtRisk.toQuantity(),
      contractualPenaltyExposure: p.contractualPenaltyExposure.isZero()
        ? null : p.contractualPenaltyExposure.toQuantity(),
      forecastContractLoss: p.contractLossExposure.isZero()
        ? null : p.contractLossExposure.toQuantity(),
      isSystemGreenAtRisk: p.assessment.greenAtRisk.isSystemGreenAtRisk,
      outlook30: p.assessment.greenAtRisk.outlook30,
      outlook60: p.assessment.greenAtRisk.outlook60,
      weeksToBandChange: p.assessment.greenAtRisk.weeksToBandChange,
      weeksToCriticalMilestone: p.weeksToCriticalMilestone,
      hardOverridePresent: false,
    },
    actionability: p.recovery,
    dataConfidenceBand: p.assessment.dataConfidence.band,
    forecastConfidenceBand: p.assessment.forecastConfidence.band,
  }));

  const ranking = rankInterventionPriority(week, input.priorityPolicy, candidates);
  const byId = new Map(projects.map((p) => [p.projectId, p]));

  const ranked: readonly ExecutiveRowDto[] = ranking.ranked.flatMap((r) => {
    const p = byId.get(r.projectId);
    if (p === undefined) return [];
    const e = p.assessment.economics;
    const g = p.assessment.greenAtRisk;
    return [{
      rank: r.rank,
      projectId: p.projectId,
      name: p.name,
      industry: p.industry,
      region: p.region,
      deliveryGroup: p.deliveryGroup,
      deliveryLeader: p.deliveryLeader,
      daOwner: p.daOwner,
      sizeBand: p.sizeBand,
      tcv: formatMoneyCompact(e.contractualRevenue),
      soldGmPercent: formatRatio(e.soldGmPercent),
      forecastGmPercent: formatRatio(e.forecastGmPercent),
      riskAdjustedGmPercent: formatRatio(e.riskAdjustedGmPercent),
      gmValueAtRisk: formatMoneyCompact(e.gmValueAtRisk),
      progressVariance: formatPercentagePoints(e.progressVariance),
      burnGap: formatPercentagePoints(e.burnGap),
      uncommercialisedExposure: formatMoneyCompact(p.uncommercialisedExposure),
      reportedRag: g.reportedRag ?? 'Not reported',
      systemAssessedRag: p.assessment.health.systemAssessedRag,
      trajectory: p.assessment.trajectory.state,
      outlook30: g.outlook30 ?? 'not projected',
      outlook60: g.outlook60 ?? 'not projected',
      forecastConfidence: p.assessment.forecastConfidence.band,
      dataConfidence: p.assessment.dataConfidence.band,
      ...(p.assessment.dataConfidence.bandCappedBy !== undefined
        ? { dataConfidenceCappedBy: p.assessment.dataConfidence.bandCappedBy } : {}),
      isSystemGreenAtRisk: g.isSystemGreenAtRisk,
      isReportedGreenRisk: g.isReportedGreenRisk,
      executiveAction: executiveActionFor(r.tiers.criticalExposure, g, r.tiers.actionability),
      actionability: r.tiers.actionability,
      timeCriticality: formatWeeks(r.tiers.timeCriticalityWeeks),
      rankConfidence: r.tiers.rankConfidence,
      outranksBecause: trimDecidingTier(r.outranksBecause),
      rankNarrative: formatRankingFigures(r.narrative, formatMoneyCompact(e.gmValueAtRisk)),
      evidenceGaps: r.evidenceGaps,
    }];
  });

  // --- Green-at-Risk panel (ADR-0018) --------------------------------------
  const garProjects = projects.filter((p) => p.assessment.greenAtRisk.isSystemGreenAtRisk);
  const garTcv = garProjects.reduce((m, p) => m.plus(p.assessment.economics.contractualRevenue), zero);
  const garVar = garProjects.reduce((m, p) => m.plus(p.assessment.economics.gmValueAtRisk), zero);

  const driverCounts = new Map<string, { count: number; metricId: string; exposure: Money }>();
  for (const p of garProjects) {
    for (const reason of p.assessment.greenAtRisk.reasons) {
      const bucket = driverCounts.get(reason.code)
        ?? { count: 0, metricId: reason.metricId, exposure: zero };
      driverCounts.set(reason.code, {
        count: bucket.count + 1,
        metricId: reason.metricId,
        exposure: bucket.exposure.plus(p.assessment.economics.gmValueAtRisk),
      });
    }
  }
  const drivers: readonly GreenAtRiskDriverDto[] = [...driverCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([code, v]) => ({
      code,
      metricId: v.metricId,
      projectCount: v.count,
      exposure: formatMoneyCompact(v.exposure),
      narrative:
        `${String(v.count)} of ${String(garProjects.length)} System Green-at-Risk project`
        + `${v.count === 1 ? '' : 's'} show ${code.toLowerCase().replace(/_/g, ' ')} (${v.metricId}), `
        + `carrying ${formatMoneyCompact(v.exposure)} of GM value at risk.`,
    }));

  const greenAtRisk: GreenAtRiskPanelDto = {
    systemGreenAtRiskCount: garProjects.length,
    reportedGreenRiskCount: now.reportedGreenRiskCount,
    contractValue: formatMoneyCompact(garTcv),
    gmValueAtRisk: formatMoneyCompact(garVar),
    drivers,
    projectIds: garProjects.map((p) => p.projectId),
    reportedGreenRiskProjectIds: projects
      .filter((p) => p.assessment.greenAtRisk.isReportedGreenRisk)
      .map((p) => p.projectId),
    evidence: ev('System Green-at-Risk', 'MET-FCST-025', [
      scopeLine,
      { label: 'System-Assessed GREEN with an adverse 30- or 60-day outlook', value: String(garProjects.length), treatment: 'inferred' },
      { label: 'Contract value', value: formatMoneyCompact(garTcv), treatment: 'computed' },
      { label: 'GM value at risk', value: formatMoneyCompact(garVar), treatment: 'computed' },
      { label: 'Separately: Reported Green Risk (MET-HLTH-033)', value: String(now.reportedGreenRiskCount), treatment: 'inferred' },
    ]),
  };

  // --- bubble matrix -------------------------------------------------------
  const bubbles: readonly BubbleDto[] = projects.map((p) => {
    const e = p.assessment.economics;
    const financial = riskScore(e.gmValueAtRiskRatio);
    const delivery = riskScore(e.progressVariance, true);
    const topDriver = p.assessment.greenAtRisk.reasons[0]?.code
      ?? p.assessment.trajectory.trends.find((t) => t.materiallyAdverse)?.signalId
      ?? 'no adverse driver';
    return {
      projectId: p.projectId,
      name: p.name,
      financialRisk: { value: financial, display: `${financial.toFixed(0)} / 100` },
      deliveryRisk: { value: delivery, display: `${delivery.toFixed(0)} / 100` },
      tcv: { value: moneyToPlot(e.contractualRevenue), display: formatMoneyCompact(e.contractualRevenue) },
      systemAssessedRag: p.assessment.health.systemAssessedRag,
      trajectory: p.assessment.trajectory.state,
      outlook30: p.assessment.greenAtRisk.outlook30 ?? 'not projected',
      topDriver,
      soldGmPercent: formatRatio(e.soldGmPercent),
      forecastGmPercent: formatRatio(e.forecastGmPercent),
      gmValueAtRisk: formatMoneyCompact(e.gmValueAtRisk),
      emphasis: ranked[0]?.projectId === p.projectId,
    };
  });

  // --- what changed --------------------------------------------------------
  const whatChanged = buildNarrative(now, before, priorLabel, drivers, ranked, ev, scopeLine);

  // --- filters -------------------------------------------------------------
  const filters = buildFilters(projects, ranked);

  const ragDistribution: Record<string, number> = { GREEN: 0, AMBER: 0, RED: 0 };
  for (const p of projects) {
    const band = p.assessment.health.systemAssessedRag;
    ragDistribution[band] = (ragDistribution[band] ?? 0) + 1;
  }

  return {
    asOf, week, currency: input.currency,
    populationLabel: population.label,
    projectCount: projects.length,
    authorisedUniverseCount: authorisedUniverse.length,
    excludedFromPopulation,
    priorPeriodLabel: priorLabel,
    kpis, greenAtRisk, ranked,
    /*
     * Emitted in ranked order so a consumer that filters and a consumer that reads the table are
     * looking at the same population in the same sequence. Sourced from the same
     * `assessment.economics` the KPIs were built from, so a filtered aggregate and the unfiltered
     * KPI cannot disagree about what a project contributed.
     */
    contributions: ranked.flatMap((r) => {
      const p = byId.get(r.projectId);
      if (p === undefined) return [];
      const e = p.assessment.economics;
      return [{
        projectId: r.projectId,
        contractValue: e.contractualRevenue.toQuantity(),
        forecastRevenue: e.forecastRevenue.toQuantity(),
        estimateAtCompletion: e.estimateAtCompletion.toQuantity(),
        gmValueAtRisk: e.gmValueAtRisk.toQuantity(),
        soldGmValue: e.soldGmValue.toQuantity(),
        priorForecastRevenue: p.periodMovement?.priorForecastRevenue.toQuantity() ?? null,
        priorEstimateAtCompletion: p.periodMovement?.priorEstimateAtCompletion.toQuantity() ?? null,
        currentForecastRevenue: p.periodMovement?.currentForecastRevenue.toQuantity() ?? null,
        currentEstimateAtCompletion: p.periodMovement?.currentEstimateAtCompletion.toQuantity() ?? null,
        priorReportedRag: p.periodMovement?.priorReportedRag ?? null,
        priorPeriodLabel: p.periodMovement?.priorLabel ?? null,
      }];
    }),
    insufficientEvidence: ranking.insufficientEvidence.map((u) => ({
      projectId: u.projectId, reason: u.reason,
    })),
    bubbles, whatChanged, filters, ragDistribution,
  };
}

/** The action a CDO would take, derived from tiers already decided — never a new judgement. */
function executiveActionFor(
  critical: boolean,
  gar: ProjectAssessment['greenAtRisk'],
  actionability: string,
): string {
  if (critical) return 'Escalate — contractual exposure';
  if (gar.isSystemGreenAtRisk && !gar.interventionWindowOpen) return 'Escalate — window closing';
  if (gar.isSystemGreenAtRisk) return 'Intervene — window open';
  if (gar.isReportedGreenRisk) return 'Challenge reported status';
  if (actionability === 'CREDIBLE_PLAN') return 'Track recovery plan';
  return 'Monitor';
}

/**
 * A 0–100 risk position for the bubble matrix.
 *
 * Axis placement only. The reader never sees this number as a metric — the tooltip shows the
 * underlying figures — and it is derived from ratios the domain already computed, never from raw
 * money. A not-computable ratio places at the origin and the tooltip says why.
 */
function riskScore(r: Ratio, higherRatioIsBetter = false): number {
  const pct = percentOf(r);
  // Not computable places at the neutral midpoint, and the tooltip says why. Placing it at 0 would
  // assert "no risk" about a project nobody has measured.
  if (pct === null) return 50;
  const adverse = higherRatioIsBetter ? qNeg(pct) : pct;
  const clamped = qClamp(adverse, qty('-100'), qty('100'));
  // Map [-100, 100] onto [0, 100]. More adverse is further right and higher up.
  const half = qDiv(clamped, qty('2')) ?? qty('0');
  return qToNumber(qAdd(half, qty('50')));
}

/** TCV in millions, for bubble radius only. Never rendered. */
function moneyToPlot(m: Money): number {
  return qToNumber(qDiv(qAbs(m.toQuantity()), MILLION) ?? qty('0'));
}

function buildNarrative(
  now: Totals,
  before: Totals | null,
  priorLabel: string | null,
  drivers: readonly GreenAtRiskDriverDto[],
  ranked: readonly ExecutiveRowDto[],
  ev: (t: string, m: string, l: readonly EvidenceLineDto[]) => EvidenceDto,
  scopeLine: EvidenceLineDto,
): readonly NarrativeDto[] {
  const out: NarrativeDto[] = [];

  if (before === null || priorLabel === null) {
    out.push({
      id: 'no-prior',
      tone: 'analytic',
      treatment: 'fact',
      headline: 'No prior period is loaded',
      body:
        'Movement against a previous period is not shown because no prior period was supplied. '
        + 'Absence of a comparison is reported rather than rendered as no change — "unchanged" and '
        + '"unknown" are different claims and only one of them is reassuring.',
      evidence: ev('Prior period', 'MET-PORT-001', [scopeLine]),
    });
  } else {
    const garMove = now.systemGreenAtRiskCount - before.systemGreenAtRiskCount;
    if (garMove !== 0) {
      out.push({
        id: 'gar-move',
        tone: garMove > 0 ? 'caution' : 'positive',
        treatment: 'computed',
        headline: `${garMove > 0 ? '+' : ''}${String(garMove)} System Green-at-Risk project${Math.abs(garMove) === 1 ? '' : 's'} ${vsLabel(priorLabel)}`,
        body:
          `${String(now.systemGreenAtRiskCount)} project${now.systemGreenAtRiskCount === 1 ? '' : 's'} `
          + `now assess GREEN today with an adverse 30- or 60-day outlook, against `
          + `${String(before.systemGreenAtRiskCount)} ${vsLabel(priorLabel)}.`,
        evidence: ev('System Green-at-Risk movement', 'MET-FCST-025', [
          scopeLine,
          { label: `Prior (${priorLabel})`, value: String(before.systemGreenAtRiskCount), treatment: 'computed' },
          { label: 'Current', value: String(now.systemGreenAtRiskCount), treatment: 'computed' },
        ]),
      });
    }

    const varDelta = now.gmValueAtRisk.minus(before.gmValueAtRisk);
    if (!varDelta.isZero()) {
      const worse = qCompare(varDelta.toQuantity(), qty('0')) > 0;
      out.push({
        id: 'var-move',
        tone: worse ? 'critical' : 'positive',
        treatment: 'computed',
        headline: `GM value at risk ${worse ? 'up' : 'down'} ${formatMoneyCompact(varDelta)} ${vsLabel(priorLabel)}`,
        body:
          `Portfolio GM value at risk is ${formatMoneyCompact(now.gmValueAtRisk)}, against `
          + `${formatMoneyCompact(before.gmValueAtRisk)} ${vsLabel(priorLabel)}. Computed over your `
          + 'authorised scope only.',
        evidence: ev('GM value at risk movement', 'MET-PORT-003', [
          scopeLine,
          { label: `Prior (${priorLabel})`, value: formatMoneyCompact(before.gmValueAtRisk), treatment: 'computed' },
          { label: 'Current', value: formatMoneyCompact(now.gmValueAtRisk), treatment: 'computed' },
          { label: 'Movement', value: formatMoneyCompact(varDelta), treatment: 'computed' },
        ]),
      });
    }
  }

  const topDriver = drivers[0];
  if (topDriver !== undefined) {
    out.push({
      id: 'top-driver',
      tone: 'caution',
      treatment: 'computed',
      headline: `Largest emerging driver: ${topDriver.code.toLowerCase().replace(/_/g, ' ')}`,
      body: topDriver.narrative,
      evidence: ev('Top Green-at-Risk driver', topDriver.metricId, [
        scopeLine,
        { label: 'Driver', value: topDriver.code },
        { label: 'Projects affected', value: String(topDriver.projectCount), treatment: 'computed' },
        { label: 'GM value at risk carried', value: topDriver.exposure, treatment: 'computed' },
      ]),
    });
  }

  const first = ranked[0];
  if (first !== undefined) {
    out.push({
      id: 'first-intervention',
      tone: 'critical',
      treatment: 'inferred',
      headline: `Intervene first: ${first.name}`,
      body: `${first.rankNarrative} ${first.outranksBecause === '' ? '' : `It outranks the next project because ${trimDecidingTier(first.outranksBecause)}.`}`,
      evidence: ev('Executive intervention priority', 'MET-PORT-007', [
        scopeLine,
        { label: 'Rank 1', value: first.name, treatment: 'inferred' },
        { label: 'GM value at risk', value: first.gmValueAtRisk, treatment: 'computed' },
        { label: 'Ordering model', value: 'lexicographic over 7 tiers (ADR-0019); no composite score' },
      ]),
    });
  }

  return out;
}

const vsLabel = (prior: string): string => `vs ${prior}`;

/**
 * Filter definitions with **counts computed server-side**.
 *
 * The counts matter: a filter that says "Red only" without saying how many is a filter a reader has
 * to click to evaluate, and every avoidable click is spent from the thirty-second budget.
 */
function buildFilters(
  projects: readonly CommandCenterProject[],
  ranked: readonly ExecutiveRowDto[],
): readonly FilterDefinitionDto[] {
  const countBy = (pick: (p: CommandCenterProject) => string): FilterOptionDto[] => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      const key = pick(p);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([value, count]) => ({ value, label: value, count }));
  };

  const all = { value: 'all', label: 'All', count: projects.length };
  const flag = (label: string, n: number): FilterOptionDto[] =>
    [all, { value: 'yes', label, count: n }];

  return [
    { id: 'region', label: 'Region', options: [all, ...countBy((p) => p.region)] },
    { id: 'industry', label: 'Industry', options: [all, ...countBy((p) => p.industry)] },
    { id: 'delivery-group', label: 'Delivery group', options: [all, ...countBy((p) => p.deliveryGroup)] },
    { id: 'delivery-leader', label: 'Delivery leader', options: [all, ...countBy((p) => p.deliveryLeader)] },
    { id: 'da-owner', label: 'DA owner', options: [all, ...countBy((p) => p.daOwner)] },
    { id: 'size', label: 'Project size', options: [all, ...countBy((p) => p.sizeBand)] },
    { id: 'rag', label: 'Current RAG', options: [all, ...countBy((p) => p.assessment.health.systemAssessedRag)] },
    { id: 'trajectory', label: 'Trajectory', options: [all, ...countBy((p) => p.assessment.trajectory.state)] },
    {
      id: 'green-at-risk', label: 'Green-at-Risk',
      options: flag('System Green-at-Risk', projects.filter((p) => p.assessment.greenAtRisk.isSystemGreenAtRisk).length),
    },
    {
      id: 'forecast-confidence', label: 'Forecast confidence',
      options: [all, ...countBy((p) => p.assessment.forecastConfidence.band)],
    },
    {
      id: 'margin-erosion', label: 'Margin erosion',
      options: flag('Eroding', projects.filter((p) => {
        const pct = percentOf(p.assessment.economics.marginErosionPp);
        return pct !== null && qCompare(pct, qty('0')) < 0;
      }).length),
    },
    {
      id: 'scope-exposure', label: 'Scope exposure',
      options: flag('Exposed', projects.filter((p) => !p.uncommercialisedExposure.isZero()).length),
    },
    {
      id: 'executive-intervention', label: 'Executive intervention',
      options: flag('Required', ranked.filter((r) => r.executiveAction.startsWith('Escalate')).length),
    },
  ];
}

export const COMMAND_CENTER_STATE: string =
  'IMPLEMENTED (Phase 7). Aggregates computed over the caller\'s authorised set only; every figure '
  + 'formatted server-side; ordering delegated to MET-PORT-007 (ADR-0019).';
