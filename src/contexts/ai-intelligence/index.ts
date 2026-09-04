/**
 * Public surface — `ai-intelligence`.
 *
 * Owns: intent vocabulary, the claim contract, the answer contract, and the ports the Application
 * layer implements. Tier 4 · Produces L4 narrative over L1–L3 claims · **Depends on no domain
 * context whatsoever** (`architecture/manifest.json`: `mayDependOn: []`, `forbidAllContexts: true`).
 *
 * **Phase 11B implements this** (REQ-AI-001…006). What changed from the Phase 4 stub:
 *
 * > `AuthorisedRetrievalPort.retrieve(question, asOf)` — a **free-text** port returning opaque
 * > strings — is superseded by `AuthorisedToolPort.invoke(ctx, tool, args)` over a **closed union**
 * > of tool ids returning `ClaimEnvelope[]` (**ADR-0029**, resolving DQ-3).
 *
 * A `content: string` cannot carry `metricId`, `signalState`, `assessmentStatus`,
 * `executiveAuthoritative` or `evidenceCoverage`, so every claim-strength rule in
 * `AI_TRUST_CONTRACT.md` §3 would have been unenforceable against it, and the epistemic state
 * algebra that ADR-0026/0027/0028 exist to protect would have been flattened in a single hop —
 * below the model, where nothing can recover the distinction.
 *
 * Three boundaries are expressed in the types rather than in prompt text:
 *
 *   - **`MaterialClaim.epistemicLayer` is `'L1' | 'L2' | 'L3'`. `'L4'` is not representable.** The
 *     assistant transforms L1–L3 into L4 narrative; it cannot promote L4 back (`AI_TRUST_CONTRACT.md`
 *     §1). Prose asserting something no claim carries has no layer to be stamped with.
 *   - **An answer carries `ValueReference`s, never numerals.** "The model never types a digit that
 *     reaches the screen as a fact" (ADR-0004 §4), so a wrong number is not expressible.
 *   - **`Citation` is mandatory.** An answer with no provenance may not be rendered (REQ-AI-002).
 */
import type { EpistemicLayer, RecordRef, ValueReference } from '@platform/provenance';
import type { SignalState } from '@platform/explainability';
import type { Instant } from '@platform/time';
import type { QueryPlan } from './internal/plan.js';

export const CONTEXT_ID = 'ai-intelligence' as const;

// ---------------------------------------------------------------------------
// Intents (ADR-0029) — governed routing, never unrestricted tool selection.
// ---------------------------------------------------------------------------

/**
 * The closed set of executive question families the assistant answers.
 *
 * **A question that matches none of these declines** (`UNSUPPORTED_QUESTION`). It does not
 * improvise a tool call, and there is no "general" or "other" member to fall through to — that
 * member is how a governed router becomes an ungoverned one.
 */
export type IntentId =
  | 'portfolio.reportedGreenRisk'
  | 'portfolio.systemEmergingRisk'
  | 'portfolio.ranking'
  | 'portfolio.comparison'
  | 'project.healthExplanation'
  | 'project.marginDrivers'
  | 'project.burnProgress'
  | 'project.scopeLeakage'
  | 'project.confidence'
  | 'project.forwardRisk'
  | 'project.recovery'
  | 'evidence.lookup'
  | 'metric.definition';

export const ALL_INTENTS: readonly IntentId[] = [
  'portfolio.reportedGreenRisk', 'portfolio.systemEmergingRisk', 'portfolio.ranking',
  'portfolio.comparison', 'project.healthExplanation', 'project.marginDrivers',
  'project.burnProgress', 'project.scopeLeakage', 'project.confidence', 'project.forwardRisk',
  'project.recovery', 'evidence.lookup', 'metric.definition',
] as const;

// ---------------------------------------------------------------------------
// Tools (ADR-0029) — a closed allowlist, each one a projection over an existing ViewId.
// ---------------------------------------------------------------------------

/**
 * The assistant's entire data window.
 *
 * **`audit.events` is deliberately absent.** `ASSURANCE_AUDITOR` holds both `audit.read` and
 * `assistant.use`; routing audit content into narrative prose would move `SECURITY_TELEMETRY` into
 * a medium where its classification cannot be re-checked, widening the deliberately narrow grant of
 * ADR-0016 C-14. That is an architectural exclusion, not an omission.
 */
