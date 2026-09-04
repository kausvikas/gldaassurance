/**
 * Public surface — platform/config.
 *
 * Authority: REQ-SEC-008 — "No secret material in the repository; configuration is
 * externalised." Configuration is read once, at composition time, and passed down. No
 * module below reads the environment; that is what makes the demo reproducible and keeps
 * secrets out of domain code.
 */

import { Secret } from '@platform/secrets';

export type Environment = 'dev' | 'test' | 'staging' | 'prod';

export interface AppConfig {
  readonly environment: Environment;
  /** Fixed as-of date for the demo narrative (SYNTHETIC_DATA_SPEC.md §2, AC-7). */
  readonly asOfDate: string;
  /** Present on every screen and export (REQ-UX-005, global invariant 11). */
  readonly demoDataBanner: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export const DEMO_DATA_BANNER = 'DEMO — SYNTHETIC DATA';

const ENVIRONMENTS: readonly Environment[] = ['dev', 'test', 'staging', 'prod'];

// --- Security policy (Phase 5 closure) --------------------------------------

/**
 * Numeric security thresholds, in one governed place.
 *
 * **These are POC security-policy defaults, not a GlobalLogic corporate standard.** No approved
 * enterprise policy establishing these exact values exists in this repository, and nothing here may
 * be represented to a reviewer as one. They are the values Phase 5 chose, recorded as configuration
 * so that changing one is a visible change to a governed artifact rather than an edit to a literal
 * buried in a session store — which is the difference between a policy and a magic number.
 *
 * They live in `platform/config` because that is where configuration is read once and passed down
 * (REQ-SEC-008; ADR-0010 §4 proposes the same shape). Nothing below reads the environment; equally,
 * nothing below should be inventing its own expiry window.
 */
export interface RateLimitPolicyValue {
  readonly windowMs: number;
  readonly maxRequests: number;
}

export type RateLimitBucket = 'auth' | 'read' | 'write' | 'assistant';

export interface SecurityPolicy {
  /** Hard ceiling on a session's life, regardless of activity (`SECURITY_MODEL.md` §3). */
  readonly sessionAbsoluteLifetimeMs: number;
  /** Inactivity window; slides on use, never past the absolute expiry. */
  readonly sessionIdleLifetimeMs: number;
  /** Per-actor request ceilings (`SECURITY_MODEL.md` §7). */
  readonly rateLimits: Readonly<Record<RateLimitBucket, RateLimitPolicyValue>>;
  /**
   * Environments in which a `SYNTHETIC` identity provider may start.
   *
   * The `Environment` values above, minus the two that are production-capable. `staging` and `prod`
   * are deliberately absent: a provider that authenticates on a username with no credential must
   * never become a front door, and an allow-list is the only form of that rule that fails closed for
   * an environment name nobody has thought of yet.
   */
  readonly syntheticIdentityEnvironments: readonly Environment[];
}

/**
 * The POC's security-policy defaults. **Not corporate policy.**
 *
 * `SECURITY_MODEL.md` §3 and §7 describe these values; this is where they are defined. A production
 * deployment replaces this object from its own governed source — which is why the shape is an
 * interface and the consumers take it as a parameter.
 */
export const POC_SECURITY_POLICY: SecurityPolicy = {
  sessionAbsoluteLifetimeMs: 8 * 60 * 60 * 1000,
  sessionIdleLifetimeMs: 30 * 60 * 1000,
  rateLimits: {
    auth: { windowMs: 60_000, maxRequests: 10 },
    read: { windowMs: 60_000, maxRequests: 300 },
    write: { windowMs: 60_000, maxRequests: 30 },
    assistant: { windowMs: 60_000, maxRequests: 20 },
  },
  syntheticIdentityEnvironments: ['dev', 'test'],
};

/** Label carried into every document that quotes one of these numbers. */
export const SECURITY_POLICY_PROVENANCE =
  'POC / initial security-policy defaults — not an approved GlobalLogic enterprise standard' as const;

/**
 * Reads configuration from an injected source (normally `process.env`). Nothing here has a
 * default that would be dangerous if wrong, and no secret is ever read into a value that is
 * logged or serialised.
 */
// --- AI provider and external-processing policy (Phase 13, ADR-0033) -------

export type AiProviderId = 'claude' | 'local' | 'none';
export type LocalProtocol = 'openai-compatible' | 'ollama';

/**
 * Everything the assistant needs to know about where a question may be sent.
 *
 * The provider is selected **once, here**, from the environment. There is deliberately no
 * per-request provider field anywhere in the product: a caller cannot choose where their question
 * goes, and neither can a prompt (ADR-0033 §2). A user-controlled provider switch would be a
 * user-controlled data-egress switch, reachable from untrusted text through the planner.
 */
export interface AiConfig {
  readonly provider: AiProviderId;
  readonly anthropic: {
    readonly apiKey: Secret | null;
    readonly model: string;
    readonly baseUrl: string;
  };
  readonly local: {
    readonly baseUrl: string | null;
    readonly model: string | null;
    readonly protocol: LocalProtocol;
  };
  /**
   * Whether any material may leave this deployment for a hosted model at all.
   *
   * Defaults to **false**. A deployment that has not said yes has said no — the opposite default
   * would mean an operator who configured a key and nothing else had silently authorised egress.
   */
  readonly externalAiAllowed: boolean;
  /**
   * The narrow, explicit local-to-external fallback of ADR-0033 §4. Defaults to false and is
   * meaningless unless `externalAiAllowed` is also true. There is no configuration that produces a
   * silent fallback; this one is audited and rendered.
   */
  readonly localToExternalFallback: boolean;
  /** CORS allow-list for the trusted runtime. Empty means same-origin only (ADR-0032 §6). */
  readonly allowedOrigins: readonly string[];
}

/**
 * The default narration model.
 *
 * A *default*, not a hard-code: `ANTHROPIC_MODEL` overrides it, and the configured value is what is
 * rendered on the AI configuration surface and recorded in every answer's lineage. Narration is a
 * constrained rewriting task over claims the domain already licensed, so the mid-tier model is the
 * right default; nothing about the product's correctness depends on which model is chosen, which is
 * the point of ADR-0033.
 */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5' as const;
export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com' as const;

function boolFlag(source: Readonly<Record<string, string | undefined>>, key: string): boolean {
  const raw = (source[key] ?? '').trim().toLowerCase();
  if (raw === '') return false;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  throw new ConfigError(`${key} must be true or false; received "${raw}".`);
}

/**
 * Reads AI configuration. Fails at start-up on anything ambiguous, with no dangerous default
 * (ADR-0010 §5): a provider selected but not configured is a start-up error, not a runtime surprise
 * discovered by an executive mid-demonstration.
 */
export function loadAiConfig(source: Readonly<Record<string, string | undefined>>): AiConfig {
  const requested = (source['AI_PROVIDER'] ?? 'none').trim().toLowerCase();
  if (requested !== 'claude' && requested !== 'local' && requested !== 'none') {
    throw new ConfigError(`AI_PROVIDER must be claude, local or none; received "${requested}".`);
  }
  const apiKey = Secret.from(source['ANTHROPIC_API_KEY'], 'anthropic');
  const localBaseUrl = (source['LOCAL_LLM_BASE_URL'] ?? '').trim() || null;
  const localModel = (source['LOCAL_LLM_MODEL'] ?? '').trim() || null;
  const protocolRaw = (source['LOCAL_LLM_PROTOCOL'] ?? 'openai-compatible').trim();
  if (protocolRaw !== 'openai-compatible' && protocolRaw !== 'ollama') {
    throw new ConfigError(
      `LOCAL_LLM_PROTOCOL must be openai-compatible or ollama; received "${protocolRaw}".`,
    );
  }

  if (requested === 'claude' && apiKey === null) {
    throw new ConfigError('AI_PROVIDER=claude requires ANTHROPIC_API_KEY to be present.');
  }
  if (requested === 'local' && (localBaseUrl === null || localModel === null)) {
    throw new ConfigError(
      'AI_PROVIDER=local requires LOCAL_LLM_BASE_URL and LOCAL_LLM_MODEL. A local provider that is '
      + 'selected but unreachable must fail here, not fall back to a hosted model (ADR-0033 §3).',
    );
  }

  const externalAiAllowed = boolFlag(source, 'GLDI_EXTERNAL_AI_ALLOWED');
  const localToExternalFallback = boolFlag(source, 'GLDI_LOCAL_TO_EXTERNAL_FALLBACK');
  if (localToExternalFallback && !externalAiAllowed) {
    throw new ConfigError(
      'GLDI_LOCAL_TO_EXTERNAL_FALLBACK cannot be true while GLDI_EXTERNAL_AI_ALLOWED is false. A '
      + 'fallback that transmits where transmission is prohibited is the defect ADR-0033 §4 exists '
      + 'to prevent, so the combination is refused at start-up rather than resolved at run time.',
    );
  }

  return {
    provider: requested,
    anthropic: {
      apiKey,
      model: (source['ANTHROPIC_MODEL'] ?? '').trim() || DEFAULT_ANTHROPIC_MODEL,
      baseUrl: (source['ANTHROPIC_BASE_URL'] ?? '').trim() || DEFAULT_ANTHROPIC_BASE_URL,
    },
    local: { baseUrl: localBaseUrl, model: localModel, protocol: protocolRaw },
    externalAiAllowed,
    localToExternalFallback,
    allowedOrigins: (source['GLDI_ALLOWED_ORIGINS'] ?? '')
      .split(',').map((o) => o.trim()).filter((o) => o !== ''),
  };
}

export function loadConfig(source: Readonly<Record<string, string | undefined>>): AppConfig {
  const environment = source['GLDI_ENV'] ?? 'dev';
  if (!(ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new ConfigError(
      `GLDI_ENV must be one of ${ENVIRONMENTS.join(', ')}; received "${environment}".`,
    );
  }
  const asOfDate = source['GLDI_AS_OF_DATE'];
  if (asOfDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    throw new ConfigError(`GLDI_AS_OF_DATE must be YYYY-MM-DD; received "${asOfDate}".`);
  }
  return {
    environment: environment as Environment,
    // SYNTHETIC_DATA_SPEC.md §2 / PHASE_HANDOFF D-5 fix the demo as-of date.
    asOfDate: asOfDate ?? '2026-08-31',
    demoDataBanner: DEMO_DATA_BANNER,
  };
}
