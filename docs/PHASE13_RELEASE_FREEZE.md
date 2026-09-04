# Phase 13 — release freeze

> **DEMO — SYNTHETIC DATA.** Recorded 2026-09-04 against commit `41b77fb` on `main`, Cloud Run
> revision `gldi-runtime-00019-gh4`, and the Firebase Hosting release serving
> `https://gldaassurance.web.app`.

## Status: **B — operational; final closure still required**

Not A, and the reason is one line: **the authenticated browser path has not been clicked through by a
person.** Everything it would exercise is proven by measurement against the live public API, and that
is not the same claim. The remaining step is small, it needs a human, and it is named in §5.

---

## 1 · Proven by measurement against the live public URL

### Durable knowledge, across a forced cold start

```
CSV  → 3 detected · 2 accepted · 1 quarantined (FIN-9999 UNRESOLVED_IDENTITY) · SUPPLEMENTAL · SANDBOX
XLSX → 3 detected · 2 accepted · 1 quarantined
PDF  → 3 pages · 3 chunks · COMPLETE
       retained at gs://gldaassurance-knowledge/src-doc-…/ver-…
before  22 sources · 10 quarantined · 2 conflicts · 3 legacy-incomplete
── revision replaced ──
after   22 sources · 10 quarantined · 2 conflicts · 3 legacy-incomplete · durable true
  csv   INGESTED_NOT_USED       received=3 accepted=2 quarantined=1
  xlsx  INGESTED_NOT_USED       received=3 accepted=2 quarantined=1
  pdf   INGESTED_NOT_REACHABLE  received=3 accepted=3 chunks=3
counts identical to before restart: true
```

### Durable answer lineage, across the same cold start

```
audit events recovered: 2/2
  plan                 same   {"shape":"population.aggregate","scope":"portfolio",…}
  planValidation       same   ACCEPTED
  tools                same   ["portfolio.population.aggregate:GRANT"]
  sourceVersions       same   []
  composer             same   DETERMINISTIC_COMPOSER
  groundingValidation  same   PASS
  providerId           same   null
  answerability        same   ANSWERABLE
  decision             same   GRANT
  actorId              same   usr-exec-cdo
REGRESSION PASS
```

### Access control

```
anonymous, well-formed body  → ask 401 · sources 401 · all three ingest routes 401
anonymous, malformed body    → all 401, never 400   (no shape oracle)
session without a code       → 401, identical message to a wrong code
unknown persona              → 401, byte-identical body to a wrong code
4 forgeries                  → refused, including a narrow caller's own token
                               re-pointed at exec.cdo
two callers                  → exec.cdo 75 projects, dm.mobility 0; the narrow
                               caller does not receive the portfolio ranking
audit read                   → narrowed to the caller; anonymous read 401
```

### Claude, through the public cloud path

```
selected=anthropic  model=claude-sonnet-5  external=true  health=HEALTHY
detail="The Messages API responded. Model claude-sonnet-5."
endpointHost=api.anthropic.com     credential shapes in /providers: none
8 questions · PROVIDER_USED on all 8 · externalAiPolicy=ALLOWED
audit records providerId/providerModel/providerOutcome; no credential in /audit
```

Two of the eight answers came back as `DETERMINISTIC_COMPOSER` **while the provider was used**. That
is the grounding validator refusing the model's prose and the governed composer standing in its
place. It is the designed behaviour and the most useful single observation in this run: the model
wrote something the claims could not license, and the product did not ship it.

### Claude vs none — authoritative facts

```
53 facts across 8 questions
authoritative mismatches: 0
answers whose prose differs: 6 of 8
composers under claude: DETERMINISTIC_COMPOSER, LLM_NARRATION
composers under none:   DETERMINISTIC_COMPOSER
```

Every figure, scope line, executive authority and assessment status is identical. Only the sentences
move. The deployment is returned to `AI_PROVIDER=none`, which remains the governance default.

---

## 2 · Gates

| Gate | Result |
| --- | --- |
| `npm run verify` | 1569 tests · 49 files · 0 failures |
| Architecture | PASS — 152 source files, 20 contexts, 13 platform modules |
| Schema | PASS — no cross-schema FKs, no float columns |
| `npm run server:check` | 63/63 against a live socket |
| Golden truth | 11/11 |
| Governed facts | 14/14 |
| `npm run scan:secrets` | PASS — 622 files, 10 credential shapes, none found |
| `npm run audit:links` | 0 broken, 0 unsafe |

