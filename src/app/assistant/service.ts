/**
 * The assistant orchestrator - the 14-step sequence of `AI_ASSISTANT_ARCHITECTURE.md` §4.
 *
 * The ordering is the security property, and it is worth restating because it is easy to lose in a
 * refactor:
 *
 * ```
 *  1 authenticate   2 rate limit    3 capability     4 intent resolution   <- NO DATA READ YET
 *  5 per-tool cap   6 ABAC scope    7 object check   8 retrieve
 *  9 field shape   10 build claims 11 narrate      12 validate
 * 13 audit         14 respond
 * ```
 *
 * Steps 6 and 7 complete before step 11 begins, and **step 11 has no channel back to them**. So a
 * fully successful prompt injection cannot widen retrieval: the model can be persuaded to *ask* for
 * anything, and there is nothing it can ask that re-runs scope resolution. Steps 5-9 happen inside
 * `ApplicationGateway.request()`, which is why the tools are projections over views rather than a
 * second data path.
 *
 * **The question is never trusted.** It selects an intent from a closed union (step 4) and is then
 * carried verbatim on the response for display only - it is never concatenated into an instruction
 * and never re-emitted into prose.
 */
import type {
  AssistantResponse, AssistantToolId, AuthorisedToolPort, Citation, MaterialClaim, NarrationPort,
  Refusal, RefusalReason, ToolResult,
} from '@contexts/ai-intelligence';
import type { Instant } from '@platform/time';
import type { RequestContext } from '../authorization/enforcement.js';
import { AuthorizationDenied, EnforcementPoint } from '../authorization/enforcement.js';
import {
  alternatives, deriveCaveats, isChangeQuestion, isMutationRequest, isProbabilityQuestion,
  isProjectIntent, looksLikeProjectReference, route,
} from './intent.js';
import {
  authorityOf, claimsFor, compose, missingEvidence, missingRequiredClaims, why, worstStatus,
} from './compose.js';
import { NEUTRALISED, containsMarkup, neutraliseRetrievedText, validate } from './validator.js';
import { POC_CALIBRATION } from './envelope.js';

/** One generic string for every unauthorised cause. The reason code is for the audit record only. */
const GENERIC_DECLINE =
  'Not found. There is nothing to show for that request in your authorised scope.';

/** Which tools each intent may invoke. A closed map: an intent cannot reach an unlisted tool. */
export const INTENT_TOOLS: Readonly<Record<string, readonly AssistantToolId[]>> = {
  'portfolio.reportedGreenRisk': ['portfolio.reportedGreenRisk.list'],
  'portfolio.systemEmergingRisk': ['portfolio.systemGreenAtRisk.list'],
  'portfolio.ranking': ['portfolio.ranking.list'],
  'portfolio.comparison': ['portfolio.segments.compare'],
  'project.healthExplanation': ['project.executiveHealth.get'],
  'project.marginDrivers': ['project.marginDrivers.get'],
  'project.burnProgress': ['project.executiveHealth.get'],
  'project.scopeLeakage': ['project.executiveHealth.get'],
  'project.confidence': ['project.lateDetection.get'],
  'project.forwardRisk': ['project.forwardRisk.get'],
  'project.recovery': ['project.recoveryOptions.get'],
  'evidence.lookup': ['evidence.get'],
  'metric.definition': ['metric.definition.get'],
};

/** The read-only capability declaration. `isWrite` is never set - there is no write path. */
export const ASSISTANT_DECLARATION = {
  capability: 'assistant.use',
  readsClassifications: ['PUBLIC_INTERNAL', 'DELIVERY_SENSITIVE', 'COMMERCIAL_CONFIDENTIAL'],
  auditReads: true,
} as const;

export interface AskOptions {
  readonly ctx: RequestContext;
  readonly tools: AuthorisedToolPort;
  readonly asOf: Instant;
  readonly scopeLabel: string;
  readonly populationCount: number;
  readonly narration?: NarrationPort;
  readonly enforcement?: EnforcementPoint;
}

