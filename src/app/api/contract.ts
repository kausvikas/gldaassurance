/**
 * The versioned API contract.
 *
 * **What this is, and what it deliberately is not.** ADR-0006 proposes the BFF and HTTP transport
 * and is still `Proposed`; `ARCHITECTURE_DECISIONS.md` §2 forbids code depending on a Proposed ADR.
 * So there is no HTTP server here. What there *is* is everything that would sit behind one and that
 * carries the security properties: a declared route table with an explicit version, schema
 * validation that rejects unknown fields, pagination and filter ceilings, a rate limiter, and the
 * response-header set a transport must apply. Adding Express or Fastify later wires these in; it
 * does not move a single security decision.
 *
 * The routes expose **resources**, never tables. No route names a schema, a column, or an internal
 * id format, and no handler accepts a field selector, an order-by, or anything else that lets a
 * caller shape a query. A caller who can shape a query can eventually shape one you did not intend.
 */
import type { Capability, FieldClassification } from '@platform/authz';

export const API_VERSION = 'v1' as const;

/** Every route the API recognises. A path outside this table is not routable (REQ-SEC-005). */
export interface RouteDefinition {
  readonly method: 'GET' | 'POST' | 'PATCH';
  /** Version-prefixed, resource-shaped. `:id` is a single path parameter, always validated. */
  readonly path: string;
  readonly capability: Capability;
  readonly entityType: string;
  readonly readsClassifications: readonly FieldClassification[];
  readonly auditReads: boolean;
  readonly isWrite: boolean;
  /** Max page size this route will ever return, regardless of what is asked for. */
  readonly maxPageSize?: number;
  readonly description: string;
}

