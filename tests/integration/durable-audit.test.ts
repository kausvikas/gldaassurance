/**
 * Answer lineage: written on every path, and surviving the process that wrote it (§2–§4).
 *
 * This file exists because of a defect that no test could have caught by being stricter about what
 * the audit record *contains*: `auditAssistantQuery` was correct, tested, and **called by nothing in
 * the deployed product**. Step 14 was documented in the orchestrator's own header and executed only
 * in the static build script. The live Assistant answered questions and recorded nothing at all.
 *
 * So the assertions here are deliberately about *whether a record exists*, on the answer path and on
 * every refusal path, and whether the same record can still be read by a different process. A test
 * that only checked field shapes would have passed against a product that never wrote one.
 */
import { describe, expect, it } from 'vitest';
import {
  GatewayToolPort, InMemoryStores, NEW_CONVERSATION, SourceRegistry, askWithPlan, vocabularyFrom,
} from '@app';
import type { PlannerVocabulary } from '@app';
import { DEMO_NOW, createDemoApi } from '../../scripts/security/demo-api.js';
import { knowledgeDemo } from '../../scripts/fixtures/demo-knowledge.js';

interface Harness {
  readonly ctx: never;
  readonly authorised: readonly string[];
  readonly vocabulary: PlannerVocabulary;
  readonly api: ReturnType<typeof createDemoApi>;
}

async function harness(persona = 'exec.cdo', actorId = 'usr-exec-cdo'): Promise<Harness> {
  const api = createDemoApi();
  const login = await api.login(persona);
  if (login === undefined) throw new Error('login failed');
  const ctx = api.contextFor(actorId, login.sessionId) as never;
  const authorised = (await api.policy.resolveScope(
    (ctx as unknown as { auth: never }).auth,
  )).projectIds;
  const discovered = await vocabularyFrom({
    ctx, gateway: api.gateway, asOf: DEMO_NOW, authorisedProjectIds: authorised,
  });
  return { ctx, authorised, api, vocabulary: { ...discovered, accounts: [], customers: [] } };
}

/** Asks one question through the whole orchestration, writing lineage to `stores`. */
async function ask(h: Harness, stores: InMemoryStores, question: string) {
  const demo = knowledgeDemo(h.authorised, h.authorised[0] ?? 'prj-001');
  const tools = new GatewayToolPort(
    h.ctx, h.api.gateway, DEMO_NOW, h.authorised, demo.registry,
  );
  return askWithPlan(question, {
    ctx: h.ctx, tools, asOf: DEMO_NOW, scopeLabel: 'CDO',
    populationCount: h.authorised.length, vocabulary: h.vocabulary, knownMetricIds: [],
    state: NEW_CONVERSATION, knowledge: demo.registry,
    auditAs: { persona: 'exec.cdo', durable: stores.audit },
  });
}

/** A second process reading the same store — which is what a restart is. */
async function afterRestart(stores: InMemoryStores) {
  const next = new SourceRegistry(stores);
  await next.hydrate();
  return next.stores.audit.recent(100);
}