export type AssistantToolId =
  | 'portfolio.summary.get'
  | 'portfolio.ranking.list'
  | 'portfolio.reportedGreenRisk.list'
  | 'portfolio.systemGreenAtRisk.list'
  | 'portfolio.segments.compare'
  | 'project.executiveHealth.get'
  | 'project.marginDrivers.get'
  | 'project.forwardRisk.get'
  | 'project.recoveryOptions.get'
  | 'project.lateDetection.get'
  | 'evidence.get'
  | 'metric.definition.get'
  // Phase 13 (ADR-0034). The allow-list grows; its closure does not change. Each new tool is still
  // exactly one bounded projection over exactly one existing `ViewId`, so none of them is a new
  // data path and none of them authorises anything.
  | 'portfolio.population.query'
  | 'portfolio.population.aggregate'
  | 'portfolio.concentration.get'
  | 'portfolio.change.get'
  | 'portfolio.recovery.list'
  | 'project.milestones.get'
  | 'project.acceptanceEvidence.get'
  | 'projects.compare'
  | 'knowledge.evidence.get'
  | 'source.provenance.get'
  | 'source.dataQuality.get';

export const ALL_TOOLS: readonly AssistantToolId[] = [
  'portfolio.summary.get', 'portfolio.ranking.list', 'portfolio.reportedGreenRisk.list',
  'portfolio.systemGreenAtRisk.list', 'portfolio.segments.compare', 'project.executiveHealth.get',
  'project.marginDrivers.get', 'project.forwardRisk.get', 'project.recoveryOptions.get',
  'project.lateDetection.get', 'evidence.get', 'metric.definition.get',
  'portfolio.population.query', 'portfolio.population.aggregate', 'portfolio.concentration.get',
  'portfolio.change.get', 'portfolio.recovery.list', 'project.milestones.get',
  'project.acceptanceEvidence.get', 'projects.compare', 'knowledge.evidence.get',
  'source.provenance.get', 'source.dataQuality.get',
] as const;

/**
 * Tool arguments. Note what is **absent**: no predicate, no expression, no field list, no order-by,
 * no raw identifier list, no file path. A caller that can shape a query can eventually shape one you
 * did not intend, and the assistant is the caller least able to be trusted with it
 * (`gateway.ts` header, applied to the component that composes requests from untrusted text).
 */
export interface ToolArgs {
  /** Re-checked against the caller's authorised set by the enforcement point, every time. */
  readonly projectId?: string;
  readonly metricId?: string;
  readonly segmentIds?: readonly string[];
  readonly limit?: number;
  /**
   * The validated plan (Phase 13, ADR-0034).
   *
   * This is the one addition that could have re-opened what ADR-0029 closed, so it is worth being
   * precise about why it does not. The original comment above says a tool takes "no predicate, no
   * expression, no field list" — and a `QueryPlan` is, in effect, a predicate. The difference is
   * that every field of it is drawn from a **closed vocabulary declared in this context**, and
   * `validatePlan` has rejected anything outside it *before* this argument exists. So a tool still
   * cannot be handed something it must interpret: it is handed a finite selection over values this
   * surface already enumerates.
   *
   * Optional, because the twelve Phase 11 tools neither need it nor read it.
   */
  readonly plan?: QueryPlan;
}

// ---------------------------------------------------------------------------
// The claim envelope (ADR-0031).
// ---------------------------------------------------------------------------

export type CalibrationStatus = 'SYNTHETIC_UNVALIDATED' | 'APPROVED';
export type AssessmentStatus = 'COMPLETE' | 'PROVISIONAL' | 'NOT_COMPUTABLE';
export type EvidenceFreshness = 'CURRENT' | 'STALE' | 'UNKNOWN';

/**
 * Uniform qualification travelling with every assistant-consumable value.
 *
 * **Every default is the conservative reading.** ADR-0031 D-3, which is ADR-0028's rule one layer
 * up: an un-migrated producer must *degrade* a claim, never strengthen it. A permissive default
 * would be worse than no envelope at all, because it would look like a control.
 */
