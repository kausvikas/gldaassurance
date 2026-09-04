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
 * It is consulted at step 4 only when the grammar could not resolve the question **and** the
 * question was not one the product deliberately declines; its proposal is parsed into the same typed
 * structure and put through the same validator (step 5), and the plan records `MODEL_PROPOSED` so a
 * reader can see which it was. It is consulted at step 11 to phrase an answer whose facts are
 * already fixed. It is nowhere else. Switch it off and every step still runs; the prose becomes the
 * deterministic composer's and the response says so.
 *
 * Both consultations are optional ports supplied by the composition root, so a deployment with no
 * provider has no planner and no narrator object in scope at all — the constraint is enforced by
 * what exists rather than by a flag somebody has to check.
 */
import type {
  AssistantResponse, AuthorisedToolPort, Citation, IntentId, KnowledgePort, MaterialClaim,
  NarrationPort, QueryPlan, Refusal, RefusalReason,
} from '@contexts/ai-intelligence';
import { describeScope, emptyPlan } from '@contexts/ai-intelligence';
import type { Instant } from '@platform/time';
import type { RequestContext } from '../authorization/enforcement.js';
import { AuthorizationDenied, EnforcementPoint } from '../authorization/enforcement.js';
import { ASSISTANT_DECLARATION } from './service.js';
import { auditAssistantQuery } from './port.js';
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
import { readProposedPlan, validatePlan } from './plan-validator.js';
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
  /**
   * The model-assisted planner, consulted **only** when the grammar could not resolve the question.
   *
   * Optional, and absent in most compositions: a deployment with no provider has no planner object
   * in scope at all, which is the same "enforced by what exists" pattern the external-AI fallback
   * uses. What it returns is raw text, not a plan — parsing it into the typed structure and putting
   * that structure through `validatePlan` happens here, on the trusted side, so a provider
   * implementation cannot hand back something that skips either step.
   */
  readonly planning?: PlanningPort;
  readonly enforcement?: EnforcementPoint;
  readonly knowledge?: KnowledgePort;
  /**
   * Where this turn's lineage is written, and what to record about the caller.
   *
   * Optional so that a unit test asking one question does not need an audit store — but absent means
   * **no record is written**, and a composition that answers real questions without supplying this
   * is a composition with no lineage. `server/main.ts` supplies it; the static build script supplies
   * it; nothing else answers a real caller.
   */
  readonly auditAs?: {
    readonly persona: string;
    /**
     * Real elapsed time, injected.
     *
     * The orchestrator has an as-of clock and must not acquire an ambient one — but an audit trail
     * stamped with a frozen as-of date is a trail in which nothing has an order.
     */
    readonly recordedAt?: () => Instant;
    /** The routing decision, read at audit time so a refused or unused provider is recorded too. */
    readonly provider?: () => {
      readonly providerId: string | null;
      readonly model: string | null;
      readonly outcome: string | null;
      readonly policy: string | null;
    };
    readonly durable?: { append(record: Readonly<Record<string, unknown>>): Promise<void> };
  };
}

/**
 * A model asked to propose a plan.
 *
 * Returns the model's raw text, or `null` when no provider ran — never a `QueryPlan`. Typing it as
 * text is the point: a port that returned a plan would be a port that could return a *valid-looking*
 * plan, and the boundary between "the model proposed" and "the product accepted" would sit inside
 * whatever implemented this interface rather than in `validatePlan` where it can be read.
 */
