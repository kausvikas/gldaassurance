/**
 * Public surface — `organization`.
 *
 * Owns: legal entities, business units, regions, industries, customers, accounts, hierarchy,
 * and the fiscal calendars those entities report on.
 * Tier 1 · Produces L1 · Depends on: nothing.
 *
 * The hierarchy declared here is what authorization scope is expressed over (REQ-SEC-003) and what
 * portfolio rollups traverse. It is snapshotted because reorganisations happen and a historical
 * assessment must be reproducible against the structure that existed then, not the one that exists
 * now (ADR-0003).
 */
import type { CalendarDate, FiscalCalendarDefinition, Instant } from '@platform/time';

export const CONTEXT_ID = 'organization' as const;

export type OrganizationNodeId = string & { readonly __organizationNodeIdBrand: unique symbol };
export type CustomerId = string & { readonly __customerIdBrand: unique symbol };
export type AccountId = string & { readonly __accountIdBrand: unique symbol };

export type OrganizationNodeKind =
  | 'LEGAL_ENTITY' | 'BUSINESS_UNIT' | 'REGION' | 'ACCOUNT';

/** Geography is a separate axis from business unit — a BU spans regions (ADR-0013 §3). */
export type RegionCode = string & { readonly __regionCodeBrand: unique symbol };

export interface Region {
  readonly code: RegionCode;
  readonly name: string;
  readonly parentBusinessUnitId: OrganizationNodeId;
}

export interface Industry {
  readonly code: string;
  readonly name: string;
}

export interface OrganizationNode {
  readonly id: OrganizationNodeId;
  readonly kind: OrganizationNodeKind;
  readonly name: string;
  readonly parentId?: OrganizationNodeId;
  readonly fiscalCalendarId?: string;
  readonly synthetic: true;
}

/**
 * Append-only record of the hierarchy as it stood. An "as of" health assessment for June must roll
 * up through June's structure, not today's.
 */
export interface OrganizationHierarchySnapshot {
  readonly capturedAt: Instant;
  readonly edges: readonly { readonly childId: OrganizationNodeId; readonly parentId: OrganizationNodeId }[];
}

export interface Customer {
  readonly id: CustomerId;
  /** Fictional alias. No real client name may appear (REQ-DATA-009). */
  readonly alias: string;
  readonly industryCode: string;
  readonly regionCode: RegionCode;
  readonly synthetic: true;
}

export interface Account {
  readonly id: AccountId;
  readonly customerId: CustomerId;
  readonly organizationNodeId: OrganizationNodeId;
  readonly name: string;
  readonly synthetic: true;
}

/**
 * Which fiscal calendar an org node reports on. The *definition* is a platform type; which one
 * applies is an organisational fact.
 *
 * **OQ-5 remains open** and is answered per entity here rather than assumed globally.
 */
export interface FiscalCalendarAssignment {
  readonly organizationNodeId: OrganizationNodeId;
  readonly calendar: FiscalCalendarDefinition;
  readonly effectiveFrom: CalendarDate;
}

export interface OrganizationService {
  node(id: OrganizationNodeId): Promise<OrganizationNode | undefined>;
  /** Transitive descendants — the traversal scope resolution depends on (REQ-SEC-003). */
  descendantsOf(id: OrganizationNodeId, asOf: Instant): Promise<readonly OrganizationNodeId[]>;
  customer(id: CustomerId): Promise<Customer | undefined>;
  account(id: AccountId): Promise<Account | undefined>;
  fiscalCalendarFor(id: OrganizationNodeId, asOf: Instant): Promise<FiscalCalendarDefinition | undefined>;
}

export const IMPLEMENTATION_STATE = 'Canonical model IMPLEMENTED (Phase 2); persistence adapters Phase 5' as const;
