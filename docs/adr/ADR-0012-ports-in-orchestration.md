# ADR-0012 — Ports-in orchestration for aggregate, cross-domain and inferred contexts

- **Status:** Proposed
- **Date proposed:** 2026-08-29
- **Approver:** *pending — surfaced in the Phase 1 report*
- **Phase:** 1
- **Affects:** `portfolio`, `data-quality`, `ai-intelligence`, Application layer; REQ-PORT-003, REQ-DQ-001, REQ-AI-001, REQ-SEC-010, AC-6
- **Supersedes:** —

---

## Context

Three contexts, if built the obvious way, need dependencies the accepted rules forbid.

**C-1 — `portfolio`.** `ARCHITECTURE_DECISIONS.md` §4.2 places it at foundation level, owning
"portfolio/program grouping and rollup membership". `METRIC_CATALOG.md` §11 titles its section
"Portfolio aggregates (`Portfolio` context)" and defines MET-PORT-001…008 over `MET-FIN-002`,
`MET-FIN-019`, `MET-HLTH-013`, `MET-HLTH-030`, `MET-FCST-002` and `MET-DQ-005`. Computing those
requires reading `financial` (tier 2), `health` (tier 3) and `forecast` (tier 4) from a tier-1
context — an upward dependency, forbidden by §4.1 rule 3.

**`data-quality`.** MET-DQ-001…004 assess completeness, freshness, consistency and source coverage
across every fact domain. Nothing forbids a tier-3 context importing tier-2 ones, but it would mean
eleven imports, and adding a twelfth fact domain later would mean editing this context — a coupling
disguised as a legal dependency.

**`ai-intelligence`.** ADR-0004 §3 says it "calls the same Application services the UI calls", and
§4.1 rule 4 forbids it importing any domain context. But rule 1 forbids a domain context importing
the Application layer. Read literally, the assistant may import nothing at all and therefore cannot
call anything.

Each could be "solved" by relaxing a rule. `ARCHITECTURE_DECISIONS.md` §1 is explicit about what that
would cost: "the first exemption becomes the precedent for all later ones."

## Decision

**Invert the dependency in all three cases. The context declares a port in its public surface; the
Application layer supplies the implementation.**

1. **`portfolio`** exposes `PortfolioAggregationInput[]` and a pure `aggregate()` over it. The
   Application layer resolves the caller's authorised entity set, gathers per-project values from the
   owning contexts, and passes them in. `portfolio` imports no fact, derived or inferred context.
2. **`data-quality`** exposes a `DataQualityProbe` port. Each fact context implements it and reports
   what it holds and how fresh it is; the Application layer registers the implementations.
   `data-quality` scores what it is given and imports only `rules`.
3. **`ai-intelligence`** exposes an `AuthorisedRetrievalPort`. The Application layer binds an
   implementation to the caller's `AuthorizationContext` **before** handing it over.
   `ai-intelligence` imports no domain context and no application module.
4. **The Application layer is the only orchestrator.** It is already the authorization enforcement
   point (ADR-0005 §1); making it the composition point too means composition cannot escape
   authorization.
5. **A port is part of the declaring context's published contract**, not a private convenience, and
   changing one is a contract change.

## Rationale

- **The `portfolio` case is over-determined, which is a good sign.** ADR-0005 §5 independently
  requires that "portfolio totals, counts, averages and rankings are computed **after** scope
  filtering, in the same query path. A total is never computed globally and then filtered for
  display." Inputs-in makes that structural: there is no global set within reach of the aggregation.
  The architectural rule and the security rule want the same shape.
- **The `ai-intelligence` case is the one that makes AC-6 testable.** "Revoke a permission, and the
  fact disappears from the answer because the retrieval genuinely could not see it" (ADR-0004 §3) is
  only true if the port was bound before the model ran. Any design where the assistant fetches for
  itself creates a second authorization implementation, and `SECURITY_MODEL.md` §6 records which
  direction that drifts: over-exposure.
- **The `data-quality` case is about change amplification.** Eleven imports would mean every new fact
  domain edits a context that has nothing to do with it.
