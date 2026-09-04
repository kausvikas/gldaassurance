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
  GatewayToolPort, NEW_CONVERSATION, ToolDenied, askWithPlan, buildProvider, buildRouter,
  ingestDocument, ingestStructured, providerNarration, providerPlanning, readState, suggestMappings,
  vocabularyFrom,
} from '@app';
import type { ApprovedMapping, PlannerVocabulary, SourceRegistry } from '@app';
import { ALL_CONCEPTS } from '@contexts/integration';
import { detectFormat, parseCsv, parseXlsx, profile } from '@platform/parse';
import type { TabularSheet } from '@platform/parse';
import { fingerprint, fromBase64, utf8 } from '@platform/bytes';
import { loadAiConfig, loadConfig } from '@platform/config';
import { SystemClock } from '@platform/time';
import type { Instant } from '@platform/time';

import { DEMO_NOW, createDemoApi } from '../scripts/security/demo-api.js';
import { knowledgeDemo } from '../scripts/fixtures/demo-knowledge.js';
import { AccessControl, CallerRateLimit, loadAccessConfig } from './access.js';
import type { Caller } from './access.js';
import { durableStores } from './stores.js';
import { DEFAULT_RUNTIME, Runtime } from './runtime.js';
import type { RouteRequest, RouteResponse } from './runtime.js';

const config = loadConfig(process.env);
const ai = loadAiConfig(process.env);
const now = (): Instant => DEMO_NOW;

/**
 * Real elapsed time — a different clock from `now`, deliberately.
 *
 * `now` returns `DEMO_NOW`, the frozen as-of date the whole synthetic portfolio is reported against;
 * freezing it is what makes the demo reproducible. It is the wrong clock for anything that measures
 * *duration*: a session signed against a frozen clock never expires, and a rate-limit window
 * measured on one never reopens, so a caller would be blocked for the life of the process after their
 * thirtieth question. Governed time and operational time are two different things, and this is the
 * operational one.
 */
const wall = new SystemClock();
const elapsing = (): Instant => wall.now();

const api = createDemoApi();
const providerRouter = buildRouter(ai, now);
const { provider: selectedProvider } = buildProvider(ai, now);

/**
 * The model-assisted planner, present only where a provider could actually plan.
 *
 * Built once, at composition, and passed to every request — or not built at all, in which case the
 * orchestrator has no planning object in scope and the grammar is the only planner. That is the same
 * "enforced by what exists" pattern as the external-AI fallback: there is no runtime flag to get
 * wrong, because with no provider there is nothing to flag.
 */
const planningPort = selectedProvider.capabilities().structuredOutput
  ? providerPlanning(providerRouter, selectedProvider)
  : null;
const access = new AccessControl(loadAccessConfig(process.env), elapsing);

/**
 * Cost and abuse ceilings, per caller per minute (§18).
 *
 * Asking is limited more generously than uploading because asking is bounded work over a fixed
 * portfolio, while an upload is unbounded work over bytes the caller chose. Neither of these is the
 * real spending ceiling — Cloud Run's `max-instances` is, and it holds whatever a limiter does — but
 * they are what stops one caller consuming the instance everybody else is sharing.
 */
const askLimit = new CallerRateLimit(60_000, 30, elapsing);
const ingestLimit = new CallerRateLimit(60_000, 10, elapsing);

/**
 * The decoded upload ceiling (§15).
 *
 * The transport already refuses a body over 12 MiB, but that is a limit on base64 text; this is the
 * limit on what gets parsed, which is the thing that actually costs CPU. A file over it is refused
 * with its size named, because "too large" without a number is a support ticket.
 */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** The personas the demo will authenticate. A name not on this list is a not-found, not an error. */
const PERSONAS: Readonly<Record<string, string>> = {
  'exec.cdo': 'usr-exec-cdo',
  'dir.emea': 'usr-dir-emea',
  'dm.mobility': 'usr-dm-mobility',
};

interface PersonaState {
  readonly ctx: Awaited<ReturnType<typeof buildPersonaState>>['ctx'];
  readonly authorised: readonly string[];
  readonly vocabulary: PlannerVocabulary;
}

interface Session extends PersonaState {
  readonly persona: string;
  /** Identifies the sitting, for rate limiting and audit. Never an IP address. */
  readonly callerId: string;
}

