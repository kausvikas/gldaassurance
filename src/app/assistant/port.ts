/**
 * The authorised tool port, and the assistant audit record (REQ-AI-005).
 *
 * The port is constructed **after** scope resolution and closes over the caller's `RequestContext`
 * and gateway. Nothing the model does can reach around it: there is no setter for the context, no
 * way to pass a different one per call, and no method that returns a domain object.
 *
 * ## What the audit record does and does not carry
 *
 * `SECURITY_MODEL.md` §6a forbids telemetry becoming a second, unclassified copy of the data it
 * describes. An audit log containing every answer would be exactly that, so:
 *
 *   - **recorded:** actor, role, impersonator, time, intent, scope, tools invoked, objects accessed
 *     (ids only), allow/deny per tool, refusal reason, validator verdict and detection ids, composer
 *     kind, response status;
 *   - **not recorded:** the raw question beyond a length and a hash, the generated prose, the
 *     rejected prose, any figure, any `PERSONAL_DATA`.
 *
 * The question hash plus the tool trace reproduces the interaction. The prose would add disclosure
 * risk and no investigative value.
 *
 * The tool-level reads emit their own `READ` records through `EnforcementPoint`, joined by
 * `correlationId`. This record does not duplicate them.
 */
import type {
  AssistantResponse, AssistantToolId, AuthorisedToolPort, KnowledgePort, ToolArgs, ToolResult,
} from '@contexts/ai-intelligence';
import { emptyPlan } from '@contexts/ai-intelligence';
import type { Instant } from '@platform/time';
import type { RequestContext } from '../authorization/enforcement.js';
import type { ApplicationGateway } from '../gateway.js';
import { type ToolContext, ToolDenied, compare, greenAtRisk, ranking, summary } from './tools.js';
import {
  evidence, executiveHealth, forwardRisk, lateDetection, marginDrivers, metricDefinition,
  recoveryOptions,
} from './project-tools.js';
import {
  applyFilters, applySort, compareProjects, concentration, periodChange, populationAggregate,
  populationQuery, recovering,
} from './population-tools.js';
import {
  acceptanceEvidence, dataQuality, knowledgeEvidence, milestones, sourceProvenance,
} from './knowledge-tools.js';

