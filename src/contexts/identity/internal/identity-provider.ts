/**
 * `IdentityProvider` — the seam between "who is this?" and everything else.
 *
 * The POC authenticates against seeded synthetic personas. Production authenticates against
 * corporate OIDC. Those are very different mechanisms and the same *contract*: a verified subject,
 * a set of claims, and an expiry that somebody else decided. `IdentityProvider` is that contract,
 * and `MockIdentityProvider` is one implementation of it — labelled, not disguised.
 *
 * **What the mock deliberately does not do.** It holds no passwords, because a POC password store
 * is a liability with no upside: it would need Argon2id, a rate limiter, a lockout policy and a
 * reset flow, all to protect synthetic personas from an attacker who could equally well read the
 * seed file. Instead it authenticates a *persona selection*, which is what a demo actually needs,
 * and `SECURITY_MODEL.md` §3's credential controls are recorded as the production requirement they
 * are. Pretending otherwise would be the "mocked without being labelled" failure invariant 5 names.
 *
 * Session lifetimes, revocation on grant change, and expiry are **not** mocked — they are the
 * controls a reviewer would actually attack, so they are real and tested.
 */
import type { ActorId, Role, ScopeNode, SessionId } from '@platform/authz';
import { POC_SECURITY_POLICY, type SecurityPolicy } from '@platform/config';
import { type Instant, earlier, instantPlusMs } from '@platform/time';
import type { SessionRecord, User } from '../index.js';

/** What an identity provider returns once it has verified a subject. */
export interface VerifiedSubject {
  readonly actorId: ActorId;
  readonly username: string;
  readonly displayName: string;
  readonly role: Role;
  readonly scope: readonly ScopeNode[];
  /** How the subject was verified. Carried into the audit record, never inferred later. */
  readonly authenticationMethod: 'SYNTHETIC_PERSONA' | 'OIDC' | 'IMPERSONATION';
  /** Present for OIDC: the issuer that asserted this subject. */
  readonly issuer?: string;
}

/**
 * The abstraction every later phase codes against.
 *
 * Production target (`SECURITY_MODEL.md` §3, `PRODUCT_SPEC.md` §4.2): corporate OIDC/OAuth2 SSO with
 * MFA upstream and short-lived tokens. An `OidcIdentityProvider` implements this interface and
 * nothing above it changes — which is the entire reason the interface exists rather than the
 * application layer reading a user table.
 */
export interface IdentityProvider {
  readonly kind: 'SYNTHETIC' | 'OIDC';
  /** Verify a subject. Returns `undefined` for any failure — never a reason (§4.5). */
  verify(credential: string): Promise<VerifiedSubject | undefined>;
  findByActorId(actorId: ActorId): Promise<VerifiedSubject | undefined>;
}

/**
 * Session lifetimes come from the governed security policy, not from a literal here.
 *
 * They are re-exported at these names because `SECURITY_MODEL.md` §3 and the tests speak of them by
 * name, but the value is defined once, in `platform/config`, and is labelled there as a **POC
 * default rather than a corporate standard**. A number that appears in two files is a number that
 * will eventually disagree with itself.
 */
export const SESSION_ABSOLUTE_LIFETIME_MS = POC_SECURITY_POLICY.sessionAbsoluteLifetimeMs;
export const SESSION_IDLE_LIFETIME_MS = POC_SECURITY_POLICY.sessionIdleLifetimeMs;

export type SessionRejection =
  | 'NOT_FOUND'
  | 'REVOKED'
  | 'ABSOLUTE_EXPIRY'
  | 'IDLE_EXPIRY';

/**
 * Server-side session store.
 *
 * Every expiry decision is made here, from the injected clock, against the stored record. Nothing is
 * read from the token: an opaque session id carries no claims, so a client cannot extend its own
 * session or widen its own role by editing anything (`SECURITY_MODEL.md` §3, "enforced server-side").
 */
export class SessionStore {
  readonly #sessions = new Map<string, SessionRecord>();
  #seq = 0;
  readonly #policy: SecurityPolicy;

  /**
   * Takes the policy rather than reading a constant, so a deployment with a different governed
   * window changes configuration, not this class.
   */
  constructor(
    private readonly now: () => Instant,
    policy: SecurityPolicy = POC_SECURITY_POLICY,
  ) {
    this.#policy = policy;
  }

