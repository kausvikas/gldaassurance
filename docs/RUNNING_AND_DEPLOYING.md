# Running and deploying

> **DEMO — SYNTHETIC DATA.** Nothing here touches a production system, and the portfolio is
> generated. See `CLAUDE.md`.

Three things can be true of this product at once, and it is worth naming them before any commands:

| | Works today | Needs |
| --- | --- | --- |
| The five executive surfaces | **Live**, at https://gldaassurance.web.app | nothing |
| The Assistant answering, and Add Knowledge | **Live**, at the same URL | the demo access code |
| Uploads surviving a restart | **Live** — Firestore + Cloud Storage | nothing |
| The same, locally | two commands | an access code you choose |

**The API is closed by default.** Every route but `/api/health` answers `401` without a session, and
a session is issued only in exchange for the demo access code. A deployment with no
`GLDI_DEMO_ACCESS_CODE` configured is *closed*, not open — the opposite default is how a
misconfigured deployment silently becomes an anonymous one.

---

## 1 · Run the whole product locally — two commands, no key

```bash
GLDI_DEMO_ACCESS_CODE=pick-anything npm run server   # the trusted runtime, on :8080
node scripts/deploy/serve-preview.mjs 8899           # the built site, on :8899
```

Then open **http://localhost:8899/assistant** and enter the code you chose.

Without `GLDI_DEMO_ACCESS_CODE` the server still starts and still serves `/api/health`, and every
other route refuses. That is deliberate, and it is the same behaviour in production.

Locally there is no durable store, so **ingestion is refused with a 503 that says why** rather than
accepting a file and losing it at the next restart. Profiling a file — parse, profile, suggest a
mapping — still works, because it writes nothing.

Both surfaces become live: the Assistant answers real questions, and **Add Knowledge** on
`/data-sources` accepts a real workbook and runs the full eight-step flow to a receipt.

No API key is needed. With no provider configured the answers come from the governed deterministic
composer and every response says so on its `Composed by` badge — which is also the clearest available
demonstration that the model is a narrator rather than the source of truth.

If the site has not been built yet:

```bash
npm run design:app && npm run build:dist
```

### With Claude writing the prose

```bash
AI_PROVIDER=claude ANTHROPIC_API_KEY=… GLDI_EXTERNAL_AI_ALLOWED=true npm run server
```

`GLDI_EXTERNAL_AI_ALLOWED` defaults to **false** on purpose: a deployment that has configured a key
but not said yes to external processing has said no. With it false the provider is never called and
the answer says why.

### Files to try

```bash
npx vite-node -c vitest.config.ts -e "
  import { writeFileSync } from 'node:fs';
  import { supplementalFinancials, badRows } from './scripts/fixtures/enterprise.js';
  writeFileSync('/tmp/Project_Financials.xlsx', supplementalFinancials());
  writeFileSync('/tmp/Project_Financials_bad.xlsx', badRows());
"
```

The first accepts two rows and quarantines one — a finance identifier nobody has mapped, which is
quarantined rather than joined by name similarity. The second is six rows of deliberately different
defects, all of which quarantine, and the answer they would have changed does not move.

---

## 2 · The cloud deployment, as it stands

**Deployed 2026-09-04.** The runtime runs on Cloud Run in `europe-west1` as `gldi-runtime`, and
Firebase Hosting rewrites `/api/**` to it, so the browser makes no cross-origin request at all.

```
service   gldi-runtime · europe-west1 · 0–3 instances · 1 vCPU · 1 GiB · 60 s timeout
config    GLDI_ENV=prod  AI_PROVIDER=none  GLDI_EXTERNAL_AI_ALLOWED=false
          GLDI_ALLOWED_ORIGINS=https://gldaassurance.web.app
          GLDI_GCP_PROJECT=gldaassurance  GLDI_FIRESTORE_DATABASE=(default)
          GLDI_BLOB_BUCKET=gldaassurance-knowledge
secrets   GLDI_DEMO_ACCESS_CODE ← gldi-access-code:latest
          GLDI_SESSION_KEY      ← gldi-session-key:latest
budget    $25/month on the billing account, alerting at 50 / 90 / 100 %
```

### Where uploaded knowledge lives

Firestore holds the records — sources, receipts, observations, staged rows, document versions, and
what each source has been used for — one JSON document per record, at a deterministic id, so a Cloud
Run retry rewrites rather than duplicates. Cloud Storage holds the original bytes, addressed
`sourceId/versionId` and never by filename.

Both are reached over REST with credentials from the metadata server. There is no key file, no SDK,
and no dependency added to the process that parses uploads.

The synthetic fixtures are **not** persisted: they are rebuilt from code on every start, so writing
them would only mean reading a second copy back and double-counting it. `useDurableStores` runs
after the seed and before `hydrate`, which is what keeps those two things apart.