export interface ClaimEnvelope {
  readonly metricId: string | null;
  readonly ruleId: string | null;
  readonly version: string;
  readonly epistemicLayer: EpistemicLayer;
  readonly asOf: Instant;
  readonly sourceDomain: string;
  readonly evidenceFreshness: EvidenceFreshness;
  /** `null` triggers CS-4 as if coverage were low. Absence is not reassurance. */
  readonly evidenceCoverage: string | null;
  readonly assessmentStatus: AssessmentStatus;
  readonly signalState: SignalState;
  readonly calibrationStatus: CalibrationStatus;
  /** Default `false`. A missing qualification may never manufacture authority (ADR-0027). */
  readonly executiveAuthoritative: boolean;
  /** Debt ids reachable from this value, attached by lookup so nobody has to remember. */
  readonly limitations: readonly string[];
  readonly syntheticData: true;
}

/** What a tool returns. Never a raw domain object, never an opaque string. */
export interface ToolResult {
  readonly tool: AssistantToolId;
  readonly claims: readonly MaterialClaim[];
  /** Free-text record content a tool legitimately quotes. **Data, never instruction.** */
  readonly untrustedContent: readonly RetrievedFact[];
}

/**
 * Retrieved record content is **data, never instructions** (`SECURITY_MODEL.md` §2 B4). The
 * `untrusted` marker exists so that assembling a prompt from one of these without delimiting it is
 * a visible omission rather than an invisible one.
 */
export interface RetrievedFact {
  readonly ref: RecordRef;
  readonly untrusted: true;
  readonly content: string;
}

/**
 * One groundable assertion.
 *
 * `epistemicLayer` cannot be `'L4'`: generated narrative is not a claim, and the type is the place
 * that says so.
 */
export interface MaterialClaim {
  readonly claimId: string;
  /** The sentence this claim licenses. Prose may re-word it; it may not exceed it. */
  readonly text: string;
  /** The digit, resolved by the application layer — never typed by a model. */
  readonly valueRef: ValueReference | null;
  /** The already-formatted display value the `valueRef` resolves to. */
  readonly display: string | null;
  readonly epistemicLayer: EpistemicLayer;
  readonly envelope: ClaimEnvelope;
  /** Non-empty, or the claim is rejected. Empty evidence is a defect (REQ-DATA-010). */
  readonly groundedBy: readonly RecordRef[];
  /**
   * `true` when every word of `text` was composed here from governed values and fixed wording, with
   * no free text from any record.
   *
   * **Opt-in, and absent means "treat as untrusted"** — the ADR-0031 rule that an unstated
   * qualification must weaken a claim, never strengthen it.
   *
   * It exists because the injection neutraliser is right about retrieved content and wrong about
   * this product's own sentences. *"Total contract value across that population is $451.28M"* matches
   * a shape written to catch a record note asserting a governed economic figure — which is exactly
   * what that shape should catch, and exactly what this sentence is not. Without the distinction the
   * claim was silently deleted and an aggregate answer shipped one figure short, with nothing to
   * show it had been.
   */
  readonly composedFromGovernedValues?: boolean;
}

export interface Citation {
  readonly ref: RecordRef;
  readonly label: string;
}

// ---------------------------------------------------------------------------
// Refusal (§11) — a first-class outcome, never a failure to be papered over.
// ---------------------------------------------------------------------------

/**
 * **`UNAUTHORIZED` and "no such project" must be indistinguishable to the caller.** The reason code
 * is for the audit record; the rendered text is one generic string
 * (`SECURITY_MODEL.md` §4.5).
 */
export type RefusalReason =
  | 'UNAUTHORIZED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'METRIC_NOT_COMPUTABLE'
  | 'EVIDENCE_STALE'
  | 'UNSUPPORTED_QUESTION'
  | 'ADVISORY_ONLY_RESTRICTION';

export interface Refusal {
  readonly reason: RefusalReason;
  /** What the reader sees. Generic for `UNAUTHORIZED`; specific and useful otherwise. */
  readonly message: string;
  /** The governed alternative, where one exists. Never a free-text suggestion. */
  readonly insteadTry: readonly SuggestedQuestion[];
}

// ---------------------------------------------------------------------------
// The answer contract.
// ---------------------------------------------------------------------------

export type ExecutiveAuthority = 'AUTHORITATIVE' | 'QUALIFIED' | 'NOT_AUTHORITATIVE';

