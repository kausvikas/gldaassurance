# SECURITY_CONTROL_MATRIX.md — Implemented vs Planned

**Status:** Phase 5 deliverable, reconciled at Phase 5 closure
**Version:** 1.1.0
**Purpose:** one table a CISO can read to see what actually exists.

> ## ⚠️ DEMO — SYNTHETIC DATA
> This is a proof of concept. **Do not read `IMPLEMENTED` as production-ready.** It means the control
> exists in this codebase and a test proves it, on synthetic data, in a single process.

---

## 0. States

| State | Means |
| --- | --- |
| **VERIFIED** | Implemented **and** exercised against the thing it protects — a real running pipeline, a real PostgreSQL instance, or a scripted attack that it repelled. The strongest claim in this document |
| **IMPLEMENTED** | Exists in the codebase and a named test proves it, but the test exercises the unit rather than an adversary or a real dependency |
| **PARTIAL** | Exists but does not cover the whole control; the gap is stated |
| **DECLARED / NOT YET ENFORCED** | Configuration or contract exists and is tested **as configuration**; nothing applies it to real traffic or real infrastructure (usually blocked on a `Proposed` ADR) |
| **PLANNED** | Named production requirement, not built, with a debt id |
| **NOT APPLICABLE** | Out of scope for a POC and stated as such |

A control with no test reference is not `IMPLEMENTED`, whatever the code looks like. **A control
tested only as configuration is `DECLARED`, never `VERIFIED`** — the distinction between "we wrote
down the right header" and "a browser received it over TLS" is the whole difference between a policy
and a control, and this document must never blur it.

### What this document may not say

Four claims are prohibited, because each was available and each would have been false:

| Prohibited claim | Actual state |
| --- | --- |
| "TLS/HSTS/CSRF/cookie attributes are enforced" | **DECLARED.** No transport serves them (**DR-029**) |
| "Audit is durable / tamper-proof" | **PARTIAL.** In-memory, lost on restart (**DR-024**); see `SECURITY_MODEL.md` §5.4b |
| "Authentication is enterprise-grade" | **ACCEPTED POC LIMITATION.** A persona selector behind an environment guard (**DR-023**) |
| "The database enforces least privilege" | **PARTIAL.** 2 of 56 tables carry explicit `gldi_app` grants (**DR-017**) |

### Summary

110 controls across §1–§7. Counts are of the state cells in those sections, and the ASVS
self-assessment in §8 is a separate, narrative judgement rather than a control row.

| State | Count | Read this as |
| --- | --- | --- |
| **VERIFIED** | 27 | Exercised against a running pipeline, real PostgreSQL, or a scripted attack |
| **IMPLEMENTED** | 48 | In the code with a named test, on synthetic data, in one process |
| **PARTIAL** | 5 | Real but incomplete; the gap is named and carries a DR |
| **DECLARED / NOT YET ENFORCED** | 6 | Configuration exists and is tested **as configuration**. Nothing serves it |
| **PLANNED** | 23 | Named production requirement, not built, with a debt id |
| **NOT APPLICABLE** | 1 | Out of scope for a POC and stated as such |

The six `DECLARED` rows are the ones a reviewer should look at first: **every transport control in
this repository is in that column.**

---

## 1. Identity and authentication

| Control | State | Evidence / debt |
| --- | --- | --- |
| `IdentityProvider` abstraction | **IMPLEMENTED** | `src/contexts/identity/internal/identity-provider.ts`; `session-and-config.test.ts` |
| Synthetic persona provider, labelled | **IMPLEMENTED** | `MockIdentityProvider`, `kind: 'SYNTHETIC'` |
| Refuses to start outside a demo environment | **VERIFIED** | `assertDemoEnvironment()` reads a declared allow-list (`dev`, `test`); a regression test walks every environment `loadConfig()` can emit and asserts the verdict on each. `staging`, `prod` and every undeclared string throw |
| Server-side session store | **IMPLEMENTED** | `SessionStore`; 7 tests |
| Absolute 8h expiry | **VERIFIED** | test "expires on the absolute lifetime even under constant use", on a movable clock. **POC default, not corporate policy** |
| Idle 30m expiry, sliding, never past absolute | **VERIFIED** | test "slides the idle window on use, but never past the absolute expiry". **POC default, not corporate policy** |
| Session thresholds are configuration, not literals | **IMPLEMENTED** | `POC_SECURITY_POLICY` in `platform/config`; `SessionStore` enforces an injected policy — test "enforces an injected policy rather than the module constant" |
| Revocation on logout | **VERIFIED** | test "rejects a revoked session"; also through the live pipeline in `adversarial.test.ts` |
| Revocation of all sessions on grant change | **VERIFIED** | test "revokes every active session for an actor"; also through the live pipeline |
| Opaque token; no claims in the token | **IMPLEMENTED** | session id carries no data; role and scope come from the identity record |
| No token in local storage | **DECLARED / NOT YET ENFORCED** | `SESSION_COOKIE` is `HttpOnly`/`Secure`/`SameSite`; nothing applies it, because no transport sets a cookie. **DR-029** |
| Corporate OIDC / OAuth2 SSO | **PLANNED** | **DR-023** |
| MFA (upstream at the IdP) | **PLANNED** | **DR-023** |
| Short-lived tokens + refresh | **PLANNED** | **DR-023** |
| Credential storage (Argon2id) | **NOT APPLICABLE** | The POC stores no credentials by design; production delegates to the IdP |
| Failed-login rate limiting | **DECLARED / NOT YET ENFORCED** | `RATE_LIMITS.auth` 10/min is a POC default; no auth endpoint exists to apply it to |
| Impersonation / "view as role" | **PLANNED** | Designed in `SECURITY_MODEL.md` §3; **DR-026** |
| SCIM provisioning | **PLANNED** | **DR-023** |

