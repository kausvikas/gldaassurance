/**
 * Provider routing (ADR-0033 §3, §4) — the single most consequential twenty lines in Phase 13.
 *
 * The defect this file exists to make unwritable is one line long, looks like good engineering, and
 * leaves no trace:
 *
 * ```ts
 * try { return await local.generate(r); } catch { return await claude.generate(r); }
 * ```
 *
 * A local-first enterprise deployment that does this has exported its delivery and margin data to a
 * hosted API, and nothing in the response, the log or the answer would say so. It is not caught by
 * review because it reads as resilience.
 *
 * So the rule is structural rather than procedural: `route()` returns **at most one provider**, and
 * a second one is reachable only when a `PolicyDecision` says `PERMITTED` *and* the configuration
 * explicitly enables fallback. There is no catch block here that reaches for another provider,
 * because the function that would need one does not have a second provider in scope.
 *
 * When the selected provider is unavailable, the outcome is not an error. It is
 * `DETERMINISTIC_COMPOSER` plus a rendered reason — the governed answer still exists, which is the
 * strongest available demonstration that the model was never in the calculation path.
 */
import type { Instant } from '@platform/time';
import type { LLMProvider, ProviderId } from './provider.js';
import { ProviderUnavailable } from './provider.js';
import type { ExternalAiPolicy, MaterialInventory, PolicyDecision } from './policy.js';
import { evaluateExternalTransmission } from './policy.js';

export type RoutingOutcome =
  /** The selected provider ran and produced text. */
  | 'PROVIDER_USED'
  /** Configuration names no provider. Expected, not an error. */
  | 'NO_PROVIDER_CONFIGURED'
  /** The selected provider was unreachable or refused. **Nothing else was tried.** */
  | 'PROVIDER_UNAVAILABLE'
  /** Policy prohibited transmitting this request's material to the selected provider. */
  | 'POLICY_PROHIBITED'
  /** Local was unavailable and the explicit, policy-permitted fallback carried the request. */
  | 'EXTERNAL_FALLBACK_USED';

export interface RoutingDecision {
  readonly outcome: RoutingOutcome;
  readonly providerId: ProviderId;
  readonly model: string | null;
  readonly external: boolean;
  readonly policy: PolicyDecision;
  /** Rendered verbatim where the composer kind is shown. */
  readonly explanation: string;
  readonly decidedAt: Instant;
}

export interface RouterOptions {
  readonly selected: ProviderId;
  readonly primary: LLMProvider;
  /**
   * The external provider, present **only** when the deployment has configured the fallback.
   *
   * Typed as optional and supplied by the composition root, so a deployment with fallback disabled
   * has no external provider object in scope at all. The rule is enforced by what exists, not by
   * what is checked.
   */
  readonly externalFallback?: LLMProvider;
  readonly policy: ExternalAiPolicy;
  readonly now: () => Instant;
}

export interface RoutedGeneration {
  readonly decision: RoutingDecision;
  readonly text: string | null;
  readonly elapsedMs: number | null;
}

export class ProviderRouter {
  readonly #options: RouterOptions;

  constructor(options: RouterOptions) {
    this.#options = options;
  }

  /** What the AI configuration surface renders. No secret, no endpoint path, no key digest. */
  describe(): {
    readonly selected: ProviderId;
    readonly model: string | null;
    readonly external: boolean;
    readonly fallbackConfigured: boolean;
    readonly policyStatement: string;
  } {
    const meta = this.#options.primary.metadata();
    return {
      selected: this.#options.selected,
      model: meta.model,
      external: meta.external,
      fallbackConfigured: this.#options.externalFallback !== undefined,
      policyStatement: this.#options.policy.statement,
    };
  }

