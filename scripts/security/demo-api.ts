/**
 * The composition root for the demo API — **DEMO — SYNTHETIC DATA**.
 *
 * This is where the pieces are assembled: a synthetic identity provider, the seeded personas, the
 * policy built from the generated portfolio's placements, an append-only audit log, and the
 * dispatcher with real handlers. It lives in `scripts/` rather than `src/` for one reason: it reads
 * the Phase 3 generator, and the G-ORACLE gate forbids production source from importing it.
 *
 * It exists so that the security tests attack a **running pipeline** rather than a mock. An
 * authorization test against a stub proves the stub is correct.
 */
import {
  type ApiRequest, type ApiResponse, type ApplicationGateway, type Handler, type RequestContext,
  type ViewRequest,
  Dispatcher, FixedWindowRateLimiter, SECURITY_HEADERS, buildLineageReport, classify, toApiRequest,
} from '@app';
import { buildCommandCenterFor } from '../assessment/command-center-adapter.js';
import { projectExecutiveHealthFor } from '../assessment/project-health-adapter.js';
import { marginIntelligenceFor } from '../assessment/margin-adapter.js';
import { forwardRiskFor } from '../assessment/risk-adapter.js';
import {
  type ActorId, type AuthorizationContext, type CorrelationId, type EntityPlacement,
  type Role, type ScopeNode, type SessionId, ALL_ROLES, DeclarativePolicy,
} from '@platform/authz';
import type { User } from '@contexts/identity';
import { InMemoryAuditLog, fingerprint, withinAuthorisedEntities } from '@platform/audit';
import { InMemoryExporter, Telemetry } from '@platform/observability';
import { FixedClock, type Instant } from '@platform/time';
import { MockIdentityProvider, SessionStore, assertDemoEnvironment } from '@contexts/identity';
import { computeEconomics, ratioValue } from '@contexts/financial';
import { generatePortfolio } from '../generator/index.js';
import { economicsInputFor } from '../assessment/curated-assessment.js';

export const DEMO_NOW = '2026-08-31T09:00:00.000Z' as Instant;

const portfolio = generatePortfolio();

/** Placements are the ABAC input: where each project sits in the organisation. */
export const PLACEMENTS: readonly EntityPlacement[] = portfolio.structure.projects.map((p) => ({
  projectId: p.projectId,
  businessUnitId: p.businessUnitId,
  geographyId: p.region,
  portfolioId: p.portfolioId,
  accountId: p.accountId,
}));

const PROJECT_BY_ID = new Map(portfolio.structure.projects.map((p) => [p.projectId, p]));

/** The universe of project ids, so audit scoping can tell "not yours" from "not a project". */
const ALL_PROJECT_IDS: readonly string[] = portfolio.structure.projects.map((p) => p.projectId);

/**
 * Field classifications per resource. **This is the security-critical table in this file.**
 *
 * `shape()` throws on any field not listed, so a new property on a DTO fails the build rather than
 * shipping to every role. Cost, margin, contract value and everything derived from them are
 * `COMMERCIAL_CONFIDENTIAL` per `SECURITY_MODEL.md` §4.3 — including the *variance* figures, because
 * a margin erosion in percentage points reconstructs the margin given the sold figure.
 */
export const PROJECT_FIELDS = classify([
  ['projectId', 'PUBLIC_INTERNAL'],
  ['name', 'PUBLIC_INTERNAL'],
  ['customerAlias', 'PUBLIC_INTERNAL'],
  ['region', 'PUBLIC_INTERNAL'],
  ['lifecycleStage', 'PUBLIC_INTERNAL'],
  ['plannedEndDate', 'PUBLIC_INTERNAL'],
  ['engagementModel', 'PUBLIC_INTERNAL'],
  ['physicalCompletion', 'DELIVERY_SENSITIVE'],
  ['plannedCompletion', 'DELIVERY_SENSITIVE'],
  ['contractValue', 'COMMERCIAL_CONFIDENTIAL'],
  ['forecastGmPercent', 'COMMERCIAL_CONFIDENTIAL'],
  ['soldGmPercent', 'COMMERCIAL_CONFIDENTIAL'],
  ['marginErosionPp', 'COMMERCIAL_CONFIDENTIAL'],
  ['gmValueAtRisk', 'COMMERCIAL_CONFIDENTIAL'],
  ['estimateAtCompletion', 'COMMERCIAL_CONFIDENTIAL'],
  ['leadDeveloperName', 'PERSONAL_DATA'],
  ['leadDeveloperUtilisation', 'PERSONAL_DATA'],
]);