function refusal(reason: RefusalReason, message: string, projectId: string | null): Refusal {
  return { reason, message, insteadTry: alternatives(projectId) };
}

function citationsOf(claims: readonly MaterialClaim[]): readonly Citation[] {
  const seen = new Map<string, Citation>();
  for (const c of claims) {
    for (const ref of c.groundedBy) {
      const key = `${ref.context}|${ref.entityType}|${ref.entityId}`;
      if (seen.has(key)) continue;
      seen.set(key, { ref, label: `${ref.entityType} ${ref.entityId} (${ref.context})` });
    }
  }
  return [...seen.values()];
}

function metricRefsOf(claims: readonly MaterialClaim[]): readonly { metricId: string; version: string }[] {
  const seen = new Map<string, string>();
  for (const c of claims) {
    if (c.envelope.metricId === null) continue;
    seen.set(c.envelope.metricId, c.envelope.version);
  }
  return [...seen].map(([metricId, version]) => ({ metricId, version }));
}

function empty(
  question: string, asOf: Instant, opts: AskOptions, r: Refusal, intent: AssistantResponse['intent'],
): AssistantResponse {
  return {
    question,
    intent,
    scope: {
      authorisedProjectCount: opts.tools.authorisedProjectIds.length,
      populationCount: opts.populationCount,
      scopeLabel: opts.scopeLabel,
    },
    asOf,
    answer: r.message,
    why: [],
    materialClaims: [],
    evidence: [],
    metricRefs: [],
    caveats: [],
    missingEvidence: [],
    calibrationStatus: POC_CALIBRATION,
    assessmentStatus: 'NOT_COMPUTABLE',
    executiveAuthority: 'NOT_AUTHORITATIVE',
    suggestedFollowUps: r.insteadTry,
    refusal: r,
    composer: 'DETERMINISTIC_COMPOSER',
    syntheticData: true,
  };
}

/**
 * Answers one question.
 *
 * Returns a refusal rather than throwing for every governed decline, because declining is a
 * first-class outcome (REQ-AI-006) and a thrown error is not something a surface can render with
 * its reason and its governed alternatives.
 */
