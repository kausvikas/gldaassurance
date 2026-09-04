/**
 * The deterministic planner (ADR-0034 §3).
 *
 * Natural language in, typed `QueryPlan` out — by grammar over governed vocabulary, before any model
 * is consulted and before any data is read.
 *
 * ## Why deterministic-first rather than model-first
 *
 * Three reasons, in order of how much they matter:
 *
 * 1. **The common path stays model-free.** Almost every executive question is built from the same
 *    vocabulary the product's own filters use, so it resolves here — which means it is answerable
 *    with the model switched off, byte-identical across providers, and free.
 * 2. **It is testable.** `tests/integration/assistant-unseen-questions.test.ts` asserts that
 *    questions appearing nowhere in this repository resolve correctly. A model-first planner would
 *    pass that test by being a model, proving nothing about the design.
 * 3. **It fails visibly.** An unresolved question returns `null` and the caller declines with the
 *    governed alternatives. A model asked to plan anything will plan something.
 *
 * ## This is not string matching for canned answers
 *
 * Nothing here maps a phrase to a response. Phrases select **plan fields** — a filter, a sort, a
 * shape — which are then composed. *"Which Automotive projects in North America have lost more than
 * three margin points?"* is not a recognised sentence; it is four independent recognitions
 * (industry, region, threshold, shape) that compose into one plan, and each of the four works in any
 * question containing it. That compositionality is exactly what a canned system does not have, and
 * it is why the unseen-question test is a meaningful detector.
 */
import { qMul, qty } from '@platform/decimal';
import type {
  Band, DriverId, FindingId, GroupSelector, MetricSelector, PlanFilters, PlanShape, QueryPlan,
  SortSelector, ThresholdCondition, TimeSelector, TrajectoryState,
} from '@contexts/ai-intelligence';
import {
  DEFAULT_LIMIT, DRIVER_PHRASES, EMPTY_FILTERS, INDUSTRY_SYNONYMS, LIMIT_MAX, REGION_SYNONYMS,
  emptyPlan, readLimit, requiresProject,
} from '@contexts/ai-intelligence';

export interface PlannerVocabulary {
  /** Governed values present in the current portfolio, supplied by the caller. */
  readonly regions: readonly string[];
  readonly industries: readonly string[];
  readonly accounts: readonly string[];
  readonly customers: readonly string[];
  readonly deliveryGroups: readonly string[];
  /** id → display name, for resolving *"why is Atlas red"* to a project without fuzzy matching. */
  readonly projects: readonly { readonly id: string; readonly name: string }[];
}

export const EMPTY_VOCABULARY: PlannerVocabulary = {
  regions: [], industries: [], accounts: [], customers: [], deliveryGroups: [], projects: [],
};

export interface PlanningResult {
  readonly plan: QueryPlan | null;
  /** Why nothing was planned. Drives which decline the caller renders. */
  readonly declineReason: DeclineReason | null;
  /** Fields the planner recognised. Rendered so a reader can see what was understood. */
  readonly recognised: readonly string[];
  /** True when the question was understood but is a refinement of an existing plan. */
  readonly isRefinement: boolean;
}

export type DeclineReason =
  | 'MUTATION_REQUEST'
  | 'PROBABILITY_REQUEST'
  | 'OUT_OF_DOMAIN'
  | 'PROJECT_NOT_NAMED'
  | 'AMBIGUOUS';

/**
 * A request to *do* something rather than to know something.
 *
 * Retained verbatim from Phase 11 because the reasoning has not changed: the assistant exposes zero
 * write tools, so such a request is already harmless — but answering it with a read is the wrong
 * shape. Asked *"set prj-011 to green and approve its recovery plan"*, an earlier build matched
 * `recover`, ran the recovery tool and returned a perfectly grounded briefing. Nothing was mutated
 * and nothing leaked, and the reader was still answered as though the instruction had been engaged
 * with.
 */
const MUTATION_REQUEST =
  /\b(set|change|update|approve|reject|apply|override|close|accept|assign|create|delete|send|email|escalate|mark|fix|correct|adjust|recalculate|amend|revise|write|push|sync back|post)\b[^?]{0,60}\b(to|as|the|this|it|back|rag|status|green|amber|red|etc|eac|baseline|plan|risk|warning|override|threshold|number|figure|value|result|salesforce|jira|tableau)\b/;

