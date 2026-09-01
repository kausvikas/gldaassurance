# Requirement Traceability Report — Phase 5: Security, Identity, Authorization, Audit & Platform Foundations

- **Phase:** 5 (closed — this report was extended by the Phase 5 closure pass; see §13)
- **Date:** 2026-08-30, extended at closure the same day
- **Author:** Security architecture + platform engineering
- **Requirements in scope:** REQ-SEC-001…009; REQ-DATA-010 (continuing); REQ-PORT-003 (authorization
  aspect); REQ-HLTH-007 (override audit aspect)
- **Artifacts consumed:** `CLAUDE.md`, `PRODUCT_SPEC.md`, `ARCHITECTURE_DECISIONS.md`,
  `METRIC_CATALOG.md` v2.0.0, `SECURITY_MODEL.md` v1.0.0, `TEST_STRATEGY.md`,
  `DEFINITION_OF_DONE.md`, `PHASE_HANDOFF.md` (Phase 4), `docs/adr/ADR-0001`…`0016`

---

## 1. Requirement coverage

| REQ ID | Requirement (short) | State | Evidence (`file:line`) | Verification | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-SEC-001 | Authentication with session management and explicit expiry | IMPLEMENTED_WITH_DEBT | `src/contexts/identity/internal/identity-provider.ts:112` | authz | ✅ `tests/authz/session-and-config.test.ts` (10) | Sessions, expiry and revocation are **real**. Authentication itself is a labelled synthetic-persona provider that **throws** outside a demo environment. SSO/MFA is **DR-023** |
| REQ-SEC-002 | Role- and scope-based authorization enforced server-side on every read and write | IMPLEMENTED | `src/platform/authz/policy.ts:78`, `src/app/authorization/enforcement.ts:96` | authz | ✅ `tests/authz/matrix.test.ts` (148), `adversarial.test.ts` (25) | Matrix is data, not branching code; deny-by-default is "not found in the table" |
| REQ-SEC-003 | Row-level scoping: users see only entities within their organisational scope | IMPLEMENTED | `policy.ts:141` `resolveScope` | authz | ✅ `matrix.test.ts` §ABAC (6), `adversarial.test.ts` §1 (5) | Scope resolves to a concrete set **before** any query; aggregates take the set, not a predicate |
| REQ-SEC-004 | Field-level redaction: commercial fields gated by permission | IMPLEMENTED | `src/app/authorization/field-policy.ts:78` `shape()` | authz | ✅ `matrix.test.ts` (24 generated), `adversarial.test.ts` §3 (4) | Fields are **omitted**, not masked (§4.5, ADR-0005 §4). The masking seam exists and is unused — CONFLICT C-13 |
| REQ-SEC-005 | Deny-by-default: an unmapped route or field is inaccessible | IMPLEMENTED | `policy.ts:88`, `dispatcher.ts:104`, `field-policy.ts:88` | authz | ✅ `matrix.test.ts` §deny-by-default (3), `adversarial.test.ts` "does not route an unmapped path" | Three layers: unknown capability, unmapped route, **unclassified field throws** |
| REQ-SEC-006 | Immutable audit log for every read of sensitive commercial data and every write | IMPLEMENTED_WITH_DEBT | `src/platform/audit/append-only.ts:80`, `dispatcher.ts:191` | integration | ✅ `tests/integration/audit-and-observability.test.ts` (20) | Append-only in schema **and** in process; a failed audit fails the operation. The **PostgreSQL sink is not wired** — the POC runs in memory. **DR-024** |
| REQ-SEC-007 | Audit records are queryable by actor, entity, and time window | IMPLEMENTED | `append-only.ts:118` `query()` | integration | ✅ "is queryable by actor, entity and time window" | |
| REQ-SEC-008 | No secret material in the repository; configuration is externalised | IMPLEMENTED | `scripts/ci/secret-scan.mjs` | integration | ✅ 203 files, 0 findings | Unchanged from prior phases; re-run this phase |
| REQ-SEC-009 | Trust boundaries documented and enforced; the browser is untrusted | IMPLEMENTED | `docs/THREAT_MODEL.md` §2, `architecture/manifest.json` | architecture + manual | ✅ `tests/integration/architecture.boundaries.test.ts` (41) | Documented in the threat model; enforced by the gate (`presentation` may depend only on `app`) |
| REQ-DATA-010 | Lineage: every derived value records inputs, rule version, computation time | IMPLEMENTED | `src/app/lineage/lineage-service.ts:96` | integration | ✅ via `GET /v1/lineage/:id` in `adversarial.test.ts` routing; freshness logic unit-covered | Phase 4 delivered the per-assessment explanation; Phase 5 adds source-level lineage and freshness |
| REQ-PORT-003 | Aggregates exclude out-of-scope entities | IMPLEMENTED | `scripts/security/demo-api.ts` summary handler | authz | ✅ `adversarial.test.ts` §6 | Computed **over** the authorised set — there is no global total to filter |
| REQ-HLTH-007 | Overrides require actor, reason, timestamp and expiry; audited; never silent | IMPLEMENTED_WITH_DEBT | `contract.ts` route + `enforcement.recordWrite` | integration | ✅ "records a write with a before/after fingerprint and the stated reason" | Audited with a fingerprint. **Expiry is accepted in the body but not yet persisted or enforced** — no override store exists. **DR-036** |

