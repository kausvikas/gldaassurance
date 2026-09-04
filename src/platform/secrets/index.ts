/**
 * Public surface — platform/secrets.
 *
 * A secret held as an opaque handle rather than a string, because the ways a credential escapes are
 * almost never deliberate. They are: a debug log of a config object; an error message that
 * interpolates the request; a test snapshot; a serialised response envelope; a stack trace from an
 * HTTP client that helpfully includes headers.
 *
 * Every one of those goes through `toString`, `toJSON` or `util.inspect`. So all three are
 * overridden to render a redaction, and the real value is reachable only by calling `reveal()` —
 * which is greppable, reviewable, and appears in exactly one place in this repository: the
 * Authorization header of the Anthropic provider.
 *
 * This is not a substitute for a secret manager. It is the control that makes the *accidental*
 * disclosure paths fail closed, which is the class that actually happens.
 */

const REDACTED = '[redacted]' as const;

/**
 * An opaque credential.
 *
 * `#value` is a true private field: it is not enumerable, not reachable by `Object.keys`, not
 * captured by a structured clone and not visible to a JSON serialiser, so a secret cannot leave
 * through a code path that did not name it.
 */
export class Secret {
  readonly #value: string;

  /** What this credential is for. Safe to log — it names a role, never a value. */
  readonly label: string;

  private constructor(value: string, label: string) {
    this.#value = value;
    this.label = label;
  }

  /**
   * Wraps a configured value. Returns `null` for absent or blank input, so "not configured" is a
   * value the caller must handle rather than an empty string that behaves like a credential until
   * the provider rejects it.
   */
  static from(value: string | undefined, label: string): Secret | null {
    if (value === undefined) return null;
    const trimmed = value.trim();
    if (trimmed === '') return null;
    return new Secret(trimmed, label);
  }

  /**
   * The only way to obtain the value. Deliberately verbose and deliberately rare: a review can
   * enumerate every call site with one search, and a test asserts that the enumeration is short.
   */
  reveal(): string {
    return this.#value;
  }

  /**
   * A non-reversible marker for audit records, so two requests can be attributed to the same
   * credential without the credential appearing anywhere. Length is included because a truncated
   * or double-pasted key is a common misconfiguration and this is enough to spot it.
   */
  digest(): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < this.#value.length; i += 1) {
      h ^= this.#value.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `${this.label}:${h.toString(16).padStart(8, '0')}:len${String(this.#value.length)}`;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  /** `util.inspect` — what `console.log(obj)` actually calls. The most common leak path of all. */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}

/**
 * Shapes that must never appear in a response body, a built asset, a log line or a test snapshot.
 *
 * Used by the secret-leakage gate (§111). Deliberately broader than "this product's credential":
 * the gate should fail on a Google service-account key or an AWS id that someone pasted into a
 * fixture, not only on the one key we happen to use.
 */
export const CREDENTIAL_PATTERNS: readonly { readonly id: string; readonly pattern: RegExp }[] = [
  { id: 'anthropic-api-key', pattern: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { id: 'openai-api-key', pattern: /sk-(?!ant-)[A-Za-z0-9]{32,}/ },
  { id: 'google-api-key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { id: 'gcp-private-key', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { id: 'aws-access-key-id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'slack-token', pattern: /\bxox[abprs]-[0-9A-Za-z-]{10,}/ },
  { id: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { id: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: 'salesforce-session', pattern: /\b00D[A-Za-z0-9]{12,15}![A-Za-z0-9._-]{20,}/ },
];

export interface LeakFinding {
  readonly patternId: string;
  /** Where it was found. Never the matched text — a leak report must not republish the leak. */
  readonly where: string;
}

/** Scans text for credential shapes. Returns *what kind* and *where*, never the value. */
export function scanForSecrets(text: string, where: string): readonly LeakFinding[] {
  const out: LeakFinding[] = [];
  for (const { id, pattern } of CREDENTIAL_PATTERNS) {
    if (pattern.test(text)) out.push({ patternId: id, where });
  }
  return out;
}

export const SECRETS_STATE: string =
  'Credentials are opaque handles; toString, toJSON and util.inspect all redact. reveal() is the '
  + 'single audited disclosure point (REQ-SEC-008, ADR-0033 §2).';
