/**
 * The record shapes the generator emits.
 *
 * **These are L1 observed facts only.** No forecast GM, no EAC, no health score, no RAG assessment,
 * no trajectory — those are `L2_DERIVED` and `L3_ASSESSED` outputs that Phase 4 computes *from* this
 * data (`PHASE_HANDOFF.md` §3.2a constraints 2 and 3). A generator that also wrote them would
 * create a second, competing truth, which is the failure `SYNTHETIC_DATA_SPEC.md` §1 exists to
 * prevent.
 *
 * The two apparent exceptions are not exceptions:
 *   - `StatusReportRow` carries `MET-HLTH-012` Reported RAG, which is `L1_OBSERVED` — a delivery
 *     manager's declaration, not an assessment.
 *   - `RecognisedRevenueFactRow` carries `MET-FIN-009`/`039`, which are `L1_OBSERVED` accounting
 *     facts stamped with the policy that produced them (Phase 2 closure, Decision 1).
 */
import type { MoneyDto } from '@platform/decimal';

export interface Row {
  readonly synthetic: true;
}

export interface EffortRecordRow extends Row {
  readonly projectId: string;
  readonly assignmentId: string;
  readonly periodEnd: string;
  readonly week: string;
  readonly hours: string;
  readonly billable: boolean;
  readonly isRework: boolean;
  readonly causedByDefectId?: string;
  readonly blockedByDependencyId?: string;
  readonly recordedAt: string;
}

export interface ActualCostRow extends Row {
  readonly id: string;
  readonly projectId: string;
  readonly periodEnd: string;
  readonly week: string;
  readonly category: 'LABOUR' | 'NON_LABOUR' | 'PASS_THROUGH' | 'TRAVEL' | 'LICENCE';
  readonly amount: MoneyDto;
  readonly recordedAt: string;
}

export interface ProgressClaimRow extends Row {
  readonly projectId: string;
  readonly claimedOn: string;
  readonly week: string;
  readonly physicalCompletion: string;
  readonly plannedCompletion: string;
  readonly basis: string;
  readonly claimedByActorId: string;
}

export interface EtcLineItemRow extends Row {
  readonly projectId: string;
  readonly forecastRevisionId: string;
  readonly week: string;
  readonly category: string;
  readonly amount: MoneyDto;
  readonly basisOfEstimate: string;
  readonly estimatedByActorId: string;
  readonly estimatedOn: string;
}

export interface CommitmentRow extends Row {
  readonly id: string;
  readonly projectId: string;
  readonly amount: MoneyDto;
  readonly committedOn: string;
  readonly expectedIncurBy: string;
  readonly cancellable: boolean;
  readonly reference: string;
}

export interface ContingencyDrawdownRow extends Row {
  readonly projectId: string;
  readonly drawnOn: string;
  readonly week: string;
  readonly amount: MoneyDto;
  readonly reason: string;
  readonly authorisedByActorId: string;
}

export interface DefectRow extends Row {
  readonly id: string;
  readonly projectId: string;
  readonly severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'TRIVIAL';
  readonly raisedOn: string;
  readonly closedOn?: string;
  readonly discoveryPhase: 'PRE_RELEASE' | 'POST_RELEASE';
  readonly escapedToClient: boolean;
  readonly reopenCount: number;
}

export interface AcceptanceItemRow extends Row {
  readonly id: string;
  readonly projectId: string;
  readonly milestoneId?: string;
  readonly submittedOn: string;
  readonly acceptedOn?: string;
  readonly blocking: boolean;
  readonly resolvedOn?: string;
  readonly clientReference: string;
}

export interface DependencyRow extends Row {
  readonly id: string;
  readonly projectId: string;
  readonly description: string;
  readonly owner: 'CUSTOMER' | 'THIRD_PARTY' | 'INTERNAL';
  readonly raisedOn: string;
  readonly dueOn: string;
  readonly resolvedOn?: string;
  readonly blocking: boolean;
}

