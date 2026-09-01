# ADR-0029 — The assistant's data window is a typed read-only tool allowlist, not a free-text retrieval port

- **Status:** **Accepted** — 2026-09-01
- **Date proposed:** 2026-09-01
- **Date accepted:** 2026-09-01
- **Approver:** Chief Enterprise Architect + Enterprise AI Architect + AI Security Lead + Independent Model-Governance Reviewer
- **Phase:** 11A (AI architecture)
- **Affects:** `src/contexts/ai-intelligence/index.ts` (`AuthorisedRetrievalPort`), `src/app/gateway.ts`
  (`ViewId`, `VIEW_ROUTES`), `REQ-AI-001`, `REQ-AI-003`, `REQ-SEC-010`, **DQ-3**, **DR-039**
- **Supersedes:** —
- **Resolves:** **DQ-3** — "the retrieval strategy is decided in Phase 11"

---

## Context

`src/contexts/ai-intelligence/index.ts` has declared one window onto data since Phase 4:

```ts
interface AuthorisedRetrievalPort {
  retrieve(question: string, asOf: Instant): Promise<readonly RetrievedFact[]>;
}
```

The stub is correct about the things that matter most — the port is injected by the Application layer
already bound to the caller's `AuthorizationContext`, `ai-intelligence` may import no domain context
(`forbidAllContexts: true`, gate-enforced), and `RetrievedFact.untrusted: true` marks retrieved
content as data. **DQ-3 deliberately left the retrieval strategy open.**

Deciding it now, before any implementation, exposes a problem the signature hides. `retrieve(question)`
takes **free text** and returns `RetrievedFact { content: string }`. That shape:

1. **Has no bounded query scope.** "What does this question need?" is answered inside the port, by
   something, in a way no type constrains. `ApplicationGateway`'s header rejects exactly this for the
   UI — *"there is no `getProject()`, no `query(sql)`, no `fetchAll()` … a caller that can shape a
   query can eventually shape one you did not intend."* The assistant is the caller most able to
   shape a query and least able to be trusted with it.
2. **Returns opaque strings.** A `content: string` cannot carry `metricId`, `signalState`,
   `assessmentStatus`, `executiveAuthoritative` or `evidenceCoverage`. Every claim-strength rule in
   `AI_TRUST_CONTRACT.md` §3 is unenforceable against it, because the qualification travelled as
   prose or not at all.
3. **Loses the epistemic state algebra at the boundary.** ADR-0026, ADR-0027 and ADR-0028 exist
   because `null`, zero, not-applicable and not-computable were conflated one layer at a time. A
   stringly-typed retrieval port re-conflates all of them in a single hop, and does it *below* the
   model where nothing can recover the distinction.
4. **Cannot express AC-6 as a test.** "Removing a source's authorization removes it from the answer"
   is checkable per field only if the boundary carries fields.

Meanwhile the Application layer already exposes a closed, authorised, field-shaped, provenance-carrying
set of views through `ApplicationGateway.request()` — nine of them, built and tested across Phases
7–10, each behind `EnforcementPoint.authorise()`.

## Decision

**1.** The assistant's only data window is a **closed union of typed, read-only tool ids**. Free-text
retrieval is removed from the architecture. `AuthorisedRetrievalPort.retrieve(question, asOf)` is
**superseded** by a typed dispatch:

```ts
type AssistantToolId = 'portfolio.summary.get' | 'portfolio.ranking.list' | ... ;   // closed
interface AuthorisedToolPort {
  invoke<T extends AssistantToolId>(ctx: RequestContext, tool: T, args: ToolArgs<T>): Promise<ClaimEnvelope[]>;
}
```

**2. Each tool maps to exactly one existing `ViewId`** in the closed `VIEW_ROUTES` table, and reaches
it only through `ApplicationGateway.request()`. A tool is a bounded projection over a path the UI
already uses — **not a second data path**.

**3.** Every tool: is read-only; requires `RequestContext`; re-runs the full authorization sequence;
has a typed, bounded argument type; returns `ClaimEnvelope[]` (ADR-0031) and never a raw domain
object; and includes provenance. No tool accepts a predicate, an expression, a field list, an
order-by, a raw identifier list, or a file path.

**4. The inventory is twelve tools**, enumerated in `AI_ASSISTANT_ARCHITECTURE.md` §5. Adding one is a
change to this ADR, not a configuration change.

