/**
 * The Phase 5 acceptance gate: attack the API.
 *
 * `TEST_STRATEGY.md` §4 — "structurally different from other suites: these assert **absence**."
 * Every test here plays the attacker and asserts the attack fails. A test that only proves the happy
 * path works proves nothing about a security control, because a control that is missing entirely
 * also lets the happy path work.
 *
 * The pipeline under attack is the real one (`scripts/security/demo-api.ts`): real policy, real
 * session store, real dispatcher, real audit log. Not a mock — an authorization test against a stub
 * proves the stub is correct.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { SessionId } from '@platform/authz';
import { type DemoApi, createDemoApi } from '../../scripts/security/demo-api.js';

let api: DemoApi;

/** Logs a persona in and returns a context ready to dispatch with. */
async function as(username: string, actorId: string) {
  const session = await api.login(username);
  if (session === undefined) throw new Error(`login failed for ${username}`);
  return { ctx: api.contextFor(actorId, session.sessionId), sessionId: session.sessionId };
}

type Persona = readonly [username: string, actorId: string];

const EMEA_DIRECTOR: Persona = ['dir.emea', 'usr-dir-emea'];
const AMER_DIRECTOR: Persona = ['dir.amer', 'usr-dir-amer'];
const DELIVERY_MANAGER: Persona = ['dm.mobility', 'usr-dm-mobility'];
const EXECUTIVE: Persona = ['exec.cdo', 'usr-exec-cdo'];
const SECURITY_ADMIN: Persona = ['sec.admin', 'usr-sec-admin'];
const AUDITOR: Persona = ['audit.assurance', 'usr-audit'];

beforeEach(() => { api = createDemoApi(); });

/** A project inside EMEA's scope, and one outside it — resolved from the policy, not guessed. */
async function twoProjects() {
  const { ctx } = await as(...EMEA_DIRECTOR);
  const emea = await api.policy.resolveScope(ctx.auth);
  const { ctx: amerCtx } = await as(...AMER_DIRECTOR);
  const amer = await api.policy.resolveScope(amerCtx.auth);
  const inScope = emea.projectIds[0];
  const outOfScope = amer.projectIds.find((id) => !emea.projectIds.includes(id));
  if (inScope === undefined || outOfScope === undefined) throw new Error('fixture setup failed');
  return { inScope, outOfScope };
}

// ---------------------------------------------------------------------------
// 1. BOLA — change the object id, get someone else's project
// ---------------------------------------------------------------------------

