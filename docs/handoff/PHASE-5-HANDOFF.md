# PHASE_HANDOFF.md

**Current state:** Phase 5 **CLOSED** — **PASS WITH DEBT** — Phase 6 may begin, not started
**Last updated:** 2026-08-30 (Phase 5 closure)
**Updated by:** Phase 5 closure — security governance resolution, telemetry classification, debt gating

> **Phase 5 gate: PASS WITH DEBT. Phase 5 is CLOSED.**
>
> Security is structural. **618 tests pass, 0 fail, 0 skipped**, of which **247 are authorization
> tests** that assert absence. Twenty-five scripted attacks — BOLA, parameter tampering, privilege
> escalation, session forgery, aggregate leakage, resource exhaustion — run against the real pipeline
> and all are repelled.
>
> **ADR-0016 is ACCEPTED.** The four conflicts are settled: personas and security roles are
> intentionally **decoupled** (C-11); the classification taxonomy stays **data-centric** and gains
> **`SECURITY_TELEMETRY`** (C-12); **omission** is the default unauthorised-field behaviour (C-13);
> and security telemetry gets a **narrow, audited investigative grant** rather than a blanket
> `PERSONAL_DATA` opening (C-14). C-14 changed code; the other three confirmed what shipped and wrote
> down why.
>
> **Three real defects were found by the controls themselves**, not by review: an unclassified pair of
> audit fields, a separation-of-duties break that would have let the identity administrator alter
> financial facts, and a startup guard that had never been wired to the configuration vocabulary.
> All fixed. Details in §0.5.
>
> **Read §0.4 before building any UI.** The security headers, the CSRF requirement and the cookie
> attributes are *declared and tested as configuration*. Nothing applies them, because ADR-0006 is
> still `Proposed`. A demo served over plain HTTP is exactly as insecure as that sounds.
>
> **Every open debt item now carries an owning gate and its closure evidence** —
> `docs/SECURITY_DEBT_REGISTER.md`. **No open item is a Phase 6 blocker.**

> This file is rewritten at the end of every phase. It is the first thing the next phase reads after
> the four source-of-truth documents. It records what *is*, not what is hoped.
> Prior handoffs are archived in `docs/handoff/`.

---

## 0. Phase 5 report

### 0.1 What was built

| Component | Location | State |
| --- | --- | --- |
| **`IdentityProvider` abstraction** | `src/contexts/identity/internal/identity-provider.ts` | Implemented |
| Synthetic persona provider, guarded | same — `MockIdentityProvider`, `assertDemoEnvironment()` | Implemented, **throws outside the `dev`/`test` allow-list** |
| **`SessionStore`** — absolute 8h, idle 30m, sliding, revocation | same | Implemented; thresholds injected from `POC_SECURITY_POLICY` |
| **Security policy** — session windows, rate limits, demo-environment allow-list | `src/platform/config/index.ts` | Implemented — **POC defaults, labelled as such** |
| **Policy decision point** — RBAC matrix as data, ABAC scope, field gate | `src/platform/authz/policy.ts` | Implemented |
| **Enforcement point** — session → RBAC → scope → object check → audit | `src/app/authorization/enforcement.ts` | Implemented |
| **Field shaping** — omission, unclassified-field refusal, misplaced-telemetry refusal | `src/app/authorization/field-policy.ts` | Implemented |
| **`SECURITY_TELEMETRY`** — one role, one resource, in scope, audited | `src/platform/authz/policy.ts`, `src/platform/audit/append-only.ts` | Implemented (ADR-0016 C-14) |
| **Versioned API contract** — 8 routes, headers, cookie | `src/app/api/contract.ts` | Implemented (transport `DECLARED`) |
| **Input validation** — unknown fields rejected, ids constrained, prototype pollution blocked | `src/app/api/validation.ts` | Implemented |
| **Rate limiting** — per actor, four buckets | `src/app/api/rate-limit.ts` | Implemented in process |
| **Dispatcher** — the one pipeline, in one order | `src/app/api/dispatcher.ts` | Implemented |
| **Append-only audit log** + before/after fingerprints | `src/platform/audit/append-only.ts` | Implemented in process |
| **Lineage and freshness** — four states, worst-of, last-known-good | `src/app/lineage/lineage-service.ts` | Implemented |
| **Observability** — OTel-shaped, redaction enforced in code | `src/platform/observability/index.ts` | Implemented in process |
| **Demo composition root** | `scripts/security/demo-api.ts` | Implemented — what the tests attack |

