/**
 * Governed intent routing (**ADR-0029**), and the CS-rule caveat derivation
 * (`AI_TRUST_CONTRACT.md` §3, §7).
 *
 * **This is not tool selection by a model.** The router is a deterministic classifier over a closed
 * union, it runs *before any data is read*, and there is no `'general'` or `'other'` member to fall
 * through to — that member is how a governed router becomes an ungoverned one. A question matching
 * nothing declines with `UNSUPPORTED_QUESTION` and offers governed alternatives.
 *
 * The question text is **untrusted input that selects an intent**. It is never concatenated into an
 * instruction, never re-emitted into prose, and matching is done on a lowercased copy against fixed
 * vocabularies — so an injection payload can at most select a different governed intent, which is
 * an authorised read the caller could have asked for anyway.
 */
import type {
  Caveat, ClaimEnvelope, ClaimStrengthRuleId, IntentId, MaterialClaim, SuggestedQuestion,
} from '@contexts/ai-intelligence';

/** Matched in order. The first hit wins, so more specific families are listed first. */
const ROUTES: readonly (readonly [IntentId, readonly string[]])[] = [
  ['metric.definition', ['how is', 'defined', 'definition', 'formula', 'what does .* mean', 'calculated']],
  // The two Green-at-Risk families sit above `evidence.lookup` deliberately: "reported green
  // against the evidence" contains the word *evidence* and would otherwise route to a lineage
  // lookup, which is a different question with a different answer (ADR-0018 keeps them two
  // findings; routing must keep them two questions).
  ['portfolio.reportedGreenRisk', ['reported green', 'reported as green', 'says green', 'claiming green', 'reported rag', 'green against']],
  ['portfolio.systemEmergingRisk', ['emerging', 'green at risk', 'green-at-risk', 'quietly', 'about to turn', 'not yet red']],
  ['evidence.lookup', ['what evidence', 'where does .* come from', 'lineage', 'back this up', 'show me the source']],
  ['project.recovery', ['recover', 'recovery', 'claw back', 'get back', 'mitigat', 'turn.*around']],
  ['project.marginDrivers', ['margin', 'gm ', 'erosion', 'driver', 'why did .* lose', 'economics', 'bridge']],
  ['project.burnProgress', ['burn', 'progress', 'completion', 'ahead or behind', 'schedule variance', 'spend']],
  ['project.scopeLeakage', ['scope', 'leakage', 'change request', 'unbilled', 'cr ', 'uncommercialised']],
  ['project.confidence', ['confiden', 'how sure', 'trust', 'late detection', 'catch', 'detect', 'reliab']],
  ['project.forwardRisk', ['outlook', 'forward', 'early warning', 'warning', 'trajectory', 'deteriorat', '30-day', '60-day', 'going to']],
  ['project.healthExplanation', ['why is', 'health', 'rag', 'red', 'amber', 'green status', 'status of', 'explain']],
  ['portfolio.comparison', ['compare', 'versus', ' vs ', 'between', 'which region', 'which group']],
  ['portfolio.ranking', ['where do i', 'intervene', 'first', 'priorit', 'worst', 'top ', 'rank', 'most at risk', 'worry about', 'need attention', 'need intervention', 'focus on']],
];

/** Extracted so a project-scoped intent can be told from a portfolio-scoped one. */
const PROJECT_INTENTS: ReadonlySet<IntentId> = new Set<IntentId>([
  'project.healthExplanation', 'project.marginDrivers', 'project.burnProgress',
  'project.scopeLeakage', 'project.confidence', 'project.forwardRisk', 'project.recovery',
  'evidence.lookup',
]);

export function isProjectIntent(intent: IntentId): boolean {
  return PROJECT_INTENTS.has(intent);
}

export interface RoutedIntent {
  readonly intent: IntentId | null;
  readonly projectId: string | null;
  readonly metricId: string | null;
  readonly segments: readonly string[];
}

