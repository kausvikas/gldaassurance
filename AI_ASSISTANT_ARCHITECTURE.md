# AI_ASSISTANT_ARCHITECTURE.md

**Phase:** 11A — architecture only. **No assistant implementation exists.**
**Status:** Proposed — depends on ADR-0029, ADR-0030, ADR-0031, all `Proposed`.
**Date:** 2026-09-01
**Authority:** `ARCHITECTURE_DECISIONS.md` §4.1 rule 4 · ADR-0004 · ADR-0005 · ADR-0012 · ADR-0020 ·
`SECURITY_MODEL.md` §6, §12.5 · `PRODUCT_SPEC.md` §7.9

> ## ⚠️ DEMO — SYNTHETIC DATA
> Proof of concept. No real client, employee or financial data. Nothing here is a production claim.

---

## 1. The problem this architecture exists to prevent

A natural-language interface over governed delivery economics has one failure mode that matters more
than all the others combined:

> **The assistant becomes a second calculation engine, and nobody notices, because its output is
> fluent.**

The repository has already been bitten twice by the non-fluent version of this — a Frozen formula
deferred a choice, an implementation made it silently, and every gate stayed green
(`PHASE_0_10_SEMANTIC_CLOSURE.md`). A language model makes that failure *cheaper to commit and
harder to see*: it will happily divide two numbers it was given, describe a rule firing as a
likelihood, or narrate a residual as an opportunity, and the result reads better than the correct
answer.

**So the architecture's job is not to make the model behave. It is to make the wrong answer
structurally inexpressible.** Prompt hardening is defence in depth (`SECURITY_MODEL.md` §6); it is
not the defence.

---

## 2. The only permitted factual path

```
  Authorized Facts                     L1   contexts/*, synthetic generator
        │
        ▼
  Governed Deterministic Metrics       L2   contexts/{financial,delivery,quality,commercial,resource}
        │
        ▼
  Governed Assessments                 L3   contexts/{health,forecast,rules,recovery,portfolio}
        │  health · trajectory · early warning · recovery · ranking
        ▼
  Authorized Application Query Service      src/app/*  ← EnforcementPoint.authorise() runs HERE
        │  authenticate → RBAC → ABAC scope → object check → field shape → audit
        ▼
  ApplicationGateway.request(ctx, ViewRequest)         ADR-0020, in-process
        │
        ▼
  Typed Read-Only Assistant Tool            ADR-0029 — closed allowlist, one tool ⇒ one ViewId
        │  returns ClaimEnvelope[] (ADR-0031), never raw domain objects
        ▼
  Narrative Synthesis                  L4   deterministic template, or LLM over claims only
        │
        ▼
  Claim / Grounding Validation              ADR-0030 — deterministic, post-generation, blocking
        │
        ▼
  User
```

### Paths that do not exist and may not be created

| Forbidden path | Prevented by |
| --- | --- |
| Raw database → LLM | `ai-intelligence` has `mayDependOn: []` and `forbidAllContexts: true` in `architecture/manifest.json`; the gate fails the build |
| Raw Finance/Jira/documents → LLM → financial calculation | No ingestion adapter is assistant-reachable; the only window is `AuthorisedRetrievalPort` (ADR-0029 narrows it to typed tools) |
| LLM → SQL | No tool accepts an expression, a predicate, a field list or an order-by. `ViewRequest` has no such field, by design (`gateway.ts` header) |
| LLM → official RAG calculation | RAG arrives as an already-computed `ClaimEnvelope` with `metricId` + `bandProvenance`. The model receives a token, not the inputs |
| LLM → economic calculation | Money crosses as `MoneyDto` strings; the model never receives an operand pair with an operator. G-FLOAT already rejects `Number()` coercion in the app layer |
| LLM → mutation of governed state | §8. Zero write tools. `CapabilityDeclaration.isWrite` is never set on any assistant tool |

**The LLM explains governed intelligence. It does not create governed intelligence.**

---

## 3. Where this sits in the existing system

Nothing here is a new architecture. Every load-bearing seam already exists and is tested:

| Seam | File | State |
| --- | --- | --- |
| Authorization enforcement, in order | `src/app/authorization/enforcement.ts` | **Implemented**, Phase 5 |
| Proof-of-authorization token | `AuthorisedRequest` — unforgeable, carries the resolved entity set | **Implemented** |
| Field shaping (`OMIT`, never mask) | `src/app/authorization/field-policy.ts` | **Implemented** |
| Generic not-found for every denial cause | `AuthorizationDenied` — message is `"Not found"` always | **Implemented** |
| The one interaction seam | `src/app/gateway.ts` — `ApplicationGateway`, closed `VIEW_ROUTES` | **Implemented**, ADR-0020 |
| Provenance envelope on every value | `src/app/dto/provenance-dto.ts`, `@platform/provenance` | **Implemented** |
| Epistemic state algebra | `@platform/explainability` — `SignalState`, `RuleEvaluationStatus` | **Implemented**, ADR-0026/0027/0028 |
| "The model never types a digit" | `ValueReference` in `@platform/provenance` | **Implemented** (type only) |
| Assistant capability | `assistant.use` in `CAPABILITY_MATRIX` — 5 of 6 roles | **Implemented** |
| Assistant rate limit | `POC_SECURITY_POLICY.rateLimits.assistant` = 20/min per **actor** | **Implemented** |
| Assistant audit action | `ASSISTANT_QUERY` in `AuditAction` | **Implemented** (action exists; assistant record shape is §9) |
| Assistant context stub + ports | `src/contexts/ai-intelligence/index.ts` | **Stub**, 81 lines, DQ-3 open |

**Phase 11A changes exactly three of these**, all through ADRs, and adds no new layer:

1. `AuthorisedRetrievalPort.retrieve(question, asOf)` — a free-text port — is **replaced** by a typed
   tool allowlist (ADR-0029). This closes **DQ-3**.
2. A uniform `ClaimEnvelope` is introduced at the application boundary (ADR-0031), because the
   qualification fields the assistant must honour are today bespoke per service
   (`executiveAuthoritative` in forecast, `explanatoryCoverage` in financial, `assessmentStatus` in
   health, `bandProvenance` in the project app service).
3. A deterministic grounding validator is introduced as a blocking post-generation stage (ADR-0030).

---

## 4. Authorization architecture

**Authorization happens before context creation. There is no ordering in which the model influences
what was retrieved.**

```
  1. authenticate            ctx.sessions.validate(sessionId)   server-side, from the store
  2. rate limit              bucket 'assistant', per actor, 20/min
  3. capability              policy.may(auth, 'assistant.use')  deny-by-default
  4. intent resolution       question → { toolId, bounded args }   ← NO DATA HAS BEEN READ YET
  5. per-tool capability     policy.may(auth, tool.capability)
  6. ABAC scope              policy.resolveScope(auth) → AuthorisedEntitySet
  7. object-level check      named entity ∈ entitySet, else AuthorizationDenied("Not found")
  8. retrieve                through ApplicationGateway.request() — the same path the UI uses
  9. field shape             shape(resource, value, classifications, ctx) → withheld[] named
 10. build ClaimEnvelope[]   from the shaped payload only
 11. model                   sees ONLY step 10's output
 12. grounding validator     deterministic, blocking
 13. audit                   ASSISTANT_QUERY record (§9)
 14. respond
```

Two properties follow structurally, not by convention:

- **A fully successful prompt injection cannot widen retrieval**, because steps 6 and 7 completed
  before step 11 began, and step 11 has no channel back to them. The model can be persuaded to
  *ask* for anything; there is nothing it can ask that re-runs scope resolution.
- **AC-6 is a test, not a claim.** Remove a role's grant on a classification and the field is
  `OMIT`-ed at step 9, so it never reaches step 10, so it cannot appear at step 11. The fact
  disappears from the answer because retrieval genuinely could not see it.

### Existence disclosure

`AuthorizationDenied` already returns `"Not found"` for every cause. Phase 11B must extend that
discipline to five assistant-specific channels the UI does not have:

| Channel | Rule |
| --- | --- |
| **Names** | The assistant may name only entities present in `AuthorisedEntitySet` |
| **Counts** | Every count is computed over the authorised set and labelled with it. "75 of 91 authorised" is the Phase 7 pattern and it is mandatory (`PHASE_HANDOFF.md` §0.3 idea 0) |
| **Comparisons** | `portfolio.segments.compare` accepts only segment ids resolvable inside the caller's scope; an unresolvable segment is `"Not found"`, never "you lack access to that" |
| **Errors** | One decline shape. `OUT_OF_SCOPE` and `NOT_FOUND` collapse to a single user-visible string |
| **Citations & follow-ups** | A citation or a suggested follow-up naming an out-of-scope entity is a leak. The validator (§7) rejects the answer, it does not filter it — filtering hides a bug that should fail |

---

## 5. Tool architecture (ADR-0029)

**Every tool is a bounded projection over an existing `ViewId`.** A tool is not a new data path; it
is a second caller of the path Phase 7–10 already built and tested. This is the single most important
choice in this document, because it means the assistant inherits — rather than re-implements —
authorization, field shaping, decimal safety, provenance and the epistemic states.

### Inventory

| # | Tool | Backing `ViewId` | Returns | Capability |
| --- | --- | --- | --- | --- |
| 1 | `portfolio.summary.get` | `portfolio.commandCenter` | 8 KPIs, population vs authorised counts, `bandProvenance` | `assistant.use` + view's own |
| 2 | `portfolio.ranking.list` | `portfolio.commandCenter` | `MET-PORT-007` tiers, rank 1 + `outranksBecause`, unrankable listed separately | ″ |
| 3 | `portfolio.reportedGreenRisk.list` | `portfolio.commandCenter` | ADR-0018 finding **1** — organisation says GREEN, evidence disagrees | ″ |
| 4 | `portfolio.systemGreenAtRisk.list` | `portfolio.commandCenter` | ADR-0018 finding **2** — system GREEN, outlook AMBER/RED at 30/60d | ″ |
| 5 | `portfolio.segments.compare` | `portfolio.commandCenter` | Bounded comparison across ≤N authorised segments | ″ |
| 6 | `project.executiveHealth.get` | `project.executiveHealth` | 4 dimensions, composite, overrides with 5-state status, `assessmentStatus`, `bandProvenance` | ″ |
| 7 | `project.marginDrivers.get` | `project.marginIntelligence` | Bridge causes **and** `MET-FIN-041` coverage — inseparable (§6) | ″ |
| 8 | `project.forwardRisk.get` | `project.forwardRisk` | Early warnings, outlook, trajectory | ″ |
| 9 | `project.recoveryOptions.get` | `project.forwardRisk` | `MET-REC-001/002/003`, plans, actions, dispositions | ″ |
| 10 | `project.lateDetection.get` | `project.forwardRisk` | `MET-FCST-030` **with** `executiveAuthoritative` + `reconstructedDimensions` | ″ |
| 11 | `evidence.get` | `project.lineage` | L1 records behind a named metric value — AC-3's ≤3 steps | ″ |
| 12 | `metric.definition.get` | **new** `metric.definition` | Registry record: formula, inputs, unit, version, status, owner, `calibrationParameters` | ″ |

**Deviations from the prompt's candidate names, and why:**

- `getReportedGreenRisk` / `getSystemEmergingRisk` are kept as **two tools** (3 and 4). ADR-0018
  computes them independently and the repository's standing rule is that collapsing them is the
  defect. One tool with a mode flag invites a narrative that says "Green-at-Risk" without a subject —
  which is already open debt as **DR-052**.
- `getMarginDrivers` and coverage are **one tool** (7), not two. DR-062 is a Category B item: a
  consumer that can fetch the causes without the coverage will quote the waterfall as the explanation.
  Making them separable re-opens the exact hole the closure pass shut.
- `getForecastConfidence` is realised as `project.lateDetection.get` (10), named for what it actually
  returns. There is no calibrated confidence in this system; a tool called `getForecastConfidence`
  would be a naming lie under DR-061.
- `getEvidence` maps to the existing `project.lineage` view rather than a new service.
- **`audit.events` is deliberately excluded from the allowlist.** `ASSURANCE_AUDITOR` holds both
  `audit.read` and `assistant.use`, so a naive design would let audit content — classified
  `SECURITY_TELEMETRY` — flow into narrative prose where its classification can no longer be
  re-checked. ADR-0016 C-14 keeps that grant narrow. Auditors use the audit view. **This is an
  architectural exclusion, not an omission.**

