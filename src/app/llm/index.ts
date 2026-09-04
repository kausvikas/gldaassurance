/**
 * The LLM boundary (ADR-0033).
 *
 * Everything the assistant knows about models is here, and it is four things: a port, two
 * implementations, a policy and a router. Nothing above this directory imports a provider, and
 * nothing below it knows what a claim is.
 */
export {
  type ProviderId, type ProviderState, type ProviderHealth, type ProviderMetadata,
  type ProviderCapabilities, type NarratableClaim, type GenerationTask, type GenerateRequest,
  type GenerateResponse, type LLMProvider,
  ProviderUnavailable, ProviderRefused, NoProvider,
} from './provider.js';

export { AnthropicClaudeProvider, type AnthropicOptions, parseMessagesResponse } from './anthropic.js';
export {
  LocalLLMProvider, type LocalOptions, type LocalProtocol, readOllama, readOpenAiCompatible,
} from './local.js';
export { type RenderedPrompt, renderPrompt, fenceUntrusted } from './prompt.js';
export {
  type MaterialClass, type ExternalAiPolicy, type MaterialInventory, type PolicyOutcome,
  type PolicyDecision,
  POC_EXTERNAL_AI_POLICY, EXTERNAL_AI_POLICY_PROVENANCE, evaluateExternalTransmission,
} from './policy.js';
export {
  type RoutingOutcome, type RoutingDecision, type RouterOptions, type RoutedGeneration,
  ProviderRouter,
} from './routing.js';

export { buildProvider, buildRouter, providerNarration } from './composition.js';
