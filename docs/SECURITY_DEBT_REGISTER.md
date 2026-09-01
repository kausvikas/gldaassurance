# SECURITY_DEBT_REGISTER.md — Open debt, classified by gate

**Status:** Phase 5 closure deliverable
**Version:** 1.0.0
**Authority:** `PHASE_HANDOFF.md` §3 lists what is open; **this file says what each item blocks and
what would close it.** Where the two disagree, the register wins on gate and evidence, the handoff
wins on whether an item is open at all.

> **Scope note (Phase 6).** This register began as the security debt register at Phase 5 closure and
> now carries **every open debt item**, security or not — §4 already covered inherited delivery debt,
> and Phase 6 added presentation debt (§7). Splitting it into two registers would mean two gate
> vocabularies and two places to check "does this block the next phase?", which is the question the
> register exists to answer. The filename is kept so existing citations resolve.

> ## ⚠️ DEMO — SYNTHETIC DATA
> This is a proof of concept. Every item below is deferred work that a production deployment would
> have to close. Nothing here is a claim that the POC is production-ready.

---

## 0. Why a flat list was not enough

Phase 5 closed with twenty open debt items in a single table with one column — "target phase". That
is enough to remember an item and not enough to decide anything with. Two questions a reviewer
actually asks were unanswerable from it:

- **"Does this block the next phase?"** A flat list invites the answer *"it is security debt,
  therefore it blocks"*, which stops delivery for items that genuinely do not block, and — worse —
  makes the label meaningless for the ones that do.
- **"What would it take to close?"** Without stated closure evidence, "done" becomes a judgement
  call made under deadline pressure by whoever is holding the item.

So every item below carries an **owning phase**, one or more **target gates** from a controlled
vocabulary, a **blocking** verdict, and the **closure evidence** that would be required. Nothing is
marked a Phase 6 blocker merely because it is security-related.

## 1. Gate vocabulary

| Gate | Means |
| --- | --- |
| `PHASE_6_BLOCKER` | Phase 6 (design system, application shell) cannot correctly proceed until this is closed |
| `PHASE_7_BLOCKER` | Blocks the Portfolio Command Center |
| `PHASE_8_BLOCKER` | Blocks Project Executive Health |
| `PHASE_9_BLOCKER` | Blocks Margin Intelligence |
| `PHASE_10_BLOCKER` | Blocks Forward Risk & Recovery |
| `PHASE_11_BLOCKER` | Blocks the Delivery Intelligence Assistant |
| `PHASE_12_BLOCKER` | Blocks the independent release gate |
| `EXECUTIVE_DEMO_BLOCKER` | The POC may not be demonstrated to an executive audience as representative until this is closed or explicitly disclosed |
| `PRODUCTION_BLOCKER` | Must be closed before any deployment holding real client, employee or financial data |
| `ACCEPTED_DEBT` | Knowingly carried; no gate depends on it |

An item may carry **more than one** gate. `PRODUCTION_BLOCKER` is not a synonym for "important" —
several items below are production blockers and block nothing before that, which is precisely the
distinction the flat list could not make.

**No closure dates appear in this register.** The project plan does not supply them, and inventing
one would be the same error as inventing a mitigation.

---

## 2. Phase 5 security debt (14 items: DR-023 … DR-036)

### DR-023 — No SSO, MFA, SCIM or short-lived tokens

| | |
| --- | --- |
| **Title** | Real enterprise identity provider |
| **Description** | The POC authenticates a persona *selection* through `MockIdentityProvider`. No credential is stored, verified or rotated. Production requires corporate OIDC/OAuth2 with MFA upstream, SCIM provisioning and short-lived tokens with refresh. |
| **Owning phase** | Post-POC / production integration |
| **Rationale for deferral** | A POC password store is a liability with no upside — Argon2id, lockout, reset flow and rate limiting, all to protect synthetic personas from an attacker who could read the seed file instead. The `IdentityProvider` interface is the seam, and `OidcIdentityProvider` implements it without anything above changing. |
| **Current risk** | **Critical in production, contained in the POC.** Every other control in `SECURITY_MODEL.md` assumes the caller is who they claim to be; until this closes, that assumption is unfounded. Contained by `assertDemoEnvironment()`, which refuses to start outside `dev`/`test`. |
| **Target gate** | `PRODUCTION_BLOCKER`, `EXECUTIVE_DEMO_BLOCKER` (disclosure: the demo must be described as a persona selector, never as authentication) |
| **Blocking?** | **No** for Phases 6–12. **Yes** for production. |
| **Closure evidence** | An `IdentityProvider` implementation against a real IdP; MFA enforced upstream and evidenced; token lifetime and refresh tested; SCIM deprovisioning shown to revoke sessions; `assertDemoEnvironment()` proven to refuse the synthetic provider in the deployed environment. |

### DR-024 — Audit sink is in-memory; PostgreSQL writer not wired

| | |
| --- | --- |
| **Title** | Durable audit persistence |
| **Description** | `InMemoryAuditLog` is what runs. The schema, `gldi_app` grant revocation and rejecting trigger exist in `migrations/0008` and are verified against real PostgreSQL; only the writer is missing. |
| **Owning phase** | Post-POC / production readiness (schema is done; the writer is a small change gated on persistence work) |
| **Rationale for deferral** | Phase 5's obligation was to prove audit *semantics* — append-only, fingerprints, denials recorded, failure failing the operation, authorization integration. It proved those. Durability is an infrastructure property and was not a Phase 5 acceptance criterion. |
| **Current risk** | **High.** The audit trail is lost on restart. `SECURITY_MODEL.md` §5.4b lists precisely what the current implementation does **not** prove: persistence across restart, durable storage, tamper resistance against a privileged infrastructure actor, retention, concurrent durable writers, forensic reconstruction after process loss. |
| **Target gate** | `EXECUTIVE_DEMO_BLOCKER` (any demo that shows an audit trail as evidence must disclose that it does not survive a restart), `PRODUCTION_BLOCKER` |
| **Blocking?** | **No** for Phase 6. **Yes** for an executive demo that presents auditability as a capability, and for production. |
| **Closure evidence** | `AuditSink` implemented over PostgreSQL; audit written in the same transaction as the audited write, with a failing-transaction test; records survive a process restart; concurrent writers exercised; `db:verify` continues to prove `UPDATE`/`DELETE` are revoked and the trigger rejects. |

### DR-025 — No OpenTelemetry SDK or OTLP export

| | |
| --- | --- |
| **Title** | Real observability backend |
| **Description** | `platform/observability` is OTel-*shaped* and imports no OTel package. Nothing exports anywhere. |
| **Owning phase** | Post-POC (blocked on ADR-0009, which is `Proposed`) |
| **Rationale for deferral** | `ARCHITECTURE_DECISIONS.md` §2 forbids code depending on a `Proposed` ADR. Adopting the vocabulary without the dependency makes acceptance a wiring change at the exporter rather than a rewrite of every call site. |
| **Current risk** | **Low.** Telemetry is collected in memory and asserted in tests. The security-relevant property — redaction — is enforced in code and is independent of the backend. |
| **Target gate** | `ACCEPTED_DEBT` for the POC; `PRODUCTION_BLOCKER` for operability |
| **Blocking?** | No. |
| **Closure evidence** | ADR-0009 accepted; an OTLP exporter behind `TelemetryExporter`; redaction proven still applied on the export path, not only at the call site. |

### DR-026 — Impersonation designed, not implemented

| | |
| --- | --- |
| **Title** | "View as role" / impersonation |
| **Description** | `AuthorizationContext.impersonatorId` propagates through every audit record, so the trail exists ahead of the feature. Nothing sets it. |
| **Owning phase** | 7 (if the demo narrative requires it) |
| **Rationale for deferral** | It is valuable for a demo and dangerous by nature: it is the control most likely to be added under demo pressure and least likely to be added carefully. Building the audit trail first and the feature later is the correct order. |
| **Current risk** | **Low** while unbuilt; **High** if added carelessly. |
| **Target gate** | `PHASE_7_BLOCKER` only if the Phase 7 demo narrative requires it; otherwise `ACCEPTED_DEBT` |
| **Blocking?** | No for Phase 6. |
| **Closure evidence** | An explicit capability gating it; both identities in every audit record; a visible UI banner; a test proving impersonation cannot exceed the impersonator's own scope; `IMPERSONATION_START`/`END` events emitted. |

### DR-027 — Rate limiter is per-instance

| | |
| --- | --- |
| **Title** | Distributed rate limiting |
| **Description** | `FixedWindowRateLimiter` holds counters in process. Limits do not hold across instances. |
| **Owning phase** | Post-POC / deployment |
| **Rationale for deferral** | The POC is a single process. A distributed limiter needs a shared store that does not exist yet. |
| **Current risk** | **Medium in production** — an attacker with N instances gets N budgets. Zero in a single-process demo. |
| **Target gate** | `PRODUCTION_BLOCKER` |
| **Blocking?** | No. |
| **Closure evidence** | A shared-store limiter; limits proven to hold across two instances; the thresholds themselves re-approved as production values rather than POC defaults. |

### DR-028 — No PostgreSQL row-level security