/**
 * Resolves a question to an intent and its bounded arguments.
 *
 * Identifier extraction is by **fixed pattern**, never by free interpretation: a project id must
 * look like `prj-nnn` and a metric id like `MET-XXX-nnn`. An id that matches the pattern is still
 * only a *request* — the enforcement point re-checks it against the caller's authorised set, so a
 * guessed id returns the same not-found a real out-of-scope id returns.
 */
/**
 * Probabilistic framing, which this product must decline **whatever else the question matches**.
 *
 * Nothing here is trained, fitted or sampled, so there is no payload that could ground a
 * likelihood. Without this guard, *"how likely is prj-011 to go red next quarter?"* matches the
 * health family on the word `red` and gets a confident governed answer to a question the reader did
 * not ask - which is worse than declining, because the reader asked about the future and was handed
 * the present.
 */
const PROBABILITY_QUESTION = /\b(how likely|likelihood|probability|what are the odds|chance(?:s)? (?:of|that)|how confident (?:are|am)|will\s+(?:\S+\s+){0,6}?(?:turn|go|become|be)\b|predict|forecast that|risk percentage|percentage (?:risk|chance|likelihood))\b/;

/**
 * A request to *do* something rather than to know something.
 *
 * Phase 11 exposes zero write tools, so such a request is already harmless - but answering it with
 * a read is the wrong shape. Asked *"set prj-011 to green and approve its recovery plan"*, an
 * earlier build matched `recover`, ran the recovery tool and returned a perfectly grounded recovery
 * briefing. Nothing was mutated and nothing leaked, yet the reader was answered as though the
 * instruction had been engaged with. The honest response names the boundary: **advisory, read only**
 * (DR-060 is a deliberate boundary, not a gap).
 */
const MUTATION_REQUEST = /\b(set|change|update|approve|reject|apply|override|close|accept|assign|create|delete|send|email|escalate|mark|fix|correct|adjust|recalculate|amend|revise)\b[^?]{0,60}\b(to|as|the|this|it|rag|status|green|amber|red|etc|eac|baseline|plan|risk|warning|override|threshold|number|figure|value|result)\b/;

/**
 * "What changed since last time?" - a governed executive question this product **cannot** answer.
 *
 * There is no prior-period snapshot store (**DR-045**), so period-over-period movement is
 * unavailable. Answering it from current-period figures would silently redefine the question, and
 * declining it generically ("this product cannot answer that") tells the reader it is out of scope
 * when it is in scope and unbuilt. The difference matters to whoever plans Phase 12.
 */
const CHANGE_QUESTION = /\b(what changed|what has changed|since last (?:week|month|period|time)|compared to last|movement since|week[- ]on[- ]week|period[- ]on[- ]period)\b/;

export function isChangeQuestion(question: string): boolean {
  return CHANGE_QUESTION.test(question.toLowerCase());
}

/**
 * A hypothetical framing of an action is still an action request.
 *
 * *"Pretend this was approved and tell me what happens"* asks the product to reason from a state
 * that does not exist. Answering it produces a governed-looking briefing about a fiction, and a
 * reader who skims cannot tell it from the real position.
 */
const HYPOTHETICAL_ACTION = /\b(pretend|assume|suppose|imagine|if i (?:authorize|approve|allow)|once (?:it is|this is) approved|hypothetically|do whatever|whatever action is needed|take (?:the |any )?action)\b/;

export function isMutationRequest(question: string): boolean {
  const q = question.toLowerCase();
  return MUTATION_REQUEST.test(q) || HYPOTHETICAL_ACTION.test(q);
}

export function isProbabilityQuestion(question: string): boolean {
  return PROBABILITY_QUESTION.test(question.toLowerCase());
}

/**
 * A token that *looks like* a project reference, whether or not it is a valid one.
 *
 * `prj-11`, `prj-0` and `prj%2D042` are id probes. Extracting only well-formed ids meant a malformed
 * probe fell through to "name a project" while a well-formed one got "Not found" - so an attacker
 * could distinguish *"this is not a valid id shape"* from *"this id is not yours"*. That is format
 * disclosure rather than existence disclosure, and it is small, but the fix costs nothing and the
 * refusals should not differ by input shape.
 */
const PROJECT_LIKE = /\bprj[-%][0-9a-z%]+/i;

