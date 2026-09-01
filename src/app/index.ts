/**
 * Public surface — Application layer.
 *
 * This is the entire API the Presentation layer may see. The architecture gate permits
 * `@app` and rejects any deeper import, so a component cannot reach a domain context, a
 * repository, or a seed file (ADR-0001 §Decision 5; architecture/manifest.json).
 *
 * **STUB — use cases arrive with their surfaces in Phases 5 and 7-11.** What exists now is
 * the layering contract: authorization enforcement, the request context, and the DTO
 * primitives that carry provenance and decimal-safe money across the boundary.
 */
export type { RequestContext, CapabilityDeclaration } from './authorization/enforcement.js';
export {
  AuthorisedRequest, AuthorizationDenied, EnforcementPoint,
} from './authorization/enforcement.js';

// --- Field-level response shaping (Phase 5) ----------------------------------
export type {
  Disposition, FieldClassificationMap, FieldPolicy, ShapeResult,
} from './authorization/field-policy.js';
export {
  MisplacedSecurityTelemetry, REDACTION_PLACEHOLDER, UnclassifiedField, classify, shape,
} from './authorization/field-policy.js';

// --- Versioned API contract and pipeline (Phase 5) ---------------------------
export type { RouteDefinition } from './api/contract.js';
export {
  API_VERSION, DEFAULT_PAGE_SIZE, MAX_FILTER_VALUES, MAX_PAGE_SIZE,
  ROUTES, SECURITY_HEADERS, SESSION_COOKIE, findRoute, pathParam,
} from './api/contract.js';
export type { ApiRequest, ApiResponse, Handler, HandlerInput, HandlerResult } from './api/dispatcher.js';
export { Dispatcher } from './api/dispatcher.js';
export type { PageRequest, Validator } from './api/validation.js';
export {
  ID_PATTERN, ValidationError, boundedInteger, boundedString, filterValues,
  identifier, oneOf, pageRequest, rejectUnknownFields,
} from './api/validation.js';
export type { RateLimitPolicy } from './api/rate-limit.js';
export { FixedWindowRateLimiter, RATE_LIMITS, RateLimitExceeded } from './api/rate-limit.js';

// --- Lineage and freshness (Phase 5) -----------------------------------------
export type {
  FreshnessState, LineageReport, MetricLineage, MetricLineageInput, SourceObservation, SourceStatus,
} from './lineage/lineage-service.js';
export { buildLineageReport, classifySource, worstOf } from './lineage/lineage-service.js';

// --- Portfolio Command Center (Phase 7) --------------------------------------
export type {
  BubbleDto, CommandCenterInput, CommandCenterProject, CommandCenterView, DeltaDto,
  EpistemicTreatment, EvidenceDto, EvidenceLineDto, ExecutiveRowDto, FilterDefinitionDto,
  FilterOptionDto, GreenAtRiskDriverDto, GreenAtRiskPanelDto, KpiDto, NarrativeDto,
  PopulationPolicy,
} from './portfolio/command-center.js';
export {
  COMMAND_CENTER_STATE, FIXED_BID_POPULATION, buildCommandCenter, formatMoneyCompact,
  formatPercentagePoints, formatRatio, formatWeeks,
} from './portfolio/command-center.js';

// --- Project Executive Health (Phase 8) --------------------------------------
export type {
  ComparisonRowDto, ConfidenceDto, DimensionDto, ExecutiveSummaryDto, FinancialLineDto,
  HeaderDto, MilestoneDto, ObservedSignals, ProjectExecutiveHealthInput,
  ProjectExecutiveHealthView, ProjectIdentity, SignalLineDto, SoldBaseline, StatusConflictDto,
  VerdictDto,
} from './project/executive-health.js';
export { buildProjectExecutiveHealth } from './project/executive-health.js';

// --- Margin & Driver Intelligence (Phase 9) ----------------------------------
export type {
  BridgeStepDto, DriverRowDto, FigureDto, MarginIntelligenceInput, MarginIntelligenceView,
  PortfolioDriversDto, RiskLine, RiskRowDto, ScenarioDto, TrendPoint, TrendRowDto,
} from './margin/margin-intelligence.js';
export { buildMarginIntelligence } from './margin/margin-intelligence.js';

// --- Forward Risk, Early Warning & Recovery (Phase 10) -----------------------
export type {
  ForwardRiskInput, ForwardRiskView, OutlookRowDto, RecoveryActionDto, SignalRowDto,
} from './risk/forward-risk.js';
export { SIGNAL_ORDER_NOTE, buildForwardRisk, plotSeverity, severityRank } from './risk/forward-risk.js';

// --- ApplicationGateway — the Phase 7 interaction seam (DR-041, ADR-0020) ----
export type {
  ApplicationGateway, FilterIntent, SortIntent, ViewId, ViewRequest,
} from './gateway.js';
export { GATEWAY_STATE, UnknownView, VIEW_ROUTES, toApiRequest } from './gateway.js';

export type { UseCase, ApplicationResponse } from './use-case.js';

// --- Configuration the Presentation layer is permitted to read (REQ-UX-005) -----
// The demo marker crosses to the UI as a constant so no component ever types it. The G-DEMO
// source gate enforces that; this re-export is what makes complying possible, since
// `presentation` may import `@app` and nothing else.
export type { AppConfig, Environment } from '@platform/config';
export { DEMO_DATA_BANNER } from '@platform/config';

export type { ProvenanceDto, RatioDto } from './dto/provenance-dto.js';
export { toProvenanceDto, toRatioDto, toMoneyDto } from './dto/provenance-dto.js';

// --- MetricCalculationService (Phase 4) --------------------------------------
export type { ProjectAssessment, ProjectAssessmentRequest } from './metrics/metric-calculation-service.js';
export { assessProject, ratioValue } from './metrics/metric-calculation-service.js';

// --- Delivery Intelligence Assistant (Phase 11B) -----------------------------
export type { AskOptions, ToolInvocation } from './assistant/index.js';
export type {
  AssistantResponse, AssistantToolId, Caveat, ClaimEnvelope, IntentId, MaterialClaim,
  RefusalReason, SuggestedQuestion, ValidationVerdict,
} from '@contexts/ai-intelligence';
export {
  ASSISTANT_DECLARATION, ASSISTANT_STATE, GatewayToolPort, INTENT_CLAIMS, INTENT_TOOLS,
  MAX_COMPARE_SEGMENTS, MAX_TOOL_ROWS, REQUIRED_CLAIMS, TOOL_VIEW, ToolDenied, ask, auditAssistantQuery,
  alternatives, authorityOf, claimsFor, compose, containsMarkup, deriveCaveats, inputStateSentence, envelope,
  isChangeQuestion, isFullyAuthoritative, isMutationRequest, isProbabilityQuestion, isProjectIntent, missingEvidence,
  missingRequiredClaims, neutraliseRetrievedText, questionDigest, route, validate,
  why, worstStatus,
} from './assistant/index.js';

export const APPLICATION_LAYER_STATE = 'Layering contract plus the Phase 4 MetricCalculationService. Authorised use-case surfaces land Phase 5+.' as const;
