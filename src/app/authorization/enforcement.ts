/**
 * The authorization enforcement point.
 *
 * Authority: ADR-0005 §1 — "The trust boundary is the Application layer. Every request is authorized
 * there, from scratch, on every call." `SECURITY_MODEL.md` §2 B2/B3: domain contexts contain no
 * authorization logic, because "authorization in two places is authorization in neither; it drifts,
 * and it drifts open."
 *
 * Every request passes `authorise()` and gets back an `AuthorisedRequest` — a token of proof that
 * carries the resolved entity set. A use case that wants data must accept one, and the only way to
 * obtain one is to have been authorised. That is why the constructor is private-by-convention here:
 * the type cannot be forged from client input, so "did we check?" is answered by the signature.
 *
 * Order matters and is not incidental:
 *   1. authenticate the session (server-side, from the store, never from the token);
 *   2. check the capability (RBAC) — deny by default;
 *   3. resolve scope to a concrete entity set (ABAC) **before any query runs** (ADR-0005 §5);
 *   4. if a specific entity was named, confirm it is in that set — otherwise **not found**;
 *   5. audit.
 *
 * Step 4 before step 5 and both before any read is what makes BOLA structurally impossible rather
 * than caught by a reviewer.
 */
import type {
  AuthorisedEntitySet,
  AuthorizationContext,
  Capability,
  CorrelationId,
  FieldClassification,
} from '@platform/authz';
import { DeclarativePolicy } from '@platform/authz';
import type { AuditRecord, AuditSink } from '@platform/audit';
import type { Clock } from '@platform/time';
import type { SessionRejection, SessionStore } from '@contexts/identity';
import { METRIC_NAMES, type Telemetry } from '@platform/observability';

/**
 * Everything a use case needs to be authorised, audited and reproducible. Assembled once per request
 * by the composition root, never by a domain context.
 */
export interface RequestContext {
  readonly auth: AuthorizationContext;
  readonly clock: Clock;
  readonly policy: DeclarativePolicy;
  readonly audit: AuditSink;
  readonly sessions: SessionStore;
  readonly telemetry?: Telemetry;
  /** Recorded on every audit entry. Not trusted for anything — it is the client's own claim. */
  readonly sourceIp: string;
  readonly userAgent: string;
}

/**
 * Declared per use case. Deny-by-default (REQ-SEC-005) means an undeclared capability or an
 * unclassified field is inaccessible — so this declaration is not documentation, it is the access
 * control input.
 */
export interface CapabilityDeclaration {
  readonly capability: Capability;
  readonly readsClassifications: readonly FieldClassification[];
  /** True when a successful read must itself be audited (`SECURITY_MODEL.md` §5.1). */
  readonly auditReads: boolean;
  /** Set for a mutation. Writes are always audited, regardless of `auditReads`. */
  readonly isWrite?: boolean;
}

/**
 * The one error the client ever sees for an authorization failure.
 *
 * Its message is `"Not found"` for every cause — wrong role, out of scope, expired session,
 * non-existent entity. `SECURITY_MODEL.md` §4.5: an out-of-scope entity requested by id must return
 * an identical response to a non-existent one. A distinct "forbidden" tells an attacker their id
 * guess was correct, which is the whole of the reconnaissance they need.
 */
export class AuthorizationDenied extends Error {
  constructor(readonly auditReason: string) {
    super('Not found');
    this.name = 'AuthorizationDenied';
  }
}

/**
 * Proof that a request was authorised, carrying what the authorisation resolved.
 *
 * Only `EnforcementPoint.authorise()` constructs one. A use case signature that requires it cannot
 * be called with unauthorised input, which is a stronger guarantee than a check at the top of the
 * function body that a later refactor can move.
 */
export class AuthorisedRequest {
  /** @internal — constructed only by the enforcement point. */
  constructor(
    readonly auth: AuthorizationContext,
    readonly capability: Capability,
    readonly entitySet: AuthorisedEntitySet,
    readonly correlationId: CorrelationId,
  ) {}

  /** Re-checks a single id against the resolved set. Cheap, and the last line before a read. */
  permits(projectId: string): boolean {
    return this.entitySet.projectIds.includes(projectId);
  }
}

export interface AuthoriseRequest {
  readonly declaration: CapabilityDeclaration;
  /** When present, the specific entity the caller named. Validated against the resolved set. */
  readonly entityId?: string;
  readonly entityType: string;
}