/**
 * The command-centre payload, classified field by field.
 *
 * Nested structures — the KPI array, the ranked table, the bubbles — are classified as *whole
 * fields*, because that is the granularity at which they are useful: a KPI list with three of eight
 * entries removed reads as a broken page, whereas the list arriving or not arriving is a legible
 * authorization outcome. The split is by **audience**, not by convenience:
 *
 *   - `projectCount`, `asOf`, `week`, `ragDistribution`, `filters` — `PUBLIC_INTERNAL`. Structure and
 *     counts, no money.
 *   - `ranked`, `bubbles`, `greenAtRisk`, `whatChanged` — `DELIVERY_SENSITIVE`. Delivery status and
 *     trajectory, which a Delivery Manager legitimately sees.
 *   - `kpis` — `COMMERCIAL_CONFIDENTIAL`. Eight portfolio money figures. A Delivery Manager receives
 *     the page without them (OQ-3), which is the AC-5 difference made visible.
 *
 * The rows inside `ranked` carry commercial figures too, and that is handled the same way it is on
 * `/v1/projects`: this is the demo composition root, and a production build would shape nested rows
 * through the same `shape()` call rather than trusting the outer classification. Recorded as
 * **DR-046** rather than left implied.
 */
export const COMMAND_CENTER_FIELDS = classify([
  ['asOf', 'PUBLIC_INTERNAL'],
  ['week', 'PUBLIC_INTERNAL'],
  ['currency', 'PUBLIC_INTERNAL'],
  ['projectCount', 'PUBLIC_INTERNAL'],
  // The population this surface reports on, and how much of the caller's authorised universe it
  // leaves out. PUBLIC_INTERNAL: these are statements about *scope*, not about any project's
  // commercial position — and a reader who cannot see them cannot reconcile a total to a list.
  ['populationLabel', 'PUBLIC_INTERNAL'],
  ['authorisedUniverseCount', 'PUBLIC_INTERNAL'],
  ['excludedFromPopulation', 'PUBLIC_INTERNAL'],
  ['priorPeriodLabel', 'PUBLIC_INTERNAL'],
  ['ragDistribution', 'PUBLIC_INTERNAL'],
  ['filters', 'PUBLIC_INTERNAL'],
  ['insufficientEvidence', 'PUBLIC_INTERNAL'],
  ['greenAtRisk', 'DELIVERY_SENSITIVE'],
  ['ranked', 'DELIVERY_SENSITIVE'],
  ['bubbles', 'DELIVERY_SENSITIVE'],
  ['whatChanged', 'DELIVERY_SENSITIVE'],
  ['kpis', 'COMMERCIAL_CONFIDENTIAL'],
]);

/**
 * Phase 8 field classification for `projectExecutiveHealth`.
 *
 * The split is by **what a field reveals**, not by which section it appears in. The verdicts, the
 * dimension breakdown and the schedule position are `DELIVERY_SENSITIVE`; anything carrying money
 * or margin is `COMMERCIAL_CONFIDENTIAL`, so a caller without that classification receives the page
 * shape with the economics **absent** rather than a denial.
 *
 * `summary` is COMMERCIAL_CONFIDENTIAL because its ECONOMIC IMPACT sentence quotes margin at risk:
 * a narrative that repeats a restricted figure is a restricted figure.
 */