| | |
| --- | --- |
| **Title** | Defence in depth at the database |
| **Description** | Scoping is enforced at the application layer only. PostgreSQL RLS would make a bypassed application check still fail at the database. |
| **Owning phase** | Post-POC |
| **Rationale for deferral** | ADR-0005 makes the Application layer the single enforcement point deliberately — authorization in two places drifts. RLS is defence in depth, not a second policy, and adding it without a policy-to-RLS generation strategy would create exactly the drift ADR-0005 forbids. |
| **Current risk** | **Medium.** Application-layer scoping is tested and attacked; there is no second line if it regresses. |
| **Target gate** | `PRODUCTION_BLOCKER` |
| **Blocking?** | No. |
| **Closure evidence** | RLS policies derived from the same scope model rather than hand-written; a test proving a deliberately bypassed application check still returns no rows. |

### DR-029 — No transport: TLS, HSTS, CSRF token, header application

| | |
| --- | --- |
| **Title** | Real transport security enforcement |
| **Description** | `SECURITY_HEADERS`, `SESSION_COOKIE` and the CSRF requirement are **declared and tested as configuration**. No HTTP server exists, so nothing applies them to traffic. |
| **Owning phase** | **The phase that first introduces an actual HTTP transport.** That is not Phase 6: Phase 6 builds the design system and application shell, and ADR-0006 is still `Proposed`. On the current sequence it is Phase 7 at the earliest, and it may be later. |
| **Rationale for deferral** | ADR-0006 is `Proposed` and `ARCHITECTURE_DECISIONS.md` §2 forbids code depending on a `Proposed` ADR. Building a transport anyway would be implementing an unaccepted decision. |
| **Current risk** | **High for any deployment that is not a laptop.** A demo served over plain HTTP is exactly as exposed as that sounds. |
| **Target gate** | `EXECUTIVE_DEMO_BLOCKER` (any network-served demo), `PRODUCTION_BLOCKER`. Gated to the first phase with a transport — **not** `PHASE_6_BLOCKER` |
| **Blocking?** | **No** for Phase 6, which serves nothing over a network. **Yes** the moment anything is served. |
| **Closure evidence** | ADR-0006 accepted; a transport that applies `SECURITY_HEADERS` to every response; TLS terminated and HSTS observed by a client; cookie attributes observed on a real `Set-Cookie`; a CSRF token proven to reject a cross-origin state-changing request end-to-end; CORS behaviour proven end-to-end. Until each of those exists, the control matrix says `DECLARED`, never `VERIFIED`. |

### DR-030 — `accessEventsOnly()` exists but no route uses it

| | |
| --- | --- |
| **Title** | Access-event audit view for `SECURITY_ADMIN` |
| **Description** | `SECURITY_MODEL.md` §4.4 grants `SECURITY_ADMIN` audit access **restricted to access events**. The capability (`audit.readAccessEventsOnly`) and the filter (`accessEventsOnly()`) exist and are tested; no route wires them together, so the administrator can read no audit at all. |
| **Owning phase** | 7 (with the assurance surface) |
| **Rationale for deferral** | The failure direction is conservative: a role that should see a narrow slice currently sees nothing. Adding the route without the surface that consumes it would be an untested endpoint. |
| **Current risk** | **Low.** Fails closed. A security administrator cannot see login history, which is a usability gap, not an exposure. |
| **Target gate** | `PHASE_7_BLOCKER` |
| **Blocking?** | No for Phase 6. |
| **Closure evidence** | A route declaring `audit.readAccessEventsOnly` that applies `accessEventsOnly()`; a test proving the administrator receives access events and **no** business events and **no** `SECURITY_TELEMETRY`. |

### DR-031 — No SAST, SBOM, signed builds or protected CI/CD

| | |
| --- | --- |
| **Title** | Secure development lifecycle |
| **Description** | CI runs typecheck, architecture gates, schema gates, lint, the full test suite, data validation, `db:verify`, secret scanning and `npm audit --audit-level=high`. That is not an SDLC: no SAST, no SBOM, no signed builds or provenance attestation, no branch protection or scoped tokens. |
| **Owning phase** | Post-POC |
| **Rationale for deferral** | Tooling that produces findings nobody is resourced to triage produces a backlog, not security. |
| **Current risk** | **Medium.** Dependency vulnerabilities *are* scanned; code-level and supply-chain integrity are not. |
| **Target gate** | `PRODUCTION_BLOCKER` |
| **Blocking?** | No. |
| **Closure evidence** | CodeQL or Semgrep in CI with a triage process; CycloneDX SBOM per build; SLSA-style provenance; branch protection with required review and no self-approval; scoped CI tokens. |

### DR-032 — No API fuzzing

| | |
| --- | --- |
| **Title** | Schema and authorization fuzzing |
| **Description** | Hostile-input tests exist (path traversal, prototype pollution, malformed ids, page-size and offset manipulation) but they are hand-written cases, not generated ones. |
| **Owning phase** | 12 |
| **Rationale for deferral** | Fuzzing finds what a human did not think of; it is most valuable against a stable surface, and Phase 12 is where the surface is stable and the independent review happens. |
| **Current risk** | **Low-medium.** Unknown-unknowns in input handling. |
| **Target gate** | `PHASE_12_BLOCKER` |
| **Blocking?** | No before Phase 12. |
| **Closure evidence** | A generated-input suite over `ROUTES` and the authorization matrix; findings triaged; no crash, no 500, no unclassified field returned. |

### DR-033 — Retention schedules and erasure not implemented

| | |
| --- | --- |
| **Title** | Retention, archival and erasure |
| **Description** | `SECURITY_MODEL.md` §8.2 defines eight retention categories, including a 90-day category for security telemetry. Nothing deletes anything and nothing archives anything. |
| **Owning phase** | Post-POC (needs counsel, not only engineering) |
| **Rationale for deferral** | Retention retrofitted onto a system that never modelled it is a migration nobody funds — so the categories were defined before the data existed, which is the part that had to happen now. Implementation needs a legal decision on audit erasure that engineering cannot make. |
| **Current risk** | **Medium.** Unbounded growth; no subject-access or erasure path. The audit log is append-only by design, so erasure and immutability are in genuine tension. |
| **Target gate** | `PRODUCTION_BLOCKER` |
| **Blocking?** | No. |
| **Closure evidence** | Retention jobs per category; the audit-erasure question settled by counsel (crypto-shredding a per-subject key versus a legal-basis exemption); an immutable archive; the 90-day security-telemetry schedule enforced and evidenced. |

### DR-034 — No control-plane / data-plane split

| | |
| --- | --- |
| **Title** | Regional data residency |
| **Description** | Single-region, single-tenant. `SECURITY_MODEL.md` §8.3 documents the seam. |
| **Owning phase** | Post-POC |
| **Rationale for deferral** | Two properties already make it a seam rather than a rewrite: rules and thresholds are versioned data containing no customer content, and aggregation is already computed over a supplied authorised set rather than a global query. |
| **Current risk** | **Low** for a POC; **High** if a residency obligation appears. |
| **Target gate** | `PRODUCTION_BLOCKER` (conditional on residency policy) |
| **Blocking?** | No. |
| **Closure evidence** | `AuthorisedEntitySet` carrying a region; the enforcement point resolving which plane holds an entity; cross-region aggregates returning per-region subtotals so exclusion is visible rather than silent. |

### DR-035 — No encryption at rest, KMS, secret manager or rotation

| | |
| --- | --- |
| **Title** | Key management and encryption at rest |
| **Description** | Host/platform defaults only. No field-level encryption for `COMMERCIAL_CONFIDENTIAL`, no KMS, no managed secret store, no rotation. |
| **Owning phase** | Post-POC / platform |
| **Rationale for deferral** | Infrastructure concerns with no application-code seam to build against in a single-process POC on synthetic data. |
| **Current risk** | **High in production** — a stolen disk or backup yields plaintext. Zero in the POC, which holds synthetic rows. |
| **Target gate** | `PRODUCTION_BLOCKER` |
| **Blocking?** | No. |
| **Closure evidence** | Volume encryption; field-level encryption for `COMMERCIAL_CONFIDENTIAL`; KMS with envelope encryption and keys absent from application configuration; runtime secrets from a managed store; automatic rotation with a documented break-glass path. |

### DR-036 — RAG-override expiry accepted but not persisted or enforced

| | |
| --- | --- |
| **Title** | Override expiry |
| **Description** | `POST /v1/projects/:id/rag-override` validates an `expiresAt` and neither stores nor enforces it. An override never expires because nothing persists. |
| **Owning phase** | 8 |
| **Rationale for deferral** | Enforcement needs override persistence, which is Phase 8 work (**DR-022**). |
| **Current risk** | **Medium** once overrides are real: a stale override is a health signal that lies, and it lies in the direction someone chose. |
| **Target gate** | `PHASE_8_BLOCKER` |
| **Blocking?** | No for Phase 6. |
| **Closure evidence** | Overrides persisted with expiry; an expired override no longer affecting an assessment; expiry visible in the explanation; the transition audited. |

---

## 3. Phase 5 closure debt (3 items: DR-037 … DR-039)

### DR-037 — Security telemetry carries one classification where two dimensions exist