## 2. Authorization

| Control | State | Evidence / debt |
| --- | --- | --- |
| RBAC capability matrix as data | **IMPLEMENTED** | `CAPABILITY_MATRIX`; 108 generated cases in `matrix.test.ts` |
| Matrix asserted against an independent transcription | **IMPLEMENTED** | `EXPECTED` in `matrix.test.ts` is transcribed from `SECURITY_MODEL.md` §4.4, not imported |
| ABAC scope resolution to a concrete entity set | **IMPLEMENTED** | `DeclarativePolicy.resolveScope`; 6 tests |
| Scope resolved **before** any query | **IMPLEMENTED** | `EnforcementPoint.authorise` step 4; aggregates take the set, not a predicate |
| Object-level check on every named id (**BOLA**) | **VERIFIED** | `adversarial.test.ts` §1 — 5 scripted attacks against the running pipeline, all repelled |
| Out-of-scope indistinguishable from non-existent | **VERIFIED** | test "returns an identical response for out-of-scope and non-existent ids" — byte-identical status and body |
| Field-level classification gate | **VERIFIED** | `CLASSIFICATION_MATRIX`; 30 generated cases plus payload-level assertions through the pipeline |
| Unauthorised fields **absent**, not masked (C-13 **ACCEPTED**) | **VERIFIED** | `shape()` with `OMIT`; tests assert the key is not present and no placeholder appears |
| Masking seam, declared and unused | **DECLARED / NOT YET ENFORCED** | `Disposition = 'OMIT' \| 'REDACT'`; nothing uses `REDACT`, and a test asserts nothing does. Enabling it needs an approved product requirement **and** a superseding ADR |
| Unclassified field fails closed | **VERIFIED** | `UnclassifiedField` throws; **this caught a real gap in Phase 5**. Permanent CI invariant (`SECURITY_MODEL.md` §12.2) |
| `SECURITY_TELEMETRY` classification exists and is narrow | **VERIFIED** | ADR-0016 C-14; `security-telemetry.test.ts` — one role, one resource, within scope, audited on read (19 tests) |
| Security telemetry denied to every business persona | **VERIFIED** | test "refuses the audit endpoint to every delivery and business persona"; and the field gate omits it even if a route handed a record over |
| Security telemetry access is itself audited | **VERIFIED** | dispatcher names `securityTelemetry=…` in the audit reason; test asserts it |
| Telemetry confined to declared security-telemetry resources | **IMPLEMENTED** | `SECURITY_TELEMETRY_RESOURCES`; `MisplacedSecurityTelemetry` throws elsewhere |
| Audit reads narrowed to the caller's authorised entity set | **IMPLEMENTED** | `withinAuthorisedEntities`; test "narrows audit rows to the caller's authorised entity set" |
| Product personas and security roles decoupled, mapping published | **IMPLEMENTED** | ADR-0016 C-11 **ACCEPTED**; `SECURITY_MODEL.md` §4.1a |
| Deny-by-default for unknown capability | **IMPLEMENTED** | `matrix.test.ts` "denies a capability that does not exist" |
| Deny-by-default for unmapped route | **IMPLEMENTED** | `adversarial.test.ts` "does not route an unmapped path" |
| Separation of duties (admin ≠ business data) | **VERIFIED** | `threat-model-regression.test.ts` T-ADM-2 asserts `SECURITY_ADMIN` appears in no business capability row and no classification row at all; `adversarial.test.ts` proves it through the pipeline. **This caught a real defect** — see §9 |
| `SECURITY_ADMIN` cannot apply a financial correction | **VERIFIED** | `data.applyCorrection` is `FINANCE_CONTROLLER` only; asserted in the generated matrix and by T-ADM-2 |
| Grant administration does not imply business-data mutation | **VERIFIED** | `identity.manageGrants` is the admin's only non-audit capability; T-ADM-2 |
| Authorization in exactly one place | **IMPLEMENTED** | Architecture gate: no domain context imports `@platform/authz` policy |
| Row-level security in the database | **PLANNED** | Application-layer scoping only; PostgreSQL RLS is **DR-028** |