### 1.1 Coverage summary

| State | Count |
| --- | --- |
| IMPLEMENTED | 8 |
| IMPLEMENTED_WITH_DEBT | 4 |
| MOCKED | 0 |
| STUBBED | 0 |
| DEFERRED | 0 |
| BLOCKED | 0 |
| NOT_STARTED | 0 |
| **Total in scope** | **12** |

**Explicitly out of scope and stated so it is not mistaken for delivered:** REQ-SEC-010 (assistant
authorization context) is Phase 11. The architecture that will make it enforceable exists now —
`ai-intelligence` may import no domain context — but no assistant code has been written.

---

## 2. Phase-brief deliverable coverage

The brief asked for eleven things. Each, and what actually exists:

| Asked for | State | Where |
| --- | --- | --- |
| `IdentityProvider` abstraction; mock personas; OIDC as production target | **IMPLEMENTED** | `identity-provider.ts`; mock throws outside demo/test |
| Server-side RBAC + ABAC | **IMPLEMENTED** | `DeclarativePolicy`; 148 matrix tests |
| Object-level security; test that an id cannot be changed to reach another project | **IMPLEMENTED** | `adversarial.test.ts` §1 — 5 BOLA tests |
| Field classification + masking seams; executive uses aggregate economics | **IMPLEMENTED**, with a documented deviation | Omission enforced, masking seam unused — CONFLICT C-13, ADR-0016 D-3 |
| Versioned API, validation, pagination/filter limits, rate limits, no tables exposed, no direct browser→source | **IMPLEMENTED** as contract + pipeline; **transport DECLARED** | `contract.ts`, `validation.ts`, `rate-limit.ts`, `dispatcher.ts`. No HTTP server — ADR-0006 is `Proposed` |
| Append-oriented `AuditEvent` service for the nine named event types | **IMPLEMENTED** | `InMemoryAuditLog` + capabilities for ETC, baseline, CR, override, rule change, risk acceptance, recovery, correction |
| Data lineage / freshness, last-known-good, degraded state | **IMPLEMENTED** | `lineage-service.ts`; four states, worst-of, named degraded sources |
| STRIDE threat model over seven surfaces | **IMPLEMENTED** | `docs/THREAT_MODEL.md` — **50 threats** after closure reconciliation, bound to tests by `threat-model-regression.test.ts`, with a required-coverage table in §13 |
| Security engineering roadmap, implemented vs planned | **IMPLEMENTED** | `docs/SECURITY_CONTROL_MATRIX.md`, incl. an honest ASVS L2 self-assessment |
| Secrets/encryption; privacy, retention, regional readiness | **DOCUMENTED** (implementation is post-POC) | `SECURITY_MODEL.md` §8.1–8.4 |
| OpenTelemetry-compatible traces/metrics/logs; never log confidential payloads | **IMPLEMENTED** | `platform/observability`; redaction enforced in code, 5 tests |

---

## 3. Tests run

| Suite | Run | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| unit | 120 | 120 | 0 | 0 |
| golden | 170 | 170 | 0 | 0 |
| integration | 81 | 81 | 0 | 0 |
| **authz** | **205** | **205** | 0 | 0 |
| architecture | 41 | 41 | 0 | 0 |
| a11y | 0 | 0 | 0 | 0 |
| **Total** | **576** | **576** | **0** | **0** |

New this phase:

```
25  tests/authz/adversarial.test.ts              ← the acceptance gate
148 tests/authz/matrix.test.ts                   ← 108 RBAC + 24 field + ABAC + C-13
20  tests/authz/session-and-config.test.ts
12  tests/authz/threat-model-regression.test.ts
20  tests/integration/audit-and-observability.test.ts
```

**After the closure pass (§13), the same suites read:**

```
618 tests, 0 failed, 0 skipped   (22 files)
247 of them authorization        (5 files in tests/authz)

25  tests/authz/adversarial.test.ts              ← the acceptance gate, unchanged
155 tests/authz/matrix.test.ts                   ← 108 RBAC + 30 field + ABAC + C-13
27  tests/authz/session-and-config.test.ts       ← + policy/config and startup-guard regression
21  tests/authz/threat-model-regression.test.ts  ← + debt-register and coverage governance
19  tests/authz/security-telemetry.test.ts       ← new: ADR-0016 C-14
20  tests/integration/audit-and-observability.test.ts
```

**Failures:** none outstanding. **Skipped:** none — no test in this repository is skipped, and no
security test is skipped or conditional.

Other gates, all re-run at closure: `typecheck` clean · `check:architecture` **72 files, 0
violations** · `check:schema` 8 migrations, 0 violations · `lint` 0 problems · `data:validate`
126,126 records, 0 errors, content hash unchanged · `secret-scan` 203 files, 0 findings ·
`npm audit --audit-level=high` **0 vulnerabilities** · `db:verify` **80 checks, 80 passed** against
real PostgreSQL. No persistence file changed in the closure pass; `db:verify` was re-run because it
is part of the declared CI gate set, and it confirms DR-012 stays closed.

---

## 4. The acceptance gate — attacking it

The brief required attempting unauthorized access, privileged mutations, parameter manipulation and
unsafe export patterns, and fixing what was exploitable. Twenty-five attacks, all repelled:

| Attack | Result |
| --- | --- |
| Change the project id to another director's project | 404 |
| Distinguish an out-of-scope id from a non-existent one | **Byte-identical responses** |
| Read out-of-scope economics | 404 |
| Write to an out-of-scope project | 404 |
| Find an out-of-scope project in a list | Absent |
| Path traversal, encoded separators, wildcards, wrong case in an id (6 payloads) | 400/404, never 200 |
| Smuggle `role` / `scope` in a request body | 400 |
| `__proto__` in a JSON body | 400, prototype unpolluted |
| `?limit=100000` | Clamped to 100 |
| Negative / exponent / hex / whitespace / `Infinity` / fractional offset (6 payloads) | 400 each |
| Unmapped routes incl. `/v1/admin`, `/v2/projects` (4 payloads) | 404 |
| Read commercial fields as a Delivery Manager | Absent from the payload; no `null`, no placeholder |
| Return a field nobody classified | **Throws** |
| Read `PERSONAL_DATA` as any role incl. Executive | Absent |
| Apply a RAG override as a Delivery Manager | 404 |
| Read business data as Security Administrator | 404 |
| Read the audit log as anyone but the auditor (4 roles) | 404 |
| Present a valid session while claiming another role | 404 |
| Forge a session id | 404 |
| Use a revoked session | 404 |
| Use a session after a grant change | 404 |
| Leak out-of-scope totals through the aggregate | Scoped total ≠ global total |
| Flood writes | 429 with `Retry-After` |
| Find an export endpoint | None exists |

**Exploitable issues found and fixed before proceeding:** two — see §5.

---

## 5. Defects the controls caught during this phase

| # | Found by | Defect | Severity | Disposition |
| --- | --- | --- | --- | --- |
| 1 | `UnclassifiedField` (`shape()`) | `sourceIp` and `userAgent` on audit records had never been classified; the first audit response threw | **High** — an unclassified field returns to every role | Fixed: classified `PERSONAL_DATA`. Surfaced CONFLICT **C-14** — the taxonomy has no category for security telemetry an auditor must see |
| 2 | `threat-model-regression.test.ts` T-ADM-2 | `data.applyCorrection` was granted to `SECURITY_ADMIN` — the role that can widen anyone's scope could also alter financial facts | **High** — separation-of-duties break, privilege escalation path | Fixed: grant removed. §4.1 gives that role "no business data" |
| 3 | G-CLOCK (ESLint) | Instant arithmetic on `Date` in session expiry, the rate-limit window and source freshness | Medium — the "measuring the wrong thing" class the gate exists for | Fixed: `instantPlusMs`, `msBetween`, `daysBetweenInstants`, `earlier` added to `platform/time` |
| 4 | G-FLOAT (architecture gate) | `parseInt` at the API boundary | Low | Fixed: `parseBoundedCount` in `platform/decimal`, where every numeric conversion is reviewable in one place |
| 5 | Contract test | `/v1/portfolio/summary` was a collection-shaped GET with no declared page ceiling | Low | Fixed: `maxPageSize: 1` — it can never return more than one aggregate row |