| | |
| --- | --- |
| **Title** | Dual authorization / privacy characterisation |
| **Description** | `SECURITY_TELEMETRY` (ADR-0016 C-14) answers *who may read this*. It does not, and must not be read to, answer *is this personal data, on what lawful basis, for how long*. A source IP is both at once. The model carries exactly one classification per field, so the privacy dimension is documented (`SECURITY_MODEL.md` §4.3, §8.2) rather than modelled. |
| **Owning phase** | Post-POC / privacy engineering |
| **Rationale for deferral** | Making classification two-dimensional touches the union, both matrices, `shape()`, every field map and every generated test case. That is a taxonomy redesign, and a closure pass is the wrong place for one — ADR-0016 says so explicitly. |
| **Current risk** | **Medium.** The risk is misreading, not exposure: a reader who takes `SECURITY_TELEMETRY` to mean "not personal data" would under-protect a source IP in retention or a subject-access response. Mitigated by an explicit warning in §4.3 and a 90-day retention category in §8.2. |
| **Target gate** | `PRODUCTION_BLOCKER` |
| **Blocking?** | No. |
| **Closure evidence** | A field carrying an authorization classification **and** a privacy characterisation independently; retention driven by the privacy dimension; a test proving a field can be `SECURITY_TELEMETRY` and personal data simultaneously without either dimension weakening the other. |

### DR-038 — Commercial role not split from `FINANCE_CONTROLLER`

| | |
| --- | --- |
| **Title** | `COMMERCIAL_MANAGER` role |
| **Description** | ADR-0016 C-11 found that eight of the Phase 5 brief's nine proposed roles map onto the six implemented ones — three as *scope* rather than role. The ninth, **Commercial** (contract terms, CR values, pricing; **no** cost or margin), has no equivalent: `FINANCE_CONTROLLER` sees both, and in a real organisation those are different people. |
| **Owning phase** | Post-POC |
| **Rationale for deferral** | Adding it is a CHECK-constraint migration, a new §4.4 row, ~30 generated test cases and a new seeded persona — a governed change taken deliberately, not on the strength of a permissive "may include" in a phase brief. |
| **Current risk** | **Low.** The current model over-grants a commercial user by giving them cost and margin visibility they would not have in production. In a synthetic POC that is a fidelity gap, not an exposure. |
| **Target gate** | `PRODUCTION_BLOCKER` |
| **Blocking?** | **No** for any phase. Phase 6 does not depend on it: the UI reads capabilities, not role names (`SECURITY_MODEL.md` §12.1), so adding a role later changes no component. |
| **Closure evidence** | A migration extending the role CHECK constraint; a §4.4 row and a §4.1a mapping entry; the generated matrix covering the new role × every capability; a seeded persona; `COMMERCIAL_CONFIDENTIAL` split, or a new classification, so "contract value" and "cost rate" are separable. |

### DR-039 — AI authorization layer not built

| | |
| --- | --- |
| **Title** | Assistant operates under the caller's authorization context |
| **Description** | `SECURITY_MODEL.md` §12.5 records the invariant: AI retrieval and tool execution run under the requesting user's effective authorization context, preserving identity, capabilities, scope, object-level authorization, field-level classification, audit and provenance. The assistant does not exist. |
| **Owning phase** | 11 |
| **Rationale for deferral** | The architecture that makes it safe is being built now — `ai-intelligence` may import no domain context and has no privileged data path — but the enforcement code belongs with the feature. |
| **Current risk** | **None today** (nothing is built); **Critical when built** if the invariant is not honoured. The assistant is the highest-leverage attack surface in this product. |
| **Target gate** | `PHASE_11_BLOCKER` |
| **Blocking?** | **No** for Phases 6–10. **Yes** — absolutely — for Phase 11. |
| **Closure evidence** | Retrieval proven to execute under the caller's `AuthorizationContext`; a scripted scope-escape attempt repelled; an indirect prompt injection proven unable to widen retrieval; every interaction audited with the retrieved scope; no `PERSONAL_DATA` or `SECURITY_TELEMETRY` in assembled context; no observability data in the retrieval corpus. |

---

## 3a. Phase 6 presentation debt (4 items: DR-040 … DR-043)

### DR-040 — `DOM` lib is repository-wide; G-BROWSER is a regex, not a type boundary

| | |
| --- | --- |
| **Title** | Per-layer TypeScript configuration |
| **Description** | `@types/react` requires `lib.dom`, and there is one `tsc` project — so `document`, `window`, `localStorage` and `fetch` are *typed* in every layer, including domain contexts. The G-BROWSER source gate rejects browser members in `src/contexts`, `src/app` and `src/platform`, which closes the practical hole but is pattern matching, not a type-system boundary. |
| **Owning phase** | Post-POC |
| **Rationale for deferral** | The real fix is a per-layer `tsconfig` with project references, which changes how the whole repository builds and type-checks. Doing that as a side effect of adding a design system would be a large, unrelated architectural change taken under design-phase pressure. |
| **Current risk** | **Low.** A determined author could reach a browser global through an alias the pattern does not match. Before Phase 6 nothing stopped them either, except that it would not have type-checked — so this is a net strengthening with a stated limit, not a regression. |
| **Target gate** | `PRODUCTION_BLOCKER` |
| **Blocking?** | No. |
| **Closure evidence** | Separate `tsconfig` per layer with project references; `lib.dom` present only for `src/presentation`; a domain file referencing `document` fails `tsc`, not only the gate. |

### DR-041 — No client runtime: nothing dispatches a view-model change

| | |
| --- | --- |
| **Title** | Client-side interactivity |
| **Description** | Components are built to receive interaction as **view-model changes** — sort state is a column field, filter selection is a filter field, scope is a selector field. Nothing delivers those changes: there is no hydration, no event wiring and no transport to request a new view model from. The gallery is server-rendered static HTML. |
| **Owning phase** | 7 |
| **Rationale for deferral** | Interactivity needs an HTTP transport to fetch the changed view model, and ADR-0006 is `Proposed` — `ARCHITECTURE_DECISIONS.md` §2 forbids code depending on it (**DR-029**). Building a client runtime first would either front-run that ADR or produce a UI that mutates state locally, which is precisely the "table sorts its own page" failure the design deliberately avoids. |
| **Current risk** | **Medium for Phase 7.** The Portfolio Command Center's acceptance criterion is AC-1 — *"under 30 seconds and under 3 interactions"* — and *interactions* is the operative word. A static screen cannot demonstrate it. |
| **Target gate** | `PHASE_7_BLOCKER` |
| **Blocking?** | **Yes.** Phase 7 must resolve this or explicitly scope around it (for example, pre-rendering the small number of states an AC-1 demo actually traverses). |
| **Closure evidence** | A client runtime that dispatches a view-model request and re-renders; sorting and filtering proven to go through the service, not local state; AC-1 demonstrated end to end within three interactions. |

### DR-042 — No browser-based accessibility or responsive verification

| | |
| --- | --- |
| **Title** | Browser accessibility and responsive audit |
| **Description** | 124 tests assert what static rendering can prove: contrast arithmetic, semantic markup, landmarks, scoped table headers, `aria-sort`, chart text alternatives, focus-ring CSS. **Nothing has been opened in a browser.** No axe or Lighthouse run, no keyboard traversal, no screen-reader pass, no rendered-contrast check, no 200%-zoom or reflow test, no `prefers-reduced-motion` observation. |
| **Owning phase** | 12 (REQ-OPS-002) |
| **Rationale for deferral** | A browser-based harness (Playwright plus axe-core) is a test-infrastructure project of its own, and it is most valuable against finished screens rather than a component gallery. Phase 12 is the independent verification gate. |
| **Current risk** | **Medium.** The gap is between "built to the standard and asserted where assertable" and "conformant". `BRAND_DESIGN_SYSTEM.md` §11 lists each unverified claim line by line so nobody reads the test count as conformance. |
| **Target gate** | `PHASE_12_BLOCKER`, `EXECUTIVE_DEMO_BLOCKER` (any accessibility claim made to a client must be qualified until this closes) |
| **Blocking?** | No for Phases 7–11. |
| **Closure evidence** | axe-core clean on every surface; keyboard traversal of the shell and one full surface recorded; a screen-reader pass documented; contrast verified as rendered; usable at 200% zoom with no horizontal scrolling of content. |

### DR-043 — Four chart wrappers, not a charting library

| | |
| --- | --- |
| **Title** | Chart type coverage |
| **Description** | `TrendChart`, `Waterfall`, `BubbleMatrix` and `ProgressBurnBars` are inline SVG drawn with token classes. They cover what Phases 7–10 are known to need. A chart type outside that set has to be built here. |
| **Owning phase** | 9 |
| **Rationale for deferral** | Deliberate, not deferred work: a charting library ships its own colour scale and type ramp, and `BRAND_DESIGN_SYSTEM.md` §8 prohibition 9 ("per-screen chart palettes") stops being enforceable once the palette belongs to a dependency. ADR-0017 D-1 records the trade. |
| **Current risk** | **Low.** The cost is development time in a later phase, not a defect. |
| **Target gate** | `PHASE_9_BLOCKER` |
| **Blocking?** | No. |
| **Closure evidence** | Either the needed chart type built as a fifth token-driven wrapper, or a superseding ADR admitting a library **and** re-establishing how §8 prohibition 9 stays enforceable with one present. |

---

## 3b. Closed at the Phase 7 entry gate (DR-018, DR-021, DR-041)

Three items were Phase 7 blockers at the Phase 6 handoff. All three are closed. They are recorded
here rather than deleted, because "what closed this, and what would prove it reopened" is the
question a later reviewer asks.

