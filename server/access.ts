/**
 * Public access control (§11, §12).
 *
 * ## What was wrong
 *
 * The runtime shipped with no caller authentication at all. `POST /api/session` issued a token to
 * anyone who asked, tokens were sequential (`ses-000001`, `ses-000002`), and every route accepted
 * them — so any internet caller could run Assistant compute, upload files and consume parser CPU on
 * a billed service. The synthetic *persona* mechanism looked like authentication and is not: it
 * resolves **what a caller may see** once you already know who they are, and it was being asked to
 * decide **whether they get in**. Those are different questions and conflating them is how a
 * demo becomes an open compute endpoint.
 *
 * ## What this is, and what it deliberately is not
 *
 * A demo access code the caller types, exchanged server-side for a signed, expiring session token.
 * That is the smallest control that meets every requirement in §12:
 *
 *   - identity is validated **server-side** — the token is an HMAC the server computes and checks;
 *   - an unauthenticated API request is rejected before any work is done;
 *   - **no shared secret reaches JavaScript** — the code is typed by a person and exchanged over
 *     TLS; the page ships nothing that would let an attacker mint a token;
 *   - there is no client-side "authenticated" flag to flip, because the client holds only an opaque
 *     token it cannot forge;
 *   - a persona in a query string grants nothing: the persona is inside the signed token.
 *
 * It is **not** GlobalLogic SSO, and nothing here should be described as such. A production
 * deployment replaces `verifyCode` and `issue` with an identity provider and keeps the rest: the
 * routes ask `authenticate()` for a caller, and what satisfies that is a composition-time decision.
 *
 * ## Why HMAC rather than a session store
 *
 * The runtime is stateless and may run several instances. A server-side session map would mean a
 * token minted on one instance is unknown to the next — exactly the durability defect this release
 * exists to close, reintroduced in the auth layer. A signed token is verifiable by any instance with
 * the same secret and needs no storage at all.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Instant } from '@platform/time';

export interface AccessConfig {
  /** The code a caller types. Absent means the API is closed rather than open. */
  readonly demoAccessCode: string | null;
  /** Signing key for session tokens. Absent means one is generated per process. */
  readonly sessionSigningKey: string;
  /** How long a session lasts. Short: a demo session is a sitting, not a subscription. */
  readonly sessionLifetimeMs: number;
  /**
   * Whether asking a question needs the code.
   *
   * Off by default, and the default is the safe one: a deployment that has not said "open this"
   * is closed. When on, an anonymous visitor receives an `ask` session — enough to use the
   * Assistant, never enough to write. Ingestion is unaffected and always needs the code, because
   * an upload consumes parser CPU and durable storage that somebody is paying for.
   */
  readonly openAssistant: boolean;
}

/**
 * What a session is allowed to do, carried **inside the signature**.
 *
 * `full` is what an access code buys. `ask` is what an anonymous visitor gets when the deployment
 * has opened the Assistant: questions, and nothing that writes.
 *
 * It lives in the token rather than in a check beside it for the same reason the persona does — a
 * capability the caller could state per request is a capability the caller could raise per request.
 * The routes ask the token what it may do; there is no other answer available to them.
 */
export type Capability = 'ask' | 'full';

export interface Caller {
  readonly capability: Capability;
  readonly persona: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  /** Stable per session. Rate limits and audit attribute to this, never to an IP. */
  readonly callerId: string;
}

