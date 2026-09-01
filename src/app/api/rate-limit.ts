/**
 * Rate limiting.
 *
 * A fixed-window counter per actor per route class. Not a token bucket and not distributed, because
 * the POC is a single process and a sliding-window implementation nobody can reason about is worse
 * than a simple one everybody can. The production requirement — a shared store so limits hold across
 * instances — is recorded as debt rather than implied by this code.
 *
 * Keyed on **actor**, not IP. An IP-keyed limiter behind a corporate NAT limits the whole office to
 * one user's budget, and an attacker with a session does not need a second IP anyway.
 */
import type { ActorId } from '@platform/authz';
import { POC_SECURITY_POLICY, type RateLimitBucket } from '@platform/config';
import { type Instant, msBetween } from '@platform/time';

export interface RateLimitPolicy {
  readonly windowMs: number;
  readonly maxRequests: number;
}

/**
 * `SECURITY_MODEL.md` §7 requires limits on auth and assistant endpoints "at minimum". Reads get a
 * generous limit, writes a tight one, and the assistant the tightest — it is the most expensive
 * endpoint and the one whose abuse looks most like normal use.
 *
 * **The numbers are POC security-policy defaults, not approved production thresholds.** They are
 * defined once in `platform/config` and re-exported here, so a document that quotes "300/min" and a
 * limiter that enforces it cannot drift apart, and so that the label travels with the value.
 */
export const RATE_LIMITS: Readonly<Record<RateLimitBucket, RateLimitPolicy>> =
  POC_SECURITY_POLICY.rateLimits;

export class RateLimitExceeded extends Error {
  constructor(readonly retryAfterMs: number) {
    super('Too many requests');
    this.name = 'RateLimitExceeded';
  }
}

export class FixedWindowRateLimiter {
  readonly #windows = new Map<string, { start: Instant; count: number }>();

  constructor(private readonly now: () => Instant) {}

  /** Throws `RateLimitExceeded` rather than returning false: a limiter you can forget to check. */
  check(actorId: ActorId, bucket: RateLimitBucket): void {
    const policy = RATE_LIMITS[bucket];
    const key = `${actorId}:${bucket}`;
    const now = this.now();
    const window = this.#windows.get(key);
    const elapsed = window === undefined ? Infinity : msBetween(window.start, now);
    if (window === undefined || elapsed >= policy.windowMs) {
      this.#windows.set(key, { start: now, count: 1 });
      return;
    }
    if (window.count >= policy.maxRequests) {
      throw new RateLimitExceeded(policy.windowMs - elapsed);
    }
    window.count += 1;
  }
}