Documents: `SECURITY_MODEL.md` **v2.1.0** (§4.1a persona↔role map; §5.4a telemetry access; §5.4b what
audit does *not* prove; §12 invariants for later phases) · `docs/THREAT_MODEL.md` **v1.1.0** (50
threats, 7 surfaces plus cross-cutting, with a required-coverage table) ·
`docs/SECURITY_CONTROL_MATRIX.md` **v1.1.0** (VERIFIED / IMPLEMENTED / PARTIAL / DECLARED / PLANNED /
N-A, plus an ASVS L2 self-assessment scoped to the POC) · **`docs/SECURITY_DEBT_REGISTER.md`** (new —
every open DR with owning phase, gate, blocking verdict and closure evidence) ·
`docs/adr/ADR-0016-phase-5-security-conflicts.md` (**Accepted**) ·
`docs/traceability/PHASE-5-TRACEABILITY.md`.

### 0.2 Numbers

| | |
| --- | --- |
| Tests | **618 passed, 0 failed, 0 skipped** (Phase 5: 576; closure added 42) |
| of which authorization | **247** across 5 files in `tests/authz` |
| RBAC assertions | 108 — every role × every capability, against an **independent** transcription of §4.4 |
| Classification assertions | 30 — every role × every classification, including `SECURITY_TELEMETRY` |
| Attacks in the acceptance gate | **25**, all repelled |
| Threats modelled | **50** across 7 surfaces plus cross-cutting, each with a state and evidence |
| Security controls in the matrix | 110 — 27 VERIFIED, 48 IMPLEMENTED, 5 PARTIAL, 6 DECLARED, 23 PLANNED, 1 N/A |
| Open debt items, all gated | **23** — of which **0 are Phase 6 blockers** |
| Source files under the architecture gate | 72 · **0 violations** |
| Source gates | G-CLOCK, G-FLOAT, G-ORACLE, **G-EXEC**, G-COLOUR (G-DEMO deferred to Phase 6) |
| Platform modules | 9, including `observability` |

### 0.3 The three ideas worth carrying forward

1. **Deny-by-default is a lookup, not a branch.** `may()` denies anything absent from the capability
   table; `mayReadField()` denies an unrecognised classification; `shape()` **throws** on a field
   nobody classified. The realistic leak is not a bypassed check — it is a new DTO property nobody
   thought about, and that now fails the build.
2. **Out-of-scope and non-existent are byte-identical.** One `404 {"error":"not_found"}` for every
   authorization failure. A distinct "forbidden" tells an attacker their id guess was correct, which
   is all the reconnaissance they need.
3. **When a control finds a gap, the dangerous move is usually the remedy.** C-14's obvious fixes —
   grant the auditor `PERSONAL_DATA`, or relabel an IP address as commercial data — would each have
   traded two audit fields for a much larger grant or a taxonomy that stopped meaning anything. The
   closure added a narrow classification instead, and recorded the tempting remedy as a threat
   (T-X-7) so the next person meets the argument rather than rediscovering it.

### 0.4 Read this before Phase 6

**The transport does not exist.** ADR-0006 is `Proposed` and `ARCHITECTURE_DECISIONS.md` §2 forbids
code depending on it, so there is no HTTP server. What exists is everything that would sit behind
one: route table, validation, pagination ceilings, rate limits, and the response-header set — all
tested as configuration. **Nothing serves them.**

Consequences for Phase 6:

- The UI renders "Restricted" from the **absence** of a field, never from a flag carrying the
  withheld value. The payload is already shaped; a component that receives no `forecastGmPercent`
  must not go looking for one.
- Hiding a field in a component is not a control and never becomes one.
- Applying `SECURITY_HEADERS`, the CSRF token and TLS is **DR-029**, and it blocks any deployment
  that is not a laptop.

### 0.5 What the controls caught

The first two would have shipped without them; the third had been latent since the guard was written.

1. **`UnclassifiedField` caught two unclassified audit fields.** `sourceIp` and `userAgent` had been
   in the record shape since Phase 2 and had never been classified. The first time the audit endpoint
   returned a record, it threw. → CONFLICT **C-14**. **Now closed:** they are `SECURITY_TELEMETRY`,
   readable by `ASSURANCE_AUDITOR` alone, on the audit resource alone, within scope, and audited on
   read. `PERSONAL_DATA` is still granted to nobody.
2. **A separation-of-duties test caught a privilege-escalation path.** `data.applyCorrection` had been
   granted to `SECURITY_ADMIN` — the one role that can widen anyone's scope would also have been able
   to alter financial facts. §4.1 gives that role "no business data". Removed.