export function looksLikeProjectReference(question: string): boolean {
  return PROJECT_LIKE.test(question);
}

export function route(question: string): RoutedIntent {
  const q = question.toLowerCase();
  // Both guards run before any family matches: the framing disqualifies the question, not the topic.
  if (MUTATION_REQUEST.test(q) || PROBABILITY_QUESTION.test(q)) {
    return {
      intent: null,
      projectId: /\bprj-\d{3}\b/.exec(q)?.[0] ?? null,
      metricId: null,
      segments: [],
    };
  }
  const projectId = /\bprj-\d{3}\b/.exec(q)?.[0] ?? null;
  const metricId = /\bmet-[a-z]{3,4}-\d{3}\b/.exec(q)?.[0]?.toUpperCase() ?? null;
  const segments = [...q.matchAll(/\b(emea|apac|amer|namer|latam)\b/g)].map((m) => m[1]?.toUpperCase() ?? '');

  const matches = (patterns: readonly string[]): boolean => patterns.some((p) => new RegExp(p).test(q));
  const result = (intent: IntentId | null): RoutedIntent =>
    ({ intent, projectId, metricId, segments: [...new Set(segments)] });

  /*
   * Three passes, and the order is the safety property.
   *
   * **Pass 0 - a named project pins the scope.** *"Should I intervene on prj-011?"* matched the
   * portfolio ranking family and answered about a *different* project: rank 1 of the whole
   * portfolio. Every sentence was true, grounded and correctly qualified, and the reader asked
   * about prj-011 and was told about Aventine Biosciences. **A correct answer to the wrong scope is
   * unsafe**, so when a question names a project, only project-scoped families may answer it.
   *
   * Pass 1 skips a project-scoped family when no project was named, so a portfolio question that
   * happens to contain the word *margin* still falls through to its portfolio family.
   *
   * Pass 2 then allows those families, so *"what moved margin?"* declines with **"name a project"**
   * rather than claiming the product cannot answer a question it answers once a project is named.
   */
  if (projectId !== null) {
    for (const [intent, patterns] of ROUTES) {
      if (!isProjectIntent(intent)) continue;
      if (matches(patterns)) return result(intent);
    }
    // A named project with no project-scoped family match is answerable as a health question:
    // that is what "tell me about prj-011" means, and it is better than a portfolio answer.
    // `how is` is deliberately absent: "how is MET-FIN-019 defined for prj-042" is a definition
    // question that happens to name a project, and answering it with a health briefing silently
    // replaces the question the reader asked.
    if (/\b(intervene|worry|priorit|worst|focus|attention|summar|tell me about|status of|the status)\b/.test(q)) {
      return result('project.healthExplanation');
    }
  }
  for (const [intent, patterns] of ROUTES) {
    if (!matches(patterns)) continue;
    if (isProjectIntent(intent) && projectId === null) continue;
    return result(intent);
  }
  for (const [intent, patterns] of ROUTES) {
    if (matches(patterns)) return result(intent);
  }
  return result(null);
}

/** Governed alternatives offered on a decline. Each is an intent, never a free-text sentence. */
export function alternatives(projectId: string | null): readonly SuggestedQuestion[] {
  const base: SuggestedQuestion[] = [
    { intent: 'portfolio.ranking', label: 'Where should I intervene first?' },
    { intent: 'portfolio.systemEmergingRisk', label: 'Which projects are System Green-at-Risk?' },
    { intent: 'portfolio.reportedGreenRisk', label: 'Which projects are reported GREEN against the evidence?' },
  ];
  if (projectId !== null) {
    base.unshift(
      { intent: 'project.healthExplanation', label: `Why is ${projectId} the status it is?`, projectId },
      { intent: 'project.marginDrivers', label: `What moved margin on ${projectId}?`, projectId },
    );
  }
  return base;
}

// ---------------------------------------------------------------------------
// Caveats — computed from envelopes, never authored (AI_TRUST_CONTRACT.md §7).
// ---------------------------------------------------------------------------