export type AuthOutcome =
  | { readonly ok: true; readonly caller: Caller }
  | { readonly ok: false; readonly reason: 'MISSING' | 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' };

/**
 * Reads access configuration.
 *
 * **A missing access code closes the API rather than opening it.** The opposite default is how a
 * misconfigured deployment becomes an anonymous one, and the failure is silent — everything works,
 * for everybody. A deployment that has not set a code answers every API request with not-found, and
 * an operator discovers that in seconds.
 */
export function loadAccessConfig(
  source: Readonly<Record<string, string | undefined>>,
): AccessConfig {
  const code = (source['GLDI_DEMO_ACCESS_CODE'] ?? '').trim();
  const key = (source['GLDI_SESSION_KEY'] ?? '').trim();
  return {
    demoAccessCode: code === '' ? null : code,
    /*
     * A per-process key when none is configured.
     *
     * Tokens then stop working when an instance is replaced, which is visible and annoying rather
     * than insecure — the right way round. A weak *known* default would be worse than either,
     * because it would look configured.
     */
    sessionSigningKey: key === '' ? randomBytes(32).toString('hex') : key,
    sessionLifetimeMs: 8 * 60 * 60 * 1000,
    openAssistant: (source['GLDI_OPEN_ASSISTANT'] ?? '').trim().toLowerCase() === 'true',
  };
}

/** Constant-time comparison. A code checked with `===` leaks its prefix through timing. */
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    // Still compare, against a copy of itself, so the early return does not itself leak length.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export class AccessControl {
  constructor(
    private readonly config: AccessConfig,
    private readonly now: () => Instant,
  ) {}

  /** Whether the API is reachable at all. False when no code is configured. */
  get enabled(): boolean {
    return this.config.demoAccessCode !== null;
  }

  verifyCode(candidate: unknown): boolean {
    const expected = this.config.demoAccessCode;
    if (expected === null) return false;
    if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 200) {
      return false;
    }
    return equal(candidate, expected);
  }

  /**
   * Mints a session token.
   *
   * `persona.issuedAt.expiresAt.nonce.signature`, five dot-separated fields — and the persona is
   * **base64url-encoded** rather than written plainly. Every persona in this product has a dot in it
   * (`exec.cdo`), so a plain one produced a six-field token that the five-field parser rejected: the
   * server signed a token it would then refuse, and every route returned "unauthenticated" to a
   * caller holding a perfectly valid session. Encoding the one field that can contain the separator
   * is the fix; the alternative — parsing from the right and hoping — leaves the ambiguity in place.
   *
   * The nonce makes two sessions for the same persona distinguishable, so a rate limit attributes to
   * a sitting rather than to everyone who chose the same persona.
   */
  issue(
    persona: string, capability: Capability = 'full',
  ): { readonly token: string; readonly caller: Caller } {
    const issuedAtMs = Date.parse(String(this.now()));
    const expiresAtMs = issuedAtMs + this.config.sessionLifetimeMs;
    const nonce = randomBytes(9).toString('base64url');
    const encoded = Buffer.from(persona, 'utf8').toString('base64url');
    const body = `${capability}.${encoded}.${String(issuedAtMs)}.${String(expiresAtMs)}.${nonce}`;
    const token = `${body}.${this.#sign(body)}`;
    return {
      token,
      caller: { capability, persona, issuedAtMs, expiresAtMs, callerId: `${persona}:${nonce}` },
    };
  }

  /** Whether this deployment issues sessions to callers who have no code. */
  get openAssistant(): boolean {
    return this.config.openAssistant;
  }

  /**
   * Verifies a token.
   *
   * Signature **before** expiry, deliberately: checking expiry first would answer "this token was
   * once valid" for a forged one, which is a small oracle and a free one to close.
   */
  authenticate(token: string | null): AuthOutcome {
    if (token === null || token === '') return { ok: false, reason: 'MISSING' };
    const parts = token.split('.');
    if (parts.length !== 6) return { ok: false, reason: 'MALFORMED' };
    const [capability, encoded, issued, expires, nonce, signature] = parts;
    if (capability === undefined || encoded === undefined || issued === undefined
      || expires === undefined || nonce === undefined || signature === undefined) {
      return { ok: false, reason: 'MALFORMED' };
    }
    if (capability !== 'ask' && capability !== 'full') return { ok: false, reason: 'MALFORMED' };
    /*
     * The signature covers the encoded form, and is checked before the encoded form is decoded.
     *
     * Decoding first would mean running a parser over attacker-supplied bytes on every request,
     * including every unauthenticated one. Here nothing but an HMAC touches an unverified token.
     */
    const body = `${capability}.${encoded}.${issued}.${expires}.${nonce}`;
    if (!equal(signature, this.#sign(body))) return { ok: false, reason: 'BAD_SIGNATURE' };

    const persona = Buffer.from(encoded, 'base64url').toString('utf8');
    const issuedAtMs = globalThis.Number.parseInt(issued, 10);
    const expiresAtMs = globalThis.Number.parseInt(expires, 10);
    if (!globalThis.Number.isFinite(issuedAtMs) || !globalThis.Number.isFinite(expiresAtMs)) {
      return { ok: false, reason: 'MALFORMED' };
    }
    if (Date.parse(String(this.now())) >= expiresAtMs) return { ok: false, reason: 'EXPIRED' };

    return {
      ok: true,
      caller: { capability, persona, issuedAtMs, expiresAtMs, callerId: `${persona}:${nonce}` },
    };
  }

  #sign(body: string): string {
    return createHmac('sha256', this.config.sessionSigningKey).update(body).digest('base64url');
  }
}

/**
 * A fixed-window rate limit, per caller and per route class (§18).
 *
 * In-process, and that limitation is stated rather than hidden: with several instances a determined
 * caller gets the limit times the instance count. It is a cost guard against ordinary abuse, not a
 * defence against a distributed attacker, and the real ceiling is Cloud Run's `max-instances`, which
 * bounds spend regardless of what any limiter does.
 */
export class CallerRateLimit {
  readonly #hits = new Map<string, { count: number; windowStartMs: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
    private readonly now: () => Instant,
  ) {}

  /** `true` when the call is allowed. Consumes one unit when it is. */
  allow(callerId: string, bucket: string): boolean {
    const key = `${bucket}:${callerId}`;
    const nowMs = Date.parse(String(this.now()));
    const entry = this.#hits.get(key);
    if (entry === undefined || nowMs - entry.windowStartMs >= this.windowMs) {
      this.#hits.set(key, { count: 1, windowStartMs: nowMs });
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count += 1;
    return true;
  }
}