3. **G-CLOCK caught instant arithmetic in three new files** — session expiry, the rate-limit window
   and source freshness were all computing on `Date` directly. Moved into `platform/time`.
4. **G-FLOAT caught numeric coercion at the API boundary**; the parse moved to `platform/decimal`.
5. **A contract test caught an uncapped collection route.**
6. **Closure found the demo-provider startup guard had never been wired to the configuration.** It
   permitted the literal `"demo"` — a string `loadConfig()` cannot produce — while refusing `dev`,
   which it can. The guard now reads a declared allow-list, and a regression test walks every
   environment the configuration can emit. Strictly fewer environments now start a credential-free
   provider.

### 0.6 What was deliberately not done

1. **No real authentication.** The provider authenticates a persona selection and throws outside a
   demo. SSO/MFA/SCIM is **DR-023**, and everything else in the security model assumes the caller is
   who they say they are.
2. **No transport** (DR-029). See §0.4.
3. **No PostgreSQL audit sink** (DR-024). The schema, grants and rejecting trigger exist and are
   verified against real PostgreSQL; only the writer is missing, so audit does not survive a restart.
4. **No impersonation** (DR-026). Designed in `SECURITY_MODEL.md` §3; `impersonatorId` propagates
   through every audit record so the trail exists ahead of the feature.
5. **No retention, encryption at rest, KMS or regional split.** Categories, key management and the
   control-plane/data-plane seam are documented in `SECURITY_MODEL.md` §8.2–8.4 (DR-033, DR-034,
   DR-035). Nothing deletes anything.
6. **No SAST/SCA/SBOM/DAST** (DR-031). The repository runs secret scanning, boundary gates and the
   authz suite; that is not a secure-development lifecycle and is not claimed as one.

---

## 1. What Phase 6 consumes

| Input | Where |
| --- | --- |
| Authorised computation entry point | `src/app/metrics/metric-calculation-service.ts` → `assessProject()` |
| Request pipeline | `Dispatcher.dispatch()`, `EnforcementPoint.authorise()` |
| Field classification maps | `scripts/security/demo-api.ts` (`PROJECT_FIELDS`, `AUDIT_FIELDS`, `LINEAGE_FIELDS`) |
| Transport configuration to apply | `SECURITY_HEADERS`, `SESSION_COOKIE`, `ROUTES` |
| Design tokens | `BRAND_DESIGN_SYSTEM.md` — Phase 6's own source of truth |
| What a screen may claim | `docs/PHASE-4-CURATED-ASSESSMENT.md` |
| What the controls are for | `docs/THREAT_MODEL.md` §3 (Web/UI: T-UI-1…5) |

## 2. What Phase 6 must NOT assume

1. **That authentication is real.** It is a persona selector guarded by an environment check.
2. **That audit survives a restart.** It is in memory (DR-024).
3. **That any security header is applied.** Declared and tested; nothing serves them (DR-029).
4. **That an override expires.** The field is accepted and neither persisted nor enforced (DR-036).
5. **That hiding a field in a component is a control.** It is not, and the payload is already shaped.
6. **That thresholds are approved.** Every band edge and weight remains a synthetic calibration
   candidate (Phase 4).
7. **That `HEALTH-v2` is the health model.** It is `Draft` under C-7.
8. **That an intervention ranking exists.** `rankAsMetPort007()` throws (MC-5).
9. **That a role name tells it anything.** Phase 6 must not infer a permission from a persona name or
   a role string. Personas and roles are decoupled by design (`SECURITY_MODEL.md` §4.1a).

## 2a. Phase 6 security contract (binding)

`SECURITY_MODEL.md` §12 is the authority; this is the operative summary for the phase that is about
to start. It is a contract, not advice: a Phase 6 deliverable that violates any line below is not
done, however good it looks.

### Phase 6 **may** build

- the GlobalLogic design system and its tokens;
- the application shell, navigation and executive layout;
- responsive UI structure;
- **capability-aware presentation** — showing, hiding, enabling and disabling controls according to
  the capabilities the backend reports for the current user.

### Phase 6 **must not**

1. **Implement authorization in React.** Not a check, not a guard component, not a route wrapper that
   decides access. Enforcement is server-side, at `EnforcementPoint`, on every request.
2. **Duplicate the RBAC matrix.** No copy of `SECURITY_MODEL.md` §4.4 in TypeScript, JSON, a config
   file or a constant. Authorization in two places is authorization in neither; it drifts, and it
   drifts open (B3).
