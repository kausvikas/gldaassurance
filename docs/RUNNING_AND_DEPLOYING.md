# Running and deploying

> **DEMO — SYNTHETIC DATA.** Nothing here touches a production system, and the portfolio is
> generated. See `CLAUDE.md`.

Three things can be true of this product at once, and it is worth naming them before any commands:

| | Works today | Needs |
| --- | --- | --- |
| The five executive surfaces | **Live**, at https://gldaassurance.web.app | nothing |
| The Assistant answering, and Add Knowledge | **Live**, at the same URL | nothing |
| The same, locally | two commands | nothing |

---

## 1 · Run the whole product locally — two commands, no key

```bash
npm run server                                  # the trusted runtime, on :8080
node scripts/deploy/serve-preview.mjs 8899      # the built site, on :8899
```

Then open **http://localhost:8899/assistant**.

Both surfaces become live: the Assistant answers real questions, and **Add Knowledge** on
`/assistant/knowledge` accepts a real workbook and runs the full eight-step flow to a receipt.

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
service   gldi-runtime · europe-west1 · 0–3 instances · 1 vCPU · 1 GiB
config    GLDI_ENV=prod  AI_PROVIDER=none  GLDI_EXTERNAL_AI_ALLOWED=false
          GLDI_ALLOWED_ORIGINS=https://gldaassurance.web.app
```

`AI_PROVIDER=none` is a decision, not an omission: sending delivery and commercial material to a
hosted model is a policy decision (ADR-0033), and a deployment nobody has explicitly said yes to has
said no. Answers come from the governed deterministic composer and every response says so. To turn
Claude narration on:

```bash
printf '%s' "$ANTHROPIC_API_KEY" | gcloud secrets create anthropic-key --data-file=- --project gldaassurance
gcloud run services update gldi-runtime --region europe-west1 --project gldaassurance \
  --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest \
  --update-env-vars AI_PROVIDER=claude,GLDI_EXTERNAL_AI_ALLOWED=true
```

Nothing else changes. The facts are identical either way — only the `Composed by` badge moves.

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
npm run server:check     # 29 transport assertions against a live socket
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
npm run verify          # typecheck · architecture · schema · lint · 1514 tests · data · every build
npm run server:check    # the trusted runtime's transport contract, against a live socket
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
