/**
 * Canonical concepts and the source authority registry (ADR-0035 §3, §4).
 *
 * The registry answers one question — *"for this concept, which source's value is the governed
 * one?"* — and it answers it the same way every time, before the conflict occurs. That ordering is
 * the entire point. Authority decided at merge time is authority decided by whoever wrote the merge,
 * under whatever pressure existed that afternoon.
 *
 * **Authority is per concept, not per system.** A Finance/ERP system is authoritative for actual
 * cost and is merely supplemental for percent complete, which it also happens to store. Declaring
 * authority at system granularity would hand it both, and the second one is wrong in a way that
 * reaches a margin figure.
 */
import type { SourceAuthorityClass } from '@platform/provenance';
import { outranks } from '@platform/provenance';

/**
 * The closed set of canonical concepts a source may claim to supply.
 *
 * Closed because an open string turns the registry into documentation. A connector that wants to
 * contribute something not on this list is asking for a canonical model change, which is an ADR.
 *
 * These are **data concepts, not metrics**. `financial.actualCost` is a figure a source records;
 * `MET-FIN-008` is a figure this product derives. A source can be authoritative for the first and
 * can never be authoritative for the second — the metric catalogue owns those, and no registry entry
 * can override it. That distinction is why the two vocabularies are deliberately not merged.
 */
export type CanonicalConcept =
  // Commercial / contract
  | 'contract.soldValue'
  | 'contract.executedChange'
  | 'contract.pendingChange'
  | 'contract.paymentMilestone'
  | 'commercial.opportunity'
  | 'commercial.accountOwnership'
  // Financial
  | 'financial.actualCost'
  | 'financial.recognisedRevenue'
  | 'financial.forecastRevenue'
  | 'financial.estimateToComplete'
  | 'financial.financialPeriod'
  | 'financial.invoiceStatus'
  // Delivery / ALM
  | 'delivery.plannedWork'
  | 'delivery.completedWork'
  | 'delivery.velocity'
  | 'delivery.defectCount'
  | 'delivery.reworkEffort'
  | 'delivery.releaseEvent'
  | 'delivery.milestoneStatus'
  // Resource / PSA
  | 'resource.plannedEffort'
  | 'resource.actualEffort'
  | 'resource.staffing'
  | 'resource.costRate'
  // Assurance
  | 'assurance.reviewDate'
  | 'assurance.finding'
  | 'assurance.actionStatus'
  // Management declaration
  | 'status.reportedRag'
  // Evidence
  | 'document.contractTerm'
  | 'document.acceptanceCriteria';

export const ALL_CONCEPTS: readonly CanonicalConcept[] = [
  'contract.soldValue', 'contract.executedChange', 'contract.pendingChange',
  'contract.paymentMilestone', 'commercial.opportunity', 'commercial.accountOwnership',
  'financial.actualCost', 'financial.recognisedRevenue', 'financial.forecastRevenue',
  'financial.estimateToComplete', 'financial.financialPeriod', 'financial.invoiceStatus',
  'delivery.plannedWork', 'delivery.completedWork', 'delivery.velocity', 'delivery.defectCount',
  'delivery.reworkEffort', 'delivery.releaseEvent', 'delivery.milestoneStatus',
  'resource.plannedEffort', 'resource.actualEffort', 'resource.staffing', 'resource.costRate',
  'assurance.reviewDate', 'assurance.finding', 'assurance.actionStatus',
  'status.reportedRag', 'document.contractTerm', 'document.acceptanceCriteria',
];

/** Business-readable names, so a registry can be rendered to an executive without field names. */
export const CONCEPT_LABEL: Readonly<Record<CanonicalConcept, string>> = {
  'contract.soldValue': 'As-sold contract value',
  'contract.executedChange': 'Executed change requests',
  'contract.pendingChange': 'Pending change requests',
  'contract.paymentMilestone': 'Payment milestones',
  'commercial.opportunity': 'Commercial opportunity',
  'commercial.accountOwnership': 'Account ownership',
  'financial.actualCost': 'Actual cost incurred',
  'financial.recognisedRevenue': 'Recognised revenue',
  'financial.forecastRevenue': 'Forecast revenue',
  'financial.estimateToComplete': 'Estimate to complete',
  'financial.financialPeriod': 'Financial period close',
  'financial.invoiceStatus': 'Invoicing and receivables',
  'delivery.plannedWork': 'Planned work',
  'delivery.completedWork': 'Completed work',
  'delivery.velocity': 'Delivery velocity',
  'delivery.defectCount': 'Defects',
  'delivery.reworkEffort': 'Rework effort',
  'delivery.releaseEvent': 'Releases',
  'delivery.milestoneStatus': 'Milestone status',
  'resource.plannedEffort': 'Planned effort',
  'resource.actualEffort': 'Actual effort',
  'resource.staffing': 'Staffing and pyramid',
  'resource.costRate': 'Resource cost rates',
  'assurance.reviewDate': 'Assurance review date',
  'assurance.finding': 'Assurance findings',
  'assurance.actionStatus': 'Assurance action status',
  'status.reportedRag': 'Reported delivery status',
  'document.contractTerm': 'Contractual terms',
  'document.acceptanceCriteria': 'Acceptance criteria',
};

