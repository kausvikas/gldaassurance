# ADR-0032 — The trusted server runtime is a container, and it activates ADR-0006

- **Status:** **Accepted** — 2026-09-03
- **Date proposed:** 2026-09-03
- **Date accepted:** 2026-09-03
- **Phase:** 13
- **Affects:** ADR-0006 (promoted Proposed → Accepted), ADR-0010 (promoted Proposed → Accepted for §2–§9), DR-029, `src/app`, new `server/`
- **Supersedes:** nothing. **Amends:** `GATEWAY_STATE` in `src/app/gateway.ts`

---

## Context

Phase 13 requires dynamic LLM invocation, secret handling, file parsing and enterprise connector
calls. None of these can live in the browser:

- an API credential in client JavaScript is a published credential;
- a document parser in the browser is a parser with no resource governor and no audit path;
- a connector called from the SPA is the browser-to-enterprise-source coupling ADR-0010 §8 forbids
  by name.

So Phase 13 cannot be delivered without a trusted server-side runtime. That has been true since
Phase 1, which is why `ADR-0006` (task-shaped BFF) and `ADR-0010` (deployment and configuration)
were written — and left **Proposed**, because `src/app/gateway.ts` deliberately avoided introducing
a transport while none was needed. Its header states the trap precisely: *"the moment a transport
exists **DR-029's entire security obligation activates**"*.

Phase 13 is that moment. The decision is therefore not "invent a runtime" but "accept the runtime
that was already designed, and discharge the obligation that acceptance triggers."

Two candidate runtimes were considered against the repository's own record rather than against
general preference, because §14 of the Phase 13 directive forbids choosing by assumption.

## Decision

1. **ADR-0006 is promoted to Accepted.** The trusted runtime is the task-shaped BFF it specifies:
   one HTTP API, endpoints shaped by the decision a surface supports, a uniform
   `{ data, asOf, demoMarker, degradation? }` envelope, three independent version axes. Phase 13
   adds routes to that contract; it does not invent a second one.
2. **ADR-0010 §2–§9 are promoted to Accepted.** In particular §7 — *"the container is the deployment
   unit"* — and §8 — *"no browser-to-enterprise-source coupling, ever."*
3. **The runtime is a first-party Node HTTP container, deployable to Cloud Run.** Not Cloud
   Functions, and the reason is recorded rather than assumed: ADR-0010's own alternatives table
   rejects *"Serverless deployment"* on determinism and audit-continuity grounds, and ADR-0010 §7
   makes the container the unit and the scheduled entrypoint a second entrypoint **on the same
   image**. A function-per-route deployment contradicts both. Cloud Run runs the same container the
   developer runs, which is ADR-0010 §2's *one artefact* rule.
4. **The runtime has zero third-party dependencies.** It is `node:http` plus this repository's own
   `src/`. The BFF is the component that parses untrusted uploads and holds the Anthropic
   credential; a transitive dependency tree there is a supply-chain surface the POC does not need
   and cannot review.
5. **The BFF owns transport only** (ADR-0006 §2). It makes no authorization decision, computes no
   metric and invents no DTO. Every route resolves to a use case that goes through
   `Dispatcher → EnforcementPoint`.
6. **DR-029 is discharged for this runtime, in code, as a precondition of the transport existing:**
   - no cookies and no ambient session — the browser carries an explicit bearer of a synthetic demo
     session, so **CSRF is structurally absent** rather than mitigated;
   - CORS is deny-by-default with an explicit allow-list read from configuration; no wildcard,
     never `Access-Control-Allow-Credentials`;
   - request body caps, per-route timeouts and a parse-time budget on every untrusted input;
   - the existing `RateLimiter` buckets apply per route class;
   - security headers on every response, including a CSP for API responses that forbids everything;
   - TLS and HSTS are **terminated by the platform** (Cloud Run) rather than by this process, which
     is recorded as a deployment precondition, not claimed as implemented in-process.
7. **The static executive site remains a static site.** The Phase 12 build output is unchanged in
   kind: pre-rendered HTML over pre-computed governed facts. The BFF is *additive*. Where the BFF
   is unreachable, the Assistant degrades to the deterministic composer and says so — it does not
   fabricate, and it does not blank (ADR-0008 §8, last known good).

## Rationale

- **Accepting an existing Proposed ADR beats writing a new one.** ADR-0006 already answered the
  shape question, and answered it with reasons that have not changed. Writing a Phase 13 transport
  ADR from scratch would have quietly created a second API strategy.
