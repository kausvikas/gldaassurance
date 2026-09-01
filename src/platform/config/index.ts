/**
 * Public surface — platform/config.
 *
 * Authority: REQ-SEC-008 — "No secret material in the repository; configuration is
 * externalised." Configuration is read once, at composition time, and passed down. No
 * module below reads the environment; that is what makes the demo reproducible and keeps
 * secrets out of domain code.
 */

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
