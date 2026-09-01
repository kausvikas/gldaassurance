/**
 * Public surface — `resource`.
 * Owns: assignments, effort, utilisation, pyramid, attrition, open roles.
 * Tier 2 · Produces L1 · Depends on: nothing.
 *
 * Individual-level data here is `PERSONAL_DATA` (SECURITY_MODEL.md §4.3, §8). Aggregate and
 * individual reads are **separate methods**, not one method with a flag, so individual data cannot
 * be returned by accident.
 */
import type { Money, Ratio } from '@platform/decimal';
import type { Provenance } from '@platform/provenance';
import type { CalendarDate, Instant, WeekId } from '@platform/time';

export const CONTEXT_ID = 'resource' as const;

export type AssignmentId = string & { readonly __assignmentIdBrand: unique symbol };
export type SeniorityBand = 'PRINCIPAL' | 'SENIOR' | 'MID' | 'JUNIOR' | 'TRAINEE';

/** PERSONAL_DATA. Reachable only through `individualAssignments`. */
export interface Assignment {
  readonly id: AssignmentId;
  readonly projectId: string;
  /** Synthetic persona reference. Never a real person (REQ-DATA-009). */
  readonly personRef: string;
  readonly seniorityBand: SeniorityBand;
  readonly startedOn: CalendarDate;
  readonly endedOn?: CalendarDate;
  readonly allocationPercent: string;
  readonly synthetic: true;
}

/** L1 — booked effort. `isRework` is what makes MET-QUA-006 real rather than decorative. */
export interface EffortRecord {
  readonly projectId: string;
  readonly assignmentId: AssignmentId;
  readonly periodEnd: CalendarDate;
  readonly hours: string;
  readonly billable: boolean;
  readonly isRework: boolean;
  readonly causedByDefectId?: string;
  readonly blockedByDependencyId?: string;
  /** Recorded so late timesheet entry is detectable as a freshness problem (MET-DQ-002). */
  readonly recordedAt: Instant;
  readonly synthetic: true;
}

export interface OpenRole {
  readonly projectId: string;
  readonly seniorityBand: SeniorityBand;
  readonly openedOn: CalendarDate;
  readonly filledOn?: CalendarDate;
  readonly synthetic: true;
}

/** Aggregate only. No individual is identifiable from this shape. */
export interface ResourceSnapshot {
  readonly projectId: string;
  readonly week: WeekId;
  readonly correctionSeq: number;
  readonly headcountFte: string;
  /** MET-RES-001 */ readonly billableUtilisation: Provenance<Ratio>;
  /** MET-RES-002 */ readonly effortVarianceHours: Provenance<string>;
  /** MET-RES-003 */ readonly pyramidRatio: Provenance<Ratio>;
  /** MET-RES-004 */ readonly pyramidDrift: Provenance<Ratio>;
  /** MET-RES-005 */ readonly blendedRateVariance: Provenance<Money>;
  /** MET-RES-010 */ readonly resourceCostDriftImpact: Provenance<Money>;
  /** MET-RES-007 — a percentage, never a name. */
  readonly keyPersonConcentration: Provenance<Ratio>;
  /** MET-RES-008 */ readonly rampDeficitFte: Provenance<string>;
  readonly synthetic: true;
}

export interface ResourceService {
  snapshot(projectId: string, week: WeekId): Promise<ResourceSnapshot | undefined>;
  /** PERSONAL_DATA — a separate call so it cannot be returned by accident. */
  individualAssignments(projectId: string, asOf: Instant): Promise<readonly Assignment[]>;
}

// --- Derivation (Phase 9, under ADR-0022 D-1) --------------------------------
// `SeniorityBand` is already declared above as this context's canonical band union; the engine
// declares the identical union internally, so it is not re-exported here.
export type {
  AssignmentInput, DeliveryLocation, DerivedValue, EffortInput, EngagementType,
  ResourceEvaluation, ResourceEvaluationInput, SeniorityMix,
} from './internal/resource-engine.js';
export { SENIOR_BANDS, evaluateResource, hasEffort } from './internal/resource-engine.js';

export const IMPLEMENTATION_STATE = 'Canonical model IMPLEMENTED (Phase 2); MET-RES-001/002/003/004/005/007/010 COMPUTED (Phase 9, ADR-0022 D-1)' as const;
