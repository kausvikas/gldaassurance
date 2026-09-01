/**
 * `ApplicationGateway` — the seam every Phase 7+ interaction goes through.
 *
 * **DR-041, and the trap it sets.** Phase 7 needs sorting, filtering, scope selection, period
 * selection, drill-down and pagination. The obvious way to get them is an HTTP server, and taking
 * that step casually would be a mistake with consequences far beyond a dashboard: ADR-0006 (BFF and
 * transport) is still `Proposed`, `ARCHITECTURE_DECISIONS.md` §2 forbids code depending on a
 * `Proposed` ADR, and the moment a transport exists **DR-029's entire security obligation
 * activates** — TLS, HSTS, CSRF, CORS, cookie attributes, all of which are currently `DECLARED` and
 * none of which is enforced. A dashboard would have silently created a security surface.
 *
 * So the interaction model is split into three, and only one of them needs a network:
 *
 * | Kind | Example | Where it lives | Needs transport? |
 * | --- | --- | --- | --- |
 * | **Presentation state** | expanded disclosure, focused row, which tab is open | The browser, entirely | No |
 * | **Application query** | "projects in this scope, sorted by priority" | This gateway | Not necessarily |
 * | **Application command** | "apply this RAG override" | This gateway | Not necessarily |
 *
 * The middle and bottom rows are the ones that carry authorization, and they are exactly what this
 * interface exists to keep honest. A query is **not** a function the UI calls on a domain context;
 * it is a request that goes through `Dispatcher` → `EnforcementPoint` → session, RBAC, ABAC,
 * object-level check, field shaping, audit — the same path, in the same order, whether the
 * implementation is an in-process adapter today or an HTTP client tomorrow.
 *
 * **That substitutability is the whole point.** The POC ships an in-process implementation, so no
 * transport is introduced and DR-029 stays closed. When ADR-0006 is accepted, an
 * `HttpApplicationGateway` implements this same interface and **not one line of Phase 7 changes** —
 * because Phase 7 was never allowed to know which one it had.
 *
 * ### What this interface deliberately does not offer
 *
 * There is no `getProject()`, no `query(sql)`, no `fetchAll()`. A caller states a *view* it wants
 * and a *page* of it; it cannot express "give me everything and I will filter". That is not
 * ergonomics — a caller that can shape a query can eventually shape one you did not intend, and a
 * client that filters locally is a client that filtered the page it happened to be given.
 */
import type { ApiRequest, ApiResponse } from './api/dispatcher.js';
import type { RequestContext } from './authorization/enforcement.js';

/**
 * A named view a surface can ask for. The set is closed on purpose: an unlisted view is not
 * requestable, which is REQ-SEC-005 deny-by-default applied to reads.
 */
export type ViewId =
  | 'portfolio.commandCenter'
  | 'portfolio.summary'
  | 'portfolio.projects'
  | 'project.detail'
  | 'project.executiveHealth'
  | 'project.marginIntelligence'
  | 'project.forwardRisk'
  | 'project.lineage'
  | 'audit.events';

/** Sort intent. The **service** sorts; this states what was asked for, never what was done. */
export interface SortIntent {
  readonly columnKey: string;
  readonly direction: 'ascending' | 'descending';
}

export interface FilterIntent {
  readonly filterId: string;
  readonly value: string;
}

/**
 * Everything a surface may vary about a view.
 *
 * Note what is **absent**: no field selector, no order-by expression, no predicate, no raw
 * identifier list. `scopeId` names a node the caller was already told they are authorised for, and
 * the server re-resolves it from the session on every request regardless — the selector narrows a
 * view, it never grants access (`SECURITY_MODEL.md` §4.2, §12.1).
 */
export interface ViewRequest {
  readonly view: ViewId;
  readonly scopeId?: string;
  readonly periodId?: string;
  readonly entityId?: string;
  readonly sort?: SortIntent;
  readonly filters?: readonly FilterIntent[];
  readonly page?: { readonly limit: number; readonly offset: number };
}

/**
 * The gateway.
 *
 * One method. A surface hands it a `ViewRequest` and a `RequestContext` and receives an already
 * authorised, already shaped `ApiResponse` — the same object an HTTP transport would serialise.
 * There is no second door, and no method that returns a domain object.
 */
export interface ApplicationGateway {
  /** How this gateway reaches the application. Recorded so a surface cannot pretend not to know. */
  readonly kind: 'IN_PROCESS' | 'HTTP';
  request(ctx: RequestContext, request: ViewRequest): Promise<ApiResponse>;
}

/** Maps a view to the route that serves it. One table, so a view cannot reach an unmapped path. */
export const VIEW_ROUTES: Readonly<Record<ViewId, { readonly method: ApiRequest['method']; readonly path: string }>> = {
  'portfolio.commandCenter': { method: 'GET', path: '/v1/portfolio/command-center' },
  'portfolio.summary': { method: 'GET', path: '/v1/portfolio/summary' },
  'portfolio.projects': { method: 'GET', path: '/v1/projects' },
  'project.detail': { method: 'GET', path: '/v1/projects/:id' },
  'project.executiveHealth': { method: 'GET', path: '/v1/projects/:id/executive-health' },
  'project.marginIntelligence': { method: 'GET', path: '/v1/projects/:id/margin-intelligence' },
  'project.forwardRisk': { method: 'GET', path: '/v1/projects/:id/forward-risk' },
  'project.lineage': { method: 'GET', path: '/v1/lineage/:id' },
  'audit.events': { method: 'GET', path: '/v1/audit' },
};

export class UnknownView extends Error {
  constructor(view: string) {
    super(
      `View "${view}" is not declared in VIEW_ROUTES. Deny-by-default (REQ-SEC-005): a view that is ` +
      'not in the table is not requestable, and adding one is a change to the API contract.',
    );
    this.name = 'UnknownView';
  }
}

/**
 * Translates a `ViewRequest` into the `ApiRequest` the dispatcher already understands.
 *
 * Exported separately from any implementation so a test can assert the translation without needing
 * a gateway — and so the *only* way a view becomes a path is through the closed table above.
 */
export function toApiRequest(request: ViewRequest): ApiRequest {
  const route = VIEW_ROUTES[request.view] as typeof VIEW_ROUTES[ViewId] | undefined;
  if (route === undefined) throw new UnknownView(request.view);

  const path = route.path.includes(':id')
    ? route.path.replace(':id', request.entityId ?? '')
    : route.path;

  // Sort and filter intent travel as ordinary query parameters, validated at the boundary like any
  // other input. They are *intent*: the service decides whether it can honour them.
  const query: Record<string, unknown> = {};
  if (request.page !== undefined) {
    query['limit'] = String(request.page.limit);
    query['offset'] = String(request.page.offset);
  }
  if (request.sort !== undefined) {
    query['sort'] = request.sort.columnKey;
    query['dir'] = request.sort.direction;
  }
  if (request.scopeId !== undefined) query['scope'] = request.scopeId;
  if (request.periodId !== undefined) query['period'] = request.periodId;
  for (const f of request.filters ?? []) query[`filter.${f.filterId}`] = f.value;

  return { method: route.method, path, query };
}

export const GATEWAY_STATE: string =
  'CONTRACT ONLY (Phase 6 closure, ADR-0020). The in-process implementation is the demo composition '
  + 'root; no HTTP transport exists and none is introduced. ADR-0006 remains Proposed and DR-029 '
  + 'remains closed.';
