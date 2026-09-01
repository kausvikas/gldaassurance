# TEST_STRATEGY.md — Verification Strategy

**Status:** Approved baseline (Phase 0)
**Version:** 1.0.0
**Companion:** `DEFINITION_OF_DONE.md` defines *what counts as tested*; this defines *how we test*.

---

## 1. What we are actually verifying

Ordinary test strategies optimise for defect detection. This one optimises for **defensibility** —
the ability to answer, in front of a controller or a CISO, "how do you know?"

Three claims must survive interrogation:

1. **The numbers are right and reproducible.** (`golden`, property tests)
2. **Nobody sees what they shouldn't.** (`authz` negative tests)
3. **The architecture is what we say it is.** (boundary tests)

Everything else is ordinary engineering hygiene and is treated as such.

---

## 2. Test taxonomy

| Suite | Location | Purpose | Speed |
| --- | --- | --- | --- |
| **Unit** | `tests/unit` | Isolated logic, boundaries, error states | ms |
| **Golden** | `tests/golden` | Fixed input → exact expected output for every metric | ms |
| **Property** | `tests/unit` | Invariants over generated inputs (associativity, monotonicity) | ms–s |
| **Integration** | `tests/integration` | Real path across layers, real database | s |
| **Architecture** | `tests/integration` | Boundary, layering, cycle enforcement | s |
| **Authorization** | `tests/authz` | Negative tests per role × scope × field | s |
| **Accessibility** | co-located | Contrast, semantics, keyboard | s |
| **Manual scripts** | `docs/demo/` | Reproducible demo and 30-second-path verification | — |

Shape: broad unit/golden base, meaningful integration layer, **no end-to-end UI automation in the
POC** (deferred debt — recorded, not pretended away).

---

## 3. Golden tests — the centre of gravity

Every metric in `METRIC_CATALOG.md` gets a golden fixture before it is called `IMPLEMENTED`.

### 3.1 Fixture rules

1. **Expected values derived independently of the implementation** — computed by hand from the
   catalog definition, or by an independent calculation, and human-reviewed. Never pasted from a
   run (`DEFINITION_OF_DONE.md` §3.1).
2. **Exact assertion.** Money and percentages compared as exact decimal strings, not approximately
   (ADR-0002). `toBeCloseTo` on a monetary value is a defect.
3. **Fixtures are committed data files**, human-readable, with the metric ID and the catalog version
   they were computed against.
4. **Rule version pinned.** A fixture asserting an L2 value names the rule version. A rule version
   bump requires the fixtures to be revisited deliberately — that friction is the control.
5. **Edge cases mandatory**, not optional: zero denominator (`NOT_COMPUTABLE`), zero contract value,
   negative margin, single-period project, project with no history, mixed currency, and — for every
   metric with a baseline — one fixture per baseline.

### 3.2 The reconciliation fixtures (AC-4)

The margin bridge (`MET-FIN-018`) gets dedicated fixtures asserting that the decomposed causes sum
**exactly** to `MET-FIN-017`, with zero unexplained residual, including a case where largest-
remainder allocation is required to make rounded parts sum to a rounded whole.

This is the test that protects the product's most fragile credibility claim.

### 3.3 Property tests

| Property | Metric family |
| --- | --- |
| Aggregation is order-independent and associative | All portfolio aggregates (REQ-FIN-008) |
| Same inputs + same rule version → identical output | All L2 (AC-7) |
| Weighted portfolio margin ≠ mean of project margins, and equals the weighted definition | `MET-PORT-002` |
| Value at risk never exceeds contract value | `MET-FIN-019`, `MET-PORT-003` |
| Health score bounded 0–100; monotonic in each dimension | `MET-HLTH-010` |
| Pending CRs never alter forecast revenue | `MET-FIN-010` vs `MET-FIN-011` (REQ-FIN-005) |

---

## 4. Authorization tests (`tests/authz`)

**Structurally different from other suites: these assert absence.**

Generated as a matrix — every role × every scope × every sensitive field — so adding a role or a
`COMMERCIAL_CONFIDENTIAL` field automatically produces new required cases. A field added without a
classification fails the suite. That is deliberate: it makes under-classification loud.

Mandatory assertions (`SECURITY_MODEL.md` §10):

