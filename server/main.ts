/**
 * The Delivery Intelligence BFF — routes, composition, and the demo session.
 *
 * Every route here is task-shaped (ADR-0006 §1): it answers a decision a surface supports rather
 * than exposing an entity. There is no `/projects/:id/fields`, no query parameter that selects a
 * projection, and no route that returns a domain object.
 *
 * **DEMO — SYNTHETIC DATA.** The identity here is the synthetic provider `SECURITY_MODEL.md` permits
 * in `dev` and `test` only. A caller states which persona they are and receives that persona's
 * authorised scope; there is no password, and there is nothing real to authenticate against. That is
 * why §79 of the Phase 13 contract says a static synthetic POC does not prove production
 * authorization, and why this file does not pretend otherwise: the authorization *path* is real and
 * fully exercised, the *identity* is a demo fixture.
 */
import {
  GatewayToolPort, NEW_CONVERSATION, askWithPlan, buildRouter, ingestDocument, ingestStructured,
  providerNarration, readState, vocabularyFrom,
} from '@app';
import type { PlannerVocabulary, SourceRegistry } from '@app';
import { loadAiConfig, loadConfig } from '@platform/config';
import type { Instant } from '@platform/time';
import { fromBase64 } from '@platform/bytes';
import { DEMO_NOW, createDemoApi } from '../scripts/security/demo-api.js';
import { knowledgeDemo } from '../scripts/fixtures/demo-knowledge.js';
import { SUPPLEMENTAL_MAPPING } from '../scripts/fixtures/demo-knowledge.js';
import { DEFAULT_RUNTIME, Runtime } from './runtime.js';
import type { RouteRequest, RouteResponse } from './runtime.js';

const config = loadConfig(process.env);
const ai = loadAiConfig(process.env);
const now = (): Instant => DEMO_NOW;

const api = createDemoApi();
const providerRouter = buildRouter(ai, now);

/** The personas the demo will authenticate. A name not on this list is a not-found, not an error. */
const PERSONAS: Readonly<Record<string, string>> = {
  'exec.cdo': 'usr-exec-cdo',
  'dir.emea': 'usr-dir-emea',
  'dm.mobility': 'usr-dm-mobility',
};

interface Session {
  readonly persona: string;
  readonly ctx: Awaited<ReturnType<typeof buildSession>>['ctx'];
  readonly authorised: readonly string[];
  readonly vocabulary: PlannerVocabulary;
}

const sessions = new Map<string, Session>();
let knowledge: SourceRegistry | null = null;

async function buildSession(persona: string) {
  const actorId = PERSONAS[persona];
  if (actorId === undefined) throw new Error('unknown persona');
  const login = await api.login(persona);
  if (login === undefined) throw new Error('login failed');
  const ctx = api.contextFor(actorId, login.sessionId);
  const authorised = (await api.policy.resolveScope(ctx.auth)).projectIds;
  return { ctx, authorised };
}

/**
 * The knowledge registry, built once, lazily.
 *
 * Lazily because building it parses the fixture documents and workbooks, and a health check should
 * not pay for that. Once, because the index is in-memory and rebuilding it per request would make
 * "what has this source been used for" meaningless.
 */
async function knowledgeRegistry(): Promise<SourceRegistry> {
  if (knowledge !== null) return knowledge;
  const { ctx, authorised } = await buildSession('exec.cdo');
  const vocabulary = await vocabularyFrom({
    ctx, gateway: api.gateway, asOf: DEMO_NOW, authorisedProjectIds: authorised,
  });
  const first = vocabulary.projects[0];
  const demo = knowledgeDemo(authorised, first?.id ?? authorised[0] ?? 'prj-001');
  knowledge = demo.registry;
  return knowledge;
}

async function sessionFor(request: RouteRequest): Promise<Session | null> {
  const token = request.bearer;
  if (token === null) return null;
  const existing = sessions.get(token);
  if (existing !== undefined) return existing;
  return null;
}

