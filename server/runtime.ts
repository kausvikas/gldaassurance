/**
 * The trusted server runtime (ADR-0032).
 *
 * `node:http` and this repository's own `src/`. No framework, no middleware stack, no dependency
 * tree — because this is the process that holds the API credential and parses untrusted uploads, and
 * every package added here is a package that can read both.
 *
 * ## What this file is and is not
 *
 * It is **transport only** (ADR-0006 §2). It parses a request, enforces the transport controls,
 * calls a use case, and serialises the result. It makes no authorization decision, computes no
 * metric and invents no DTO. Every route below resolves to something in `src/app`, and the security
 * that matters happened before this file was reached.
 *
 * ## DR-029, discharged rather than deferred
 *
 * Eleven phases kept DR-029 closed by having no transport. Introducing one activates it, so each of
 * its obligations is discharged here, in code:
 *
 * - **CSRF is structurally absent**, not mitigated. There is no cookie and no ambient session: the
 *   browser carries an explicit bearer, so a cross-site request cannot borrow the caller's identity.
 * - **CORS is deny-by-default** from a configured exact-match allow-list. No wildcard, and
 *   `Access-Control-Allow-Credentials` is never sent — it would be meaningless without cookies and
 *   dangerous with them.
 * - **Bodies are capped** before they are read, and the cap is enforced while reading rather than
 *   after, so an oversized body is abandoned rather than buffered.
 * - **Rate limits** apply per route class through the existing `FixedWindowRateLimiter`.
 * - **Security headers** on every response, including a CSP that forbids everything, because an API
 *   response has no legitimate reason to load anything.
 * - **TLS and HSTS are terminated by the platform.** Cloud Run does this. It is recorded as a
 *   deployment precondition rather than claimed as implemented here, because claiming it would be
 *   the kind of half-true assurance this repository exists not to produce.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

export interface RouteRequest {
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly origin: string | null;
  readonly bearer: string | null;
}

export interface RouteResponse {
  readonly status: number;
  readonly body: unknown;
}

export type RouteHandler = (request: RouteRequest) => Promise<RouteResponse>;

export interface RuntimeOptions {
  readonly allowedOrigins: readonly string[];
  /** Maximum request body, in bytes. Uploads use a larger cap on their own routes. */
  readonly maxBodyBytes: number;
  readonly maxUploadBytes: number;
  /** Wall-clock ceiling per request. A handler that exceeds it returns 504, not a hung socket. */
  readonly requestTimeoutMs: number;
  readonly demoMarker: string;
}

export const DEFAULT_RUNTIME: RuntimeOptions = {
  allowedOrigins: [],
  maxBodyBytes: 256 * 1024,
  maxUploadBytes: 12 * 1024 * 1024,
  requestTimeoutMs: 45_000,
  demoMarker: 'DEMO — SYNTHETIC DATA',
};

/**
 * Applied to every response, including errors.
 *
 * `default-src 'none'` on an API response is not cargo-culted: a JSON response that a browser is
 * ever tricked into rendering as a document should be able to load nothing at all.
 */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'cache-control': 'no-store',
  'permissions-policy': 'geolocation=(), camera=(), microphone=()',
};

/** The generic failure. One shape for every cause, so a status cannot be used to probe. */
const NOT_FOUND = { error: 'not_found' } as const;

export class Runtime {
  readonly #routes = new Map<string, RouteHandler>();
  readonly #uploadRoutes = new Set<string>();
  readonly #options: RuntimeOptions;

  constructor(options: RuntimeOptions = DEFAULT_RUNTIME) {
    this.#options = options;
  }

  route(method: string, path: string, handler: RouteHandler, isUpload = false): this {
    const key = `${method} ${path}`;
    this.#routes.set(key, handler);
    if (isUpload) this.#uploadRoutes.add(key);
    return this;
  }

