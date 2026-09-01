/**
 * Public surface — `project`.
 *
 * Owns: project identity, lifecycle, engagement model, dates, and the per-project weekly snapshot
 * spine that every domain snapshot hangs from.
 * Tier 1 · Produces L1 · Depends on: nothing — organisational and portfolio ids are opaque values.
 */
import type { CalendarDate, Instant, WeekId } from '@platform/time';

export const CONTEXT_ID = 'project' as const;

export type ProjectId = string & { readonly __projectIdBrand: unique symbol };

export type EngagementModel = 'FIXED_BID' | 'TIME_AND_MATERIALS' | 'CAPACITY';

/** The four canonical stages. Finer labels are a reporting attribute, not a new value (ADR-0013 §4). */
export type LifecycleStage = 'INITIATING' | 'EXECUTING' | 'CLOSING' | 'CLOSED';

export type LifecycleSubStage =
  | 'MOBILIZATION' | 'EARLY_EXECUTION' | 'MID_PROJECT' | 'LATE_STAGE'
  | 'UAT_ACCEPTANCE' | 'CLOSED_OUT';

export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  readonly accountId: string;
  readonly organizationNodeId: string;
  readonly portfolioId: string;
  readonly contractId: string;
  readonly engagementModel: EngagementModel;
  readonly lifecycleStage: LifecycleStage;
  readonly lifecycleSubStage: LifecycleSubStage;
  readonly startDate: CalendarDate;
  readonly plannedEndDate: CalendarDate;
  /** Recovery is orthogonal to lifecycle — a project in recovery is still EXECUTING. */
  readonly inRecovery: boolean;
  readonly synthetic: true;
}

/**
 * The weekly snapshot spine. Every domain snapshot references one of these, so "as of week W"
 * means the same thing in every context.
 *
 * **Append-only.** A correction is a new row with a higher `correctionSeq` carrying a `corrects`
 * reference — never an update (ADR-0003 §Decision 3). Unique on
 * `(projectId, week, correctionSeq)`.
 */
export interface ProjectSnapshot {
  readonly projectId: ProjectId;
  readonly week: WeekId;
  readonly correctionSeq: number;
  readonly capturedAt: Instant;
  readonly lifecycleStage: LifecycleStage;
  readonly corrects?: number;
  readonly correctionReason?: string;
  readonly synthetic: true;
}

export interface ProjectService {
  findById(projectId: ProjectId): Promise<Project | undefined>;
  findMany(projectIds: readonly ProjectId[]): Promise<readonly Project[]>;
  /** What we believed in that week, as originally written. */
  snapshotAsOf(projectId: ProjectId, week: WeekId): Promise<ProjectSnapshot | undefined>;
  /** What we now believe was true then — the latest correction for that week. */
  snapshotAsCorrected(projectId: ProjectId, week: WeekId): Promise<ProjectSnapshot | undefined>;
}

export const IMPLEMENTATION_STATE = 'Canonical model IMPLEMENTED (Phase 2); persistence adapters Phase 5' as const;
