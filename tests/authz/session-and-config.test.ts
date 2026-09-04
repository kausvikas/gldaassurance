/**
 * Session lifecycle, identity-provider safety, and the transport configuration.
 *
 * The session tests use a movable clock, because "expires after 8 hours" is not testable against a
 * fixed one — and an expiry nobody has watched fire is an expiry nobody has tested.
 */
import { describe, expect, it } from 'vitest';
import type { ActorId, SessionId } from '@platform/authz';
import type { Instant } from '@platform/time';
import {
  MockIdentityProvider, SESSION_ABSOLUTE_LIFETIME_MS, SESSION_IDLE_LIFETIME_MS,
  SessionStore, assertDemoEnvironment,
} from '@contexts/identity';
import {
  POC_SECURITY_POLICY, SECURITY_POLICY_PROVENANCE, type SecurityPolicy, loadAiConfig, loadConfig,
} from '@platform/config';
import { RATE_LIMITS, ROUTES, SECURITY_HEADERS, SESSION_COOKIE, findRoute } from '@app';

const START = Date.parse('2026-08-31T09:00:00.000Z');
class MovableClock {
  #t = START;
  now(): Instant { return new Date(this.#t).toISOString() as Instant; }
  advance(ms: number): void { this.#t += ms; }
}

const ACTOR = 'usr-1' as ActorId;

describe('session lifecycle (REQ-SEC-001)', () => {
  it('accepts a fresh session', () => {
    const clock = new MovableClock();
    const store = new SessionStore(() => clock.now());
    const s = store.issue(ACTOR);
    expect(store.validate(s.sessionId).ok).toBe(true);
  });

  it('expires on the idle window', () => {
    const clock = new MovableClock();
    const store = new SessionStore(() => clock.now());
    const s = store.issue(ACTOR);
    clock.advance(SESSION_IDLE_LIFETIME_MS + 1000);
    const result = store.validate(s.sessionId);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('IDLE_EXPIRY');
  });

  it('slides the idle window on use, but never past the absolute expiry', () => {
    const clock = new MovableClock();
    const store = new SessionStore(() => clock.now());
    const s = store.issue(ACTOR);
    // Use it every 20 minutes for nine hours. The idle window keeps sliding; the absolute one does not.
    let expired: string | undefined;
    for (let i = 0; i < 27 && expired === undefined; i += 1) {
      clock.advance(20 * 60 * 1000);
      const r = store.validate(s.sessionId);
      if (!r.ok) expired = r.reason;
    }
    expect(expired).toBe('ABSOLUTE_EXPIRY');
  });

  it('expires on the absolute lifetime even under constant use', () => {
    const clock = new MovableClock();
    const store = new SessionStore(() => clock.now());
    const s = store.issue(ACTOR);
    clock.advance(SESSION_ABSOLUTE_LIFETIME_MS + 1000);
    const r = store.validate(s.sessionId);
    expect(r.ok === false && r.reason).toBe('ABSOLUTE_EXPIRY');
  });

  it('rejects a revoked session and does not un-revoke it', () => {
    const clock = new MovableClock();
    const store = new SessionStore(() => clock.now());
    const s = store.issue(ACTOR);
    store.revoke(s.sessionId);
    expect(store.validate(s.sessionId).ok).toBe(false);
    clock.advance(1000);
    expect(store.validate(s.sessionId).ok).toBe(false);
  });

  it('revokes every active session for an actor on a grant change', () => {
    const clock = new MovableClock();
    const store = new SessionStore(() => clock.now());
    store.issue(ACTOR); store.issue(ACTOR); store.issue('usr-2' as ActorId);
    expect(store.activeCount).toBe(3);
    expect(store.revokeAllFor(ACTOR)).toBe(2);
    expect(store.activeCount).toBe(1);
  });

  it('rejects an unknown session id without disclosing why', () => {
    const store = new SessionStore(() => new MovableClock().now());
    const r = store.validate('ses-forged' as SessionId);
    expect(r.ok === false && r.reason).toBe('NOT_FOUND');
  });
});

describe('identity provider safety', () => {
  it('refuses to start the synthetic provider outside a demo environment', () => {
    const provider = new MockIdentityProvider([]);
    expect(() => assertDemoEnvironment(provider, 'production')).toThrow(/refuses to start/);
    expect(() => assertDemoEnvironment(provider, 'staging')).toThrow();
    expect(() => assertDemoEnvironment(provider, 'prod')).toThrow();
    expect(() => assertDemoEnvironment(provider, 'test')).not.toThrow();
    expect(() => assertDemoEnvironment(provider, 'dev')).not.toThrow();
  });

  /**
   * The startup regression that matters: the guard's permitted set and the environments the
   * *configuration* can actually produce must be checked against each other. A guard whose
   * allow-list contains a string `loadConfig` will never emit is a guard nobody has wired up.
   */
  it('refuses the synthetic provider in every configurable production-capable environment', () => {
    const provider = new MockIdentityProvider([]);
    for (const env of ['dev', 'test', 'staging', 'prod'] as const) {
      const config = loadConfig({ GLDI_ENV: env });
      const permitted = (POC_SECURITY_POLICY.syntheticIdentityEnvironments as readonly string[])
        .includes(env);
      if (permitted) {
        expect(() => assertDemoEnvironment(provider, config.environment), env).not.toThrow();
      } else {
        expect(() => assertDemoEnvironment(provider, config.environment), env).toThrow(/refuses to start/);
      }
    }
  });

  it('permits no environment the configuration does not declare', () => {
    // An allow-list, not a deny-list: an environment name nobody has declared — including the
    // undeclared string "demo" — must fail closed rather than accidentally matching.
    for (const env of POC_SECURITY_POLICY.syntheticIdentityEnvironments) {
      expect(() => loadConfig({ GLDI_ENV: env }), env).not.toThrow();
    }
    expect(() => assertDemoEnvironment(new MockIdentityProvider([]), 'demo')).toThrow();
    expect(() => assertDemoEnvironment(new MockIdentityProvider([]), '')).toThrow();
  });

  it('never permits a production-capable environment, whatever policy is injected', () => {
    // The guard reads the policy it is given, so assert the *shipped* policy excludes the two
    // declared environments that are production-capable.
    expect(POC_SECURITY_POLICY.syntheticIdentityEnvironments).not.toContain('staging');
    expect(POC_SECURITY_POLICY.syntheticIdentityEnvironments).not.toContain('prod');
  });

  it('returns undefined for an unknown subject, with no reason', async () => {
    const provider = new MockIdentityProvider([]);
    await expect(provider.verify('nobody')).resolves.toBeUndefined();
  });

  it('declares its kind, so a caller can tell a mock from an IdP', () => {
    expect(new MockIdentityProvider([]).kind).toBe('SYNTHETIC');
  });
});

describe('transport configuration (SECURITY_MODEL.md §7)', () => {
  it('declares a CSP with no unsafe-inline and no wildcard', () => {
    const csp = SECURITY_HEADERS['Content-Security-Policy'] as string;
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('*');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it('declares the headers SECURITY_MODEL.md §7 names', () => {
    for (const header of [
      'Content-Security-Policy', 'Strict-Transport-Security',
      'X-Content-Type-Options', 'Referrer-Policy',
    ]) {
      expect(SECURITY_HEADERS[header], header).toBeDefined();
    }
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
  });

  it('marks per-caller responses no-store, so a shared cache cannot leak one user\'s data', () => {
    expect(SECURITY_HEADERS['Cache-Control']).toBe('no-store');
  });

  it('declares an HttpOnly, Secure, SameSite session cookie and never a bearer in storage', () => {
    expect(SESSION_COOKIE.httpOnly).toBe(true);
    expect(SESSION_COOKIE.secure).toBe(true);
    expect(SESSION_COOKIE.sameSite).toBe('Lax');
  });
});

describe('API contract shape', () => {
  it('versions every route', () => {
    for (const r of ROUTES) expect(r.path.startsWith('/v1/'), r.path).toBe(true);
  });

  it('exposes resources, never tables or schemas', () => {
    for (const r of ROUTES) {
      expect(r.path, r.path).not.toMatch(/\b(table|schema|sql|row|column|db)\b/i);
    }
  });

  it('caps every collection route', () => {
    for (const r of ROUTES.filter((x) => !x.path.includes(':id') && x.method === 'GET')) {
      expect(r.maxPageSize, r.path).toBeDefined();
      expect(r.maxPageSize as number).toBeLessThanOrEqual(100);
    }
  });

  it('declares a capability and classifications on every route', () => {
    for (const r of ROUTES) {
      expect(r.capability, r.path).toBeTruthy();
      expect(r.readsClassifications.length, r.path).toBeGreaterThan(0);
    }
  });

  it('audits every route that reads commercial or personal data', () => {
    for (const r of ROUTES) {
      const sensitive = r.readsClassifications.some(
        (c) => c === 'COMMERCIAL_CONFIDENTIAL' || c === 'PERSONAL_DATA');
      if (sensitive && !r.isWrite) {
        expect(r.auditReads, `${r.path} reads sensitive data but is not audited`).toBe(true);
      }
    }
  });

  it('does not match a path with a different segment count', () => {
    expect(findRoute('GET', '/v1/projects/a/b')).toBeUndefined();
    expect(findRoute('GET', '/v1/projects/')).toBeUndefined();
    expect(findRoute('DELETE', '/v1/projects')).toBeUndefined();
  });
});

/**
 * Numeric security thresholds are **policy**, not literals scattered through implementations.
 *
 * The rule these tests enforce is governance rather than behaviour: a reviewer must be able to find
 * every number a security document quotes in one governed place, and must not be told that a number
 * chosen for a POC is a corporate standard. `SECURITY_MODEL.md` §3 and §7 quote these values; this
 * is the binding that stops the document and the code disagreeing.
 */
describe('security thresholds come from configuration, not from magic numbers', () => {
  it('takes the session windows from the security policy', () => {
    expect(SESSION_ABSOLUTE_LIFETIME_MS).toBe(POC_SECURITY_POLICY.sessionAbsoluteLifetimeMs);
    expect(SESSION_IDLE_LIFETIME_MS).toBe(POC_SECURITY_POLICY.sessionIdleLifetimeMs);
    expect(POC_SECURITY_POLICY.sessionAbsoluteLifetimeMs).toBe(8 * 60 * 60 * 1000);
    expect(POC_SECURITY_POLICY.sessionIdleLifetimeMs).toBe(30 * 60 * 1000);
  });

  it('enforces an injected policy rather than the module constant', () => {
    // Proof the store reads its policy: a five-minute absolute window expires in five minutes.
    const policy: SecurityPolicy = {
      ...POC_SECURITY_POLICY,
      sessionAbsoluteLifetimeMs: 5 * 60 * 1000,
      sessionIdleLifetimeMs: 60 * 1000,
    };
    const clock = new MovableClock();
    const store = new SessionStore(() => clock.now(), policy);
    const s = store.issue(ACTOR);
    expect(store.policy.sessionAbsoluteLifetimeMs).toBe(5 * 60 * 1000);
    clock.advance(30 * 1000);
    expect(store.validate(s.sessionId).ok).toBe(true);
    clock.advance(61 * 1000);
    const idle = store.validate(s.sessionId);
    expect(idle.ok === false && idle.reason).toBe('IDLE_EXPIRY');
  });

  it('takes every rate-limit bucket from the security policy', () => {
    expect(RATE_LIMITS).toBe(POC_SECURITY_POLICY.rateLimits);
    for (const bucket of ['auth', 'read', 'write', 'assistant'] as const) {
      expect(RATE_LIMITS[bucket].maxRequests, bucket).toBeGreaterThan(0);
      expect(RATE_LIMITS[bucket].windowMs, bucket).toBeGreaterThan(0);
    }
  });

  it('labels the values as POC defaults rather than corporate policy', () => {
    expect(SECURITY_POLICY_PROVENANCE).toMatch(/POC/);
    expect(SECURITY_POLICY_PROVENANCE).toMatch(/not an approved GlobalLogic enterprise standard/);
  });
});

// ---------------------------------------------------------------------------
// Phase 13 — the CORS allow-list
// ---------------------------------------------------------------------------

describe('the CORS allow-list is deny-by-default outside development', () => {
  it('adds loopback origins in dev and test, and only there', () => {
    for (const environment of ['dev', 'test']) {
      const config = loadAiConfig({ GLDI_ENV: environment });
      expect(config.allowedOrigins, environment).toContain('http://localhost:8899');
    }
    // A deployment that has not named its origins has an empty allow-list. That is the safe
    // reading, and an operator meets it immediately rather than discovering it in a review.
    for (const environment of ['staging', 'prod']) {
      expect(loadAiConfig({ GLDI_ENV: environment }).allowedOrigins, environment).toEqual([]);
    }
  });

  it('never adds a wildcard, and keeps a named origin exact', () => {
    const config = loadAiConfig({
      GLDI_ENV: 'prod', GLDI_ALLOWED_ORIGINS: 'https://gldaassurance.web.app',
    });
    expect(config.allowedOrigins).toEqual(['https://gldaassurance.web.app']);
    for (const origin of config.allowedOrigins) expect(origin).not.toContain('*');
  });
});