export const PROJECT_EXECUTIVE_HEALTH_FIELDS = classify([
  ['asOf', 'PUBLIC_INTERNAL'],
  ['week', 'PUBLIC_INTERNAL'],
  ['currency', 'PUBLIC_INTERNAL'],
  ['ruleVersion', 'PUBLIC_INTERNAL'],
  ['header', 'DELIVERY_SENSITIVE'],
  ['verdicts', 'DELIVERY_SENSITIVE'],
  ['dimensions', 'DELIVERY_SENSITIVE'],
  ['progressBurn', 'DELIVERY_SENSITIVE'],
  ['milestones', 'DELIVERY_SENSITIVE'],
  ['quality', 'DELIVERY_SENSITIVE'],
  ['statusConflict', 'DELIVERY_SENSITIVE'],
  ['confidence', 'DELIVERY_SENSITIVE'],
  // How much of the health model the assessment rests on. DELIVERY_SENSITIVE, not commercial: it
  // describes the completeness of an assessment, not any project's economics.
  ['coverage', 'DELIVERY_SENSITIVE'],
  // Which mechanism produced the band — model or policy override. Delivery information.
  ['bandProvenance', 'DELIVERY_SENSITIVE'],
  ['interventionRequired', 'DELIVERY_SENSITIVE'],
  ['commitment', 'COMMERCIAL_CONFIDENTIAL'],
  ['financial', 'COMMERCIAL_CONFIDENTIAL'],
  ['etcCredibility', 'COMMERCIAL_CONFIDENTIAL'],
  ['scopeCommercial', 'COMMERCIAL_CONFIDENTIAL'],
  ['summary', 'COMMERCIAL_CONFIDENTIAL'],
]);

/**
 * Phase 9 field classification for `marginIntelligence`.
 *
 * Almost everything here is `COMMERCIAL_CONFIDENTIAL`, which is why the route also requires
 * `project.viewCommercial`: a caller who could reach the page but read none of it would be served a
 * shell, and a shell that looks like a page is worse than a denial.
 */
export const MARGIN_INTELLIGENCE_FIELDS = classify([
  ['asOf', 'PUBLIC_INTERNAL'],
  ['week', 'PUBLIC_INTERNAL'],
  ['currency', 'PUBLIC_INTERNAL'],
  ['ruleVersion', 'PUBLIC_INTERNAL'],
  ['projectId', 'PUBLIC_INTERNAL'],
  ['projectName', 'DELIVERY_SENSITIVE'],
  ['customerAlias', 'DELIVERY_SENSITIVE'],
  ['demoMarker', 'PUBLIC_INTERNAL'],
  ['coreFinancials', 'COMMERCIAL_CONFIDENTIAL'],
  ['bridge', 'COMMERCIAL_CONFIDENTIAL'],
  ['trend', 'COMMERCIAL_CONFIDENTIAL'],
  ['riskEconomics', 'COMMERCIAL_CONFIDENTIAL'],
  ['contingency', 'COMMERCIAL_CONFIDENTIAL'],
  ['etcCredibility', 'COMMERCIAL_CONFIDENTIAL'],
  ['resourceEconomics', 'COMMERCIAL_CONFIDENTIAL'],
  // Staffing shape, in three cuts. All PERSONAL_DATA: they are counts of people, and the
  // classification is about what the records are, not about how identifying the aggregate feels.
  ['seniorityMix', 'PERSONAL_DATA'],
  ['locationMix', 'PERSONAL_DATA'],
  ['engagementMix', 'PERSONAL_DATA'],
  ['resourceNarrative', 'DELIVERY_SENSITIVE'],
  ['qualityEconomics', 'COMMERCIAL_CONFIDENTIAL'],
  ['dependencyEconomics', 'DELIVERY_SENSITIVE'],
  ['dependencyNarrative', 'DELIVERY_SENSITIVE'],
  ['scenarios', 'COMMERCIAL_CONFIDENTIAL'],
  ['contractLossWarning', 'COMMERCIAL_CONFIDENTIAL'],
  ['portfolio', 'COMMERCIAL_CONFIDENTIAL'],
]);

/**
 * Phase 10 field classification for `forwardRisk`.
 *
 * The split follows who the information is *for*. Signals, outlook, assurance and priority are
 * `DELIVERY_SENSITIVE` — a delivery manager needs them to act. Recovery economics carries margin
 * percentages and is `COMMERCIAL_CONFIDENTIAL`, so a caller without that classification gets the
 * page with the economics **absent** and the surface renders the withholding.
 */