### Binding requirements on every tool

| Requirement | How it is enforced |
| --- | --- |
| Read-only | No tool declares `isWrite`; a build control asserts the allowlist contains no write capability |
| Caller context mandatory | Signature takes `RequestContext`; there is no zero-arg form |
| Server-side authorization | The tool calls `ApplicationGateway.request()`; it cannot reach a service directly |
| Typed input and output | Closed union of tool ids; per-tool argument type; `ClaimEnvelope[]` out |
| Bounded scope | Every list tool takes `page` with a capped `limit`; `compare` caps segment count |
| Canonical service reuse | One tool ⇒ exactly one `ViewId` from the closed `VIEW_ROUTES` table |
| Provenance included | `ClaimEnvelope` carries it; an envelope without sources fails construction |
| No arbitrary DB query | No SQL reaches the tool layer; `ViewRequest` cannot express one |
| No arbitrary metric expression | `metric.definition.get` returns a *definition*; it never evaluates |
| No arbitrary file retrieval | No filesystem port is declared or injectable |

---

## 6. The answer contract

Structured object first. Prose is derived from it and never the other way round.

```ts
interface AssistantResponse {
  question: string;                       // verbatim, untrusted, never re-emitted into prose
  intent: IntentId;                       // closed union, resolved before retrieval
  scope: { authorisedProjectCount: number; populationCount: number; scopeNodes: ScopeNode[] };
  asOf: Instant;
  answer: string;                         // L4 prose — validated, never authoritative on its own
  materialClaims: MaterialClaim[];        // each individually groundable
  evidence: RecordRef[];
  metricRefs: { metricId: string; version: string }[];
  caveats: Caveat[];                      // machine-derived, §7 of AI_TRUST_CONTRACT.md
  missingEvidence: { input: string; state: SignalState; reason: NotEvaluatedReasonCode }[];
  calibrationStatus: 'SYNTHETIC_UNVALIDATED' | 'APPROVED';   // always the former in this POC
  assessmentStatus: 'COMPLETE' | 'PROVISIONAL' | 'NOT_COMPUTABLE';
  executiveAuthority: 'AUTHORITATIVE' | 'QUALIFIED' | 'NOT_AUTHORITATIVE';
  suggestedFollowUps: FollowUp[];         // each is a tool id + bounded args, never free text
  declined?: { reason: 'INSUFFICIENT_EVIDENCE' | 'OUT_OF_SCOPE' | 'NOT_ANSWERABLE' };
  syntheticData: true;                    // structural, not hand-typed (G-DEMO)
}

interface MaterialClaim {
  claimId: string;
  text: string;                           // the sentence this claim licenses
  valueRef: ValueReference | null;         // the digit, resolved by presentation — not by the model
  epistemicLayer: 'L1' | 'L2' | 'L3';     // L4 is never a claim
  envelope: ClaimEnvelope;                // ADR-0031
  groundedBy: RecordRef[];                // non-empty, or the claim is rejected
}
```

**`suggestedFollowUps` are tool invocations, not sentences.** A free-text follow-up is an
unvalidated claim about what is answerable, and it is also an existence-disclosure channel (§4).

---

## 7. Grounding validation architecture (ADR-0030)

### The decision: **governed hybrid (D)**

| Option | Verdict |
| --- | --- |
| **A. Constrained structured generation** | Rejected alone — constrains *shape*, not *truth*. A schema-valid answer can still assert an unsupported causal claim in a free-text field |
| **B. Deterministic answer templates** | **Retained as the floor.** Every intent has a template that renders from `materialClaims` with zero model involvement. This is what ships when no LLM is configured, and it is the fallback when validation fails |
| **C. LLM generation + deterministic claim validator** | **Retained as the ceiling.** Used only for connective prose over an already-fixed claim set |
| **D. Governed hybrid** | **Chosen.** B is always available and always correct; C is an enhancement that must pass the same validator; the validator is the gate for both |

