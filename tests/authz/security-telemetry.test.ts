/**
 * Security telemetry — ADR-0016 C-14, accepted at Phase 5 closure.
 *
 * The gap C-14 named was specific and worth restating, because the tests below only make sense
 * against it: `sourceIp` and `userAgent` were recorded on every audit record and classified
 * `PERSONAL_DATA`, a classification granted to nobody — so the audit log recorded exactly the two
 * fields an investigator needs and then withheld them from the investigator.
 *
 * The closure grants a **narrow** investigative read rather than a broad one, and "narrow" is four
 * separate properties, each asserted here rather than asserted once and assumed:
 *
 *   1. one role (`ASSURANCE_AUDITOR`) — not `SECURITY_ADMIN`, not any business role;
 *   2. one resource (`auditEvent`) — a telemetry field on a project payload fails closed;
 *   3. within the caller's organisational scope, like every other read (§4.2);
 *   4. audited, naming the telemetry fields that were actually returned.
 *
 * Property 4 is the one most often left out. An investigative grant that is not itself investigable
 * is a blind spot precisely where a reviewer will look first.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthorizationContext, ScopeNode } from '@platform/authz';
import {
  ALL_CLASSIFICATIONS, AUDITED_READ_CLASSIFICATIONS, CLASSIFICATION_MATRIX,
  SECURITY_TELEMETRY_RESOURCES,
} from '@platform/authz';
import { MisplacedSecurityTelemetry, ROUTES, classify, shape } from '@app';
import { type DemoApi, createDemoApi, AUDIT_FIELDS } from '../../scripts/security/demo-api.js';

let api: DemoApi;
beforeEach(() => { api = createDemoApi(); });

type Persona = readonly [username: string, actorId: string];

const AUDITOR: Persona = ['audit.assurance', 'usr-audit'];
const DELIVERY_MANAGER: Persona = ['dm.mobility', 'usr-dm-mobility'];
const FINANCE: Persona = ['fin.controller', 'usr-fin-ctrl'];
const EXECUTIVE: Persona = ['exec.cdo', 'usr-exec-cdo'];
const EMEA_DIRECTOR: Persona = ['dir.emea', 'usr-dir-emea'];
const SECURITY_ADMIN: Persona = ['sec.admin', 'usr-sec-admin'];

async function as(persona: Persona) {
  const session = await api.login(persona[0]);
  if (session === undefined) throw new Error(`login failed for ${persona[0]}`);
  return api.contextFor(persona[1], session.sessionId);
}

const TELEMETRY_FIELDS = ['sourceIp', 'userAgent'] as const;

// ---------------------------------------------------------------------------
// 1. Classification — the fields are declared, and only the right ones are
// ---------------------------------------------------------------------------

describe('classification (ADR-0016 C-12, C-14)', () => {
  it('classifies the connection metadata on an audit record as SECURITY_TELEMETRY', () => {
    for (const field of TELEMETRY_FIELDS) {
      expect(AUDIT_FIELDS[field]?.classification, field).toBe('SECURITY_TELEMETRY');
    }
  });

  it('does not reclassify the rest of the audit record as telemetry', () => {
    // C-12: classify by what the information *is*. `actorId` and `action` are what the log is about;
    // sweeping them into SECURITY_TELEMETRY would make the category mean "audit" and mean nothing.
    const telemetry = Object.values(AUDIT_FIELDS)
      .filter((p) => p.classification === 'SECURITY_TELEMETRY')
      .map((p) => p.field)
      .sort();
    expect(telemetry).toEqual([...TELEMETRY_FIELDS].sort());
    expect(AUDIT_FIELDS['actorId']?.classification).toBe('PUBLIC_INTERNAL');
    expect(AUDIT_FIELDS['reason']?.classification).toBe('COMMERCIAL_CONFIDENTIAL');
  });

  it('keeps the taxonomy data-centric — no classification is named after a role', () => {
    for (const classification of ALL_CLASSIFICATIONS) {
      for (const role of ['EXECUTIVE', 'DELIVERY_MANAGER', 'FINANCE', 'AUDITOR', 'ADMIN']) {
        expect(classification, `${classification} is named after a persona`).not.toContain(role);
      }
    }
  });

  it('grants SECURITY_TELEMETRY to the assurance auditor and to nobody else', () => {
    expect(CLASSIFICATION_MATRIX.SECURITY_TELEMETRY).toEqual(['ASSURANCE_AUDITOR']);
  });

  it('did not open PERSONAL_DATA to anyone as a workaround', () => {
    expect(CLASSIFICATION_MATRIX.PERSONAL_DATA).toEqual([]);
  });

  it('requires a telemetry read to be audited', () => {
    expect(AUDITED_READ_CLASSIFICATIONS).toContain('SECURITY_TELEMETRY');
  });

  it('declares the audit route as the only route that reads it', () => {
    const reading = ROUTES.filter((r) => r.readsClassifications.includes('SECURITY_TELEMETRY'));
    expect(reading.map((r) => r.path)).toEqual(['/v1/audit']);
    expect(reading[0]?.auditReads).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Who is denied
// ---------------------------------------------------------------------------

describe('ordinary personas cannot retrieve security telemetry', () => {
  it('refuses the audit endpoint to every delivery and business persona', async () => {
    for (const persona of [DELIVERY_MANAGER, FINANCE, EXECUTIVE, EMEA_DIRECTOR, SECURITY_ADMIN]) {
      const ctx = await as(persona);
      const response = await api.dispatch({ method: 'GET', path: '/v1/audit', query: {} }, ctx);
      expect(response.status, persona[0]).toBe(404);
    }
  });

  it('omits the telemetry fields when a non-auditor shapes an audit record directly', async () => {
    // Belt and braces: even if a future route handed an audit row to another role, the field gate
    // removes the telemetry rather than relying on the route being unreachable.
    const record = {
      id: 'a1', occurredAt: '2026-08-31T09:00:00.000Z', actorId: 'usr-1', actorRole: 'EXECUTIVE',
      action: 'READ', entityType: 'project', entityId: 'prj-001', decision: 'GRANT',
      correlationId: 'cor-1', sourceIp: '198.51.100.10', userAgent: 'gldi-demo/1.0',
    };
    for (const persona of [DELIVERY_MANAGER, FINANCE, EXECUTIVE, EMEA_DIRECTOR, SECURITY_ADMIN]) {
      const ctx = await as(persona);
      const shaped = shape('auditEvent', record, AUDIT_FIELDS, ctx.auth);
      for (const field of TELEMETRY_FIELDS) {
        expect(field in shaped.payload, `${persona[0]} received ${field}`).toBe(false);
      }
      expect(shaped.securityTelemetryRead).toEqual([]);
      // Omitted, not masked — a placeholder would still say "this request had a source IP".
      expect(JSON.stringify(shaped.payload)).not.toContain('restricted');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Who is allowed, and under what constraints
// ---------------------------------------------------------------------------

describe('the assurance auditor retrieves telemetry, narrowly', () => {
  it('returns the telemetry fields to the auditor', async () => {
    const ctx = await as(AUDITOR);
    const response = await api.dispatch({ method: 'GET', path: '/v1/audit', query: {} }, ctx);
    expect(response.status).toBe(200);
    const rows = (response.body as { data: Record<string, unknown>[] }).data;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('sourceIp');
    expect(rows[0]).toHaveProperty('userAgent');
  });

  it('still omits everything the auditor may not read', async () => {
    const ctx = await as(AUDITOR);
    // PERSONAL_DATA remains granted to nobody — the telemetry grant did not widen it by proximity.
    const shaped = shape('project', {
      projectId: 'prj-001', leadDeveloperName: 'A Person',
    }, (await import('../../scripts/security/demo-api.js')).PROJECT_FIELDS, ctx.auth);
    expect(Object.keys(shaped.payload)).toEqual(['projectId']);
  });

  it('confines telemetry to declared security-telemetry resources', () => {
    expect(SECURITY_TELEMETRY_RESOURCES).toEqual(['auditEvent']);
  });

  it('refuses a telemetry field smuggled onto a business resource', async () => {
    const ctx = await as(AUDITOR);
    const smuggled = classify([
      ['projectId', 'PUBLIC_INTERNAL'],
      ['sourceIp', 'SECURITY_TELEMETRY'],
    ]);
    expect(() => shape('project', { projectId: 'prj-001', sourceIp: '198.51.100.10' }, smuggled, ctx.auth))
      .toThrow(MisplacedSecurityTelemetry);
  });

  it('narrows audit rows to the caller\'s authorised entity set', async () => {
    // Two directors generate audit traffic against projects in different business units; an auditor
    // whose grant covers only EMEA must not read the Americas access history.
    const emea = await as(EMEA_DIRECTOR);
    const amer = await as(['dir.amer', 'usr-dir-amer']);
    const emeaSet = await api.policy.resolveScope(emea.auth);
    const amerSet = await api.policy.resolveScope(amer.auth);
    const amerOnly = amerSet.projectIds.find((id) => !emeaSet.projectIds.includes(id)) as string;
    const emeaOnly = emeaSet.projectIds[0] as string;

    await api.dispatch({ method: 'GET', path: `/v1/projects/${amerOnly}`, query: {} }, amer);
    await api.dispatch({ method: 'GET', path: `/v1/projects/${emeaOnly}`, query: {} }, emea);

    const auditor = await as(AUDITOR);
    const narrowed: AuthorizationContext = {
      ...auditor.auth,
      scope: [{ kind: 'BUSINESS_UNIT', id: 'bu-emea' } as ScopeNode],
    };
    const response = await api.dispatch(
      { method: 'GET', path: '/v1/audit', query: { limit: '100' } },
      { ...auditor, auth: narrowed },
    );
    expect(response.status).toBe(200);
    const ids = (response.body as { data: { entityId: string }[] }).data.map((r) => r.entityId);
    expect(ids).toContain(emeaOnly);
    expect(ids).not.toContain(amerOnly);
  });

  it('keeps access events, which name no project, inside a narrowed scope', async () => {
    const auditor = await as(AUDITOR);
    const narrowed = {
      ...auditor,
      auth: { ...auditor.auth, scope: [{ kind: 'BUSINESS_UNIT', id: 'bu-emea' } as ScopeNode] },
    };
    const response = await api.dispatch(
      { method: 'GET', path: '/v1/audit', query: { limit: '100' } }, narrowed,
    );
    const actions = (response.body as { data: { action: string }[] }).data.map((r) => r.action);
    expect(actions).toContain('LOGIN');
  });
});

// ---------------------------------------------------------------------------
// 4. The investigative read is itself investigable
// ---------------------------------------------------------------------------

describe('telemetry access is audited', () => {
  it('records the auditor\'s telemetry read, naming the telemetry fields returned', async () => {
    const ctx = await as(AUDITOR);
    await api.dispatch({ method: 'GET', path: '/v1/audit', query: {} }, ctx);

    const reads = api.audit.all().filter(
      (r) => r.entityType === 'auditEvent' && r.action === 'READ' && r.decision === 'GRANT',
    );
    expect(reads.length).toBeGreaterThan(0);
    const record = reads.at(-1);
    expect(record?.actorRole).toBe('ASSURANCE_AUDITOR');
    expect(record?.fields).toContain('sourceIp');
    expect(record?.fields).toContain('userAgent');
    // Named as telemetry access, not merely present among a longer field list.
    expect(record?.reason).toMatch(/securityTelemetry=sourceIp,userAgent/);
  });

  it('does not mark an ordinary commercial read as telemetry access', async () => {
    const ctx = await as(EXECUTIVE);
    const list = await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, ctx);
    const id = (list.body as { data: { projectId: string }[] }).data[0]?.projectId as string;
    await api.dispatch({ method: 'GET', path: `/v1/projects/${id}/economics`, query: {} }, ctx);
    const reads = api.audit.all().filter((r) => r.action === 'READ' && r.fields.length > 0);
    expect(reads.at(-1)?.reason).not.toContain('securityTelemetry=');
  });
});

// ---------------------------------------------------------------------------
// 5. Telemetry must not reappear through the observability plane
// ---------------------------------------------------------------------------

describe('security telemetry does not leak through logs or traces (invariant 4)', () => {
  it('puts no source IP or user agent into any exported span, log or metric', async () => {
    const ctx = await as(AUDITOR);
    await api.dispatch({ method: 'GET', path: '/v1/audit', query: {} }, ctx);
    const serialised = JSON.stringify(api.telemetryExporter);
    expect(serialised).not.toContain(ctx.sourceIp);
    expect(serialised).not.toContain(ctx.userAgent);
  });

  it('redacts telemetry attribute keys even when a developer passes them', async () => {
    const { REDACTED, redact } = await import('@platform/observability');
    const out = redact({
      sourceIp: '198.51.100.10', userAgent: 'Mozilla/5.0', client_ip: '10.0.0.1',
      sessionId: 'ses-000001', projectId: 'prj-001',
    });
    for (const key of ['sourceIp', 'userAgent', 'client_ip', 'sessionId']) {
      expect(out[key], key).toBe(REDACTED);
    }
    expect(out['projectId']).toBe('prj-001');
  });
});
