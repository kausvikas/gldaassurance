/**
 * Public surface — `delivery`.
 *
 * Owns: milestones, scope items, progress claims, dependencies, schedule, EVM inputs.
 * Tier 2 · Produces L1 and L2 · Depends on: `contract`.
 *
 * **MET-DEL-012 is BLOCKED by MC-8** (scope unit undefined). Nothing downstream is blocked by it
 * because progress is carried by MET-DEL-016 physical completion, which is an observed claim.
 */
import type { Money, Ratio } from '@platform/decimal';
import type { Provenance } from '@platform/provenance';
import type { CalendarDate, Instant, WeekId } from '@platform/time';
import type { ContractId } from '@contexts/contract';

export const CONTEXT_ID = 'delivery' as const;

export type MilestoneId = string & { readonly __milestoneIdBrand: unique symbol };
export type ScopeItemId = string & { readonly __scopeItemIdBrand: unique symbol };
export type DependencyId = string & { readonly __dependencyIdBrand: unique symbol };

export interface Milestone {
  readonly id: MilestoneId;
  readonly projectId: string;
  readonly name: string;
  readonly baselineDate: CalendarDate;
  readonly forecastDate: CalendarDate;
  readonly actualDate?: CalendarDate;
  /** Milestones that gate payment make slippage an economic event, not only a schedule one. */
  readonly paymentGating: boolean;
  readonly gatedValue?: Money;
  readonly synthetic: true;
}

export interface ScopeItem {
  readonly id: ScopeItemId;
  readonly projectId: string;
  readonly scopeBaselineId?: string;
  readonly description: string;
  readonly completedOn?: CalendarDate;
  /** Set when the item was delivered without an executed change covering it. Feeds MET-COM-009. */
  readonly uncontracted: boolean;
  readonly estimatedValue?: Money;
  readonly synthetic: true;
}

/**
 * L1 — the delivery team's assertion of genuine completion against defined criteria. Feeds
 * MET-DEL-016.
 *
 * Recorded as a claim, with who made it and on what basis, because its reliability is *measured*
 * (by MET-FIN-027 burn gap and MET-FIN-030 ETC optimism gap) rather than assumed.
 */
export interface ProgressClaim {
  readonly projectId: string;
  readonly claimedOn: CalendarDate;
  /** Decimal string 0-1. */
  readonly physicalCompletion: string;
  readonly basis: string;
  readonly claimedByActorId: string;
  readonly synthetic: true;
}

/** A customer or third-party obligation that delivery is waiting on. Feeds MET-DEL-022/023. */
export interface Dependency {
  readonly id: DependencyId;
  readonly projectId: string;
  readonly description: string;
  readonly owner: 'CUSTOMER' | 'THIRD_PARTY' | 'INTERNAL';
  readonly raisedOn: CalendarDate;
  readonly dueOn: CalendarDate;
  readonly resolvedOn?: CalendarDate;
  readonly blocking: boolean;
  readonly synthetic: true;
}

export interface DeliverySnapshot {
  readonly projectId: string;
  readonly week: WeekId;
  readonly correctionSeq: number;
  /** MET-DEL-016 */ readonly actualPhysicalCompletion: Provenance<Ratio>;
  /** MET-DEL-017 */ readonly plannedPhysicalCompletion: Provenance<Ratio>;
  /** MET-DEL-015 */ readonly progressVariance: Provenance<Ratio>;
  /** MET-DEL-001 */ readonly plannedValue: Provenance<Money>;
  /** MET-DEL-002 */ readonly earnedValue: Provenance<Money>;
  /** MET-DEL-004 */ readonly costPerformanceIndex: Provenance<Ratio>;
  /** MET-DEL-005 */ readonly schedulePerformanceIndex: Provenance<Ratio>;
  /** MET-DEL-008 */ readonly varianceAtCompletion: Provenance<Money>;
  /** MET-DEL-009 */ readonly milestoneSlippageDays: Provenance<number>;
  /** MET-DEL-010 */ readonly milestonesAtRisk: Provenance<number>;
  /** MET-DEL-019 */ readonly demonstratedVelocity: Provenance<Ratio>;
  /** MET-DEL-020 */ readonly requiredFutureVelocity: Provenance<Ratio>;
  /** MET-DEL-018 */ readonly requiredVelocityRatio: Provenance<Ratio>;
  /** MET-DEL-021 */ readonly requiredProductivityImprovement: Provenance<Ratio>;
  /** MET-DEL-014 */ readonly replanFrequency: Provenance<number>;
  /** MET-DEL-022 */ readonly blockedEffortHours: Provenance<string>;
  /** MET-DEL-012 — absent while MC-8 is open. */
  readonly scopeCompletion?: Provenance<Ratio>;
  readonly synthetic: true;
}

export interface DeliveryService {
  milestones(projectId: string, asOf: Instant): Promise<readonly Milestone[]>;
  dependencies(projectId: string, asOf: Instant): Promise<readonly Dependency[]>;
  progressClaims(projectId: string, asOf: Instant): Promise<readonly ProgressClaim[]>;
  snapshot(contractId: ContractId, projectId: string, week: WeekId): Promise<DeliverySnapshot | undefined>;
}

// --- Derivation (Phase 8, ADR-0022 D-1) --------------------------------------
export type {
  DeliveryEvaluation, DeliveryEvaluationInput, DependencyInput, DerivedValue,
  MilestoneInput, MilestoneView, ProgressObservation,
} from './internal/delivery-engine.js';
export { asPoints, evaluateDelivery, gatedValueAtRisk } from './internal/delivery-engine.js';

export const IMPLEMENTATION_STATE =
  'Canonical model IMPLEMENTED (Phase 2); MET-DEL-009/010/011/018/019/020/023 COMPUTED (Phase 8, ADR-0022 D-1); MET-DEL-012 BLOCKED by MC-8' as const;
