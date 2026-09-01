/**
 * Public surface — `portfolio`.
 * Owns: portfolio/program grouping and rollup membership, and the aggregation *rules*.
 * Tier 1 · Produces L1 · Depends on: nothing.
 *
 * This context owns the definition of MET-PORT-001…008 but does **not** import `financial`,
 * `health` or `forecast` to obtain their inputs — that would make a tier-1 context depend on tiers
 * 2-4. Aggregation is a pure function over inputs the Application layer supplies, already filtered
 * to the caller's authorised entity set (ADR-0005 §5, ADR-0012 Proposed, CONFLICT C-1).
 */
import type { CurrencyCode, Money, Ratio } from '@platform/decimal';
import type { ConfidenceBand, Provenance } from '@platform/provenance';
import type { Instant, WeekId } from '@platform/time';

export const CONTEXT_ID = 'portfolio' as const;

export type PortfolioId = string & { readonly __portfolioIdBrand: unique symbol };
export type ProgramId = string & { readonly __programIdBrand: unique symbol };

export interface Portfolio {
  readonly id: PortfolioId;
  readonly name: string;
  readonly organizationNodeId: string;
  readonly synthetic: true;
}

export interface Program {
  readonly id: ProgramId;
  readonly portfolioId: PortfolioId;
  readonly name: string;
  readonly synthetic: true;
}

export interface PortfolioMembership {
  readonly portfolioId: PortfolioId;
  readonly programId?: ProgramId;
  readonly projectId: string;
  readonly effectiveFrom: Instant;
}

/**
 * Inputs-in port. One entry per **authorised** project, assembled by the Application layer from the
 * owning contexts. Portfolio never reaches for these itself, so there is no global set within reach
 * and an unscoped total is not expressible.
 */
export interface PortfolioAggregationInput {
  readonly projectId: string;
  /** MET-FIN-002 */ readonly contractValue: Money;
  /** MET-FIN-010 */ readonly forecastRevenue: Money;
  /** MET-FIN-008 */ readonly estimateAtCompletion: Money;
  /** MET-FIN-019 */ readonly grossMarginValueAtRisk: Money;
  /** Shared-cause key, so MET-PORT-003 can de-duplicate rather than double count. */
  readonly riskCauseKeys: readonly string[];
  /** MET-HLTH-012 / MET-HLTH-011 */ readonly reportedRag: string;
  readonly systemAssessedRag: string;
  /** MET-HLTH-030 */ readonly divergence: number;
  /** MET-FCST-002 */ readonly deteriorating: boolean;
  /** MET-FCST-010 */ readonly silentDeteriorationIndex: number;
  /** MET-DQ-005 */ readonly confidenceBand: ConfidenceBand;
}

export interface PortfolioRollup {
  readonly week: WeekId;
  readonly reportingCurrency: CurrencyCode;
  readonly projectCount: number;
  /** MET-PORT-001 */ readonly contractValue: Provenance<Money>;
  /** MET-PORT-002 — weighted, never a mean of project percentages. */
  readonly forecastMargin: Provenance<Ratio>;
  /** MET-PORT-003 */ readonly valueAtRisk: Provenance<Money>;
  /** MET-PORT-004 */ readonly ragDistribution: Provenance<Readonly<Record<string, number>>>;
  /** MET-PORT-005 */ readonly divergentProjectCount: Provenance<number>;
  /** MET-PORT-006 */ readonly deterioratingGreens: Provenance<number>;
  /** MET-PORT-008 */ readonly confidenceDistribution: Provenance<Readonly<Record<string, number>>>;
}

export interface PortfolioService {
  membershipFor(portfolioId: PortfolioId, asOf: Instant): Promise<readonly PortfolioMembership[]>;
  /** Pure. Never queries; never sees a project the caller is not authorised for. */
  aggregate(
    week: WeekId,
    reportingCurrency: CurrencyCode,
    inputs: readonly PortfolioAggregationInput[],
  ): Promise<PortfolioRollup>;
}

// --- Aggregation (Phase 4) ---------------------------------------------------
export type { PortfolioAggregate, ProjectContribution } from './internal/aggregation.js';
export { aggregate } from './internal/aggregation.js';

// --- ExecutiveInterventionPriorityService (MET-PORT-007; MC-5 resolved, ADR-0019) ---
export type {
  ActionabilityEvidence, ActionabilityGrade, Band, ConfidenceBand, ExposureEvidence,
  InterventionPriorityResult, PriorityCandidate, PriorityPolicy, PriorityRanking,
  PriorityTierValues, UnrankedCandidate,
} from './internal/intervention-priority.js';
export {
  PRIORITY_TIER_ORDER, comparePriority, gradeActionability, hasCriticalExposure,
  hasPredictedDeterioration, rankInterventionPriority, rankableCount, timeCriticalityWeeks,
} from './internal/intervention-priority.js';

// --- MET-PORT-003 portfolio value at risk (C-20, ADR-0023 supersedes ADR-0021)
export type {
  CauseAttribution, CauseConcentration, PortfolioValueAtRisk, ProjectAttribution,
  ProjectCauseInput, RiskCauseInput,
} from './internal/portfolio-value-at-risk.js';
export {
  attributeProject, currencyOf, portfolioValueAtRisk,
} from './internal/portfolio-value-at-risk.js';

export const IMPLEMENTATION_STATE =
  'Canonical model IMPLEMENTED (Phase 2); aggregation Phase 7; MET-PORT-007 intervention ranking IMPLEMENTED as a lexicographic tiered model (MC-5 resolved, ADR-0019)' as const;