---

## 3 · The economics, frozen and reconciled

```
as-sold contract value      $451.28M
executed change requests  + $2.19M
                          ─────────
current contractual value   $453.47M   = MET-PORT-001
```

Decimal equality, not formatted equality. Pending changes appear in neither line — they are
`MET-FIN-011` unsecured upside, and no code path lets an unexecuted change raise contractual revenue.

| Figure | Value |
| --- | --- |
| Forecast gross margin | **20.21%** — weighted, never a mean |
| As-sold gross margin | **25.46%** |
| Margin at risk | **$35.95M** — summed, not netted across shared causes |
| Population | **75** fixed-bid · 38 Green / 22 Amber / 15 Red |
| Reported Green, evidence disagrees | **9** (executive category); MET-HLTH-033 counts **18**, disclosed beside it |
| System Green, emerging risk | **10** |
| Recovering | **4** |
| Conflict, governed | `financial.forecastRevenue` prj-002 — Finance **3,600,000** |
| Conflict, disclosed | the same concept — uploaded extract **5,100,000**, never merged |

---

## 4 · Controlled demo access — stated honestly

This is **CONTROLLED DEMO ACCESS**. It is not enterprise authentication, not GlobalLogic SSO, and not
user identity.

Anyone holding the code may select any allowed synthetic persona and receives that persona's
authorised scope. What the control does provide is that the API is closed to the internet, that a
session is server-validated, that scope is resolved server-side from a signed persona, and that no
shared secret reaches JavaScript. Corporate identity and RBAC are a future integration, and are a
precondition in `docs/REAL_GL_CONNECTOR_ONBOARDING.md` §4 before any non-synthetic data.

---

## 5 · What still stands between this and Status A

**The authenticated browser walk-through.** One person, one sitting:

1. open `https://gldaassurance.web.app/assistant` and sign in with the demo access code;
2. ask an unseen question; confirm scope, answer, answerability and provenance;
3. Assistant → Knowledge & Connections → Add knowledge;
4. upload the synthetic XLSX through Select → Parse → Profile → Map → Validate → Preview → Confirm →
   Receipt;
5. confirm the receipt matches the server result, the quarantined row is visible, the conflict is
   visible;
6. reload, and confirm all of it is still there;
7. ask a question that depends on the uploaded fact;
8. clear the session, and confirm a protected action is refused.

The code is in Secret Manager:
`gcloud secrets versions access latest --secret gldi-access-code --project gldaassurance`.

Everything this walk would exercise is measured at the API and asserted in `server:check`. It is
still not the same claim, and this document does not make it.

---

## 6 · Open, accepted, and carried

| # | Finding | Severity |
| --- | --- | --- |
| 1 | Controlled demo access is a shared code, not an identity | P1 · accepted for a synthetic POC |
| 2 | Rate limiting is per-process; the ceiling is `--max-instances 3` and a $25 budget alerting at 50/90/100 % | P2 |
| 3 | Parsers are not sandboxed — decision and trigger conditions in `docs/UPLOAD_THREAT_MODEL.md` §1 | P2 |
| 4 | No retention or deletion path for uploaded records and blobs | P2 |
| 5 | Three pre-durability sources marked `LEGACY_INCOMPLETE`, withdrawn from retrieval and conflict detection | P3 · marked, not deleted |
| 6 | Audit rows written before the id fix share a session-scoped event id | P3 · historical rows only |

**DO NOT USE FOR REAL CONFIDENTIAL GLOBALLOGIC DOCUMENTS** until retention, deletion and enterprise
IAM controls exist.

---

## 7 · Enterprise integration status — unchanged and truthful

| Source | Status |
| --- | --- |
| Finance / ERP | **SYNTHETIC FIXTURE** |
| Salesforce / CRM | **SYNTHETIC FIXTURE** |
| PSA / Resource | **SYNTHETIC FIXTURE** |
| ALM | **SYNTHETIC FIXTURE** |
| Delivery Assurance | **SYNTHETIC FIXTURE** |
| Tableau | **SYNTHETIC FIXTURE** |
| Connector abstraction | **VERIFIED** — `tests/integration/connector-extensibility.test.ts` adds a source the product has never heard of and then greps `src/`, `server/` and `scripts/` to prove nothing knows its name |

No real GlobalLogic integration exists. None is fabricated for this freeze.
