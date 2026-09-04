/**
 * Conversation state and plan refinement (ADR-0034 §5, §6).
 *
 * The four-turn exchange this exists for:
 *
 * > *"Which Green projects should I worry about over the next 60 days?"*
 * > *"Only Automotive."*  ·  *"Only North America."*  ·  *"Which has the greatest exposure?"*
 *
 * Turn two has no shape. Turn three must keep turn two. Turn four's *"which"* has no meaning without
 * a population to be greatest within. So a turn does not produce a plan from nothing — it produces
 * a **bounded delta** applied to the previous plan.
 *
 * ## The rule that makes this safe
 *
 * **Conversation state never creates an authoritative fact.** It carries scope, filters, the
 * previous population's ids, the active project, the period and the previous plan — and nothing
 * else. No figure, no band, no assessment. So a follow-up cannot inherit a number: it inherits a
 * *question*, and the number is re-read through the governed tools on every turn.
 *
 * That is also why the population is carried as **ids** rather than as rows. Resolving *"which of
 * those"* against a set of ids can only ever narrow a set the caller was already authorised for, and
 * re-reading each one re-runs the object-level check. Carrying the rows would have made the
 * conversation a cache, and a cache is a place where an authorisation revoked between turns stops
 * taking effect.
 *
 * ## Why state lives on the client
 *
 * The trusted runtime is stateless (ADR-0032). The client carries the conversation and the server
 * re-validates and re-authorises it every turn — which is strictly safer than a server session
 * store, because a forged state can only ever request reads the caller's own scope already permits.
 */
import type { PlanFilters, QueryPlan, TimeSelector } from '@contexts/ai-intelligence';
import { EMPTY_FILTERS, emptyPlan, requiresProject } from '@contexts/ai-intelligence';

/**
 * What survives between turns.
 *
 * Bounded on purpose: `population` is capped, `history` is capped, and the whole object is small
 * enough to travel on a request. An unbounded conversation is an unbounded request body, which is a
 * resource guard (§84) as much as a design choice.
 */
export interface ConversationState {
  readonly turn: number;
  readonly lastPlan: QueryPlan | null;
  /** Ids the previous answer's population contained. The referent of "those". */
  readonly population: readonly string[];
  readonly activeProjectId: string | null;
  /** Filters carried from the application's own UI, if the surface supplied them. */
  readonly surfaceFilters: PlanFilters;
  readonly history: readonly { readonly question: string; readonly shape: string }[];
}

export const MAX_POPULATION_CARRIED = 200;
export const MAX_HISTORY = 12;

export const NEW_CONVERSATION: ConversationState = {
  turn: 0,
  lastPlan: null,
  population: [],
  activeProjectId: null,
  surfaceFilters: EMPTY_FILTERS,
  history: [],
};

/**
 * Applies this turn's planning result to the conversation.
 *
 * The refinement rules, in the order they are applied:
 *
 * 1. **A turn with no shape of its own inherits the previous shape.** *"Only Automotive."* keeps
 *    answering the last question, in a narrower population.
 * 2. **A named filter dimension replaces that dimension; it does not add to it.** *"Only North
 *    America"* after *"Only Automotive"* means Automotive **and** North America, because they are
 *    different dimensions — but a second region replaces the first, because *"only Europe"* means
 *    only Europe. Accumulating within a dimension would turn successive narrowings into a widening,
 *    which is the opposite of what the word "only" means.
 * 3. **A new question with its own shape and no refinement marker starts fresh**, keeping only the
 *    surface filters. A conversation that never forgets is one where an executive's third unrelated
 *    question is silently answered inside their first question's scope.
 * 4. **A back-reference restricts to the carried population.** *"Which of those has the greatest
 *    exposure?"* becomes the previous plan's filters plus an explicit id list, so the ordering is
 *    computed over exactly the rows the reader was looking at.
 */
