/**
 * DR-041 — the Phase 7 interaction path, and the two things it must not become.
 *
 * The risk this suite guards is not that the gateway fails; it is that it *succeeds* in the wrong
 * way. Two failure modes, both of which look like progress at the time:
 *
 *   1. **A transport arrives by accident.** Somebody needs a click to load data, reaches for a
 *      server, and DR-029's entire security obligation activates — TLS, HSTS, CSRF, CORS, cookie
 *      attributes, none of which is enforced — without anyone deciding to take that on.
 *   2. **The UI starts deciding.** A React component filters, sorts or hides based on a role it
 *      read, and authorization quietly acquires a second implementation
 *      (`SECURITY_MODEL.md` §12.1, global invariant 7).
 *
 * So these tests assert absence as much as behaviour: no network dependency, no authorization in
 * presentation, no path around the enforcement point.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type ViewRequest, GATEWAY_STATE, UnknownView, VIEW_ROUTES, findRoute, toApiRequest,
} from '@app';
import { type DemoApi, createDemoApi } from '../../scripts/security/demo-api.js';

let api: DemoApi;
beforeEach(() => { api = createDemoApi(); });

async function as(username: string, actorId: string) {
  const session = await api.login(username);
  if (session === undefined) throw new Error(`login failed for ${username}`);
  return api.contextFor(actorId, session.sessionId);
}

const listFiles = (root: string): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
  };
  walk(root);
  return out;
};

// ---------------------------------------------------------------------------
// No transport was introduced
// ---------------------------------------------------------------------------

describe('DR-041 is closed without introducing a transport (DR-029 stays closed)', () => {
  it('reports the in-process kind, so a surface cannot pretend not to know', () => {
    expect(api.gateway.kind).toBe('IN_PROCESS');
    expect(GATEWAY_STATE).toMatch(/no HTTP transport exists/);
  });

  it('declares no HTTP server dependency anywhere in the repository', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const server of ['express', 'fastify', 'koa', 'next', 'hapi', 'hono', '@nestjs/core']) {
      expect(all, `${server} would activate DR-029`).not.toContain(server);
    }
  });

  /*
   * **Phase 13 changed this test, and the change is the point.**
   *
   * Until Phase 12 this asserted that `src/` made no network call at all, which is what kept DR-029
   * closed while no transport existed. ADR-0032 accepts ADR-0006 and introduces one, so the
   * assertion moves from *"no outbound call anywhere"* to the two properties that still matter:
   *
   *   1. **`src/` opens no listener.** The server is `server/`, outside the layered source, so a
   *      surface or a context cannot start one. A listener inside `src/` would mean the trust
   *      boundary had moved somewhere nobody decided to put it.
   *   2. **Outbound calls are confined to `platform/net`.** One file makes requests, and it is the
   *      one with the host allow-list, the timeout, the response cap and the redirect refusal. A
   *      `fetch` anywhere else is a call with none of those.
   *
   * Weakening the first would be a security regression. Weakening the second would put an unbounded
   * remote call in a context, which is the failure this replacement exists to keep catching.
   */
  it('opens no network listener anywhere in src', () => {
    for (const file of listFiles('src')) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} imports node:http`).not.toMatch(/from\s+['"]node:(http|https|net)['"]/);
      expect(source, `${file} creates a server`).not.toMatch(/createServer\s*\(|\.listen\s*\(/);
    }
  });

  it('confines every outbound call to the one bounded HTTP module', () => {
    const permitted = 'src/platform/net/index.ts';
    for (const file of listFiles('src')) {
      if (file.split('\\').join('/').endsWith(permitted)) continue;
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} calls fetch outside ${permitted}`).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it('records ADR-0006 as Accepted, with ADR-0032 discharging DR-029', () => {
    const adr = readFileSync('docs/adr/ADR-0006-api-bff-contract-strategy.md', 'utf8');
    expect(adr).toMatch(/\*\*Status:\*\*\s*\*\*Accepted\*\*/i);
    const runtime = readFileSync('docs/adr/ADR-0032-trusted-server-runtime.md', 'utf8');
    // The obligations that activate the moment a transport exists. Named in the ADR, so a future
    // edit that quietly drops one fails here rather than in a penetration test.
    for (const obligation of ['CSRF', 'CORS', 'TLS', 'HSTS', 'rate']) {
      expect(runtime, `ADR-0032 no longer addresses ${obligation}`).toContain(obligation);
    }
  });
});

// ---------------------------------------------------------------------------
// Every interaction goes through the enforcement point
// ---------------------------------------------------------------------------