describe('answer lineage survives the process that produced it', () => {
  it('writes exactly one event per question, and it is readable by another process', async () => {
    const h = await harness();
    const stores = new InMemoryStores();
    await ask(h, stores, 'What is the portfolio forecast margin across the whole portfolio?');

    const before = await stores.audit.recent(100);
    expect(before.length).toBe(1);

    const after = await afterRestart(stores);
    expect(after.length).toBe(1);
    // Same event, not an equivalent one. A lineage store that produced a *similar* record after a
    // restart would be a second account of what happened, which is worse than none.
    expect(after[0]).toEqual(before[0]);
  });

  it('records the full lineage the freeze requires', async () => {
    const h = await harness();
    const stores = new InMemoryStores();
    await ask(h, stores, 'What is the portfolio forecast margin across the whole portfolio?');
    const [event] = await afterRestart(stores);
    expect(event).toBeDefined();

    for (const field of [
      'eventId', 'occurredAt', 'actorId', 'actorRole', 'persona', 'authorisedProjectCount',
      'questionDigest', 'plan', 'planOrigin', 'planValidation', 'tools', 'objects',
      'sourceVersions', 'claimIds', 'composer', 'answerability', 'groundingValidation',
      'decision', 'executiveAuthority', 'assessmentStatus', 'responseId',
    ]) {
      expect(event?.[field], `lineage must carry "${field}"`).toBeDefined();
    }
    expect(event?.['decision']).toBe('GRANT');
    expect(event?.['planValidation']).toBe('ACCEPTED');
    expect(event?.['groundingValidation']).toBe('PASS');
    expect((event?.['tools'] as string[]).length).toBeGreaterThan(0);
  });

  it('records a refusal, with its reason, not only a success', async () => {
    /*
     * `SECURITY_MODEL.md` §5.3: denials are recorded as well as grants. A log that records only
     * what succeeded answers the least interesting half of every question an auditor has.
     */
    const h = await harness();
    const stores = new InMemoryStores();
    await ask(h, stores, 'What is the probability that Atlas fails?');
    const [event] = await afterRestart(stores);
    expect(event?.['decision']).toBe('DENY');
    expect(event?.['refusal']).not.toBeNull();
  });

  it('records a turn the plan validator refused, distinguishably from one it never reached', async () => {
    const h = await harness();
    const stores = new InMemoryStores();
    await ask(h, stores, 'zzz qqq nothing this product understands');
    const [event] = await afterRestart(stores);
    // Not "rejected": no plan was produced, which is a different fact about the product.
    expect(event?.['planValidation']).toBe('NOT_REACHED');
    expect(event?.['decision']).toBe('DENY');
  });

  it('never writes prose, reasoning or a credential into the lineage', async () => {
    const h = await harness();
    const stores = new InMemoryStores();
    const question = 'Which Green projects should I worry about over the next 60 days?';
    const answer = await ask(h, stores, question);
    const text = JSON.stringify(await afterRestart(stores));

    expect(text).not.toContain(question);
    expect(text).not.toContain(answer.response.answer.slice(0, 40));
    for (const claim of answer.response.materialClaims) {
      // Identifiers travel; the sentences they identify do not.
      expect(text).toContain(claim.claimId);
      expect(text).not.toContain(claim.text.slice(0, 40));
    }
    expect(/sk-ant|api[_-]?key|authorization/i.test(text)).toBe(false);
  });

  it('reconciles: the lineage describes the answer that was actually returned', async () => {
    /*
     * §4. Audit is not allowed to become a separate truth path, and the way that goes wrong is not
     * malice — it is a second assembly of the same facts that drifts. The durable document is derived
     * from the same values as the response, and this is what holds that claim honest.
     */
    const h = await harness();
    const stores = new InMemoryStores();
    const answer = await ask(h, stores, 'Rank the portfolio by margin erosion.');
    const [event] = await afterRestart(stores);

    expect(event?.['planOrigin']).toBe(answer.plan?.origin);
    expect((event?.['plan'] as { shape?: string })?.shape).toBe(answer.plan?.shape);
    expect(event?.['answerability']).toBe(answer.answerability.classification);
    expect(event?.['composer']).toBe(answer.response.composer);
    expect(event?.['executiveAuthority']).toBe(answer.response.executiveAuthority);
    expect(event?.['assessmentStatus']).toBe(answer.response.assessmentStatus);
    expect(event?.['claimIds']).toEqual(answer.response.materialClaims.map((c) => c.claimId));
    expect(event?.['authorisedProjectCount']).toBe(answer.response.scope.authorisedProjectCount);
  });

  it('keeps one caller\'s lineage attributable to that caller', async () => {
    const wide = await harness('exec.cdo', 'usr-exec-cdo');
    const narrow = await harness('dir.emea', 'usr-dir-emea');
    const stores = new InMemoryStores();

    await ask(wide, stores, 'What is the portfolio forecast margin across the whole portfolio?');
    await ask(narrow, stores, 'What is the portfolio forecast margin across the whole portfolio?');

    const events = await afterRestart(stores);
    expect(events.length).toBe(2);
    expect(new Set(events.map((e) => String(e['actorId']))).size).toBe(2);
    // Different callers, different resolved scopes — recorded, so "who could see what" is answerable
    // after the fact rather than only at the moment it happened.
    expect(new Set(events.map((e) => e['authorisedProjectCount'])).size).toBe(2);
  });

  it('writes nothing when no audit sink is composed, rather than failing quietly', async () => {
    // An absent `auditAs` is a legitimate test composition. What must not happen is a *silent*
    // absence in a composition that answers real callers, which is why `server/main.ts` supplies it
    // and `server:check` asserts the events exist.
    const h = await harness();
    const stores = new InMemoryStores();
    const demo = knowledgeDemo(h.authorised, h.authorised[0] ?? 'prj-001');
    const tools = new GatewayToolPort(h.ctx, h.api.gateway, DEMO_NOW, h.authorised, demo.registry);
    await askWithPlan('What is the portfolio forecast margin across the whole portfolio?', {
      ctx: h.ctx, tools, asOf: DEMO_NOW, scopeLabel: 'CDO',
      populationCount: h.authorised.length, vocabulary: h.vocabulary, knownMetricIds: [],
      state: NEW_CONVERSATION, knowledge: demo.registry,
    });
    expect((await stores.audit.recent(10)).length).toBe(0);
  });

  it('fails the answer when the lineage cannot be written', async () => {
    /*
     * `SECURITY_MODEL.md` §5.3: a failure to audit fails the operation. An answer delivered without
     * its lineage is exactly what this phase was reopened to close, so a store that refuses must
     * surface as a failed request rather than as a successful answer with a hole behind it.
     */
    const h = await harness();
    const stores = new InMemoryStores();
    const broken = {
      ...stores,
      audit: {
        ...stores.audit,
        append: () => Promise.reject(new Error('the lineage store refused the write')),
      },
    };
    const demo = knowledgeDemo(h.authorised, h.authorised[0] ?? 'prj-001');
    const tools = new GatewayToolPort(h.ctx, h.api.gateway, DEMO_NOW, h.authorised, demo.registry);
    await expect(askWithPlan('Rank the portfolio by margin erosion.', {
      ctx: h.ctx, tools, asOf: DEMO_NOW, scopeLabel: 'CDO',
      populationCount: h.authorised.length, vocabulary: h.vocabulary, knownMetricIds: [],
      state: NEW_CONVERSATION, knowledge: demo.registry,
      auditAs: { persona: 'exec.cdo', durable: broken.audit },
    })).rejects.toThrow(/refused/);
  });
});
