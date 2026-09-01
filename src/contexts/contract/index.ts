/**
 * Public surface — `contract`.
 *
 * Owns: As-Sold baseline, executed changes, pending changes, contractual terms, scope baseline.
 * Tier 1 · Produces L1 · Depends on: nothing.
 *
 * ADR-0003 §Decision 1 is load-bearing here and is expressed in the *types*, not in comments: the
 * three baselines are three different types, deliberately not three rows in one table
 * distinguished by a discriminator, "because that shape invites
 * `UPDATE baseline SET … WHERE type = 'as_sold'`".
 *
 * Sole owner of Current Contractual Baseline derivation. Duplicating it elsewhere is a boundary
 * violation (ADR-0003 §Consequences).
 */
import type { Money } from '@platform/decimal';
import type { CalendarDate, Instant } from '@platform/time';

export const CONTEXT_ID = 'contract' as const;

export type ContractId = string & { readonly __contractIdBrand: unique symbol };
export type ChangeRecordId = string & { readonly __changeRecordIdBrand: unique symbol };
export type BaselineRevisionId = string & { readonly __baselineRevisionIdBrand: unique symbol };
export type ScopeBaselineId = string & { readonly __scopeBaselineIdBrand: unique symbol };

export type ContractType = 'FIXED_BID' | 'TIME_AND_MATERIALS' | 'CAPACITY';

export interface Contract {
  readonly id: ContractId;
  readonly projectId: string;
  readonly customerId: string;
  readonly contractType: ContractType;
  readonly signedOn: CalendarDate;
  readonly plannedStart: CalendarDate;
  readonly plannedEnd: CalendarDate;
  /** Liquidated damages and acceptance terms drive scenario H; `COMMERCIAL_CONFIDENTIAL`. */
  readonly liquidatedDamagesPerDay?: Money;
  readonly liquidatedDamagesCap?: Money;
  readonly acceptanceTermDays?: number;
  readonly synthetic: true;
}

/**
 * **Immutable. Insert-once.** Updates and deletes are rejected at the persistence layer, not by
 * application convention (REQ-DATA-003). Never recomputed, never restated, never "corrected".
 *
 * The type carries no mutator and the repository exposes no update path — see
 * `AsSoldBaselineStore` below.
 */
export interface AsSoldBaseline {
  readonly kind: 'AS_SOLD';
  readonly contractId: ContractId;
  readonly signedOn: CalendarDate;
  readonly contractValue: Money;
  readonly budgetedCost: Money;
  readonly contingencyBudget: Money;
  readonly plannedCompletion: CalendarDate;
  /** Priced staffing shape — the reference for MET-RES-004 pyramid drift. */
  readonly pyramidRatio: string;
  /** Priced blended cost rate — the reference for MET-RES-005. */
  readonly blendedRate: Money;
  /** Rework assumed in the price — the reference for MET-QUA-012 excess rework. */
  readonly reworkAllowance: string;
  readonly plannedEffortHours: string;
  /** FX rates in force at signature, so MET-FIN-038 can isolate rate movement. */
  readonly asSoldFxRateIds: readonly string[];
  readonly synthetic: true;
}

/**
 * Derived — As-Sold plus the ordered set of executed changes. **Never a stored editable row.**
 * Computed in one place, here.
 */
export interface CurrentContractualBaseline {
  readonly kind: 'CURRENT_CONTRACTUAL';
  readonly contractId: ContractId;
  readonly asOf: Instant;
  readonly contractValue: Money;
  readonly budgetedCost: Money;
  readonly contingencyBudget: Money;
  readonly plannedCompletion: CalendarDate;
  readonly derivedFrom: readonly ChangeRecordId[];
}

/**
 * Current Forecast — freely revisable, but **versioned**: every revision is a new row with
 * `effectiveFrom`, actor and reason. Prior forecasts are never overwritten (ADR-0003 §Decision 1).
 */
