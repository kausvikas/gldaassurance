/**
 * Public surface — `financial`.
 *
 * Owns: actuals, ETC, commitments, contingency, revenue recognition, margin, FX rates.
 * Tier 2 · Produces L1 and L2 · Depends on: `contract`.
 *
 * This is the ProjectEconomicsEngine. Core financial logic lives here and nowhere else — never in
 * a component, a chart config, or an ad-hoc SQL view (PRODUCT_SPEC.md §8.2).
 *
 * **BLOCKED:** MET-FIN-006/009/015 depend on OQ-2 (revenue recognition method). The types exist;
 * the recognition computation does not, and Phase 4 may not implement it until the sponsor selects
 * a method. Everything else in this context is unblocked.
 */
import type { CurrencyCode, FxRate, FxRateType, Money, Ratio } from '@platform/decimal';
import type { Provenance } from '@platform/provenance';
import type { CalendarDate, Instant, WeekId } from '@platform/time';
import type { ContractId } from '@contexts/contract';

export const CONTEXT_ID = 'financial' as const;

export type ActualCostId = string & { readonly __actualCostIdBrand: unique symbol };
export type CommitmentId = string & { readonly __commitmentIdBrand: unique symbol };

export type CostCategory = 'LABOUR' | 'NON_LABOUR' | 'PASS_THROUGH' | 'TRAVEL' | 'LICENCE';

/** L1 — cost actually incurred. Feeds MET-FIN-005. */
export interface ActualCost {
  readonly id: ActualCostId;
  readonly projectId: string;
  readonly periodEnd: CalendarDate;
  readonly category: CostCategory;
  readonly amount: Money;
  readonly recordedAt: Instant;
  readonly synthetic: true;
}

/** L1 — a bottom-up remaining-cost estimate line. Feeds MET-FIN-007. */
export interface EtcLineItem {
  readonly projectId: string;
  readonly forecastRevisionId: string;
  readonly category: CostCategory;
  readonly amount: Money;
  readonly basisOfEstimate: string;
  readonly estimatedByActorId: string;
  readonly estimatedOn: CalendarDate;
  readonly synthetic: true;
}

/**
 * L1 — cost contractually committed but not yet incurred. Feeds MET-FIN-023.
 * Separated from ETC because a commitment is fixed while an estimate is not.
 */
export interface Commitment {
  readonly id: CommitmentId;
  readonly projectId: string;
  readonly amount: Money;
  readonly committedOn: CalendarDate;
  readonly expectedIncurBy: CalendarDate;
  readonly cancellable: boolean;
  readonly reference: string;
  readonly synthetic: true;
}

/** L1 — an authorised draw against the contingency buffer. Feeds MET-FIN-037. */
export interface ContingencyDrawdown {
  readonly projectId: string;
  readonly drawnOn: CalendarDate;
  readonly amount: Money;
  readonly reason: string;
  readonly authorisedByActorId: string;
  readonly synthetic: true;
}

/**
 * What kind of accounting posting a fact represents.
 *
 * Real Finance systems restate. An `ORIGINAL` posting is not the last word on a period — an
 * adjustment, a reversal or a full restatement may follow, often months later after a source
 * correction. Phase 3 correction, Correction 6.
 */
export type AccountingPostingType = 'ORIGINAL' | 'ADJUSTMENT' | 'REVERSAL' | 'RESTATEMENT';

/**
 * **An authoritative accounting fact, imported from Finance/ERP.** Not computed here.
 *
 * OQ-2 CLOSED (Phase 2 closure, Decision 1). Recognition treatment is governed by corporate
 * accounting policy and the underlying performance-obligation analysis. Delivery Intelligence
 * consumes the recognised amount rather than recreating the ledger — so this is an `L1_OBSERVED`
 * fact with `FINANCE_SYSTEM` authority, and the registry rejects any attempt to declare it derived.
 *
 * **Insert-once is not "history can never change".** Correction 6 draws the distinction that the
 * original design blurred: a *fact* is immutable, but the *effective accounting position* for a
 * period may change through further authoritative events. A correction is therefore a new fact that
 * names what it supersedes — never an update to the row it corrects.
 *
 * ```
 *   2026-04  ORIGINAL      420,000   ─┐
 *   2026-07  ADJUSTMENT    -35,000   ─┼─ effective position for 2026-04 = 385,000
 *                                     │  both rows survive; lineage is intact
 * ```
 *
 * For the synthetic POC the values are produced by the documented `RECOGNITION-v1` policy and stored
 * as accounting facts all the same. They must never be derived from physical completion or from
 * Performance-Implied EAC — including corrections.
 */
export interface RecognisedRevenueFact {
  /** Unique per posting, not per period: a period may carry several postings over time. */
  readonly id: string;
  readonly projectId: string;
  /** The accounting period the posting *applies to*, which may be long past. */
  readonly reportingPeriodId: string;
  readonly postingType: AccountingPostingType;
  /**
   * MET-FIN-039 — the amount of *this posting*. Signed: an adjustment or reversal is negative.
   * The effective period figure is the sum of all live postings for that period.
   */
  readonly periodAmount: Money;
  /** MET-FIN-009 — cumulative to date as Finance held it when this posting was made. */
  readonly cumulativeAmount: Money;
  readonly currency: CurrencyCode;
  /** The posting this one corrects. Absent on an `ORIGINAL`. */
  readonly supersedesFactId?: string;
  /** The first posting in the chain, so lineage survives several corrections. */
  readonly originalFactId?: string;
  /** Identity of the record in the source ledger, and which version of it this reflects. */
  readonly sourceRecordId: string;
  readonly sourceVersion: string;
  readonly recognitionPolicyVersion: string;
  readonly postingReference: string;
  /** When Finance posted it. Distinct from `ingestedAt`, so late arrival is measurable. */
  readonly sourceTimestamp: Instant;
  readonly ingestedAt: Instant;
  readonly synthetic: true;
}