/** A stable, non-reversible digest of the question. Enough to correlate, not enough to disclose. */
export function questionDigest(question: string): string {
  // FNV-1a, 32-bit. Not a security primitive - an audit correlation key that is not the text.
  let h = 0x811c9dc5;
  for (let i = 0; i < question.length; i += 1) {
    h ^= question.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `q:${h.toString(16).padStart(8, '0')}:${String(question.length)}`;
}

/**
 * The plan a tool was given, or a shape-only fallback.
 *
 * The fallback exists so a tool invoked without a plan — from a test, or from the Phase 11 path —
 * behaves as an unfiltered request for that shape rather than throwing. It cannot widen anything:
 * an empty plan carries no project id and no filters, and the enforcement point has already
 * resolved the caller's scope by the time any of this runs.
 */
function plan(args: ToolArgs, shape: Parameters<typeof emptyPlan>[0]): NonNullable<ToolArgs['plan']> {
  if (args.plan !== undefined) return args.plan;
  const base = emptyPlan(shape);
  return {
    ...base,
    ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
    ...(args.metricId !== undefined ? { metricId: args.metricId } : {}),
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  };
}

/**
 * A narrowing function built from the plan, or `undefined` when there is no plan to narrow by.
 *
 * Returning `undefined` rather than an identity function matters: the tools distinguish "no
 * narrowing was requested" from "narrowing was requested and matched everything", and only the
 * first is entitled to quote the portfolio-wide governed count.
 */
function narrowBy(args: ToolArgs): ((rows: readonly Record<string, unknown>[]) => readonly Record<string, unknown>[]) | undefined {
  const p = args.plan;
  if (p === undefined) return undefined;
  const hasNarrowing = p.filters.regions.length > 0 || p.filters.industries.length > 0
    || p.filters.accounts.length > 0 || p.filters.customers.length > 0
    || p.filters.deliveryGroups.length > 0 || p.filters.projectIds.length > 0
    || p.filters.drivers.length > 0 || p.filters.thresholds.length > 0
    || p.filters.trajectory.length > 0;
  if (!hasNarrowing) return undefined;
  return (rows) => applySort(applyFilters(rows, p), p);
}

export interface ToolInvocation {
  readonly tool: AssistantToolId;
  readonly decision: 'GRANT' | 'DENY';
  readonly objects: readonly string[];
}

/**
 * Binds the twelve tools to one caller.
 *
 * `authorisedProjectIds` is the set the enforcement point resolved, handed in by the composition
 * root. The validator uses it to reject any entity the prose names but retrieval never saw.
 */
export class GatewayToolPort implements AuthorisedToolPort {
  readonly #tc: ToolContext;
  readonly #trace: ToolInvocation[] = [];

  /**
   * The evidence plane, injected.
   *
   * Optional, and its absence is a governed answer rather than a failure: a deployment with no
   * indexed document answers evidence questions with *"no contract evidence has been indexed"*,
   * which is the "before" half of the before/after knowledge proof (§63).
   */
  readonly #knowledge: KnowledgePort | undefined;

  constructor(
    ctx: RequestContext,
    gateway: ApplicationGateway,
    asOf: Instant,
    readonly authorisedProjectIds: readonly string[],
    knowledge?: KnowledgePort,
  ) {
    this.#tc = { ctx, gateway, asOf, authorisedProjectIds };
    this.#knowledge = knowledge;
  }

  /** What was invoked, and what it reached. Read by the audit record; never by the model. */
  get trace(): readonly ToolInvocation[] {
    return this.#trace;
  }

  async invoke(tool: AssistantToolId, args: ToolArgs): Promise<ToolResult> {
    try {
      const result = await this.#dispatch(tool, args);
      this.#trace.push({
        tool,
        decision: 'GRANT',
        objects: [...new Set(result.claims.flatMap(
          (c) => c.groundedBy.filter((r) => r.entityType === 'project').map((r) => r.entityId),
        ))].filter((id) => id !== ''),
      });
      return result;
    } catch (e) {
      this.#trace.push({ tool, decision: 'DENY', objects: [] });
      throw e;
    }
  }

  /**
   * The closed dispatch. A tool id with no case is a type error, not a runtime string lookup - which
   * is what makes "the allowlist is closed" a compile-time property rather than a convention.
   */
  async #dispatch(tool: AssistantToolId, args: ToolArgs): Promise<ToolResult> {
    switch (tool) {
      case 'portfolio.summary.get': return summary(this.#tc);
      case 'portfolio.ranking.list': return ranking(this.#tc, narrowBy(args), args.limit);
      // The plan's filters narrow the population the finding is counted over. Without a plan the
      // narrowing function is absent and the tool behaves exactly as it did in Phase 11.
      case 'portfolio.reportedGreenRisk.list':
        return greenAtRisk(this.#tc, 'reported', narrowBy(args), args.limit);
      case 'portfolio.systemGreenAtRisk.list':
        return greenAtRisk(this.#tc, 'system', narrowBy(args), args.limit);
      case 'portfolio.segments.compare': return compare(this.#tc, args);
      case 'project.executiveHealth.get': return executiveHealth(this.#tc, args.projectId);
      case 'project.marginDrivers.get': return marginDrivers(this.#tc, args.projectId);
      case 'project.forwardRisk.get': return forwardRisk(this.#tc, args.projectId);
      case 'project.recoveryOptions.get': return recoveryOptions(this.#tc, args.projectId);
      case 'project.lateDetection.get': return lateDetection(this.#tc, args.projectId);
      case 'evidence.get': return evidence(this.#tc, args.projectId);
      case 'metric.definition.get': return Promise.resolve(metricDefinition(this.#tc, args.metricId));
      // Phase 13. A plan-driven tool with no plan is a caller defect, not a data question: the
      // empty plan below is a shape that selects nothing, so it declines rather than returning the
      // whole portfolio to a caller who forgot to pass one.
      case 'portfolio.population.query': return populationQuery(this.#tc, plan(args, 'population.list'));
      case 'portfolio.population.aggregate': return populationAggregate(this.#tc, plan(args, 'population.aggregate'));
      case 'portfolio.concentration.get': return concentration(this.#tc, plan(args, 'population.concentration'));
      case 'portfolio.change.get': return periodChange(this.#tc, plan(args, 'population.change'));
      case 'portfolio.recovery.list': return recovering(this.#tc, plan(args, 'population.recovering'));
      case 'projects.compare': return compareProjects(this.#tc, plan(args, 'project.compare'));
      case 'project.milestones.get': return milestones(this.#tc, plan(args, 'project.milestones'));
      case 'project.acceptanceEvidence.get': return acceptanceEvidence(this.#tc, plan(args, 'project.acceptanceEvidence'));
      case 'knowledge.evidence.get':
        return Promise.resolve(knowledgeEvidence(this.#tc, plan(args, 'knowledge.document'), this.#knowledge));
      case 'source.provenance.get':
        return sourceProvenance(this.#tc, plan(args, 'source.provenance'), this.#knowledge);
      case 'source.dataQuality.get':
        return Promise.resolve(dataQuality(this.#tc, plan(args, 'source.dataQuality'), this.#knowledge));
      default: throw new ToolDenied();
    }
  }
}

/**
 * Execution lineage for one answered question.
 *
 * Everything here is **metadata about how an answer was produced**, never the answer's prose and
 * never the material it was produced from. The distinction is the whole design of this record:
 *
 *   - the question is a digest, so the log is not a transcript of what executives are worried about;
 *   - claims and evidence appear as **identifiers and versions**, never as text, so a document's
 *     contents are not duplicated into a store with different access rules;
 *   - the model's reasoning is absent, because it is not evidence of anything and cannot be checked;
 *   - the provider appears as an id and a model name — never a key, a key digest, or an endpoint.
 *
 * What it does carry is everything needed to answer *"why did it say that, and was it allowed to?"*
 * six months later: the plan, whether the validator accepted it, which governed tools ran, which
 * source versions the answer stood on, which composer wrote the sentence, and what the external-AI
 * policy decided.
 */
export interface AssistantQueryLineage {
  readonly eventId: string;
  readonly occurredAt: Instant;
  readonly actorId: string;
  readonly actorRole: string;
  readonly persona: string | null;
  readonly authorisedProjectCount: number;
  readonly questionDigest: string;
  readonly plan: Readonly<Record<string, unknown>> | null;
  readonly planOrigin: string | null;
  readonly planValidation: 'ACCEPTED' | 'REJECTED' | 'NOT_REACHED';
  readonly planRejections: readonly string[];
  readonly tools: readonly string[];
  readonly objects: readonly string[];
  readonly sourceVersions: readonly string[];
  readonly claimIds: readonly string[];
  readonly providerId: string | null;
  readonly providerModel: string | null;
  readonly providerOutcome: string | null;
  readonly externalAiPolicy: string | null;
  readonly composer: string;
  readonly answerability: string | null;
  readonly groundingValidation: 'PASS' | 'REJECT';
  readonly groundingDetections: readonly string[];
  readonly refusal: string | null;
  readonly decision: 'GRANT' | 'DENY';
  readonly executiveAuthority: string;
  readonly assessmentStatus: string;
  readonly responseId: string;
}

/**
 * Writes the single `ASSISTANT_QUERY` record for one interaction, and its durable lineage.
 *
 * Denials are recorded as well as grants (`SECURITY_MODEL.md` §5.3), and a refusal is recorded with
 * its reason code even though the caller sees one generic string - which is the whole point of
 * separating the audit reason from the rendered message.
 *
 * ## Why there are two writes and not two mechanisms
 *
 * `AuditRecord`'s shape is fixed by `SECURITY_MODEL.md` §5.2 and widening it would be a change to a
 * governed artifact, needing an ADR rather than a field. So the governed record goes to `ctx.audit`
 * exactly as it always has, and the **same values**, plus the execution detail that has nowhere to
 * live in that shape, go to the durable repository under the same event id. There is one function,
 * one call site and one set of inputs: the durable document is derived from the governed record
 * rather than assembled separately, which is what stops audit becoming a second version of events.
 *
 * A durable write that fails is **reported, not swallowed**: `SECURITY_MODEL.md` §5.3 says a failure
 * to audit fails the operation, and a lineage store that silently drops records would be worse than
 * no lineage store, because the gap would be invisible.
 */
export async function auditAssistantQuery(
  ctx: RequestContext,
  args: {
    readonly question: string;
    readonly response: AssistantResponse;
    readonly trace: readonly ToolInvocation[];
    readonly composer: string;
    readonly detections: readonly string[];
    readonly lineage?: {
      readonly persona?: string;
      readonly plan?: Readonly<Record<string, unknown>> | null;
      readonly planOrigin?: string | null;
      readonly planValidation?: AssistantQueryLineage['planValidation'];
      readonly planRejections?: readonly string[];
      readonly sourceVersions?: readonly string[];
      readonly providerId?: string | null;
      readonly providerModel?: string | null;
      readonly providerOutcome?: string | null;
      readonly externalAiPolicy?: string | null;
      readonly answerability?: string | null;
    };
    /** Where the lineage is kept. Absent means in-memory only, which is correct for a build script. */
    readonly durable?: { append(record: Readonly<Record<string, unknown>>): Promise<void> };
  },
): Promise<void> {
  const { response } = args;
  const objects = [...new Set(args.trace.flatMap((t) => t.objects))];
  const reason = [
    `intent=${response.intent ?? 'UNRESOLVED'}`,
    `question=${questionDigest(args.question)}`,
    `scope=${String(response.scope.authorisedProjectCount)} authorised`,
    `tools=${args.trace.map((t) => `${t.tool}:${t.decision}`).join(',') || 'none'}`,
    `objects=${objects.join(',') || 'none'}`,
    `refusal=${response.refusal?.reason ?? 'none'}`,
    `validator=${args.detections.length === 0 ? 'PASS' : `REJECT:${args.detections.join('|')}`}`,
    `composer=${args.composer}`,
    `authority=${response.executiveAuthority}`,
    `status=${response.assessmentStatus}`,
  ].join(' | ');

  const occurredAt = ctx.clock.now();
  const decision = response.refusal === undefined ? 'GRANT' as const : 'DENY' as const;

  await ctx.audit.record({
    occurredAt,
    actorId: ctx.auth.actorId,
    actorRole: ctx.auth.role,
    ...(ctx.auth.impersonatorId !== undefined ? { impersonatorId: ctx.auth.impersonatorId } : {}),
    action: 'ASSISTANT_QUERY',
    entityType: 'assistant',
    entityId: ctx.auth.correlationId,
    fields: [],
    decision,
    reason,
    correlationId: ctx.auth.correlationId,
    sourceIp: ctx.sourceIp,
    userAgent: ctx.userAgent,
  });

  if (args.durable === undefined) return;

  const extra = args.lineage ?? {};
  const lineage: AssistantQueryLineage = {
    // The correlation id is the event id, so the governed record and the lineage are the same event
    // rather than two events that happen to be about the same request.
    eventId: String(ctx.auth.correlationId),
    occurredAt,
    actorId: String(ctx.auth.actorId),
    actorRole: String(ctx.auth.role),
    persona: extra.persona ?? null,
    authorisedProjectCount: response.scope.authorisedProjectCount,
    questionDigest: questionDigest(args.question),
    plan: extra.plan ?? null,
    planOrigin: extra.planOrigin ?? null,
    planValidation: extra.planValidation ?? 'NOT_REACHED',
    planRejections: extra.planRejections ?? [],
    tools: args.trace.map((t) => `${t.tool}:${t.decision}`),
    objects,
    sourceVersions: extra.sourceVersions ?? [],
    // Identifiers, never text. A claim's sentence is in the response; repeating it here would put
    // governed prose in a store with different access rules and no expiry.
    claimIds: response.materialClaims.map((c) => c.claimId),
    providerId: extra.providerId ?? null,
    providerModel: extra.providerModel ?? null,
    providerOutcome: extra.providerOutcome ?? null,
    externalAiPolicy: extra.externalAiPolicy ?? null,
    composer: args.composer,
    answerability: extra.answerability ?? null,
    groundingValidation: args.detections.length === 0 ? 'PASS' : 'REJECT',
    groundingDetections: args.detections,
    refusal: response.refusal?.reason ?? null,
    decision,
    executiveAuthority: response.executiveAuthority,
    assessmentStatus: response.assessmentStatus,
    responseId: `${String(ctx.auth.correlationId)}:${questionDigest(args.question)}`,
  };

  await args.durable.append(lineage as unknown as Readonly<Record<string, unknown>>);
}

export const PORT_STATE: string =
  'Tool port bound to one caller after scope resolution; ASSISTANT_QUERY audit carries metadata '
  + 'and a question digest, never the prose (SECURITY_MODEL.md §6a).';