Items 1 and 2 are the ones that would have mattered. Both were found by controls written this phase,
not by review.

---

## 6. Invariant compliance

| # | Invariant | Held? | Evidence / exception |
| --- | --- | --- | --- |
| 3 | No silent change to formulas, metrics, boundaries, security, brand, RAG, scenarios | **Yes** | Four conflicts (C-11…C-14) raised in ADR-0016; `SECURITY_MODEL.md` §4.1/§4.3/§4.4/§4.5 implemented **as written**, not as the brief proposed |
| 5 | No false completion claims | **Yes** | REQ-SEC-001 and REQ-SEC-006 are `IMPLEMENTED_WITH_DEBT` because authentication is synthetic and the audit sink is in-memory. The transport is `DECLARED`, not claimed |
| 6 | Decimal-safe, server-side financial computation | **Yes** | G-FLOAT held; the one legitimate coercion moved to `platform/decimal` |
| 7 | Server-side authorization only | **Yes** | Enforcement is in the application layer, once. Architecture gate proves no domain context imports the policy. No UI exists to hide anything in |
| 8 | L1/L2/L3 separation intact | **Yes** | No metric changed this phase; lineage reports epistemic level per metric |
| 9 | AI is not calculator or system of record | **Yes (vacuous)** | No assistant code. Its threat surface is modelled ahead of it (§9 of the threat model) |
| 10 | Modular monolith with strict contexts | **Yes** | 72 files, 0 violations. New `platform/observability` declared in the manifest with its dependency allow-list |
| 11 | `DEMO — SYNTHETIC DATA` labelling | **Yes** | Every API response carries `notice: 'DEMO — SYNTHETIC DATA'`; headers on the threat model and control matrix |

---

## 7. Proposed deviations / ADRs

| ADR | Title | Status | Rationale | Impact | Rollback |
| --- | --- | --- | --- | --- | --- |
| [0016](../adr/ADR-0016-phase-5-security-conflicts.md) | Phase 5 security conflicts: role taxonomy, classification taxonomy, masking, audit telemetry | **Proposed** | Four brief-versus-`SECURITY_MODEL.md` conflicts; the approved artifact outranks a phase instruction | No implemented change — all four decisions preserve the approved position and record the alternative | Each of D-1…D-4 is independently reversible; D-3 and D-4 are one-file changes |

---

## 8. Conflicts encountered

| Artifacts in conflict | Nature | Precedence applied | Resolution |
| --- | --- | --- | --- |
| **C-11** — brief vs `SECURITY_MODEL.md` §4.1 | Nine roles proposed; six are approved, are the DB CHECK constraint, and are the persona set | SECURITY_MODEL (rank 3) outranks a phase brief (unranked) | Six implemented. Mapping published: 7 of 9 already expressible, 3 of those as *scope* not role. Only **Commercial** needs a new role. ADR-0016 D-1 |
| **C-12** — brief vs §4.3 | `PUBLIC/INTERNAL/CONFIDENTIAL/HIGHLY RESTRICTED` vs the approved four | SECURITY_MODEL | Approved taxonomy kept — the severity ladder cannot express "delivery manager sees delivery detail but not commercial". Mapping published. ADR-0016 D-2 |
| **C-13** — brief vs §4.5 + ADR-0005 §4 | "Masking seams" vs "fields are **absent**, not `null`, not `***`" | ADR (rank 1) and SECURITY_MODEL (rank 3) | Omission enforced; `REDACT` exists as the requested seam and **nothing uses it**, asserted by test. ADR-0016 D-3 |
| **C-14** — §5.2 vs §4.3 | §5.2 requires `sourceIp`/`userAgent`; §4.3 grants `PERSONAL_DATA` to nobody | Neither outranks the other — a genuine gap in the model | Classified `PERSONAL_DATA`: recorded, not returned, including to the auditor. Conservative direction, real gap. ADR-0016 D-4 recommends a fifth `SECURITY_TELEMETRY` classification |

