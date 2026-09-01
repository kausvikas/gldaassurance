/**
 * Public surface — the Delivery Intelligence Assistant (Phase 11B).
 *
 * Assembled from five parts, each of which can be reviewed on its own:
 *
 * | Part | File | What a reviewer should check |
 * | --- | --- | --- |
 * | Tools | `tools.ts`, `project-tools.ts` | Every tool goes through `ApplicationGateway.request()` |
 * | Envelope | `envelope.ts` | Every default is the reading that *weakens* the claim |
 * | Routing + caveats | `intent.ts` | Closed union, no fall-through member; caveats computed |
 * | Composer | `compose.ts` | No arithmetic, no formatting of figures, no model |
 * | Validator | `validator.ts` | Deterministic, blocking, no bypass, no retry |
 * | Orchestrator | `service.ts` | Authorization at steps 1–3, model at 11 |
 */
export type { ToolContext } from './tools.js';
export { MAX_COMPARE_SEGMENTS, MAX_TOOL_ROWS, TOOL_VIEW, TOOL_STATE, ToolDenied } from './tools.js';
export { LIMITATIONS_FOR, POC_CALIBRATION, envelope, isFullyAuthoritative } from './envelope.js';
export {
  alternatives, deriveCaveats, isChangeQuestion, isMutationRequest, isProbabilityQuestion,
  isProjectIntent, looksLikeProjectReference, route,
} from './intent.js';
export type { RoutedIntent } from './intent.js';
export {
  COMPOSER_STATE, INTENT_CLAIMS, REQUIRED_CLAIMS, authorityOf, claimsFor, compose, missingEvidence,
  missingRequiredClaims, why, worstStatus,
} from './compose.js';
export { NEUTRALISED, VALIDATOR_STATE, containsMarkup, neutraliseRetrievedText, validate } from './validator.js';
export { inputStateSentence } from './project-tools.js';
export type { AskOptions } from './service.js';
export { ASSISTANT_DECLARATION, INTENT_TOOLS, SERVICE_STATE, ask } from './service.js';
export type { ToolInvocation } from './port.js';
export { GatewayToolPort, PORT_STATE, auditAssistantQuery, questionDigest } from './port.js';

export const ASSISTANT_STATE: string =
  'IMPLEMENTED (Phase 11B) — 12 read-only tools, 13 governed intents, deterministic composition, '
  + 'blocking grounding validation, ASSISTANT_QUERY audit. Zero write tools (DR-060 preserved).';
