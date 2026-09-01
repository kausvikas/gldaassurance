/**
 * Audit integrity, and the guarantee that telemetry does not become the leak.
 *
 * The audit tests assert the properties `SECURITY_MODEL.md` §5.3 states: append-only, denials
 * recorded, a failure to audit failing the operation, and queryability by actor, entity and window.
 * The observability tests assert the one property that makes telemetry safe to turn on — that a
 * rate, a margin or a credential cannot reach a log line even if a developer passes one.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ActorId, CorrelationId, Role } from '@platform/authz';
import type { Instant } from '@platform/time';
import {
  type AuditRecord, AuditWriteFailed, InMemoryAuditLog, accessEventsOnly, fingerprint, isAccessEvent,
} from '@platform/audit';
import {
  InMemoryExporter, MAX_ATTRIBUTE_LENGTH, REDACTED, Telemetry, redact,
} from '@platform/observability';
import { type DemoApi, createDemoApi } from '../../scripts/security/demo-api.js';

const COR = 'cor-1' as CorrelationId;
const entry = (over: Partial<Omit<AuditRecord, 'id'>> = {}): Omit<AuditRecord, 'id'> => ({
  occurredAt: '2026-08-31T09:00:00.000Z' as Instant,
  actorId: 'usr-1' as ActorId,
  actorRole: 'EXECUTIVE' as Role,
  action: 'READ',
  entityType: 'project',
  entityId: 'prj-001',
  fields: [],
  decision: 'GRANT',
  correlationId: COR,
  sourceIp: '198.51.100.10',
  userAgent: 'test',
  ...over,
});

describe('audit integrity (SECURITY_MODEL.md §5.3)', () => {
  it('exposes no operation that mutates or removes a past record', () => {
    const log = new InMemoryAuditLog();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(log) as object);
    expect(methods).not.toContain('update');
    expect(methods).not.toContain('delete');
    expect(methods).not.toContain('remove');
    expect(methods).not.toContain('clear');
  });

  it('hands back frozen records, so a caller cannot edit the log through its own result', async () => {
    const log = new InMemoryAuditLog();
    await log.record(entry());
    const [record] = log.all();
    expect(Object.isFrozen(record)).toBe(true);
    expect(() => {
      (record as unknown as { actorId: string }).actorId = 'usr-someone-else';
    }).toThrow();
    expect(log.all()[0]?.actorId).toBe('usr-1');
  });

  it('fails the operation when the audit write fails', async () => {
    const log = new InMemoryAuditLog();
    log.seal();
    await expect(log.record(entry())).rejects.toBeInstanceOf(AuditWriteFailed);
  });

  it('refuses a record with no actor or no entity type', async () => {
    const log = new InMemoryAuditLog();
    await expect(log.record(entry({ actorId: '' as ActorId }))).rejects.toBeInstanceOf(AuditWriteFailed);
    await expect(log.record(entry({ entityType: '' }))).rejects.toBeInstanceOf(AuditWriteFailed);
  });

  it('is queryable by actor, entity and time window (REQ-SEC-007)', async () => {
    const log = new InMemoryAuditLog();
    await log.record(entry({ actorId: 'usr-a' as ActorId, occurredAt: '2026-08-01T00:00:00.000Z' as Instant }));
    await log.record(entry({ actorId: 'usr-b' as ActorId, entityId: 'prj-002', occurredAt: '2026-08-15T00:00:00.000Z' as Instant }));
    await log.record(entry({ actorId: 'usr-a' as ActorId, occurredAt: '2026-08-31T00:00:00.000Z' as Instant }));

    expect((await log.query({ actorId: 'usr-a' as ActorId }, { correlationId: COR })).length).toBe(2);
    expect((await log.query({ entityId: 'prj-002' }, { correlationId: COR })).length).toBe(1);
    expect((await log.query({
      from: '2026-08-10T00:00:00.000Z' as Instant, to: '2026-08-20T00:00:00.000Z' as Instant,
    }, { correlationId: COR })).length).toBe(1);
  });

  it('separates access events from business events, for the SECURITY_ADMIN restriction', async () => {
    const log = new InMemoryAuditLog();
    await log.record(entry({ action: 'LOGIN', entityType: 'session' }));
    await log.record(entry({ action: 'READ' }));
    const all = log.all();
    expect(all.filter(isAccessEvent).length).toBe(1);
    expect(accessEventsOnly(all).every((r) => r.action === 'LOGIN')).toBe(true);
  });

  it('produces identical ids for an identical sequence, so audit assertions mean something', async () => {
    const a = new InMemoryAuditLog();
    const b = new InMemoryAuditLog();
    await a.record(entry());
    await b.record(entry());
    expect(a.all()[0]?.id).toBe(b.all()[0]?.id);
  });
});

describe('before/after fingerprints (SECURITY_MODEL.md §5.2)', () => {
  it('is key-order independent, so an unchanged state fingerprints identically', () => {
    const x = fingerprint(null, { a: 1, b: 2 });
    const y = fingerprint(null, { b: 2, a: 1 });
    expect(x.afterHash).toBe(y.afterHash);
  });

  it('names the fields that changed, not just that something did', () => {
    const fp = fingerprint({ rag: 'GREEN', reason: 'ok' }, { rag: 'RED', reason: 'ok' });
    expect(fp.changedFields).toEqual(['rag']);
    expect(fp.beforeHash).not.toBe(fp.afterHash);
  });

  it('reports a null before-hash when the entity did not previously exist', () => {
    expect(fingerprint(null, { rag: 'RED' }).beforeHash).toBeNull();
  });

  it('does not put the values themselves in the record', () => {
    const fp = fingerprint({ rate: '187.50' }, { rate: '210.00' });
    expect(JSON.stringify(fp)).not.toContain('187.50');
    expect(JSON.stringify(fp)).not.toContain('210.00');
  });
});

describe('audit through the live pipeline (REQ-SEC-006)', () => {
  let api: DemoApi;
  beforeEach(() => { api = createDemoApi(); });

  const login = async (username: string, actorId: string) => {
    const s = await api.login(username);
    return api.contextFor(actorId, s?.sessionId as never);
  };

  it('records a denial, with the reason, when access is refused', async () => {
    const ctx = await login('dir.emea', 'usr-dir-emea');
    const amer = await login('dir.amer', 'usr-dir-amer');
    const amerSet = await api.policy.resolveScope(amer.auth);
    const emeaSet = await api.policy.resolveScope(ctx.auth);
    const outOfScope = amerSet.projectIds.find((id) => !emeaSet.projectIds.includes(id)) as string;

    await api.dispatch({ method: 'GET', path: `/v1/projects/${outOfScope}`, query: {} }, ctx);
    const denials = api.audit.all().filter((r) => r.decision === 'DENY');
    expect(denials.length).toBe(1);
    expect(denials[0]?.reason).toMatch(/outside the caller's authorised set/);
    expect(denials[0]?.entityId).toBe(outOfScope);
  });

  it('records a sensitive read naming the commercial fields that were returned', async () => {
    const ctx = await login('exec.cdo', 'usr-exec-cdo');
    const list = await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, ctx);
    const id = (list.body as { data: { projectId: string }[] }).data[0]?.projectId as string;
    await api.dispatch({ method: 'GET', path: `/v1/projects/${id}/economics`, query: {} }, ctx);

    const reads = api.audit.all().filter((r) => r.action === 'READ' && r.fields.length > 0);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.at(-1)?.fields).toContain('forecastGmPercent');
  });

  it('records a write with a before/after fingerprint and the stated reason', async () => {
    const ctx = await login('exec.cdo', 'usr-exec-cdo');
    const list = await api.dispatch({ method: 'GET', path: '/v1/projects', query: {} }, ctx);
    const id = (list.body as { data: { projectId: string }[] }).data[0]?.projectId as string;
    await api.dispatch({
      method: 'POST', path: `/v1/projects/${id}/rag-override`, query: {},
      body: { rag: 'RED', reason: 'Contingency exhausted', expiresAt: '2026-09-30' },
    }, ctx);

    const write = api.audit.all().find((r) => r.action === 'OVERRIDE');
    expect(write).toBeDefined();
    expect(write?.reason).toContain('Contingency exhausted');
    expect(write?.reason).toMatch(/before=[0-9a-f]+ after=[0-9a-f]+/);
    expect(write?.fields).toContain('rag');
  });

  it('audits the login itself', async () => {
    await login('exec.cdo', 'usr-exec-cdo');
    expect(api.audit.all().some((r) => r.action === 'LOGIN')).toBe(true);
  });
});

describe('telemetry never carries what the logs forbid (SECURITY_MODEL.md §7)', () => {
  it('redacts anything whose key names money, a rate, or a credential', () => {
    const out = redact({
      projectId: 'prj-001',
      forecastGmPercent: '0.229',
      blendedCostRate: '187.50',
      contractValue: '8000000.00',
      password: 'hunter2',
      authorization: 'Bearer abc',
      sessionCookie: 'x',
      employeeName: 'A Person',
    });
    expect(out['projectId']).toBe('prj-001');
    for (const key of ['forecastGmPercent', 'blendedCostRate', 'contractValue', 'password', 'authorization', 'employeeName']) {
      expect(out[key], key).toBe(REDACTED);
    }
  });

  it('truncates a long value rather than logging a payload', () => {
    const out = redact({ note: 'x'.repeat(1000) });
    expect(String(out['note']).length).toBeLessThan(MAX_ATTRIBUTE_LENGTH + 20);
    expect(String(out['note'])).toContain('[truncated]');
  });

  it('never serialises an object or an array into an attribute', () => {
    const out = redact({ payload: { margin: '0.22' }, list: [1, 2, 3] });
    expect(out['payload']).toBe(REDACTED);
    expect(out['list']).toBe(REDACTED);
  });

  it('applies redaction on spans, events, logs and metrics alike', () => {
    const exporter = new InMemoryExporter();
    const t = new Telemetry(exporter, () => '2026-08-31T09:00:00.000Z' as Instant, 'trace-1');
    const span = t.startSpan('op', { contractValue: '8000000.00' });
    t.addEvent(span, 'e', { costRate: '187.50' });
    t.endSpan(span);
    t.log('INFO', 'message', { password: 'x' });
    t.counter('c', 1, { marginErosion: '-0.05' });

    const serialised = JSON.stringify(exporter);
    expect(serialised).not.toContain('8000000.00');
    expect(serialised).not.toContain('187.50');
    expect(serialised).not.toContain('hunter2');
    expect(serialised).not.toContain('-0.05');
  });

  it('counts authorization denials as a metric a SOC can alert on', async () => {
    const api = createDemoApi();
    const s = await api.login('dir.emea');
    const ctx = api.contextFor('usr-dir-emea', s?.sessionId as never);
    await api.dispatch({ method: 'GET', path: '/v1/projects/prj-nonexistent', query: {} }, ctx);
    const denials = api.telemetryExporter.metrics.filter((m) => m.name === 'gldi.authz.denials');
    expect(denials.length).toBeGreaterThan(0);
  });
});