3. **Infer permissions from persona names.** A persona is a UX concept; a role is an authorization
   construct; they are decoupled (§4.1a). "The user is a Delivery Manager, therefore they can…" is
   the exact reasoning this contract forbids.
4. **Render a field before the backend has classified and shaped it.** Every response field carries a
   classification or the request fails closed (§12.2). A component may not display a value the
   payload did not contain.
5. **Treat a hidden control as a security boundary.** Hiding is user experience. If hiding it is the
   only thing stopping the action, the action is not stopped.
6. **Bypass the enforcement point.** No direct import of a domain context, no repository access, no
   "internal" data path, no debug route. The architecture gate enforces this: `presentation` may
   depend on `app` and on nothing else.
7. **Expose security telemetry.** `sourceIp`, `userAgent` and any other `SECURITY_TELEMETRY` field are
   for `ASSURANCE_AUDITOR` on the audit resource, and there is no audit surface in Phase 6.
8. **Expose observability data.** Traces, spans, logs and metrics are a controlled data plane (§6a),
   not a debugging panel and not a UI data source.
9. **Weaken existence hiding.** One generic not-found for every authorization failure. A more helpful
   error message is an enumeration oracle (§12.3).

### The question the UI may ask

> **"What capabilities and actions are available to this user?"**

### The question the UI may **not** answer

> **"Is this user authorized?"**

Server-side enforcement remains authoritative. The UI consumes authorization *results*; it never
recreates the policy that produced them.

### What Phase 6 inherits, in one line each

| Inherited | Consequence for Phase 6 |
| --- | --- |
| Payloads are already shaped | Render "Restricted" from a field's **absence**, never from a flag carrying the withheld value |
| Authentication is a persona selector (**DR-023**) | The shell may offer persona switching for the demo; it must be labelled, and it is not a login |
| No transport (**DR-029**) | Nothing applies `SECURITY_HEADERS`. Do not describe the shell as served securely |
| Audit is in memory (**DR-024**) | Do not build a UI that presents the audit trail as durable evidence |
| `DEMO — SYNTHETIC DATA` (invariant 11) | Present on every screen and export. The G-DEMO source gate activates this phase |

---

## 3. Debt register (open)

**Full detail — description, rationale for deferral, current risk, blocking verdict and the closure
evidence each item requires — is in `docs/SECURITY_DEBT_REGISTER.md`.** This table is the index.

Gate vocabulary: `PHASE_n_BLOCKER` · `EXECUTIVE_DEMO_BLOCKER` · `PRODUCTION_BLOCKER` ·
`ACCEPTED_DEBT`. An item may carry more than one. **An item is not a Phase 6 blocker merely because
it is security-related.**

| ID | Item | Owning phase | Target gate(s) | Blocks Phase 6? |
| --- | --- | --- | --- | --- |
| DR-017 | Only 2 of 56 tables carry `gldi_app` grants | Post-POC | `PRODUCTION_BLOCKER` | No |
| DR-018 | A 60-day-stale domain can sit behind a HIGH data-confidence label | 6 | `PHASE_7_BLOCKER` | No |
| DR-019 | `MET-FIN-015` Gross Margin — Actual to Date not computed | 6 | `PHASE_9_BLOCKER` | No |
| DR-020 | `MET-FIN-018` margin bridge not implemented (carries AC-4) | 9 | `PHASE_9_BLOCKER` | No |
| DR-021 | Acceptance-report adapter builds one trajectory signal series | 7 | `PHASE_7_BLOCKER` | No |
| DR-022 | No persistence for any Phase 4 output | 6 | `PHASE_8_BLOCKER` | No |
| DR-023 | No SSO, MFA, SCIM or short-lived tokens | Post-POC | `PRODUCTION_BLOCKER`, `EXECUTIVE_DEMO_BLOCKER` (disclosure) | No |
| DR-024 | Audit sink is in-memory; PostgreSQL writer not wired | Post-POC | `EXECUTIVE_DEMO_BLOCKER`, `PRODUCTION_BLOCKER` | No |
| DR-025 | No OpenTelemetry SDK or OTLP export (blocked on ADR-0009) | Post-POC | `ACCEPTED_DEBT`, `PRODUCTION_BLOCKER` | No |
| DR-026 | Impersonation designed, not implemented | 7 | `PHASE_7_BLOCKER` (conditional), else `ACCEPTED_DEBT` | No |
| DR-027 | Rate limiter is per-instance | Post-POC | `PRODUCTION_BLOCKER` | No |
| DR-028 | No PostgreSQL row-level security | Post-POC | `PRODUCTION_BLOCKER` | No |
| DR-029 | No transport: TLS, HSTS, CSRF token, header application | **First phase with an HTTP transport** (not 6) | `EXECUTIVE_DEMO_BLOCKER`, `PRODUCTION_BLOCKER` | No |
| DR-030 | `accessEventsOnly()` exists but no route uses it | 7 | `PHASE_7_BLOCKER` | No |
| DR-031 | No SAST, SBOM, signed builds or protected CI/CD | Post-POC | `PRODUCTION_BLOCKER` | No |
| DR-032 | No API fuzzing | 12 | `PHASE_12_BLOCKER` | No |
| DR-033 | Retention schedules and erasure not implemented | Post-POC | `PRODUCTION_BLOCKER` | No |
| DR-034 | No control-plane / data-plane split | Post-POC | `PRODUCTION_BLOCKER` | No |
| DR-035 | No encryption at rest, KMS, secret manager or rotation | Post-POC | `PRODUCTION_BLOCKER` | No |
| DR-036 | RAG-override expiry accepted but not persisted or enforced | 8 | `PHASE_8_BLOCKER` | No |
| **DR-037** | Security telemetry carries one classification where two dimensions exist | Post-POC | `PRODUCTION_BLOCKER` | No |
| **DR-038** | Commercial role not split from `FINANCE_CONTROLLER` (ADR-0016 C-11) | Post-POC | `PRODUCTION_BLOCKER` | No |
| **DR-039** | AI authorization layer not built (`SECURITY_MODEL.md` §12.5) | 11 | `PHASE_11_BLOCKER` | No |