---

## 9. Debt register delta

| ID | Item | State | Owner | Target phase | Risk if unaddressed |
| --- | --- | --- | --- | --- | --- |
| DR-023 | No SSO, MFA, SCIM or short-lived tokens | DEFERRED | Platform + IT | Post-POC | **Everything in the security model assumes the caller is who they say they are.** Until this lands, that assumption is unfounded |
| DR-024 | Audit sink is in-memory; the PostgreSQL writer is not wired | DEFERRED | Platform | 6 | Audit does not survive a restart. The schema, grants and trigger exist and are verified; only the writer is missing |
| DR-025 | No OpenTelemetry SDK or OTLP export | DEFERRED | Platform | Post-POC | Telemetry is collected in process and goes nowhere. Blocked on ADR-0009 acceptance |
| DR-026 | Impersonation designed, not implemented | DEFERRED | Security | 7 | The control most likely to be added under demo pressure and least likely to be added carefully |
| DR-027 | Rate limiter is per-instance | DEFERRED | Platform | Post-POC | Limits do not hold across instances; needs a shared store |
| DR-028 | No PostgreSQL row-level security | DEFERRED | Platform | Post-POC | Scoping is application-layer only. Defence in depth is absent, not the control itself |
| DR-029 | No transport: TLS, HSTS, CSRF token, header application | DEFERRED | Platform | 6 | Headers and cookie attributes are declared and tested as configuration; nothing applies them. Blocked on ADR-0006 |
| DR-030 | `accessEventsOnly()` exists but no route uses it | DEFERRED | Security | 6 | `SECURITY_ADMIN`'s access-event view is unreachable; the function and its test exist |
| DR-031 | No SAST, SCA, SBOM, signed builds or protected CI/CD | DEFERRED | Platform | Post-POC | Supply-chain and code-scanning controls absent; the repository has secret scanning and boundary gates only |
| DR-032 | No API fuzzing | DEFERRED | Security | 12 | Hostile-input tests are hand-written; the input space is not explored |
| DR-033 | Retention schedules and erasure not implemented | DEFERRED | Legal + Platform | Post-POC | Categories are defined (`SECURITY_MODEL.md` §8.2); nothing deletes anything. Erasure versus an append-only audit log needs counsel |
| DR-034 | No control-plane / data-plane split | DEFERRED | Architecture | Post-POC | Single-region only. The seam is documented (§8.3) and the two properties that make it tractable already hold |
| DR-035 | No encryption at rest, KMS, secret manager or rotation | DEFERRED | Platform | Post-POC | Data at rest is protected by host controls only |
| DR-036 | RAG-override expiry is accepted but not persisted or enforced | DEFERRED | Delivery Intelligence | 8 | An override without an enforced expiry is a permanent silent adjustment — the exact failure `SECURITY_MODEL.md` §3 names |

**Carried forward, unchanged:** DR-017 (2 of 56 tables carry grants), DR-018, DR-019, DR-020,
DR-021, DR-022 (no persistence for Phase 4 outputs).

**Closed this phase:** none.

---

## 10. Open questions

Every still-open item from prior phases, restated. Dropping one silently is a governance failure.

