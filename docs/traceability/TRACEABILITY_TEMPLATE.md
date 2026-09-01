# Requirement Traceability Report — Phase <n>: <name>

- **Phase:** <n>
- **Date:** YYYY-MM-DD
- **Author:** <role>
- **Requirements in scope:** <list of REQ IDs from `PRODUCT_SPEC.md` §7 assigned to this phase>
- **Artifacts consumed:** <files read at phase start>

> Copy this file to `docs/traceability/PHASE-<n>-TRACEABILITY.md`. Every requirement scoped to this
> phase appears exactly once. **Omission is not an option** — if something was not done, it gets a
> state (`DEFERRED`, `BLOCKED`, `NOT_STARTED`), a reason, and a target phase
> (`DEFINITION_OF_DONE.md` §2).

---

## 1. Requirement coverage

States: `IMPLEMENTED` · `IMPLEMENTED_WITH_DEBT` · `MOCKED` · `STUBBED` · `DEFERRED` · `BLOCKED` ·
`NOT_STARTED`

| REQ ID | Requirement (short) | State | Evidence (`file:line`) | Verification | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-… | … | IMPLEMENTED | `src/contexts/…/x.ts:42` | golden | ✅ `tests/golden/x.test.ts` | — |
| REQ-… | … | MOCKED | `src/…/y.ts:10` | — | — | Labelled in UI; debt DR-00n |
| REQ-… | … | BLOCKED | — | — | — | Blocked by OQ-2 |

**Evidence must be a file reference or a test name.** "Implemented in the financial module" is not
evidence.

### 1.1 Coverage summary

| State | Count |
| --- | --- |
| IMPLEMENTED | |
| IMPLEMENTED_WITH_DEBT | |
| MOCKED | |
| STUBBED | |
| DEFERRED | |
| BLOCKED | |
| NOT_STARTED | |
| **Total in scope** | |

---

## 2. Metric traceability (Phases 2, 4, 7–10)

| Metric ID | Catalog version | Owner context | Implementation | Golden fixture | Fixture derived independently? | Rule version |
| --- | --- | --- | --- | --- | --- | --- |
| MET-… | 1.0.0 | `financial` | `src/…` | `tests/golden/…` | Yes / No | `HEALTH-v1` |

> A "No" in the independence column means the fixture proves only self-consistency
> (`DEFINITION_OF_DONE.md` §3.1). Explain why, or fix it.

---

## 3. Tests run

| Suite | Run | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| unit | | | | |
| golden | | | | |
| integration | | | | |
| authz | | | | |
| architecture | | | | |
| a11y | | | | |

**Failures — list every one individually:**

| Test | Cause | Disposition |
| --- | --- | --- |

**Skipped tests — list every one and why.** A skipped test is a silent gap.

---

## 4. Invariant compliance

| # | Invariant | Held? | Evidence / exception |
| --- | --- | --- | --- |
| 3 | No silent change to formulas, metrics, boundaries, security, brand, RAG, scenarios | | |
| 5 | No false completion claims | | |
| 6 | Decimal-safe, server-side financial computation | | |
| 7 | Server-side authorization only | | |
| 8 | L1/L2/L3 separation intact | | |
| 9 | AI is not calculator or system of record | | |
| 10 | Modular monolith with strict contexts | | |
| 11 | `DEMO — SYNTHETIC DATA` labelling present | | |

---

## 5. Proposed deviations / ADRs

| ADR | Title | Status | Rationale | Impact | Rollback |
| --- | --- | --- | --- | --- | --- |

> An ADR is not approved because the file exists. It is approved when surfaced here and accepted
> (`ARCHITECTURE_DECISIONS.md` §3.5). **"None" is a valid and frequently correct entry.**

---

## 6. Conflicts encountered

| Artifacts in conflict | Nature of conflict | Precedence rule applied | Resolution |
| --- | --- | --- | --- |

> Conflicts are reported, not invented away. If precedence did not resolve it, the area stays
> unimplemented and is escalated.

---

## 7. Debt register delta

| ID | Item | State | Owner | Target phase | Risk if unaddressed |
| --- | --- | --- | --- | --- | --- |
| DR-… | | MOCKED / STUBBED / DEFERRED | | | |

---

## 8. Open questions

| ID | Question | Status | What it blocks | Owner |
| --- | --- | --- | --- | --- |
| OQ-… / MC-… / DQ-… | | Open / Resolved | | |

Restate every still-open question from prior phases. Dropping one silently is a governance failure.

---

## 9. Handoff

- **What now exists:**
- **What Phase <n+1> consumes:**
- **What Phase <n+1> must NOT assume:**
- **`PHASE_HANDOFF.md` updated:** yes / no

---

## 10. Self-review

Answer honestly. These are the questions the Phase 12 gate will ask.

- [ ] Is any `IMPLEMENTED` claim resting on a UI that merely looks right?
- [ ] Is any golden fixture's expected value generated from the implementation it tests?
- [ ] Is any authorization claim verified only through the UI?
- [ ] Did any formula, threshold, or scenario change without an ADR?
- [ ] Is any mock unlabelled?
- [ ] **If a claim in this report is wrong, would we find out now — or in front of the client?**