export interface RiskRow extends Row {
  readonly id: string;
  readonly projectId: string;
  readonly description: string;
  readonly severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  readonly probability: string;
  readonly costImpact: MoneyDto;
  readonly includedInEtc: boolean;
  readonly includedInEtcJustification?: string;
  readonly riskCauseKey: string;
  readonly proximityDate: string;
  readonly state: 'OPEN' | 'MITIGATING' | 'MITIGATED' | 'ACCEPTED' | 'REALISED';
  readonly raisedOn: string;
  readonly updatedAt: string;
}

export interface MilestoneRow extends Row {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly baselineDate: string;
  readonly forecastDate: string;
  readonly actualDate?: string;
  readonly paymentGating: boolean;
  readonly gatedValue?: MoneyDto;
}

export interface ScopeItemRow extends Row {
  readonly id: string;
  readonly projectId: string;
  readonly description: string;
  readonly raisedOn: string;
  readonly completedOn?: string;
  readonly uncontracted: boolean;
  readonly estimatedValue?: MoneyDto;
}

export interface ExecutedChangeRow extends Row {
  readonly id: string;
  readonly contractId: string;
  readonly executedOn: string;
  readonly valueDelta: MoneyDto;
  readonly costDelta: MoneyDto;
  readonly contingencyDelta: MoneyDto;
  readonly completionDateDelta: number;
  readonly executedFromPendingId?: string;
}

export interface PendingChangeRow extends Row {
  readonly id: string;
  readonly contractId: string;
  readonly raisedOn: string;
  readonly proposedValue: MoneyDto;
  readonly estimatedCost: MoneyDto;
  readonly approvalProbability: string;
  readonly probabilityAssessedBy: string;
  readonly probabilityAssessedOn: string;
  readonly supersededByExecutedId?: string;
}

export interface BaselineRevisionRow extends Row {
  readonly id: string;
  readonly contractId: string;
  readonly baselineKind: 'FORECAST' | 'RECOVERY';
  readonly effectiveFrom: string;
  readonly actorId: string;
  readonly reason: string;
}

/** MET-HLTH-012 — L1_OBSERVED. The team's declaration, never an assessment. */
export interface StatusReportRow extends Row {
  readonly projectId: string;
  readonly reportedOn: string;
  readonly week: string;
  readonly reportedRag: 'RED' | 'AMBER' | 'GREEN';
  readonly commentary: string;
  readonly reportedByActorId: string;
}

/**
 * MET-FIN-009 / MET-FIN-039 — an imported accounting fact (Phase 2 closure, Decision 1), with
 * append-only correction semantics (Phase 3 correction, Correction 6).
 *
 * A period may carry several postings: an `ORIGINAL` and, later, an `ADJUSTMENT`, `REVERSAL` or
 * `RESTATEMENT` that names what it supersedes. Nothing is ever updated in place.
 */
export interface RecognisedRevenueFactRow extends Row {
  readonly id: string;
  readonly projectId: string;
  readonly reportingPeriodId: string;
  readonly postingType: 'ORIGINAL' | 'ADJUSTMENT' | 'REVERSAL' | 'RESTATEMENT';
  /** Signed. An adjustment or reversal is negative. */
  readonly periodAmount: MoneyDto;
  readonly cumulativeAmount: MoneyDto;
  readonly currency: string;
  readonly supersedesFactId?: string;
  readonly originalFactId?: string;
  readonly sourceRecordId: string;
  readonly sourceVersion: string;
  readonly recognitionPolicyVersion: string;
  readonly postingReference: string;
  readonly sourceTimestamp: string;
  readonly ingestedAt: string;
}

export interface InvoiceRow extends Row {
  readonly id: string;
  readonly contractId: string;
  readonly issuedOn: string;
  readonly dueOn: string;
  readonly amount: MoneyDto;
  readonly milestoneId?: string;
}

export interface PaymentRow extends Row {
  readonly invoiceId: string;
  readonly receivedOn: string;
  readonly amount: MoneyDto;
}