/**
 * Per-persona state, cached per process.
 *
 * Deliberately keyed by **persona and not by token**. A cache keyed by token is a session store, and
 * a session store in a horizontally-scaled runtime is the same defect this release exists to close:
 * a token minted on one instance would be unknown to the next, and the second request of a
 * conversation would be rejected for no reason a user could see. Here every instance can rebuild any
 * caller's state from the signed token alone, so which instance answers is unobservable.
 */
const personaStates = new Map<string, PersonaState>();
let knowledge: SourceRegistry | null = null;
let knowledgeBuild: Promise<SourceRegistry> | null = null;

/**
 * Whether uploads will survive a restart, and why not when they will not.
 *
 * Reported rather than assumed. A deployment whose durable store is unreachable still answers
 * questions perfectly well — the portfolio is generated from code — but it must not accept an upload
 * and print a receipt, because the receipt would be false by the next cold start.
 */
let durability: { readonly durable: boolean; readonly detail: string } = {
  durable: false,
  detail: 'Durable storage has not been initialised yet.',
};

async function buildPersonaState(persona: string) {
  const actorId = PERSONAS[persona];
  if (actorId === undefined) throw new Error('unknown persona');
  const login = await api.login(persona);
  if (login === undefined) throw new Error('login failed');
  const ctx = api.contextFor(actorId, login.sessionId);
  const authorised = (await api.policy.resolveScope(ctx.auth)).projectIds;
  return { ctx, authorised };
}

/** Nothing to name. Not an error — see `personaState`. */
const NO_VOCABULARY: PlannerVocabulary = {
  regions: [], industries: [], deliveryGroups: [], projects: [], accounts: [], customers: [],
};

async function personaState(persona: string): Promise<PersonaState> {
  const cached = personaStates.get(persona);
  if (cached !== undefined) return cached;
  const { ctx, authorised } = await buildPersonaState(persona);

  /*
   * The planner's vocabulary is discovered from the Command Center, which not every persona may
   * read — and a denial there is an **answer**, not a failure.
   *
   * A delivery manager is not authorised for the portfolio view, so asking it what regions exist is
   * denied, and the previous code let that denial escape as a 500: the narrowest persona in the
   * product could not obtain a session at all. They can still ask about the projects they run; what
   * they cannot do is name a portfolio-level filter, and an empty vocabulary is exactly that
   * statement. Only a denial is absorbed — anything else is a real fault and still propagates.
   */
  let vocabulary = NO_VOCABULARY;
  try {
    const discovered = await vocabularyFrom({
      ctx, gateway: api.gateway, asOf: DEMO_NOW, authorisedProjectIds: authorised,
    });
    vocabulary = { ...discovered, accounts: [], customers: [] };
  } catch (e) {
    if (!(e instanceof ToolDenied)) throw e;
  }

  const state: PersonaState = { ctx, authorised, vocabulary };
  personaStates.set(persona, state);
  return state;
}

/**
 * The knowledge registry: deterministic seed first, then durable storage, then everything anyone has
 * uploaded.
 *
 * The order is the whole design. The fixture portfolio, its connectors and its demonstration
 * documents are rebuilt from code on every start — they are deterministic, so persisting them would
 * only mean reading a second copy back and double-counting it. Durable storage is attached *after*
 * that seed and `hydrate()` then overlays what real callers have added, which is the only content
 * that cannot be regenerated.
 *
 * Lazily because building it parses fixture documents and workbooks, and a health check should not
 * pay for that. Once, and behind a single in-flight promise: two requests arriving on a cold instance
 * would otherwise each build a registry, each hydrate it, and one of them would answer from a
 * registry the other had already replaced.
 */