export interface ForecastBaseline {
  readonly kind: 'FORECAST';
  readonly contractId: ContractId;
  readonly revisionId: BaselineRevisionId;
  readonly effectiveFrom: Instant;
  readonly forecastCompletion: CalendarDate;
  readonly forecastCost: Money;
  readonly revisedByActorId: string;
  readonly reason: string;
  readonly supersedes?: BaselineRevisionId;
}

/** Append-only audit of every baseline revision. Feeds MET-DEL-014 replan frequency. */
export interface BaselineRevision {
  readonly id: BaselineRevisionId;
  readonly contractId: ContractId;
  readonly baselineKind: 'FORECAST' | 'RECOVERY';
  readonly revisedAt: Instant;
  readonly actorId: string;
  readonly reason: string;
}

/** The contracted scope at a named baseline. MC-8 leaves the *unit* undefined; the shape does not. */
export interface ScopeBaseline {
  readonly id: ScopeBaselineId;
  readonly contractId: ContractId;
  readonly baselineKind: 'AS_SOLD' | 'CURRENT_CONTRACTUAL';
  readonly totalScopeUnits?: string;
  readonly scopeUnitDefinition?: string;
  readonly blockedBy?: 'MC-8';
}

/** Formally approved and executed. Affects the Current Contractual Baseline from its date forward. */
export interface ExecutedChange {
  readonly kind: 'EXECUTED';
  readonly id: ChangeRecordId;
  readonly contractId: ContractId;
  readonly executedOn: CalendarDate;
  readonly valueDelta: Money;
  readonly costDelta: Money;
  readonly contingencyDelta: Money;
  readonly scopeUnitsDelta?: string;
  readonly completionDateDelta: number;
  /** The pending record this was executed from, if any. The pending row itself survives. */
  readonly executedFromPendingId?: ChangeRecordId;
  readonly synthetic: true;
}

/**
 * Proposed, in negotiation, or approved-but-unexecuted. Affects **nothing** authoritative.
 * Surfaced only as Unsecured Upside (MET-FIN-011) and, probability-weighted, as MET-COM-010.
 *
 * Execution is an *insert* of an `ExecutedChange`, never a status flip on this row — so the
 * duration a change sat unexecuted survives (MET-COM-007), and one careless `UPDATE` cannot move
 * unsecured revenue into the forecast (ADR-0003 §Decision 2, REQ-FIN-005).
 */
export interface PendingChange {
  readonly kind: 'PENDING';
  readonly id: ChangeRecordId;
  readonly contractId: ContractId;
  readonly raisedOn: CalendarDate;
  readonly proposedValue: Money;
  readonly estimatedCost: Money;
  /** Decimal string 0-1, with who assessed it. Feeds MET-COM-010 only. */
  readonly approvalProbability: string;
  readonly probabilityAssessedBy: string;
  readonly probabilityAssessedOn: CalendarDate;
  /** Set when an ExecutedChange was created from this record. Never a status mutation. */
  readonly supersededByExecutedId?: ChangeRecordId;
  readonly synthetic: true;
}

export interface ContractService {
  contract(contractId: ContractId): Promise<Contract | undefined>;
  asSold(contractId: ContractId): Promise<AsSoldBaseline | undefined>;
  /** Derived on read from As-Sold + executed changes with `executedOn ≤ asOf`. */
  currentContractual(contractId: ContractId, asOf: Instant): Promise<CurrentContractualBaseline | undefined>;
  forecastAt(contractId: ContractId, asOf: Instant): Promise<ForecastBaseline | undefined>;
  executedChanges(contractId: ContractId, asOf: Instant): Promise<readonly ExecutedChange[]>;
  /** Returned separately, always. Never summed into anything the other methods return. */
  pendingChanges(contractId: ContractId, asOf: Instant): Promise<readonly PendingChange[]>;
  revisions(contractId: ContractId, since: Instant): Promise<readonly BaselineRevision[]>;
}

export const IMPLEMENTATION_STATE = 'Canonical model IMPLEMENTED (Phase 2); persistence adapters Phase 5' as const;