const envelope = (data: unknown, extra: Record<string, unknown> = {}): RouteResponse => ({
  status: 200,
  body: {
    // The ADR-0006 §4 envelope, on every route. A response without `demoMarker` would be a response
    // that could be quoted without its synthetic provenance.
    data,
    asOf: DEMO_NOW,
    demoMarker: config.demoDataBanner,
    ...extra,
  },
});

const notFound: RouteResponse = { status: 404, body: { error: 'not_found' } };

export function buildRuntime(): Runtime {
  const runtime = new Runtime({
    ...DEFAULT_RUNTIME,
    allowedOrigins: ai.allowedOrigins,
  });

  // -------------------------------------------------------------------------
  // Health and configuration
  // -------------------------------------------------------------------------

  runtime.route('GET', '/api/health', () => Promise.resolve(envelope({
    status: 'ok',
    environment: config.environment,
    // Deliberately not a version string or a commit hash: a health endpoint that fingerprints the
    // build is a free reconnaissance surface, and nothing legitimate here needs it.
  })));

  /**
   * What the AI configuration surface renders.
   *
   * Provider, model, health, and the external-processing policy. **No key, no key digest, no
   * endpoint path.** The host is included because an operator needs to see whether traffic would
   * leave the boundary, and a hostname is not a secret.
   */
  runtime.route('GET', '/api/providers', async () => {
    const described = providerRouter.describe();
    const { buildProvider } = await import('@app');
    const { provider } = buildProvider(ai, now);
    const health = await provider.healthCheck();
    return envelope({
      selected: described.selected,
      model: described.model,
      external: described.external,
      fallbackConfigured: described.fallbackConfigured,
      policy: described.policyStatement,
      externalAiAllowed: ai.externalAiAllowed,
      health: {
        state: health.state,
        detail: health.detail,
        checkedAt: health.checkedAt,
        latencyMs: health.latencyMs,
      },
      metadata: provider.metadata(),
    });
  });

  // -------------------------------------------------------------------------
  // Session
  // -------------------------------------------------------------------------

  runtime.route('POST', '/api/session', async (request) => {
    const body = request.body as { persona?: unknown } | null;
    const persona = typeof body?.persona === 'string' ? body.persona : 'exec.cdo';
    if (!(persona in PERSONAS)) return notFound;

    const { ctx, authorised } = await buildSession(persona);
    const discovered = await vocabularyFrom({
      ctx, gateway: api.gateway, asOf: DEMO_NOW, authorisedProjectIds: authorised,
    });
    const vocabulary: PlannerVocabulary = { ...discovered, accounts: [], customers: [] };

    // The bearer is the demo session id. There is no cookie, which is what makes CSRF structurally
    // absent rather than mitigated (ADR-0032 §6).
    const token = ctx.auth.sessionId;
    sessions.set(token, { persona, ctx, authorised, vocabulary });

    return envelope({
      token,
      persona,
      authorisedProjectCount: authorised.length,
      filters: {
        regions: discovered.regions,
        industries: discovered.industries,
        deliveryGroups: discovered.deliveryGroups,
      },
    });
  });

  // -------------------------------------------------------------------------
  // The query engine
  // -------------------------------------------------------------------------

  runtime.route('POST', '/api/ask', async (request) => {
    const session = await sessionFor(request);
    if (session === null) return notFound;

    const body = request.body as {
      question?: unknown; state?: unknown; narrate?: unknown;
    } | null;
    const question = typeof body?.question === 'string' ? body.question.slice(0, 1000) : '';
    if (question.trim() === '') return { status: 400, body: { error: 'malformed_request' } };

    const registry = await knowledgeRegistry();
    const tools = new GatewayToolPort(
      session.ctx, api.gateway, DEMO_NOW, session.authorised, registry,
    );

    /*
     * Narration is opt-in per request and the provider is not.
     *
     * A caller may ask for prose; it cannot ask *which model writes it*. That would be a
     * user-controlled data-egress switch reachable from untrusted text through the planner, which is
     * exactly what ADR-0033 §2 puts out of reach by selecting the provider at composition time.
     */
    const wantsNarration = body?.narrate !== false;
    const narration = wantsNarration
      ? providerNarration(providerRouter, {
        materialClasses: ['DELIVERY_SENSITIVE', 'COMMERCIAL_CONFIDENTIAL'],
        documentClasses: [],
        authorities: [],
      })
      : undefined;

    const answer = await askWithPlan(question, {
      ctx: session.ctx,
      tools,
      asOf: DEMO_NOW,
      scopeLabel: session.persona,
      populationCount: session.authorised.length,
      vocabulary: session.vocabulary,
      knownMetricIds: [],
      state: body?.state === undefined ? NEW_CONVERSATION : readState(body.state),
      knowledge: registry,
      ...(narration === undefined ? {} : { narration }),
    });

    const routing = narration?.lastDecision() ?? null;

    return envelope({
      answer: answer.response.answer,
      why: answer.response.why,
      scopeLine: answer.scopeLine,
      plan: answer.plan,
      recognised: answer.recognised,
      answerability: answer.answerability,
      evidence: answer.evidence,
      claims: answer.response.materialClaims.map((c) => ({
        claimId: c.claimId,
        text: c.text,
        display: c.display,
        layer: c.epistemicLayer,
        metricId: c.envelope.metricId,
        authoritative: c.envelope.executiveAuthoritative,
        status: c.envelope.assessmentStatus,
        groundedBy: c.groundedBy,
      })),
      citations: answer.response.evidence,
      caveats: answer.response.caveats,
      missingEvidence: answer.response.missingEvidence,
      executiveAuthority: answer.response.executiveAuthority,
      assessmentStatus: answer.response.assessmentStatus,
      composer: answer.response.composer,
      refusal: answer.response.refusal ?? null,
      suggestedFollowUps: answer.response.suggestedFollowUps,
      provider: routing === null ? null : {
        outcome: routing.decision.outcome,
        providerId: routing.decision.providerId,
        model: routing.decision.model,
        external: routing.decision.external,
        explanation: routing.decision.explanation,
        policy: routing.decision.policy,
      },
      state: answer.state,
    });
  });

  // -------------------------------------------------------------------------
  // Knowledge & Connections
  // -------------------------------------------------------------------------

  runtime.route('GET', '/api/sources', async (request) => {
    const session = await sessionFor(request);
    if (session === null) return notFound;
    const registry = await knowledgeRegistry();
    return envelope({
      sources: registry.sources().map((s) => ({
        ...s,
        meaning: registry.statusMeaning(s.status as never),
      })),
      conflicts: registry.conflicts(),
      quarantined: registry.quarantined().length,
      dataQuality: registry.dataQuality(null),
      authority: registry.authority.all(),
    });
  });

  runtime.route('GET', '/api/sources/:id/verify', async (request) => {
    const session = await sessionFor(request);
    if (session === null) return notFound;
    const registry = await knowledgeRegistry();
    const id = request.query['id'];
    if (id === undefined) return notFound;
    const verification = registry.verify(id);
    return verification === null ? notFound : envelope(verification);
  });

  // -------------------------------------------------------------------------
  // Ingestion
  // -------------------------------------------------------------------------

  /**
   * A structured upload.
   *
   * Bytes arrive base64-encoded in JSON rather than as multipart. Multipart parsing is a notoriously
   * fiddly, historically vulnerable surface, and writing one by hand in the process that holds the
   * credential would undo the reason this runtime has no dependencies. Base64 costs a third more
   * bytes and removes the parser entirely.
   */
  runtime.route('POST', '/api/ingest/structured', async (request) => {
    const session = await sessionFor(request);
    if (session === null) return notFound;
    const body = request.body as {
      fileName?: unknown; contentBase64?: unknown; sourceName?: unknown;
    } | null;
    if (typeof body?.contentBase64 !== 'string' || typeof body.fileName !== 'string') {
      return { status: 400, body: { error: 'malformed_request' } };
    }
    const registry = await knowledgeRegistry();
    const sourceId = `src-upload-${Date.now().toString(36)}`;
    registry.register({
      sourceId,
      displayName: typeof body.sourceName === 'string' ? body.sourceName : body.fileName,
      kind: 'FILE_UPLOAD', domain: 'FILE_UPLOAD', status: 'CONFIGURED_UNVERIFIED',
      isFixture: false, receipts: [], lastUpdated: null,
    });

    const result = ingestStructured({
      sourceId,
      sourceName: typeof body.sourceName === 'string' ? body.sourceName : body.fileName,
      fileName: body.fileName,
      bytes: fromBase64(body.contentBase64),
      mapping: SUPPLEMENTAL_MAPPING,
      identity: (await knowledgeDemoIdentity()),
      registry: registry.authority,
      authority: 'SUPPLEMENTAL',
      dataContext: 'SANDBOX',
      receivedAt: DEMO_NOW,
      effectiveDate: '2026-08-31',
      declaredRecordCount: null,
      knownProjectIds: session.authorised,
    });
    registry.addReceipt(sourceId, result.receipt);
    registry.addObservations(result.observations);
    registry.addStaged(result.staged);

    return envelope({
      receipt: result.receipt,
      profile: result.profile,
      suggestions: result.suggestions,
      headers: result.headers,
      quarantined: result.quarantined.map((r) => ({
        rowNumber: r.rowNumber, naturalKey: r.naturalKey, findings: r.findings,
      })),
    });
  }, true);

  runtime.route('POST', '/api/ingest/document', async (request) => {
    const session = await sessionFor(request);
    if (session === null) return notFound;
    const body = request.body as {
      fileName?: unknown; contentBase64?: unknown; projectId?: unknown; documentClass?: unknown;
      statedVersion?: unknown;
    } | null;
    if (typeof body?.contentBase64 !== 'string' || typeof body.fileName !== 'string') {
      return { status: 400, body: { error: 'malformed_request' } };
    }
    const projectId = typeof body.projectId === 'string' ? body.projectId : null;
    // A plan may narrow the caller's scope and never widen it, and neither may an upload: a document
    // cannot be associated with a project the uploader is not authorised for.
    if (projectId !== null && !session.authorised.includes(projectId)) return notFound;

    const registry = await knowledgeRegistry();
    const sourceId = `src-doc-${Date.now().toString(36)}`;
    registry.register({
      sourceId, displayName: body.fileName, kind: 'DOCUMENT', domain: 'DOCUMENT_REPOSITORY',
      status: 'CONFIGURED_UNVERIFIED', isFixture: false, receipts: [], lastUpdated: null,
    });

    const result = ingestDocument({
      sourceId,
      fileName: body.fileName,
      bytes: fromBase64(body.contentBase64),
      title: null,
      documentClass: typeof body.documentClass === 'string'
        ? body.documentClass as never : 'OTHER',
      association: {
        projectIds: projectId === null ? [] : [projectId], customerIds: [], portfolioIds: [],
      },
      statedVersion: typeof body.statedVersion === 'string' ? body.statedVersion : null,
      effectiveDate: null,
      authority: 'EVIDENCE_ONLY',
      dataContext: 'SANDBOX',
      receivedAt: DEMO_NOW,
      index: registry.index,
    });
    registry.addReceipt(sourceId, result.receipt);

    return envelope({
      receipt: result.receipt,
      admission: result.admission,
      versionId: result.version.versionId,
      pageCount: result.version.pageCount,
      completeness: result.version.completeness,
      unreadable: result.version.unreadable,
    });
  }, true);

  return runtime;
}

/** The identity hub the demo registry was built with. */
async function knowledgeDemoIdentity() {
  const { identityHub } = await import('../scripts/fixtures/enterprise.js');
  return identityHub();
}

export const RUNTIME_STATE: string =
  'Task-shaped BFF over node:http with no dependencies. Transport only: no authorization decision, '
  + 'no metric, no DTO invented here (ADR-0006 §2, ADR-0032).';
