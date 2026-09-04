/**
 * The Anthropic provider — a bounded HTTPS call to the Messages API, and nothing else.
 *
 * Forty lines of request assembly instead of an SDK, for the reason ADR-0032 §4 gives: this runs in
 * the process holding the credential and parsing untrusted uploads, and every package added there is
 * a package that can read both.
 *
 * ## The three rules this file exists to keep
 *
 * 1. **The key is revealed exactly once**, on the line that builds the header. `Secret.reveal()` is
 *    greppable, and `tests/unit/secret-handling.test.ts` asserts the call sites are only these.
 * 2. **Untrusted text is delimited, never concatenated.** The user's question travels inside a
 *    fenced block introduced by an instruction that names it as data. That does not make injection
 *    impossible — nothing at the prompt layer does — it makes it *harmless*, because the model's
 *    output is a plan a validator must accept or prose a grounding validator must license.
 * 3. **Nothing about a failure is echoed.** `HttpFailure` carries a kind and a host; this file adds
 *    a status code and stops. An error path that interpolated the request is the single most common
 *    way an API key reaches a log aggregator.
 */
import { HttpFailure, send } from '@platform/net';
import type { HostPolicy } from '@platform/net';
import type { Secret } from '@platform/secrets';
import type { Instant } from '@platform/time';
import type {
  GenerateRequest, GenerateResponse, LLMProvider, ProviderCapabilities, ProviderHealth,
  ProviderMetadata,
} from './provider.js';
import { ProviderRefused, ProviderUnavailable } from './provider.js';
import { renderPrompt } from './prompt.js';

/** The Messages API version header. Pinned: an unpinned API version is an unannounced upgrade. */
const ANTHROPIC_VERSION = '2023-06-01';

export interface AnthropicOptions {
  readonly apiKey: Secret;
  readonly model: string;
  readonly baseUrl: string;
  readonly now: () => Instant;
}

export class AnthropicClaudeProvider implements LLMProvider {
  readonly #options: AnthropicOptions;
  readonly #policy: HostPolicy;
  #lastHealth: ProviderHealth;

  constructor(options: AnthropicOptions) {
    this.#options = options;
    const host = safeHost(options.baseUrl);
    this.#policy = { allowedHosts: host === null ? [] : [host], requireTls: true };
    this.#lastHealth = {
      state: 'CONFIGURED_UNVERIFIED',
      checkedAt: null,
      detail: 'A credential and model are configured. No call has been made yet.',
      latencyMs: null,
    };
  }

  metadata(): ProviderMetadata {
    return {
      providerId: 'anthropic',
      displayName: 'Claude (Anthropic)',
      model: this.#options.model,
      external: true,
      endpointHost: safeHost(this.#options.baseUrl),
    };
  }

  capabilities(): ProviderCapabilities {
    return { streaming: false, maxOutputTokens: 4096, structuredOutput: true };
  }

  /**
   * A real request, deliberately.
   *
   * A health check that only verified configuration would report `HEALTHY` for an expired key, a
   * revoked key, a wrong base URL and a blocked egress rule. The cheapest possible completion costs
   * a few tokens and is the only thing that distinguishes "configured" from "working" — which is the
   * distinction the whole status vocabulary exists for.
   */
  async healthCheck(): Promise<ProviderHealth> {
    try {
      const response = await this.#post({
        model: this.#options.model,
        max_tokens: 4,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
      }, 8_000);
      const ok = response.status === 200;
      this.#lastHealth = {
        state: ok ? 'HEALTHY' : 'ERROR',
        checkedAt: this.#options.now(),
        detail: ok
          ? `The Messages API responded. Model ${this.#options.model}.`
          : `The Messages API returned status ${String(response.status)}.`,
        latencyMs: response.elapsedMs,
      };
    } catch (e) {
      this.#lastHealth = {
        state: e instanceof HttpFailure && e.kind === 'TIMEOUT' ? 'UNREACHABLE' : 'ERROR',
        checkedAt: this.#options.now(),
        detail: e instanceof HttpFailure
          ? `${e.kind} contacting ${e.host}.`
          : 'The provider call failed before a response was received.',
        latencyMs: null,
      };
    }
    return this.#lastHealth;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const prompt = renderPrompt(request);
    const response = await this.#post({
      model: this.#options.model,
      max_tokens: Math.min(request.maxOutputTokens, this.capabilities().maxOutputTokens),
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      // No `temperature`. The current Claude models reject it as deprecated, and this product does
      // not need it: determinism of the *facts* comes from the claims, and prose variation between
      // runs is expected and harmless because every generation is re-validated against those claims.
    }, request.timeoutMs);

    if (response.status === 401 || response.status === 403) {
      throw new ProviderUnavailable('anthropic', 'the configured credential was rejected');
    }
    if (response.status === 429) {
      throw new ProviderUnavailable('anthropic', 'the provider rate-limited this deployment');
    }
    if (!response.ok) {
      throw new ProviderUnavailable('anthropic', `the provider returned status ${String(response.status)}`);
    }

    const parsed = parseMessagesResponse(response.body);
    if (parsed === null) {
      throw new ProviderRefused('anthropic', 'the response contained no readable text block');
    }
    return {
      text: parsed.text,
      providerId: 'anthropic',
      model: this.#options.model,
      elapsedMs: response.elapsedMs,
      inputTokens: parsed.inputTokens,
      outputTokens: parsed.outputTokens,
      stopReason: parsed.stopReason,
    };
  }

  async #post(body: unknown, timeoutMs: number): Promise<{
    status: number; ok: boolean; body: string; elapsedMs: number;
  }> {
    return send({
      method: 'POST',
      url: `${this.#options.baseUrl.replace(/\/+$/, '')}/v1/messages`,
      headers: {
        'content-type': 'application/json',
        'anthropic-version': ANTHROPIC_VERSION,
        // The one disclosure point for this credential in the entire repository.
        'x-api-key': this.#options.apiKey.reveal(),
      },
      body: JSON.stringify(body),
      budget: { timeoutMs, maxResponseBytes: 512 * 1024 },
    }, this.#policy, this.#options.now);
  }
}

interface ParsedMessage {
  readonly text: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly stopReason: string | null;
}

/**
 * Reads the response defensively.
 *
 * The shape is documented and stable, and this still validates every hop, because the alternative
 * is that a provider-side change surfaces as an unhandled `TypeError` inside a request handler
 * rather than as a governed "the provider returned something unreadable".
 */
export function parseMessagesResponse(raw: string): ParsedMessage | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const content = record['content'];
  if (!Array.isArray(content)) return null;
  // Current models may return a `thinking` block before the text. Only `text` blocks are read;
  // reasoning content is never surfaced, stored or validated (ADR-0030, §26: no chain-of-thought).
  let text = '';
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Record<string, unknown>;
    if (b['type'] === 'text' && typeof b['text'] === 'string') text += b['text'];
  }
  if (text === '') return null;
  const usage = record['usage'];
  const usageRecord = typeof usage === 'object' && usage !== null
    ? usage as Record<string, unknown> : {};
  return {
    text: text.trim(),
    inputTokens: typeof usageRecord['input_tokens'] === 'number' ? usageRecord['input_tokens'] : null,
    outputTokens: typeof usageRecord['output_tokens'] === 'number' ? usageRecord['output_tokens'] : null,
    stopReason: typeof record['stop_reason'] === 'string' ? record['stop_reason'] : null,
  };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
