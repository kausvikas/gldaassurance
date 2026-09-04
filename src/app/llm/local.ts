/**
 * The local inference provider (ADR-0033 §1).
 *
 * Speaks two protocols by configuration — OpenAI-compatible `/v1/chat/completions` (llama.cpp,
 * vLLM, LM Studio, Ollama's compatibility endpoint) and Ollama's native `/api/chat` — because those
 * two cover essentially every runtime an enterprise actually stands up inside its own boundary, and
 * because tying Delivery Intelligence to one local model or one server would defeat the point of
 * having the provider at all.
 *
 * ## What this provider will not do
 *
 * It will not pretend. If the runtime is not configured, `healthCheck` reports `NOT_CONFIGURED` and
 * `generate` refuses. If it is configured and unreachable, it reports `UNREACHABLE` and refuses.
 * **In neither case does anything reach for the hosted provider** — that decision does not live
 * here, and the router that owns it has no branch that can be taken without an explicit policy
 * (ADR-0033 §3). A local-first deployment that silently retried against a hosted API on timeout
 * would have exported the customer's delivery and margin data, and nothing in the answer would say
 * so.
 *
 * ## Quality is not a correctness question
 *
 * Small local models follow instructions less reliably than hosted ones, so a local deployment sees
 * more prose rejected by the grounding validator and more answers rendered by the deterministic
 * composer. That shows up honestly as `composer: DETERMINISTIC_COMPOSER` — not as a worse answer,
 * because the facts never came from the model in the first place.
 */
import { HttpFailure, send } from '@platform/net';
import type { HostPolicy } from '@platform/net';
import type { Instant } from '@platform/time';
import type {
  GenerateRequest, GenerateResponse, LLMProvider, ProviderCapabilities, ProviderHealth,
  ProviderMetadata,
} from './provider.js';
import { ProviderRefused, ProviderUnavailable } from './provider.js';
import { renderPrompt } from './prompt.js';

export type LocalProtocol = 'openai-compatible' | 'ollama';

export interface LocalOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly protocol: LocalProtocol;
  readonly now: () => Instant;
}

export class LocalLLMProvider implements LLMProvider {
  readonly #options: LocalOptions;
  readonly #policy: HostPolicy;
  #lastHealth: ProviderHealth;

  constructor(options: LocalOptions) {
    this.#options = options;
    const host = safeHost(options.baseUrl);
    this.#policy = {
      allowedHosts: host === null ? [] : [host],
      // TLS is required for anything that is not loopback. A local runtime on another machine is a
      // network hop like any other, and "it's internal" is not an encryption strategy.
      requireTls: true,
    };
    this.#lastHealth = {
      state: 'CONFIGURED_UNVERIFIED',
      checkedAt: null,
      detail: `Configured for ${options.protocol} at ${host ?? 'an unreadable URL'}. No call made yet.`,
      latencyMs: null,
    };
  }

  metadata(): ProviderMetadata {
    return {
      providerId: 'local',
      displayName: `Local inference (${this.#options.protocol})`,
      model: this.#options.model,
      external: false,
      endpointHost: safeHost(this.#options.baseUrl),
    };
  }

  capabilities(): ProviderCapabilities {
    return {
      streaming: false,
      maxOutputTokens: 2048,
      // Conservatively false: many small local models emit prose around their JSON, and the planner
      // uses this to decide whether to consult a model at all. Assuming structured output and
      // discovering otherwise costs a rejected plan on every ambiguous question.
      structuredOutput: false,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const url = this.#options.protocol === 'ollama'
      ? `${this.#base()}/api/tags`
      : `${this.#base()}/v1/models`;
    try {
      const response = await send({
        method: 'GET', url, headers: { accept: 'application/json' },
        budget: { timeoutMs: 5_000, maxResponseBytes: 256 * 1024 },
      }, this.#policy, this.#options.now);
      const listed = response.ok && response.body.includes(this.#options.model);
      this.#lastHealth = {
        state: response.ok ? 'HEALTHY' : 'ERROR',
        checkedAt: this.#options.now(),
        detail: !response.ok
          ? `The runtime returned status ${String(response.status)}.`
          : listed
            ? `The runtime is serving ${this.#options.model}.`
            : `The runtime responded, but ${this.#options.model} was not in its model list. `
              + 'Requests will fail until the model is pulled or the configuration is corrected.',
        latencyMs: response.elapsedMs,
      };
    } catch (e) {
      this.#lastHealth = {
        state: 'UNREACHABLE',
        checkedAt: this.#options.now(),
        detail: e instanceof HttpFailure
          ? `${e.kind} contacting ${e.host}. No request was sent to any other provider.`
          : 'The local runtime could not be reached. No request was sent to any other provider.',
        latencyMs: null,
      };
    }
    return this.#lastHealth;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const prompt = renderPrompt(request);
    const maxTokens = Math.min(request.maxOutputTokens, this.capabilities().maxOutputTokens);

    const { url, body } = this.#options.protocol === 'ollama'
      ? {
        url: `${this.#base()}/api/chat`,
        body: {
          model: this.#options.model,
          stream: false,
          options: { temperature: 0, num_predict: maxTokens },
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        },
      }
      : {
        url: `${this.#base()}/v1/chat/completions`,
        body: {
          model: this.#options.model,
          stream: false,
          temperature: 0,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        },
      };

    let response;
    try {
      response = await send({
        method: 'POST', url,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        budget: { timeoutMs: request.timeoutMs, maxResponseBytes: 512 * 1024 },
      }, this.#policy, this.#options.now);
    } catch (e) {
      const detail = e instanceof HttpFailure ? e.kind.toLowerCase().replace('_', ' ') : 'unreachable';
      throw new ProviderUnavailable('local', `the local runtime is ${detail}`);
    }

    if (!response.ok) {
      throw new ProviderUnavailable('local', `the local runtime returned status ${String(response.status)}`);
    }
    const text = this.#options.protocol === 'ollama'
      ? readOllama(response.body)
      : readOpenAiCompatible(response.body);
    if (text === null) {
      throw new ProviderRefused('local', 'the runtime returned no readable message content');
    }
    return {
      text,
      providerId: 'local',
      model: this.#options.model,
      elapsedMs: response.elapsedMs,
      inputTokens: null,
      outputTokens: null,
      stopReason: null,
    };
  }

  #base(): string {
    return this.#options.baseUrl.replace(/\/+$/, '');
  }
}

export function readOpenAiCompatible(raw: string): string | null {
  const payload = safeJson(raw);
  if (payload === null) return null;
  const choices = payload['choices'];
  if (!Array.isArray(choices)) return null;
  const first = choices[0];
  if (typeof first !== 'object' || first === null) return null;
  const message = (first as Record<string, unknown>)['message'];
  if (typeof message !== 'object' || message === null) return null;
  const content = (message as Record<string, unknown>)['content'];
  return typeof content === 'string' && content.trim() !== '' ? content.trim() : null;
}

export function readOllama(raw: string): string | null {
  const payload = safeJson(raw);
  if (payload === null) return null;
  const message = payload['message'];
  if (typeof message !== 'object' || message === null) return null;
  const content = (message as Record<string, unknown>)['content'];
  return typeof content === 'string' && content.trim() !== '' ? content.trim() : null;
}

function safeJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