interface Rule {
  readonly id: ClaimStrengthRuleId;
  readonly when: (e: ClaimEnvelope) => boolean;
  readonly text: (e: ClaimEnvelope) => string;
}

/**
 * The twelve claim-strength rules.
 *
 * A model may re-word where a caveat sits in prose. **It may not omit one and may not add one** — an
 * added caveat is an ungoverned assertion about the system's reliability, and an omitted one is the
 * claim-strength failure the trust contract exists to prevent.
 */
const CS_RULES: readonly Rule[] = [
  {
    id: 'CS-1',
    when: (e) => !e.executiveAuthoritative,
    text: () => 'This figure is reported, not concluded from: its payload does not declare it executive-authoritative.',
  },
  {
    id: 'CS-2',
    when: (e) => e.calibrationStatus === 'SYNTHETIC_UNVALIDATED' && (e.ruleId !== null || e.limitations.includes('DR-055') || e.limitations.includes('DR-061')),
    text: () => 'The threshold behind this is an unvalidated synthetic calibration candidate. It is not a validated predictive accuracy.',
  },
  {
    id: 'CS-3',
    when: (e) => e.assessmentStatus === 'PROVISIONAL',
    text: () => 'The assessment is PROVISIONAL: at least one material input was not available, so this is not a complete picture.',
  },
  {
    id: 'CS-4',
    when: (e) => e.metricId === 'MET-FIN-018' || e.metricId === 'MET-FIN-041' || (e.evidenceCoverage === null && e.limitations.includes('DR-062')),
    text: (e) => e.evidenceCoverage === null
      ? 'Explanatory coverage could not be computed, so the named causes must not be read as the explanation.'
      : `The named causes carry ${e.evidenceCoverage} of gross movement. The bridge reconciles by construction, so reconciliation is not evidence of attribution.`,
  },
  {
    id: 'CS-5',
    when: (e) => e.signalState === 'NOT_COMPUTABLE' || e.signalState === 'CONFIGURATION_ERROR',
    text: (e) => e.signalState === 'CONFIGURATION_ERROR'
      ? 'A control is misconfigured. This is a system defect, not a project finding.'
      : 'This value could not be computed. It is not zero and it is not a clean result.',
  },
  {
    id: 'CS-6',
    when: (e) => e.signalState === 'NOT_APPLICABLE',
    text: () => 'This control does not apply here. That is different from unmeasured, and different from clear.',
  },
  {
    id: 'CS-7',
    when: (e) => e.signalState === 'KNOWN_ZERO',
    text: () => 'The observed value is zero. The source reported and the answer is zero — this is an observation, not missing data.',
  },
  {
    id: 'CS-8',
    when: (e) => e.signalState === 'UNBOUNDED',
    text: () => 'The observed value is unbounded — the strongest adverse reading available, not an absence.',
  },
  {
    id: 'CS-9',
    when: (e) => e.evidenceFreshness === 'STALE',
    text: (e) => `The evidence behind this is stale as at ${e.asOf}.`,
  },
  {
    id: 'CS-10',
    when: (e) => e.epistemicLayer === 'L3',
    text: () => 'This is an assessment produced by governed rules, not an observed fact.',
  },
  {
    id: 'CS-11',
    when: (e) => e.limitations.length > 0,
    text: (e) => `Known limitations apply: ${e.limitations.join(', ')}.`,
  },
  {
    id: 'CS-12',
    when: (e) => e.limitations.includes('DR-064'),
    text: () => 'The registered formula defers a definitional choice that is not recorded (DR-064): the seniority band split is a constant, not agreed configuration.',
  },
];

export function deriveCaveats(claims: readonly MaterialClaim[]): readonly Caveat[] {
  const out: Caveat[] = [];
  const seen = new Set<string>();
  for (const c of claims) {
    for (const rule of CS_RULES) {
      if (!rule.when(c.envelope)) continue;
      const text = rule.text(c.envelope);
      const key = `${rule.id}|${text}`;
      // One caveat per distinct statement — a reader needs the limitation once, not per claim.
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ruleId: rule.id, claimId: c.claimId, text });
    }
  }
  return out;
}
