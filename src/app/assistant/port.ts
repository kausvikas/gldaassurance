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
  AssistantResponse, AssistantToolId, AuthorisedToolPort, ToolArgs, ToolResult,
} from '@contexts/ai-intelligence';
import type { Instant } from '@platform/time';
import type { RequestContext } from '../authorization/enforcement.js';
import type { ApplicationGateway } from '../gateway.js';
import { type ToolContext, ToolDenied, compare, greenAtRisk, ranking, summary } from './tools.js';
import {
  evidence, executiveHealth, forwardRisk, lateDetection, marginDrivers, metricDefinition,
  recoveryOptions,
} from './project-tools.js';

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

  constructor(
    ctx: RequestContext,
    gateway: ApplicationGateway,
    asOf: Instant,
    readonly authorisedProjectIds: readonly string[],
  ) {
    this.#tc = { ctx, gateway, asOf, authorisedProjectIds };
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
      case 'portfolio.reportedGreenRisk.list': return greenAtRisk(this.#tc, 'reported');
      case 'portfolio.systemGreenAtRisk.list': return greenAtRisk(this.#tc, 'system');
      case 'portfolio.segments.compare': return compare(this.#tc, args);
      case 'project.executiveHealth.get': return executiveHealth(this.#tc, args.projectId);
      case 'project.marginDrivers.get': return marginDrivers(this.#tc, args.projectId);
      case 'project.forwardRisk.get': return forwardRisk(this.#tc, args.projectId);
      case 'project.recoveryOptions.get': return recoveryOptions(this.#tc, args.projectId);
      case 'project.lateDetection.get': return lateDetection(this.#tc, args.projectId);
      case 'evidence.get': return evidence(this.#tc, args.projectId);
      case 'metric.definition.get': return Promise.resolve(metricDefinition(this.#tc, args.metricId));
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