  /** The thresholds this store is enforcing. Exposed so a test asserts policy, not a literal. */
  get policy(): SecurityPolicy { return this.#policy; }

  issue(actorId: ActorId): SessionRecord {
    const issuedAt = this.now();
    this.#seq += 1;
    const record: SessionRecord = {
      sessionId: `ses-${String(this.#seq).padStart(6, '0')}` as SessionId,
      actorId,
      issuedAt,
      absoluteExpiry: instantPlusMs(issuedAt, this.#policy.sessionAbsoluteLifetimeMs),
      idleExpiry: instantPlusMs(issuedAt, this.#policy.sessionIdleLifetimeMs),
    };
    this.#sessions.set(record.sessionId, record);
    return record;
  }

  /**
   * Validate and slide the idle window.
   *
   * Returns a rejection *reason* for the audit log, and the caller returns nothing distinguishable
   * to the client — the reason is why a denial is investigable, not something a probe can read back.
   */
  validate(sessionId: SessionId): { readonly ok: true; readonly record: SessionRecord }
    | { readonly ok: false; readonly reason: SessionRejection } {
    const record = this.#sessions.get(sessionId);
    if (record === undefined) return { ok: false, reason: 'NOT_FOUND' };
    if (record.revokedAt !== undefined) return { ok: false, reason: 'REVOKED' };
    const now = this.now();
    if (now >= record.absoluteExpiry) return { ok: false, reason: 'ABSOLUTE_EXPIRY' };
    if (now >= record.idleExpiry) return { ok: false, reason: 'IDLE_EXPIRY' };

    // Slide idle only — never past the absolute expiry, or an active session is immortal.
    const idleExpiry = earlier(
      instantPlusMs(now, this.#policy.sessionIdleLifetimeMs), record.absoluteExpiry,
    );
    const updated: SessionRecord = { ...record, idleExpiry };
    this.#sessions.set(sessionId, updated);
    return { ok: true, record: updated };
  }

  revoke(sessionId: SessionId): void {
    const record = this.#sessions.get(sessionId);
    if (record === undefined) return;
    this.#sessions.set(sessionId, { ...record, revokedAt: this.now() });
  }

  /** A role or scope change invalidates every active session (`SECURITY_MODEL.md` §3). */
  revokeAllFor(actorId: ActorId): number {
    let n = 0;
    for (const [id, record] of this.#sessions) {
      if (record.actorId === actorId && record.revokedAt === undefined) {
        this.#sessions.set(id, { ...record, revokedAt: this.now() });
        n += 1;
      }
    }
    return n;
  }

  find(sessionId: SessionId): SessionRecord | undefined {
    return this.#sessions.get(sessionId);
  }

  get activeCount(): number {
    return [...this.#sessions.values()].filter((s) => s.revokedAt === undefined).length;
  }
}

/**
 * Seeded-persona provider. **DEMO — SYNTHETIC DATA.**
 *
 * `verify()` accepts a username and returns that persona. That is the whole mechanism, and it is
 * safe only because the personas are synthetic and the deployment is a demo — which is why
 * `kind` is `'SYNTHETIC'` and why the composition root refuses to use it when configured for
 * anything but a demo environment (see `assertDemoEnvironment`).
 */
export class MockIdentityProvider implements IdentityProvider {
  readonly kind = 'SYNTHETIC' as const;
  readonly #byUsername = new Map<string, VerifiedSubject>();
  readonly #byActorId = new Map<string, VerifiedSubject>();

  constructor(users: readonly User[]) {
    for (const u of users) {
      const subject: VerifiedSubject = {
        actorId: u.actorId,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        scope: u.scope,
        authenticationMethod: 'SYNTHETIC_PERSONA',
      };
      this.#byUsername.set(u.username, subject);
      this.#byActorId.set(u.actorId, subject);
    }
  }

  verify(credential: string): Promise<VerifiedSubject | undefined> {
    return Promise.resolve(this.#byUsername.get(credential));
  }

  findByActorId(actorId: ActorId): Promise<VerifiedSubject | undefined> {
    return Promise.resolve(this.#byActorId.get(actorId));
  }
}

/**
 * Refuses to hand a synthetic provider to a production-capable deployment.
 *
 * This is the control that stops the most plausible bad outcome for this codebase: someone runs the
 * POC against a real environment, and a provider that authenticates on a username alone is suddenly
 * the front door. It throws rather than warning, because a warning in a startup log is not a
 * control.
 *
 * **The permitted set is an allow-list drawn from configuration, not a pair of literals.** It reads
 * `syntheticIdentityEnvironments` from the security policy: the environments `platform/config`
 * declares (`dev`, `test`, `staging`, `prod` — the set ADR-0010 proposes), minus the two that are
 * production-capable. An environment name nobody has declared — `"demo"`, `"production"`,
 * `"prod-eu"`, an empty string — is therefore refused rather than accidentally matching, which is
 * what makes this an allow-list rather than a deny-list with a gap in it.
 *
 * The prior implementation permitted the literal `"demo"`, a string `loadConfig` cannot produce, and
 * would have accepted it in preference to `dev`. Tightening to the declared vocabulary is a
 * strengthening: strictly fewer environments now start a credential-free provider.
 */
export function assertDemoEnvironment(
  provider: IdentityProvider,
  environment: string,
  policy: SecurityPolicy = POC_SECURITY_POLICY,
): void {
  const permitted = policy.syntheticIdentityEnvironments as readonly string[];
  if (provider.kind === 'SYNTHETIC' && !permitted.includes(environment)) {
    throw new Error(
      `MockIdentityProvider refuses to start in environment "${environment}". It authenticates on a ` +
      'username with no credential and exists only for the synthetic demo. Permitted environments ' +
      `are ${permitted.join(', ')}. Configure an OIDC provider (SECURITY_MODEL.md §3, DR-023).`,
    );
  }
}