export function refine(
  state: ConversationState,
  proposed: QueryPlan,
  isRefinement: boolean,
  backReference: boolean,
): QueryPlan {
  const previous = state.lastPlan;

  if (previous === null || !isRefinement) {
    // A fresh question. Surface filters still apply — the executive is looking at a filtered screen
    // and expects the answer to be about what they can see (§24).
    return mergeSurfaceFilters(proposed, state.surfaceFilters);
  }

  const shape = hasOwnShape(proposed) ? proposed.shape : previous.shape;
  const filters = replaceNamedDimensions(previous.filters, proposed.filters);

  const withPopulation = backReference && state.population.length > 0
    ? { ...filters, projectIds: state.population.slice(0, MAX_POPULATION_CARRIED) }
    : filters;

  const projectId = proposed.projectId
    ?? (requiresProject(shape) ? state.activeProjectId : null);

  return {
    ...previous,
    shape,
    scope: projectId !== null ? 'project' : previous.scope,
    filters: withPopulation,
    metrics: proposed.metrics.length > 0 ? proposed.metrics : previous.metrics,
    time: mergeTime(previous.time, proposed.time),
    comparison: proposed.comparison === 'none' ? previous.comparison : proposed.comparison,
    sort: proposed.sort,
    limit: proposed.limit,
    groupBy: proposed.groupBy ?? previous.groupBy,
    projectId,
    metricId: proposed.metricId ?? previous.metricId,
    evidenceQuery: proposed.evidenceQuery ?? previous.evidenceQuery,
    origin: 'CONVERSATION_REFINEMENT',
  };
}

/**
 * A refinement's `population.list` default is not a shape the executive chose.
 *
 * The planner returns `population.list` for a filter-only turn because a plan must have a shape.
 * Treating that as a *stated* shape would make *"Only Automotive."* silently change a 60-day outlook
 * question into a list — the exact class of dropped-intent defect ADR-0034 exists to remove.
 */
function hasOwnShape(plan: QueryPlan): boolean {
  return !(plan.origin === 'CONVERSATION_REFINEMENT' && plan.shape === 'population.list');
}

function replaceNamedDimensions(previous: PlanFilters, incoming: PlanFilters): PlanFilters {
  return {
    regions: incoming.regions.length > 0 ? incoming.regions : previous.regions,
    industries: incoming.industries.length > 0 ? incoming.industries : previous.industries,
    accounts: incoming.accounts.length > 0 ? incoming.accounts : previous.accounts,
    customers: incoming.customers.length > 0 ? incoming.customers : previous.customers,
    deliveryGroups: incoming.deliveryGroups.length > 0 ? incoming.deliveryGroups : previous.deliveryGroups,
    systemRag: incoming.systemRag.length > 0 ? incoming.systemRag : previous.systemRag,
    reportedRag: incoming.reportedRag.length > 0 ? incoming.reportedRag : previous.reportedRag,
    trajectory: incoming.trajectory.length > 0 ? incoming.trajectory : previous.trajectory,
    outlook30: incoming.outlook30.length > 0 ? incoming.outlook30 : previous.outlook30,
    outlook60: incoming.outlook60.length > 0 ? incoming.outlook60 : previous.outlook60,
    drivers: incoming.drivers.length > 0 ? incoming.drivers : previous.drivers,
    findings: incoming.findings.length > 0 ? incoming.findings : previous.findings,
    projectIds: incoming.projectIds.length > 0 ? incoming.projectIds : [],
    thresholds: incoming.thresholds.length > 0 ? incoming.thresholds : previous.thresholds,
  };
}

/** A refinement that names no period keeps the previous one; a 60-day question stays 60-day. */
function mergeTime(previous: TimeSelector, incoming: TimeSelector): TimeSelector {
  return incoming === 'current' ? previous : incoming;
}

/**
 * Surface filters (§24, ADR-0034 §6).
 *
 * When the executive is looking at *North America · Automotive · Deteriorating* and asks *"which
 * ones need intervention?"*, the answer must be about that population. The filters enter as an
 * explicit plan input rather than as hidden state, so the rendered scope line shows them and the
 * reader can see the question was answered inside their current view rather than across everything.
 */
function mergeSurfaceFilters(plan: QueryPlan, surface: PlanFilters): QueryPlan {
  const merged: PlanFilters = {
    regions: plan.filters.regions.length > 0 ? plan.filters.regions : surface.regions,
    industries: plan.filters.industries.length > 0 ? plan.filters.industries : surface.industries,
    accounts: plan.filters.accounts.length > 0 ? plan.filters.accounts : surface.accounts,
    customers: plan.filters.customers.length > 0 ? plan.filters.customers : surface.customers,
    deliveryGroups: plan.filters.deliveryGroups.length > 0
      ? plan.filters.deliveryGroups : surface.deliveryGroups,
    systemRag: plan.filters.systemRag.length > 0 ? plan.filters.systemRag : surface.systemRag,
    reportedRag: plan.filters.reportedRag.length > 0 ? plan.filters.reportedRag : surface.reportedRag,
    trajectory: plan.filters.trajectory.length > 0 ? plan.filters.trajectory : surface.trajectory,
    outlook30: plan.filters.outlook30.length > 0 ? plan.filters.outlook30 : surface.outlook30,
    outlook60: plan.filters.outlook60.length > 0 ? plan.filters.outlook60 : surface.outlook60,
    drivers: plan.filters.drivers.length > 0 ? plan.filters.drivers : surface.drivers,
    findings: plan.filters.findings.length > 0 ? plan.filters.findings : surface.findings,
    projectIds: plan.filters.projectIds,
    thresholds: plan.filters.thresholds,
  };
  return { ...plan, filters: merged };
}

