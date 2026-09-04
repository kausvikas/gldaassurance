/**
 * `askWithPlan` — the Phase 13 orchestration (ADR-0034).
 *
 * The ordering below is the security property, and it is the Phase 11 sequence with planning and
 * validation inserted where intent resolution used to be:
 *
 * ```
 *  1 authenticate   2 rate limit    3 capability     4 PLAN            <- NO DATA READ YET
 *  5 VALIDATE PLAN  6 ABAC scope    7 object check   8 execute plan
 *  9 field shape   10 build claims 11 narrate       12 ground-validate
 * 13 answerability 14 audit        15 respond
 * ```
 *
 * Steps 6 and 7 complete before step 11 begins and **step 11 has no channel back to them**. A fully
 * successful prompt injection therefore cannot widen retrieval: a model can be persuaded to propose
 * any plan, and there is no plan that re-runs scope resolution. The most powerful thing a compromised
 * model can do here is request a read the caller was already entitled to.
 *
 * ## Where the model is, and is not
 *
 * It is consulted at step 4 only when the deterministic planner is unsure, and its proposal is
 * parsed into the same typed structure and put through the same validator (step 5). It is consulted
 * at step 11 to phrase an answer whose facts are already fixed. It is nowhere else. Switch it off
 * and every step still runs; the prose becomes the deterministic composer's and the response says so.
 */
import type {
  AssistantResponse, AuthorisedToolPort, Citation, IntentId, KnowledgePort, MaterialClaim,
  NarrationPort, QueryPlan, Refusal, RefusalReason,
} from '@contexts/ai-intelligence';
import { describeScope } from '@contexts/ai-intelligence';
import type { Instant } from '@platform/time';
import type { RequestContext } from '../authorization/enforcement.js';
import { AuthorizationDenied, EnforcementPoint } from '../authorization/enforcement.js';
import { ASSISTANT_DECLARATION } from './service.js';
import { alternatives, deriveCaveats } from './intent.js';
import {
  authorityOf, claimsForShape, composeShape, missingEvidence, missingRequiredForShape, whyShape,
  worstStatus,
} from './compose.js';
import { NEUTRALISED, containsMarkup, neutraliseRetrievedText, validate } from './validator.js';
import { POC_CALIBRATION } from './envelope.js';
import { executePlan } from './executor.js';
import type { PlannerVocabulary } from './planner.js';
import { planQuestion } from './planner.js';
import { validatePlan } from './plan-validator.js';
import type { PlanRejection } from './plan-validator.js';
import type { ConversationState } from './conversation.js';
import { NEW_CONVERSATION, advance, refine } from './conversation.js';
import type { AnswerabilityVerdict, EvidenceProfile } from './answerability.js';
import { UNSUPPORTED_STATEMENTS, classify, profile } from './answerability.js';

const GENERIC_DECLINE =
  'Not found. There is nothing to show for that request in your authorised scope.';

export interface PlannedAskOptions {
  readonly ctx: RequestContext;
  readonly tools: AuthorisedToolPort;
  readonly asOf: Instant;
  readonly scopeLabel: string;
  readonly populationCount: number;
  readonly vocabulary: PlannerVocabulary;
  readonly knownMetricIds: readonly string[];
  readonly state?: ConversationState;
  readonly narration?: NarrationPort;
  readonly enforcement?: EnforcementPoint;
  readonly knowledge?: KnowledgePort;
}

/**
 * Everything one turn produced.
 *
 * The plan, the rejections and the answerability verdict travel alongside the response because they
 * are **disclosure**, not diagnostics: an executive is entitled to see how their question was
 * interpreted, and a filter this product failed to understand must be visible as an absence rather
 * than hidden behind a confident number (ADR-0034 §7).
 */
export interface PlannedAnswer {
  readonly response: AssistantResponse;
  readonly plan: QueryPlan | null;
  readonly scopeLine: string;
  readonly rejections: readonly PlanRejection[];
  readonly answerability: AnswerabilityVerdict;
  readonly evidence: EvidenceProfile | null;
  readonly state: ConversationState;
  readonly recognised: readonly string[];
}

