/**
 * The request pipeline.
 *
 * One entry point, one order, no way around it. Every route goes through the same sequence, and the
 * sequence is the security design:
 *
 *   1. **route lookup** — an unmapped path is a 404 before anything else runs (REQ-SEC-005);
 *   2. **rate limit** — before authorisation, so a credential-stuffing loop is cheap to refuse;
 *   3. **validate** — path params and body, unknown fields rejected, before any id is trusted;
 *   4. **authorise** — session, RBAC, scope resolution, object-level check (`EnforcementPoint`);
 *   5. **handle** — the use case, which receives proof of authorisation and cannot be called without;
 *   6. **shape** — unauthorised fields removed at serialisation;
 *   7. **audit the sensitive read**, naming the fields actually returned.
 *
 * Steps 3 and 4 are in that order deliberately. Validating the id first means an id like
 * `../../admin` is rejected as malformed rather than reaching scope resolution, where a bug in
 * matching could make it interesting.
 *
 * There is no HTTP here — ADR-0006 is `Proposed` and nothing may depend on it. A transport adapter
 * calls `dispatch()` and applies `SECURITY_HEADERS`; every decision above is already made.
 */
import type { AuditRecord } from '@platform/audit';
import { countOf } from '@platform/language';
import { METRIC_NAMES } from '@platform/observability';
import {
  type AuthorisedRequest, type CapabilityDeclaration, type RequestContext,
  AuthorizationDenied, EnforcementPoint,
} from '../authorization/enforcement.js';
import { type FieldClassificationMap, type ShapeResult, shape } from '../authorization/field-policy.js';
import {
  type RouteDefinition, DEFAULT_PAGE_SIZE, findRoute, pathParam,
} from './contract.js';
import { type FixedWindowRateLimiter, RateLimitExceeded } from './rate-limit.js';
import { ValidationError, identifier, pageRequest, rejectUnknownFields } from './validation.js';

export interface ApiRequest {
  readonly method: 'GET' | 'POST' | 'PATCH';
  readonly path: string;
  readonly query: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
}

export interface ApiResponse {
  readonly status: 200 | 400 | 404 | 429;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * What a handler is given, and what it may not have.
 *
 * It receives an `AuthorisedRequest` — proof, carrying the resolved entity set — and a validated
 * page request. It receives no raw path, no raw query, and no session. A handler cannot re-derive
 * scope, cannot re-read the session, and cannot decide it needs one more project.
 */
export interface HandlerInput {
  readonly authorised: AuthorisedRequest;
  readonly entityId?: string;
  readonly page: { readonly limit: number; readonly offset: number };
  readonly body?: Record<string, unknown>;
}

export interface HandlerResult {
  /** Rows to be shaped and returned. Field names must all appear in `classifications`. */
  readonly rows: readonly Record<string, unknown>[];
  readonly classifications: FieldClassificationMap;
  readonly resourceName: string;
  readonly total?: number;
  /** Set by a write handler so the dispatcher can audit it with a fingerprint. */
  readonly write?: {
    readonly entityId: string;
    readonly action: AuditRecord['action'];
    readonly reason: string;
    readonly changedFields: readonly string[];
    readonly beforeHash: string | null;
    readonly afterHash: string;
  };
}

export type Handler = (input: HandlerInput, ctx: RequestContext) => Promise<HandlerResult>;

/**
 * The generic error body.
 *
 * Every failure that is not a validation failure returns exactly this, with exactly this status.
 * Wrong role, out of scope, expired session, non-existent id, unmapped route — one response.
 * `SECURITY_MODEL.md` §4.5: no existence disclosure, no distinct error code, no scope reasoning.
 */
const NOT_FOUND = { error: 'not_found' } as const;

export class Dispatcher {
  readonly #enforcement = new EnforcementPoint();

  constructor(
    private readonly handlers: ReadonlyMap<string, Handler>,
    private readonly limiter: FixedWindowRateLimiter,
    private readonly headers: Readonly<Record<string, string>>,
  ) {}

  async dispatch(request: ApiRequest, ctx: RequestContext): Promise<ApiResponse> {
    const span = ctx.telemetry?.startSpan('api.request', {
      method: request.method, route: request.path,
    });
    const finish = (response: ApiResponse): ApiResponse => {
      if (span !== undefined) {
        span.attributes['status'] = response.status;
        ctx.telemetry?.endSpan(span, response.status === 200 ? 'OK' : 'ERROR');
      }
      return response;
    };

    // 1. Route lookup. An unmapped path is indistinguishable from a forbidden one.
    const route = findRoute(request.method, request.path);
    if (route === undefined) {
      return finish({ status: 404, body: NOT_FOUND, headers: this.headers });
    }

    try {
      // 2. Rate limit, before authorisation so refusal is cheap.
      this.limiter.check(ctx.auth.actorId, bucketFor(route));

      // 3. Validate. The id is checked for shape before it is trusted as an identifier.
      const rawId = pathParam(route.path, request.path, 'id');
      const entityId = rawId === undefined ? undefined : identifier('id', rawId);
      const page = pageRequest(
        request.query, route.maxPageSize ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE,
      );
      const body = request.body === undefined
        ? undefined
        : rejectUnknownFields(request.body, allowedBodyFields(route));

      // 4. Authorise. Everything below this line has a resolved, checked entity set.
      const declaration: CapabilityDeclaration = {
        capability: route.capability,
        readsClassifications: route.readsClassifications,
        auditReads: route.auditReads,
        ...(route.isWrite ? { isWrite: true } : {}),
      };
      const authorised = await this.#enforcement.authorise(ctx, {
        declaration,
        entityType: route.entityType,
        ...(entityId !== undefined ? { entityId } : {}),
      });