## 3. API / BFF

| Control | State | Evidence / debt |
| --- | --- | --- |
| Versioned routes | **IMPLEMENTED** | every path is `/v1/...`; asserted |
| Resources, never tables | **IMPLEMENTED** | test "exposes resources, never tables or schemas" |
| Schema validation, unknown fields rejected | **IMPLEMENTED** | `rejectUnknownFields`; test |
| Prototype-pollution keys rejected | **VERIFIED** | scripted attack "rejects a prototype-pollution key"; `Object.prototype` unchanged afterwards |
| Identifier format constrained | **IMPLEMENTED** | `ID_PATTERN`; 6 hostile ids tested |
| Pagination ceiling | **VERIFIED** | clamped to 100 against `?limit=100000`; negative and non-integer offsets rejected rather than coerced |
| Filter value ceiling | **IMPLEMENTED** | `MAX_FILTER_VALUES`, `filterValues()` |
| Per-actor rate limiting | **VERIFIED** in process | `FixedWindowRateLimiter`; a scripted write flood and read flood are both refused with `Retry-After` and no data |
| Distributed rate limiting | **PLANNED** | per-instance today; **DR-027** |
| Generic error responses | **VERIFIED** | one `404 {"error":"not_found"}` for every authorization failure and every unmapped route |
| Security headers | **DECLARED / NOT YET ENFORCED** | `SECURITY_HEADERS`, 4 tests **as configuration**. No transport serves them. **This is not a verified network control** — **DR-029** |
| Cookie attributes (`HttpOnly`, `Secure`, `SameSite`) | **DECLARED / NOT YET ENFORCED** | `SESSION_COOKIE` is asserted as a value; no cookie has ever been observed over a wire. **DR-029** |
| CSRF token | **PLANNED** | With the transport. Not proven end-to-end and not claimed as such — **DR-029** |
| CORS policy | **PLANNED** | No transport, therefore no CORS behaviour to prove — **DR-029** |
| TLS / HSTS | **DECLARED / NOT YET ENFORCED** | The `Strict-Transport-Security` value exists as a string. Nothing terminates TLS. **DR-029** |
| HTTP transport itself | **PLANNED** | ADR-0006 is `Proposed`; no code may depend on it |
| Rate-limit and pagination thresholds are configuration | **IMPLEMENTED** | `POC_SECURITY_POLICY.rateLimits`; **POC / initial defaults, not production-approved thresholds** |
| No enterprise source called from the browser | **IMPLEMENTED** | architecture gate: `presentation` may depend only on `app` |

## 4. Audit