| DR | Title | Closed by | Closure evidence |
| --- | --- | --- | --- |
| **DR-018** | Stale critical domain behind a HIGH confidence label | A **band ceiling**, not a score penalty: `DataConfidenceWeights` gains `criticalDomains`, `criticalStalenessTolerance` (a multiple of each domain's *own* cadence, never a universal day count) and `freshnessPolicyVersion`. The arithmetic score is untouched; the displayed band is capped at MEDIUM for a stale critical domain and LOW for a silent one, and the explanation names the domain, its age, its tolerance and the policy version | 8 tests in `confidence-engine.test.ts`, including a property test asserting HIGH is **unreachable** across the whole staleness range past tolerance, and the original DR-018 case reproduced exactly: score 80.00, arithmetic band HIGH, displayed band MEDIUM |
| **DR-021** | Report adapter builds one trajectory signal series | Six signal builders, each emitting its **own** `signalId` so `policyFor()` selects that signal's own window: `DELIVERY_VELOCITY`, `EAC_REVISION_TREND`, `QUALITY_REWORK_TREND`, `CONTINGENCY_CONSUMPTION`, `MILESTONE_HIT_RATE`, `SCOPE_EXPOSURE_TREND`. A builder returns `null` when the facts do not support it and the series is omitted, never zero-filled | 7 tests in `phase4-engines.test.ts`. The decisive one: **scenario LR (prj-029)** now reports System GREEN with a 30-day AMBER and 60-day RED outlook while `DELIVERY_VELOCITY` is **not** materially adverse — leading risk with no cost overrun, which the single-signal adapter could not see |
| **DR-041** | No client runtime; nothing dispatches a view-model change | `ApplicationGateway` (ADR-0020): a closed view table, one method, and an in-process implementation over the same `Dispatcher`. **No HTTP transport introduced**, so ADR-0006 stays `Proposed` and DR-029 stays closed | 15 tests in `gateway.test.ts` asserting absence as well as behaviour — no server package, no `node:http`/`fetch`/`listen` in `src/`, ADR-0006 still Proposed, no role comparison anywhere in `src/presentation` |

**DR-041 is closed in the sense the entry criterion allows** — *"closed or replaced by an explicitly
accepted Phase 7 runtime decision"* — and the half it does **not** close is carried forward honestly
as DR-044 below rather than absorbed into a tick.

---

## 3c. Phase 7 entry-gate debt (DR-044)

### DR-044 — Interaction is expressible but not yet interactive

| | |
| --- | --- |
| **Title** | Client runtime for live interaction |
| **Description** | `ApplicationGateway` gives Phase 7 a typed, authorised, correctly-bounded way to *express* sorting, filtering, scope selection and drill-down. It does not hydrate a browser: there is no client runtime, so a click does not yet fetch. AC-1 counts **interactions**, so a Phase 7 demo must either pre-render the small number of states an AC-1 path traverses, or be narrated rather than driven. |
| **Owning phase** | 7 |
| **Rationale for deferral** | Live fetching needs either an HTTP transport (ADR-0006 `Proposed`; activates DR-029) or client hydration over an embedded authorised payload. ADR-0020 D-4 permits the latter, but building it is Phase 7 implementation work and this was a closure pass. Deciding it here and building it here are different things, and only the first was in scope. |
| **Current risk** | **Medium for the Phase 7 demo, low for the architecture.** The contract is right; the demo may feel static. The failure mode to watch is somebody closing the gap with a quick server — which is exactly what ADR-0020's tests prevent. |
| **Target gate** | `PHASE_7_BLOCKER` for a *driven* AC-1 demonstration; not a blocker for building the surface |
| **Blocking?** | **No** for starting Phase 7. **Yes** for claiming AC-1 is demonstrated end-to-end. |
| **Closure evidence** | Either client hydration over an already-authorised, already-shaped payload with sorting proven to run over the full authorised set (not one page), or an accepted ADR-0006 plus a transport that satisfies DR-029. In both cases: AC-1 shown in under 30 seconds and 3 interactions, with no authorization decision in React. |

---

## 3d. Phase 7 debt (DR-045 … DR-049)

| DR | Title | Description | Owning phase | Risk | Target gate | Blocking? | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **DR-045** | No prior-period snapshot store | KPI movement cannot be shown because no assessment is retained for a previous reporting period. `buildCommandCenter()` computes deltas correctly when a prior set is supplied, and **states the absence** rather than rendering "no change" — which would be a fabricated reassurance | 8 | **Medium for an executive demo.** "What changed since I last looked?" is the first question a CDO asks and the page currently cannot answer it | `EXECUTIVE_DEMO_BLOCKER` | No | Assessments persisted per reporting period; a KPI delta reconciled against two stored periods; the "no prior period" narrative no longer reachable in the demo |
| **DR-046** | Nested rows classified at container level | `ranked` and `bubbles` carry commercial figures inside a container classified `DELIVERY_SENSITIVE`. The classification is correct for the container, and a production build would additionally shape each nested row through `shape()` so a field-level grant applies inside a collection | Post-POC | **Low in the POC** (no role holds `portfolio.viewAggregates` without `COMMERCIAL_CONFIDENTIAL`, so no caller is currently under-shaped); **Medium in production**, where a Commercial role split (DR-038) would create exactly that caller | `PRODUCTION_BLOCKER` | No | Nested rows shaped per field; a test proving a caller with the capability but not the classification receives the rows with commercial fields omitted |
| ~~**DR-048**~~ — **CLOSED at Phase 11A by ADR-0023** | ~~`MET-PORT-003` de-duplication declared but not implemented — carries the failing `REQ-PORT-003` (ADR-0021, CONFLICT C-20)~~ | **The work this item asked for must not be done.** ADR-0023 supersedes ADR-0021 and withdraws the cross-project de-duplication as economically unsupported: `MET-FIN-019` is one project's own margin, so two projects hold disjoint pools and there is nothing to net. `MET-PORT-003` **v2.0.0 is** `Σ MET-FIN-019` over distinct eligible projects, each counted once — **$90.80M** — and the KPI is labelled `MET-PORT-003`. Shared cause is reported beside it as non-additive **concentration**. | — | **None.** `REQ-PORT-003` is met | `ACCEPTED_DEBT` | — | Closed. `src/contexts/portfolio/internal/portfolio-value-at-risk.ts`; ADR-0023; Phase 7 traceability §10a. **The original closure evidence in this row was itself wrong** — it asked for a golden test asserting the portfolio total is *strictly less* than the sum of the parts, which is the defect ADR-0023 removed. |
| **DR-049** | No recovery-plan store, so tier 5 never fires | `MET-PORT-007` tier 5 orders equally-exposed projects by how credible an intervention is. `gradeActionability()` is implemented and unit-tested, but the synthetic portfolio holds no recovery plans, so **every project grades `NOT_ASSESSED`** and the tier never separates a pair. The table shows "Not assessed" on every row, which is the honest value, not a placeholder | 10 | **Low for correctness, medium for the demo.** The ranking is unaffected (a tier that never fires cannot mis-order). But an executive asking "what is already being done about it?" gets no answer from the page | `EXECUTIVE_DEMO_BLOCKER` | No | Recovery plans in the synthetic portfolio; at least one adjacent pair in the demo separated at tier 5; the Recovery column showing more than one distinct value |
| **DR-047** | Drill-through targets not yet built | Links to `/projects/:id`, filtered lists and driver lists are declared and rendered; the destination surfaces are Phase 8+ | 8 | Low | `PHASE_8_BLOCKER` | Yes — it is Phase 8's own deliverable, not an obstacle to it | Project Executive Health built; every link on the command centre resolves |

---

## 3e. Phase 8 debt (DR-050 … DR-055)

| DR | Title | Description | Owning phase | Risk | Target gate | Blocking? | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **DR-050** | No forecast completion date fact | `MET-DEL-011` Schedule Variance (calendar) needs `delivery:forecastCompletionDate`, and the synthetic facts hold no such field. The milestone set is **not** a substitute — on a typical project the last milestone sits ~3 months before the contractual end date, so inferring one from the other reports every project finishing early with total confidence. The metric therefore reports as not computable, with the reason | 9 | `EXECUTIVE_DEMO_BLOCKER` | No | A forecast completion date in the generator and in the delivery port; `MET-DEL-011` computing a signed variance; a golden test where a slipped project reports positive days |
| **DR-051** | The generator models almost no schedule slip or customer dependency | **2 of 527** milestones have `forecastDate ≠ baselineDate`, and only **1 of 91** projects has an open `CUSTOMER` dependency. `MET-DEL-009` and `MET-DEL-010` are therefore ~always 0, and `MET-DEL-023` is null on 90 of 91 projects. `MILESTONES_AT_RISK` reads as a **constant-perfect** input to the Delivery dimension: the arithmetic is right, the data has nothing to say | 9 | **Medium.** A dimension partly carried by a constant looks computed and discriminates less than it appears to. The Delivery score is genuinely driven by progress variance and required-velocity ratio | `EXECUTIVE_DEMO_BLOCKER` | No | Milestone slippage and open customer dependencies in the synthetic scenarios; a distribution of `MET-DEL-010` with more than one distinct value |
| **DR-052** | System Green-at-Risk is now empty portfolio-wide | Only **1 of 75** fixed-bid projects is System-Assessed GREEN, and it is stable — so no project satisfies `MET-FCST-025`'s definition (System GREEN now, approved outlook AMBER/RED at 30 or 60 days) and it finds **0 of 75**. The semantics are unchanged and correct; the portfolio contains no qualifying case. `MET-HLTH-033` Reported Green Risk still finds 4, so AC-2 holds and the Phase 8 status-conflict path is fully exercised — but the Phase 7 signature panel has no subject | 9 | **Medium for the demo, none for correctness.** The finding is empty because the portfolio genuinely has one GREEN project, not because the rule broke | `EXECUTIVE_DEMO_BLOCKER` | No | Band-edge calibration reviewed (see DR-054); at least one System Green-at-Risk project in the demo portfolio |
| **DR-053** | No independent/DA review store | The Data & Assurance Confidence section asks for the latest independent review. No such record exists in the POC, so the section **states its absence** rather than rendering a plausible-looking review nobody performed | 12 | Low | `PHASE_12_BLOCKER` | No | An assurance review record per project; the section rendering reviewer, date and outcome |
| **DR-055** | Hard-override thresholds have never been calibrated against a portfolio where they can fire | `OVR-NO-CREDIBLE-PLAN` (`MET-DEL-018 ≥ 2.00`) was unreachable until Phase 8 supplied its signal, and now fires on **33 of 75** fixed-bid projects. **50 of 75 RED are RED by hard override, not by composite band.** Each fires on a genuinely measured signal — this is not a missing-data artifact — but a threshold that has never been exercised is a threshold nobody has agreed to. Opened at Phase 8 closure | 9 | **Medium.** The RAG distribution is driven by override thresholds rather than by the composite, so recalibrating band edges alone (DR-054) would not move it | `EXECUTIVE_DEMO_BLOCKER` | No | Override thresholds reviewed by the rule owner against the current portfolio; the share of RED forced by override stated and accepted, or the thresholds moved |
| **DR-054** | HEALTH-v2 band edges diverge from the curated scenario catalog | `docs/SCENARIO_CATALOG.md` records **B** as *"still Green, unmistakably falling"* and **C** as *"Evidence Amber"*. The system assesses both **RED** — and did so for B (AMBER) and C (RED) **before Phase 8**, so this predates the Delivery signals; Phase 8 moved B from AMBER to RED. 53 of 75 fixed-bid projects assess RED. This is **band-edge calibration (Type B, open under MC-3)**, not a formula defect, and it was not silently adjusted | 9 | **Medium.** The product's headline distribution disagrees with the designed demo narrative, which a client will notice before an engineer does | `EXECUTIVE_DEMO_BLOCKER` | No | HEALTH-v2 edges recalibrated against the curated set by the rule owner; scenario B assessing GREEN-and-deteriorating, C assessing AMBER; the catalog and the assessment agreeing |

---

## 3f. Phase 9 debt (DR-056 … DR-058)

| DR | Title | Description | Owning phase | Risk | Target gate | Blocking? | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ~~**DR-056**~~ | ~~No location or subcontractor dimension~~ — **CLOSED** | `deliveryLocation` (ONSHORE/NEARSHORE/OFFSHORE) and `engagementType` (EMPLOYEE/SUBCONTRACTOR) are now on every assignment, and the surface shows seniority, location and engagement mix. All three are **counts and FTE only** — a site and a contract form, never an address, a supplier name or an individual's cost, and all three are classified `PERSONAL_DATA` | 10 | Low | `EXECUTIVE_DEMO_BLOCKER` | Location and engagement-type fields on the assignment model; the mix breakdown showing all three dimensions |
| **DR-057** | Dependency economics cannot be valued | `EffortRecordRow.blockedByDependencyId` exists in the model and is **never populated** by the generator, so blocked person-days are unmeasurable and the cost of waiting on a customer cannot be priced. Dependency count and age are reported as facts; the **economic consequence is stated as not measured** and is not estimated | 10 | **Medium.** "What is the customer costing us?" is a question a fixed-bid review is expected to answer, and this one cannot | `EXECUTIVE_DEMO_BLOCKER` | Blocked effort populated in the synthetic portfolio; blocked hours valued at the actual blended rate; recoverability flagged from the dependency owner |
| **DR-058** | Two bridge causes rest on a modelling choice, and one is unmeasured | `MET-FIN-018`'s effort-overrun and rate/mix causes value a quantity at a rate — a **price/volume split that partitions the cost delta exactly**, but still a modelling choice, and both are labelled `MODELLED` on the surface. Schedule extension is `NOT_ATTRIBUTED` because no forecast completion date exists (DR-050), so its true effect sits inside the residual | 10 | **Low for correctness** (the bridge reconciles exactly and every basis is declared); **medium for interpretation** — a reader who treats a modelled cause as accounting truth will over-attribute | `ACCEPTED_DEBT` | Schedule extension attributable once DR-050 closes; a per-assignment cost reconciliation replacing the modelled rate/mix split |

---

## 3g. Phase 10 debt (DR-059 … DR-061)

| DR | Title | Description | Owning phase | Risk | Target gate | Blocking? | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **DR-059** | Late detection rewinds only the financial dimension | `MET-FCST-030` recomputes historical bands through the real health engine, but the fact tables hold **no per-period snapshot** of the delivery, commercial or quality derivations. Those signals are therefore omitted from a historical assessment rather than carried back from today — carrying them back would attribute today's evidence to a past decision and make detection look better than it was. The historical band is consequently a **financial-dimension band**, and the rate is computed against that | 11 | **Medium.** The rate is directionally meaningful and its denominator is real, but it is not the four-dimension band the rest of the product shows | `EXECUTIVE_DEMO_BLOCKER` | Per-period snapshots of the delivery, commercial and quality derivations; late detection computed against the full four-dimension band |
| **DR-060** | No authorised workflow to act on a warning | The surface proposes interventions and **nothing on it changes anything** — by design, and stated on the page. But there is also no authorised path to accept a recommendation, assign an action or record a closure: DR-036 (override expiry not enforced) and DR-044 (no client runtime) together mean the lifecycle can be *observed* and not *driven* | 12 | **Medium for the demo.** A reviewer can see what should happen and cannot record that they decided it | `PHASE_12_BLOCKER` | A capability-gated action workflow with audit, closing the loop from warning to disposition to closure |
| **DR-061** | Early-warning thresholds are uncalibrated | All thirteen `EARLY_WARNING-v1` thresholds are **synthetic calibration candidates** set so the rules fire sensibly against the Phase 3 portfolio. They have never been reviewed against real delivery data, and they sit deliberately tighter than the health band edges so a warning precedes a band move. Same class as MC-3 / DR-055 | 11 | **Medium.** A threshold nobody has agreed to produces a warning list nobody is accountable to | `EXECUTIVE_DEMO_BLOCKER` | Thresholds reviewed by the rule owner; the fired-rule distribution across the portfolio stated and accepted |

---

## 3h. Pre-Phase-11 closure and remediation debt (DR-062 … DR-071)

*Raised by audit, not by a failing gate. Both are **Category B / D** in `PHASE_HANDOFF.md` §3b.*

| DR | Title | Description | Owning phase | Risk | Target gate | Blocking? | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **DR-062** | The margin bridge reconciles by construction but explains less than it appears to | The residual is **defined** as `total − Σ(named)`, so AC-4 holds to the cent no matter how little the named causes account for. Reconciling and explaining are different claims, and this report previously presented the first as evidence of the second. Measured: the named causes carry **45.5% of gross movement on the median project**, and `schedule-extension`, `pass-through` and `fx` are structurally zero on **all 75** fixed-bid projects (DR-058, single-currency portfolio, and cost already inside the EAC respectively). Mitigated, not closed: `explanatoryCoverage` is now computed in the domain and rendered on the page beside the reconciliation claim, and the narrative says in words when the named causes carry less than half | 11 | **Medium.** The number is correct and the waterfall is honest arithmetic; the risk is a reader treating a partial attribution as *the* reason margin moved. That risk is now named on the page rather than left to inference | `ACCEPTED_DEBT` | Either additional named causes that raise coverage on measured evidence, or an accepted decision that a residual of this size is the true state of the fact model. **Not** closable by widening a cause definition to absorb residual |
| **DR-063** | Early-warning rules have no hysteresis, and flapping is unmeasured | A signal oscillating around its threshold fires, clears and re-fires with nothing damping it: no minimum dwell time, no separate arm/disarm edges, no confirmation over consecutive periods. Nothing measures how often this happens, so the size of the problem is **unknown rather than small**. Deliberately **not** fixed in this pass: choosing a damping policy sets how long a real deterioration stays invisible, which is a rule-owner decision with a safety direction, not an implementation detail an engineer may pick | 11 | **Medium.** An unmeasured flap rate makes the warning list less trustworthy the more closely it is watched, and a demo that surfaces a warning which vanishes next period damages the product's core claim | `PHASE_11_BLOCKER` | The flap rate measured across the portfolio and stated; then a damping policy chosen by the rule owner with its detection-delay cost stated explicitly, recorded as an ADR before implementation |
| **DR-064** | `MET-RES-003`'s seniority split is an unrecorded definitional judgement | The registered formula is *"senior FTE / junior FTE (**bands per resource config**)"* and defers the split. **There is no resource config** — a constant in `resource-engine.ts` is the split, and it places `MID` on the junior side. That is defensible and is not the only reading. Measured on the demo portfolio: `MID` is **21.6% of active FTE**, and moving it changes the portfolio pyramid ratio from **0.607 to 1.464 — a 2.4x swing** — which flows straight into `MET-RES-004` pyramid drift against the as-sold ratio, and therefore into whether a project reads as over- or under-seniored. **Deliberately not changed in this pass:** picking the split is a rule-owner policy decision, and inventing one would be the exact failure this closure exists to prevent | 11 | **Medium.** No number is currently *wrong* — the ratio is computed consistently — but the definition behind it has never been agreed, so two organisations reading the same pyramid drift could mean different things | `EXECUTIVE_DEMO_BLOCKER` | The band split agreed by the rule owner and recorded as an ADR, or made genuine configuration with the default stated; then `MET-RES-003` version-bumped if the split changes |
| ~~**DR-065**~~ | ~~Three live rules compare a ratio while citing the Money metric it derives from~~ — **CLOSED** by ADR-0026. `MET-FIN-042`, `MET-FIN-043` and `MET-RES-011` registered from the denominators already deterministic in code (no new business semantics), and the three rules re-pointed. The completeness gate's allow-list is now empty. | `OVR-CONTRACT-LOSS` cites `MET-FIN-019` (Money) for `GM_VALUE_AT_RISK_RATIO`; `EW-EAC-INCREASE` cites `MET-FIN-008`; `EW-RESOURCE-COST-DRIFT` cites `MET-RES-010`. **All three are LIVE** — their signals are supplied and they evaluate, so none is a dead control. The comparand itself has no registered metric, so a reader who drills into "why did this fire" reaches a metric that is not the number being compared. Found by the new rule-signal completeness gate on the day it was written. **Deliberately not fixed here:** each needs its own denominator decision, and inventing three denominators under a remediation deadline is the failure mode this whole closure exists to prevent | 11 | **Low-medium.** No number is wrong and no control is dead; the drill-through provenance is imprecise | `ACCEPTED_DEBT` | Three ratio metrics registered with governed denominators, or the rules re-pointed at existing ratio metrics if suitable ones exist. The completeness gate's allow-list shrinks to empty |
| **DR-066** | Synthetic data never exercises three semantic branches | **Zero `REALISED` and zero `MITIGATED` risks** exist (states present: OPEN 276, MITIGATING 65, ACCEPTED 45), so the economics engine's risk-state exclusion filter is never exercised and the realised-risk → actual-cost transition is untested. **All 75 projects are `assessmentStatus: COMPLETE` with 0 on partial weight**, so the ADR-0022 D-4 provisional-composite path never runs on real data. The `MET-FIN-019` zero-floor never binds. **Not fixed by reshaping the distribution** — changing synthetic data to improve a coverage percentage is cosmetic; the gap is registered and targeted unit tests cover the semantics where practical | 11 | **Medium.** Untested branches are where the next semantic defect will be, and this dataset cannot find it | `ACCEPTED_DEBT` | Either curated fixtures exercising each branch deterministically, or an accepted decision that the branches are out of POC scope |
| **DR-067** | No pre-execution plan-credibility control exists | `OVR-NO-CREDIBLE-PLAN` is correctly `NOT_APPLICABLE` before a demonstrated velocity can exist (ADR-0026 D-3), which leaves **6 projects in early delivery with no plan-credibility control at all**. A rule that assessed credibility from planned throughput and staffing ramp rather than demonstrated velocity would be a **different rule with a different signal**; none is registered. Deliberately not invented — choosing its signal and threshold is a rule-owner decision | 11 | **Medium.** The gap is now visible and named on the page rather than hidden behind a false "evidence unavailable" message | `ACCEPTED_DEBT` | A registered pre-execution credibility metric and rule, or an accepted decision that early-stage plan credibility is out of scope |
| **DR-069** | ~~Missingness renormalises every dimension upward~~ — **AUTHORITY CLOSED** by ADR-0028; every evidence loss now yields PROVISIONAL with the missing input named. The *score* still renormalises (no penalty is invented for missingness) and per-input structural/evidence/risk-trigger classification remains ungoverned | Measured across all four dimensions with one input adverse and the rest at their green edge: dropping that single input raises its dimension by **+15 to +30 points** and takes the composite to **100.00** — `MARGIN_EROSION_PP` +25, `BURN_GAP` +20, `CONTINGENCY_BURN_GAP` +15, `MILESTONES_AT_RISK` +20, `DEPENDENCY_AGEING_DAYS` +15, `PENDING_CR_AGE_DAYS` +30, `UNSECURED_UPSIDE_RATIO` +25, `ACCEPTANCE_BLOCKERS` +30, `ESCAPED_DEFECT_RATE` +20, `DEFECT_BACKLOG_TREND` +15. The four `required` inputs are safe (dimension goes NOT_COMPUTABLE) and `MET-DEL-018` is now MATERIAL (assessment goes PROVISIONAL). **The general fix was implemented and measured, then withdrawn**: making any absent input cost completeness marks **64 of 75** projects PROVISIONAL, and 61 of those only because `DEPENDENCY_AGEING_DAYS` is absent on a project with **no open dependencies** — a known-good state. Trading "unknown reported as complete" for "known-good reported as provisional" is not a fix | 11 | **Medium.** No band is currently wrong; the risk is a high composite on an assessment that quietly lost an adverse input | `ACCEPTED_DEBT` | Each dimension input classified as structural / evidence / risk-trigger absence (remediation §7), then completeness keyed on the evidence and risk-trigger classes only. This is a per-metric business decision, not an engineering default |
| **DR-070** | ~~19~~ **17** executive-reachable ratio metrics declare a blanket zero-denominator rule — `MET-DEL-018` (ADR-0027) and `MET-QUA-003` (ADR-0028) are closed; the remainder are diagnostic or benign | Of 21 executive-reachable Ratio/Percent metrics, **19 declare `zeroDenominator: NOT_COMPUTABLE`** without distinguishing *unknown denominator* from *observed zero*. `MET-DEL-018` was one of them and produced the S4 closed by ADR-0027. The closest analogue is **`MET-RES-003`** (pyramid ratio): zero junior FTE is an observed all-senior team, not missing evidence, and it is currently reported as unmeasurable. Not changed here — each denominator's zero has its own business meaning and guessing 19 of them is the failure mode this closure exists to prevent | 11 | **Medium.** One instance of this pattern was an S4; the others are unreviewed | `ACCEPTED_DEBT` | A per-metric zero-denominator semantic review recording, for each, whether zero means invalid, benign, not-applicable, unbounded or adverse |
| **DR-071** | `edgeHandling.zeroDenominator` cannot express a conditional rule | The registry field is a single enum (`NOT_COMPUTABLE` \| `ZERO` \| `NOT_APPLICABLE`). After ADR-0028, `MET-QUA-003`'s zero denominator means **`ZERO` when the defect source is reporting** and **`NOT_COMPUTABLE` when it is absent or stale** — a conditional the field cannot hold. The declaration keeps the conservative `NOT_COMPUTABLE` and the full conditional lives in `notes`, so the catalog is accurate in prose and under-specified in its machine-readable field. Found while certifying ADR-0028 rather than by a failing gate | 11 | **Low.** Runtime behaviour is correct and tested; the machine-readable declaration is a weaker statement than the truth | `ACCEPTED_DEBT` | Either a structured conditional edge-handling shape, or a per-state declaration mirroring the `SignalState` algebra |
| ~~**DR-068**~~ | ~~A project stalled at zero demonstrated velocity escapes the plan-credibility override~~ — **CLOSED** by ADR-0027. Observed zero with work remaining is now `UNBOUNDED`: it fires `OVR-NO-CREDIBLE-PLAN`, scores the Delivery input at the red edge instead of dropping it, and the hostile case moves from GREEN/Delivery 100.00 to **RED/Delivery 70.00**. |

---

## 3i. Phase 11A architecture debt (DR-072 … DR-073)

*Raised by designing the assistant, before any of it was built. Both are **Category B / E** in
`PHASE_HANDOFF.md` §3b. Neither is a defect in shipped code — there is no assistant code.*

| DR | Title | Description | Owning phase | Risk | Target gate | Blocking? | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **DR-072** | The grounding validator polices the claims the assistant makes, and nothing polices the claims it omits | Two distinct gaps under one id, because they share a cause — every control in `AI_ASSISTANT_ARCHITECTURE.md` §7 is an assertion-level check. **(a)** The validator's causal, probabilistic, persistence and recovery lexicons are **hand-written**; a claim phrased outside the listed vocabulary passes. **(b)** The more serious half: **selection bias is undetectable.** An answer that is fully grounded, correctly qualified and passes all ten detections can still omit the single most material true fact. This is not hypothetical — the Phase 9 margin demo rendered three scenarios at 95.4%, 87.1% and 65.2% explanatory coverage while the median project sits at **45.5%**, and every figure on that page was correct. **No control designed in Phase 11A would have caught it** | 11 | **Medium-high.** (a) degrades gradually and is measurable through the rejection rate; (b) is invisible by construction and is the most likely route to a materially misleading assistant answer | `ACCEPTED_DEBT` | For (a): lexicon coverage measured against a held-out adversarial corpus, and the rejection rate tracked as a release metric. For (b): a materiality control — e.g. an assertion that an answer about a project's margin must carry that project's worst reachable coverage figure — or an accepted decision that omission is a human-review responsibility. **Not closable by extending the lexicon**, which addresses only (a) |
| **DR-073** | No prompt-injection corpus exists, so indirect injection is untested rather than mitigated | `AI_THREAT_MODEL.md` **T-AI-02** — a payload stored in a CR note, risk description or recovery comment, replaying on every retrieval — is the highest-likelihood real threat to the assistant, and the architectural control (authorization completes before the model runs) is sound *by reasoning*. The synthetic portfolio contains **no injection payloads at all**, so nothing exercises it. Benchmark category **E-11 must report `NOT RUN`, never `PASS`**, until a corpus exists: an empty-set pass is the `NOT_APPLICABLE` / `NOT_COMPUTABLE` conflation ADR-0026 closed, in benchmark form. Deliberately not seeded during an architecture-only phase — it changes synthetic data, and the content hash is a governed artifact | 11 | **Medium.** The control is architectural and does not depend on the model's cooperation, so the residual risk is that an unanticipated retrieval path bypasses it — which is exactly what a corpus would find | `PHASE_11_BLOCKER` | No — it blocks the *claim* that injection resistance is verified, not the 11B build. A versioned injection corpus seeded into synthetic free-text fields, the content hash re-baselined deliberately, and E-10/E-11 asserting zero disclosure and zero validator bypass |

---

## 3j. Phase 11B implementation debt (DR-074 … DR-076)

*Raised by building the assistant. None is a defect in a shipped figure; two are structural and one
is an untestable-with-current-data gap.*

| DR | Title | Description | Owning phase | Risk | Target gate | Blocking? | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **DR-074** | `metric.definition.get` reads the registry in-process rather than through the gateway | ADR-0029 D-7 specified a `metric.definition` ViewId reached through `ApplicationGateway`. `EnforcementPoint` performs its object-level check as `entitySet.projectIds.includes(entityId)`; a metric id is not a project id, so routing one through it would deny every request or require weakening the check that makes BOLA structurally impossible. **Trading a real authorization control for architectural tidiness on a `PUBLIC_INTERNAL` governance lookup is the wrong side of that trade.** The tool remains gated by `assistant.use`, checked before any tool runs, and returns registry text that already ships in `METRIC_CATALOG.md` | 12 | **Low.** No project data, no scope, no evaluation - the tool returns a definition and a fabricated metric id fails rather than being narrated | `ACCEPTED_DEBT` | No | Either an entity-type-aware object check that can express "this id is not a project", or an accepted decision that governance metadata is served beside the gateway rather than through it |
| ~~**DR-075**~~ — **CLOSED at Phase 12A** | ~~`outranksBecause` emits an unformatted twelve-digit float onto executive surfaces~~ | Fixed as a **presentation-only** correction at the one place executive formatting is owned (`command-center.ts`). `trimDecidingTier` keeps `(tier 4)` and drops `: 5552145.679817 vs 3224813.110147`; `formatRankingFigures` substitutes the row's already-governed `formatMoneyCompact` value into `rankNarrative`. **No arithmetic, no parsing, no `Number()`** - the underlying value is untouched and no figure moved. Ten instances across two shipped pages are gone; **all six pages now render zero unformatted decimals**. An earlier form of the trim cut the whole parenthetical and removed the tier identity with it, which four Phase 7 tests correctly rejected - *which* tier decided is the governed part of the explanation and only the raw comparison was the defect. | 7 | **None.** Presentation only | `ACCEPTED_DEBT` | — | Closed. `trimDecidingTier` / `formatRankingFigures` in `src/app/portfolio/command-center.ts`, reused by `forward-risk.ts` and the assistant; regression guard in `tests/integration/command-center.test.tsx` walks the whole view model for unformatted decimals. **The domain-side repair - carrying the comparison as structured fields rather than composing prose from raw decimals - remains the proper fix and is deferred, not done.** |
| **DR-076** | No seeded persona can demonstrate the commercial field-omission path | AC-6's mechanism is that an unauthorised field is **omitted** at shaping, so it never reaches a claim. Demonstrating that with a persona needs a caller who holds project scope *and* lacks `COMMERCIAL_CONFIDENTIAL`. Measured across all seven seeded personas: `dm.mobility` is the only `DELIVERY_MANAGER` and resolves to **zero projects**; every other persona holds the classification. **A Phase 11B test asserted the shaping mechanism through that persona and was green for the wrong reason** - it would have stayed green with shaping deleted. The mechanism is now asserted directly against `shape()`, `CLASSIFICATION_MATRIX` and `ROUTES`, and the persona test asserts only empty-scope behaviour. Phase 7 found the same gap and recorded it rather than staging a persona | 12 | **Medium.** The control is real and directly tested; what cannot be shown is the *end-to-end* path, and an end-to-end assertion is the one a reviewer trusts most | `ACCEPTED_DEBT` | No | A seeded `DELIVERY_MANAGER` persona with a non-empty project scope, then an answer-level assertion that a commercial figure is absent from the claims while a delivery figure is present |

---

## 3k. Phase 11C certification debt (DR-077) and closures

*Raised by adversarially attacking the assistant rather than by building it.*

| DR | Title | Description | Owning phase | Risk | Target gate | Blocking? | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **DR-077** | Neutralisation is shape-based and cannot detect retrieved text that is merely **false** | Retrieved free text is neutralised before composition, which removes instruction-shaped content - imperatives at governed state, formula assertions, reporting conventions, figure overrides, control-authority claims. It cannot remove a note that is simply untrue: *"action agreed at the last review"* for a review that never happened is indistinguishable in form from a real note. That is a **data-integrity** problem in the source record, not a prompt-injection problem, and no output filter closes it. **What holds regardless is architectural**: such a note cannot change scope, cannot cause a write, cannot alter a figure and cannot lift a qualification - it can only be quoted, and only if it survives every shape | 12 | **Low-medium.** The blast radius is ungoverned prose appearing beside governed findings; no figure, band or authority can move | `ACCEPTED_DEBT` | No | Source-record provenance and authorship controls, or an accepted decision that record-content integrity is owned upstream of this product |

### Closed at Phase 11C

| DR | Closed by |
| --- | --- |
| ~~**DR-073**~~ | **CLOSED.** The indirect-injection corpus exists: `tests/fixtures/injection-corpus.ts`, **32 cases across 16 categories, obvious and subtle variants**, delivered through `PoisonedToolPort` as retrieved content rather than as user prompts. Benchmark **E-11 now RUNS and PASSES**; it is no longer `NOT RUN` |
| ~~**DR-076**~~ | **CLOSED.** A test-only `DELIVERY_MANAGER` principal with real project scope was created under §32, so the commercial field-omission path is now demonstrated end to end with positive and negative controls, not inferred from an empty result set |

---

## 3l. Phase 12A browser-acceptance debt (DR-078 … DR-082)

*Found by a person looking at the running product in Chrome. None was findable by any test in the
suite — every one of them passed 1,364 automated assertions while being visible on screen.*

| DR | Title | Description | Owning phase | Risk | Target gate | Blocking? | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **DR-078** | Six metrics are declared on Project Executive Health but produced only on Margin & Driver Intelligence | `MET-COM-007/008` and `MET-QUA-003/006/009/012` render as not-computable on the project page while the **same metrics compute and display** on the margin page. ADR-0022 records CONFLICT C-21 as resolved. Either the declaration on this surface is stale or ADR-0022's resolution was applied to one context and not the other. **This is a semantic question and Phase 12A deliberately did not answer it** — the UX pass only replaced the internal conflict text with executive language and kept the governance reference. Inventing the answer during a UX review is the failure this project guards against | 12B | **Medium.** No number is wrong; a reader is told a measure is unavailable here while it is shown two pages away | `ACCEPTED_DEBT` | No | The metric owner rules on whether these belong on the project surface, recorded as an ADR amendment; then either the declaration is removed or the values are supplied |
| **DR-079** | The executive table's project column does not stay pinned when scrolled horizontally | The command-centre table carries 21 columns and scrolls sideways by design. The project name scrolls away with it, so a reader inspecting trajectory, 30/60-day outlook, time-to-act or executive action sees **75 rows of RED with no identity**. The Phase 7 acceptance checklist asks this exact question — *"does the project column stay as the anchor?"* — and the answer, when someone finally looked, was no | 12B | **Medium-high.** It defeats the second half of the 30-second test: the reader can find the ranking or the outlook, not both | `EXECUTIVE_DEMO_BLOCKER` | No | `position: sticky` on the first column with a background and a shadow at the scroll edge, verified in a browser at 1440x900 |
| **DR-080** | The sticky top bar overlaps its own contents at 200% zoom | At the 200%-zoom-equivalent viewport (720 CSS px) the freshness chip, the demo marker, the persona and the role badge collide; *"Data current"* is partially obscured. Content below the header reflows correctly and nothing is lost | 12B | **Low-medium.** WCAG 1.4.10 reflow is otherwise met; this is the header only | `PHASE_12_BLOCKER` | No | The top bar wraps rather than overlaps below a breakpoint, checked at 200% in a browser |
| **DR-081** | Panel titles are not headings | Major section titles (*Green-at-Risk*, *Where to intervene first*, *Health dimensions*) are `<span class="gl-card-title">`. Measured on the command centre: **one `<h2>` and zero `<h3>`** against a dozen visual sections, so a screen-reader user cannot navigate by heading. Landmarks, the skip link, table semantics (**279 of 279 `<th>` carry `scope`**) and focus visibility are all correct — this is the one structural gap | 12B | **Medium.** It is the difference between a page a screen-reader user can skim and one they must read linearly | `PHASE_12_BLOCKER` | No | Card titles render as the heading level their nesting implies, with the visual style unchanged |
| **DR-082** | Engineering vocabulary still reaches executive surfaces | After the Phase 12A fixes, ~20 literal `**` markers remain in prose the `RichText` pass did not reach; **10 raw ISO instants** persist on Forward Risk; calendar dates render as `2027-04-19` rather than `19 Apr 2027`; and raw enums remain visible — `FIXED_BID`, `NOT_ASSESSED`, `CAPACITY`, `TIME_AND_MATERIALS`, `SCOPE_COMMERCIAL`, `PRODUCT_QUALITY` — alongside raw rule ids (`OVR-NO-CREDIBLE-PLAN`) and the assistant's `CS-n` caveat codes. Synthetic-data artefacts also surface as people (*"Leader pf-bu-americas"*), which **cannot be fixed in a UX phase** because it would change generator facts | 12B | **Low-medium.** Each instance is small; collectively they are what makes the product read as engineering output rather than an executive tool | `EXECUTIVE_DEMO_BLOCKER` | No | A presentation-layer label map for enums, rule ids and CS codes; `formatInstant` applied to the remaining sites; a calendar-date formatter; and a generator naming decision taken outside a UX phase |

---

## 4. Inherited debt still open (DR-017 … DR-022)

Carried from Phases 3–4. Classified here for completeness, because "every open DR has an owning gate"
is not satisfied by classifying only the security ones.

| DR | Title | Risk | Owning phase | Target gate | Blocking? | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **DR-017** | Only 2 of 56 tables carry `gldi_app` grants; the rest rely on defaults | **Medium.** Least privilege is proven **only** for the audit table. Persistence-layer As-Sold immutability is `VERIFIED`; a complete production DB-role model is **not** | Post-POC / deployment | `PRODUCTION_BLOCKER` | **No.** Not a Phase 6 blocker — Phase 6 adds no persistence | Explicit grants on all 56 tables; a `db:verify` check enumerating every table and failing on a default grant; a documented role model separating migration, application and read-only roles |
| ~~DR-018~~ | ~~A 60-day-stale domain can sit behind a HIGH data-confidence label~~ | — | 6 | — | **CLOSED** — see §3b | Band ceiling implemented and property-tested |
| **DR-019** | `MET-FIN-015` Gross Margin — Actual to Date not computed | Low | 6 | `PHASE_9_BLOCKER` | No | The metric implemented and covered by the catalog test |
| **DR-020** | `MET-FIN-018` margin bridge not implemented (carries AC-4) | Medium — AC-4 depends on it | 9 | `PHASE_9_BLOCKER` | No | Bridge implemented; AC-4 demonstrated |
| ~~DR-021~~ | ~~Acceptance-report adapter builds one trajectory signal series~~ | — | 7 | — | **CLOSED** — see §3b | Six signals, each under its own policy; scenario LR detectable |
| **DR-022** | No persistence for any Phase 4 output | Medium — assessments recompute and nothing is stored | 6 | `PHASE_8_BLOCKER` (Phase 8 is the first surface needing stored judgements; **DR-036** depends on it) | No for Phase 6 | Repositories for assessments and overrides; a restart test showing stored judgements survive |

---

## 5a. DR-026 — impersonation: assessed and deliberately not built

The Phase 7 entry gate asks whether impersonation is *required*, not whether it would be useful. It is
not required, and the answer is worth writing down because the pressure to build it will arrive from
the demo rather than from the requirements.

**Is it needed for Phase 7's acceptance criteria?**

| Criterion | Needs impersonation? |
| --- | --- |
| **AC-1** — CDO to a named project needing intervention in <30s, <3 interactions | No. One persona, one path |
| **AC-2** — a Reported-Green / System-Amber project explained with evidence | No. `MET-HLTH-033` and the divergence evidence are role-independent |
| **AC-3** — every headline number drills to L1 facts in ≤3 steps | No |
| **AC-5** — two roles on the same project receive materially different data, **verified by test, not UI inspection** | **No — and this is the important one.** AC-5 explicitly requires a *test*, precisely so nobody demonstrates authorization by clicking around as different users. 205 authorization tests already discharge it |

**Decision: do not implement. Classify as accepted deferred debt for Phase 7.**

**And do not build a persona switcher that could be mistaken for it.** The application shell has an
identity area, and putting a dropdown of personas in it would be the easiest thing in this codebase to
build and the most dangerous thing to demonstrate — an audience cannot tell "the app let me become the
CFO" from "the demo restarted as the CFO", and one of those is a catastrophic security claim. If a
demo needs to show two roles, it restarts as a different persona, and the shell says whose session it
is.

If it is ever built, `SECURITY_MODEL.md` §3 already fixes the design and none of it is optional: an
explicit capability, both identities preserved and audited on every action, an authority ceiling at
the impersonator's own scope, and an unmissable UI banner. `impersonatorId` already propagates through
every audit record, so the trail exists ahead of the feature — which is the correct order.

---

## 5. Roll-up by gate

| Gate | Items |
| --- | --- |
| `PHASE_6_BLOCKER` | **None.** No open debt blocks the design system and application shell |
| `PHASE_7_BLOCKER` | DR-026 (conditional — **assessed and deferred**, §5a), DR-030, DR-044 (for a *driven* AC-1 demo only) |
| `PHASE_8_BLOCKER` | DR-022, DR-036, DR-047 |
| `PHASE_9_BLOCKER` | DR-019, DR-020, DR-043, DR-051, DR-052, DR-054, DR-055 |
| `PHASE_10_BLOCKER` | DR-057 (narrowed) |
| `PHASE_11_BLOCKER` | **None.** DR-073 closed at Phase 11C; DR-039 closed; DR-059, DR-061 and DR-063 reclassified as Pilot/Production items — none can produce a materially misleading authoritative AI answer |
| `PHASE_12_BLOCKER` | DR-032, DR-042, DR-053, DR-060 |
| `EXECUTIVE_DEMO_BLOCKER` | **DR-079** (unpinned project column), **DR-082** (engineering vocabulary on executive surfaces), DR-023 (disclosure), DR-024 (disclosure), DR-029 (any network-served demo), DR-042 (any accessibility claim), DR-045 (KPI movement), DR-049 (recovery status), DR-050 (schedule variance), DR-051 (schedule slip in the data), DR-052 (Green-at-Risk has no subject), DR-054 (band calibration vs the scenario catalog), DR-055 (uncalibrated override thresholds), DR-056 (resource mix dimensions), DR-057 (dependency economics), DR-059 (late detection basis), DR-061 (early-warning thresholds), **DR-062** (margin-bridge explanatory coverage), **DR-064** (seniority band split), **DR-066** (untested semantic branches) |
| `PRODUCTION_BLOCKER` | DR-017, DR-023, DR-024, DR-025, DR-027, DR-028, DR-029, DR-031, DR-033, DR-034, DR-035, DR-037, DR-038, DR-040, DR-046 |
| `ACCEPTED_DEBT` | DR-025 (for the POC), DR-026 (assessed and deferred), DR-058 (modelled bridge attribution, declared on the surface), **DR-072** (assistant omission and lexicon coverage), **DR-074** (registry read beside the gateway), **DR-077** (neutralisation cannot detect false retrieved text) |

**37 open items after the pre-Phase-11 architectural closure.** Five closed in this pass —
**DR-048** (C-20 resolved, `REQ-PORT-003` met), **DR-050**, **DR-053**, **DR-056**, and the milestone
half of **DR-051** — plus **DR-049** at Phase 10. **DR-057 was corrected**: it claimed blocked effort
was never populated; it is populated on 64 of 91 projects, and only the curated scenarios carry none. **None blocks starting Phase 9.** The four
`PHASE_9_BLOCKER` items new in Phase 8 — DR-050, DR-051, DR-054, DR-055 — are all about the
*synthetic data and its calibration*, not about the engines: each is a case where the arithmetic is
right and either the demo portfolio has too little to say or a threshold has never been agreed.
**Read DR-055 first**: 50 of 75 fixed-bid projects are RED by hard override rather than by band, so
recalibrating band edges (DR-054) alone would not change the distribution.

That is a change in character worth naming. At Phase 5 closure the roll-up read *"zero are Phase 6
blockers"* — because Phase 6 built a design system over an authorization pipeline that was already
enforced. Phase 7 is different: it builds the surface AC-1 is measured on, and AC-1 counts
*interactions*. **DR-041** — no client runtime — is therefore not a tidy-up item; it is the thing
that decides whether Phase 7 can demonstrate its own acceptance criterion. DR-018 and DR-021 are
narrower: a confidence label that can outrun its evidence, and a trajectory adapter that builds one
signal series where the Command Center wants several.

Note also **MC-5**, which is not debt and blocks Phase 7 harder than any item here: `MET-PORT-007`
throws, because nobody has defined "intervenability", and ranking by intervention priority is the
Portfolio Command Center's entire job.

---

## 6. Closed items still referenced by other documents

Listed so that a `DR-nnn` appearing in the threat model or the control matrix always resolves to
something here, closed or open. A consistency test asserts that property in both directions.

| DR | Title | Status | Closure evidence |
| --- | --- | --- | --- |
| **DR-012** | No real-PostgreSQL execution of the migration chain | **CLOSED** (Phase 3) | `npm run db:verify` — 80 checks against a real PostgreSQL instance: migration chain from empty, As-Sold immutability, privileges, `NUMERIC` precision, authored constraints, schema boundaries, transaction atomicity, declared indexes. Written up in `docs/traceability/DR-012-POSTGRESQL-VERIFICATION.md`. `docs/THREAT_MODEL.md` T-DB-3 cites that write-up as the evidence for the *partial* grant model, which remains open as **DR-017** |
