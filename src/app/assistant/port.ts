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
      case 'portfolio.ranking.list': return ranking(this.#tc);
      // The plan's filters narrow the population the finding is counted over. Without a plan the
      // narrowing function is absent and the tool behaves exactly as it did in Phase 11.
      case 'portfolio.reportedGreenRisk.list':
        return greenAtRisk(this.#tc, 'reported', narrowBy(args));
      case 'portfolio.systemGreenAtRisk.list':
        return greenAtRisk(this.#tc, 'system', narrowBy(args));
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
 * Writes the single `ASSISTANT_QUERY` record for one interaction.
 *
 * Denials are recorded as well as grants (`SECURITY_MODEL.md` §5.3), and a refusal is recorded with
 * its reason code even though the caller sees one generic string - which is the whole point of
 * separating the audit reason from the rendered message.
 */
export async function auditAssistantQuery(
  ctx: RequestContext,
  args: {
    readonly question: string;
    readonly response: AssistantResponse;
    readonly trace: readonly ToolInvocation[];
    readonly composer: string;
    readonly detections: readonly string[];
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

  await ctx.audit.record({
    occurredAt: ctx.clock.now(),
    actorId: ctx.auth.actorId,
    actorRole: ctx.auth.role,
    ...(ctx.auth.impersonatorId !== undefined ? { impersonatorId: ctx.auth.impersonatorId } : {}),
    action: 'ASSISTANT_QUERY',
    entityType: 'assistant',
    entityId: ctx.auth.correlationId,
    fields: [],
    decision: response.refusal === undefined ? 'GRANT' : 'DENY',
    reason,
    correlationId: ctx.auth.correlationId,
    sourceIp: ctx.sourceIp,
    userAgent: ctx.userAgent,
  });
}

export const PORT_STATE: string =
  'Tool port bound to one caller after scope resolution; ASSISTANT_QUERY audit carries metadata '
  + 'and a question digest, never the prose (SECURITY_MODEL.md §6a).';