export interface CommercialExposureRow extends Row {
  readonly projectId: string;
  readonly assessedOn: string;
  readonly kind: 'UNCOMPENSATED_SCOPE' | 'ABSORBED_BLOCKED_EFFORT' | 'LIQUIDATED_DAMAGES' | 'DISPUTED_INVOICE';
  readonly estimatedValue: MoneyDto;
  readonly estimationBasis: string;
  readonly assessedByActorId: string;
}

export interface AssignmentRow extends Row {
  readonly id: string;
  readonly projectId: string;
  readonly personRef: string;
  readonly seniorityBand: 'PRINCIPAL' | 'SENIOR' | 'MID' | 'JUNIOR' | 'TRAINEE';
  /** Delivery location — **Phase 10 closure, DR-056**. A site, never an address. */
  readonly deliveryLocation: 'ONSHORE' | 'NEARSHORE' | 'OFFSHORE';
  /** Whether the person is employed or subcontracted. Never a supplier name. */
  readonly engagementType: 'EMPLOYEE' | 'SUBCONTRACTOR';
  readonly startedOn: string;
  readonly endedOn?: string;
  readonly allocationPercent: string;
}

export interface RagOverrideRow extends Row {
  readonly projectId: string;
  readonly appliedAt: string;
  readonly rag: 'RED' | 'AMBER' | 'GREEN';
  readonly reason: string;
  readonly actorId: string;
  readonly expiresAt: string;
}

export interface FxRateRow extends Row {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly rate: string;
  readonly rateType: 'SPOT' | 'MONTHLY_AVERAGE' | 'BUDGET' | 'CLOSING';
  readonly effectiveDate: string;
  readonly source: string;
}


/**
 * A recovery plan — **Phase 10, closing DR-049**.
 *
 * Opened when delivery accepts that the contractual plan will not land and a separate, owned
 * intervention is required. The recovery baseline sits **beside** the contractual baseline and never
 * replaces it (ADR-0003 §1): a project in recovery is still measured against what it sold.
 */
export interface RecoveryPlanRow extends Row {
  readonly id: string;
  readonly projectId: string;
  readonly contractId: string;
  readonly openedOn: string;
  readonly targetExitOn: string;
  readonly closedOn?: string;
  readonly sponsorActorId: string;
  readonly recoveryTargetMarginPercent: string;
  readonly recoveryTargetCompletion: string;
}

/**
 * One corrective action inside a recovery plan.
 *
 * `incompatibilityGroup` is load-bearing: two actions attacking the same root cause cannot both be
 * banked, and `computeRecoveryEconomics` counts only the largest benefit in a group. Without it a
 * plan can claim the same saving twice and look twice as credible as it is.
 */
export interface RecoveryActionRow extends Row {
  readonly id: string;
  readonly planId: string;
  readonly projectId: string;
  readonly description: string;
  /** Null is legal and is a finding: an unowned action is not a plan. */
  readonly ownerActorId?: string;
  readonly dueOn?: string;
  readonly status: 'PROPOSED' | 'COMMITTED' | 'IN_PROGRESS' | 'COMPLETE' | 'ABANDONED';
  readonly completedOn?: string;
  readonly revenueBenefit: MoneyDto;
  readonly costBenefit: MoneyDto;
  readonly scheduleBenefitWeeks: number;
  /** 0–1, how likely the action lands as written. */
  readonly confidence: string;
  readonly incompatibilityGroup?: string;
  /** The early-warning signal this action answers, linking detection to intervention. */
  readonly respondsToSignal?: string;
  readonly executiveDecisionRequired: boolean;
}

/**
 * What assurance did with a detected early warning.
 *
 * Detection is **derived** and recomputed every run; this records the human act that followed it.
 * Separating the two is what lets the product measure follow-through: a warning nobody dispositioned
 * is a different failure from one that was validated and then ignored.
 *
 * Delivery owns corrective execution; assurance owns validation and follow-through. This row is an
 * assurance record and carries no execution state.
 */