/**
 * Pagination ceilings exist for two reasons and the second is the important one: a page size of
 * 10,000 is a denial-of-service vector, and it is also how a scoped user turns "list my projects"
 * into "dump the portfolio" if scope resolution ever regresses. A ceiling limits the blast radius
 * of a bug that has not happened yet.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const MAX_FILTER_VALUES = 20;

export const ROUTES: readonly RouteDefinition[] = [
  {
    method: 'GET', path: `/${API_VERSION}/projects`, capability: 'project.view',
    entityType: 'project', readsClassifications: ['PUBLIC_INTERNAL', 'DELIVERY_SENSITIVE'],
    auditReads: false, isWrite: false, maxPageSize: MAX_PAGE_SIZE,
    description: 'List projects within the caller\'s authorised set.',
  },
  {
    method: 'GET', path: `/${API_VERSION}/projects/:id`, capability: 'project.view',
    entityType: 'project',
    readsClassifications: ['PUBLIC_INTERNAL', 'DELIVERY_SENSITIVE', 'COMMERCIAL_CONFIDENTIAL'],
    auditReads: true, isWrite: false,
    description: 'One project. Commercial fields are omitted for roles that may not read them.',
  },
  {
    // The Phase 8 one-project executive review. Object-level: the enforcement point checks this
    // project is inside the caller's resolved set before the handler runs, so an unauthorised id
    // returns the same generic not-found as an id that does not exist (SECURITY_MODEL.md §4.5).
    method: 'GET', path: `/${API_VERSION}/projects/:id/executive-health`,
    capability: 'project.view', entityType: 'projectExecutiveHealth',
    readsClassifications: ['PUBLIC_INTERNAL', 'DELIVERY_SENSITIVE', 'COMMERCIAL_CONFIDENTIAL'],
    auditReads: true, isWrite: false, maxPageSize: 1,
    description: 'One project\'s executive health review, with evidence for every headline figure.',
  },
  {
    // The Phase 9 economic diagnostic. Requires `project.viewCommercial`, not `project.view`: every
    // figure on it is commercial, so a caller without that capability is denied the route rather
    // than served a page whose every field is absent.
    method: 'GET', path: `/${API_VERSION}/projects/:id/margin-intelligence`,
    capability: 'project.viewCommercial', entityType: 'marginIntelligence',
    readsClassifications: ['PUBLIC_INTERNAL', 'DELIVERY_SENSITIVE', 'COMMERCIAL_CONFIDENTIAL'],
    auditReads: true, isWrite: false, maxPageSize: 1,
    description: 'One project\'s margin bridge, driver economics and scenarios.',
  },
  {
    // The Phase 10 forward-risk and recovery surface. `project.view`, not `viewCommercial`: the
    // signals and their ownership are delivery information, and the commercial recovery figures are
    // shaped out for a caller who may not read them rather than the whole page being denied.
    method: 'GET', path: `/${API_VERSION}/projects/:id/forward-risk`,
    capability: 'project.view', entityType: 'forwardRisk',
    readsClassifications: ['PUBLIC_INTERNAL', 'DELIVERY_SENSITIVE', 'COMMERCIAL_CONFIDENTIAL'],
    auditReads: true, isWrite: false, maxPageSize: 1,
    description: 'One project\'s emerging signals, outlook, recovery plan and intervention priority.',
  },
  {
    method: 'GET', path: `/${API_VERSION}/projects/:id/economics`, capability: 'project.viewCommercial',
    entityType: 'projectEconomics', readsClassifications: ['COMMERCIAL_CONFIDENTIAL'],
    auditReads: true, isWrite: false,
    description: 'Project economics. Every read is audited (SECURITY_MODEL.md §5.1).',
  },
  {
    // The Phase 7 executive landing surface. One row, because it is one view of one scope: the
    // aggregate a caller may see is a property of their authorised set, not a collection to page
    // through. Reads COMMERCIAL_CONFIDENTIAL, so a Delivery Manager receives the row with every
    // commercial field omitted rather than a denial — the shape of the page survives, the numbers
    // they may not see do not appear (SECURITY_MODEL.md §4.5).
    method: 'GET', path: `/${API_VERSION}/portfolio/command-center`,
    capability: 'portfolio.viewAggregates', entityType: 'portfolioCommandCenter',
    readsClassifications: ['PUBLIC_INTERNAL', 'DELIVERY_SENSITIVE', 'COMMERCIAL_CONFIDENTIAL'],
    auditReads: true, isWrite: false, maxPageSize: 1,
    description: 'Executive portfolio command centre, aggregated over the authorised set only.',
  },
  {
    method: 'GET', path: `/${API_VERSION}/portfolio/summary`, capability: 'portfolio.viewAggregates',
    entityType: 'portfolioSummary', readsClassifications: ['COMMERCIAL_CONFIDENTIAL'],
    auditReads: true, isWrite: false,
    // One aggregate row, never more. Declared rather than left undefined so the contract test's
    // rule — every collection-shaped GET states its ceiling — has no exceptions to argue about.
    maxPageSize: 1,
    description: 'Aggregates computed over the authorised set only (ADR-0005 §5).',
  },
  {
    method: 'GET', path: `/${API_VERSION}/lineage/:id`, capability: 'project.view',
    entityType: 'lineage', readsClassifications: ['PUBLIC_INTERNAL'],
    auditReads: false, isWrite: false,
    description: 'Source, freshness and evidence ids behind a project\'s metrics (REQ-DATA-010).',
  },
  {
    // The only route that reads SECURITY_TELEMETRY (ADR-0016 C-14). The classification is granted to
    // `ASSURANCE_AUDITOR` alone, `SECURITY_TELEMETRY_RESOURCES` confines it to this resource, and
    // the read is audited naming the telemetry fields actually returned — an investigative grant
    // that is not itself investigable is a blind spot where one is least affordable.
    method: 'GET', path: `/${API_VERSION}/audit`, capability: 'audit.read',
    entityType: 'auditEvent',
    readsClassifications: ['COMMERCIAL_CONFIDENTIAL', 'SECURITY_TELEMETRY'],
    auditReads: true, isWrite: false, maxPageSize: MAX_PAGE_SIZE,
    description: 'Audit log. Readable by ASSURANCE_AUDITOR; reading it is itself audited.',
  },
  {
    method: 'POST', path: `/${API_VERSION}/projects/:id/rag-override`, capability: 'health.applyOverride',
    entityType: 'ragOverride', readsClassifications: ['PUBLIC_INTERNAL'],
    auditReads: false, isWrite: true,
    description: 'Apply an authorised RAG override. Requires actor, reason and expiry.',
  },
  {
    method: 'PATCH', path: `/${API_VERSION}/projects/:id/etc`, capability: 'forecast.updateEtc',
    entityType: 'estimateToComplete', readsClassifications: ['COMMERCIAL_CONFIDENTIAL'],
    auditReads: false, isWrite: true,
    description: 'Revise the bottom-up ETC. Audited with a before/after fingerprint.',
  },
];

/** Response headers a transport must set. Declared here so the set is reviewable and testable. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  // No inline script, no eval, nothing loaded cross-origin, and the page cannot be framed.
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    + "connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; "
    + "form-action 'self'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=()',
  // Responses carry authorised, per-caller data. A shared cache holding one is a cross-user leak.
  'Cache-Control': 'no-store',
};

/** Session cookie attributes (`SECURITY_MODEL.md` §3). No token ever reaches local storage. */
export const SESSION_COOKIE = {
  name: 'gldi_session',
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: '/',
} as const;

export function findRoute(method: string, path: string): RouteDefinition | undefined {
  return ROUTES.find((r) => r.method === method && matches(r.path, path));
}

/** Exact segment match, with `:param` matching one non-empty segment and nothing else. */
function matches(pattern: string, actual: string): boolean {
  const p = pattern.split('/');
  const a = actual.split('/');
  if (p.length !== a.length) return false;
  return p.every((seg, i) => (seg.startsWith(':') ? (a[i] ?? '').length > 0 : seg === a[i]));
}

export function pathParam(pattern: string, actual: string, name: string): string | undefined {
  const p = pattern.split('/');
  const a = actual.split('/');
  const idx = p.indexOf(`:${name}`);
  return idx === -1 ? undefined : a[idx];
}