export async function askWithPlan(
  question: string, opts: PlannedAskOptions,
): Promise<PlannedAnswer> {
  const state = opts.state ?? NEW_CONVERSATION;
  const enforcement = opts.enforcement ?? new EnforcementPoint();

  // Steps 1-3. Session, rate limit and the assistant capability, before anything is planned.
  try {
    await enforcement.authorise(opts.ctx, {
      declaration: ASSISTANT_DECLARATION,
      entityType: 'assistant',
    });
  } catch (e) {
    if (e instanceof AuthorizationDenied) {
      return decline(question, opts, state, null,
        refusal('UNAUTHORIZED', GENERIC_DECLINE), 'NOT_ANSWERABLE');
    }
    throw e;
  }

  // Step 4. Planning. Deterministic, over governed vocabulary, before any data is read.
  const planned = planQuestion(question, opts.vocabulary);
  if (planned.plan === null) {
    const reason = planned.declineReason ?? 'OUT_OF_DOMAIN';
    const [code, statement] = reason === 'MUTATION_REQUEST'
      ? ['ADVISORY_ONLY_RESTRICTION' as RefusalReason, UNSUPPORTED_STATEMENTS['MUTATION']]
      : reason === 'PROBABILITY_REQUEST'
        ? ['UNSUPPORTED_QUESTION' as RefusalReason, UNSUPPORTED_STATEMENTS['PROBABILITY']]
        : reason === 'PROJECT_NOT_NAMED'
          ? ['INSUFFICIENT_EVIDENCE' as RefusalReason,
            'That question is about one project, and no project was named. Name a project and ask again.']
          : ['UNSUPPORTED_QUESTION' as RefusalReason, UNSUPPORTED_STATEMENTS['OUT_OF_DOMAIN']];
    return decline(question, opts, state, null,
      refusal(code, statement ?? UNSUPPORTED_STATEMENTS['OUT_OF_DOMAIN'] ?? ''),
      reason === 'PROJECT_NOT_NAMED' ? 'NOT_ANSWERABLE' : 'UNSUPPORTED', planned.recognised);
  }

  const backReference = planned.isRefinement && state.population.length > 0;
  const candidate = refine(state, planned.plan, planned.isRefinement, backReference);

  // Step 5. Validation. Unconditional, and before any tool runs.
  const verdict = validatePlan(candidate, {
    vocabulary: opts.vocabulary,
    authorisedProjectIds: opts.tools.authorisedProjectIds,
    knownMetricIds: opts.knownMetricIds,
  });
  if (!verdict.ok) {
    const authorisationRejection = verdict.rejections.some(
      (r) => r.code === 'PROJECT_NOT_AUTHORISED' || r.code === 'SCOPE_EXCEEDS_CALLER',
    );
    return decline(question, opts, state, candidate, refusal(
      authorisationRejection ? 'UNAUTHORIZED' : 'UNSUPPORTED_QUESTION',
      authorisationRejection
        ? GENERIC_DECLINE
        : `That question could not be resolved into something this product can answer: `
          + `${verdict.rejections.map((r) => r.detail).join(' ')}`,
    ), 'NOT_ANSWERABLE', planned.recognised, verdict.rejections);
  }
  const plan = verdict.plan;

  // Steps 6-10. Retrieval through the gateway, then claims from what came back shaped.
  const execution = await executePlan(plan, opts.tools);
  if (execution.denied) {
    return decline(question, opts, state, plan, refusal('UNAUTHORIZED', GENERIC_DECLINE),
      'NOT_ANSWERABLE', planned.recognised);
  }

  /*
   * Neutralise claim text once, at this seam, before anything reads it.
   *
   * Claim text is assembled from application DTO fields and, for evidence claims, from document
   * text a stranger wrote. The grounding validator licenses a numeral if it appears in claim text —
   * correct when claim text is server-composed, and wrong the moment a stored payload rides along: a
   * poisoned claim was once found licensing its own injected figure. Neutralising here means
   * composition, licensing and validation all see the same neutralised text, so a payload cannot
   * license itself.
   */
  const claims = claimsForShape(plan.shape, execution.claims)
    .map((c) => ({ ...c, text: neutraliseRetrievedText(c.text) }))
    .filter((c) => c.text.trim() !== NEUTRALISED);

  if (claims.length === 0) {
    return decline(question, opts, state, plan, refusal(
      'METRIC_NOT_COMPUTABLE',
      'The metrics behind that question could not be computed for this scope. That is a stated '
      + 'absence, not a zero.',
    ), 'NOT_ANSWERABLE', planned.recognised);
  }

  const ungrounded = claims.filter((c) => c.groundedBy.length === 0);
  if (ungrounded.length > 0) {
    return decline(question, opts, state, plan, refusal(
      'INSUFFICIENT_EVIDENCE',
      'An answer was assembled but at least one claim carried no evidence, so it was not returned.',
    ), 'NOT_ANSWERABLE', planned.recognised);
  }

  const omitted = missingRequiredForShape(plan.shape, claims);
  if (omitted.length > 0) {
    return decline(question, opts, state, plan, refusal(
      'INSUFFICIENT_EVIDENCE',
      'A complete answer to that question requires governed findings this scope could not produce '
      + `(${omitted.join(', ')}), so a partial answer was withheld rather than presented as whole.`,
    ), 'NOT_ANSWERABLE', planned.recognised);
  }

  const caveats = deriveCaveats(claims);

  // Step 11. Narration. The deterministic composer is the floor and always runs first.
  const deterministic = composeShape(plan.shape, claims);
  let prose = deterministic;
  let composer: AssistantResponse['composer'] = 'DETERMINISTIC_COMPOSER';
  if (opts.narration !== undefined) {
    const intentForNarration = narrationIntent(plan);
    const narrated = await opts.narration.narrate({ intent: intentForNarration, claims, caveats });
    if (narrated.trim() !== '') {
      // Step 12 applied to the narration. On failure the prose is DISCARDED, not repaired, and
      // there is no retry: a regeneration loop turns a validator into a formatting hint.
      const narrationVerdict = validate({
        prose: narrated, claims, authorisedProjectIds: opts.tools.authorisedProjectIds,
      });
      if (narrationVerdict.ok && !containsMarkup(narrated)) {
        prose = narrated;
        composer = opts.narration.kind;
      }
    }
  }

  // Step 12. The validator runs on whatever is about to ship, template included. No bypass.
  const groundingVerdict = validate({
    prose, claims, authorisedProjectIds: opts.tools.authorisedProjectIds,
  });
  const leaked = groundingVerdict.findings.some(
    (f) => f.detection === 'D3_UNSUPPORTED_ENTITY' || f.detection === 'D10_UNAUTHORIZED_OBJECT',
  );
  if (leaked) {
    return decline(question, opts, state, plan, refusal('UNAUTHORIZED', GENERIC_DECLINE),
      'NOT_ANSWERABLE', planned.recognised);
  }
  if (!groundingVerdict.ok) {
    // The template failed its own validator, which is a composition defect rather than a model one.
    // Withholding is still correct: an answer that cannot be licensed by its claims is not an answer.
    return decline(question, opts, state, plan, refusal(
      'INSUFFICIENT_EVIDENCE',
      'An answer was composed but did not pass grounding validation, so it was withheld. '
      + 'The underlying figures are available on the project surfaces.',
    ), 'NOT_ANSWERABLE', planned.recognised);
  }

  // Step 13. Answerability, from the evidence rather than from the prose.
  const answerability = classify(plan, claims, false);

  const response: AssistantResponse = {
    question,
    intent: narrationIntent(plan),
    scope: {
      authorisedProjectCount: opts.tools.authorisedProjectIds.length,
      populationCount: opts.populationCount,
      scopeLabel: opts.scopeLabel,
    },
    asOf: opts.asOf,
    answer: answerability.statement === '' ? prose : `${prose} ${answerability.statement}`,
    why: whyShape(plan.shape, claims),
    materialClaims: claims,
    evidence: citationsOf(claims),
    metricRefs: metricRefsOf(claims),
    caveats,
    missingEvidence: missingEvidence(claims),
    calibrationStatus: POC_CALIBRATION,
    assessmentStatus: worstStatus(claims),
    executiveAuthority: authorityOf(claims, caveats, groundingVerdict.ok),
    suggestedFollowUps: alternatives(plan.projectId),
    composer,
    syntheticData: true,
  };

  return {
    response,
    plan,
    scopeLine: describeScope(plan),
    rejections: [],
    answerability,
    evidence: profile(claims),
    state: advance(state, question, plan, execution.population),
    recognised: planned.recognised,
  };
}