| ID | Question | Status | Blocks | Owner |
| --- | --- | --- | --- | --- |
| MC-2 / OQ-4 | Six health dimension weights | Open | `MET-HLTH-001…006`, `MET-HLTH-010` | Sponsor / Delivery leadership |
| MC-3 | `HEALTH-v1` band edges and critical-breach triggers | Open | The Frozen health model | Rules + Delivery leadership |
| MC-5 | What "intervenability" means | Open | `MET-PORT-007`, **AC-1, Phase 7** | Delivery leadership |
| MC-6 | Deterioration threshold calibration | Partially open | Inherits MC-2/MC-3 | Delivery leadership |
| MC-8 | What a "scope unit" is | Open | `MET-DEL-012`, `MET-QUA-002` | Delivery + Engineering |
| **OQ-3** | **May a Delivery Manager see cost rates and margin?** | **Open — assumed "no" and now enforced by 24 tests** | If it flips, §4.3, `CLASSIFICATION_MATRIX` and the authz matrix all change | Sponsor |
| DQ-4 | Does `recovery` survive as a context? | Open | Decided after Phase 10 | Architecture |
| C-7 | Four executive health dimensions or six? | Open — ADR-0015 D-1 | Which model drives `MET-HLTH-011` | Sponsor / Delivery leadership |
| C-9 | Does `MET-DQ-009` supersede `MET-DQ-007`? | Open — ADR-0015 D-3 | Whether the profile is permanent | Assurance |
| C-10 | Which "Green" does Green-at-Risk mean? | Open — ADR-0015 D-4 | Whether the reference scenario fires the flagship rule | Sponsor / Delivery leadership |
| **C-11** | Nine roles or six? | **Open — ADR-0016 D-1** | A migration, the §4.4 matrix, ~50 tests, new personas | Sponsor / CISO |
| **C-12** | Which classification taxonomy? | **Open — ADR-0016 D-2** | Documentation only; no code change either way | CISO |
| **C-13** | Should any field ever be masked rather than omitted? | **Open — ADR-0016 D-3** | Whether `REDACT` is ever enabled | CISO |
| **C-14** | How does an auditor read audit telemetry that is personal data? | **Open — ADR-0016 D-4** | The audit log's investigative value | CISO |
| OQ-2 | Recognised revenue ownership | Closed (Phase 2) | — | — |
| C-1…C-6, C-8 | Phase 1–4 conflicts | Closed by ADR-0011…0015 | — | — |

---

## 11. Handoff

- **What now exists:** an `IdentityProvider` abstraction with a guarded synthetic implementation and
  a real session lifecycle; a policy engine holding `SECURITY_MODEL.md` §4.4 as data with
  deny-by-default as a lookup property; an enforcement point that sequences session → RBAC → scope →
  object check → audit; field shaping that omits and that **refuses to serialise an unclassified
  field**; a versioned API contract with validation, pagination ceilings and per-actor rate limits;
  an append-only audit log with before/after fingerprints where a failed audit fails the operation;
  source lineage with four freshness states; OTel-shaped telemetry with enforced redaction; a
  50-threat STRIDE model bound to tests; a control matrix with an honest ASVS L2 self-assessment;
  and, after closure, `SECURITY_TELEMETRY` with a narrow audited investigative grant, security
  thresholds moved into governed configuration, and every open debt item gated (§13).
- **What Phase 6 consumes:** `SECURITY_HEADERS` and `SESSION_COOKIE` (to be applied by a transport),
  `ROUTES`, `Dispatcher`, and the field classification maps — the UI renders "Restricted" from the
  *absence* of a field, never from a flag carrying the withheld value.
- **What Phase 6 must NOT assume:**
  1. That authentication is real. It is a persona selector that throws outside a demo.
  2. That audit survives a restart. It is in memory (DR-024).
  3. That any security header is applied. They are declared and tested; nothing serves them (DR-029).
  4. That an override expires. The field is accepted and not enforced (DR-036).
  5. That hiding a field in a component is a control. It never is, and the payload is already shaped.
- **`PHASE_HANDOFF.md` updated:** yes

---

## 12. Self-review

- [x] **Is any `IMPLEMENTED` claim resting on a UI that merely looks right?** No UI exists. Every
      authorization assertion is on a payload.
- [x] **Is any golden fixture's expected value generated from the implementation it tests?** The
      authz matrix is asserted against a transcription of `SECURITY_MODEL.md` §4.4 made independently
      of `CAPABILITY_MATRIX`; comparing the table to itself would pass forever.
- [x] **Is any authorization claim verified only through the UI?** No.
- [x] **Did any formula, threshold, or scenario change without an ADR?** No formula changed. Four
      security conflicts raised in ADR-0016 with the approved position implemented in every case.
- [x] **Is any mock unlabelled?** `MockIdentityProvider` declares `kind: 'SYNTHETIC'` and throws
      outside demo/test. The in-memory audit log and rate limiter are labelled as in-process with
      debt ids.
- [x] **If a claim in this report is wrong, would we find out now — or in front of the client?** Now,
      for authorization, audit and validation — 205 tests attack them. The exposure is what is
      **declared but not applied**: no transport means no TLS, no CSRF token and no header is
      actually served, and a demo over plain HTTP would be exactly as insecure as that sounds. It is
      DR-029, it is in the threat model's residual-risk section, and it is stated here rather than
      discovered during a security review.