**Trade-offs, stated plainly.** The hybrid costs more than either pure option: two rendering paths to
maintain, and a validator that must be as expressive as the prose it polices. It buys the one
property neither pure option has — **the product degrades to correct-and-dull rather than to
fluent-and-wrong.** Templates alone would make the assistant a worse version of the four surfaces
already built; LLM-plus-validator alone would have no defined behaviour when the validator rejects,
and "retry until it passes" is how a validator becomes a formatting hint.

### What the validator must detect

Runs after generation, before the response leaves the application layer. **Blocking.**

| # | Detection | Method |
| --- | --- | --- |
| 1 | Unsupported number | Every numeral token in `answer` must correspond to a resolved `ValueReference` in `materialClaims`. Model-emitted digits in fact position are rejected outright (ADR-0004 §4) |
| 2 | Unsupported percentage | As 1, plus unit check: a percentage may only resolve from a `Ratio`/percentage-unit metric — the `MET-COM-011` class of error (ADR-0025) at the prose layer |
| 3 | Unsupported project/customer | Every named entity must be in `AuthorisedEntitySet`. A name outside it is a **leak**, not a hallucination — fail loudly, do not filter |
| 4 | Unsupported RAG | RAG tokens (`RED`/`AMBER`/`GREEN`) must trace to a claim carrying `bandProvenance`, and Reported vs System must be distinguishable in the claim |
| 5 | Unsupported rank | Rank assertions require a `MET-PORT-007` claim carrying the deciding tier |
| 6 | Unsupported trajectory | Direction words (`improving`, `deteriorating`, `worsening`) require a claim with `SignalDirection` — not `NOT_COMPUTABLE` |
| 7 | Unsupported causal claim | Causal connectives (`because`, `driven by`, `caused by`, `due to`) permitted **only** where a bridge cause or rule firing licenses them, and never over a `NOT_ATTRIBUTED` residual (DR-058) |
| 8 | Unsupported probability | Probability lexicon (`likely`, `probability`, `chance`, `expected to`, `forecast that`, `%` chance) is **banned outright**. Nothing in this product is trained, fitted or sampled |
| 9 | Unsupported recovery claim | Recovery lexicon must match the exact ladder rung the claim carries (§5 of the trust contract). "Recoverable" over a residual is rejected |
| 10 | Unauthorized object | Any `RecordRef` in `evidence` whose entity is outside `AuthorisedEntitySet` fails the response. This is the AC-6 assertion in its negative form |

### On failure

1. The LLM-generated `answer` is **discarded**, not repaired.
2. The deterministic template for the resolved intent renders instead.
3. The failure is audited with the detection id — never with the rejected prose (§9).
4. A validator rejection rate is a first-class metric. A rising rate is a model or prompt regression;
   a *zero* rate is evidence the validator is not actually running, and the evaluation suite asserts
   a non-zero rejection rate against deliberately adversarial fixtures.

**Fluency is not evidence.** The validator is deterministic, it runs on every answer including
template-rendered ones, and it has no bypass flag.

---

## 8. No agency (REQ-AI-003, DR-060)

**Phase 11 exposes zero business-state write tools.** The assistant cannot approve or create a CR,
change ETC/EAC, alter a baseline, alter Reported or System RAG, accept a risk, close a warning,
change an assurance disposition, approve or alter a recovery plan, send any communication, change a
metric or rule, or change a synthetic fact.

This is enforced three ways, not asserted once:

1. **No tool declares a write capability.** The allowlist is a closed union; a build control asserts
   every entry maps to a `GET` route in `VIEW_ROUTES`.
2. **`CapabilityDeclaration.isWrite` is never set** on an assistant declaration, so
   `EnforcementPoint` never takes the write path and `recordWrite` is unreachable.
3. **The write capabilities exist and are held by humans.** `health.applyOverride`,
   `forecast.updateEtc`, `risk.acceptRisk` and the rest are in `CAPABILITY_MATRIX` for roles, not
   for the assistant. The assistant runs as the caller and still cannot use them, because no tool
   requests them.

DR-060 — no authorised workflow to accept a recommendation — **remains a deliberate boundary, not a
gap to close in 11B.** The lifecycle can be observed. It cannot be driven.

---