/** A follow-up is a governed intent, never a free-text sentence (existence-disclosure channel). */
export interface SuggestedQuestion {
  readonly intent: IntentId;
  readonly label: string;
  readonly projectId?: string;
}

/** One CS-rule firing, computed from an envelope. Never authored by a model. */
export interface Caveat {
  readonly ruleId: ClaimStrengthRuleId;
  readonly claimId: string;
  readonly text: string;
}

export type ClaimStrengthRuleId =
  | 'CS-1' | 'CS-2' | 'CS-3' | 'CS-4' | 'CS-5' | 'CS-6'
  | 'CS-7' | 'CS-8' | 'CS-9' | 'CS-10' | 'CS-11' | 'CS-12';

export interface AssistantResponse {
  /** Verbatim, untrusted, **never re-emitted into prose**. */
  readonly question: string;
  readonly intent: IntentId | null;
  readonly scope: {
    readonly authorisedProjectCount: number;
    readonly populationCount: number;
    readonly scopeLabel: string;
  };
  readonly asOf: Instant;
  /** L4. Validated, and never authoritative on its own. */
  readonly answer: string;
  readonly why: readonly string[];
  readonly materialClaims: readonly MaterialClaim[];
  readonly evidence: readonly Citation[];
  readonly metricRefs: readonly { readonly metricId: string; readonly version: string }[];
  readonly caveats: readonly Caveat[];
  readonly missingEvidence: readonly {
    readonly input: string;
    readonly state: SignalState;
    readonly reason: string;
  }[];
  readonly calibrationStatus: CalibrationStatus;
  readonly assessmentStatus: AssessmentStatus;
  readonly executiveAuthority: ExecutiveAuthority;
  readonly suggestedFollowUps: readonly SuggestedQuestion[];
  readonly refusal?: Refusal;
  /** How the prose was produced. Labelled accurately — a template is never called "AI". */
  readonly composer: ComposerKind;
  readonly syntheticData: true;
}

/**
 * `DETERMINISTIC_COMPOSER` is the floor and is always available; `LLM_NARRATION` is the optional
 * ceiling (ADR-0030). Calling a template "AI" would be the same class of claim-strength failure as
 * an unqualified "0% late detection", so the kind is carried on the response and rendered.
 */
export type ComposerKind = 'DETERMINISTIC_COMPOSER' | 'LLM_NARRATION';

// ---------------------------------------------------------------------------
// Grounding validation (ADR-0030).
// ---------------------------------------------------------------------------

/** The ten detections. Ids are stable because they are audited. */
export type DetectionId =
  | 'D1_UNSUPPORTED_NUMBER'
  | 'D2_UNSUPPORTED_PERCENTAGE'
  | 'D3_UNSUPPORTED_ENTITY'
  | 'D4_UNSUPPORTED_RAG'
  | 'D5_UNSUPPORTED_RANK'
  | 'D6_UNSUPPORTED_TRAJECTORY'
  | 'D7_UNSUPPORTED_CAUSAL_CLAIM'
  | 'D8_UNSUPPORTED_PROBABILITY'
  | 'D9_UNSUPPORTED_RECOVERY_CLAIM'
  | 'D10_UNAUTHORIZED_OBJECT';

export interface ValidationFinding {
  readonly detection: DetectionId;
  /** The offending token. Never the full prose — a rejected generation is not logged (§9). */
  readonly token: string;
}

export interface ValidationVerdict {
  readonly ok: boolean;
  readonly findings: readonly ValidationFinding[];
}

// ---------------------------------------------------------------------------
// Ports. The Application layer injects implementations bound to the caller's context.
// ---------------------------------------------------------------------------

/**
 * The assistant's only window onto data.
 *
 * The Application layer supplies an implementation already bound to the requesting user's
 * authorization context; **nothing here can widen it**, because scope was resolved before this
 * port was constructed. That is what makes AC-6 a real test rather than a claim: revoke a grant and
 * the field is omitted at shaping, so it never reaches a claim, so it cannot reach the answer.
 */
export interface AuthorisedToolPort {
  invoke(tool: AssistantToolId, args: ToolArgs): Promise<ToolResult>;
  /** The caller's resolved set. Used to reject any entity the prose names but retrieval never saw. */
  readonly authorisedProjectIds: readonly string[];
}