describe('BOLA — broken object level authorization', () => {
  it('refuses a project id outside the caller\'s scope', async () => {
    const { outOfScope } = await twoProjects();
    const { ctx } = await as(...EMEA_DIRECTOR);
    const response = await api.dispatch(
      { method: 'GET', path: `/v1/projects/${outOfScope}`, query: {} }, ctx,
    );
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('returns an identical response for out-of-scope and non-existent ids', async () => {
    const { outOfScope } = await twoProjects();
    const { ctx } = await as(...EMEA_DIRECTOR);
    const real = await api.dispatch({ method: 'GET', path: `/v1/projects/${outOfScope}`, query: {} }, ctx);
    const fake = await api.dispatch({ method: 'GET', path: '/v1/projects/prj-does-not-exist', query: {} }, ctx);
    // Byte-identical. An attacker cannot tell a real id they may not see from an id that is not real.
    expect(real.status).toBe(fake.status);
    expect(real.body).toEqual(fake.body);
  });

  it('refuses the economics of an out-of-scope project', async () => {
    const { outOfScope } = await twoProjects();
    const { ctx } = await as(...EMEA_DIRECTOR);
    const response = await api.dispatch(
      { method: 'GET', path: `/v1/projects/${outOfScope}/economics`, query: {} }, ctx,
    );
    expect(response.status).toBe(404);
  });

  it('refuses a write against an out-of-scope project', async () => {
    const { outOfScope } = await twoProjects();
    const { ctx } = await as(...EXECUTIVE);
    // The executive may apply overrides, and their scope covers everything — so narrow it to prove
    // the object check, not the capability check, is what stops a director.
    const { ctx: dirCtx } = await as(...EMEA_DIRECTOR);
    const response = await api.dispatch({
      method: 'POST', path: `/v1/projects/${outOfScope}/rag-override`, query: {},
      body: { rag: 'RED', reason: 'attempted', expiresAt: '2026-09-30' },
    }, dirCtx);
    expect(response.status).toBe(404);
    void ctx;
  });

  it('never returns an out-of-scope project in a list', async () => {
    const { outOfScope } = await twoProjects();
    const { ctx } = await as(...EMEA_DIRECTOR);
    const response = await api.dispatch(
      { method: 'GET', path: '/v1/projects', query: { limit: '100' } }, ctx,
    );
    const ids = (response.body as { data: { projectId: string }[] }).data.map((r) => r.projectId);
    expect(ids).not.toContain(outOfScope);
  });
});

// ---------------------------------------------------------------------------
// 2. Parameter manipulation
// ---------------------------------------------------------------------------

describe('parameter manipulation', () => {
  it('rejects a path-traversal id rather than resolving it', async () => {
    const { ctx } = await as(...EMEA_DIRECTOR);
    for (const id of ['..', '../../etc/passwd', 'prj%2F001', 'PRJ-001', 'prj 001', '*']) {
      const response = await api.dispatch(
        { method: 'GET', path: `/v1/projects/${id}`, query: {} }, ctx,
      );
      expect([400, 404], `id "${id}" leaked a 200`).toContain(response.status);
    }
  });

  it('rejects an unknown body field instead of ignoring it', async () => {
    const { inScope } = await twoProjects();
    const { ctx } = await as(...EXECUTIVE);
    const response = await api.dispatch({
      method: 'POST', path: `/v1/projects/${inScope}/rag-override`, query: {},
      body: { rag: 'RED', reason: 'x', expiresAt: '2026-09-30', role: 'EXECUTIVE', scope: 'ALL' },
    }, ctx);
    expect(response.status).toBe(400);
  });

  it('rejects a prototype-pollution key in the body', async () => {
    const { inScope } = await twoProjects();
    const { ctx } = await as(...EXECUTIVE);
    const body = JSON.parse('{"rag":"RED","reason":"x","expiresAt":"2026-09-30","__proto__":{"admin":true}}') as unknown;
    const response = await api.dispatch({
      method: 'POST', path: `/v1/projects/${inScope}/rag-override`, query: {}, body,
    }, ctx);
    expect(response.status).toBe(400);
    expect(({} as Record<string, unknown>)['admin']).toBeUndefined();
  });

  it('clamps an oversized page size instead of honouring it', async () => {
    const { ctx } = await as(...EXECUTIVE);
    const response = await api.dispatch(
      { method: 'GET', path: '/v1/projects', query: { limit: '100000' } }, ctx,
    );
    expect(response.status).toBe(200);
    const body = response.body as { data: unknown[]; page: { limit: number } };
    expect(body.page.limit).toBe(100);
    expect(body.data.length).toBeLessThanOrEqual(100);
  });

  it('rejects a negative or non-integer offset rather than coercing it', async () => {
    const { ctx } = await as(...EXECUTIVE);
    for (const offset of ['-1', '1e3', '0x10', ' 1', 'Infinity', '1.5']) {
      const response = await api.dispatch(
        { method: 'GET', path: '/v1/projects', query: { offset } }, ctx,
      );
      expect(response.status, `offset "${offset}"`).toBe(400);
    }
  });

  it('does not route an unmapped path', async () => {
    const { ctx } = await as(...EXECUTIVE);
    for (const path of ['/v1/admin', '/v1/projects/x/../../audit', '/v2/projects', '/v1/users']) {
      const response = await api.dispatch({ method: 'GET', path, query: {} }, ctx);
      expect(response.status, path).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Field-level leakage
// ---------------------------------------------------------------------------

describe('field-level leakage', () => {
  it('omits commercial fields entirely for a Delivery Manager — not null, not masked', async () => {
    const { ctx } = await as(...DELIVERY_MANAGER);
    // The DM has no scope, so give them one project by asking for the list first; if the list is
    // empty the assertion below still holds vacuously, so use the executive's view for the id.
    const { ctx: execCtx } = await as(...EXECUTIVE);
    const list = await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, execCtx);
    const id = (list.body as { data: { projectId: string }[] }).data[0]?.projectId as string;

    const response = await api.dispatch({ method: 'GET', path: `/v1/projects/${id}`, query: {} }, ctx);
    // The DM has empty scope, so this is 404 — which is itself the control. Prove the field rule
    // separately, at the shaping layer, with a DM context over a project they can see.
    expect(response.status).toBe(404);
  });

  it('omits commercial fields from a shaped payload for a role that may not read them', async () => {
    const { ctx: execCtx } = await as(...EXECUTIVE);
    const list = await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, execCtx);
    const id = (list.body as { data: { projectId: string }[] }).data[0]?.projectId as string;
    const full = await api.dispatch({ method: 'GET', path: `/v1/projects/${id}`, query: {} }, execCtx);
    const row = (full.body as { data: Record<string, unknown>[] }).data[0] as Record<string, unknown>;

    // The executive sees them.
    expect(row).toHaveProperty('forecastGmPercent');
    expect(row).toHaveProperty('contractValue');

    // Now the same resource through a role that may not.
    const { shape } = await import('@app');
    const { PROJECT_FIELDS } = await import('../../scripts/security/demo-api.js');
    const { ctx: dmCtx } = await as(...DELIVERY_MANAGER);
    const shaped = shape('project', row, PROJECT_FIELDS, dmCtx.auth);

    expect(Object.keys(shaped.payload)).not.toContain('forecastGmPercent');
    expect(Object.keys(shaped.payload)).not.toContain('contractValue');
    expect(Object.keys(shaped.payload)).not.toContain('marginErosionPp');
    // Absent, not null and not a placeholder — a null still discloses the field applies.
    expect('forecastGmPercent' in shaped.payload).toBe(false);
    expect(JSON.stringify(shaped.payload)).not.toContain('restricted');
    expect(shaped.withheld).toContain('forecastGmPercent');
  });

  it('refuses to serialise a field nobody classified', async () => {
    const { shape, UnclassifiedField } = await import('@app');
    const { PROJECT_FIELDS } = await import('../../scripts/security/demo-api.js');
    const { ctx } = await as(...EXECUTIVE);
    expect(() => shape('project', { projectId: 'prj-001', newSecretField: 'x' }, PROJECT_FIELDS, ctx.auth))
      .toThrow(UnclassifiedField);
  });

  it('gives PERSONAL_DATA to nobody, including the executive', async () => {
    const { shape } = await import('@app');
    const { PROJECT_FIELDS } = await import('../../scripts/security/demo-api.js');
    for (const persona of [EXECUTIVE, AUDITOR, DELIVERY_MANAGER] as Persona[]) {
      const { ctx } = await as(persona[0], persona[1]);
      const shaped = shape('project', {
        projectId: 'prj-001', leadDeveloperName: 'A Person', leadDeveloperUtilisation: '0.94',
      }, PROJECT_FIELDS, ctx.auth);
      expect(Object.keys(shaped.payload), persona[0]).toEqual(['projectId']);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Privilege escalation
// ---------------------------------------------------------------------------

describe('privilege escalation', () => {
  it('refuses a Delivery Manager the RAG override capability', async () => {
    const { ctx: execCtx } = await as(...EXECUTIVE);
    const list = await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, execCtx);
    const id = (list.body as { data: { projectId: string }[] }).data[0]?.projectId as string;
    const { ctx } = await as(...DELIVERY_MANAGER);
    const response = await api.dispatch({
      method: 'POST', path: `/v1/projects/${id}/rag-override`, query: {},
      body: { rag: 'GREEN', reason: 'x', expiresAt: '2026-09-30' },
    }, ctx);
    expect(response.status).toBe(404);
  });

  it('refuses the Security Administrator all business data', async () => {
    const { ctx } = await as(...SECURITY_ADMIN);
    for (const path of ['/v1/projects', '/v1/portfolio/summary']) {
      const response = await api.dispatch({ method: 'GET', path, query: {} }, ctx);
      expect(response.status, path).toBe(404);
    }
  });

  it('refuses everyone the audit log except the auditor', async () => {
    for (const persona of [EXECUTIVE, EMEA_DIRECTOR, DELIVERY_MANAGER, SECURITY_ADMIN] as Persona[]) {
      const { ctx } = await as(persona[0], persona[1]);
      const response = await api.dispatch({ method: 'GET', path: '/v1/audit', query: {} }, ctx);
      expect(response.status, persona[0]).toBe(404);
    }
    const { ctx: auditorCtx } = await as(...AUDITOR);
    const allowed = await api.dispatch({ method: 'GET', path: '/v1/audit', query: {} }, auditorCtx);
    expect(allowed.status).toBe(200);
  });

  it('ignores a forged role or scope in the request context\'s own session', async () => {
    // The attack: obtain a valid session as a DM, then present a context claiming EXECUTIVE.
    const dm = await as(...DELIVERY_MANAGER);
    const exec = await as(...EXECUTIVE);
    const forged = { ...exec.ctx, auth: { ...exec.ctx.auth, sessionId: dm.sessionId } };
    const response = await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, forged);
    // The session belongs to the DM; the claimed actor does not match. Denied.
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 5. Session attacks
// ---------------------------------------------------------------------------

describe('session handling', () => {
  it('refuses a fabricated session id', async () => {
    const { ctx } = await as(...EXECUTIVE);
    const forged = { ...ctx, auth: { ...ctx.auth, sessionId: 'ses-999999' as SessionId } };
    const response = await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, forged);
    expect(response.status).toBe(404);
  });

  it('refuses a revoked session', async () => {
    const { ctx, sessionId } = await as(...EXECUTIVE);
    expect((await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, ctx)).status).toBe(200);
    api.sessions.revoke(sessionId);
    expect((await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, ctx)).status).toBe(404);
  });

  it('revokes every session for an actor when their grants change', async () => {
    const a = await as(...EXECUTIVE);
    const b = await as(...EXECUTIVE);
    expect(api.sessions.revokeAllFor(a.ctx.auth.actorId)).toBe(2);
    for (const s of [a, b]) {
      expect((await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, s.ctx)).status).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Aggregates
// ---------------------------------------------------------------------------

describe('aggregate leakage (REQ-PORT-003)', () => {
  it('computes portfolio totals over the authorised set only', async () => {
    const { ctx: emea } = await as(...EMEA_DIRECTOR);
    const { ctx: exec } = await as(...EXECUTIVE);
    const scoped = await api.dispatch({ method: 'GET', path: '/v1/portfolio/summary', query: {} }, emea);
    const global = await api.dispatch({ method: 'GET', path: '/v1/portfolio/summary', query: {} }, exec);
    const count = (r: typeof scoped) => (r.body as { data: { projectCount: number }[] }).data[0]?.projectCount;
    const value = (r: typeof scoped) => (r.body as { data: { contractValue: string }[] }).data[0]?.contractValue;
    expect(count(scoped)).toBeLessThan(count(global) as number);
    expect(value(scoped)).not.toBe(value(global));
  });
});

// ---------------------------------------------------------------------------
// 7. Rate limiting
// ---------------------------------------------------------------------------

describe('resource exhaustion', () => {
  it('rate limits a write flood', async () => {
    const { ctx: execCtx } = await as(...EXECUTIVE);
    const list = await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, execCtx);
    const id = (list.body as { data: { projectId: string }[] }).data[0]?.projectId as string;
    let limited = 0;
    for (let i = 0; i < 40; i += 1) {
      const r = await api.dispatch({
        method: 'POST', path: `/v1/projects/${id}/rag-override`, query: {},
        body: { rag: 'RED', reason: 'flood', expiresAt: '2026-09-30' },
      }, execCtx);
      if (r.status === 429) limited += 1;
    }
    expect(limited).toBeGreaterThan(0);
  });

  it('returns Retry-After and no data when limited', async () => {
    const { ctx } = await as(...EXECUTIVE);
    let limitedResponse;
    for (let i = 0; i < 400 && limitedResponse === undefined; i += 1) {
      const r = await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, ctx);
      if (r.status === 429) limitedResponse = r;
    }
    expect(limitedResponse?.headers['Retry-After']).toBeDefined();
    expect(limitedResponse?.body).toEqual({ error: 'rate_limited' });
  });
});