## 9. Audit model (REQ-AI-005)

One `ASSISTANT_QUERY` record per interaction, using the existing `AuditRecord` shape.

| Field | Value | Note |
| --- | --- | --- |
| `actorId`, `actorRole`, `impersonatorId?` | From `ctx.auth` | Never from the request body |
| `occurredAt` | `ctx.clock.now()` | Injected clock, ADR-0003 |
| `action` | `ASSISTANT_QUERY` | Already in the union |
| `entityType` / `entityId` | `'assistant'` / correlation id | The interaction is the entity |
| `fields` | Classifications actually read | From `ShapeResult.sensitiveFieldsRead` |
| `decision` | `GRANT` / `DENY` | Denials recorded, per §5.3 |
| `reason` | Structured metadata, below | |
| `correlationId` | `ctx.auth.correlationId` | Joins the tool-level `READ` records |

**Recorded in `reason` as structured metadata:** resolved `intent`; `scope` (node ids + authorised
count); `toolsInvoked[]`; `objectsAccessed[]` (ids only); per-tool allow/deny; refusal reason if
declined; validator verdict and any detection ids; model id and version, or
`DETERMINISTIC_COMPOSER`; response status.

**Deliberately NOT recorded:** the raw question text beyond a length and a hash; the generated prose;
the rejected prose; any `PERSONAL_DATA`; any figure. `SECURITY_MODEL.md` §6a forbids telemetry
becoming a second, unclassified copy of the data — an audit log containing every answer would be
exactly that. **The question hash plus the tool trace reproduces the interaction; the prose adds
disclosure risk and no investigative value.**

The tool-level reads already emit their own `READ` audit records through `EnforcementPoint`, joined
by `correlationId`. The assistant record does not duplicate them.

**DR-024 still applies:** the sink is in-memory and does not survive a restart.

---

## 10. Model-option architecture

Two configurations, one architecture.

| | **No LLM configured** (POC default) | **LLM configured** |
| --- | --- | --- |
| Intent resolution | Deterministic classifier over a closed intent union | Same — resolution stays deterministic |
| Retrieval | Typed tools | Identical |
| Claim construction | Deterministic | Identical |
| Prose | Deterministic template | LLM over `materialClaims` only |
| Validation | Runs | Runs, identically |
| Label | **"Deterministic composer — no language model is used."** Stated on the surface | Model id + version stated on the surface |

**Domain correctness is model-independent by construction:** the model never sees an operand, never
sees an unauthorised field, and never emits a digit. Swapping or removing the model changes prose
quality and nothing else. A test asserts that the same question, same fixtures, both configurations,
produces **identical `materialClaims`, identical `metricRefs`, identical `evidence`**.

**Labelling accuracy is a governance requirement, not a nicety.** Calling a deterministic template
"AI" would be the same class of claim-strength failure as an unqualified "0% late detection".

---

## 11. What Phase 11B must not do

1. Introduce an HTTP transport, server package or `fetch` (ADR-0020 — the build fails).
2. Give any tool a free-text, predicate, field-list or order-by parameter.
3. Let the model see a number it could operate on.
4. Repair a validator failure by regenerating until it passes.
5. Add `audit.events` to the allowlist.
6. Implement any authorization check in the prompt, the model, or a React component.
7. Merge Reported and System RAG, or Green-at-Risk's two findings.
8. Ship prose whose confidence exceeds the envelope it came from (`AI_TRUST_CONTRACT.md` §4).

---

## 12. Honest limits of this architecture

- **It does not make the assistant correct. It makes a specific family of incorrectness
  inexpressible.** An answer can still be correct, grounded, validated and *useless* — or correct and
  misleading by selection, which is what the margin demo did with three high-coverage projects before
  the closure pass caught it (`PRE-PHASE-11-CLOSURE-TRACEABILITY.md` §3). **Selection bias is not
  detectable by the validator**, and no control here closes it.
- **The validator's lexicons are hand-written** and will be incomplete. A causal claim phrased
  without a listed connective passes. This is named as **DR-072** rather than claimed as closed.
- **Nothing in this document has been executed.** No tool, validator, composer or test exists. This is
  an architecture, and the repository's own standard is that a design is not a working system.
