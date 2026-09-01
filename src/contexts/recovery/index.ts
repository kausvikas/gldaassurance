/**
 * Public surface — `recovery`.
 * Owns: recovery plans, recovery baselines, recovery actions, intervention outcomes.
 * Tier 3 · Produces L1 and L2 · Depends on: `rules`, `contract`, `delivery`, `risk`.
 *
 * A recovery baseline is a **fourth** reference point and explicitly not a restatement of As-Sold
 * (ADR-0003 §Decision 1). Variance is reported against both: the contractual baseline, which is the
 * honest position, and the recovery plan, which is what the intervention is judged on.
 *
 * **DQ-4 open:** whether this survives as a context is decided after Phase 10.
 */
import type { Money, Ratio } from '@platform/decimal';
import type { Provenance } from '@platform/provenance';
import type { CalendarDate, Instant, WeekId } from '@platform/time';
import type { ContractId } from '@contexts/contract';

export const CONTEXT_ID = 'recovery' as const;

export type RecoveryPlanId = string & { readonly __recoveryPlanIdBrand: unique symbol };
export type RecoveryActionId = string & { readonly __recoveryActionIdBrand: unique symbol };

export interface RecoveryPlan {
  readonly id: RecoveryPlanId;
  readonly projectId: string;
  readonly contractId: ContractId;
  readonly openedOn: CalendarDate;
  readonly targetExitOn: CalendarDate;
  readonly closedOn?: CalendarDate;
  readonly sponsorActorId: string;
  /** The recovery baseline. Sits beside the contractual baseline; never replaces it. */
  readonly recoveryTargetMargin: Ratio;
  readonly recoveryTargetCompletion: CalendarDate;
  readonly synthetic: true;
}

export interface RecoveryAction {
  readonly id: RecoveryActionId;
  readonly planId: RecoveryPlanId;
  readonly description: string;
  readonly ownerActorId: string;
  readonly dueOn: CalendarDate;
  readonly completedOn?: CalendarDate;
  readonly expectedMarginEffect: Money;
  readonly observedMarginEffect?: Money;
  readonly outcome?: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  readonly synthetic: true;
}

/** A modelled what-if. L3 by nature and labelled as such wherever rendered. */
export interface RecoveryScenario {
  readonly planId: RecoveryPlanId;
  readonly name: string;
  readonly assumptions: readonly string[];
  readonly projectedMargin: Provenance<Ratio>;
  readonly projectedCompletion: Provenance<CalendarDate>;
  readonly synthetic: true;
}

export interface RecoveryProgress {
  readonly planId: RecoveryPlanId;
  readonly week: WeekId;
  /** Against the recovery plan — reported alongside, never instead of, contractual variance. */
  readonly adherence: Provenance<Ratio>;
  readonly actionsCompleted: number;
  readonly actionsOverdue: number;
}

export interface RecoveryService {
  planFor(projectId: string, asOf: Instant): Promise<RecoveryPlan | undefined>;
  actions(planId: RecoveryPlanId): Promise<readonly RecoveryAction[]>;
  scenarios(planId: RecoveryPlanId): Promise<readonly RecoveryScenario[]>;
  progress(planId: RecoveryPlanId, week: WeekId): Promise<RecoveryProgress>;
}

// --- RecoveryEconomicsEngine (Phase 4) --------------------------------------
export type {
  CountedAction, RecoveryActionInput, RecoveryActionStatus, RecoveryEconomics,
  RecoveryEconomicsInput,
} from './internal/recovery-economics.js';
export { computeRecoveryEconomics } from './internal/recovery-economics.js';

export const IMPLEMENTATION_STATE =
  'Canonical model IMPLEMENTED (Phase 2); behaviour Phase 10; context survival open (DQ-4)' as const;
