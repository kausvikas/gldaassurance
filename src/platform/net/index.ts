/**
 * Public surface — platform/net.
 *
 * The only outbound HTTP in the product, and the only place `fetch` may be called from
 * (ADR-0032 §4, ADR-0033 §1).
 *
 * It exists as a platform module rather than as a few lines inside each provider because the four
 * controls a remote call needs are the four that get omitted when the call is written inline:
 *
 *   - a **timeout**, because a hung provider must not hold a request open until the platform kills
 *     it — a hang is a denial of the whole runtime, not of one answer;
 *   - a **response size cap**, because a bounded parser is pointless if the bytes reaching it are
 *     unbounded;
 *   - **no redirect following**, because a redirect is how an outbound call to a configured host
 *     becomes an outbound call to an unconfigured one, carrying its Authorization header;
 *   - an **error type that carries no headers and no body**, because the standard way a credential
 *     reaches a log is an exception that helpfully includes the request that failed.
 *
 * There is no unbounded variant and no convenience wrapper. A caller states its budget or does not
 * make the call.
 */
import type { Instant } from '@platform/time';

export interface HttpBudget {
  /** Wall-clock ceiling for the whole exchange, including body read. */
  readonly timeoutMs: number;
  /** Response bytes after which the read is abandoned. */
  readonly maxResponseBytes: number;
}

export interface HttpRequest {
  readonly method: 'GET' | 'POST';
  readonly url: string;
  /** Header values are written by the caller; nothing here echoes them back on any path. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly budget: HttpBudget;
}

export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly body: string;
  readonly elapsedMs: number;
}

export type HttpFailureKind =
  | 'TIMEOUT'
  | 'UNREACHABLE'
  | 'RESPONSE_TOO_LARGE'
  | 'REDIRECT_REFUSED'
  | 'BAD_URL';

/**
 * A remote call that did not complete.
 *
 * Carries a kind and a host — never a header, never a body, never a URL with a query string. A
 * provider error is one of the highest-traffic log lines in an AI product and it is a routine way
 * for an Authorization header to end up in a log aggregator.
 */
export class HttpFailure extends Error {
  constructor(readonly kind: HttpFailureKind, readonly host: string, detail: string) {
    super(`${kind} calling ${host}: ${detail}`);
    this.name = 'HttpFailure';
  }
}

/** Only these schemes and only these hosts, decided by the caller from configuration. */
export interface HostPolicy {
  /** Exact hostnames. No wildcards: a wildcard is how an allow-list stops being one. */
  readonly allowedHosts: readonly string[];
  readonly requireTls: boolean;
}

export function assertAllowed(url: string, policy: HostPolicy): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpFailure('BAD_URL', 'unknown', 'not a URL');
  }
  const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '::1' || parsed.hostname === '[::1]';
  if (policy.requireTls && parsed.protocol !== 'https:' && !isLoopback) {
    // Loopback is exempt because a local inference runtime on 127.0.0.1 is not a network hop, and
    // requiring TLS there would push operators towards disabling the check entirely.
    throw new HttpFailure('BAD_URL', parsed.hostname, 'TLS is required for non-loopback hosts');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new HttpFailure('BAD_URL', parsed.hostname, `scheme ${parsed.protocol} is not permitted`);
  }
  if (!policy.allowedHosts.includes(parsed.hostname)) {
    throw new HttpFailure('BAD_URL', parsed.hostname, 'host is not in the configured allow-list');
  }
  return parsed;
}

/**
 * Performs one bounded request.
 *
 * `redirect: 'error'` rather than `'manual'`: manual redirects have to be *handled*, and the
 * handling is where the header-forwarding bug lives. Refusing them outright costs nothing against a
 * configured API endpoint and removes the class.
 */
export async function send(
  request: HttpRequest,
  policy: HostPolicy,
  now: () => Instant,
): Promise<HttpResponse> {
  const url = assertAllowed(request.url, policy);
  const startedAt = now();
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, request.budget.timeoutMs);

  try {
    const response = await fetch(url, {
      method: request.method,
      headers: { ...request.headers },
      ...(request.body === undefined ? {} : { body: request.body }),
      redirect: 'error',
      signal: controller.signal,
    });

    const declared = response.headers.get('content-length');
    if (declared !== null) {
      const size = globalThis.Number.parseInt(declared, 10);
      if (globalThis.Number.isFinite(size) && size > request.budget.maxResponseBytes) {
        throw new HttpFailure('RESPONSE_TOO_LARGE', url.hostname, `declared ${declared} bytes`);
      }
    }

    const text = await readBounded(response, request.budget.maxResponseBytes, url.hostname);
    const elapsedMs = elapsed(startedAt, now());
    return { status: response.status, ok: response.ok, body: text, elapsedMs };
  } catch (e) {
    if (e instanceof HttpFailure) throw e;
    const message = e instanceof Error ? e.message : 'unknown';
    if (controller.signal.aborted) {
      throw new HttpFailure('TIMEOUT', url.hostname, `no response within ${String(request.budget.timeoutMs)}ms`);
    }
    if (message.toLowerCase().includes('redirect')) {
      throw new HttpFailure('REDIRECT_REFUSED', url.hostname, 'the endpoint redirected');
    }
    throw new HttpFailure('UNREACHABLE', url.hostname, message.slice(0, 120));
  } finally {
    clearTimeout(timer);
  }
}

/** Reads the body incrementally and stops at the cap rather than buffering and then checking. */
async function readBounded(response: Response, max: number, host: string): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new HttpFailure('RESPONSE_TOO_LARGE', host, `exceeded ${String(max)} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

function elapsed(from: Instant, to: Instant): number {
  const a = Date.parse(String(from));
  const b = Date.parse(String(to));
  return globalThis.Number.isFinite(a) && globalThis.Number.isFinite(b) ? Math.max(0, b - a) : 0;
}

export const NET_STATE: string =
  'The single outbound HTTP boundary: host allow-list, TLS, timeout, response cap, redirects '
  + 'refused, and errors that carry no headers or body (ADR-0032 §6, ADR-0033 §1).';