/**
 * The intent a plan narrates as.
 *
 * `NarrationPort` is keyed on `IntentId`, which is the Phase 11 vocabulary. Rather than widen that
 * port — which would have made every narration implementation aware of plan shapes — a shape maps to
 * the closest governed intent purely to select an instruction. Nothing about the answer's content
 * depends on this choice; it selects emphasis for a rewriting task whose facts are already fixed.
 */
function narrationIntent(plan: QueryPlan): IntentId {
  switch (plan.shape) {
    case 'population.rank': case 'population.list': case 'population.concentration':
      return 'portfolio.ranking';
    case 'population.compare': case 'project.compare': return 'portfolio.comparison';
    case 'population.reportedGreenRisk': return 'portfolio.reportedGreenRisk';
    case 'population.emergingRisk': return 'portfolio.systemEmergingRisk';
    case 'population.recovering': case 'project.recovery': return 'project.recovery';
    case 'population.aggregate': case 'project.margin': return 'project.marginDrivers';
    case 'population.change': return 'project.marginDrivers';
    case 'project.health': return 'project.healthExplanation';
    case 'project.burn': return 'project.burnProgress';
    case 'project.scope': return 'project.scopeLeakage';
    case 'project.confidence': case 'source.dataQuality': return 'project.confidence';
    case 'project.forwardRisk': case 'project.milestones': return 'project.forwardRisk';
    case 'metric.definition': return 'metric.definition';
    default: return 'evidence.lookup';
  }
}

