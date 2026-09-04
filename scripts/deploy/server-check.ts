/**
 * `npm run server:check` — starts the trusted runtime, exercises every route, and asserts the
 * transport controls ADR-0032 §6 discharges DR-029 with.
 *
 * This is a **verification script rather than a unit test** on purpose. The properties it checks are
 * about a listening socket: a CORS header that is absent, a body that is refused mid-read, a header
 * that is present on an error response. Asserting those against a handler function would prove
 * something about the function and nothing about the server, and DR-029's obligations are about the
 * server.
 *
 * It exits non-zero on the first failure, so it is usable as a gate.
 */

/*
 * The access code is set **before** the runtime module is loaded, and the runtime is therefore
 * imported dynamically further down.
 *
 * `server/main.ts` reads its configuration once, at module evaluation, which is the right shape for a
 * composition root: configuration that can change under a running process is configuration nobody can
 * reason about. The consequence here is that a static import would evaluate it before this line ran,
 * and the check would then be exercising a deployment with no access code — which is precisely the
 * state this script exists to prove is closed.
 */
const ACCESS_CODE = 'server-check-access-code';
process.env['GLDI_DEMO_ACCESS_CODE'] = ACCESS_CODE;
process.env['GLDI_SESSION_KEY'] = 'server-check-signing-key';

const PORT = 8791;
const BASE = `http://127.0.0.1:${String(PORT)}`;

const failures: string[] = [];
let checks = 0;

function check(label: string, condition: boolean, detail = ''): void {
  checks += 1;
  if (condition) { console.log(`  ok   ${label}`); return; }
  failures.push(`${label}${detail === '' ? '' : ` — ${detail}`}`);
  console.log(`  FAIL ${label}${detail === '' ? '' : ` — ${detail}`}`);
}