---

## 13. Phase 5 closure addendum

The closure pass resolved ADR-0016, closed the C-14 telemetry gap, moved security thresholds into
governed configuration, and gated every open debt item. It began no Phase 6 work.

### 13.1 Closure requirement → implementation

| Closure requirement | State | Implementation | Verification |
| --- | --- | --- | --- |
| **C-11** accepted; personas and roles decoupled; explicit mapping artifact | **IMPLEMENTED** | ADR-0016 C-11; `SECURITY_MODEL.md` **§4.1a** — persona, role(s), business purpose, default scope type, capability families, explicit exclusions. **No role invented** | Doc; role union unchanged (`ALL_ROLES` still six) |
| **C-12** accepted with extension; taxonomy stays data-centric; `SECURITY_TELEMETRY` added | **IMPLEMENTED** | `FieldClassification` union; `CLASSIFICATION_MATRIX`; `ALL_CLASSIFICATIONS`; `SECURITY_MODEL.md` §4.3 | `security-telemetry.test.ts` §1 (7 tests); `matrix.test.ts` (30 generated classification cases) |
| Fields classified semantically, not wholesale | **IMPLEMENTED** | `AUDIT_FIELDS`: only `sourceIp`/`userAgent` are telemetry | "does not reclassify the rest of the audit record as telemetry" |
| No persona-named classifications | **IMPLEMENTED** | prohibited in §4.3 | "keeps the taxonomy data-centric — no classification is named after a role" |
| Dual authorization/privacy characterisation documented, not modelled | **DOCUMENTED + DEBT** | §4.3 warning; §8.2 90-day category; ADR-0016 C-12 | **DR-037** |
| **C-13** accepted; omission is default; masking not silently substituted | **IMPLEMENTED** (unchanged behaviour, now governed) | `field-policy.ts`; §4.5 | `matrix.test.ts` §C-13 (2); `adversarial.test.ts` §3 |
| **C-14** accepted; narrow investigative telemetry access | **IMPLEMENTED** | `policy.ts`, `field-policy.ts`, `dispatcher.ts`, `contract.ts`, `append-only.ts`, `demo-api.ts` | `security-telemetry.test.ts` (19) |
| Ordinary delivery persona denied telemetry | **IMPLEMENTED** | classification matrix + capability gate | "refuses the audit endpoint to every delivery and business persona" |
| Finance/business persona denied telemetry | **IMPLEMENTED** | same | same test, `fin.controller` included |
| Security/audit role allowed only under scope | **IMPLEMENTED** | `withinAuthorisedEntities` | "narrows audit rows to the caller's authorised entity set" |
| Telemetry access produces an audit event | **IMPLEMENTED** | `AUDITED_READ_CLASSIFICATIONS` + `securityTelemetry=` in the reason | "records the auditor's telemetry read, naming the telemetry fields returned" |
| Security roles hold no business-data mutation | **IMPLEMENTED** (unchanged, re-asserted) | `CAPABILITY_MATRIX` | `threat-model-regression.test.ts` T-ADM-2 (2) |
| `data.applyCorrection` still absent from `SECURITY_ADMIN` | **VERIFIED** | `CAPABILITY_MATRIX` | generated matrix + T-ADM-2 |
| Session thresholds are configuration/policy | **IMPLEMENTED** | `POC_SECURITY_POLICY`; `SessionStore` takes an injected policy | "enforces an injected policy rather than the module constant" |
| Rate-limit thresholds are configuration/policy | **IMPLEMENTED** | `POC_SECURITY_POLICY.rateLimits` | "takes every rate-limit bucket from the security policy" |
| Values labelled POC defaults, not corporate policy | **IMPLEMENTED** | `SECURITY_POLICY_PROVENANCE`; §3 and §7 notes | "labels the values as POC defaults rather than corporate policy" |
| Demo identity provider fails closed outside demo mode | **IMPLEMENTED** (strengthened) | `assertDemoEnvironment()` reads a declared allow-list | "refuses the synthetic provider in every configurable production-capable environment" (+2) |
| Invariant 1 — authorization stays server-side | **RECORDED** | `SECURITY_MODEL.md` §12.1; `PHASE_HANDOFF.md` §2a; threat T-UI-6 | Doc + contract; nothing to test until a UI exists |
| Invariant 2 — no unclassified API output | **IMPLEMENTED** | `UnclassifiedField`; §12.2 | `adversarial.test.ts` "refuses to serialise a field nobody classified" |
| Invariant 3 — existence hiding | **IMPLEMENTED** (preserved) | one generic 404; §12.3 | `adversarial.test.ts` "returns an identical response for out-of-scope and non-existent ids" |
| Invariant 4 — observability is a controlled data plane | **IMPLEMENTED** | `redact()` extended with telemetry keys; §6a; §12.4 | `security-telemetry.test.ts` §5 (2); `audit-and-observability.test.ts` (5) |
| Invariant 5 — future AI must not bypass authorization | **RECORDED** | §12.5; threats T-AI-1/2/8 | **DR-039**; nothing implemented, nothing claimed |
| Audit durability not overstated | **DOCUMENTED** | §5.4b lists six things the implementation does not prove; `AUDIT_IMPLEMENTATION_STATE` says so in code | Control matrix row; **DR-024** |
| Transport claims not overstated | **DOCUMENTED** | control matrix `DECLARED / NOT YET ENFORCED`; prohibited-claims table | **DR-029** |
| DB privilege model not overstated | **DOCUMENTED** | control matrix; T-DB-3 | **DR-017** |
| Every open DR gated with closure evidence | **IMPLEMENTED** | `docs/SECURITY_DEBT_REGISTER.md`; index in `PHASE_HANDOFF.md` §3 | `threat-model-regression.test.ts` §"debt is governed, not merely listed" (4) |
| Threat model reconciled; 20 required topics covered | **IMPLEMENTED** | `docs/THREAT_MODEL.md` §13 | "covers all twenty topics the closure requires"; "names only threat ids the model declares" |
| Control matrix distinguishes implemented vs declared | **IMPLEMENTED** | six states incl. `VERIFIED` and `DECLARED / NOT YET ENFORCED` | Doc; prohibited-claims table |
| Phase 6 handoff preserves server-side authority | **IMPLEMENTED** | `PHASE_HANDOFF.md` §2a — nine prohibitions, one permitted question | Doc |
| No Phase 6 implementation begun | **CONFIRMED** | `src/presentation/` contains `index.ts` and `README.md` only; G-DEMO still deferred | Architecture gate: 72 source files, unchanged |