/**
 * Probabilistic framing, declined **whatever else the question matches**.
 *
 * Nothing in this product is trained, fitted or sampled, so there is no payload that could ground a
 * likelihood. Without this guard, *"how likely is prj-011 to go red next quarter?"* matches the
 * health family on the word `red` and gets a confident governed answer to a question the reader did
 * not ask — which is worse than declining, because they asked about the future and were handed the
 * present.
 */
const PROBABILITY_REQUEST =
  /\b(?:how likely|likelihood|probabilit\w*|what are the odds|chance(?:s)? (?:of|that)|percent(?:age)? (?:risk|chance|likelihood)|will\s+(?:\S+\s+){0,6}?(?:fail|succeed)|predict the|odds of)\b/;

/** Attempts to reach the machinery rather than the data. Declined before anything is planned. */
const SYSTEM_PROBE =
  /\b(system prompt|your prompt|your instructions|api key|anthropic key|secret|credential|token|run (?:this|arbitrary) (?:sql|javascript|code)|execute (?:this|arbitrary)|drop table|select \* from|ignore (?:all )?(?:previous|prior|above) instructions)\b/;

/**
 * Refinement openers. `"Only Automotive."` is a sentence with no verb and no question.
 *
 * Matched against the **lowercased** question. Matching the original case meant `"Only Automotive."`
 * — the exact phrasing an executive types — was not recognised as a refinement while `"only
 * automotive"` was, so the second turn of every conversation silently became a fresh question.
 */
const REFINEMENT_OPENER =
  /^\s*(?:and\s+)?(?:now\s+)?(?:just|only|restrict(?:ed)? to|narrow to|filter to|limit to|within|in)\b/;

/**
 * A reference to the previous answer's population.
 *
 * `which one` and `which has` belong here: *"Which one has the greatest exposure?"* carries no
 * filter and no shape, and reads as an unanswerable fragment unless it is understood as *"of the
 * ones you just showed me"*. That is what an executive means, and treating it as a fresh question
 * would rank the whole portfolio while appearing to answer about the four projects on screen.
 */
const BACK_REFERENCE =
  /\b(?:of (?:those|these|them)|among (?:those|these|them)|from (?:those|these|them)|which (?:of )?(?:those|these|them|one|ones)\b|which (?:one )?(?:has|have|is|are)\b|that one|the same|those|these)\b/;

