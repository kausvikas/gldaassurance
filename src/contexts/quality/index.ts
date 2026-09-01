/**
 * Public surface — `quality`.
 * Owns: defects, escapes, coverage, rework, releases, acceptance.
 * Tier 2 · Produces L1 · Depends on: nothing.
 *
 * Acceptance items live here rather than in `delivery` because in fixed-bid they are quality
 * evidence that gates revenue — the client's objection list, not the delivery plan.
 */
import type { Money, Ratio } from '@platform/decimal';
import type { Provenance } from '@platform/provenance';
import type { CalendarDate, Instant, WeekId } from '@platform/time';

export const CONTEXT_ID = 'quality' as const;

export type DefectId = string & { readonly __defectIdBrand: unique symbol };
export type AcceptanceItemId = string & { readonly __acceptanceItemIdBrand: unique symbol };

export type DefectSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'TRIVIAL';
export type DiscoveryPhase = 'PRE_RELEASE' | 'POST_RELEASE';

export interface Defect {
  readonly id: DefectId;
  readonly projectId: string;
  readonly severity: DefectSeverity;
  readonly raisedOn: CalendarDate;
  readonly closedOn?: CalendarDate;
  readonly discoveryPhase: DiscoveryPhase;
  readonly escapedToClient: boolean;
  /** Reopened defects are a leading indicator that fixes are not holding. */
  readonly reopenCount: number;
  readonly synthetic: true;
}

/** L1 — a client objection blocking formal acceptance. Feeds MET-QUA-010/011. */
export interface AcceptanceItem {
  readonly id: AcceptanceItemId;
  readonly projectId: string;
  readonly milestoneId?: string;
  readonly submittedOn: CalendarDate;
  readonly acceptedOn?: CalendarDate;
  readonly blocking: boolean;
  readonly resolvedOn?: CalendarDate;
  readonly clientReference: string;
  readonly synthetic: true;
}

export interface ReleaseRecord {
  readonly projectId: string;
  readonly releasedOn: CalendarDate;
  readonly failed: boolean;
  readonly synthetic: true;
}

export interface QualitySnapshot {
  readonly projectId: string;
  readonly week: WeekId;
  readonly correctionSeq: number;
  /** MET-QUA-001 */ readonly openDefectsBySeverity: Readonly<Record<DefectSeverity, number>>;
  /** MET-QUA-003 */ readonly escapedDefectRate: Provenance<Ratio>;
  /** MET-QUA-006 */ readonly reworkRatio: Provenance<Ratio>;
  /** MET-QUA-012 */ readonly excessReworkCost: Provenance<Money>;
  /** MET-QUA-009 */ readonly defectBacklogTrend: Provenance<number>;
  /** MET-QUA-010 */ readonly acceptanceBlockers: Provenance<number>;
  /** MET-QUA-011 */ readonly acceptanceLatencyDays: Provenance<number>;
  /** MET-QUA-007 — L1 reported figure; absent where the domain is not reporting. */
  readonly testCoverage?: Provenance<Ratio>;
  /** MET-QUA-002 — absent while MC-8 is open. */
  readonly defectDensity?: Provenance<Ratio>;
  readonly synthetic: true;
}

export interface QualityService {
  defects(projectId: string, asOf: Instant): Promise<readonly Defect[]>;
  acceptanceItems(projectId: string, asOf: Instant): Promise<readonly AcceptanceItem[]>;
  snapshot(projectId: string, week: WeekId): Promise<QualitySnapshot | undefined>;
}

// --- Derivation (Phase 8 closure, ADR-0022 D-3) ------------------------------
export type {
  AcceptanceItemInput, DefectInput, EffortInput, QualityEvaluation, QualityEvaluationInput,
} from './internal/quality-engine.js';
export { evaluateQuality } from './internal/quality-engine.js';

export const IMPLEMENTATION_STATE = 'Canonical model IMPLEMENTED (Phase 2); MET-QUA-001/003/006/009/010/011/012 COMPUTED (Phase 8 closure, ADR-0022 D-3); MET-QUA-002 BLOCKED by MC-8' as const;