**23 open, 0 Phase 6 blockers.** Three items are new at closure: DR-037, DR-038 and DR-039 are
consequences of accepting ADR-0016 and of writing down the Phase 11 invariant, not newly discovered
problems.

**Closed by this pass:** DR-030 remains open, but the C-14 gap it sat next to is closed — the audit
log now returns its security telemetry to the one role entitled to read it.

## 4. Open questions (all, restated)

| ID | Question | Blocks |
| --- | --- | --- |
| MC-2 / OQ-4 | Six health dimension weights | `MET-HLTH-001…006`, `MET-HLTH-010` |
| MC-3 | `HEALTH-v1` band edges and critical-breach triggers | The Frozen health model |
| MC-5 | What "intervenability" means | `MET-PORT-007`, **AC-1, Phase 7** |
| MC-6 | Deterioration threshold calibration | Inherits MC-2/MC-3 |
| MC-8 | What a "scope unit" is | `MET-DEL-012`, `MET-QUA-002` |
| **OQ-3** | May a Delivery Manager see cost rates and margin? | Assumed "no" and now **enforced by 24 tests**. If it flips, §4.3 and the authz matrix change |
| DQ-4 | Does `recovery` survive as a context? | Decided after Phase 10 |
| C-7 | Four executive health dimensions or six? | ADR-0015 D-1 |
| C-9 | Does `MET-DQ-009` supersede `MET-DQ-007`? | ADR-0015 D-3 |
| C-10 | Which "Green" does Green-at-Risk mean? | ADR-0015 D-4 |
| ~~C-11~~ | ~~Nine roles or six?~~ | **RESOLVED** — ADR-0016 **Accepted**: personas and roles are decoupled (§4.1a); the Commercial split is **DR-038** |
| ~~C-12~~ | ~~Which classification taxonomy?~~ | **RESOLVED** — data-centric taxonomy kept, `SECURITY_TELEMETRY` added; dual privacy dimension is **DR-037** |
| ~~C-13~~ | ~~Should any field ever be masked rather than omitted?~~ | **RESOLVED** — no. Omission is the default; `REDACT` needs an approved requirement **and** a superseding ADR |
| ~~C-14~~ | ~~How does an auditor read audit telemetry that is personal data?~~ | **RESOLVED** — narrow investigative grant: one role, one resource, in scope, audited on read |

## 5. Commands

```bash
npm ci
npm run verify           # typecheck + architecture + schema + lint + 618 tests + data validation
npm run test -- tests/authz   # the 247 authorization tests on their own
npm run assess:curated   # regenerates docs/PHASE-4-CURATED-ASSESSMENT.md
npm run catalog:generate # regenerates METRIC_CATALOG.md from the registry
npm run db:verify        # 80 real-PostgreSQL checks (needs the Docker container)
node scripts/ci/secret-scan.mjs
npm audit --audit-level=high  # SECURITY_MODEL.md §7 dependency scan; also a CI gate
```