### The demo access code

It lives in Secret Manager as `gldi-access-code`. To read it:

```bash
gcloud secrets versions access latest --secret gldi-access-code --project gldaassurance
```

To rotate it, add a version and redeploy — sessions already issued keep working until they expire,
because the session key is separate from the code.

`AI_PROVIDER=none` is a decision, not an omission: sending delivery and commercial material to a
hosted model is a policy decision (ADR-0033), and a deployment nobody has explicitly said yes to has
said no. Answers come from the governed deterministic composer and every response says so. ### Claude has been verified through this path, and then switched back off

The secret `anthropic-key` exists in Secret Manager and the runtime identity can read it. To turn
Claude narration on:

```bash
gcloud run services update gldi-runtime --region europe-west1 --project gldaassurance \
  --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest,GLDI_DEMO_ACCESS_CODE=gldi-access-code:latest,GLDI_SESSION_KEY=gldi-session-key:latest \
  --update-env-vars AI_PROVIDER=claude,GLDI_EXTERNAL_AI_ALLOWED=true
```

and to switch it back:

```bash
gcloud run services update gldi-runtime --region europe-west1 --project gldaassurance \
  --update-env-vars AI_PROVIDER=none,GLDI_EXTERNAL_AI_ALLOWED=false
```

`--set-secrets` replaces the whole set rather than adding to it, which is why the other two are
repeated. Omitting them removes the access code, and a deployment with no access code is *closed* —
visible in seconds, and the right way round.

**Measured on `claude-sonnet-5` through the public URL:** 8 questions, 53 authoritative facts, **zero
differences** against `AI_PROVIDER=none`. Only the prose moves. Two of the eight came back from the
deterministic composer *while the provider was used* — the grounding validator refusing sentences the
claims could not license, which is the whole point of putting a validator after the model.

### Two things this deployment found

- **The site's own CSP blocked every fetch.** `default-src 'none'` with no `connect-src` meant the
  page could never reach a runtime, on any host — the Assistant would have reported "not reachable"
  even with the server answering beside it, and it did. `connect-src 'self'` is now set, which is
  same-origin only and no less restrictive than the intent.
- **The container could not write its own working directory.** `vite` bundles its config to a
  temporary file beside itself before loading it, and `USER node` did not own `/app`. Cloud Run
  reported only that the container had not listened on the port.

### Redeploying the runtime

```bash
gcloud run deploy gldi-runtime --source . --region europe-west1 --project gldaassurance
```

### Verifying it

```bash
curl -s https://gldaassurance.web.app/api/health
npm run server:check     # 47 assertions against a live socket, including every access-control path
npm run scan:secrets     # no credential in source, fixtures or built output
```

Verified in a browser on the public URL after this deployment: the Assistant answered *"Which
Automotive projects in Europe have lost more than three margin points?"* with a scope line reading
`Mobility · Europe · gross-margin erosion at or above 3 points` and three projects; and a real
workbook uploaded through **Add knowledge** produced a receipt reading 3 detected, 2 accepted, 1
quarantined, authority `supplemental`, data context `SANDBOX`.

### Costs

Cloud Run bills per request and idles to zero at `min-instances 0`, so a demo of this size sits
inside or near the free tier. Anthropic calls are per token and are currently **not** being made.
Static hosting is unchanged and free.

---

## 3 · The gates, and what each is for

```bash
npm run verify          # typecheck · architecture · schema · lint · 1553 tests · data · every build
npm run server:check    # transport, access control and caller isolation, against a live socket
npm run scan:secrets    # credential shapes in source, fixtures and built output
npm run report:phase13  # regenerates the four evidence documents from the running system
npm run audit:links     # no broken or unsafe internal link in the distribution
```

`report:phase13` is the one worth running after any change to a metric or a fixture: it re-derives
the integration matrix, the authority matrix, the golden-truth results and the ingestion validation
**from the live system**, and exits non-zero if a golden-truth figure has moved. A benchmark written
by hand is a claim about a system; this one is a measurement of it.

---

## 4 · What is deliberately not automated

- **Billing.** It needs a human with an account.
- **Promotion to the live URL.** `npm run deploy` is explicit and unscheduled. A demo that
  redeployed itself would eventually redeploy something nobody had looked at.
- **Promoting uploaded data to canonical.** There is no code path, by decision (ADR-0035 §5). An
  upload reaches `SANDBOX` and stops, which is why nothing anyone adds can move an executive figure.
- **Clearing what people have uploaded.** Firestore and the bucket accumulate. There is no retention
  policy and no deletion path, which is fine for a demo and is one of the conditions in
  `docs/REAL_GL_CONNECTOR_ONBOARDING.md` §4 that must be false no longer before any real data.