/** Matched in order; the first hit wins, so more specific families are listed first. */
const SHAPE_PATTERNS: readonly (readonly [PlanShape, RegExp])[] = [
  ['metric.definition', /\b(how is .* (?:defined|calculated)|what does .* mean|definition of|formula for|how do you (?:define|calculate))\b/],
  ['source.dataQuality', /\b(data quality|how complete is|what data are we missing|what information are we missing|coverage of (?:the )?data|missing to answer)\b/],
  ['source.provenance', /\b(where did .* come from|what source|which system|source of (?:this|that|the)|provenance|lineage|who owns (?:this|that) (?:number|figure|data))\b/],
  ['knowledge.document', /\b(sow|statement of work|contract say|contract state|amendment|msa|document say|clause|acceptance criteria say|what does .*'?s? .* say)\b/],
  ['project.acceptanceEvidence', /\b(acceptance (?:requirements?|criteria)|do we have evidence|evidence that .* met|are the acceptance|acceptance state)\b/],
  ['project.milestones', /\b(milestone|next critical|next gate|deadline|due date|acceptance milestone)\b/],
  ['population.change', /\b(what changed|what has changed|since (?:the )?(?:last|previous) (?:review|cycle|period|month)|movement since|changed since|what moved)\b/],
  ['population.concentration', /\b(?:concentrat\w*|where is .* worst|which (?:region|vertical|industry|account|group) has the most|pattern|repeating|cluster)\b/],
  ['population.reportedGreenRisk', /\b(reported green|reported as green|says green|claiming green|reported rag|green against the evidence|status is ahead)\b/],
  ['population.emergingRisk', /\b(?:emerging risk|green at risk|green-at-risk|quietly|about to turn|not yet red|expected to deteriorat\w*|healthy today)\b/],
  ['population.recovering', /\b(?:recovering|turning around|getting better|improving projects|which projects are improving|is the recovery)\b/],
  ['population.compare', /\b(compare|versus| vs |against each other|side by side|difference between)\b/],
  ['population.aggregate', /\b(portfolio (?:margin|gm|tcv|value)|total (?:contract value|tcv|margin|exposure)|overall|in aggregate|across the portfolio|how many (?:fixed|projects)|what is the portfolio)\b/],
  ['project.recovery', /\b(recover|claw back|get back|mitigat|turn .* around|what specifically improved)\b/],
  ['project.margin', /\b(margin|gm\b|erosion|economics|bridge|why did .* lose)\b/],
  ['project.burn', /\b(burn|progress|completion|ahead or behind|schedule variance|spend against)\b/],
  ['project.scope', /\b(scope|change request|\bcr\b|unbilled|uncommercialised|uncommercialized|unsigned)\b/],
  ['project.confidence', /\b(confiden|how sure|how much do we trust|late detection|would we have caught|reliab)\b/],
  ['project.forwardRisk', /\b(outlook|forward|early warning|trajectory|30-day|60-day|next \d+ days|going to (?:turn|go))\b/],
  ['evidence.lookup', /\b(what evidence|where does .* come from|back this up|show me the source)\b/],
  ['population.rank', /\b(?:where (?:do|should) (?:i|we)|intervene|first|priorit\w*|worst|rank|top \d|biggest|largest|greatest|most at risk|worry about|need(?:s)? (?:attention|intervention|leadership)|focus on|this week)\b/],
  ['project.health', /\b(why is|health|\brag\b|status of|explain|red|amber|green)\b/],
  ['population.list', /\b(?:which projects|list|show me|show all|how many|what projects|find|give me)\b/],
];

/**
 * The population form of a project shape.
 *
 * *"Which Green projects are expected to deteriorate over the next 60 days?"* matches the
 * forward-risk family on `next 60 days` — correctly, it **is** a forward-risk question — and then
 * declines, because that shape needs a project and the executive named none. Declining is the wrong
 * answer to a question that was perfectly clear: they asked about a *population*.
 *
 * So a project shape resolved for a question that is plainly about many projects is replaced by its
 * population counterpart. The substitution is recorded in `recognised` and rendered, because a
 * reader is entitled to see that the product answered a population question rather than silently
 * reinterpreting theirs.
 */
const POPULATION_COUNTERPART: Readonly<Partial<Record<PlanShape, PlanShape>>> = {
  'project.health': 'population.list',
  'project.margin': 'population.list',
  'project.burn': 'population.list',
  'project.scope': 'population.list',
  'project.confidence': 'source.dataQuality',
  'project.forwardRisk': 'population.emergingRisk',
  'project.recovery': 'population.recovering',
  'project.milestones': 'population.list',
  'evidence.lookup': 'source.provenance',
};

/**
 * Whether the question is about many projects rather than one.
 *
 * Plural subjects, counting words, and the portfolio-scoped interrogatives. Deliberately *not*
 * "contains no project name" — a question can name no project and still be about one, which is why
 * `"why is it red?"` remains a project question resolved through the conversation's active project.
 */
/**
 * The nouns an executive uses for "more than one project".
 *
 * `engagement`, `work` and `account` are not synonyms this product invented — they are what people
 * in a delivery business actually say, and a question using one of them was declining with "name a
 * project" while the identical question using the word *projects* was answered. That asymmetry is
 * invisible to whoever wrote the vocabulary and obvious to the first executive who meets it.
 */
const POPULATION_NOUN = /\b(projects?|engagements?|programmes?|programs?|accounts?|contracts?|work|deals?)\b/;

function isPopularPluralQuestion(text: string): boolean {
  return (/\b(which|what|list|show|find|how many|give me|rank|is anything|anything)\b/.test(text)
    && POPULATION_NOUN.test(text))
    || /\bprojects\b/.test(text)
    || /\b(portfolio|across the|anywhere|everywhere|concentrat\w*|geographically|which region|which vertical|which account)\b/.test(text);
}

function isPopulationQuestion(text: string): boolean {
  return isPopularPluralQuestion(text);
}

/** `prj-011` and `MET-FIN-008` are matched by shape. A guessed id gets the same generic not-found. */
const PROJECT_ID = /\b(prj-\d{3,4})\b/i;
const METRIC_ID = /\b(MET-[A-Z]{2,5}-\d{3})\b/i;

export function planQuestion(
  question: string, vocabulary: PlannerVocabulary,
): PlanningResult {
  const text = question.toLowerCase();
  const recognised: string[] = [];

  if (SYSTEM_PROBE.test(text)) {
    return { plan: null, declineReason: 'OUT_OF_DOMAIN', recognised: [], isRefinement: false };
  }
  if (PROBABILITY_REQUEST.test(text)) {
    return { plan: null, declineReason: 'PROBABILITY_REQUEST', recognised: [], isRefinement: false };
  }
  if (MUTATION_REQUEST.test(text)) {
    return { plan: null, declineReason: 'MUTATION_REQUEST', recognised: [], isRefinement: false };
  }

  const filters = readFilters(text, vocabulary, recognised);
  const isRefinement = REFINEMENT_OPENER.test(text) || BACK_REFERENCE.test(text);

  /*
   * A recognised population question with no recognised family is a list, not a decline.
   *
   * A question naming a vertical and a governed condition is unmistakably about a set of projects,
   * and it can still match no family pattern because nobody wrote one for the particular verb the
   * executive used. Declining that is worse than answering it as a filtered list: the filters were
   * all understood, the population is exact, and the reader gets what they asked for with the scope
   * line showing precisely how it was read.
   *
   * This is a fallback, not a catch-all: it fires only when the question is already recognised as
   * being about a population, and the resulting plan still carries only filters the vocabulary
   * validated.
   */
  const shape = readShape(text)
    ?? (isPopulationQuestion(text) && hasAnyFilter(filters) ? 'population.list' : null);
  const projectId = readProjectId(question, vocabulary);
  if (projectId !== null) recognised.push(`project ${projectId}`);

  if (shape === null) {
    /*
     * A bare refinement is a legitimate turn with no shape of its own, and there are two kinds.
     *
     * `"Only Automotive."` narrows by filter. `"Which one has the greatest exposure?"` narrows by
     * ordering and carries no filter at all — which is why the filter test that used to guard this
     * branch made every fourth-turn follow-up unanswerable. Both are returned as shape-less
     * refinements and the conversation supplies the shape from the previous plan.
     */
    if (isRefinement) {
      return {
        plan: {
          ...emptyPlan('population.list'),
          filters,
          sort: readSort(text, 'population.list'),
          limit: readLimit(text) ?? DEFAULT_LIMIT,
          origin: 'CONVERSATION_REFINEMENT',
        },
        declineReason: null,
        recognised,
        isRefinement: true,
      };
    }
    return { plan: null, declineReason: 'OUT_OF_DOMAIN', recognised, isRefinement };
  }
  recognised.push(`shape ${shape}`);

  /*
   * Naming a geography or a vertical is naming a set.
   *
   * A question can name a geography and a governed condition without containing a plural noun at
   * all, and still be unambiguously about a population — the region is the population. Requiring the
   * word "projects" made the product answerable in the phrasing a specification writer uses and
   * unanswerable in the phrasing an executive uses, which is the wrong way round.
   */
  const namesASet = isPopulationQuestion(text)
    || filters.regions.length > 0 || filters.industries.length > 0
    || filters.accounts.length > 0 || filters.deliveryGroups.length > 0;

  const resolvedShape = requiresProject(shape) && projectId === null && namesASet
    ? POPULATION_COUNTERPART[shape] ?? shape
    : shape;

  if (requiresProject(resolvedShape) && projectId === null) {
    if (isRefinement) {
      return {
        plan: { ...emptyPlan(resolvedShape), filters, origin: 'CONVERSATION_REFINEMENT' },
        declineReason: null, recognised, isRefinement: true,
      };
    }
    return { plan: null, declineReason: 'PROJECT_NOT_NAMED', recognised, isRefinement };
  }
  if (resolvedShape !== shape) recognised.push(`population form of ${shape}`);

  const metricId = METRIC_ID.exec(question)?.[1]?.toUpperCase() ?? null;
  const time = readTime(text);
  const sort = readSort(text, resolvedShape);
  const limit = readLimit(text) ?? defaultLimitFor(resolvedShape);
  const groupBy = readGroup(text, resolvedShape, filters);
  const metrics = readMetrics(text, resolvedShape);

  if (time !== 'current') recognised.push(`time ${time}`);
  if (groupBy !== null) recognised.push(`grouped by ${groupBy}`);

  return {
    plan: {
      shape: resolvedShape,
      scope: projectId !== null ? 'project' : 'portfolio',
      filters: withShapeImpliedFilters(resolvedShape, filters),
      metrics,
      time,
      comparison: readComparison(text),
      sort,
      limit,
      groupBy,
      projectId,
      metricId,
      evidenceQuery: resolvedShape === 'knowledge.document' || resolvedShape === 'project.acceptanceEvidence'
        ? question.trim() : null,
      origin: isRefinement ? 'CONVERSATION_REFINEMENT' : 'DETERMINISTIC',
    },
    declineReason: null,
    recognised,
    isRefinement,
  };
}

function hasAnyFilter(f: PlanFilters): boolean {
  return f.regions.length > 0 || f.industries.length > 0 || f.accounts.length > 0
    || f.customers.length > 0 || f.deliveryGroups.length > 0 || f.systemRag.length > 0
    || f.reportedRag.length > 0 || f.trajectory.length > 0 || f.outlook30.length > 0
    || f.outlook60.length > 0 || f.drivers.length > 0 || f.findings.length > 0
    || f.projectIds.length > 0 || f.thresholds.length > 0;
}

/**
 * Filters a shape implies, added once, here.
 *
 * *"Which Green projects should I worry about?"* carries an unstated `systemRag: GREEN`. Adding it
 * at the shape rather than leaving it to the caller is what stops two callers disagreeing about
 * what an emerging-risk population is — and the added filter is rendered in the scope line, so the
 * reader sees the assumption rather than inheriting it.
 */
function withShapeImpliedFilters(shape: PlanShape, filters: PlanFilters): PlanFilters {
  if (shape === 'population.reportedGreenRisk' && !filters.findings.includes('reportedGreenRisk')) {
    return { ...filters, findings: [...filters.findings, 'reportedGreenRisk'] };
  }
  if (shape === 'population.emergingRisk' && !filters.findings.includes('emergingRisk')) {
    return { ...filters, findings: [...filters.findings, 'emergingRisk'] };
  }
  if (shape === 'population.recovering' && !filters.findings.includes('recovering')) {
    return { ...filters, findings: [...filters.findings, 'recovering'] };
  }
  return filters;
}

function readShape(text: string): PlanShape | null {
  for (const [shape, pattern] of SHAPE_PATTERNS) {
    if (pattern.test(text)) return shape;
  }
  return null;
}

/**
 * Resolves a project reference.
 *
 * An `prj-nnn` identifier is matched by shape and then **still** re-checked downstream against the
 * caller's authorised set, so a guessed id returns the same generic not-found a real out-of-scope
 * one returns. A name is matched only on a full word-sequence containment against the governed
 * project list — never by similarity — so "Atlas" resolves when exactly one project's name contains
 * it and resolves to nothing when two do (ADR-0035 §8 applied to conversation, not just ingestion).
 */
function readProjectId(question: string, vocabulary: PlannerVocabulary): string | null {
  const byId = PROJECT_ID.exec(question)?.[1];
  if (byId !== undefined) return byId.toLowerCase();
  const text = question.toLowerCase();

  /*
   * A full-name match wins outright.
   *
   * The head heuristic below is what lets *"why is Atlas red?"* work, and it is also what broke the
   * full name: several projects in this portfolio share a leading client token, so a question naming
   * one of them completely still matched two candidates and resolved to nothing. Exact containment
   * is unambiguous by construction and is therefore checked first — and when two names both match
   * exactly, the longer one is the more specific and wins.
   */
  const exact = vocabulary.projects
    .filter((p) => text.includes(p.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);
  const exactMatch = exact[0];
  if (exactMatch !== undefined) return exactMatch.id;

  // The distinctive leading token — "Atlas" out of "Atlas Connected Platform R2" — but only when it
  // is long enough to be a name rather than a word, and only when exactly one project claims it.
  // Two projects sharing a leading token is an ambiguity, and guessing between them is how a
  // question about one client's contract gets answered about another's.
  const byHead = vocabulary.projects.filter((p) => {
    const head = p.name.toLowerCase().split(' ')[0] ?? '';
    return head.length >= 5 && new RegExp(`\\b${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
  });
  const only = byHead[0];
  return byHead.length === 1 && only !== undefined ? only.id : null;
}

function readFilters(
  text: string, vocabulary: PlannerVocabulary, recognised: string[],
): PlanFilters {
  const regions = matchVocabulary(text, vocabulary.regions, REGION_SYNONYMS);
  const industries = matchVocabulary(text, vocabulary.industries, INDUSTRY_SYNONYMS);
  const accounts = matchVocabulary(text, vocabulary.accounts, {});
  const customers = matchVocabulary(text, vocabulary.customers, {});
  const deliveryGroups = matchVocabulary(text, vocabulary.deliveryGroups, {});

  for (const r of regions) recognised.push(`region ${r}`);
  for (const i of industries) recognised.push(`industry ${i}`);
  for (const a of accounts) recognised.push(`account ${a}`);

  const systemRag = readBands(text, /\b(?:system|assessed|actually|evidence says)\s+(green|amber|red)\b/g);
  const reportedRag = readBands(text, /\breported\s+(?:as\s+)?(green|amber|red)\b/g);
  const outlook30 = readBands(text, /\b30[- ]day(?:\s+outlook)?\s+(green|amber|red)\b/g);
  const outlook60 = readBands(text, /\b60[- ]day(?:\s+outlook)?\s+(green|amber|red)\b/g);

  // A bare colour with no qualifier means the system's assessment, which is the product's own
  // position. Reading it as the reported band would answer with management's view of itself.
  const bare = systemRag.length === 0 && reportedRag.length === 0
    ? readBands(text, /\b(?:currently\s+)?(green|amber|red)\s+projects?\b/g)
    : [];

  const trajectory = readTrajectory(text);
  const drivers = readDrivers(text);
  const findings = readFindings(text);
  const thresholds = readThresholds(text);
  for (const d of drivers) recognised.push(`driver ${d}`);
  for (const t of thresholds) recognised.push(`${t.metric} ${t.operator} ${t.value}`);

  return {
    ...EMPTY_FILTERS,
    regions, industries, accounts, customers, deliveryGroups,
    systemRag: systemRag.length > 0 ? systemRag : bare,
    reportedRag, trajectory, outlook30, outlook60, drivers, findings, thresholds,
  };
}

function matchVocabulary(
  text: string, values: readonly string[], synonyms: Readonly<Record<string, string>>,
): readonly string[] {
  const found = new Set<string>();
  for (const value of values) {
    const lower = value.toLowerCase();
    if (text.includes(lower)) found.add(value);
  }
  for (const [phrase, governed] of Object.entries(synonyms)) {
    if (!new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\b`).test(text)) continue;
    // A synonym only fires when its governed value is actually present in this portfolio. Otherwise
    // a question about a vertical the demo does not contain would silently filter to nothing and
    // read as "no projects match" rather than "that vertical is not in this portfolio".
    if (values.includes(governed)) found.add(governed);
  }
  return [...found].sort();
}

function readBands(text: string, pattern: RegExp): readonly Band[] {
  const out = new Set<Band>();
  for (const m of text.matchAll(pattern)) {
    const band = m[1]?.toUpperCase();
    if (band === 'GREEN' || band === 'AMBER' || band === 'RED') out.add(band);
  }
  return [...out];
}

function readTrajectory(text: string): readonly TrajectoryState[] {
  const out = new Set<TrajectoryState>();
  if (/\brapidly deteriorat/.test(text)) out.add('RAPIDLY_DETERIORATING');
  else if (/\bdeteriorat|\bworsening\b|\bgetting worse\b|\bdeclining\b/.test(text)) out.add('DETERIORATING');
  if (/\bimproving\b|\brecovering\b|\bturning around\b/.test(text)) out.add('IMPROVING');
  if (/\bstable\b|\bsteady\b|\bflat\b/.test(text)) out.add('STABLE');
  return [...out];
}

function readDrivers(text: string): readonly DriverId[] {
  const out = new Set<DriverId>();
  for (const [driver, phrases] of DRIVER_PHRASES) {
    for (const phrase of phrases) {
      if (text.includes(phrase)) { out.add(driver); break; }
    }
  }
  return [...out];
}

function readFindings(text: string): readonly FindingId[] {
  const out = new Set<FindingId>();
  if (/\breported green|says green|claiming green|status is ahead|green against/.test(text)) {
    out.add('reportedGreenRisk');
  }
  if (/\bemerging risk|green at risk|about to turn|not yet red|quietly/.test(text)) {
    out.add('emergingRisk');
  }
  if (/\brecovering\b|\brecovery\b/.test(text)) out.add('recovering');
  return [...out];
}

/**
 * Reads a numeric condition, e.g. *"lost more than three margin points"*.
 *
 * Only two shapes are recognised and both are anchored to a governed metric. `qty` is used to
 * validate the number is decimal-parseable before it becomes a threshold, so a plan can never carry
 * a value that would fail comparison later — and the value stays a **string** all the way to the
 * comparison, which is what keeps a threshold under the same arithmetic as the figure it filters.
 */
function readThresholds(text: string): readonly ThresholdCondition[] {
  const out: ThresholdCondition[] = [];
  const words: Readonly<Record<string, string>> = {
    one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
    nine: '9', ten: '10',
  };
  const number = '(\\d{1,3}(?:\\.\\d{1,2})?|one|two|three|four|five|six|seven|eight|nine|ten)';

  const marginPoints = new RegExp(
    `\\b(?:lost|dropped|fallen|eroded|down|declined)\\b[^.?]{0,30}?\\b(?:more than|over|at least|above|by)\\s+${number}\\s*(?:margin\\s+)?(?:points?|pts?|%|percentage points?)`,
  ).exec(text) ?? new RegExp(
    `\\bmargin\\b[^.?]{0,30}?\\b(?:more than|over|at least|above)\\s+${number}\\s*(?:points?|pts?|%)`,
  ).exec(text);

  const raw = marginPoints?.[1];
  if (raw !== undefined) {
    const value = words[raw] ?? raw;
    if (isDecimal(value)) {
      out.push({ metric: 'gmErosion', operator: 'gte', value, unit: 'points' });
    }
  }

  const exposure = /\b(?:exposure|at risk|margin at risk)\b[^.?]{0,24}?\b(?:more than|over|above|at least)\s*\$?\s*(\d{1,4}(?:\.\d{1,2})?)\s*(m|million|k|thousand)?\b/
    .exec(text);
  const exposureValue = exposure?.[1];
  if (exposureValue !== undefined && isDecimal(exposureValue)) {
    const unit = exposure?.[2] ?? '';
    const scaled = unit.startsWith('m') ? `${exposureValue}000000`
      : unit.startsWith('k') || unit.startsWith('t') ? `${exposureValue}000`
        : exposureValue;
    // Scaling a decimal string by appending zeros is only correct for integers; a fractional value
    // is normalised through the decimal library rather than by string surgery.
    const normalised = exposureValue.includes('.')
      ? multiplyDecimal(exposureValue, unit.startsWith('m') ? '1000000' : unit.startsWith('k') || unit.startsWith('t') ? '1000' : '1')
      : scaled;
    if (normalised !== null) {
      out.push({ metric: 'gmAtRisk', operator: 'gte', value: normalised, unit: 'currency' });
    }
  }
  return out;
}

function isDecimal(value: string): boolean {
  try {
    qty(value);
    return true;
  } catch {
    return false;
  }
}

/** Scales a decimal figure. Never by appending zeros — that is only correct for integers. */
function multiplyDecimal(value: string, factor: string): string | null {
  try {
    return qMul(qty(value), qty(factor));
  } catch {
    return null;
  }
}

function readTime(text: string): TimeSelector {
  if (/\b60[- ]day|next 60|two months|next quarter\b/.test(text)) return 'day60';
  if (/\b30[- ]day|next 30|next month|coming month\b/.test(text)) return 'day30';
  if (/\b(?:last|previous|prior) (?:review|period|cycle|month|quarter)|since (?:the )?(?:last|previous)\b/.test(text)) {
    return 'previousPeriod';
  }
  return 'current';
}

function readComparison(text: string): QueryPlan['comparison'] {
  if (/\bagainst (?:as[- ]sold|the sold|what we sold)|sold (?:versus|vs)|erosion since sale\b/.test(text)) {
    return 'soldVsCurrent';
  }
  if (/\b(?:since|versus|vs|against) (?:the )?(?:last|previous|prior)\b|what changed\b/.test(text)) {
    return 'currentVsPrior';
  }
  if (/\boutlook|expected to|next \d+ days|forward\b/.test(text)) return 'currentVsOutlook';
  return 'none';
}

function readSort(text: string, shape: PlanShape): SortSelector {
  if (/\bgreatest|largest|biggest|most exposure|highest exposure|greatest economic|most at stake\b/.test(text)) {
    return 'economicExposure';
  }
  if (/\bmost margin|worst margin|biggest erosion|lost the most\b/.test(text)) return 'gmErosion';
  if (/\bfastest|steepest|worst trajectory|deteriorating fastest\b/.test(text)) return 'trajectorySeverity';
  if (/\bsoonest|next|closest deadline|running out of time|this week\b/.test(text)) return 'milestoneProximity';
  if (/\brecover|improving\b/.test(text)) return 'recovery';
  if (/\blargest (?:project|contract)|by (?:tcv|value|contract value)\b/.test(text)) return 'contractValue';
  return shape === 'population.rank' ? 'interventionPriority' : 'economicExposure';
}

function readGroup(
  text: string, shape: PlanShape, filters: PlanFilters,
): GroupSelector | null {
  if (shape !== 'population.concentration' && shape !== 'population.compare') return null;
  if (/\bregion|geograph|where in the world\b/.test(text)) return 'region';
  if (/\bvertical|industr|sector\b/.test(text)) return 'industry';
  if (/\baccount\b/.test(text)) return 'account';
  if (/\bcustomer|client\b/.test(text)) return 'customer';
  if (/\bdelivery group|delivery unit|team\b/.test(text)) return 'deliveryGroup';
  if (/\bdriver|cause|reason|pattern\b/.test(text)) return 'driver';
  /*
   * *"Where is margin erosion concentrated?"* names the condition and asks **where**.
   *
   * Grouping that by driver answers "margin erosion is concentrated in margin erosion" — one bucket,
   * no information. When the question already fixes the condition, the interesting dimension is
   * organisational, and geography is the one an executive acts on first.
   */
  if (shape === 'population.concentration') {
    return filters.drivers.length > 0 || filters.findings.length > 0 ? 'region' : 'driver';
  }
  return 'region';
}

function readMetrics(text: string, shape: PlanShape): readonly MetricSelector[] {
  const out = new Set<MetricSelector>();
  if (/\btcv|contract value\b/.test(text)) out.add('tcv');
  if (/\bsold (?:gm|margin)|as[- ]sold\b/.test(text)) out.add('soldGm');
  if (/\bforecast (?:gm|margin)|current margin\b/.test(text)) out.add('forecastGm');
  if (/\brisk[- ]adjusted\b/.test(text)) out.add('riskAdjustedGm');
  if (/\berosion|lost .* points|margin points\b/.test(text)) out.add('gmErosion');
  if (/\bat risk|exposure|value at risk|economic exposure\b/.test(text)) out.add('gmAtRisk');
  if (/\beac|cost at completion\b/.test(text)) out.add('eac');
  if (/\betc|estimate to complete|cost to complete\b/.test(text)) out.add('etc');
  if (/\bscope|uncommercialised|uncommercialized|unsigned\b/.test(text)) out.add('scopeExposure');
  if (/\bchange request|pending cr|\bcr\b\b/.test(text)) out.add('pendingChange');
  if (/\bmilestone\b/.test(text)) out.add('milestoneStatus');
  if (/\bquality|defect|rework\b/.test(text)) out.add('qualityExposure');

  if (out.size > 0) return [...out];
  // Sensible defaults per shape, so a population answer always carries the figures an executive
  // needs to act rather than only the ones they happened to name.
  if (shape.startsWith('population.')) return ['gmAtRisk', 'forecastGm', 'tcv'];
  return [];
}

function defaultLimitFor(shape: PlanShape): number {
  if (shape === 'population.rank') return 5;
  if (shape === 'population.compare' || shape === 'project.compare') return 5;
  if (shape === 'population.list') return LIMIT_MAX;
  return DEFAULT_LIMIT;
}