export class EnforcementPoint {
  async authorise(ctx: RequestContext, request: AuthoriseRequest): Promise<AuthorisedRequest> {
    const { declaration } = request;
    const span = ctx.telemetry?.startSpan('authz.authorise', {
      capability: declaration.capability,
      entityType: request.entityType,
      role: ctx.auth.role,
    });

    const deny = async (reason: string): Promise<never> => {
      await this.#audit(ctx, request, 'DENY', reason, []);
      ctx.telemetry?.counter(METRIC_NAMES.authorizationDenials, 1, {
        capability: declaration.capability, role: ctx.auth.role,
      });
      if (span !== undefined) ctx.telemetry?.endSpan(span, 'ERROR');
      throw new AuthorizationDenied(reason);
    };

    // 1. Session — validated server-side against the stored record, never read from the token.
    const session = ctx.sessions.validate(ctx.auth.sessionId);
    if (!session.ok) return deny(sessionReason(session.reason));
    if (session.record.actorId !== ctx.auth.actorId) {
      return deny('session actor does not match the request context actor');
    }

    // 2. RBAC.
    const capability = ctx.policy.may(ctx.auth, declaration.capability);
    if (capability.decision === 'DENY') return deny(capability.reason ?? 'capability denied');

    // 3. Field classifications, before anything is read. An undeclared classification denies.
    for (const classification of declaration.readsClassifications) {
      const field = ctx.policy.mayReadField(ctx.auth, classification);
      if (field.decision === 'DENY') {
        // Not a denial of the request: the request proceeds and the field is omitted at
        // serialisation (SECURITY_MODEL.md §4.5). Recorded so the omission is investigable.
        ctx.telemetry?.addEvent(span ?? ctx.telemetry.startSpan('authz.field'), 'field.withheld', {
          classification,
        });
      }
    }

    // 4. ABAC — scope resolved to a concrete set before any query runs.
    const entitySet = await ctx.policy.resolveScope(ctx.auth);

    // 5. Object-level check. Out of scope and non-existent are indistinguishable from here out.
    if (request.entityId !== undefined && !entitySet.projectIds.includes(request.entityId)) {
      return deny(
        `entity ${request.entityType}:${request.entityId} is outside the caller's authorised set ` +
        `(${entitySet.projectIds.length} entities resolved from ${entitySet.resolvedFrom.length} scope nodes)`,
      );
    }

    if (declaration.auditReads || declaration.isWrite === true) {
      await this.#audit(ctx, request, 'GRANT', undefined, declaration.readsClassifications);
    }
    ctx.telemetry?.counter(METRIC_NAMES.authorizationDecisions, 1, {
      capability: declaration.capability, role: ctx.auth.role, decision: 'GRANT',
    });
    if (span !== undefined) ctx.telemetry?.endSpan(span, 'OK');

    return new AuthorisedRequest(
      ctx.auth, declaration.capability, entitySet, ctx.auth.correlationId,
    );
  }

  /**
   * Records a write, with a before/after fingerprint.
   *
   * Separate from `authorise()` because the fingerprint is only knowable after the mutation is
   * computed. `SECURITY_MODEL.md` §5.3 requires the audit to be written in the same transaction as
   * the write; in the POC's in-process store the equivalent guarantee is that this rejects, and the
   * caller must not commit if it does.
   */
  async recordWrite(
    ctx: RequestContext,
    args: {
      readonly entityType: string;
      readonly entityId: string;
      readonly action: AuditRecord['action'];
      readonly reason: string;
      readonly changedFields: readonly string[];
      readonly beforeHash: string | null;
      readonly afterHash: string;
    },
  ): Promise<void> {
    await ctx.audit.record({
      occurredAt: ctx.clock.now(),
      actorId: ctx.auth.actorId,
      actorRole: ctx.auth.role,
      ...(ctx.auth.impersonatorId !== undefined ? { impersonatorId: ctx.auth.impersonatorId } : {}),
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      fields: args.changedFields,
      decision: 'GRANT',
      reason:
        `${args.reason} | before=${args.beforeHash ?? 'none'} after=${args.afterHash}`,
      correlationId: ctx.auth.correlationId,
      sourceIp: ctx.sourceIp,
      userAgent: ctx.userAgent,
    });
  }

  async #audit(
    ctx: RequestContext,
    request: AuthoriseRequest,
    decision: 'GRANT' | 'DENY',
    reason: string | undefined,
    classifications: readonly FieldClassification[],
  ): Promise<void> {
    await ctx.audit.record({
      occurredAt: ctx.clock.now(),
      actorId: ctx.auth.actorId,
      actorRole: ctx.auth.role,
      ...(ctx.auth.impersonatorId !== undefined ? { impersonatorId: ctx.auth.impersonatorId } : {}),
      action: request.declaration.isWrite === true ? 'WRITE' : 'READ',
      entityType: request.entityType,
      entityId: request.entityId ?? '*',
      fields: [...classifications],
      decision,
      ...(reason !== undefined ? { reason } : {}),
      correlationId: ctx.auth.correlationId,
      sourceIp: ctx.sourceIp,
      userAgent: ctx.userAgent,
    });
  }
}

function sessionReason(r: SessionRejection): string {
  switch (r) {
    case 'NOT_FOUND': return 'session not found';
    case 'REVOKED': return 'session was revoked (logout, or a role/scope change)';
    case 'ABSOLUTE_EXPIRY': return 'session passed its absolute 8h lifetime';
    case 'IDLE_EXPIRY': return 'session passed its 30m idle window';
  }
}

export const ENFORCEMENT_IMPLEMENTATION_STATE =
  'IMPLEMENTED (Phase 5) — session, RBAC, ABAC scope resolution, object-level check and audit, in that order' as const;