/**
 * The effective accounting position for a period, after applying every live correction.
 *
 * Derived on read from the posting chain — never stored, because storing it would create a second
 * figure that can disagree with the postings it came from.
 */
export interface EffectiveRecognisedRevenue {
  readonly projectId: string;
  readonly reportingPeriodId: string;
  readonly effectiveAmount: Money;
  /** Every posting that contributed, in order. This is the audit trail.  */
  readonly postings: readonly RecognisedRevenueFact[];
  readonly restated: boolean;
}

/** Dated FX rate with its source. Required before any cross-currency aggregation (REQ-DATA-006). */
export interface FxRateRecord extends FxRate {
  readonly id: string;
  readonly synthetic: true;
}

/**
 * Append-only weekly financial snapshot. Every value carries provenance; every derived value
 * carries the rule version that produced it (REQ-DATA-010).
 */
export interface FinancialSnapshot {
  readonly projectId: string;
  readonly week: WeekId;
  readonly correctionSeq: number;
  readonly reportingCurrency: CurrencyCode;
  readonly fxRateType: FxRateType;

  /** MET-FIN-005 */ readonly costToDate: Provenance<Money>;
  /** MET-FIN-007 */ readonly estimateToComplete: Provenance<Money>;
  /** MET-FIN-023 */ readonly committedFutureCost: Provenance<Money>;
  /** MET-FIN-008 */ readonly estimateAtCompletion: Provenance<Money>;
  /** MET-FIN-010 */ readonly forecastRevenue: Provenance<Money>;
  /** MET-FIN-011 — beside forecast revenue, never inside it. */
  readonly unsecuredUpside: Provenance<Money>;
  /** MET-FIN-024 */ readonly forecastGrossMarginValue: Provenance<Money>;
  /** MET-FIN-014 */ readonly forecastGrossMarginPercent: Provenance<Ratio>;
  /** MET-FIN-026 */ readonly soldGrossMarginValue: Provenance<Money>;
  /** MET-FIN-025 */ readonly grossMarginErosionValue: Provenance<Money>;
  /** MET-FIN-028 */ readonly costConsumedPercent: Provenance<Ratio>;
  /** MET-FIN-027 */ readonly burnGap: Provenance<Ratio>;
  /** MET-FIN-029 — NOT_COMPUTABLE below the maturity threshold. */
  readonly performanceImpliedEac: Provenance<Money | null>;
  /** MET-FIN-030 */ readonly etcOptimismGap: Provenance<Money | null>;
  /** MET-FIN-035 */ readonly contingencyConsumedPercent: Provenance<Ratio>;
  /** MET-FIN-034 */ readonly contingencyBurnGap: Provenance<Ratio>;
  /** MET-FIN-032 */ readonly riskAdjustedGrossMarginValue: Provenance<Money>;
  /** MET-FIN-019 */ readonly grossMarginValueAtRisk: Provenance<Money>;

  /**
   * MET-FIN-009 — carried through from the Finance fact, **not recomputed**. Its provenance envelope
   * is `L1` with the Finance record as its source; a snapshot that showed this as `L2` would be
   * asserting that Delivery Intelligence computed the accounting figure.
   */
  readonly recognisedRevenue: Provenance<Money>;
  /** MET-FIN-015 */ readonly actualToDateMarginPercent: Provenance<Ratio>;

  readonly synthetic: true;
}

export interface ProjectEconomicsService {
  snapshot(projectId: string, week: WeekId): Promise<FinancialSnapshot | undefined>;
  economicsAsOf(contractId: ContractId, projectId: string, asOf: Instant): Promise<FinancialSnapshot>;
  fxRate(from: CurrencyCode, to: CurrencyCode, asOf: CalendarDate, rateType: FxRateType): Promise<FxRateRecord | undefined>;
  /**
   * Every posting for a period, in order — originals and corrections alike. There is deliberately
   * no method that *computes* recognition, and none that updates a posting.
   */
  recognisedRevenuePostings(projectId: string, reportingPeriodId: string): Promise<readonly RecognisedRevenueFact[]>;
  /** The effective position after corrections, derived from the posting chain on read. */
  effectiveRecognisedRevenue(projectId: string, reportingPeriodId: string): Promise<EffectiveRecognisedRevenue | undefined>;
}

// --- ProjectEconomicsEngine (Phase 4) ---------------------------------------
export type { EconomicsInput, EconomicsResult } from './internal/economics-engine.js';
export { computeEconomics, ratioValue } from './internal/economics-engine.js';

// --- Margin bridge, MET-FIN-018 (Phase 9) ------------------------------------
export type {
  AttributionBasis, BridgeCause, MarginBridge, MarginBridgeInput,
} from './internal/margin-bridge.js';
export { buildMarginBridge, largestRemainderCents } from './internal/margin-bridge.js';

export const IMPLEMENTATION_STATE =
  'ProjectEconomicsEngine IMPLEMENTED (Phase 4). OQ-2 CLOSED — recognised revenue is an imported Finance fact, not a computation. Persistence adapters Phase 5.' as const;
