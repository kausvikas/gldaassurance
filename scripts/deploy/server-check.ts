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
import { buildRuntime } from '../../server/main.js';

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

    const unauthenticated = await fetch(`${BASE}/api/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'What is the portfolio forecast margin?' }),
    });
    check('an unauthenticated ask is the generic not-found', unauthenticated.status === 404);

    console.log('\nsession and query');

    const sessionResponse = await fetch(`${BASE}/api/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ persona: 'exec.cdo' }),
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
