/**
 * Public surface — platform/authz.
 *
 * **Contracts only. Phase 5 implements them.** (`PRODUCT_SPEC.md` §7.6, ADR-0005.)
 *
 * The types live in platform so that the Application layer — the single enforcement point
 * (ADR-0005 §1) — can depend on them without any domain context being able to. Domain
 * contexts contain *no* authorization logic: "authorization in two places is authorization
 * in neither; it drifts, and it drifts open" (SECURITY_MODEL.md §2 B3).
 */

export type ActorId = string & { readonly __actorIdBrand: unique symbol };
export type SessionId = string & { readonly __sessionIdBrand: unique symbol };
export type CorrelationId = string & { readonly __correlationIdBrand: unique symbol };

/** SECURITY_MODEL.md §4.1. */
export type Role =
  | 'EXECUTIVE'
  | 'PORTFOLIO_DIRECTOR'
  | 'DELIVERY_MANAGER'
  | 'FINANCE_CONTROLLER'
  | 'ASSURANCE_AUDITOR'
  | 'SECURITY_ADMIN';

/**
 * SECURITY_MODEL.md §4.3. Every exposed field carries exactly one classification.
 *
 * The axis is **what kind of information this is**, not who may see it and not how severe it is
 * (ADR-0016 C-12). A classification named after a role would make the taxonomy a second copy of the
 * authorization matrix, and two copies of an access rule is one rule and one liability.
 *
 * `SECURITY_TELEMETRY` was added at Phase 5 closure (ADR-0016 C-14) for security-operational
 * information — source IP, user agent, session and authentication metadata, authorization-decision
 * and failed-access metadata. It is an **authorization/data-handling** classification and says
 * nothing about privacy law: a source IP is security telemetry *and* personal data at the same time,
 * and the retention and lawful-basis treatment of it lives in `SECURITY_MODEL.md` §8.2, not here.
 * The model carries one classification per field, so the privacy dimension is documented rather
 * than modelled — recorded as **DR-037**.
 */
export type FieldClassification =
  | 'PUBLIC_INTERNAL'
  | 'DELIVERY_SENSITIVE'
  | 'COMMERCIAL_CONFIDENTIAL'
  | 'PERSONAL_DATA'
  | 'SECURITY_TELEMETRY';

/** A node in the organisational hierarchy that a user's scope is expressed over. */
export interface ScopeNode {
  readonly kind: 'BUSINESS_UNIT' | 'GEOGRAPHY' | 'PORTFOLIO' | 'ACCOUNT' | 'PROJECT';
  readonly id: string;
}

/**
 * Resolved per request, never supplied by the client (SECURITY_MODEL.md §2 B2).
 * Nothing below the Application layer may construct one of these from request input.
 */
export interface AuthorizationContext {
  readonly actorId: ActorId;
  readonly role: Role;
  readonly sessionId: SessionId;
  readonly correlationId: CorrelationId;
  readonly scope: readonly ScopeNode[];
  /** Present only during audited impersonation (SECURITY_MODEL.md §3). */
  readonly impersonatorId?: ActorId;
}

export type Decision = 'GRANT' | 'DENY';

export interface AuthorizationDecision {
  readonly decision: Decision;
  /** Denial reasons are for the audit log, never for the client (SECURITY_MODEL.md §4.5). */
  readonly reason?: string;
}

/**
 * The concrete set of entity ids a request may touch. ADR-0005 §5: aggregates are computed
 * over this set, never computed globally and filtered afterwards.
 */
export interface AuthorisedEntitySet {
  readonly projectIds: readonly string[];
  readonly resolvedFrom: readonly ScopeNode[];
}

/**
 * STUB — Phase 5. The policy decision point.
 *
 * Deny-by-default is a property of the implementation, not of this interface
 * (REQ-SEC-005). Phase 5 must make an unmapped capability or an unclassified field
 * fail closed and emit an audit record.
 */
export interface AuthorizationPolicy {
  /** Capability check: role × capability, per SECURITY_MODEL.md §4.4. */
  may(ctx: AuthorizationContext, capability: string): AuthorizationDecision;

  /** Resolve organisational scope to a concrete entity set (REQ-SEC-003). */
  resolveScope(ctx: AuthorizationContext): Promise<AuthorisedEntitySet>;

  /** Field-level gate (REQ-SEC-004). Unauthorised fields are *removed*, never nulled. */
  mayReadField(
    ctx: AuthorizationContext,
    classification: FieldClassification,
  ): AuthorizationDecision;
}

// --- Policy decision point (Phase 5) ----------------------------------------
export type { Capability, EntityPlacement } from './policy.js';
export {
  ALL_CAPABILITIES, ALL_CLASSIFICATIONS, ALL_ROLES, AUDITED_READ_CLASSIFICATIONS,
  CAPABILITY_MATRIX, CLASSIFICATION_MATRIX, DeclarativePolicy,
  SECURITY_TELEMETRY_RESOURCES, placementInScope,
} from './policy.js';

export const AUTHZ_IMPLEMENTATION_STATE =
  'IMPLEMENTED (Phase 5) — RBAC capability matrix, ABAC scope resolution, field classification gate, all deny-by-default' as const;