async function knowledgeRegistry(): Promise<SourceRegistry> {
  if (knowledge !== null) return knowledge;
  knowledgeBuild ??= (async () => {
    const { ctx, authorised } = await buildPersonaState('exec.cdo');
    const vocabulary = await vocabularyFrom({
      ctx, gateway: api.gateway, asOf: DEMO_NOW, authorisedProjectIds: authorised,
    });
    const first = vocabulary.projects[0];
    const demo = knowledgeDemo(authorised, first?.id ?? authorised[0] ?? 'prj-001');
    const registry = demo.registry;

    // Wall time again: an access token cached against a frozen clock is cached for ever, and the
    // first write after an hour would fail on an expired credential.
    const stores = durableStores(process.env, elapsing);
    if (stores === null) {
      durability = {
        durable: false,
        detail: 'No durable store is configured, so this process keeps uploads in memory only and '
          + 'loses them when it restarts. Uploading is refused rather than accepted and lost.',
      };
    } else {
      await registry.useDurableStores(stores);
      try {
        await registry.hydrate();
        durability = { durable: true, detail: 'Uploads are written through to durable storage.' };
      } catch (e) {
        /*
         * A failed hydrate is not a failed start.
         *
         * The governed portfolio needs no storage, so every executive surface and every question
         * still works. What must not happen is an upload being accepted into a registry that could
         * not read what was already there — it would be reported as ingested, and it would be
         * missing content it should have superseded or conflicted with. So the process serves, and
         * ingestion is closed until storage answers.
         */
        durability = {
          durable: false,
          detail: `Durable storage did not answer, so uploading is closed: ${
            e instanceof Error ? e.message : 'unknown failure'}`,
        };
      }
    }

    knowledge = registry;
    return registry;
  })();
  return knowledgeBuild;
}

/**
 * Resolves the caller, or nothing.
 *
 * The persona comes out of the **signed token** and is never read from the request body or the query
 * string on any route but `/api/session`, where it is what the access code is being exchanged for.
 * That is what makes authorization ordering correct: identity is established from something the
 * server signed, and only then is scope resolved from that identity.
 */
async function callerFor(request: RouteRequest): Promise<Session | null> {
  const outcome = access.authenticate(request.bearer);
  if (!outcome.ok) return null;
  const caller: Caller = outcome.caller;
  if (!(caller.persona in PERSONAS)) return null;
  const state = await personaState(caller.persona);
  return { ...state, persona: caller.persona, callerId: caller.callerId };
}

/** The refusal a caller sees when they have no valid session. */
const unauthorised: RouteResponse = {
  status: 401,
  body: {
    error: 'unauthenticated',
    detail: 'This API requires a session. Exchange the demo access code at POST /api/session.',
  },
};

