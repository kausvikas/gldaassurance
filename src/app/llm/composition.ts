/**
 * Turning configuration into providers, and a provider into the `NarrationPort` the assistant
 * already understands.
 *
 * `NarrationPort` was declared in Phase 11 and left unimplemented — *"Optional. When absent, the
 * deterministic composer renders and says so."* Phase 13 implements it. Nothing in
 * `src/app/assistant/service.ts` changes shape as a result, which is what that port was for.
 */
import type { AiConfig } from '@platform/config';
import type { Instant } from '@platform/time';
import type { Caveat, ComposerKind, IntentId, MaterialClaim, NarrationPort } from '@contexts/ai-intelligence';
import { AnthropicClaudeProvider } from './anthropic.js';
import { LocalLLMProvider } from './local.js';
import type { LLMProvider, ProviderId } from './provider.js';
import { NoProvider } from './provider.js';
import { POC_EXTERNAL_AI_POLICY, type ExternalAiPolicy, type MaterialInventory } from './policy.js';
import type { RoutedGeneration } from './routing.js';
import { ProviderRouter } from './routing.js';

/** Builds the configured provider. Never guesses: unconfigured means `NoProvider`, loudly. */
export function buildProvider(config: AiConfig, now: () => Instant): {
  readonly provider: LLMProvider; readonly selected: ProviderId;
} {
  if (config.provider === 'claude' && config.anthropic.apiKey !== null) {
    return {
      selected: 'anthropic',
      provider: new AnthropicClaudeProvider({
        apiKey: config.anthropic.apiKey,
        model: config.anthropic.model,
        baseUrl: config.anthropic.baseUrl,
        now,
      }),
    };
  }
  if (config.provider === 'local' && config.local.baseUrl !== null && config.local.model !== null) {
    return {
      selected: 'local',
      provider: new LocalLLMProvider({
        baseUrl: config.local.baseUrl,
        model: config.local.model,
        protocol: config.local.protocol,
        now,
      }),
    };
  }
  return { selected: 'none', provider: new NoProvider() };
}

/**
 * Builds the router, including the external fallback **only** when the deployment has asked for it.
 *
 * The conditional is here rather than inside the router because it is the difference between a rule
 * that is checked and a rule that is structural: with the fallback disabled, no external provider
 * object exists in the router's scope for a future edit to reach.
 */
export function buildRouter(config: AiConfig, now: () => Instant): ProviderRouter {
  const { provider, selected } = buildProvider(config, now);
  const policy: ExternalAiPolicy = {
    ...POC_EXTERNAL_AI_POLICY,
    externalAiAllowed: config.externalAiAllowed,
    localToExternalFallback: config.localToExternalFallback,
  };

  const wantsFallback = selected === 'local'
    && config.localToExternalFallback
    && config.externalAiAllowed
    && config.anthropic.apiKey !== null;

  if (!wantsFallback) return new ProviderRouter({ selected, primary: provider, policy, now });

  const apiKey = config.anthropic.apiKey;
  if (apiKey === null) return new ProviderRouter({ selected, primary: provider, policy, now });

  return new ProviderRouter({
    selected,
    primary: provider,
    externalFallback: new AnthropicClaudeProvider({
      apiKey, model: config.anthropic.model, baseUrl: config.anthropic.baseUrl, now,
    }),
    policy,
    now,
  });
}

/**
 * The narration instruction, per intent.
 *
 * Kept short and governed. The instruction shapes *emphasis* — what an executive should take from
 * this class of finding — and never introduces a fact, because a fact introduced by an instruction
 * would be a fact with no claim behind it, and the grounding validator would (correctly) throw the
 * whole answer away.
 */
const NARRATION_INSTRUCTION: Readonly<Record<string, string>> = {
  'portfolio.reportedGreenRisk':
    'Summarise where reported delivery status and system evidence disagree, and what the disagreement '
    + 'means for the reader.',
  'portfolio.systemEmergingRisk':
    'Summarise which currently-healthy projects the governed outlook expects to turn, and when.',
  'portfolio.ranking':
    'Summarise where leadership attention should go first and why that ordering holds.',
  'portfolio.comparison':
    'Summarise what this population contains and how its members differ, naming the dimension that '
    + 'separates them. Do not recommend where to intervene unless the findings say so.',
  'project.healthExplanation':
    'Explain this project\'s assessed status in terms of the evidence behind it.',
  'project.marginDrivers':
    'Explain what has moved this project\'s margin and in what proportion.',
  'project.burnProgress':
    'Explain the relationship between what has been spent and what has been delivered.',
  'project.scopeLeakage':
    'Explain what scope is being delivered without commercial cover, and what it is worth.',
  'project.confidence':
    'Explain how much of this assessment rests on complete evidence and what is missing.',
  'project.forwardRisk':
    'Explain the governed outlook and the signals driving it. Never state a probability.',
  'project.recovery':
    'Explain what has improved, what has not, and whether the improvement is sufficient.',
  'evidence.lookup': 'Explain where these figures come from.',
  'metric.definition': 'Explain what this metric means in business terms.',
};

const DEFAULT_INSTRUCTION =
  'Summarise these governed delivery findings for an executive reader.';

/**
 * Adapts a router to `NarrationPort`.
 *
 * Returns `''` rather than throwing when narration does not happen, because the assistant service
 * treats empty prose as "the deterministic composer stands" — a behaviour the validator then
 * re-checks on the template anyway. Throwing would make an unavailable model an error condition in
 * a product whose whole design says it is not one.
 */
export function providerNarration(
  router: ProviderRouter,
  inventory: MaterialInventory,
  kind: ComposerKind = 'LLM_NARRATION',
): NarrationPort & { lastDecision: () => RoutedGeneration | null } {
  let last: RoutedGeneration | null = null;
  return {
    kind,
    async narrate(input: {
      readonly intent: IntentId;
      readonly claims: readonly MaterialClaim[];
      readonly caveats: readonly Caveat[];
    }): Promise<string> {
      const routed = await router.generate(inventory, async (provider) => {
        const response = await provider.generate({
          task: 'NARRATE',
          instruction: NARRATION_INSTRUCTION[input.intent] ?? DEFAULT_INSTRUCTION,
          claims: input.claims.map((c) => ({
            claimId: c.claimId, text: c.text, display: c.display,
          })),
          caveats: input.caveats.map((c) => c.text),
          maxOutputTokens: 400,
          timeoutMs: 20_000,
        });
        return { text: response.text, elapsedMs: response.elapsedMs };
      });
      last = routed;
      return routed.text ?? '';
    },
    lastDecision: () => last,
  };
}