  /**
   * Runs one generation through the selected provider, or explains why it did not.
   *
   * Never throws for a provider problem. A caller that had to catch would eventually catch in a
   * place where the obvious recovery is to try the other provider, and this design exists to make
   * sure no such place is ever written.
   */
  async generate(
    inventory: MaterialInventory,
    run: (provider: LLMProvider) => Promise<{ text: string; elapsedMs: number }>,
  ): Promise<RoutedGeneration> {
    const decidedAt = this.#options.now();
    const meta = this.#options.primary.metadata();

    if (this.#options.selected === 'none') {
      return this.#refuse('NO_PROVIDER_CONFIGURED', decidedAt, {
        outcome: 'PROHIBITED', code: 'EXTERNAL_DISABLED',
        reason: 'No provider is configured.',
      }, 'No AI provider is configured. The answer was composed by the governed deterministic composer.');
    }

    // The policy is evaluated *before* the call, against the material actually present, and only
    // when the provider would take material outside the boundary. A local provider is not exempt
    // from having a decision recorded — it is exempt from being prohibited by an egress rule.
    const policy = meta.external
      ? evaluateExternalTransmission(this.#options.policy, inventory)
      : {
        outcome: 'PERMITTED' as const, code: 'ALLOWED' as const,
        reason: 'The selected provider runs inside the deployment boundary; no material leaves it.',
      };

    if (policy.outcome === 'PROHIBITED') {
      return this.#refuse('POLICY_PROHIBITED', decidedAt, policy, policy.reason);
    }

    try {
      const result = await run(this.#options.primary);
      return {
        decision: {
          outcome: 'PROVIDER_USED',
          providerId: meta.providerId,
          model: meta.model,
          external: meta.external,
          policy,
          explanation: `Narrated by ${meta.displayName}${meta.model === null ? '' : ` (${meta.model})`}.`,
          decidedAt,
        },
        text: result.text,
        elapsedMs: result.elapsedMs,
      };
    } catch (e) {
      const reason = e instanceof ProviderUnavailable ? e.reason : 'the provider call did not complete';
      return this.#afterPrimaryFailure(inventory, run, decidedAt, reason);
    }
  }

  /**
   * The only path to a second provider, and it is gated three times.
   *
   * Fallback requires: an external provider object to have been supplied at all (configuration),
   * `localToExternalFallback` to be true (explicit intent), and the policy to permit *this
   * request's* material to leave (per-request evaluation). Failing any of the three produces a
   * deterministic answer that says the local provider was unavailable — never a hosted call.
   */
  async #afterPrimaryFailure(
    inventory: MaterialInventory,
    run: (provider: LLMProvider) => Promise<{ text: string; elapsedMs: number }>,
    decidedAt: Instant,
    reason: string,
  ): Promise<RoutedGeneration> {
    const fallback = this.#options.externalFallback;
    const unavailable = `The ${this.#options.selected} AI provider is unavailable (${reason}). `
      + 'The answer was composed by the governed deterministic composer. '
      + 'No part of this request was sent to any other provider.';

    if (fallback === undefined || !this.#options.policy.localToExternalFallback) {
      return this.#refuse('PROVIDER_UNAVAILABLE', decidedAt, {
        outcome: 'PROHIBITED', code: 'EXTERNAL_DISABLED',
        reason: 'No external fallback is configured for this deployment.',
      }, unavailable);
    }

    const policy = evaluateExternalTransmission(this.#options.policy, inventory);
    if (policy.outcome === 'PROHIBITED') {
      return this.#refuse('PROVIDER_UNAVAILABLE', decidedAt, policy,
        `${unavailable} An external fallback is configured, but policy prohibited it for this `
        + `request: ${policy.reason}`);
    }

    const meta = fallback.metadata();
    try {
      const result = await run(fallback);
      return {
        decision: {
          outcome: 'EXTERNAL_FALLBACK_USED',
          providerId: meta.providerId,
          model: meta.model,
          external: meta.external,
          policy,
          explanation:
            `The local provider was unavailable (${reason}). This deployment explicitly permits `
            + `falling back to ${meta.displayName}, and policy permitted this request's material to `
            + 'be processed externally. That transmission is recorded in the audit log.',
          decidedAt,
        },
        text: result.text,
        elapsedMs: result.elapsedMs,
      };
    } catch {
      return this.#refuse('PROVIDER_UNAVAILABLE', decidedAt, policy,
        `${unavailable} The configured external fallback was also unavailable.`);
    }
  }

  #refuse(
    outcome: RoutingOutcome, decidedAt: Instant, policy: PolicyDecision, explanation: string,
  ): RoutedGeneration {
    const meta = this.#options.primary.metadata();
    return {
      decision: {
        outcome,
        providerId: meta.providerId,
        model: meta.model,
        external: meta.external,
        policy,
        explanation,
        decidedAt,
      },
      text: null,
      elapsedMs: null,
    };
  }
}