/**
 * What happens when a lower-authority source disagrees with the governed value.
 *
 * `DISCLOSE` is the only behaviour that keeps the disagreement visible, and it is the default for
 * everything. `IGNORE` exists for concepts where a lower-authority restatement is expected noise
 * rather than a finding — and using it is a decision recorded in the registry, not a silent one.
 * There is deliberately no `OVERWRITE`.
 */
export type ConflictBehaviour = 'DISCLOSE' | 'IGNORE';

export interface AuthorityGrant {
  readonly sourceId: string;
  readonly concept: CanonicalConcept;
  readonly authority: SourceAuthorityClass;
  /** Tie-break within an authority class. Lower wins. Explicit, so ties are never arbitrary. */
  readonly priority: number;
  readonly conflictBehaviour: ConflictBehaviour;
  /** Why this source holds this authority. Rendered; an unexplained grant is an unauditable one. */
  readonly rationale: string;
}

export class AuthorityConflict extends Error {
  constructor(concept: CanonicalConcept, a: string, b: string) {
    super(
      `Two sources (${a}, ${b}) are registered AUTHORITATIVE for "${concept}" at the same priority. `
      + 'Authority must be unambiguous before ingestion, not resolved at merge time (ADR-0035 §4).',
    );
    this.name = 'AuthorityConflict';
  }
}

/**
 * The registry.
 *
 * Configuration for the POC (ADR-0035 §4) — **not GlobalLogic policy**. Every rendering of it says
 * so, because a demo screen that looks like a corporate data-ownership decision will be quoted as
 * one.
 */
export class SourceAuthorityRegistry {
  readonly #grants: AuthorityGrant[] = [];

  /** Rejects an ambiguous top authority at registration rather than discovering it in a conflict. */
  register(grant: AuthorityGrant): void {
    if (grant.authority === 'AUTHORITATIVE') {
      const clash = this.#grants.find(
        (g) => g.concept === grant.concept
          && g.authority === 'AUTHORITATIVE'
          && g.priority === grant.priority
          && g.sourceId !== grant.sourceId,
      );
      if (clash !== undefined) throw new AuthorityConflict(grant.concept, clash.sourceId, grant.sourceId);
    }
    const existing = this.#grants.findIndex(
      (g) => g.concept === grant.concept && g.sourceId === grant.sourceId,
    );
    if (existing >= 0) this.#grants[existing] = grant;
    else this.#grants.push(grant);
  }

  /** Every grant for a concept, most authoritative first. */
  for(concept: CanonicalConcept): readonly AuthorityGrant[] {
    return this.#grants
      .filter((g) => g.concept === concept)
      .sort((a, b) => (outranks(a.authority, b.authority) ? -1
        : outranks(b.authority, a.authority) ? 1
          : a.priority - b.priority || a.sourceId.localeCompare(b.sourceId)));
  }

  /** The source whose value is governed for this concept, or `null` if nothing supplies it. */
  governingSource(concept: CanonicalConcept): AuthorityGrant | null {
    return this.for(concept)[0] ?? null;
  }

  authorityOf(sourceId: string, concept: CanonicalConcept): SourceAuthorityClass {
    // Deny-by-default: a source that has not been granted authority for a concept has the weakest
    // class, not a middling one. An unregistered claim is unverified by definition.
    return this.#grants.find((g) => g.sourceId === sourceId && g.concept === concept)?.authority
      ?? 'UNVERIFIED';
  }

  grantsBySource(sourceId: string): readonly AuthorityGrant[] {
    return this.#grants.filter((g) => g.sourceId === sourceId);
  }

  all(): readonly AuthorityGrant[] {
    return [...this.#grants];
  }
}

export const AUTHORITY_PROVENANCE =
  'POC source-authority configuration — not an approved GlobalLogic data-ownership policy' as const;