export const FORWARD_RISK_FIELDS = classify([
  ['asOf', 'PUBLIC_INTERNAL'],
  ['week', 'PUBLIC_INTERNAL'],
  ['currency', 'PUBLIC_INTERNAL'],
  ['ruleVersion', 'PUBLIC_INTERNAL'],
  ['projectId', 'PUBLIC_INTERNAL'],
  ['demoMarker', 'PUBLIC_INTERNAL'],
  ['authorityNotice', 'PUBLIC_INTERNAL'],
  ['projectName', 'DELIVERY_SENSITIVE'],
  ['customerAlias', 'DELIVERY_SENSITIVE'],
  ['headline', 'DELIVERY_SENSITIVE'],
  ['signals', 'DELIVERY_SENSITIVE'],
  ['clearSignals', 'DELIVERY_SENSITIVE'],
  ['notEvaluated', 'DELIVERY_SENSITIVE'],
  ['signalsEvidence', 'DELIVERY_SENSITIVE'],
  ['outlook', 'DELIVERY_SENSITIVE'],
  ['assurance', 'DELIVERY_SENSITIVE'],
  ['interventionPriority', 'DELIVERY_SENSITIVE'],
  ['lateDetection', 'DELIVERY_SENSITIVE'],
  ['recoveryActions', 'COMMERCIAL_CONFIDENTIAL'],
  ['recoveryEconomics', 'COMMERCIAL_CONFIDENTIAL'],
]);

export const LINEAGE_FIELDS = classify([
  ['entityId', 'PUBLIC_INTERNAL'],
  ['overallFreshness', 'PUBLIC_INTERNAL'],
  ['degradedSources', 'PUBLIC_INTERNAL'],
  ['sources', 'PUBLIC_INTERNAL'],
  ['metrics', 'PUBLIC_INTERNAL'],
]);

/**
 * The audit event as it leaves the API.
 *
 * **CONFLICT C-14, found by the `UnclassifiedField` control rather than by review — now closed.**
 * `sourceIp` and `userAgent` had been recorded since Phase 2 and never classified. Classifying them
 * `PERSONAL_DATA` was the conservative first answer and it left a real gap: `PERSONAL_DATA` is
 * granted to nobody, so the two fields an investigator most needs ("was that read from the office or
 * from a hotel at 2am?") were recorded and then withheld from **every** role, including the auditor
 * whose entire purpose is to read this log.
 *
 * ADR-0016 C-14 is **ACCEPTED**: they are `SECURITY_TELEMETRY`, a classification granted to
 * `ASSURANCE_AUDITOR` and to nobody else, confined by `SECURITY_TELEMETRY_RESOURCES` to this
 * resource, and audited on read. Note what is *not* here:
 *
 *   - no role was granted blanket `PERSONAL_DATA` access as a workaround;
 *   - `SECURITY_ADMIN` did not get the grant either — identity administration and access
 *     investigation are different duties;
 *   - the rest of the record was **not** relabelled. `actorId`, `action` and `entityId` are what the
 *     log is *about*, not security-operational metadata about the connection, and reclassifying
 *     every audit field as telemetry would have made the new category mean "audit" instead of what
 *     it says. `fields` and `reason` stay `COMMERCIAL_CONFIDENTIAL` because they can name a margin
 *     field or quote a business justification.
 *
 * `SECURITY_TELEMETRY` is an authorization classification. It does not stop `sourceIp` being
 * personal data for retention and lawful-basis purposes — `SECURITY_MODEL.md` §8.2 gives it a 90-day
 * schedule, and the dual characterisation is **DR-037**.
 */
export const AUDIT_FIELDS = classify([
  ['id', 'PUBLIC_INTERNAL'],
  ['occurredAt', 'PUBLIC_INTERNAL'],
  ['actorId', 'PUBLIC_INTERNAL'],
  ['actorRole', 'PUBLIC_INTERNAL'],
  ['impersonatorId', 'PUBLIC_INTERNAL'],
  ['action', 'PUBLIC_INTERNAL'],
  ['entityType', 'PUBLIC_INTERNAL'],
  ['entityId', 'PUBLIC_INTERNAL'],
  ['decision', 'PUBLIC_INTERNAL'],
  ['fields', 'COMMERCIAL_CONFIDENTIAL'],
  ['reason', 'COMMERCIAL_CONFIDENTIAL'],
  ['correlationId', 'PUBLIC_INTERNAL'],
  ['ruleVersion', 'PUBLIC_INTERNAL'],
  // Security-operational metadata about the connection the action arrived on (ADR-0016 C-14).
  ['sourceIp', 'SECURITY_TELEMETRY'],
  ['userAgent', 'SECURITY_TELEMETRY'],
]);

