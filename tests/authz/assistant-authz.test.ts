/**
 * Assistant authorization - the security gates, asserted below the answer layer.
 *
 * `tests/integration/assistant.test.ts` asserts what an *answer* contains. This file asserts the
 * things that must hold **whether or not an answer is ever produced**: that the tool port cannot
 * reach outside the resolved set, that a denial is indistinguishable from a non-existent object,
 * that field shaping happens beneath the assistant rather than inside it, and that no write path
 * exists to attack.
 *
 * It lives in `tests/authz` because that is the suite the repository's own command line runs
 * (`npm run test -- tests/authz`), and an assistant authorization test that is not in it is a test
 * nobody runs when they mean to check authorization.
 */
import { describe, expect, it } from 'vitest';
import { ALL_TOOLS, type AssistantToolId } from '@contexts/ai-intelligence';
import type {
  ActorId, AuthorizationContext, CorrelationId, Role, SessionId,
} from '@platform/authz';
import { CAPABILITY_MATRIX, CLASSIFICATION_MATRIX } from '@platform/authz';
import { GatewayToolPort, ROUTES, TOOL_VIEW, VIEW_ROUTES, ask, classify, shape } from '@app';
import { DEMO_NOW, createDemoApi } from '../../scripts/security/demo-api.js';

async function bind(username: string, actorId: string) {
  const api = createDemoApi();
  const session = await api.login(username);
  if (session === undefined) throw new Error(`login failed: ${username}`);
  const ctx = api.contextFor(actorId, session.sessionId);
  const authorised = (await api.policy.resolveScope(ctx.auth)).projectIds;
  return { api, ctx, authorised, port: new GatewayToolPort(ctx, api.gateway, DEMO_NOW, authorised) };
}

describe('the tool port cannot reach outside the resolved set', () => {
  it('denies every project-scoped tool for an out-of-scope id', async () => {
    const emea = await bind('dir.emea', 'usr-dir-emea');
    const outside = ['prj-001', 'prj-011', 'prj-042', 'prj-089']
      .find((id) => !emea.authorised.includes(id)) ?? 'prj-011';
    expect(emea.authorised).not.toContain(outside);

    const projectTools: readonly AssistantToolId[] = [
      'project.executiveHealth.get', 'project.marginDrivers.get', 'project.forwardRisk.get',
      'project.recoveryOptions.get', 'project.lateDetection.get', 'evidence.get',
    ];
    for (const tool of projectTools) {
      await expect(
        emea.port.invoke(tool, { projectId: outside }),
        `${tool} must deny an out-of-scope project`,
      ).rejects.toThrow();
    }
  });

  it('denies a fabricated id exactly as it denies a real out-of-scope one', async () => {
    const emea = await bind('dir.emea', 'usr-dir-emea');
    const outside = ['prj-001', 'prj-011', 'prj-042'].find((id) => !emea.authorised.includes(id)) ?? 'prj-011';
    let realMessage = '';
    let fakeMessage = '';
    try { await emea.port.invoke('project.executiveHealth.get', { projectId: outside }); }
    catch (e) { realMessage = (e as Error).message; }
    try { await emea.port.invoke('project.executiveHealth.get', { projectId: 'prj-999' }); }
    catch (e) { fakeMessage = (e as Error).message; }
    expect(realMessage).toBe('Not found');
    expect(fakeMessage).toBe(realMessage);
  });

  it('records a DENY in the trace without disclosing what was denied', async () => {
    const emea = await bind('dir.emea', 'usr-dir-emea');
    try { await emea.port.invoke('project.marginDrivers.get', { projectId: 'prj-999' }); } catch { /* expected */ }
    const denied = emea.port.trace.filter((t) => t.decision === 'DENY');
    expect(denied.length).toBeGreaterThan(0);
    for (const t of denied) expect(t.objects).toHaveLength(0);
  });
});