describe('every interaction path runs through the Application layer', () => {
  it('maps every declared view onto a declared route', () => {
    for (const [view, route] of Object.entries(VIEW_ROUTES)) {
      const resolved = findRoute(route.method, route.path.replace(':id', 'prj-001'));
      expect(resolved, `${view} maps to an unrouted path`).toBeDefined();
    }
  });

  it('refuses a view that is not in the table', () => {
    expect(() => toApiRequest({ view: 'portfolio.everything' } as unknown as ViewRequest))
      .toThrow(UnknownView);
  });

  it('authorises a gateway request exactly as a dispatched one', async () => {
    const exec = await as('exec.cdo', 'usr-exec-cdo');
    const viaGateway = await api.gateway.request(exec, { view: 'portfolio.projects' });
    const viaDispatch = await api.dispatch(
      { method: 'GET', path: '/v1/projects', query: {} }, exec,
    );
    expect(viaGateway.status).toBe(200);
    expect(viaGateway.status).toBe(viaDispatch.status);
  });

  it('denies through the gateway exactly as it denies through the dispatcher', async () => {
    // The security administrator holds no business capability. Coming in through a different door
    // must not change that — there is only one door.
    const admin = await as('sec.admin', 'usr-sec-admin');
    const response = await api.gateway.request(admin, { view: 'portfolio.projects' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('cannot reach an out-of-scope entity by naming it in a view request', async () => {
    const emea = await as('dir.emea', 'usr-dir-emea');
    const amer = await as('dir.amer', 'usr-dir-amer');
    const emeaSet = await api.policy.resolveScope(emea.auth);
    const amerSet = await api.policy.resolveScope(amer.auth);
    const outOfScope = amerSet.projectIds.find((id) => !emeaSet.projectIds.includes(id)) as string;

    const response = await api.gateway.request(emea, {
      view: 'project.detail', entityId: outOfScope,
    });
    expect(response.status).toBe(404);
  });

  it('cannot widen scope by asking for one — the selector narrows, it never grants', async () => {
    const emea = await as('dir.emea', 'usr-dir-emea');
    const asked = await api.gateway.request(emea, {
      view: 'portfolio.projects', scopeId: 'bu-americas', page: { limit: 100, offset: 0 },
    });
    const plain = await api.gateway.request(emea, {
      view: 'portfolio.projects', page: { limit: 100, offset: 0 },
    });
    // Scope is re-resolved from the session on every request; a scopeId in the payload changes
    // nothing about what the caller may see.
    const ids = (r: typeof asked) => (r.body as { data: { projectId: string }[] }).data.map((x) => x.projectId);
    expect(ids(asked)).toEqual(ids(plain));
  });

  it('audits a gateway-issued sensitive read like any other', async () => {
    const exec = await as('exec.cdo', 'usr-exec-cdo');
    await api.gateway.request(exec, { view: 'portfolio.summary' });
    const reads = api.audit.all().filter((r) => r.entityType === 'portfolioSummary');
    expect(reads.length).toBeGreaterThan(0);
  });

  it('offers no method that returns a domain object or accepts a raw query', () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(api.gateway) as object);
    expect(methods.filter((m) => m !== 'constructor')).toEqual(['request']);
  });
});

// ---------------------------------------------------------------------------
// The UI decides nothing
// ---------------------------------------------------------------------------

describe('no authorization decision lives in the presentation layer', () => {
  const presentation = listFiles('src/presentation');
  /** Comments and doc strings *describe* the rules; only code can break them. */
  const codeOf = (file: string): string =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  it('imports no domain context, no platform module and no persistence', () => {
    for (const file of presentation) {
      const code = codeOf(file);
      expect(code, `${file} imports a domain context`).not.toMatch(/from\s+['"]@contexts\//);
      expect(code, `${file} imports platform`).not.toMatch(/from\s+['"]@platform\//);
      expect(code, `${file} imports persistence`).not.toMatch(/from\s+['"][^'"]*(?:repository|persistence)/i);
    }
  });

  /**
   * The property, stated precisely: a role name may be *described* — the navigation table explains
   * which security role administers identity, which is documentation a reader needs — but it may
   * never be **compared**. A comparison is the UI re-deriving the policy, which is what
   * `SECURITY_MODEL.md` §12.1 forbids.
   */
  it('never compares against a role name to decide what may be shown', () => {
    const ROLES = [
      'EXECUTIVE', 'PORTFOLIO_DIRECTOR', 'DELIVERY_MANAGER',
      'FINANCE_CONTROLLER', 'ASSURANCE_AUDITOR', 'SECURITY_ADMIN',
    ];
    for (const file of presentation) {
      const code = codeOf(file);
      for (const role of ROLES) {
        for (const shape of [
          new RegExp(`===\\s*['"\`]${role}`),
          new RegExp(`!==\\s*['"\`]${role}`),
          new RegExp(`['"\`]${role}['"\`]\\s*===`),
          new RegExp(`includes\\s*\\(\\s*['"\`]${role}`),
          new RegExp(`case\\s+['"\`]${role}`),
        ]) {
          expect(shape.test(code), `${file} compares against ${role}`).toBe(false);
        }
      }
      // And no role-shaped variable is ever read for a decision.
      expect(code, `${file} reads an authorization role`).not.toMatch(/\bctx\.auth\.role\b|\bauth\.role\b/);
    }
  });

  it('holds no copy of the capability or classification matrix', () => {
    for (const file of presentation) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/CAPABILITY_MATRIX|CLASSIFICATION_MATRIX/);
      expect(source, file).not.toMatch(/mayReadField|resolveScope|EnforcementPoint/);
    }
  });
});
