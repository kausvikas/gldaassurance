/**
 * Public surface — `risk`.
 * Owns: risk register, exposure, proximity, mitigation, interventions.
 * Tier 2 · Produces L1 and L2 · Depends on: nothing.
 *
 * `includedInEtc` is the field that prevents double counting. A risk already provisioned inside the
 * estimate to complete and *also* deducted from margin is counted twice, which systematically
 * understates the portfolio — see MET-RSK-008 and MET-FIN-032.
 */
import type { Money } from '@platform/decimal';
import type { Provenance } from '@platform/provenance';
import type { CalendarDate, Instant, WeekId } from '@platform/time';

export const CONTEXT_ID = 'risk' as const;

export type RiskId = string & { readonly __riskIdBrand: unique symbol };
export type InterventionId = string & { readonly __interventionIdBrand: unique symbol };

export type RiskSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type MitigationState = 'OPEN' | 'MITIGATING' | 'MITIGATED' | 'ACCEPTED' | 'REALISED';

export interface Risk {
  readonly id: RiskId;
  readonly projectId: string;
  readonly description: string;
  readonly severity: RiskSeverity;
  /** Decimal string 0-1. */
  readonly probability: string;
  readonly costImpact: Money;
  /**
   * True when this risk's cost is already provisioned inside MET-FIN-007 ETC.
   * Set deliberately, with a justification — not defaulted.
   */
  readonly includedInEtc: boolean;
  readonly includedInEtcJustification?: string;
  readonly proximityDate: CalendarDate;
  readonly state: MitigationState;
  readonly raisedOn: CalendarDate;
  readonly updatedAt: Instant;
  readonly synthetic: true;
}

export interface Mitigation {
  readonly riskId: RiskId;
  readonly description: string;
  readonly ownerActorId: string;
  readonly dueOn: CalendarDate;
  readonly completedOn?: CalendarDate;
  readonly synthetic: true;
}

/** REQ-RISK-003 — the product is a system of record for its own judgements here. */
export interface Intervention {
  readonly id: InterventionId;
  readonly projectId: string;
  readonly description: string;
  readonly ownerActorId: string;
  readonly createdOn: CalendarDate;
  readonly dueOn: CalendarDate;
  readonly status: 'PROPOSED' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  readonly expectedEffect: string;
  readonly observedEffect?: string;
  readonly closedOn?: CalendarDate;
  readonly synthetic: true;
}

export interface RiskSnapshot {
  readonly projectId: string;
  readonly week: WeekId;
  readonly correctionSeq: number;
  /** MET-RSK-001 */ readonly grossExposure: Provenance<Money>;
  /** MET-RSK-008 — only risk not already inside ETC. */
  readonly incrementalExposure: Provenance<Money>;
  /** MET-RSK-002 */ readonly openCriticalRisks: Provenance<number>;
  /** MET-RSK-004 */ readonly mitigationCoverage: Provenance<string>;
  /** MET-RSK-005 */ readonly overdueMitigations: Provenance<number>;
  /** MET-RSK-006 */ readonly registerFreshnessDays: Provenance<number>;
  readonly synthetic: true;
}

export interface RiskService {
  register(projectId: string, asOf: Instant): Promise<readonly Risk[]>;
  interventions(projectId: string, asOf: Instant): Promise<readonly Intervention[]>;
  snapshot(projectId: string, week: WeekId): Promise<RiskSnapshot | undefined>;
}

export const IMPLEMENTATION_STATE =
  'Canonical model IMPLEMENTED (Phase 2); computation Phase 4; interventions Phase 10' as const;