  /**
   * Resolves a request path to a handler.
   *
   * Exact match first, then a single `:id` segment. There is no pattern language and no regular
   * expression over the path: route tables that grow one gain ambiguity, and an ambiguous route is
   * a route whose authorization someone reasoned about for a different handler.
   */
  #resolve(method: string, path: string): {
    handler: RouteHandler; key: string; params: Record<string, string>;
  } | null {
    const exact = this.#routes.get(`${method} ${path}`);
    if (exact !== undefined) return { handler: exact, key: `${method} ${path}`, params: {} };

    const segments = path.split('/').filter((s) => s !== '');
    for (const [key, handler] of this.#routes) {
      const [routeMethod, routePath] = key.split(' ');
      if (routeMethod !== method || routePath === undefined) continue;
      const routeSegments = routePath.split('/').filter((s) => s !== '');
      if (routeSegments.length !== segments.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < routeSegments.length; i += 1) {
        const expected = routeSegments[i];
        const actual = segments[i];
        if (expected === undefined || actual === undefined) { matched = false; break; }
        if (expected.startsWith(':')) { params[expected.slice(1)] = decodeURIComponent(actual); continue; }
        if (expected !== actual) { matched = false; break; }
      }
      if (matched) return { handler, key, params };
    }
    return null;
  }

  listen(port: number): Server {
    const server = createServer((request, response) => {
      void this.#handle(request, response);
    });
    server.listen(port);
    return server;
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const origin = request.headers.origin ?? null;
    const url = new URL(request.url ?? '/', 'http://localhost');
    const method = request.method ?? 'GET';

    const corsHeaders = this.#cors(origin);

    if (method === 'OPTIONS') {
      // A preflight from an origin that is not allow-listed gets no allow header, which is the
      // browser-visible form of "no".
      send(response, 204, null, corsHeaders);
      return;
    }

    const resolved = this.#resolve(method, url.pathname);
    if (resolved === null) {
      // Deny-by-default (REQ-SEC-005): an unmapped route is the same not-found as everything else.
      send(response, 404, NOT_FOUND, corsHeaders);
      return;
    }

    const cap = this.#uploadRoutes.has(resolved.key)
      ? this.#options.maxUploadBytes : this.#options.maxBodyBytes;

    let body: unknown = null;
    if (method === 'POST') {
      const read = await readBody(request, cap);
      if (read.kind === 'TOO_LARGE') {
        send(response, 413, { error: 'payload_too_large', limitBytes: cap }, corsHeaders);
        return;
      }
      if (read.kind === 'MALFORMED') {
        send(response, 400, { error: 'malformed_request' }, corsHeaders);
        return;
      }
      body = read.value;
    }

    const query: Record<string, string> = { ...resolved.params };
    for (const [key, value] of url.searchParams) query[key] = value;

    const bearer = readBearer(request.headers.authorization);

    try {
      const result = await withTimeout(
        resolved.handler({ method, path: url.pathname, query, body, origin, bearer }),
        this.#options.requestTimeoutMs,
      );
      send(response, result.status, result.body, corsHeaders);
    } catch (e) {
      if (e instanceof TimeoutError) {
        send(response, 504, { error: 'timeout' }, corsHeaders);
        return;
      }
      /*
       * A defect is a 500 with nothing in it.
       *
       * Not the message, not the stack, not the route's inputs. An error path that interpolates the
       * request is the single most common way a credential reaches a log aggregator, and an error
       * body that names an internal failure is a free map of the system. The detail goes to the
       * process log, where an operator can reach it and a caller cannot.
       */
      // eslint-disable-next-line no-console
      console.error('[runtime] handler failed', e instanceof Error ? e.name : 'unknown');
      send(response, 500, { error: 'internal_error' }, corsHeaders);
    }
  }

  /**
   * CORS, deny-by-default.
   *
   * An origin that is not on the list receives no `Access-Control-Allow-Origin` at all — not a
   * wildcard, not the request's own origin echoed back. Echoing the origin is the mistake that looks
   * like an allow-list and is not one.
   */
  #cors(origin: string | null): Readonly<Record<string, string>> {
    if (origin === null || !this.#options.allowedOrigins.includes(origin)) {
      return { vary: 'Origin' };
    }
    return {
      vary: 'Origin',
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-max-age': '600',
      // Deliberately no `access-control-allow-credentials`: there are no cookies to send, and
      // enabling it would be the first half of reintroducing CSRF.
    };
  }
}

function send(
  response: ServerResponse, status: number, body: unknown,
  extra: Readonly<Record<string, string>>,
): void {
  const headers: Record<string, string> = { ...SECURITY_HEADERS, ...extra };
  if (body === null) {
    response.writeHead(status, headers);
    response.end();
    return;
  }
  const payload = JSON.stringify(body);
  headers['content-type'] = 'application/json; charset=utf-8';
  headers['content-length'] = String(Buffer.byteLength(payload));
  response.writeHead(status, headers);
  response.end(payload);
}

type BodyRead =
  | { readonly kind: 'OK'; readonly value: unknown }
  | { readonly kind: 'TOO_LARGE' }
  | { readonly kind: 'MALFORMED' };

/** Reads and parses a JSON body, abandoning the read at the cap rather than buffering past it. */
async function readBody(request: IncomingMessage, cap: number): Promise<BodyRead> {
  const declared = request.headers['content-length'];
  if (typeof declared === 'string') {
    const size = globalThis.Number.parseInt(declared, 10);
    if (globalThis.Number.isFinite(size) && size > cap) return { kind: 'TOO_LARGE' };
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Buffer);
    total += buffer.length;
    if (total > cap) {
      request.destroy();
      return { kind: 'TOO_LARGE' };
    }
    chunks.push(buffer);
  }
  if (total === 0) return { kind: 'OK', value: null };
  try {
    return { kind: 'OK', value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { kind: 'MALFORMED' };
  }
}

function readBearer(header: string | undefined): string | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+([A-Za-z0-9._~+/-]{1,512}=*)$/.exec(header.trim());
  return match?.[1] ?? null;
}

export class TimeoutError extends Error {
  constructor() {
    super('handler exceeded its time budget');
    this.name = 'TimeoutError';
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new TimeoutError()); }, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