**5. `audit.events` is excluded from the allowlist.** `ASSURANCE_AUDITOR` holds both `audit.read` and
`assistant.use`; routing audit content into narrative prose would move `SECURITY_TELEMETRY` into a
medium where its classification cannot be re-checked, widening the deliberately narrow grant of
ADR-0016 C-14.

**6.** `RetrievedFact` and its `untrusted: true` marker are **retained** for free-text record content
(CR notes, risk descriptions) that a tool legitimately returns as quotable evidence. Such content is
never a claim, never carries a value, and is delimited when it reaches a model.

**7.** One new `ViewId` is added: `metric.definition` → `GET /v1/metrics/:id`, serving registry
definitions. It is governance metadata, carries no project data, and is `PUBLIC_INTERNAL`.

## Rationale

The property being bought is **inheritance instead of re-implementation**. Because a tool is a
projection over a `ViewId`, the assistant inherits — rather than re-derives — session validation,
RBAC, ABAC scope resolution, the object-level check, field shaping with named withholding, decimal
safety, provenance envelopes, the epistemic state algebra and audit. Every one of those was expensive
to get right and each has already been wrong at least once.

The alternative shape — a smart retrieval layer that decides what a question needs — puts the most
security-sensitive decision in the system inside the least constrained component. **A closed union of
twelve tool ids is auditable by reading it.** A retrieval function is auditable by reasoning about it,
and this repository's record on reasoning-based assurance is two economic sign errors that passed
every gate for months.

This also makes the Phase 11A instruction *"do not blindly implement the candidate tool names"*
actionable: three candidates were changed on semantic grounds (Green-at-Risk stays two tools per
ADR-0018; margin drivers and coverage become one tool per DR-062; `getForecastConfidence` is renamed
for what it returns, because no calibrated confidence exists under DR-061).

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Keep the free-text port; constrain by prompt** | Puts authorization-adjacent scope decisions inside the untrusted boundary. `SECURITY_MODEL.md` §6: prompt hardening is defence in depth, not the defence |
| **Let the model emit a `ViewRequest` directly** | `ViewRequest` carries `sort`, `filters` and `page` — a query-shaping surface. It is safe for a surface built by an engineer and reviewed once; it is a standing invitation for a component that composes requests from untrusted text |
| **One generic `getView(viewId, args)` tool** | Collapses twelve reviewable decisions into one unreviewable one, and makes the `audit.events` exclusion a runtime string check rather than a type-level absence |
| **A retrieval index (RAG) over record content** | Constitutes the second data path ADR-0004 §3 forbids, and cannot carry the epistemic envelope. Record content remains reachable as *evidence* through `evidence.get`, which is authorised per record |
| **Tools that call app services directly, bypassing the gateway** | Bypasses ADR-0020's single seam and would let an assistant tool drift from the UI's authorization path — the drift `SECURITY_MODEL.md` §2 B2 warns "drifts, and it drifts open" |

## Consequences

**Positive**
- AC-6 becomes a per-field test rather than an assertion.
- The claim-strength rules of `AI_TRUST_CONTRACT.md` §3 become enforceable, because qualification
  crosses the boundary as typed fields.
- The assistant cannot reach data the UI cannot reach, by construction.
- **DQ-3 closes.** **DR-039** gains a concrete design.

**Negative**
- **The assistant can only answer questions the twelve tools cover.** A question outside them declines
  (`NOT_ANSWERABLE`) rather than improvising. This is a real product limitation and it is the intended
  trade.
- Adding a capability is an ADR amendment, deliberately slowing the fastest-moving part of the product.
- Twelve tools × per-tool authorization tests is more test surface than one port.

**Neutral**
- `AssistantAnswer`, `Citation` and `ValueReference` are unchanged.
- No transport is introduced; ADR-0006 stays `Proposed` and DR-029 stays closed.

## Compliance

- A build control asserts every allowlist entry maps to a `GET` route in `VIEW_ROUTES`.
- A build control asserts no assistant `CapabilityDeclaration` sets `isWrite`.
- A build control asserts `audit.events` is absent from the allowlist.
- The architecture gate continues to assert `ai-intelligence` imports no domain context.

## Status note

**`Accepted` at the opening of Phase 11B.** Phase 11A recorded that 11B could not begin until this
ADR was accepted, because `ARCHITECTURE_DECISIONS.md` §2 forbids code depending on a `Proposed` ADR.
The Phase 11B implementation instruction is that acceptance; it is recorded here rather than assumed,
and the trade this ADR asks a reviewer to accept is restated unchanged in `PHASE_HANDOFF.md` §0.4.