export interface WarningDispositionRow extends Row {
  readonly id: string;
  readonly projectId: string;
  /** The signal id the disposition applies to, e.g. `BURN_GAP`. */
  readonly signalId: string;
  readonly raisedOn: string;
  readonly disposition: 'VALIDATED' | 'CHALLENGED' | 'ACCEPTED_RISK';
  readonly dispositionedOn?: string;
  readonly assuranceActorId: string;
  readonly rationale: string;
  /** The control clock: assurance must disposition within this window or become an exception. */
  readonly dueOn: string;
}

/**
 * Delivery's current view of when the project will finish — **Phase 10 closure, DR-050**.
 *
 * Distinct from the contractual `plannedEndDate`, which is the as-sold commitment and never moves
 * (ADR-0003 §1). `MET-DEL-011` is the signed difference between the two, and without this row it
 * was not computable: the milestone set ends well before the contractual date and is not a
 * substitute for a completion forecast.
 */
export interface ScheduleForecastRow extends Row {
  readonly projectId: string;
  readonly forecastOn: string;
  readonly forecastCompletionDate: string;
  readonly basis: string;
}

/** Independent / DA assurance review — **Phase 10 closure, DR-053**. */
export interface AssuranceReviewRow extends Row {
  readonly id: string;
  readonly projectId: string;
  readonly reviewedOn: string;
  readonly reviewerActorId: string;
  readonly reviewType: 'DA_REVIEW' | 'INDEPENDENT_ASSURANCE' | 'PEER_REVIEW';
  readonly outcome: 'SATISFACTORY' | 'QUALIFIED' | 'ADVERSE';
  readonly summary: string;
}

/** Everything the simulation produces for one project. */
export interface ProjectFacts {
  readonly assignments: AssignmentRow[];
  readonly effort: EffortRecordRow[];
  readonly actualCosts: ActualCostRow[];
  readonly progressClaims: ProgressClaimRow[];
  readonly etcLineItems: EtcLineItemRow[];
  readonly commitments: CommitmentRow[];
  readonly contingencyDrawdowns: ContingencyDrawdownRow[];
  readonly defects: DefectRow[];
  readonly acceptanceItems: AcceptanceItemRow[];
  readonly dependencies: DependencyRow[];
  readonly risks: RiskRow[];
  readonly milestones: MilestoneRow[];
  readonly scopeItems: ScopeItemRow[];
  readonly executedChanges: ExecutedChangeRow[];
  readonly pendingChanges: PendingChangeRow[];
  readonly baselineRevisions: BaselineRevisionRow[];
  readonly statusReports: StatusReportRow[];
  readonly recognisedRevenue: RecognisedRevenueFactRow[];
  readonly invoices: InvoiceRow[];
  readonly payments: PaymentRow[];
  readonly exposures: CommercialExposureRow[];
  readonly ragOverrides: RagOverrideRow[];
  // --- Phase 10: forward risk and recovery (closes DR-049) -------------------
  readonly recoveryPlans: RecoveryPlanRow[];
  readonly recoveryActions: RecoveryActionRow[];
  readonly warningDispositions: WarningDispositionRow[];
  readonly scheduleForecasts: ScheduleForecastRow[];
  readonly assuranceReviews: AssuranceReviewRow[];
}

export function emptyFacts(): ProjectFacts {
  return {
    assignments: [], effort: [], actualCosts: [], progressClaims: [], etcLineItems: [],
    commitments: [], contingencyDrawdowns: [], defects: [], acceptanceItems: [], dependencies: [],
    risks: [], milestones: [], scopeItems: [], executedChanges: [], pendingChanges: [],
    baselineRevisions: [], statusReports: [], recognisedRevenue: [], invoices: [], payments: [],
    exposures: [], ragOverrides: [],
    recoveryPlans: [], recoveryActions: [], warningDispositions: [],
    scheduleForecasts: [], assuranceReviews: [],
  };
}