### 13.2 Tests added at closure

| File | Tests | Covers |
| --- | --- | --- |
| `tests/authz/security-telemetry.test.ts` (new) | 19 | Classification, denial by persona, narrow grant, scope narrowing, audit-on-read, observability non-leakage |
| `tests/authz/session-and-config.test.ts` | +7 | Startup-guard regression against the configuration vocabulary; session and rate-limit thresholds sourced from policy; POC labelling |
| `tests/authz/matrix.test.ts` | +7 | `SECURITY_TELEMETRY` × every role; classification coverage in both directions; `SECURITY_ADMIN` denied every classification |
| `tests/authz/threat-model-regression.test.ts` | +9 | Debt-register governance; required-coverage table integrity; telemetry-grant narrowness |
| **Total** | **+42** | 576 → **618** |

No test was deleted, skipped or weakened. Existing tests proving an invariant were **referenced**
rather than duplicated — the closure's required list of twenty-one test obligations is met by 12 new
assertions and 9 pre-existing ones cited in §13.1.

### 13.3 Deviations recorded

Two behaviour changes were made that a reader could reasonably call out, so both are stated plainly
rather than buried in a diff:

1. **`assertDemoEnvironment()` no longer accepts the string `"demo"`.** It reads an allow-list drawn
   from configuration (`dev`, `test`). `"demo"` was never a value `loadConfig()` could produce, so
   nothing that worked stops working, and strictly fewer environments now start a credential-free
   provider. `SECURITY_MODEL.md` §3 is updated to match. This is a strengthening; it is recorded
   because §3 previously said "demo or test" and a reviewer comparing document to code would
   otherwise find a discrepancy.
2. **The audit endpoint now narrows rows to the caller's authorised entity set.** Previously it
   returned every record to any caller holding `audit.read`. `SECURITY_MODEL.md` §4.2 already said
   *all* reads are computed over the resolved set; the audit resource was not honouring it. Records
   naming no project — logins, session events, collection-level reads — are unaffected.

Neither changes a formula, a metric definition, a domain boundary, a brand token, RAG logic or a
synthetic scenario narrative.
