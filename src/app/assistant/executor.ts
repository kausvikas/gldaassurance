/**
 * Plan execution — the single path from a validated `QueryPlan` to governed claims (ADR-0034).
 *
 * Both entry points converge here. `ask()` keeps its Phase 11 signature and builds a plan from the
 * intent its deterministic router resolved; `askWithPlan()` builds one from the full planner and the
 * conversation. **Neither has its own execution.** That matters more than it looks: two paths that
 * each read "the same" tools are two paths that will eventually disagree about which tools those
 * were, and the disagreement will surface as one surface answering a question differently from
 * another — which is precisely the class of defect §70 exists to prohibit.
 *
 * ## What this file does not do
 *
 * It does not authorise, filter for authorisation, compute a metric, or decide what a claim means.
 * The tools it calls go through `ApplicationGateway` → `Dispatcher` → `EnforcementPoint`; a project
 * the caller may not see comes back as the same generic not-found a non-existent project returns,
 * and nothing here can tell the difference or wants to.
 */
import type {
  AssistantToolId, AuthorisedToolPort, MaterialClaim, PlanShape, QueryPlan, ToolResult,
} from '@contexts/ai-intelligence';

/**
 * Which tools each shape may invoke. A closed map: a shape cannot reach an unlisted tool, and a
 * shape with no entry executes nothing rather than falling through to a default.
 *
 * The thirteen Phase 11 intents keep their exact tool sets, so the certification suite that proved
 * those answers correct is still proving it about the same reads.
 */
export const SHAPE_TOOLS: Readonly<Record<PlanShape, readonly AssistantToolId[]>> = {
  'population.list': ['portfolio.population.query'],
  'population.rank': ['portfolio.ranking.list'],
  'population.compare': ['portfolio.segments.compare'],
  'population.aggregate': ['portfolio.population.aggregate'],
  'population.change': ['portfolio.change.get'],
  'population.concentration': ['portfolio.concentration.get'],
  'population.reportedGreenRisk': ['portfolio.reportedGreenRisk.list'],
  'population.emergingRisk': ['portfolio.systemGreenAtRisk.list'],
  'population.recovering': ['portfolio.recovery.list'],
  'project.health': ['project.executiveHealth.get'],
  'project.margin': ['project.marginDrivers.get'],
  'project.burn': ['project.executiveHealth.get'],
  'project.scope': ['project.executiveHealth.get'],
  'project.confidence': ['project.lateDetection.get'],
  'project.forwardRisk': ['project.forwardRisk.get'],
  'project.recovery': ['project.recoveryOptions.get'],
  'project.milestones': ['project.milestones.get'],
  'project.acceptanceEvidence': ['project.acceptanceEvidence.get', 'knowledge.evidence.get'],
  'project.compare': ['projects.compare'],
  'evidence.lookup': ['evidence.get'],
  'metric.definition': ['metric.definition.get'],
  'knowledge.document': ['knowledge.evidence.get'],
  'source.provenance': ['source.provenance.get'],
  'source.dataQuality': ['source.dataQuality.get'],
};

export interface ExecutionResult {
  readonly claims: readonly MaterialClaim[];
  readonly results: readonly ToolResult[];
  /** Project ids the answer's population contains. Carried into the conversation as ids only. */
  readonly population: readonly string[];
  readonly toolsInvoked: readonly AssistantToolId[];
  /** A tool refused. Out of scope, non-existent and not-computable are one outcome by design. */
  readonly denied: boolean;
}

/**
 * Runs the plan's tools in order and gathers what they returned.
 *
 * A denial is not an exception here: the caller renders a governed refusal, and distinguishing
 * *why* a tool denied would be the existence disclosure `SECURITY_MODEL.md` §4.5 prohibits.
 *
 * `project.acceptanceEvidence` is the one shape whose tools may **partially** succeed: the canonical
 * project evidence exists and the document evidence may not. That is a real epistemic state — *"the
 * plan says one thing and no contract has been indexed to compare it with"* — and collapsing it into
 * a denial would tell a reader nothing is known when half of it is.
 */
export async function executePlan(
  plan: QueryPlan, port: AuthorisedToolPort,
): Promise<ExecutionResult> {
  const tools = SHAPE_TOOLS[plan.shape];
  const results: ToolResult[] = [];
  const invoked: AssistantToolId[] = [];
  const tolerant = plan.shape === 'project.acceptanceEvidence';
  let denied = false;

  for (const tool of tools) {
    try {
      const result = await port.invoke(tool, argsFor(plan));
      results.push(result);
      invoked.push(tool);
    } catch {
      if (!tolerant) return { claims: [], results: [], population: [], toolsInvoked: invoked, denied: true };
      denied = true;
    }
  }

  const claims = results.flatMap((r) => r.claims);
  return {
    claims,
    results,
    population: populationOf(claims),
    toolsInvoked: invoked,
    // A tolerant shape that got nothing at all is still a denial; one that got something is not.
    denied: denied && claims.length === 0,
  };
}

/**
 * The arguments one plan produces.
 *
 * The whole plan travels, because the population tools need the filters and the sort. The twelve
 * Phase 11 tools ignore it and read `projectId` and `metricId` exactly as before, so adding the
 * field changed nothing about how they behave.
 */
function argsFor(plan: QueryPlan): {
  projectId?: string; metricId?: string; segmentIds?: readonly string[]; limit: number; plan: QueryPlan;
} {
  const segments = [
    ...plan.filters.regions, ...plan.filters.industries, ...plan.filters.deliveryGroups,
  ];
  return {
    ...(plan.projectId !== null ? { projectId: plan.projectId } : {}),
    ...(plan.metricId !== null ? { metricId: plan.metricId } : {}),
    ...(segments.length > 0 ? { segmentIds: segments } : {}),
    limit: plan.limit,
    plan,
  };
}

/**
 * The project ids an answer actually spoke about.
 *
 * Read from the claims' own grounding rather than from the plan, so *"which of those"* refers to
 * what the previous answer **said**, not to what it was asked. Those differ whenever a tool returned
 * fewer rows than the filter matched, and resolving a back-reference against the wider set would
 * silently reintroduce projects the reader never saw.
 */
function populationOf(claims: readonly MaterialClaim[]): readonly string[] {
  const ids = new Set<string>();
  for (const c of claims) {
    for (const ref of c.groundedBy) {
      if (ref.entityType === 'project' && ref.entityId !== '') ids.add(ref.entityId);
    }
  }
  return [...ids];
}