function refusal(reason: RefusalReason, message: string): Refusal {
  return { reason, message, insteadTry: alternatives(null) };
}

function decline(
  question: string,
  opts: PlannedAskOptions,
  state: ConversationState,
  plan: QueryPlan | null,
  r: Refusal,
  classification: AnswerabilityVerdict['classification'],
  recognised: readonly string[] = [],
  rejections: readonly PlanRejection[] = [],
): PlannedAnswer {
  return {
    response: {
      question,
      intent: null,
      scope: {
        authorisedProjectCount: opts.tools.authorisedProjectIds.length,
        populationCount: opts.populationCount,
        scopeLabel: opts.scopeLabel,
      },
      asOf: opts.asOf,
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
    },
    plan,
    scopeLine: plan === null ? '' : describeScope(plan),
    rejections,
    answerability: { classification, statement: r.message, gaps: [] },
    evidence: null,
    // A declined turn does not become the conversation's new state. Otherwise a rejected question
    // would silently reset the population a follow-up refers to, and the next "which of those"
    // would answer about a different set than the reader is looking at.
    state,
    recognised,
  };
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

function metricRefsOf(
  claims: readonly MaterialClaim[],
): readonly { metricId: string; version: string }[] {
  const seen = new Map<string, string>();
  for (const c of claims) {
    if (c.envelope.metricId === null) continue;
    seen.set(c.envelope.metricId, c.envelope.version);
  }
  return [...seen].map(([metricId, version]) => ({ metricId, version }));
}

export const ORCHESTRATOR_STATE: string =
  'Plan before data, validate before execution, ground before rendering, and one execution path '
  + 'shared with the Phase 11 entry point (ADR-0034).';