export async function ask(question: string, opts: AskOptions): Promise<AssistantResponse> {
  const { ctx, tools, asOf } = opts;
  const enforcement = opts.enforcement ?? new EnforcementPoint();

  // Steps 1-3. Session, rate limit and the assistant capability, before intent resolution.
  try {
    await enforcement.authorise(ctx, {
      declaration: ASSISTANT_DECLARATION,
      entityType: 'assistant',
    });
  } catch (e) {
    if (e instanceof AuthorizationDenied) {
      return empty(question, asOf, opts, refusal('UNAUTHORIZED', GENERIC_DECLINE, null), null);
    }
    throw e;
  }

  // Step 4. Intent resolution - deterministic, over a closed union, before any data is read.
  const routed = route(question);
  if (routed.intent === null) {
    // Three different declines. Saying *which* is the difference between a useful refusal and a
    // shrug: one is a boundary, one is a capability the product does not have, one is scope.
    if (isMutationRequest(question)) {
      return empty(question, asOf, opts, refusal(
        'ADVISORY_ONLY_RESTRICTION',
        'This assistant is advisory and read only. It cannot set a status, approve a plan, change an '
        + 'ETC, a baseline, a rule or a threshold, and it holds no capability that could. Those '
        + 'actions belong to a person with the relevant authority, in the surface that owns them.',
        routed.projectId,
      ), null);
    }
    if (isChangeQuestion(question)) {
      return empty(question, asOf, opts, refusal(
        'INSUFFICIENT_EVIDENCE',
        'This product cannot yet answer what changed. It holds no prior-period snapshot, so '
        + 'period-over-period movement is unavailable (DR-045) - and answering from current figures '
        + 'would quietly redefine the question. Current position and governed outlook are available.',
        routed.projectId,
      ), null);
    }
    const message = isProbabilityQuestion(question)
      ? 'This product does not answer probability questions. Nothing in it is trained, fitted or '
        + 'sampled: outlooks are governed rules firing against stated thresholds, not likelihoods. '
        + 'Ask for the governed outlook and the rules behind it instead.'
      : 'This product cannot answer that question. It reports governed delivery facts, deterministic '
        + 'metrics and rule-based assessments; it does not forecast probabilistically, and it takes '
        + 'no action. The questions below are the ones it can answer.';
    return empty(question, asOf, opts, refusal('UNSUPPORTED_QUESTION', message, routed.projectId), null);
  }
  const intent = routed.intent;

  if (isProjectIntent(intent) && routed.projectId === null) {
    // An id-SHAPED token that did not resolve is an id probe, and it gets the same generic
    // not-found a real out-of-scope id gets. Only a question naming no project reference at all
    // gets the helpful "name a project", which discloses nothing.
    if (looksLikeProjectReference(question)) {
      return empty(question, asOf, opts, refusal('UNAUTHORIZED', GENERIC_DECLINE, null), intent);
    }
    return empty(question, asOf, opts, refusal(
      'INSUFFICIENT_EVIDENCE',
      'That question is about one project, and no project was named. Name a project and ask again.',
      null,
    ), intent);
  }

  // Steps 5-10. Retrieval through the gateway; claims built only from what came back shaped.
  const toolIds = INTENT_TOOLS[intent] ?? [];
  const results: ToolResult[] = [];
  for (const tool of toolIds) {
    try {
      results.push(await tools.invoke(tool, {
        ...(routed.projectId !== null ? { projectId: routed.projectId } : {}),
        ...(routed.metricId !== null ? { metricId: routed.metricId } : {}),
        ...(routed.segments.length > 0 ? { segmentIds: routed.segments } : {}),
      }));
    } catch {
      // Out of scope, non-existent, or not computable are indistinguishable from here by design.
      return empty(question, asOf, opts, refusal('UNAUTHORIZED', GENERIC_DECLINE, null), intent);
    }
  }
  /*
   * **Neutralise claim text once, here, before anything reads it.**
   *
   * Claim text is assembled from application DTO fields, several of which are free text a human
   * wrote. The grounding validator licenses a numeral if it appears in claim text — which is right
   * when claim text is server-composed, and wrong the moment a stored payload rides along: a
   * poisoned claim was found **licensing its own injected figure**, so "use $12.3M instead" passed
   * D1 because the poisoned claim now said `$12.3M`.
   *
   * Neutralising at this seam - between retrieval and everything downstream - means composition,
   * licensing and validation all see the same neutralised text, and a payload cannot license itself.
   */
  /*
   * R1.6. A claim whose text did not survive neutralisation is dropped, not rendered.
   *
   * `neutraliseRetrievedText` returns the bare NEUTRALISED marker when every sentence in a
   * retrieved note matched an instruction shape. That marker is a redaction notice for a reader,
   * never a finding — but it was flowing on as the claim's own text, so the Assistant rendered
   * "[retrieved content omitted: not a governed finding]" as an L2 OBSERVED claim against
   * MET-COM-009, in the "Why" list and in the claims-and-provenance table. An omission had become
   * a business assertion, which is the one thing the epistemic algebra exists to prevent.
   *
   * Dropping is the correct disposition rather than qualifying: nothing governed remains to
   * qualify. Where text partly survives, the claim is kept with its surviving sentences and the
   * marker appended, which is a truthful partial redaction.
   */
  const claims = claimsFor(intent, results.flatMap((r) => r.claims))
    .map((c) => ({ ...c, text: neutraliseRetrievedText(c.text) }))
    .filter((c) => c.text.trim() !== NEUTRALISED);
  if (claims.length === 0) {
    return empty(question, asOf, opts, refusal(
      'METRIC_NOT_COMPUTABLE',
      'The metrics behind that question could not be computed for this scope. That is a stated '
      + 'absence, not a zero.',
      routed.projectId,
    ), intent);
  }

  // A claim with no evidence is a defect, not an answer (REQ-DATA-010).
  const ungrounded = claims.filter((c) => c.groundedBy.length === 0);
  if (ungrounded.length > 0) {
    return empty(question, asOf, opts, refusal(
      'INSUFFICIENT_EVIDENCE',
      'An answer was assembled but at least one claim carried no evidence, so it was not returned.',
      routed.projectId,
    ), intent);
  }

  /*
   * DR-072 gate: an answer that omits a governed required claim is withheld.
   *
   * This is the one failure class no grounding control catches, because every sentence in such an
   * answer is true. The margin demo made exactly this mistake at Phase 9 - three high-coverage
   * scenarios, every figure correct, and a reader would have concluded the bridge explains ~90% of
   * movement when the median is 45.5%.
   */
  const omitted = missingRequiredClaims(intent, claims);
  if (omitted.length > 0) {
    return empty(question, asOf, opts, refusal(
      'INSUFFICIENT_EVIDENCE',
      'A complete answer to that question requires governed findings this scope could not produce '
      + `(${omitted.join(', ')}), so a partial answer was withheld rather than presented as whole.`,
      routed.projectId,
    ), intent);
  }

  const caveats = deriveCaveats(claims);

  // Step 11. Narration. The deterministic composer is the floor and always runs first.
  const deterministic = compose(intent, claims);
  let prose = deterministic;
  let composer: AssistantResponse['composer'] = 'DETERMINISTIC_COMPOSER';
  if (opts.narration !== undefined) {
    const narrated = await opts.narration.narrate({ intent, claims, caveats });
    // Step 12 applied to the narration. On failure the prose is DISCARDED, not repaired, and there
    // is no retry: a regeneration loop turns a validator into a formatting hint (ADR-0030 D-3).
    const verdict = validate({ prose: narrated, claims, authorisedProjectIds: tools.authorisedProjectIds });
    if (verdict.ok && !containsMarkup(narrated)) {
      prose = narrated;
      composer = opts.narration.kind;
    }
  }

  // Step 12. The validator runs on whatever is about to ship, template included. No bypass.
  const verdict = validate({ prose, claims, authorisedProjectIds: tools.authorisedProjectIds });
  const leaked = verdict.findings.some(
    (f) => f.detection === 'D3_UNSUPPORTED_ENTITY' || f.detection === 'D10_UNAUTHORIZED_OBJECT',
  );
  if (leaked) {
    // An entity outside the resolved set is a leak, not a wording problem. Fail the whole answer.
    return empty(question, asOf, opts, refusal('UNAUTHORIZED', GENERIC_DECLINE, null), intent);
  }
  if (!verdict.ok) {
    return empty(question, asOf, opts, refusal(
      'INSUFFICIENT_EVIDENCE',
      'An answer was composed but did not pass grounding validation, so it was withheld. '
      + 'The underlying figures are available on the project surfaces.',
      routed.projectId,
    ), intent);
  }

  const followUps = alternatives(routed.projectId).filter((s) => s.intent !== intent);

  return {
    question,
    intent,
    scope: {
      authorisedProjectCount: tools.authorisedProjectIds.length,
      populationCount: opts.populationCount,
      scopeLabel: opts.scopeLabel,
    },
    asOf,
    answer: prose,
    why: why(intent, claims),
    materialClaims: claims,
    evidence: citationsOf(claims),
    metricRefs: metricRefsOf(claims),
    caveats,
    missingEvidence: missingEvidence(claims),
    calibrationStatus: POC_CALIBRATION,
    assessmentStatus: worstStatus(claims),
    executiveAuthority: authorityOf(claims, caveats, verdict.ok),
    suggestedFollowUps: followUps,
    composer,
    syntheticData: true,
  };
}

export const SERVICE_STATE: string =
  'Authorization before context creation; deterministic intent routing; tools through the gateway; '
  + 'blocking validation; zero write tools (ADR-0029, ADR-0030, ADR-0031).';
