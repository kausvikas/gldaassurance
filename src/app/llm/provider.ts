/**
 * The `LLMProvider` port (ADR-0033 §1).
 *
 * Assistant code depends on this interface and never on a provider SDK — there is no SDK, because
 * ADR-0032 §4 keeps the process that holds the credential dependency-free, and because an SDK's
 * types leak into application code and make the port a fiction.
 *
 * ## What a provider is allowed to be handed
 *
 * `GenerateRequest` carries an instruction, a set of already-licensed **claims**, and a set of
 * caveats. It cannot carry a domain object, a raw record, a document body, or a figure the caller
 * was not authorised for, because none of those is representable in its type. That is the mechanism
 * behind ADR-0033 §6: provider choice is a low-stakes decision precisely because the model never
 * sees the sensitive substrate, only sentences the domain has already decided are true and
 * disclosable.
 *
 * ## What a provider is never asked to do
 *
 * There is no tool-calling surface here, no function schema, no `tools` parameter. A model that can
 * call a tool is a model that chooses reads; ADR-0029 rejected that and ADR-0034 kept the rejection.
 * The model's most powerful action in this product is to *propose a typed plan*, which a validator
 * must then accept — and a proposal is data, not authority.
 */
import type { Instant } from '@platform/time';

export type ProviderId = 'anthropic' | 'local' | 'none';

/**
 * How a provider is currently doing, as a fact rather than a hope.
 *
 * `CONFIGURED_UNVERIFIED` exists so that "we have a key" is never rendered as "it works". The only
 * way to reach `HEALTHY` is a `healthCheck` that actually completed against the endpoint.
 */
export type ProviderState =
  | 'HEALTHY'
  | 'CONFIGURED_UNVERIFIED'
  | 'NOT_CONFIGURED'
  | 'UNREACHABLE'
  | 'ERROR';

export interface ProviderHealth {
  readonly state: ProviderState;
  readonly checkedAt: Instant | null;
  /** Plain language. Never a URL with a key in it, never a header, never a stack trace. */
  readonly detail: string;
  readonly latencyMs: number | null;
}

export interface ProviderMetadata {
  readonly providerId: ProviderId;
  readonly displayName: string;
  readonly model: string | null;
  /** Whether using this provider transmits material outside the deployment boundary. */
  readonly external: boolean;
  /** Host only. Never the full endpoint, never credentials. Rendered on the config surface. */
  readonly endpointHost: string | null;
}

export interface ProviderCapabilities {
  readonly streaming: boolean;
  readonly maxOutputTokens: number;
  /** Whether the provider reliably returns parseable JSON when asked. Drives planner use. */
  readonly structuredOutput: boolean;
}

/** A claim the model is permitted to re-word. `text` is the ceiling: prose may not exceed it. */
export interface NarratableClaim {
  readonly claimId: string;
  readonly text: string;
  readonly display: string | null;
}

export type GenerationTask = 'NARRATE' | 'PLAN';

export interface GenerateRequest {
  readonly task: GenerationTask;
  /** The governed instruction. Authored here, never assembled from user or retrieved text. */
  readonly instruction: string;
  readonly claims: readonly NarratableClaim[];
  readonly caveats: readonly string[];
  /**
   * The user's question, for `PLAN` only.
   *
   * Untrusted, and carried in its own field rather than concatenated into `instruction` so that the
   * provider implementation is the thing that decides how to delimit it — and so a reader of this
   * type can see at a glance which field is hostile.
   */
  readonly untrustedQuestion?: string;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
}

export interface GenerateResponse {
  readonly text: string;
  readonly providerId: ProviderId;
  readonly model: string;
  readonly elapsedMs: number;
  /** Reported by the provider where it reports them. Used for cost guards, never for billing. */
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly stopReason: string | null;
}

export class ProviderUnavailable extends Error {
  constructor(readonly providerId: ProviderId, readonly reason: string) {
    super(`The ${providerId} provider is unavailable: ${reason}`);
    this.name = 'ProviderUnavailable';
  }
}

export class ProviderRefused extends Error {
  constructor(readonly providerId: ProviderId, readonly reason: string) {
    super(`The ${providerId} provider refused the request: ${reason}`);
    this.name = 'ProviderRefused';
  }
}

export interface LLMProvider {
  metadata(): ProviderMetadata;
  capabilities(): ProviderCapabilities;
  healthCheck(): Promise<ProviderHealth>;
  generate(request: GenerateRequest): Promise<GenerateResponse>;
}

/**
 * The provider that is always available and always honest about being a provider that does nothing.
 *
 * Used when no model is configured. It does not silently degrade quality — it refuses, and the
 * caller falls back to the deterministic composer and *says so on the response*. The alternative,
 * a provider that quietly returns the template, would make `composer: LLM_NARRATION` a lie.
 */
export class NoProvider implements LLMProvider {
  metadata(): ProviderMetadata {
    return {
      providerId: 'none',
      displayName: 'No AI provider configured',
      model: null,
      external: false,
      endpointHost: null,
    };
  }

  capabilities(): ProviderCapabilities {
    return { streaming: false, maxOutputTokens: 0, structuredOutput: false };
  }

  healthCheck(): Promise<ProviderHealth> {
    return Promise.resolve({
      state: 'NOT_CONFIGURED',
      checkedAt: null,
      detail: 'No provider is configured. Answers are composed by the governed deterministic composer.',
      latencyMs: null,
    });
  }

  generate(): Promise<GenerateResponse> {
    return Promise.reject(new ProviderUnavailable('none', 'no provider is configured'));
  }
}