async function main(): Promise<void> {
  const { buildRuntime } = await import('../../server/main.js');
  const server = buildRuntime().listen(PORT);
  await new Promise((resolve) => { setTimeout(resolve, 250); });

  try {
    console.log('\ntransport controls');

    const health = await fetch(`${BASE}/api/health`);
    check('health responds', health.status === 200);
    for (const [header, expected] of [
      ['x-content-type-options', 'nosniff'],
      ['x-frame-options', 'DENY'],
      ['referrer-policy', 'no-referrer'],
      ['cache-control', 'no-store'],
    ] as const) {
      check(`${header} is set`, health.headers.get(header) === expected,
        `got ${health.headers.get(header) ?? 'nothing'}`);
    }
    check('content-security-policy forbids everything',
      (health.headers.get('content-security-policy') ?? '').includes("default-src 'none'"));

    const unmapped = await fetch(`${BASE}/api/does-not-exist`);
    check('an unmapped route is the generic not-found', unmapped.status === 404);
    check('the not-found carries the same headers as a success',
      unmapped.headers.get('x-content-type-options') === 'nosniff');

    // CORS: an origin that is not allow-listed receives no allow header at all. Echoing the origin
    // back is the mistake that looks like an allow-list and is not one.
    const cross = await fetch(`${BASE}/api/health`, { headers: { origin: 'https://evil.example' } });
    check('CORS denies an unlisted origin',
      cross.headers.get('access-control-allow-origin') === null,
      cross.headers.get('access-control-allow-origin') ?? '');
    check('credentials are never allowed',
      cross.headers.get('access-control-allow-credentials') === null);

    const oversize = await fetch(`${BASE}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'x'.repeat(400_000) }),
    });
    check('an oversized body is refused', oversize.status === 413, `got ${String(oversize.status)}`);

    const malformed = await fetch(`${BASE}/api/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json',
    });
    check('a malformed body is refused', malformed.status === 400);

    console.log('\naccess control');

    const anonymousAsk = async (path: string, body: unknown) => (await fetch(`${BASE}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })).status;

    check('an anonymous ask is refused',
      await anonymousAsk('/api/ask', { question: 'What is the portfolio forecast margin?' }) === 401);
    check('an anonymous profile is refused',
      await anonymousAsk('/api/ingest/profile', { fileName: 'x.csv', contentBase64: 'YQ==' }) === 401);
    check('an anonymous structured ingest is refused',
      await anonymousAsk('/api/ingest/structured',
        { fileName: 'x.csv', contentBase64: 'YQ==', identityField: 'id' }) === 401);
    check('an anonymous document ingest is refused',
      await anonymousAsk('/api/ingest/document', { fileName: 'x.pdf', contentBase64: 'YQ==' }) === 401);
    check('an anonymous source listing is refused',
      (await fetch(`${BASE}/api/sources`)).status === 401);

    /*
     * The same routes with a body they cannot read. Still 401, never 400.
     *
     * A route that validates the body first tells an unauthenticated caller that it exists, what
     * shape it wants, and when they have guessed that shape right — a small oracle, and a free one
     * to close by checking the caller before reading anything.
     */
    for (const path of ['/api/ingest/profile', '/api/ingest/structured', '/api/ingest/document']) {
      check(`an anonymous ${path} with a malformed body is still 401, not 400`,
        await anonymousAsk(path, {}) === 401);
    }

    // A session is not issued without the code, and the refusal does not say which half was wrong.
    const noCode = await fetch(`${BASE}/api/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: 'exec.cdo' }),
    });
    check('a session without an access code is refused', noCode.status === 401,
      `got ${String(noCode.status)}`);
    const wrongCode = await fetch(`${BASE}/api/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: 'exec.cdo', accessCode: 'not-the-code' }),
    });
    check('a session with the wrong access code is refused', wrongCode.status === 401);
    const unknownPersona = await fetch(`${BASE}/api/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: 'exec.root', accessCode: ACCESS_CODE }),
    });
    check('an unknown persona is refused with the same message as a bad code',
      unknownPersona.status === 401
      && JSON.stringify(await unknownPersona.json()) === JSON.stringify(await wrongCode.json()));

    console.log('\nsession and query');

    const sessionResponse = await fetch(`${BASE}/api/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: 'exec.cdo', accessCode: ACCESS_CODE }),
    });
    const sessionBody = await sessionResponse.json() as {
      data?: { token?: string; authorisedProjectCount?: number };
      demoMarker?: string;
    };
    const token = sessionBody.data?.token ?? '';
    check('a session is issued', token !== '');
    check('the envelope carries the demo marker',
      (sessionBody.demoMarker ?? '').includes('SYNTHETIC'), sessionBody.demoMarker ?? '');
    check('the session resolves an authorised set',
      (sessionBody.data?.authorisedProjectCount ?? 0) > 0);

    const authorised = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

    const ask = async (question: string, state?: unknown, narrate = false) => {
      const response = await fetch(`${BASE}/api/ask`, {
        method: 'POST', headers: authorised,
        body: JSON.stringify({ question, state, narrate }),
      });
      return { status: response.status, body: await response.json() as { data?: Record<string, unknown> } };
    };

    const margin = await ask('What is the portfolio forecast margin across the whole portfolio?');
    check('a governed question is answered', margin.status === 200);
    check('the governed portfolio margin reconciles with the frozen baseline',
      String(margin.body.data?.['answer'] ?? '').includes('20.21%'),
      String(margin.body.data?.['answer'] ?? '').slice(0, 120));
    check('the resolved plan is disclosed', margin.body.data?.['plan'] !== undefined);
    check('the answer carries claims with provenance',
      Array.isArray(margin.body.data?.['claims'])
      && (margin.body.data?.['claims'] as unknown[]).length > 0);

    const turn1 = await ask('Which Green projects should I worry about over the next 60 days?');
    const turn2 = await ask('Only Automotive.', turn1.body.data?.['state']);
    check('a conversation refines rather than restarting',
      String(turn2.body.data?.['scopeLine'] ?? '').includes('Mobility'),
      String(turn2.body.data?.['scopeLine'] ?? ''));

    const probability = await ask('What is the probability that Atlas fails?');
    check('a probability question is declined', probability.body.data?.['refusal'] !== null);

    console.log('\ntoken integrity and caller isolation');

    /*
     * The token's persona is signed, so raising it is not a matter of editing the string.
     *
     * This is the attack the old design could not survive: a caller who could name their own persona
     * on each request could name `exec.cdo` and take the whole portfolio. Here the persona is inside
     * the signature, so changing it invalidates the token, and the four cases below are the four
     * shapes that attempt is likely to take.
     */
    /*
     * Two callers, one process, different portfolios.
     *
     * The narrow persona is not merely shown less — it is *told* less: the same question resolves a
     * different authorised population, and a project outside that population is refused rather than
     * hidden. Asserting the counts differ is what distinguishes server-side authorization from a
     * filtered view of a full answer.
     */
    const narrowSession = await fetch(`${BASE}/api/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: 'dm.mobility', accessCode: ACCESS_CODE }),
    });
    const narrowBody = await narrowSession.json() as {
      data?: { token?: string; authorisedProjectCount?: number };
    };
    const narrowToken = narrowBody.data?.token ?? '';
    check('a second persona receives its own session', narrowToken !== '' && narrowToken !== token);
    check('the second persona is authorised for a smaller population',
      (narrowBody.data?.authorisedProjectCount ?? 0)
        < (sessionBody.data?.authorisedProjectCount ?? 0),
      `${String(narrowBody.data?.authorisedProjectCount)} vs ${String(sessionBody.data?.authorisedProjectCount)}`);

    const swap = (index: number, value: string): string => {
      const parts = token.split('.');
      parts[index] = value;
      return parts.join('.');
    };
    const b64 = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

    const forged = [
      ['a token with no signature', token.split('.').slice(0, 4).join('.')],
      /*
       * The attack the persona field exists to resist: the *narrow* caller's own valid token,
       * re-pointed at the widest persona in the product, in the exact encoding the server uses.
       *
       * Forging it from the exec token would have proved nothing — it already says `exec.cdo`, so
       * the "forgery" was the original, and it was correctly accepted. The escalation only means
       * something when it starts from a caller who is not entitled to the scope they are claiming.
       */
      ['a narrow token re-pointed at the widest scope',
        (() => {
          const parts = narrowToken.split('.');
          parts[0] = b64('exec.cdo');
          return parts.join('.');
        })()],
      ['a token whose expiry has been extended',
        swap(2, String(Number.parseInt(token.split('.')[2] ?? '0', 10) + 86_400_000))],
      ['a token with somebody else\u2019s signature', swap(4, b64('anything-at-all'))],
      ['an entirely invented token', `${b64('exec.cdo')}.1.99999999999999.nonce.c2lnbmF0dXJl`],
    ] as const;
    for (const [label, candidate] of forged) {
      const response = await fetch(`${BASE}/api/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${candidate}` },
        body: JSON.stringify({ question: 'What is the portfolio forecast margin?' }),
      });
      check(`${label} is refused`, response.status === 401, `got ${String(response.status)}`);
    }

    const narrowAsk = await fetch(`${BASE}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${narrowToken}` },
      body: JSON.stringify({ question: 'Rank the portfolio by margin erosion.', narrate: false }),
    });
    const narrowAnswer = await narrowAsk.json() as { data?: Record<string, unknown> };
    check('the narrow persona does not receive the portfolio ranking',
      narrowAnswer.data?.['refusal'] !== null
      || !String(narrowAnswer.data?.['answer'] ?? '').includes('20.21%'),
      String(narrowAnswer.data?.['answer'] ?? '').slice(0, 120));

    // Rate limiting: the ingest bucket is the tighter one, and exceeding it must refuse rather than
    // queue. Eleven attempts against a limit of ten, all with a body too small to parse.
    let limited = false;
    for (let i = 0; i < 12; i += 1) {
      const response = await fetch(`${BASE}/api/ingest/profile`, {
        method: 'POST', headers: authorised,
        body: JSON.stringify({ fileName: 'x.csv', contentBase64: 'YSxiCjEsMg==' }),
      });
      if (response.status === 429) { limited = true; break; }
    }
    check('a caller exceeding the ingest limit is refused', limited);

    /*
     * With no durable store configured — which is exactly this local run — an ingest must refuse.
     *
     * A receipt for content the process will lose at its next restart is worse than no upload at
     * all: the person has been told the opposite of what happened. So the honest answer is 503 with
     * the reason, and this asserts it is not quietly a 200.
     */
    // A fresh session, because the rate-limit check above deliberately exhausted the other one's
    // ingest bucket — and a limit that leaked between sittings would be its own defect.
    const freshToken = ((await (await fetch(`${BASE}/api/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: 'exec.cdo', accessCode: ACCESS_CODE }),
    })).json()) as { data?: { token?: string } }).data?.token ?? '';
    const notDurable = await fetch(`${BASE}/api/ingest/structured`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${freshToken}` },
      body: JSON.stringify({
        fileName: 'x.csv', contentBase64: 'YSxiCjEsMg==', identityField: 'a',
        fields: [{ sourceField: 'b', concept: 'financial.actualCost' }],
      }),
    });
    const notDurableBody = await notDurable.json() as { error?: string; detail?: string };
    check('an ingest with no durable store is refused rather than accepted and lost',
      notDurable.status === 503 && notDurableBody.error === 'ingestion_unavailable',
      `${String(notDurable.status)} ${notDurableBody.error ?? ''}`);
    check('the refusal says what is wrong',
      (notDurableBody.detail ?? '').includes('loses them when it restarts'),
      notDurableBody.detail ?? '');

    console.log('\nopen assistant, closed ingestion');

    /*
     * A deployment may open the Assistant without opening the doors.
     *
     * Asking is bounded read-only work over a fixed synthetic portfolio; uploading is unbounded work
     * over bytes the caller chose, plus durable storage that accumulates. This asserts the two are
     * genuinely separable — that an `ask` session really can ask, and really cannot write.
     */
    const open = new (await import('../../server/access.js')).AccessControl(
      { demoAccessCode: ACCESS_CODE, sessionSigningKey: 'server-check-signing-key',
        sessionLifetimeMs: 8 * 60 * 60 * 1000, openAccess: 'ask' },
      () => new Date().toISOString() as never,
    );
    const askOnly = open.issue('exec.cdo', 'ask').token;
    const full = open.issue('exec.cdo', 'full').token;

    check('an ask-only token is a different token from a full one', askOnly !== full);
    check('the capability is inside the signature, so it cannot be edited upward',
      open.authenticate(`full.${askOnly.split('.').slice(1).join('.')}`).ok === false);
    check('a well-formed ask token still authenticates',
      open.authenticate(askOnly).ok && open.authenticate(askOnly).ok
        && (open.authenticate(askOnly) as { caller: { capability: string } }).caller.capability === 'ask');

    for (const path of ['/api/ingest/profile', '/api/ingest/structured', '/api/ingest/document']) {
      const response = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${askOnly}` },
        body: JSON.stringify({ fileName: 'x.csv', contentBase64: 'YQ==', identityField: 'a' }),
      });
      // 401 here because this check's own runtime is closed; the point is that it is never 200.
      check(`an ask-only session cannot write via ${path}`, response.status !== 200,
        `got ${String(response.status)}`);
    }

    /*
     * `full` open access is the setting that lets a stranger upload, so its refusals are the ones
     * worth asserting: an unrecognised value must not quietly become "open".
     */
    const { loadAccessConfig } = await import('../../server/access.js');
    for (const [value, expected] of [
      [undefined, 'off'], ['', 'off'], ['true', 'off'], ['FULL ', 'full'], ['Ask', 'ask'],
      ['yes', 'off'], ['1', 'off'],
    ] as const) {
      const cfg = loadAccessConfig({ GLDI_OPEN_ACCESS: value } as Record<string, string | undefined>);
      check(`GLDI_OPEN_ACCESS=${String(value)} reads as ${expected}`, cfg.openAccess === expected,
        `got ${cfg.openAccess}`);
    }

    console.log('\naudit lineage');

    const auditResponse = await fetch(`${BASE}/api/audit`, { headers: authorised });
    const auditBody = await auditResponse.json() as {
      data?: { count?: number; events?: Record<string, unknown>[] };
    };
    const events = auditBody.data?.events ?? [];
    check('the assistant writes an audit event for every question',
      events.length > 0, `${String(events.length)} events`);

    // A granted event: a refusal legitimately has no plan and no tools, and asserting against the
    // newest event regardless would be asserting against whichever question happened to be last.
    const latest = events.find((e) => e['decision'] === 'GRANT');
    check('the lineage records the resolved plan and that the validator accepted it',
      latest?.['plan'] !== null && latest?.['planValidation'] === 'ACCEPTED',
      String(latest?.['planValidation']));
    check('the lineage records which governed tools ran',
      Array.isArray(latest?.['tools']) && (latest['tools'] as unknown[]).length > 0);
    check('the lineage records the composer and the grounding outcome',
      typeof latest?.['composer'] === 'string' && latest['groundingValidation'] === 'PASS');
    check('the lineage records the caller and their authorised scope',
      typeof latest?.['actorId'] === 'string'
      && typeof latest['authorisedProjectCount'] === 'number');
    check('every interaction has its own event id',
      new Set(events.map((e) => String(e['eventId']))).size === events.length,
      `${String(new Set(events.map((e) => String(e['eventId']))).size)} ids for ${String(events.length)} events`);
    check('the lineage separates when the portfolio was true from when it was asked',
      typeof latest?.['occurredAt'] === 'string' && typeof latest['recordedAt'] === 'string'
      && latest['occurredAt'] !== latest['recordedAt'],
      `${String(latest?.['occurredAt'])} vs ${String(latest?.['recordedAt'])}`);
    check('a refusal is audited as well as a grant',
      events.some((e) => e['decision'] === 'DENY'),
      events.map((e) => String(e['decision'])).join(','));

    /*
     * The lineage must not become a transcript. A question digest and claim identifiers are enough
     * to reconstruct *how* an answer was produced; the prose belongs in the response, under the
     * access rules the response has.
     */
    const auditText = JSON.stringify(events);
    check('the lineage carries no question prose',
      !auditText.includes('portfolio forecast margin across the whole portfolio'));
    check('the lineage carries no answer prose', !auditText.includes('20.21%'));
    check('the lineage carries no credential', !/sk-ant|api[_-]?key/i.test(auditText));

    const anonymousAudit = await fetch(`${BASE}/api/audit`);
    check('an anonymous audit read is refused', anonymousAudit.status === 401);

    // A second caller must not see the first caller's lineage.
    const otherAudit = await fetch(`${BASE}/api/audit`, {
      headers: { authorization: `Bearer ${narrowToken}` },
    });
    const otherBody = await otherAudit.json() as { data?: { events?: Record<string, unknown>[] } };
    const otherActors = new Set((otherBody.data?.events ?? []).map((e) => String(e['actorId'])));
    check('audit lineage is narrowed to the caller',
      !otherActors.has(String(latest?.['actorId'])),
      [...otherActors].join(','));

    console.log('\nknowledge and connections');

    const sources = await fetch(`${BASE}/api/sources`, { headers: authorised });
    const sourcesBody = await sources.json() as {
      data?: { sources?: { status: string; isFixture: boolean; displayName: string }[] };
    };
    const list = sourcesBody.data?.sources ?? [];
    check('sources are listed', list.length > 0);
    check('no fixture is presented as a live connection',
      list.every((s) => !s.isFixture || s.status === 'FIXTURE'),
      list.filter((s) => s.isFixture && s.status !== 'FIXTURE').map((s) => s.displayName).join(', '));

    const verify = await fetch(`${BASE}/api/sources/src-finance/verify`, { headers: authorised });
    check('a source can be verified', verify.status === 200);

    console.log('\nsecrets');

    // Every response body this run produced, scanned for credential shapes. A key reaching a client
    // is a P0 whatever else passed.
    const bodies = await Promise.all([
      fetch(`${BASE}/api/providers`, { headers: authorised }).then((r) => r.text()),
      fetch(`${BASE}/api/health`).then((r) => r.text()),
      fetch(`${BASE}/api/sources`, { headers: authorised }).then((r) => r.text()),
    ]);
    const { scanForSecrets } = await import('@platform/secrets');
    for (const [i, body] of bodies.entries()) {
      const found = scanForSecrets(body, `response ${String(i)}`);
      check(`response ${String(i)} carries no credential`, found.length === 0,
        found.map((f) => f.patternId).join(', '));
    }
    check('the provider surface does not echo a key or a key digest',
      !/anthropic:[0-9a-f]{8}|x-api-key/i.test(bodies[0] ?? ''));
  } finally {
    server.close();
  }

  console.log(`\n${String(checks - failures.length)}/${String(checks)} checks passed`);
  if (failures.length > 0) {
    console.error(`\nFAIL — ${String(failures.length)} check(s) failed:`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log('PASS — the trusted runtime meets its transport contract.');
  process.exit(0);
}

void main();