const OVERRIDE_FIELDS = classify([
  ['projectId', 'PUBLIC_INTERNAL'],
  ['rag', 'PUBLIC_INTERNAL'],
  ['appliedAt', 'PUBLIC_INTERNAL'],
]);

const ETC_FIELDS = classify([
  ['projectId', 'PUBLIC_INTERNAL'],
  ['amount', 'COMMERCIAL_CONFIDENTIAL'],
  ['currency', 'PUBLIC_INTERNAL'],
]);

/** One project row. Every field it can carry is classified above; none is assembled ad hoc. */
function projectRow(projectId: string): Record<string, unknown> {
  const spec = PROJECT_BY_ID.get(projectId);
  if (spec === undefined) throw new Error(`unknown project ${projectId}`);
  const e = computeEconomics(economicsInputFor(portfolio, projectId));
  return {
    projectId: spec.projectId,
    name: spec.name,
    customerAlias: spec.customerId,
    region: spec.region,
    lifecycleStage: spec.lifecycleStage,
    plannedEndDate: spec.plannedEndDate,
    engagementModel: spec.engagementModel,
    contractValue: e.contractualRevenue.toQuantity(),
    forecastGmPercent: ratioValue(e.forecastGmPercent),
    soldGmPercent: ratioValue(e.soldGmPercent),
    marginErosionPp: ratioValue(e.marginErosionPp),
    gmValueAtRisk: e.gmValueAtRisk.toQuantity(),
    estimateAtCompletion: e.estimateAtCompletion.toQuantity(),
  };
}