describe('field shaping happens beneath the assistant, not inside it', () => {
  /**
   * ## What this suite can and cannot prove with a persona
   *
   * **No seeded persona holds project scope while lacking `COMMERCIAL_CONFIDENTIAL`.** Measured:
   * `dm.mobility` is the only `DELIVERY_MANAGER` and resolves to **zero** projects; every other
   * persona holds the classification. So a persona-level test of "the Delivery Manager asks a
   * margin question and gets no figure" passes because the caller can see **no projects at all** -
   * not because a commercial field was shaped out.
   *
   * An earlier version of this file asserted exactly that and was green for the wrong reason, which
   * is the C-20 failure shape: a test whose outcome is right and whose mechanism is absent. The
   * mechanism is therefore asserted **directly**, against the classification matrix and the route
   * table, and the persona test below asserts only what it actually demonstrates.
   *
   * Phase 7 reached the same conclusion about the same gap and recorded it rather than staging a
   * persona for it (`scripts/design/build-command-center.tsx`). Carried as **DR-076**.
   */
  it('denies the commercial route to a role that cannot read commercial fields', () => {
    // The mechanism, asserted where it lives: the margin route requires a capability the Delivery
    // Manager does not hold, so retrieval never runs and there is nothing for the assistant to
    // withhold, paraphrase or leak.
    const marginRoute = ROUTES.find((r) => r.path.endsWith('/margin-intelligence'));
    expect(marginRoute?.capability).toBe('project.viewCommercial');
    expect(CAPABILITY_MATRIX['project.viewCommercial']).not.toContain('DELIVERY_MANAGER');
    expect(CLASSIFICATION_MATRIX['COMMERCIAL_CONFIDENTIAL']).not.toContain('DELIVERY_MANAGER');
  });

  it('omits an unauthorised field rather than masking it (AC-6, the mechanism)', () => {
    const fields = classify([
      ['projectId', 'PUBLIC_INTERNAL'],
      ['forecastGmPercent', 'COMMERCIAL_CONFIDENTIAL'],
    ]);
    const value = { projectId: 'prj-011', forecastGmPercent: '12.4%' };
    const ctx = (role: Role): AuthorizationContext => ({
      actorId: 'usr-x' as ActorId, role, sessionId: 'ses-x' as SessionId,
      correlationId: 'cor-x' as CorrelationId, scope: [],
    });

    const forExec = shape('marginIntelligence', value, fields, ctx('EXECUTIVE'));
    const forDm = shape('marginIntelligence', value, fields, ctx('DELIVERY_MANAGER'));

    expect(forExec.payload.forecastGmPercent).toBe('12.4%');
    // Absent, not null, not "***". A masked field still discloses that the field applies.
    expect('forecastGmPercent' in forDm.payload).toBe(false);
    expect(forDm.withheld).toContain('forecastGmPercent');
    expect(JSON.stringify(forDm.payload)).not.toContain('12.4');
  });

  it('gives a caller with an empty authorised set nothing at all, generically', async () => {
    const dm = await bind('dm.mobility', 'usr-dm-mobility');
    // Stated precisely: this persona resolves to zero projects, so this asserts empty-scope
    // behaviour and NOT field shaping. The two were conflated once; they are not conflated here.
    expect(dm.authorised).toHaveLength(0);
    await expect(dm.port.invoke('project.marginDrivers.get', { projectId: 'prj-011' }))
      .rejects.toThrow('Not found');
  });

  it('never returns a redaction placeholder in any claim', async () => {
    const cdo = await bind('exec.cdo', 'usr-exec-cdo');
    const result = await cdo.port.invoke('project.executiveHealth.get', { projectId: 'prj-011' });
    for (const c of result.claims) {
      expect(c.text).not.toContain('[restricted]');
      expect(c.display ?? '').not.toContain('[restricted]');
    }
  });
});

describe('the assistant capability is the gate, and it is a read capability', () => {
  it('is granted to five roles and withheld from the security administrator', () => {
    const roles = CAPABILITY_MATRIX['assistant.use'];
    expect(roles).toContain('EXECUTIVE');
    expect(roles).toContain('PORTFOLIO_DIRECTOR');
    expect(roles).toContain('DELIVERY_MANAGER');
    expect(roles).toContain('FINANCE_CONTROLLER');
    expect(roles).toContain('ASSURANCE_AUDITOR');
    expect(roles).not.toContain('SECURITY_ADMIN');
  });

  it('reaches only GET routes, so there is no write path to attack', () => {
    for (const tool of ALL_TOOLS) {
      const view = TOOL_VIEW[tool];
      if (view === 'REGISTRY') continue;
      expect(VIEW_ROUTES[view].method, tool).toBe('GET');
    }
  });

  it('emits no WRITE audit record for any assistant interaction', async () => {
    const cdo = await bind('exec.cdo', 'usr-exec-cdo');
    for (const q of [
      'Why is prj-011 the status it is?',
      'Set prj-011 to green.',
      'Approve the recovery plan for prj-001.',
      'Change the ETC on prj-011 to zero.',
    ]) {
      await ask(q, {
        ctx: cdo.ctx, tools: cdo.port, asOf: DEMO_NOW,
        scopeLabel: 'all', populationCount: cdo.authorised.length,
      });
    }
    const writes = cdo.api.audit.all().filter((a) => a.action === 'WRITE' || a.action === 'OVERRIDE');
    expect(writes, 'the assistant must never produce a write audit record').toHaveLength(0);
  });

  /**
   * A mutation request is not an error and not a partial success: it is a question the product does
   * not answer, and it must be refused in the same shape as any other unsupported question.
   */
  it('refuses a mutation request rather than partially honouring it', async () => {
    const cdo = await bind('exec.cdo', 'usr-exec-cdo');
    const r = await ask('Set prj-011 to green and approve its recovery plan.', {
      ctx: cdo.ctx, tools: cdo.port, asOf: DEMO_NOW,
      scopeLabel: 'all', populationCount: cdo.authorised.length,
    });
    expect(r.materialClaims).toHaveLength(0);
    expect(r.refusal).toBeDefined();
  });
});

describe('scope is resolved per caller, never shared between them', () => {
  it('keeps two personas evidence sets disjoint under interleaved questions', async () => {
    const cdo = await bind('exec.cdo', 'usr-exec-cdo');
    const emea = await bind('dir.emea', 'usr-dir-emea');
    const question = 'Where should I intervene first?';

    const a1 = await ask(question, {
      ctx: cdo.ctx, tools: cdo.port, asOf: DEMO_NOW, scopeLabel: 'all',
      populationCount: cdo.authorised.length,
    });
    const b1 = await ask(question, {
      ctx: emea.ctx, tools: emea.port, asOf: DEMO_NOW, scopeLabel: 'emea',
      populationCount: emea.authorised.length,
    });
    const a2 = await ask(question, {
      ctx: cdo.ctx, tools: cdo.port, asOf: DEMO_NOW, scopeLabel: 'all',
      populationCount: cdo.authorised.length,
    });

    // The interleaved run must not have contaminated either side.
    expect(a2.evidence.map((c) => c.ref.entityId)).toEqual(a1.evidence.map((c) => c.ref.entityId));
    for (const c of b1.evidence) {
      if (c.ref.entityType !== 'project' || c.ref.entityId === '') continue;
      expect(emea.authorised).toContain(c.ref.entityId);
    }
    expect(b1.scope.authorisedProjectCount).toBeLessThan(a1.scope.authorisedProjectCount);
  });
});