| Control | State | Evidence / debt |
| --- | --- | --- |
| Append-only by schema privilege | **VERIFIED** | `migrations/0008` REVOKE + rejecting trigger, executed against real PostgreSQL by `npm run db:verify`. Constrains `gldi_app`; **does not** constrain a database-owner or host-privileged actor |
| Append-only by construction in process | **IMPLEMENTED** | `InMemoryAuditLog`; test "exposes no operation that mutates or removes a past record" |
| Records frozen on read | **IMPLEMENTED** | test "hands back frozen records" |
| A failed audit fails the operation | **IMPLEMENTED** | `AuditWriteFailed`; test |
| Every sensitive read audited with the **fields returned** | **IMPLEMENTED** | `Dispatcher.#recordFieldLevelRead`; test |
| Every write audited with a before/after fingerprint | **IMPLEMENTED** | `fingerprint()`; 4 tests |
| Fingerprint carries no values | **IMPLEMENTED** | test "does not put the values themselves in the record" |
| Every denial audited with a reason | **IMPLEMENTED** | test "records a denial, with the reason" |
| Authentication events audited | **IMPLEMENTED** | test "audits the login itself" |
| Queryable by actor, entity, time window | **IMPLEMENTED** | REQ-SEC-007; test |
| Audit readable only by `ASSURANCE_AUDITOR` | **IMPLEMENTED** | `adversarial.test.ts` "refuses everyone the audit log except the auditor" |
| Access-event-only view for `SECURITY_ADMIN` | **PARTIAL** | `accessEventsOnly()` exists and is tested; no route uses it — **DR-030** |
| Reading the audit log is itself audited | **IMPLEMENTED** | `/v1/audit` has `auditReads: true` |
| Audit written in the same transaction as the write | **PARTIAL** | True in process; the PostgreSQL sink is **DR-024** |
| **Durable audit persistence** | **PLANNED** | The running log is **in memory** and is lost on restart. Not durable, not forensically reconstructable, not tamper-resistant against a privileged infrastructure actor. **DR-024**; `SECURITY_MODEL.md` §5.4b |
| Concurrent durable writers | **PLANNED** | Never exercised — there is no durable writer. **DR-024** |
| Retention and immutable archive | **PLANNED** | Nothing deletes and nothing archives. **DR-033** |
| Security-telemetry fields readable by the auditor | **VERIFIED** | ADR-0016 C-14; `security-telemetry.test.ts` |
| Security-telemetry read produces an audit event | **VERIFIED** | dispatcher reason carries `securityTelemetry=…`; asserted |

## 5. Data lineage and freshness

| Control | State | Evidence / debt |
| --- | --- | --- |
| Source, last refresh and evidence ids per metric | **IMPLEMENTED** | `buildLineageReport`, `GET /v1/lineage/:id` |
| Four freshness states | **IMPLEMENTED** | `CURRENT` / `STALE` / `DEGRADED` / `UNAVAILABLE` |
| Last-known-good flag | **IMPLEMENTED** | `servingLastKnownGood` |
| Worst-of, never averaged | **IMPLEMENTED** | `worstOf()`; a dead feed cannot hide behind five healthy ones |
| Degraded sources named, not counted | **IMPLEMENTED** | `degradedSources` |
| Provenance envelope on derived values | **IMPLEMENTED** (Phase 2/4) | `platform/provenance`, `platform/explainability` |
| Source authentication | **PLANNED** | ADR-0008; T-ING-2 |

## 6. Observability

| Control | State | Evidence / debt |
| --- | --- | --- |
| OTel-shaped traces, metrics, logs | **IMPLEMENTED** | `platform/observability` |
| Redaction of sensitive attribute keys | **VERIFIED** | `redact()`; a rate card, a margin, a credential and a security-telemetry value are each proven unable to reach an exported record even when passed deliberately |
| Security telemetry excluded from telemetry | **VERIFIED** | `sourceIp`, `userAgent`, client-IP and session-id keys redacted; no dispatch puts either value into an exported span, log or metric |
| Long values truncated, objects never serialised | **IMPLEMENTED** | tests |
| Authorization-denial metric for alerting | **IMPLEMENTED** | `gldi.authz.denials`; test |
| Actual OpenTelemetry SDK and OTLP export | **PLANNED** | ADR-0009 is `Proposed`; **DR-025** |
| Log aggregation / SIEM integration | **PLANNED** | deployment concern |

## 7. Secure development lifecycle

Nothing in this section is claimed as implemented beyond what the repository actually runs.