- **One pattern, three applications.** A single named pattern is easier to police than three local
  exceptions, and it removes the "just this once" precedent.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Promote `portfolio` to tier 4 so it may read down** | Simplest. Makes a grouping-and-membership context depend on health and trajectory, inverting what it is *for*, and re-opens computing a global total then filtering it — the exact leak ADR-0005 §5 forbids. |
| **A new `portfolio-analytics` context at tier 4** | Architecturally clean and adds a twentieth context whose only responsibility is to be allowed to import. Ceremony without a boundary. |
| **Aggregate in the Application layer directly** | Attractive, and puts MET-PORT-001…008 outside any owning context — `PRODUCT_SPEC.md` §8.2's definition of a defect ("a metric computed in a React component, chart config, or SQL view outside the owning context"). The pure function keeps ownership where the catalog puts it. |
| **Let `data-quality` import all fact contexts** | Legal under the tier rules. Rejected on change amplification, not on legality. |
| **Give the assistant a service account with its own read path** | Rejected outright by ADR-0004 §Alternatives: "creates a second authorization implementation that will drift from the first. The drift direction is over-exposure." |
| **Relax rule 1 so `ai-intelligence` may import the Application layer** | Would make the assistant the only domain context with an upward dependency, and would put a domain context inside the trust boundary it is supposed to sit outside. |

## Consequences

**Positive**
- No dependency rule is weakened, and no exemption precedent is set.
- Portfolio aggregates cannot be computed over an unauthorised set — there is no set in reach.
- AC-6 becomes a genuine test rather than an assertion about intent.
- Adding a fact domain does not edit `data-quality`.

**Negative / accepted costs**
- The Application layer carries real orchestration logic and must itself be well tested.
- Port and input types are additional contracts to maintain and version.
- Reading `portfolio` in isolation no longer shows where its inputs come from — the orchestrator must
  be read alongside it. Mitigated by the manifest's `why` field and the note in the public surface.

**Neutral but notable**
- This is ordinary dependency inversion. It is recorded as an ADR not for novelty but because it is
  the answer to three conflicts a later phase would otherwise resolve by weakening a rule.

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | No context added or removed. `portfolio`, `data-quality`, `ai-intelligence` gain ports; their allow-lists stay minimal |
| Data model / persistence | None |
| Formulas or metrics | MET-PORT-001…008 and MET-DQ-001…006 stay owned by their catalog contexts |
| Security model | Strengthens ADR-0005 §5 and §7; makes REQ-SEC-010 structural |
| Brand / design tokens | None |
| Requirements affected | REQ-PORT-003, REQ-DQ-001, REQ-AI-001, REQ-SEC-010, AC-6 |
| Tests that must change | Phase 5 `tests/authz`: aggregates exclude out-of-scope entities. Phase 11: two users, same question, different answers |

## Migration implications

None — no domain code exists. **Order matters:** the ports must be defined before Phase 7 builds the
Command Center, or aggregation will be written against whatever is reachable at the time.

## Rollback path

Each inversion is independently reversible while the contexts are stubs. After Phase 7 the
`portfolio` inversion is structural. The `ai-intelligence` inversion should not be rolled back at
all: ADR-0004 §Rollback path already states the AI boundary "could be relaxed only by a superseding
ADR that explains how numeric correctness is otherwise guaranteed — a burden no alternative has met."

**Reconsider if:** the orchestration in the Application layer grows to the point where it is doing
domain reasoning rather than composition. That would be a signal a context is missing, not that the
inversion is wrong.

## Verification

- Architecture gate: `portfolio.mayDependOn` and `data-quality.mayDependOn` contain no tier-2+ context
  (`ARCH-003`).
- Architecture gate: `ai-intelligence` imports no context and no application module (`ARCH-004`,
  `ARCH-001`) — 8 negative tests today.
- Phase 5 `tests/authz`: a portfolio aggregate for a scoped user excludes out-of-scope projects
  (REQ-PORT-003).
- Phase 11: the same question asked by two users with different scopes yields different answers, each
  citing only authorised records (AC-6).
- Phase 4: `aggregate()` is pure — same inputs, same output, no I/O.

## Open questions

- Whether the probe registry is static (declared at composition) or dynamic — Phase 4, an
  implementation detail within this decision.
- DQ-3 (assistant retrieval strategy) is Phase 11 and is constrained by this ADR: whatever is chosen
  is reached through the port.