      // 5. Handle.
      const handler = this.handlers.get(`${route.method} ${route.path}`);
      if (handler === undefined) {
        // A declared route with no handler is a deployment error, not a client error. It must not
        // return 200 with an empty body — that reads as "no data", which is a different claim.
        return finish({ status: 404, body: NOT_FOUND, headers: this.headers });
      }
      const result = await handler({
        authorised,
        ...(entityId !== undefined ? { entityId } : {}),
        page,
        ...(body !== undefined ? { body } : {}),
      }, ctx);

      // 6. Shape. Unauthorised fields are removed here, once, at the boundary.
      const shaped = result.rows.map((row) =>
        shape(result.resourceName, row, result.classifications, ctx.auth));

      // 7. Audit the write, or the sensitive read, naming the fields actually returned.
      if (result.write !== undefined) {
        await this.#enforcement.recordWrite(ctx, {
          entityType: route.entityType, ...result.write,
        });
      } else if (route.auditReads) {
        await this.#recordFieldLevelRead(ctx, route, entityId, shaped);
      }

      ctx.telemetry?.counter(METRIC_NAMES.requestDuration, 1, { route: route.path });

      return finish({
        status: 200,
        body: {
          data: shaped.map((s) => s.payload),
          page: { limit: page.limit, offset: page.offset, ...(result.total !== undefined ? { total: result.total } : {}) },
          // DEMO — SYNTHETIC DATA. Present on every payload (global invariant 11).
          notice: 'DEMO — SYNTHETIC DATA',
        },
        headers: this.headers,
      });
    } catch (error) {
      if (error instanceof RateLimitExceeded) {
        return finish({
          status: 429,
          body: { error: 'rate_limited' },
          headers: { ...this.headers, 'Retry-After': String(Math.ceil(error.retryAfterMs / 1000)) },
        });
      }
      if (error instanceof ValidationError) {
        // The issues go to telemetry, not to the client. A validator that explains itself to an
        // attacker is a schema disclosure tool.
        ctx.telemetry?.log('WARN', 'request rejected by validation', {
          route: route.path, issueCount: error.issues.length,
        }, ctx.auth.correlationId);
        return finish({ status: 400, body: { error: 'invalid_request' }, headers: this.headers });
      }
      if (error instanceof AuthorizationDenied) {
        return finish({ status: 404, body: NOT_FOUND, headers: this.headers });
      }
      throw error;
    }
  }

  /**
   * Audits a sensitive read with the fields that were actually returned.
   *
   * Not the fields that were *requested* — the fields that left the building. "Who looked at that
   * account's margin?" is answerable only if the record names `forecastGmPercent`, and a record
   * naming the route tells an investigator nothing they did not already know.
   *
   * **A security-telemetry read is named as such** (ADR-0016 C-14). The auditor's grant over
   * `sourceIp`/`userAgent` is the one grant in the system whose whole purpose is investigating other
   * people's access, so a reviewer must be able to ask "who ran an investigation, and when?" and get
   * an answer from the same log — hence `securityTelemetry=` in the reason, not merely the field
   * names among a longer list.
   */
  async #recordFieldLevelRead(
    ctx: RequestContext,
    route: RouteDefinition,
    entityId: string | undefined,
    shaped: readonly ShapeResult<Record<string, unknown>>[],
  ): Promise<void> {
    const fields = [...new Set(shaped.flatMap((s) => s.sensitiveFieldsRead))].sort();
    if (fields.length === 0) return;
    const telemetry = [...new Set(shaped.flatMap((s) => s.securityTelemetryRead))].sort();
    await ctx.audit.record({
      occurredAt: ctx.clock.now(),
      actorId: ctx.auth.actorId,
      actorRole: ctx.auth.role,
      ...(ctx.auth.impersonatorId !== undefined ? { impersonatorId: ctx.auth.impersonatorId } : {}),
      action: 'READ',
      entityType: route.entityType,
      entityId: entityId ?? '*',
      fields,
      decision: 'GRANT',
      reason: telemetry.length === 0
        ? `${countOf(shaped.length, 'record')} returned`
        : `${countOf(shaped.length, 'record')} returned | securityTelemetry=${telemetry.join(',')}`,
      correlationId: ctx.auth.correlationId,
      sourceIp: ctx.sourceIp,
      userAgent: ctx.userAgent,
    });
  }
}

function bucketFor(route: RouteDefinition): 'read' | 'write' {
  return route.isWrite ? 'write' : 'read';
}

/**
 * The body allow-list per route. A route not listed accepts **no** body at all, which is why the
 * default is an empty array rather than "anything".
 */
function allowedBodyFields(route: RouteDefinition): readonly string[] {
  switch (route.path) {
    case '/v1/projects/:id/rag-override':
      return ['rag', 'reason', 'expiresAt'];
    case '/v1/projects/:id/etc':
      return ['amount', 'currency', 'basisOfEstimate'];
    default:
      return [];
  }
}