1. Unauthorised field is **absent from the API payload** — asserted on the response body, never on
   the DOM (AC-5).
2. Out-of-scope entity by id returns the not-found response.
3. Aggregates exclude out-of-scope entities (REQ-PORT-003).
4. Unmapped route / undeclared field denied (REQ-SEC-005).
5. Sensitive read and denied read both emit audit records (REQ-SEC-006).
6. Audit table rejects `UPDATE`/`DELETE`.
7. Assistant answers contain no out-of-scope facts (REQ-SEC-010, AC-6).

---

## 5. Architecture tests

Automated enforcement of ADR-0001, because a boundary maintained by convention is a boundary that is
already broken somewhere nobody has looked:

- No import crosses a context boundary except through its public surface.
- No upward dependency (Domain → Application → Presentation).
- No cycles.
- `AI Intelligence` imports no domain context.
- No cross-schema foreign keys.
- No `Money` arithmetic via operators; no `parseFloat`/`Number()` on amount fields in domain code.
- No `Date.now()`/`new Date()` without argument in domain code (ADR-0003 §5).
- No hex colour literals in components (REQ-UX-001).

These run in CI and fail the build. They are cheap, they never flake, and they are the only thing
standing between the architecture and eleven phases of deadline pressure.

---

## 6. Data-quality and generator tests

- Generator reproducibility: same seed → identical content hash (REQ-DATA-007).
- Every archetype in `SYNTHETIC_DATA_SPEC.md` §5 present and findable (REQ-DATA-008).
- Cross-domain reconciliation assertions hold (G3).
- Snapshot series long enough for trajectory computation.
- No real-world name matches; every record carries `synthetic: true`.

Generator validation **fails the build**, not a warning — a demo built on incoherent data is worse
than no demo.

---

## 7. Accessibility testing

- Automated contrast checks against the token pairings in `BRAND_DESIGN_SYSTEM.md` §2.1 — the
  measured constraints are encoded as assertions, so an orange-on-light-steel label fails CI rather
  than a review.
- No status conveyed by colour alone: every status element asserts an icon and a text label
  (REQ-UX-002).
- Keyboard traversal and visible focus, per surface.
- Charts have text alternatives and data tables.
- `prefers-reduced-motion` honoured.

---

## 8. Per-phase testing obligations

| Phase | Must deliver |
| --- | --- |
| 1 | Architecture/boundary suite (§5) — **before** domain code exists |
| 2 | Canonical model unit tests; As-Sold immutability rejection test; as-of reconstruction test; provenance envelope type tests |
| 3 | Generator reproducibility + archetype + reconciliation tests (§6) |
| 4 | **Full golden suite for every implemented metric** + property tests (§3). The phase gate. |
| 5 | Full `tests/authz` matrix (§4) + audit integrity tests |
| 6 | Accessibility suite + token-usage lint (§7) |
| 7–10 | Surface integration tests; ranking golden tests; documented manual demo scripts |
| 11 | Assistant grounding, citation, injection-resistance, and scope-inheritance tests |
| 12 | Full suite green + adversarial security review + clean-environment demo run |

---

## 9. CI gates

The build fails on any of: failing test, architecture violation, accessibility violation, secret
detected, generator validation failure, unreviewed golden fixture change.

**Golden fixture changes require explicit review.** A pull request that modifies an expected value
is either a formula change (needs an ADR and a version bump) or a bug being papered over. There is
no third case, and CI should force someone to say which it is.

---

## 10. What we are deliberately not testing in the POC

Recorded honestly rather than omitted (`DEFINITION_OF_DONE.md` §2 `DEFERRED`):

| Not tested | Why | Risk accepted |
| --- | --- | --- |
| End-to-end browser automation | Cost vs POC value; manual demo scripts cover the paths | UI regressions found manually |
| Load / performance at scale | POC data volumes are small | Unknown behaviour at production scale |
| Cross-browser matrix | Demo runs on a known browser | Rendering differences elsewhere |
| Chaos / failure injection | Single-process POC | Resilience unproven |
| Penetration testing | Requires external engagement | Residual vulnerabilities unknown (`SECURITY_MODEL.md` §9) |
| Localisation | English-only POC | i18n unproven |