/** Optional. When absent, the deterministic composer renders and says so. */
export interface NarrationPort {
  readonly kind: ComposerKind;
  /** Receives claims and caveats only — never operands, never unauthorised fields. */
  narrate(input: {
    readonly intent: IntentId;
    readonly claims: readonly MaterialClaim[];
    readonly caveats: readonly Caveat[];
  }): Promise<string>;
}

/**
 * The evidence plane, as the assistant is allowed to see it (ADR-0035 §2, ADR-0036).
 *
 * Declared structurally rather than by importing `@contexts/knowledge`, because this context may
 * import no other (`forbidAllContexts: true`) — and that restriction is doing real work here, not
 * getting in the way. The assistant must not be able to reach a document object, only the *sentences
 * a retrieval returned and the provenance to check them*. A port typed in terms of the knowledge
 * context's own model would have handed it the document.
 *
 * Note what is absent: no numeric accessor, no field extraction, no "what does the SOW say the
 * acceptance date is" that returns a date. A document can produce a **quotation and a citation**;
 * turning that into a governed fact is a promotion workflow this POC deliberately does not implement.
 */
export interface EvidenceSpan {
  /** Untrusted document text. Data, never instruction (`SECURITY_MODEL.md` §2 B4). */
  readonly text: string;
  readonly documentId: string;
  readonly versionId: string;
  readonly title: string;
  readonly documentClass: string;
  readonly statedVersion: string | null;
  /** `page 14`, or `section 3 of 9` where the parser did not preserve pages. Never inferred. */
  readonly locationLabel: string;
  readonly authority: string;
  readonly dataContext: string;
  readonly sourceId: string;
}

export interface SourceSummary {
  readonly sourceId: string;
  readonly displayName: string;
  readonly kind: string;
  readonly status: string;
  readonly authority: string;
  readonly dataContext: string;
  readonly recordCount: number;
  readonly lastUpdated: string | null;
  readonly conflicts: number;
  readonly isFixture: boolean;
}

export interface DataQualitySummary {
  readonly completeness: string;
  readonly freshness: string;
  readonly authority: string;
  readonly conflicts: string;
  readonly mappingStatus: string;
  readonly validationStatus: string;
  readonly identityResolution: string;
  readonly notes: readonly string[];
}

/**
 * Optional. When absent, evidence questions answer *"no contract evidence has been indexed"* — which
 * is the correct answer, and is the "before" half of the before/after knowledge proof (§63).
 */
export interface KnowledgePort {
  retrieve(query: {
    readonly text: string;
    readonly projectIds: readonly string[];
    readonly limit: number;
  }): readonly EvidenceSpan[];
  sources(): readonly SourceSummary[];
  dataQuality(projectId: string | null): DataQualitySummary;
  /** Records that a retrieval actually informed an answer — the third leg of "grounded" (§7). */
  recordUse(versionIds: readonly string[], question: string): void;
}

export interface AssistantService {
  ask(question: string, asOf: Instant, tools: AuthorisedToolPort): Promise<AssistantResponse>;
}

export {
  type PlanShape, type Band, type TrajectoryState, type DriverId, type FindingId,
  type MetricSelector, type TimeSelector, type ComparisonSelector, type SortSelector,
  type GroupSelector, type ThresholdCondition, type PlanFilters, type PlanScope, type QueryPlan,
  ALL_SHAPES, ALL_BANDS, ALL_TRAJECTORIES, ALL_DRIVERS, ALL_FINDINGS, ALL_METRICS, ALL_TIMES,
  ALL_COMPARISONS, ALL_SORTS, ALL_GROUPS, DRIVER_LABEL, METRIC_LABEL, EMPTY_FILTERS,
  LIMIT_MIN, LIMIT_MAX, DEFAULT_LIMIT, REGION_SYNONYMS, INDUSTRY_SYNONYMS, DRIVER_PHRASES,
  emptyPlan, requiresProject, readLimit, describeScope,
} from './internal/plan.js';

export const IMPLEMENTATION_STATE: string =
  'IMPLEMENTED (Phase 11B) — contract and ports here; orchestration, tools, composer, validator '
  + 'and audit in src/app/assistant (ADR-0029, ADR-0030, ADR-0031). DQ-3 closed.';
