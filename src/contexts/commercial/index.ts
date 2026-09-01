/**
 * Public surface — `commercial`.
 * Owns: rates, pricing, invoicing, receivables, commercial exposure.
 * Tier 2 · Produces L1 · Depends on: `contract`.
 *
 * Everything here is `COMMERCIAL_CONFIDENTIAL` (SECURITY_MODEL.md §4.3). The context enforces
 * nothing — field gating and read-auditing happen once, at the Application layer (ADR-0005).
 */
import type { Money } from '@platform/decimal';
import type { Provenance } from '@platform/provenance';
import type { CalendarDate, Instant, WeekId } from '@platform/time';
import type { ContractId } from '@contexts/contract';

export const CONTEXT_ID = 'commercial' as const;

export type InvoiceId = string & { readonly __invoiceIdBrand: unique symbol };

export interface Invoice {
  readonly id: InvoiceId;
  readonly contractId: ContractId;
  readonly issuedOn: CalendarDate;
  readonly dueOn: CalendarDate;
  readonly amount: Money;
  readonly milestoneId?: string;
  readonly synthetic: true;
}

export interface Payment {
  readonly invoiceId: InvoiceId;
  readonly receivedOn: CalendarDate;
  readonly amount: Money;
  readonly synthetic: true;
}

/**
 * Commercial exposure the delivery organisation carries but has not recovered: delivered scope
 * with no executed change, absorbed blocked effort, and liquidated-damages risk.
 * Feeds MET-COM-009 and scenario E.
 */
export interface CommercialExposure {
  readonly projectId: string;
  readonly assessedOn: CalendarDate;
  readonly kind: 'UNCOMPENSATED_SCOPE' | 'ABSORBED_BLOCKED_EFFORT' | 'LIQUIDATED_DAMAGES' | 'DISPUTED_INVOICE';
  readonly estimatedValue: Money;
  /** Every exposure figure is an estimate and must be labelled as one. */
  readonly estimationBasis: string;
  readonly assessedByActorId: string;
  readonly synthetic: true;
}

export interface CommercialSnapshot {
  readonly projectId: string;
  readonly week: WeekId;
  readonly correctionSeq: number;
  /** MET-COM-001 */ readonly invoicedToDate: Provenance<Money>;
  /** MET-COM-003 */ readonly receivablesOutstanding: Provenance<Money>;
  /** MET-COM-007 */ readonly maxPendingCrAgeDays: Provenance<number>;
  /** MET-COM-009 */ readonly uncompensatedScopeRatio: Provenance<string>;
  /** MET-COM-010 — scenario variable only, never base revenue. */
  readonly expectedPendingCrRecovery: Provenance<Money>;
  readonly synthetic: true;
}

export interface CommercialService {
  invoices(contractId: ContractId, asOf: Instant): Promise<readonly Invoice[]>;
  exposures(projectId: string, asOf: Instant): Promise<readonly CommercialExposure[]>;
  snapshot(projectId: string, week: WeekId): Promise<CommercialSnapshot | undefined>;
}

// --- Derivation (Phase 8 closure, ADR-0022 D-2) ------------------------------
export type {
  CommercialEvaluation, CommercialEvaluationInput, DerivedValue, PendingChangeInput, ScopeItemInput,
} from './internal/commercial-engine.js';
export { evaluateCommercial, totalQuantity, unsecuredUpsideOf } from './internal/commercial-engine.js';

export const IMPLEMENTATION_STATE = 'Canonical model IMPLEMENTED (Phase 2); MET-COM-007/008/009 COMPUTED (Phase 8 closure, ADR-0022 D-2)' as const;