export interface PlanningPort {
  propose(question: string): Promise<string | null>;
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

/**
 * Step 14, on **every** exit — including every refusal.
 *
 * `askWithPlan` is a wrapper for exactly this reason. The audit call used to be documented as step 14
 * and written nowhere: `auditAssistantQuery` existed, was correct, and its only caller in the whole
 * repository was the static build script — so the deployed Assistant answered questions and recorded
 * nothing. Sprinkling a call before each of the nine `return decline(...)` statements would have
 * fixed today's version and lost the tenth. One seam, past which nothing returns unaudited, is the
 * only arrangement that stays true.
 *
 * The audit is awaited, and a failure propagates. `SECURITY_MODEL.md` §5.3 is explicit that a failure
 * to audit fails the operation, and an answer delivered without its lineage is precisely the thing
 * this phase was reopened to close.
 */
export async function askWithPlan(
  question: string, opts: PlannedAskOptions,
): Promise<PlannedAnswer> {
  const outcome = await resolveAsk(question, opts);
  if (opts.auditAs !== undefined) {
    await auditAssistantQuery(opts.ctx, {
      question,
      response: outcome.answer.response,
      trace: [...(opts.tools.trace ?? [])].map((t) => ({
        tool: t.tool as never, decision: t.decision as never, objects: t.objects,
      })),
      composer: outcome.answer.response.composer,
      detections: outcome.detections,
      lineage: {
        persona: opts.auditAs.persona,
        ...(opts.auditAs.recordedAt === undefined
          ? {} : { recordedAt: opts.auditAs.recordedAt() }),
        plan: outcome.answer.plan as unknown as Readonly<Record<string, unknown>> | null,
        planOrigin: outcome.answer.plan?.origin ?? null,
        planValidation: outcome.planValidation,
        planRejections: outcome.answer.rejections.map((r) => r.code),
        sourceVersions: outcome.sourceVersions,
        providerId: opts.auditAs.provider?.().providerId ?? null,
        providerModel: opts.auditAs.provider?.().model ?? null,
        providerOutcome: opts.auditAs.provider?.().outcome ?? null,
        externalAiPolicy: opts.auditAs.provider?.().policy ?? null,
        answerability: outcome.answer.answerability.classification,
      },
      ...(opts.auditAs.durable === undefined ? {} : { durable: opts.auditAs.durable }),
    });
  }
  return outcome.answer;
}

/**
 * One turn's result, plus the few facts the audit needs that the answer does not carry.
 *
 * Kept off `PlannedAnswer` deliberately: grounding detections and the plan-validation outcome are
 * *lineage*, not disclosure, and putting them on the response would eventually put them on a screen.
 */
interface AskOutcome {
  readonly answer: PlannedAnswer;
  readonly detections: readonly string[];
  readonly sourceVersions: readonly string[];
  readonly planValidation: 'ACCEPTED' | 'REJECTED' | 'NOT_REACHED';
}

async function resolveAsk(
  question: string, opts: PlannedAskOptions,
): Promise<AskOutcome> {
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
  const grammar = planQuestion(question, opts.vocabulary);
  const planned = await assistPlan(question, grammar, opts);
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
  const selected = claimsForShape(plan.shape, execution.claims);
  const claims = selected
    .map((c) => (c.composedFromGovernedValues === true
      ? c
      : { ...c, text: neutraliseRetrievedText(c.text) }))
    .filter((c) => c.text.trim() !== NEUTRALISED);

  /*
   * A claim removed by neutralisation is **reported**, not silently dropped — and not fatal either.
   *
   * Phase 11 decided that a fully-redacted claim is dropped rather than qualified, and that is
   * right: nothing governed remains in it to qualify. What was missing is that the reader was never
   * told. An aggregate shipped one figure short with every remaining sentence true, which is the
   * DR-072 failure class exactly.
   *
   * Withholding the whole answer was the first correction and it was too blunt: one supporting
   * sentence tripping a content rule would suppress an entire health explanation whose governed
   * findings were intact. So the claim goes, the answer stands, and the redaction is named — and if
   * what went was a *required* claim, `missingRequiredForShape` below withholds the answer anyway.
   */
  const redacted = selected.length - claims.length;

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
  const base = classify(plan, claims, false);
  const answerability: AnswerabilityVerdict = redacted === 0 ? base : {
    classification: base.classification === 'ANSWERABLE' ? 'PARTIALLY_ANSWERABLE' : base.classification,
    statement: base.statement === ''
      ? 'Part of the supporting evidence was withheld because its text matched a content-safety rule.'
      : base.statement,
    gaps: [
      ...base.gaps,
      `${String(redacted)} supporting finding${redacted === 1 ? '' : 's'} withheld: the stored text `
      + 'matched a rule for content that reads as an instruction rather than as evidence.',
    ],
  };

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
    answer: {
      response,
      plan,
      scopeLine: describeScope(plan),
      rejections: [],
      answerability,
      evidence: profile(claims),
      state: advance(state, question, plan, execution.population),
      recognised: planned.recognised,
    },
    detections: groundingVerdict.findings.map((f) => f.detection),
    /*
     * The document versions this answer actually stood on.
     *
     * Versions rather than document ids: a citation that named only the document would be worthless
     * six months later, when the document has been superseded twice and nobody can tell which text
     * the answer was true of.
     */
    sourceVersions: [...new Set(
      claims.flatMap((c) => c.groundedBy
        .filter((ref) => ref.context === 'knowledge')
        .map((ref) => ref.entityId)),
    )],
    planValidation: 'ACCEPTED',
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
/**
 * Asks the model for a plan, but only where the grammar has genuinely run out.
 *
 * Three conditions, all of them narrow on purpose:
 *
 *   - **Only `OUT_OF_DOMAIN`.** Every other decline is a *decision*: a probability question is
 *     refused because this product does not produce probabilities, and a mutation request because it
 *     is advisory. Handing those to a model would let it overturn a governed refusal, which is the
 *     one thing a proposal must never be able to do. `PROJECT_NOT_NAMED` is excluded for a duller
 *     reason: the model would guess a project, and a guessed project is a wrong answer that looks
 *     exactly like a right one.
 *   - **Only when a provider is configured.** With none, this returns the grammar's answer
 *     unchanged, so the common path stays model-free, reproducible and free.
 *   - **The proposal is parsed and validated like any other.** `readProposedPlan` drops every field
 *     that is not in the closed vocabulary, and the result goes to `validatePlan` at step 5 exactly
 *     as a deterministic plan does — it is not a separate, gentler path. The strongest thing a
 *     compromised model can achieve is a read the caller was already entitled to.
 */
async function assistPlan(
  question: string,
  grammar: ReturnType<typeof planQuestion>,
  opts: PlannedAskOptions,
): Promise<ReturnType<typeof planQuestion>> {
  if (grammar.plan !== null) return grammar;
  if (opts.planning === undefined) return grammar;
  if ((grammar.declineReason ?? 'OUT_OF_DOMAIN') !== 'OUT_OF_DOMAIN') return grammar;

  /*
   * A planner that fails is a planner that did not run, not a request that failed.
   *
   * The router already turns provider trouble into a decision rather than an exception, so this
   * catch is for the seam itself — a port implementation, a timeout, a bad deployment. The product's
   * position throughout is that an unavailable model degrades to the deterministic path and says so;
   * a 500 here would make the model load-bearing for questions it was only ever advising on.
   */
  let raw: string | null;
  try {
    raw = await opts.planning.propose(question);
  } catch {
    return grammar;
  }
  if (raw === null || raw.trim() === '') return grammar;

  /*
   * The base is the most-constrained plan available, not a permissive one.
   *
   * `readProposedPlan` overlays the model's fields onto this, so every field the model does not name
   * — or names wrongly — keeps the base's value. A base with a wide default limit or a project scope
   * would therefore be a set of permissions granted by omission.
   */
  const proposed = readProposedPlan(raw, emptyPlan('population.rank'));
  // `null` means the model produced nothing usable — which is information, not an error, and is
  // rendered as the same decline the grammar had already reached.
  if (proposed === null) return grammar;
  return { ...grammar, plan: proposed };
}

function narrationIntent(plan: QueryPlan): IntentId {
  switch (plan.shape) {
    case 'population.rank':
      return 'portfolio.ranking';
    /*
     * A list and a concentration are **not** priority orderings.
     *
     * Mapping them to the ranking intent told the model to "summarise where leadership attention
     * should go first", so a question asking what the as-sold margin was came back opening with
     * where to intervene. The facts were right and the framing answered a different question — which
     * a reader has no way to detect, because the sentence is fluent and true.
     */
    case 'population.list': case 'population.concentration':
      return 'portfolio.comparison';
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
  detections: readonly string[] = [],
): AskOutcome {
  const answer: PlannedAnswer = {
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
  return {
    answer,
    detections,
    sourceVersions: [],
    /*
     * A declined turn distinguishes "the validator rejected the plan" from "no plan was ever
     * reached". They look the same on screen and they are entirely different in an audit: one is the
     * product refusing something it understood, the other is the product not understanding.
     */
    planValidation: rejections.length > 0 ? 'REJECTED' : plan === null ? 'NOT_REACHED' : 'ACCEPTED',
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
