# DEFINITION_OF_DONE.md — Completion Contract

**Status:** Approved baseline (Phase 0) — binding on every phase
**Version:** 1.0.0
**Authority:** No phase may claim completion in terms other than these.

---

## 1. Why this document exists

The most expensive failure available to this build is not a bug. It is a **false completion** — a
phase report that says "implemented" about something that is a mock, a placeholder, a chart with no
engine behind it, or a formula nobody tested. False completions compound silently: Phase 9 builds a
margin bridge on a Phase 4 engine that was "complete" but untested, and the defect surfaces in front
of the client.

This document removes the ambiguity that makes false completion possible. After this, "done" is not
a judgement call.

---

## 2. Completion vocabulary (mandatory, exact)

Every requirement in every phase report is reported in **exactly one** of these states.

### `IMPLEMENTED`

Real logic, wired end to end, exercised by the required tests, meeting the requirement's acceptance
criteria.

**All must hold:**
- Functionality works through the real code path — not a fixture, not a branch that returns a
  constant.
- Required verification (per `PRODUCT_SPEC.md` §7 "Verify" column) exists and **passes**.
- No `TODO` or `FIXME` in the primary path.
- Cited by ID in the traceability report with a file reference.

### `IMPLEMENTED_WITH_DEBT`

Working and tested, but with a named, recorded compromise (performance, coverage gap, hard-coded
config that belongs elsewhere).

**Requires:** the debt named, an owner, and a target phase. Untracked debt is not this state — it is
`IMPLEMENTED` falsely claimed.

### `MOCKED`

A stand-in returning canned data so downstream work can proceed.

**Requires:** visible labelling in the UI where user-facing; a code marker; and an entry in the debt
register. **An unlabelled mock is a defect, not a state** (global invariant 5).

### `STUBBED`

The interface exists; the behaviour does not. Compiles, satisfies types, returns nothing meaningful.

**Requires:** explicit `STUB` marker and a register entry. Never counted toward phase progress.

### `DEFERRED`

Deliberately not built in this phase.

**Requires:** the reason, the phase it moves to, and confirmation that nothing in this phase depends
on it. "We ran out of time" is an acceptable reason when stated plainly. Silence is not.

### `BLOCKED`

Cannot proceed pending a decision or dependency.

**Requires:** what is blocking, who must unblock it, and what was done in the meantime. Open
questions (`PRODUCT_SPEC.md` §9, `METRIC_CATALOG.md` §12) are the most likely sources.

### `NOT_STARTED`

Scheduled for a later phase. No action needed.

---

## 3. What "tested" means

| Verification | Satisfied by |
| --- | --- |
| `unit` | Isolated tests over the unit's real logic, including boundary and error cases |
| `golden` | **Fixed input → expected output fixture, committed.** For financial and health metrics, expected values are asserted **exactly** (ADR-0002), and the fixture is reviewed by a human, not generated from the implementation |
| `integration` | Exercises the real path across ≥2 layers, against a real database |
| `authz` | **Negative** test: asserts absence/denial in the API payload, never in rendered UI (ADR-0005) |
| `a11y` | Automated contrast/semantics check plus a documented manual keyboard pass |
| `manual` | A written, repeatable script with expected observations — not "we looked at it" |

### 3.1 The golden-test rule that matters most

> **A golden fixture's expected values must be derived independently of the implementation.**

Generating expected output by running the code and pasting the result proves only that the code is
consistent with itself. For every financial and health metric, the expected value is computed from
`METRIC_CATALOG.md` by hand (or by an independent calculation) and reviewed. This is the single
control that prevents a wrong formula from being blessed as correct for eleven phases.

---

## 4. Definition of Done — every phase

A phase is complete when **all** of the following hold. Any "no" means the phase is not done.

### 4.1 Substance
- [ ] Every in-scope requirement is reported in exactly one §2 state.
- [ ] Every `IMPLEMENTED` claim has passing verification of the type §7 demands.
- [ ] No requirement is claimed `IMPLEMENTED` on the strength of a UI that looks right.
- [ ] Nothing in scope is silently missing — absence is a state, not an omission.

### 4.2 Invariants
- [ ] No formula, metric, boundary, security assumption, brand token, RAG rule, or scenario changed
      without an accepted ADR.
- [ ] No money computed in floating point; none authoritative in the browser (ADR-0002).
- [ ] No authorization implemented by UI hiding (ADR-0005).
- [ ] L1/L2/L3 separation intact; no L3 value overwriting L1/L2 (ADR-0004).
- [ ] `DEMO — SYNTHETIC DATA` present on every screen and export.
- [ ] No real client, personal, or financial data introduced.

### 4.3 Traceability
- [ ] Traceability report produced from `docs/traceability/TRACEABILITY_TEMPLATE.md`, citing
      requirement IDs and file references.
- [ ] Tests run listed with results — pass **and** fail counts, not a summary adjective.
- [ ] Debt register updated: mocks, stubs, deferrals, known gaps, each with an owner and target
      phase.
- [ ] Any conflict found between artifacts is reported, not resolved by invention.

### 4.4 Handoff
- [ ] `PHASE_HANDOFF.md` updated: what exists, what the next phase consumes, what is decided, what
      remains open.
- [ ] Proposed deviations surfaced explicitly in the phase report (an ADR file alone is not
      approval).
- [ ] Open questions still open are restated, not quietly dropped.

---

## 5. Phase report template

```markdown
# PHASE <n> REPORT — <name>

## 1. Summary
What was built, in three sentences. What a reviewer should look at first.

## 2. Requirement traceability
| REQ ID | State | Evidence (file:line / test) | Verification | Notes |

## 3. Tests
| Suite | Run | Passed | Failed | Skipped |
Failures listed individually with cause and disposition.

## 4. Proposed deviations / new ADRs
| ADR | Title | Status | Why it was needed |
(Empty is a valid and often the best answer.)

## 5. Debt register delta
| Item | State | Owner | Target phase | Risk if unaddressed |

## 6. Conflicts found
Artifacts that disagreed, and which precedence rule was applied. Not resolved by inference.

## 7. Open questions
Restated, with what is blocked by each.

## 8. Handoff
What Phase <n+1> consumes, and what it must not assume.
```

---

## 6. Prohibited completion claims

Each of these has been the cause of a POC failing its final review. All are forbidden.

1. "Complete" for a mocked service without the mock labelled and registered.
2. "Complete" for a chart rendering hard-coded data.
3. "Complete" for a metric with no golden test, or with a golden fixture generated from the
   implementation.
4. "Complete" for an authorization rule verified only by looking at the UI.
5. "Complete" for a screen that renders but whose actions do nothing.
6. "Tests pass" where tests were skipped, excluded, or weakened to pass.
7. "Complete" for a requirement whose acceptance criterion was reinterpreted downward.
8. A summary adjective ("mostly working", "essentially complete") in place of a state.
9. Silent omission of an in-scope requirement from the traceability table.
10. Claiming a deviation was approved because an ADR file exists — approval requires it to be
    surfaced in the phase report.

---

## 7. The reviewer's question

Every phase report will be read against a single question:

> **"If this claim is wrong, when would we find out — now, or in front of the client?"**

Any state that defers discovery to the demo is the wrong state. Say `MOCKED`. Say `BLOCKED`. Both are
recoverable; a false `IMPLEMENTED` is not.