| Practice | Target | State | Evidence / debt |
| --- | --- | --- | --- |
| Secret scanning | Every commit | **VERIFIED** | `scripts/ci/secret-scan.mjs` over every tracked file |
| Architecture / boundary enforcement | Every commit | **IMPLEMENTED** | `npm run check:architecture`, 72 files |
| Schema boundary enforcement | Every commit | **IMPLEMENTED** | `npm run check:schema` |
| Dynamic-execution ban (`eval`, `child_process`, `vm`) | Every commit | **IMPLEMENTED** | G-EXEC gate |
| Type safety, strict | Every commit | **IMPLEMENTED** | `tsc --noEmit`, `exactOptionalPropertyTypes` |
| Lint with security rules | Every commit | **IMPLEMENTED** | ESLint flat config, import-boundary plugin |
| Authorization test matrix | Every commit | **VERIFIED** | 247 tests in `tests/authz`, of which 25 are scripted attacks against the running pipeline |
| Threat-model / control-matrix consistency | Every commit | **IMPLEMENTED** | `threat-model-regression.test.ts` — MITIGATED claims must name evidence; every open DR must carry a valid gate; every DR a document cites must exist in the register |
| **SAST** | CodeQL or Semgrep in CI | **PLANNED** | **DR-031** |
| **SCA / dependency vulnerability scan** | `npm audit` + Dependabot | **PARTIAL** | `npm audit --audit-level=high` runs in CI (`.github/workflows/ci.yml`). Dependabot, pinned-digest policy and a triage process are **DR-031** |
| **DAST** | ZAP against a running instance | **PLANNED** | needs the transport first (ADR-0006) |
| **API security tests** | Schema fuzzing, authz fuzzing | **PARTIAL** | hostile-input tests exist; fuzzing is **DR-032** |
| **Container / IaC scanning** | Trivy, checkov | **PLANNED** | no container or IaC yet |
| **SBOM** | CycloneDX per build | **PLANNED** | **DR-031** |
| **Signed builds / provenance** | SLSA-style attestation | **PLANNED** | **DR-031** |
| **Protected CI/CD** | Required reviews, no self-approval, scoped tokens | **PLANNED** | **DR-031** |
| **Penetration test** | External, pre-production | **PLANNED** | `SECURITY_MODEL.md` §9 |
| **OWASP ASVS L2 verification** | Full L2 baseline | **PARTIAL** | see §8 |

## 8. OWASP ASVS L2 — honest self-assessment

Not a certification, and **scoped to the POC implementation** — synthetic data, one process, no
transport. A statement of where this design sits against the L2 baseline, so the gaps are named
before an assessor names them. Where a chapter reads "Strong", it means strong *for what is built*;
none of it survives contact with production without the debt items in
`docs/SECURITY_DEBT_REGISTER.md`.

| ASVS chapter | Position |
| --- | --- |
| V1 Architecture | **Strong.** Trust boundaries documented and machine-enforced; threat model exists; authorization in exactly one layer |
| V2 Authentication | **Weak by design.** No credential handling, no MFA. `DR-023`. The mock refuses to start outside a demo |
| V3 Session management | **Strong.** Server-side, absolute + idle expiry, revocation on grant change, opaque token, cookie attributes declared |
| V4 Access control | **Strong.** RBAC + ABAC + object level + field level, deny-by-default at every layer, BOLA attacked and repelled, separation of duties enforced by test, and a narrow investigative grant for security telemetry that is itself audited |
| V5 Validation / encoding | **Adequate.** Allow-list validation, unknown fields rejected, prototype pollution blocked. Output encoding is Phase 6 |
| V7 Error handling / logging | **Strong for the POC.** Generic errors, correlation ids, code-enforced redaction, audit separate from debug logs. **Weak on durability** — the audit store is in memory (DR-024), so an assessor should read "logging" here as "log semantics", not "log retention" |
| V8 Data protection | **Partial.** Classification and omission are enforced; no encryption at rest, no key management. `SECURITY_MODEL.md` §9 |
| V9 Communications | **Not implemented.** TLS/HSTS **declared as configuration**, never applied to traffic — there is no transport. No communications control in this codebase has been exercised over a network |
| V10 Malicious code | **Adequate.** G-EXEC bans dynamic execution; SCA is `PLANNED` |
| V11 Business logic | **Strong.** Rate limits, sequence enforced by the pipeline, immutable baselines |
| V12 Files / resources | **Not applicable.** No file upload or download exists |
| V13 API | **Strong.** Versioned, resource-shaped, validated, paginated, rate-limited, audited |
| V14 Configuration | **Partial.** Secrets externalised and scanned for; headers declared; no build hardening |

## 9. Findings this phase produced

Recorded because a control matrix whose controls have never caught anything is a matrix nobody has
tested.

1. **`UnclassifiedField` caught unclassified audit fields.** `sourceIp` and `userAgent` had been
   recorded since Phase 2 and had never been classified. The first time the audit endpoint tried to
   return a record, it threw. → CONFLICT **C-14**, ADR-0016 D-4.
2. **The separation-of-duties test caught a real privilege-escalation path.** `data.applyCorrection`
   had been granted to `SECURITY_ADMIN`, which would have let the one role that can widen anyone's
   scope also alter financial facts. `SECURITY_MODEL.md` §4.1 says that role gets "no business
   data". Removed.
3. **G-CLOCK caught instant arithmetic in three new files** — session expiry, the rate-limit window
   and source freshness were all computing on `Date` directly. Moved into `platform/time`.
4. **G-FLOAT caught numeric coercion at the API boundary.** `parseInt` on a page size is legitimate,
   and it still belongs in `platform/decimal` where every numeric conversion in the codebase can be
   reviewed in one place.