const rateLimited: RouteResponse = {
  status: 429,
  body: {
    error: 'rate_limited',
    detail: 'Too many requests from this session in the last minute. Nothing was processed.',
  },
};

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

  /**
   * Exchanges the demo access code for a signed session.
   *
   * This route used to hand a token to anyone who asked, which made every other route's
   * authentication check decorative: it verified that a caller had a token, and everyone could have
   * one. The access code is checked in constant time, the persona is checked against the closed list,
   * and only then is a token minted — with the persona **inside the signature**, so no later request
   * can claim a different one.
   *
   * The token is a bearer in a header. There is no cookie, which is what makes CSRF structurally
   * absent rather than mitigated (ADR-0032 §6).
   */
  runtime.route('POST', '/api/session', async (request) => {
    if (!access.enabled) {
      return {
        status: 503,
        body: {
          error: 'access_not_configured',
          detail: 'This deployment has no demo access code configured, so the API is closed. Set '
            + 'GLDI_DEMO_ACCESS_CODE to open it.',
        },
      };
    }

    const body = request.body as { persona?: unknown; accessCode?: unknown } | null;
    if (!access.verifyCode(body?.accessCode)) {
      /*
       * One refusal for a wrong code and for an unknown persona alike, and no hint which it was.
       * Distinguishing them turns this route into an oracle for enumerating valid personas, and
       * nobody legitimate needs to know which half they got wrong.
       */
      return { status: 401, body: { error: 'access_denied', detail: 'The access code was not accepted.' } };
    }
    const persona = typeof body?.persona === 'string' ? body.persona : 'exec.cdo';
    if (!(persona in PERSONAS)) {
      return { status: 401, body: { error: 'access_denied', detail: 'The access code was not accepted.' } };
    }

    const state = await personaState(persona);
    const issued = access.issue(persona);
    const vocabulary = state.vocabulary;

    return envelope({
      token: issued.token,
      persona,
      expiresAt: new Date(issued.caller.expiresAtMs).toISOString(),
      authorisedProjectCount: state.authorised.length,
      // Whether an upload made in this session will still be here tomorrow. Surfaced on the session
      // rather than discovered at the receipt, so the surface can say so before anyone chooses a file.
      knowledgeDurable: durability.durable,
      filters: {
        regions: vocabulary.regions,
        industries: vocabulary.industries,
        deliveryGroups: vocabulary.deliveryGroups,
      },
    });
  });

  // -------------------------------------------------------------------------
  // The query engine
  // -------------------------------------------------------------------------

  runtime.route('POST', '/api/ask', async (request) => {
    const session = await callerFor(request);
    if (session === null) return unauthorised;
    if (!askLimit.allow(session.callerId, 'ask')) return rateLimited;

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

    const registryForAudit = await knowledgeRegistry();
    const answer = await askWithPlan(question, {
      ...(planningPort === null ? {} : { planning: planningPort }),
      /*
       * Step 14 finally has a caller in the deployed product.
       *
       * The provider is read as a **thunk**, evaluated at audit time rather than passed by value,
       * so the record shows what the router actually decided for this request — including a refusal
       * to call an external model, which is the decision most worth having a record of.
       */
      auditAs: {
        persona: session.persona,
        recordedAt: elapsing,
        provider: () => {
          const d = narration?.lastDecision()?.decision ?? null;
          return {
            providerId: d?.providerId ?? null,
            model: d?.model ?? null,
            outcome: d?.outcome ?? null,
            policy: d?.policy.code ?? null,
          };
        },
        durable: registryForAudit.stores.audit,
      },
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
      // Disclosure, not diagnostics: a reader is entitled to know whether the grammar resolved their
      // question or a model proposed an interpretation that the validator then accepted.
      planOrigin: answer.plan?.origin ?? null,
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
    const session = await callerFor(request);
    if (session === null) return unauthorised;
    const registry = await knowledgeRegistry();
    return envelope({
      durability,
      // Named on the response rather than left to be inferred from a status: a reader who is looking
      // at a shorter conflict register than they expected is entitled to know why it is shorter.
      legacyIncomplete: registry.legacyIncompleteCount(),
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
    const session = await callerFor(request);
    if (session === null) return unauthorised;
    const registry = await knowledgeRegistry();
    const id = request.query['id'];
    if (id === undefined) return notFound;
    const verification = registry.verify(id);
    return verification === null ? notFound : envelope(verification);
  });

  /**
   * The caller's own answer lineage, read back.
   *
   * **Narrowed to the caller before a row is returned.** `SECURITY_MODEL.md` §4.2 says every read is
   * computed over the resolved set and the audit log is a read like any other — an auditor granted
   * one business unit has no more business reading another's audit rows than its projects. Here the
   * resolved set is the caller themselves: this route answers "what did *I* ask, and how was it
   * answered", which is what a person needs to check an answer they were given.
   *
   * The lineage carries no prose. The question is a digest and claims are identifiers, so this route
   * cannot be used to read back what anybody's answer actually said.
   */
  runtime.route('GET', '/api/audit', async (request) => {
    const session = await callerFor(request);
    if (session === null) return unauthorised;
    const registry = await knowledgeRegistry();
    const recent = await registry.stores.audit.recent(200);
    const actorId = String(session.ctx.auth.actorId);
    const mine = recent.filter((r) => r['actorId'] === actorId);
    return envelope({
      durable: durability.durable,
      count: mine.length,
      events: mine.slice(-25).reverse(),
    });
  });

  // -------------------------------------------------------------------------
  // Ingestion
  // -------------------------------------------------------------------------

  /**
   * **Phase one of two: profile, do not ingest.**
   *
   * §47 puts a preview and a user confirmation between parsing and ingestion, and the reason is not
   * ceremony. A mapping decides which column becomes which governed concept, and a wrong one is
   * invisible afterwards: the rows all load, the counts all look right, and a cost column has
   * quietly become an estimate. So this route parses, profiles and *suggests* — and writes nothing.
   *
   * Bytes arrive base64-encoded in JSON rather than as multipart. Multipart parsing is a notoriously
   * fiddly, historically vulnerable surface, and hand-writing one in the process that holds the
   * credential would undo the reason this runtime has no dependencies. Base64 costs a third more
   * bytes and removes the parser entirely.
   */
  runtime.route('POST', '/api/ingest/profile', (request) => {
    return (async () => {
      /*
       * Authentication first, and body validation second — the order matters.
       *
       * These two routes used to check the body shape before the caller, so an anonymous request
       * with a malformed body got `400 malformed_request` and one with a well-formed body got `401`.
       * The difference is small and it is still an oracle: it tells an unauthenticated caller that
       * the route exists, what shape it wants, and when they have guessed that shape correctly. §12
       * asks for the request to be rejected *before any work is done*, and reading the body counts.
       */
      const session = await callerFor(request);
      if (session === null) return unauthorised;
      if (!ingestLimit.allow(session.callerId, 'ingest')) return rateLimited;

      const body = request.body as { fileName?: unknown; contentBase64?: unknown } | null;
      if (typeof body?.contentBase64 !== 'string' || typeof body.fileName !== 'string') {
        return { status: 400, body: { error: 'malformed_request' } };
      }
      const bytes = fromBase64(body.contentBase64 as string);
      const oversize = refuseOversize(bytes);
      if (oversize !== null) return oversize;
      try {
        const sheet = profileUpload(bytes, body.fileName as string);
        return envelope({
          fileName: body.fileName,
          sheetName: sheet.name,
          headers: sheet.headers,
          rowsDetected: sheet.rows.length,
          rowsTruncated: sheet.rowsTruncated,
          fingerprint: fingerprint(bytes),
          byteLength: bytes.length,
          profile: profile(sheet),
          suggestions: suggestMappings(sheet.headers),
          concepts: ALL_CONCEPTS,
          // The first few rows, so a person confirming a mapping can see what they are confirming.
          preview: sheet.rows.slice(0, 5).map((r) => r.cells),
        });
      } catch (e) {
        return {
          status: 422,
          body: {
            error: 'unreadable_upload',
            detail: e instanceof Error ? e.message : 'The file could not be read.',
          },
        };
      }
    })();
  }, true);

  /**
   * **Phase two: ingest the mapping a person confirmed.**
   *
   * The mapping arrives from the caller and is checked field by field against the closed concept
   * vocabulary. This route previously ignored what the caller sent and applied a fixed mapping,
   * which made the confirmation step decorative — the user could approve one thing and the pipeline
   * would apply another, with a receipt describing the mapping that ran rather than the one they
   * saw.
   *
   * Authority is **not** taken from the request. An upload is `SUPPLEMENTAL`, decided here; a source
   * that could assert its own authority could promote itself above Finance by sending one field
   * (ADR-0035 §4).
   */
  runtime.route('POST', '/api/ingest/structured', (request) => {
    return (async () => {
      // Caller before body, for the reason given on the profile route above.
      const session = await callerFor(request);
      if (session === null) return unauthorised;
      if (!ingestLimit.allow(session.callerId, 'ingest')) return rateLimited;
      const closed = await refuseWhenNotDurable();
      if (closed !== null) return closed;

      const body = request.body as {
        fileName?: unknown; contentBase64?: unknown; sourceName?: unknown;
        identityField?: unknown; periodField?: unknown; fields?: unknown;
      } | null;
      if (typeof body?.contentBase64 !== 'string' || typeof body.fileName !== 'string'
        || typeof body.identityField !== 'string') {
        return { status: 400, body: { error: 'malformed_request' } };
      }
      const bytes = fromBase64(body.contentBase64 as string);
      const oversize = refuseOversize(bytes);
      if (oversize !== null) return oversize;

      const mapping = readMapping(
        body.identityField as string,
        typeof body.periodField === 'string' && body.periodField !== '' ? body.periodField : null,
        body.fields,
      );
      if (mapping === null) {
        return {
          status: 400,
          body: {
            error: 'unmapped_upload',
            detail: 'No column was mapped to a governed concept, so there is nothing to ingest. A '
              + 'mapping is confirmed by a person; nothing here guesses one.',
          },
        };
      }

      const registry = await knowledgeRegistry();
      const sourceId = `src-upload-${Date.now().toString(36)}`;
      const displayName = typeof body.sourceName === 'string' && body.sourceName !== ''
        ? body.sourceName : body.fileName as string;
      registry.register({
        sourceId, displayName,
        kind: 'FILE_UPLOAD', domain: 'FILE_UPLOAD', status: 'CONFIGURED_UNVERIFIED',
        isFixture: false, receipts: [], lastUpdated: null,
      });

      // The uploaded source is granted SUPPLEMENTAL authority over exactly the concepts it maps —
      // never more, and never AUTHORITATIVE, whatever the request said.
      for (const field of mapping.fields) {
        registry.authority.register({
          sourceId, concept: field.concept, authority: 'SUPPLEMENTAL', priority: 9,
          conflictBehaviour: 'DISCLOSE',
          rationale: 'An uploaded extract. Evidence of what someone believes, not a system of record.',
        });
      }

      try {
        const result = ingestStructured({
          sourceId,
          sourceName: displayName,
          fileName: body.fileName as string,
          bytes,
          mapping,
          identity: await knowledgeDemoIdentity(),
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
        registry.retainOriginal(sourceId, result.receipt.fingerprint, bytes, uploadContentType(bytes));

        /*
         * Commit before reporting (§9).
         *
         * The receipt is the product's promise that the upload landed. Returning it while the writes
         * were still in flight would make that promise true only until the next cold start — which is
         * precisely the failure this release was opened to close, and it would have been reported as
         * a success on the way in.
         */
        const failures = await registry.flush();
        if (failures.length > 0) return commitFailed(failures);

        return envelope({
          receipt: result.receipt,
          conflicts: registry.conflicts().filter(
            (c) => c.entries.some((e) => e.sourceId === sourceId),
          ),
          verification: registry.verify(sourceId),
          quarantined: result.quarantined.map((r) => ({
            rowNumber: r.rowNumber, naturalKey: r.naturalKey, findings: r.findings,
          })),
        });
      } catch (e) {
        return {
          status: 422,
          body: {
            error: 'unreadable_upload',
            detail: e instanceof Error ? e.message : 'The file could not be read.',
          },
        };
      }
    })();
  }, true);

  runtime.route('POST', '/api/ingest/document', async (request) => {
    const session = await callerFor(request);
    if (session === null) return unauthorised;
    if (!ingestLimit.allow(session.callerId, 'ingest')) return rateLimited;
    const closed = await refuseWhenNotDurable();
    if (closed !== null) return closed;
    const body = request.body as {
      fileName?: unknown; contentBase64?: unknown; projectId?: unknown; documentClass?: unknown;
      statedVersion?: unknown;
    } | null;
    if (typeof body?.contentBase64 !== 'string' || typeof body.fileName !== 'string') {
      return { status: 400, body: { error: 'malformed_request' } };
    }
    const bytes = fromBase64(body.contentBase64);
    const oversize = refuseOversize(bytes);
    if (oversize !== null) return oversize;
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
      bytes,
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
    // `ingestDocument` has already put the version in the in-memory index; this is what makes it
    // durable, so a restart rebuilds the retrieval corpus rather than losing it.
    registry.indexDocument(result.version);
    const retained = registry.retainOriginal(
      sourceId, result.version.versionId, bytes, uploadContentType(bytes),
    );

    const failures = await registry.flush();
    if (failures.length > 0) return commitFailed(failures);

    return envelope({
      receipt: result.receipt,
      admission: result.admission,
      versionId: result.version.versionId,
      pageCount: result.version.pageCount,
      completeness: result.version.completeness,
      unreadable: result.version.unreadable,
      originalRetainedAt: retained,
    });
  }, true);

  return runtime;
}

/**
 * Refuses an upload larger than the parse ceiling (§15).
 *
 * Before any parser sees the bytes. The parsers are bounded individually — entry counts, inflate
 * budgets, row caps — but a ceiling that only exists inside them is a ceiling that has to be
 * re-established in every one, including the next one somebody adds.
 */
function refuseOversize(bytes: Uint8Array): RouteResponse | null {
  if (bytes.length <= MAX_UPLOAD_BYTES) return null;
  return {
    status: 413,
    body: {
      error: 'upload_too_large',
      detail: `This file is ${String(Math.round(bytes.length / 1024))} KiB. The limit is `
        + `${String(MAX_UPLOAD_BYTES / 1024 / 1024)} MiB and nothing was parsed.`,
    },
  };
}

/**
 * Closes ingestion when what is uploaded would not survive the process (§52).
 *
 * A refusal is the honest answer here and an acceptance is not. The alternative — take the file,
 * parse it, print a receipt saying 3 detected 2 accepted, and lose all of it at the next revision —
 * is worse than being unable to upload, because the person has been told the opposite of what
 * happened and has no way to find out.
 */
async function refuseWhenNotDurable(): Promise<RouteResponse | null> {
  /*
   * Building the registry is what *determines* durability, so it has to happen first.
   *
   * Reading the flag without this returned "Durable storage has not been initialised yet" — the
   * initial value — on any instance whose first request was an upload, which is every cold instance a
   * person actually uses. The check was answering a question nobody had asked yet, and refusing a
   * perfectly durable deployment.
   */
  await knowledgeRegistry();
  if (durability.durable) return null;
  return {
    status: 503,
    body: { error: 'ingestion_unavailable', detail: durability.detail },
  };
}

/** A receipt is never returned for content that did not commit. */
function commitFailed(failures: readonly string[]): RouteResponse {
  return {
    status: 503,
    body: {
      error: 'not_committed',
      detail: 'The file was read and validated, and durable storage did not accept it. Nothing has '
        + 'been reported as ingested, because it is not.',
      failures,
    },
  };
}

/**
 * The content type of retained bytes, decided by the bytes.
 *
 * Not by the filename, and not by anything the caller said: this string is stored alongside the
 * object and would be echoed by whatever eventually serves it, so a caller who could set it could
 * choose how a browser interprets bytes it later downloads.
 */
function uploadContentType(bytes: Uint8Array): string {
  const format = detectFormat(bytes);
  if (format === 'PDF') return 'application/pdf';
  if (format === 'XLSX') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (format === 'TEXT') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

/**
 * Parses an upload for profiling, without ingesting it.
 *
 * The format is decided by the file's own bytes, never by its name (§80): an `.xlsx` that is really
 * a PDF is a routine mistake and an obvious attack, and either way the correct behaviour is to read
 * what it is or refuse.
 */
function profileUpload(bytes: Uint8Array, fileName: string): TabularSheet {
  const format = detectFormat(bytes);
  if (format === 'XLSX') {
    const workbook = parseXlsx(bytes);
    const first = workbook.sheets[0];
    if (first === undefined) throw new Error('The workbook contains no readable sheet.');
    return first;
  }
  if (format === 'TEXT') return parseCsv(utf8(bytes), fileName);
  throw new Error(
    `${fileName} is not a workbook or a delimited text file. The file's own bytes decide this, not `
    + 'its extension.',
  );
}

/**
 * Concepts whose values are not numbers.
 *
 * Every concept was previously treated as numeric, so mapping a date column to
 * `financial.financialPeriod` quarantined every row of a perfectly good file: `2026-08-31` is not a
 * decimal, the validator said so on all three rows, and the receipt reported nothing accepted. The
 * validator was right and the mapping was wrong — a defect found by running the upload through a
 * browser, which is where a person would map exactly that column to exactly that concept.
 */
const NON_NUMERIC_CONCEPTS: ReadonlySet<string> = new Set([
  'status.reportedRag',
  'financial.financialPeriod',
  'financial.invoiceStatus',
  'assurance.reviewDate',
  'assurance.actionStatus',
  'commercial.opportunity',
  'commercial.accountOwnership',
  'delivery.milestoneStatus',
  'delivery.releaseEvent',
  'contract.paymentMilestone',
  'document.contractTerm',
  'document.acceptanceCriteria',
]);

/**
 * Reads a caller-confirmed mapping, keeping only what the closed vocabulary admits.
 *
 * A concept the registry does not define is dropped rather than passed through, so a mapping cannot
 * introduce a concept by naming one. Everything numeric is marked non-negative by default because
 * every governed money and effort concept is; a caller wanting a signed value states it.
 */
function readMapping(
  identityField: string, periodField: string | null, raw: unknown,
): ApprovedMapping | null {
  if (!Array.isArray(raw)) return null;
  const fields: ApprovedMapping['fields'] = raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const e = entry as Record<string, unknown>;
    const sourceField = typeof e['sourceField'] === 'string' ? e['sourceField'] : null;
    const concept = typeof e['concept'] === 'string' ? e['concept'] : null;
    if (sourceField === null || concept === null) return [];
    if (!(ALL_CONCEPTS as readonly string[]).includes(concept)) return [];
    const kind = NON_NUMERIC_CONCEPTS.has(concept) ? 'CATEGORICAL' as const : 'NUMERIC' as const;
    return [{
      sourceField,
      concept: concept as ApprovedMapping['fields'][number]['concept'],
      required: e['required'] === true,
      kind,
      ...(kind === 'NUMERIC' ? { nonNegative: true } : {}),
    }];
  });
  if (fields.length === 0) return null;
  return {
    mappingVersion: `upload-${String(Date.now().toString(36))}`,
    identityField,
    identitySystem: 'UPLOAD',
    periodField,
    fields,
  };
}

/** The identity hub the demo registry was built with. */
async function knowledgeDemoIdentity() {
  const { identityHub } = await import('../scripts/fixtures/enterprise.js');
  return identityHub();
}

export const RUNTIME_STATE: string =
  'Task-shaped BFF over node:http with no dependencies. Transport only: no authorization decision, '
  + 'no metric, no DTO invented here (ADR-0006 §2, ADR-0032).';
