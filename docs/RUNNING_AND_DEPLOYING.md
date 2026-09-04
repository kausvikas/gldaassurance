# Running and deploying

> **DEMO — SYNTHETIC DATA.** Nothing here touches a production system, and the portfolio is
> generated. See `CLAUDE.md`.

Three things can be true of this product at once, and it is worth naming them before any commands:

| | Works today | Needs |
| --- | --- | --- |
| The five executive surfaces | **Live**, at https://gldaassurance.web.app | nothing |
| The Assistant answering, and Add Knowledge | **Locally**, in two commands | a running server |
| The same, on the public URL | not yet | GCP billing, then one deploy |

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

## 2 · Make the public URL answer live

**This is the only step that needs you rather than the repository.** Cloud Run requires a
billing-enabled GCP project, and `gldaassurance` currently has billing off — which is why the
container is built, tested and not deployed.

### What you do

1. **Enable billing** on the `gldaassurance` project (Blaze plan) in the Google Cloud console.
2. **Decide whether Claude may be called**, and put the key somewhere the runtime can read it —
   Secret Manager, not the repository.

Costs, so they are not a surprise: Cloud Run bills per request and idles to zero; a demo of this size
sits inside or near the free tier. Anthropic API calls are billed per token, and one narration is a
few hundred tokens. The static hosting is unchanged and free.

### What happens then

```bash
gcloud run deploy gldi-runtime \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars GLDI_ENV=prod,AI_PROVIDER=claude,GLDI_EXTERNAL_AI_ALLOWED=true,GLDI_ALLOWED_ORIGINS=https://gldaassurance.web.app \
  --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest
```

Then add the rewrite to `firebase.json`, **above** the catch-all — order matters, because the
existing `**` rule would otherwise swallow `/api`:

```json
"rewrites": [
  { "source": "/api/**", "run": { "serviceId": "gldi-runtime", "region": "europe-west1" } },
  { "source": "**", "destination": "/index.html" }
]
```

and redeploy hosting:

```bash
npm run deploy
```

That rewrite is worth understanding rather than copying. It puts the API on the **same origin** as
the site, so the browser sends no cross-origin request at all — CORS stops being involved, and
`GLDI_ALLOWED_ORIGINS` becomes a second line of defence rather than the only one. No application code
changes; the page finds its API at `window.location.origin + '/api'` exactly as it already tries to.

### Verifying it worked

```bash
curl -s https://gldaassurance.web.app/api/health
npm run server:check     # 29 transport assertions against a live socket
npm run scan:secrets     # no credential in source, fixtures or built output
```

The Assistant page should stop saying *"Trusted runtime not reachable"* and the Add Knowledge drop
zone should stop being disabled. Nothing else about the answers changes, because the answers were
never produced in the browser.

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