/** Records the turn. Population is capped; history is capped; nothing else is retained. */
export function advance(
  state: ConversationState,
  question: string,
  plan: QueryPlan | null,
  population: readonly string[],
): ConversationState {
  return {
    turn: state.turn + 1,
    lastPlan: plan ?? state.lastPlan,
    population: population.slice(0, MAX_POPULATION_CARRIED),
    activeProjectId: plan?.projectId ?? state.activeProjectId,
    surfaceFilters: state.surfaceFilters,
    history: [
      ...state.history.slice(-(MAX_HISTORY - 1)),
      { question: question.slice(0, 400), shape: plan?.shape ?? 'unresolved' },
    ],
  };
}

/**
 * Reads conversation state that arrived from a client.
 *
 * Every field is re-derived from what the request actually contains, and the whole object is bounded
 * before use. A forged state is not a security problem — it can only request reads the caller's own
 * authorised scope permits, because the scope is resolved server-side from the session on every turn
 * and a plan can never widen it — but an *unbounded* forged state would be a resource problem, and
 * that is what these caps close.
 */
export function readState(raw: unknown): ConversationState {
  if (typeof raw !== 'object' || raw === null) return NEW_CONVERSATION;
  const r = raw as Record<string, unknown>;
  const population = Array.isArray(r['population'])
    ? r['population'].filter((v): v is string => typeof v === 'string').slice(0, MAX_POPULATION_CARRIED)
    : [];
  const history = Array.isArray(r['history'])
    ? r['history']
      .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
      .slice(-MAX_HISTORY)
      .map((v) => ({
        question: typeof v['question'] === 'string' ? v['question'].slice(0, 400) : '',
        shape: typeof v['shape'] === 'string' ? v['shape'].slice(0, 60) : 'unresolved',
      }))
    : [];
  const lastPlan = typeof r['lastPlan'] === 'object' && r['lastPlan'] !== null
    ? r['lastPlan'] as QueryPlan
    : null;

  return {
    turn: typeof r['turn'] === 'number' && globalThis.Number.isSafeInteger(r['turn'])
      ? Math.max(0, Math.min(r['turn'], 1000)) : 0,
    // The carried plan is re-validated by `validatePlan` before anything executes, exactly like a
    // freshly-planned one. There is no path where a client-supplied plan reaches a tool unchecked.
    lastPlan,
    population,
    activeProjectId: typeof r['activeProjectId'] === 'string'
      ? r['activeProjectId'].slice(0, 40) : null,
    surfaceFilters: readSurfaceFilters(r['surfaceFilters']),
    history,
  };
}

function readSurfaceFilters(raw: unknown): PlanFilters {
  if (typeof raw !== 'object' || raw === null) return EMPTY_FILTERS;
  const base = emptyPlan('population.list').filters;
  const r = raw as Record<string, unknown>;
  const strings = (key: string): readonly string[] => (Array.isArray(r[key])
    ? (r[key] as unknown[]).filter((v): v is string => typeof v === 'string').slice(0, 12)
    : []);
  return {
    ...base,
    regions: strings('regions'),
    industries: strings('industries'),
    accounts: strings('accounts'),
    customers: strings('customers'),
    deliveryGroups: strings('deliveryGroups'),
    systemRag: strings('systemRag') as PlanFilters['systemRag'],
    reportedRag: strings('reportedRag') as PlanFilters['reportedRag'],
    trajectory: strings('trajectory') as PlanFilters['trajectory'],
    outlook30: strings('outlook30') as PlanFilters['outlook30'],
    outlook60: strings('outlook60') as PlanFilters['outlook60'],
    drivers: strings('drivers') as PlanFilters['drivers'],
    findings: strings('findings') as PlanFilters['findings'],
  };
}
