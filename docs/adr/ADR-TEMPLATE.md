# ADR-NNNN — <Short imperative title>

- **Status:** Proposed | Accepted | Superseded by ADR-NNNN | Deprecated | Rejected
- **Date proposed:** YYYY-MM-DD
- **Date accepted:** YYYY-MM-DD
- **Approver:** <role/name>
- **Phase:** <phase in which this arose>
- **Affects:** <bounded contexts / documents / requirement IDs>
- **Supersedes:** <ADR-NNNN or —>

---

## Context

What forces made this decision necessary? State the problem, the constraints, and what is *already
true* (existing ADRs, spec clauses, requirement IDs). Someone reading this in six months with no
memory of the discussion should understand the pressure without being told the answer.

## Decision

State the decision in the active voice, as a rule that can be checked. "We will …" / "X must …".
Be specific enough that a reviewer can tell whether code complies.

## Rationale

Why this, and not the alternatives. Tie it back to the product north star, the invariants, or a
requirement ID. Avoid taste arguments; name the property you are buying (determinism, auditability,
30-second path, blast radius, testability).

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| … | … |

Reject alternatives honestly. An ADR with one strawman alternative is not a decision record.

## Consequences

**Positive**
- …

**Negative / accepted costs**
- …

**Neutral but notable**
- …

## Impact

| Dimension | Impact |
| --- | --- |
| Bounded contexts | … |
| Data model / persistence | … |
| Formulas or metrics (`METRIC_CATALOG.md`) | … |
| Security model | … |
| Brand / design tokens | … |
| Requirements affected | REQ-… |
| Tests that must change | … |

## Migration implications

What must change in code, data, or docs if this is accepted after implementation has begun?
State the order of operations. If "none — greenfield", say so explicitly.

## Rollback path

How do we undo this if it proves wrong? What is the trigger that would make us reconsider?
An ADR with no rollback path must say why reversal is impossible and what that costs.

## Verification

How will a reviewer confirm the codebase actually complies? Name the test, lint rule, boundary
check, or manual inspection step.

## Open questions

Anything deliberately left undecided, and who must decide it by when.