- **The container choice is the repository's own, not a preference.** ADR-0001 and ADR-0010 rejected
  serverless on the record. Reversing that silently in Phase 13 to get a convenient deployment would
  be exactly the "silent architectural drift" the operating contract exists to prevent.
- **Zero dependencies is a security decision, not asceticism.** This process holds the only secret in
  the system and parses the only untrusted bytes. Every package added there is a package that can
  read both.
- **Degrading to the deterministic composer is the strongest available demonstration of ADR-0030.**
  If the governed answer survives the LLM being switched off, the LLM was demonstrably not the
  source of truth. A product where removing the model removes the answer has the model in the
  calculation path.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Cloud Functions (2nd gen), one function per route** | Contradicts ADR-0010 §7 (container is the unit, scheduled work is a second entrypoint on the same image) and ADR-0001's determinism/audit-continuity rejection of serverless. Also splits the request path across deployment units, so "the same order, every time" becomes a per-function property. |
| **Express or Fastify** | Ergonomic, and adds a dependency tree to the one process that holds the API key and parses untrusted uploads. `node:http` is ~200 lines more code and zero transitive review surface. |
| **Next.js / SSR framework for the whole product** | Would replace a working, verified static build to gain server rendering nothing in Phase 13 needs. Explicitly out of scope: the Phase 12 baseline is frozen and its executive surfaces must not change behaviour. |
| **Browser calls Anthropic directly with a user-supplied key** | Publishes a credential and breaches §14, §82 and ADR-0010 §8. Not implementable safely at any effort. |
| **Keep everything static; no server at all** | Phase 13's LLM, ingestion and connector requirements are not expressible. The honest form of this alternative is "do not do Phase 13". |

## Consequences

**Positive**
- The transport that eleven phases designed around finally exists, in the shape they designed.
- Secrets, untrusted parsing and provider calls have exactly one home, and it is auditable.
- The static demo keeps working with the server switched off, which is a governance proof.

**Negative / accepted costs**
- DR-029's obligations are now live and must stay implemented; a regression there is a P0, not a
  debt item.
- Two artefacts are now built (static site, container) where there was one.
- **Deployment of the container requires a billing-enabled GCP project.** See §Verification.

**Neutral but notable**
- The BFF is stateless. Conversation state is carried by the client and re-validated server-side on
  every turn, so no server session store is introduced and ADR-0010 §3 (no bypass path) is unaffected.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | None. The BFF sits above the Application layer, as ADR-0006 §2 requires. |
| Data model / persistence | None. The runtime is stateless; ingested artefacts are content-addressed files, not canonical rows. |
| Formulas or metrics | **None.** No metric is computed in `server/`; every figure comes from a governed use case. |
| Security model | Activates and discharges DR-029. Adds the external-AI policy seam (ADR-0033). |
| Brand / design tokens | None. |
| Requirements affected | REQ-SEC-005, REQ-SEC-008, REQ-AI-001…006 |
| Tests that must change | New `tests/integration/server-*.test.ts`; no existing test changes meaning. |

## Migration implications

None for existing surfaces. `src/app/gateway.ts` gains a second implementation of the *same*
`ApplicationGateway` interface (`kind: 'HTTP'`), which is the substitutability that interface was
written for. Not one line of Phase 7–12 presentation changes.

## Rollback path

Delete `server/` and the `apiBaseUrl` configuration. The static site returns to Phase 12 behaviour
with the Assistant on the deterministic composer. Because the BFF adds no canonical data and owns no
state, rollback loses capability and nothing else.

## Verification

- `npm run server:check` starts the runtime, exercises every route, and asserts the security headers,
  the CORS deny-by-default, the body caps and the absence of any secret in any response.
- `tests/integration/server-contract.test.ts` asserts the ADR-0006 envelope on every route.
- `tests/integration/secret-leakage.test.ts` scans the repository, the built distribution and every
  route response for credential shapes.
- **Deployment status is reported truthfully, not assumed.** At the time of this ADR the target GCP
  project `gldaassurance` has `billingEnabled: false` (Spark plan), and Cloud Run requires a
  billing-enabled project. The container therefore **builds and runs and is verified locally, and is
  not deployed**. That is recorded as a deployment precondition in
  `docs/ENTERPRISE_INTEGRATION_MATRIX.md`, not as a passing test.

## Open questions

- Whether the BFF deploys separately from the domain (DQ-9) remains post-POC, unchanged.
- Session transport for a real deployment (bearer vs. cookie) is decided here **for the synthetic
  POC only**; a production deployment with real identity re-opens it, and would re-open CSRF with it.