export const HANDLERS = new Map<string, Handler>([
  ['GET /v1/projects', (input) => Promise.resolve({
    resourceName: 'project',
    classifications: PROJECT_FIELDS,
    total: input.authorised.entitySet.projectIds.length,
    // Rows come from the authorised set, never from a global list narrowed afterwards.
    rows: input.authorised.entitySet.projectIds
      .slice(input.page.offset, input.page.offset + input.page.limit)
      .map((id) => {
        const spec = PROJECT_BY_ID.get(id);
        return {
          projectId: id,
          name: spec?.name ?? '',
          customerAlias: spec?.customerId ?? '',
          region: spec?.region ?? '',
          lifecycleStage: spec?.lifecycleStage ?? '',
        };
      }),
  })],

  ['GET /v1/projects/:id', (input) => Promise.resolve({
    resourceName: 'project',
    classifications: PROJECT_FIELDS,
    rows: [projectRow(input.entityId as string)],
  })],

  /**
   * The Phase 8 project executive review.
   *
   * `input.entityId` reached here only because the enforcement point already checked it against the
   * caller's resolved scope — this handler performs no authorization of its own and could not: it
   * has no session and no policy.
   */
  ['GET /v1/projects/:id/executive-health', (input) => Promise.resolve({
    resourceName: 'projectExecutiveHealth',
    classifications: PROJECT_EXECUTIVE_HEALTH_FIELDS,
    rows: [{
      ...projectExecutiveHealthFor(portfolio, input.entityId as string),
    } as unknown as Record<string, unknown>],
  })],

  /**
   * The Phase 9 economic diagnostic.
   *
   * Portfolio driver ranking is computed over `input.authorised.entitySet.projectIds` — the caller's
   * own resolved set — so a ranking cannot reach a project the caller may not see (ADR-0005 §5).
   */
  ['GET /v1/projects/:id/margin-intelligence', (input) => Promise.resolve({
    resourceName: 'marginIntelligence',
    classifications: MARGIN_INTELLIGENCE_FIELDS,
    rows: [{
      ...marginIntelligenceFor(
        portfolio, input.entityId as string, input.authorised.entitySet.projectIds,
      ),
    } as unknown as Record<string, unknown>],
  })],

  /**
   * The Phase 10 forward-risk surface.
   *
   * Intervention rank and late detection are computed over `input.authorised.entitySet.projectIds`,
   * so a ranking cannot reach a project the caller may not see (ADR-0005 §5).
   */
  ['GET /v1/projects/:id/forward-risk', (input) => Promise.resolve({
    resourceName: 'forwardRisk',
    classifications: FORWARD_RISK_FIELDS,
    rows: [{
      ...forwardRiskFor(portfolio, input.entityId as string, input.authorised.entitySet.projectIds),
    } as unknown as Record<string, unknown>],
  })],

  ['GET /v1/projects/:id/economics', (input) => Promise.resolve({
    resourceName: 'project',
    classifications: PROJECT_FIELDS,
    rows: [projectRow(input.entityId as string)],
  })],

  /**
   * The Phase 7 executive landing surface.
   *
   * `input.authorised.entitySet.projectIds` **is** the authorised set — resolved by the enforcement
   * point before this handler ran, from the caller's session, not from anything in the request. The
   * command-centre service is handed that list and nothing else, so a portfolio total is a sum of
   * what this caller may see and cannot be anything else (ADR-0005 §5, AC-5).
   */
  ['GET /v1/portfolio/command-center', (input) => {
    const view = buildCommandCenterFor(portfolio, input.authorised.entitySet.projectIds);
    return Promise.resolve({
      resourceName: 'portfolioCommandCenter',
      classifications: COMMAND_CENTER_FIELDS,
      rows: [{ ...view } as unknown as Record<string, unknown>],
    });
  }],

  ['GET /v1/portfolio/summary', (input) => {
    // The aggregate is computed over the authorised set. There is no global total to filter.
    const ids = input.authorised.entitySet.projectIds;
    const totals = ids.reduce(
      (acc, id) => {
        const e = computeEconomics(economicsInputFor(portfolio, id));
        return {
          contractValue: acc.contractValue.plus(e.contractualRevenue),
          atRisk: acc.atRisk.plus(e.gmValueAtRisk),
        };
      },
      (() => {
        const first = computeEconomics(economicsInputFor(portfolio, ids[0] ?? 'prj-000'));
        const zero = first.contractualRevenue.minus(first.contractualRevenue);
        return { contractValue: zero, atRisk: zero };
      })(),
    );
    return Promise.resolve({
      resourceName: 'portfolioSummary',
      classifications: classify([
        ['projectCount', 'PUBLIC_INTERNAL'],
        ['contractValue', 'COMMERCIAL_CONFIDENTIAL'],
        ['gmValueAtRisk', 'COMMERCIAL_CONFIDENTIAL'],
      ]),
      rows: [{
        projectCount: ids.length,
        contractValue: totals.contractValue.toQuantity(),
        gmValueAtRisk: totals.atRisk.toQuantity(),
      }],
    });
  }],

  ['GET /v1/lineage/:id', (input) => {
    const report = buildLineageReport(
      input.entityId as string,
      DEMO_NOW,
      [
        { sourceSystemId: 'src-finance', displayName: 'Finance / ERP', domains: ['financial'], expectedCadenceDays: 1, lastSuccessfulSyncAt: '2026-08-31T02:00:00.000Z' as Instant, lastAttemptFailed: false },
        { sourceSystemId: 'src-delivery', displayName: 'Delivery tracker', domains: ['delivery'], expectedCadenceDays: 7, lastSuccessfulSyncAt: '2026-08-19T02:00:00.000Z' as Instant, lastAttemptFailed: false },
        { sourceSystemId: 'src-contract', displayName: 'Contract system', domains: ['contract'], expectedCadenceDays: 30, lastSuccessfulSyncAt: '2026-08-30T02:00:00.000Z' as Instant, lastAttemptFailed: true },
      ],
      [
        { metricId: 'MET-FIN-008', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED', sources: ['src-finance'], evidence: [{ context: 'financial', entityType: 'project', entityId: input.entityId as string }], ruleVersion: null, computedAt: DEMO_NOW },
        { metricId: 'MET-FIN-002', epistemicLevel: 'L1_OBSERVED', authoritativeSourceType: 'CONTRACT_SYSTEM', sources: ['src-contract'], evidence: [{ context: 'contract', entityType: 'baseline', entityId: input.entityId as string }], ruleVersion: null, computedAt: null },
      ],
    );
    return Promise.resolve({
      resourceName: 'lineage',
      classifications: LINEAGE_FIELDS,
      rows: [{
        entityId: report.entityId,
        overallFreshness: report.overallFreshness,
        degradedSources: report.degradedSources,
        sources: report.sources,
        metrics: report.metrics,
      }],
    });
  }],

  /**
   * The audit log, narrowed to the caller's authorised entity set before a row is returned.
   *
   * `SECURITY_MODEL.md` §4.2 says *all* reads are computed over the resolved set, and the audit log
   * is a read like any other — an auditor granted one business unit has no more business reading
   * another unit's access history than its margins, and the history is arguably the more revealing
   * of the two. `withinAuthorisedEntities` drops only rows naming a project outside the set; login,
   * session and collection-level (`entityId === '*'`) records are kept, because hiding the security
   * events an investigation needs in order to look tidy would defeat the log's purpose.
   */
  ['GET /v1/audit', (input, ctx) => (async () => {
    const records = await (ctx.audit as unknown as InMemoryAuditLog).query({}, {
      correlationId: input.authorised.correlationId,
    });
    const scoped = withinAuthorisedEntities(
      records, ALL_PROJECT_IDS, input.authorised.entitySet.projectIds,
    );
    return {
      resourceName: 'auditEvent',
      classifications: AUDIT_FIELDS,
      total: scoped.length,
      rows: scoped
        .slice(input.page.offset, input.page.offset + input.page.limit)
        .map((r) => ({ ...r })),
    };
  })()],

  ['POST /v1/projects/:id/rag-override', (input) => {
    const body = input.body ?? {};
    const before = { rag: 'GREEN' };
    const after = { rag: body['rag'] };
    const fp = fingerprint(before, after);
    return Promise.resolve({
      resourceName: 'ragOverride',
      classifications: OVERRIDE_FIELDS,
      rows: [{ projectId: input.entityId, rag: body['rag'], appliedAt: DEMO_NOW }],
      write: {
        entityId: input.entityId as string,
        action: 'OVERRIDE' as const,
        reason: String(body['reason'] ?? ''),
        changedFields: fp.changedFields,
        beforeHash: fp.beforeHash,
        afterHash: fp.afterHash,
      },
    });
  }],

  ['PATCH /v1/projects/:id/etc', (input) => {
    const body = input.body ?? {};
    const before = { amount: '0.00' };
    const after = { amount: body['amount'] };
    const fp = fingerprint(before, after);
    return Promise.resolve({
      resourceName: 'estimateToComplete',
      classifications: ETC_FIELDS,
      rows: [{ projectId: input.entityId, amount: body['amount'], currency: body['currency'] }],
      write: {
        entityId: input.entityId as string,
        action: 'WRITE' as const,
        reason: String(body['basisOfEstimate'] ?? ''),
        changedFields: fp.changedFields,
        beforeHash: fp.beforeHash,
        afterHash: fp.afterHash,
      },
    });
  }],
]);

const SCOPE_KINDS: readonly ScopeNode['kind'][] =
  ['BUSINESS_UNIT', 'GEOGRAPHY', 'PORTFOLIO', 'ACCOUNT', 'PROJECT'];

/**
 * Validates a seeded persona into a typed `User`, rejecting anything it does not recognise.
 *
 * The seed file is **data**, and data crossing into the identity model is parsed, not cast. A role
 * string the policy engine has never heard of would otherwise flow into `AuthorizationContext` and
 * be denied everything — which sounds safe until you notice it would be denied *silently*, and the
 * seed would look fine. Failing loudly here is what makes a typo in a role name a build failure
 * instead of a persona that mysteriously sees nothing.
 */
function toUser(raw: {
  actorId: string; username: string; displayName: string; role: string;
  scope: readonly { kind: string; id: string }[];
}): User {
  if (!(ALL_ROLES as readonly string[]).includes(raw.role)) {
    throw new Error(
      `Seeded persona "${raw.username}" carries role "${raw.role}", which is not in ` +
      `SECURITY_MODEL.md §4.1 (${ALL_ROLES.join(', ')}).`,
    );
  }
  for (const node of raw.scope) {
    if (!(SCOPE_KINDS as readonly string[]).includes(node.kind)) {
      throw new Error(
        `Seeded persona "${raw.username}" has scope node kind "${node.kind}", which is not a ` +
        'declared organisational level.',
      );
    }
  }
  return {
    actorId: raw.actorId as ActorId,
    username: raw.username,
    displayName: raw.displayName,
    role: raw.role as Role,
    scope: raw.scope.map((n) => ({ kind: n.kind as ScopeNode['kind'], id: n.id })),
    activeFrom: '2026-01-01' as User['activeFrom'],
    synthetic: true,
  };
}

/**
 * The in-process `ApplicationGateway` — **DR-041's answer, and the reason no transport exists.**
 *
 * Phase 7 codes against `ApplicationGateway`. This implementation satisfies it by calling the same
 * `Dispatcher` the adversarial suite attacks, so every request still passes session → RBAC → ABAC →
 * object-level check → field shaping → audit, in that order. Nothing is bypassed and nothing is
 * short-circuited because the caller happens to be in the same process.
 *
 * When ADR-0006 is accepted, an `HttpApplicationGateway` implements the same interface, `kind`
 * becomes `'HTTP'`, and Phase 7 does not change — which is the entire point of putting the seam
 * here rather than letting a dashboard reach for `fetch`.
 */
class InProcessGateway implements ApplicationGateway {
  readonly kind = 'IN_PROCESS' as const;
  constructor(private readonly dispatcher: Dispatcher) {}
  request(ctx: RequestContext, request: ViewRequest): Promise<ApiResponse> {
    return this.dispatcher.dispatch(toApiRequest(request), ctx);
  }
}

export interface DemoApi {
  readonly dispatch: (request: ApiRequest, ctx: RequestContext) => Promise<ApiResponse>;
  /** What Phase 7 consumes. Never `dispatch` directly. */
  readonly gateway: ApplicationGateway;
  readonly audit: InMemoryAuditLog;
  readonly sessions: SessionStore;
  readonly telemetryExporter: InMemoryExporter;
  readonly identity: MockIdentityProvider;
  readonly policy: DeclarativePolicy;
  readonly clock: FixedClock;
  contextFor(actorId: string, sessionId: SessionId): RequestContext;
  login(username: string): Promise<{ actorId: ActorId; sessionId: SessionId } | undefined>;
}

/** Builds a fresh, isolated API. Every test gets its own, so audit assertions are unambiguous. */
export function createDemoApi(now: Instant = DEMO_NOW): DemoApi {
  const clock = new FixedClock(now);
  assertDemoEnvironment(new MockIdentityProvider([]), 'test');

  const identity = new MockIdentityProvider(portfolio.users.map(toUser));
  const sessions = new SessionStore(() => clock.now());
  const audit = new InMemoryAuditLog();
  const policy = new DeclarativePolicy(PLACEMENTS);
  const exporter = new InMemoryExporter();
  const telemetry = new Telemetry(exporter, () => clock.now(), 'trace-demo');
  const limiter = new FixedWindowRateLimiter(() => clock.now());
  const dispatcher = new Dispatcher(HANDLERS, limiter, SECURITY_HEADERS);

  const subjects = new Map(portfolio.users.map((u) => [u.actorId, u]));

  return {
    dispatch: (request, ctx) => dispatcher.dispatch(request, ctx),
    gateway: new InProcessGateway(dispatcher),
    audit, sessions, telemetryExporter: exporter, identity, policy, clock,

    contextFor(actorId: string, sessionId: SessionId): RequestContext {
      const raw = subjects.get(actorId);
      if (raw === undefined) throw new Error(`unknown demo actor ${actorId}`);
      const user = toUser(raw);
      const auth: AuthorizationContext = {
        actorId: user.actorId,
        role: user.role,
        sessionId,
        correlationId: `cor-${actorId}` as CorrelationId,
        scope: user.scope,
      };
      return {
        auth, clock, policy, audit, sessions, telemetry,
        sourceIp: '198.51.100.10', userAgent: 'gldi-demo/1.0',
      };
    },

    async login(username: string) {
      const subject = await identity.verify(username);
      if (subject === undefined) return undefined;
      const session = sessions.issue(subject.actorId);
      await audit.record({
        occurredAt: clock.now(), actorId: subject.actorId, actorRole: subject.role,
        action: 'LOGIN', entityType: 'session', entityId: session.sessionId,
        fields: [], decision: 'GRANT', correlationId: `cor-${subject.actorId}` as CorrelationId,
        sourceIp: '198.51.100.10', userAgent: 'gldi-demo/1.0',
      });
      return { actorId: subject.actorId, sessionId: session.sessionId };
    },
  };
}
