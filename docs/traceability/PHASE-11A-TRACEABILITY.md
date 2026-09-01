# Traceability Report — Phase 11A (AI Architecture, Trust Contract & Threat Model)

- **Phase:** 11A — **architecture only. No assistant implementation exists.**
- **Date:** 2026-09-01
- **Author:** Chief Enterprise Architect · Enterprise AI Architect · AI Security Lead · Delivery
  Intelligence Product Architect · Delivery Economics SME · Independent Model-Governance Reviewer
- **Disposition:** **PASS WITH CONTROLLED DEBT**
- **Artifacts consumed:** `PRODUCT_SPEC.md`, `ARCHITECTURE_DECISIONS.md`, `METRIC_CATALOG.md`,
  `SECURITY_MODEL.md`, `BRAND_DESIGN_SYSTEM.md`, `SYNTHETIC_DATA_SPEC.md`, `TEST_STRATEGY.md`,
  `PHASE_HANDOFF.md`, `PHASE_0_10_SEMANTIC_CLOSURE.md`, ADR-0001…0028, Phase 7–10 traceability,
  `PRE-PHASE-11-REMEDIATION.md`, `PRE-PHASE-11-CLOSURE-TRACEABILITY.md`,
  `docs/SECURITY_DEBT_REGISTER.md`
- **Code inspected:** `src/app/gateway.ts`, `src/app/authorization/{enforcement,field-policy}.ts`,
  `src/app/dto/provenance-dto.ts`, `src/app/api/*`, `src/app/{portfolio,project,margin,risk,lineage,metrics}/*`,
  `src/platform/{authz,audit,provenance,explainability,config}/*`,
  `src/contexts/ai-intelligence/index.ts`, `src/contexts/portfolio/internal/portfolio-value-at-risk.ts`,
  `architecture/manifest.json`

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## 1. Entry condition — stated precisely, because it does not cleanly hold

Phase 11A's entry condition is: *read the final Pre-Phase-11 Semantic Red-Team report; proceed only if
its disposition is `GO` or `CONDITIONAL GO`.*

**No artifact in this repository bears that name or carries that disposition string.** Reporting a
`GO` would therefore be a fabrication. What exists:

| Artifact | What it is | Disposition it actually states |
| --- | --- | --- |
| `PHASE_0_10_SEMANTIC_CLOSURE.md` | The seventh and final semantic pass, 2026-09-01 | *"certified for controlled synthetic POC use"* |
| `PRE-PHASE-11-REMEDIATION.md` | Red-team remediation + two addenda | Records two prior gate returns of **NO-GO**, both since remediated (ADR-0026, ADR-0027) |
| `PRE-PHASE-11-CLOSURE-TRACEABILITY.md` | The architectural closure pass | *"COMPLETE WITH DEBT"* |

**Assessment against the substantive condition** — *"no unresolved S3/S4/S5 issue capable of producing
a materially incorrect authoritative AI answer"*:

| Severity | Open? | Evidence |
| --- | --- | --- |
| **S5** | None | No open item can produce catastrophic loss; no write path exists |
| **S4** | **None open.** Four were found and closed in sequence: C-20/ADR-0023, C-22/ADR-0024, DR-068/ADR-0027, Quality-S4/ADR-0028 | `PHASE_HANDOFF.md` §3b: *"Category A — semantic defect — is now empty"* |
| **S3** | None unresolved. S3-1/S3-2 closed by ADR-0026 | Remediation addendum 1 |

**Verified independently in this session, not taken from the documents:** `npx vitest run` →
**1241 passed / 0 failed / 0 skipped, 36 files**. `src/contexts/portfolio/internal/portfolio-value-at-risk.ts`
was read and implements ADR-0023 (additive, distinct projects counted once), not the withdrawn
ADR-0021 de-duplication.

**Disposition taken: CONDITIONAL GO — only non-blocking controlled debt found.** Recorded as an
inference from the closure certificate, not as a quotation from a report that does not exist. **The
missing artifact is itself a finding** — see §6.

---

## 2. Requirement-to-architecture traceability

Phase 11A produces architecture, so each requirement traces to a **design decision and its enforcing
control**, not to code. Nothing below is claimed as implemented.

| Req | Statement | Architecture that satisfies it | Enforcing control (to be built in 11B) | State |
| --- | --- | --- | --- | --- |
| **REQ-AI-001** | Answers only from authorised, retrieved facts; no free-form recall | ADR-0029 closed tool allowlist; each tool ⇒ one `ViewId`; no free-text retrieval | Build control: every allowlist entry maps to a `GET` route in `VIEW_ROUTES` | **DESIGNED** |
| **REQ-AI-002** | Every answer cites the records it used | `MaterialClaim.groundedBy` non-empty or the claim is rejected; envelope with empty `sources` fails construction (ADR-0031 D-6) | Validator #10 + construction assertion | **DESIGNED** |
| **REQ-AI-003** | Never performs authoritative arithmetic | Model receives `ClaimEnvelope`s, never operand pairs; emits `ValueReference`, never digits (ADR-0004 §4) | Validator #1, #2 | **DESIGNED** |
| **REQ-AI-004** | Prompt-injection resistance | Authorization completes before the model runs; retrieved content is `untrusted: true` data; validator is the backstop | `AI_THREAT_MODEL.md` T-AI-01/02; benchmark E-10/E-11 | **DESIGNED — E-11 untestable until DR-073** |
| **REQ-AI-005** | All interactions audited with user, query, scope, answer | `ASSISTANT_QUERY` record, `AI_ASSISTANT_ARCHITECTURE.md` §9 | Audit assertion per interaction | **DESIGNED** |
| **REQ-AI-006** | Declines rather than speculates | Three typed decline reasons; a correct decline scores as a **pass** (`AI_EVALUATION_STRATEGY.md` §5) | Benchmark E-09, E-12 | **DESIGNED** |
| **REQ-SEC-010** | Queries execute under the requesting user's authorization context | `EnforcementPoint.authorise()` on every tool; `AuthorisedRequest` unforgeable | Existing 272 authz tests, extended per tool | **DESIGNED — foundation IMPLEMENTED** |
| **AC-6** | Removing a source's authorization removes it from the answer | Field shaping `OMIT`s before claim construction, so the field never reaches the model | Benchmark E-08, per classification | **DESIGNED** |
| **AC-3** | ≤3 steps to L1 facts | `evidence.get` over the existing `project.lineage` view | Benchmark E-14 | **DESIGNED** |

**Deviation from REQ-AI-002 as literally worded.** The requirement says citations are *"clickable to
the source view"*. There is no client runtime (**DR-044**, ADR-0020), so a citation is a declared
drill-through target exactly as the Phase 7 command centre's links are. **This is stated, not
silently satisfied.**

---

## 3. What was decided, and what it changed

| Decision | ADR | Changes what | Number moved? |
| --- | --- | --- | --- |
| Typed read-only tool allowlist replaces free-text retrieval | **ADR-0029** (Proposed) | `AuthorisedRetrievalPort` in the `ai-intelligence` stub; adds one `ViewId` (`metric.definition`); **resolves DQ-3** | No |
| Governed hybrid generation; deterministic blocking validator | **ADR-0030** (Proposed) | `AssistantAnswer` production path | No |
| Uniform claim envelope with conservative defaults | **ADR-0031** (Proposed) | Application-boundary DTO assembly; **delivery mechanism for DR-059, DR-062, DR-064** | No |

**No metric, threshold, weight, band edge, formula or synthetic fact was changed in this phase.**
RED 47 / AMBER 27 / GREEN 1 and VaR $90.80M are untouched. Content hash `514e835b…` unchanged.
Test count unchanged at 1241 — **Phase 11A added no tests, because it added no code.**

### Candidate tool names changed on semantic grounds

The phase brief supplied candidate names and said not to implement them blindly. Three were changed:

| Candidate | Decision | Why |
| --- | --- | --- |
| `getReportedGreenRisk` + `getSystemEmergingRisk` | Kept as **two** tools | ADR-0018 computes them independently; collapsing them produces "Green-at-Risk" with no subject — already open as DR-052 |
| `getMarginDrivers` | Merged with coverage into **one** tool | DR-062 is Category B. A consumer able to fetch causes without `MET-FIN-041` will quote the waterfall as the explanation — the exact hole the closure pass shut |
| `getForecastConfidence` | Renamed `project.lateDetection.get` | No calibrated confidence exists anywhere (DR-061). The candidate name would have been a naming lie |

`audit.events` was **excluded** from the allowlist: `ASSURANCE_AUDITOR` holds both `audit.read` and
`assistant.use`, and routing `SECURITY_TELEMETRY` into prose widens the deliberately narrow grant of
ADR-0016 C-14 into a medium where classification cannot be re-checked.

---

## 4. Semantic constraints carried into the assistant contract

Each is an existing governed decision restated as an assistant obligation with a mechanical detection.
Full text: `AI_TRUST_CONTRACT.md` §5.

| Constraint | Authority | Detection |
| --- | --- | --- |
| VaR additive; shared cause is concentration, never duplicate money | ADR-0023 | Banned-phrasing set + no cross-project subtraction; benchmark E-16 |
| Earned/physical completion is the effort baseline; slippage ≠ efficiency | ADR-0024 | E-16 |
| Reconciliation ≠ explanatory completeness; residual ≠ recovery opportunity | DR-062, DR-058 | Coverage inseparable from causes (tool 7); validator #7, #9; E-04, E-05 |
| Five RAG concepts stay distinct; Reported never overwritten | ADR-0018, `bandProvenance` | Validator #4; E-02 |
| Warnings are rule firings, not probabilities | ADR-0026 | Validator #8 — probability lexicon banned outright; E-12 |
| No bare authoritative "0% late detection" | DR-059 | CS-1; E-13 |
| Calibration is synthetic and unvalidated everywhere | DR-054/055/061, MC-2/3/6 | CS-2; `calibrationStatus` default |
| No fabricated warning persistence | DR-063 | Persistence lexicon banned; E-16 |
| Seniority split not resolved in the assistant | DR-064 | CS-12 + `limitations[]` lookup; E-16 |
| Recovery's five rungs never substituted | Phase 10, closure §2 | Validator #9; E-06 |

---

## 5. Exit-gate checklist

| Gate item | Verdict |
| --- | --- |
| Authorization-before-retrieval unambiguous? | **Yes.** `AI_ASSISTANT_ARCHITECTURE.md` §4, steps 1–14. Scope resolves at step 6, the model runs at step 11, and there is no channel back |
| Official calculation ownership unambiguous? | **Yes.** Domain engines own every figure. The model receives envelopes, never operands, and emits `ValueReference`s, never digits |
| Claim validation unambiguous? | **Yes.** ADR-0030: deterministic, blocking, ten detections, no bypass, no regeneration loop |
| Read/write boundary unambiguous? | **Yes.** Zero write tools, enforced three ways. DR-060 remains a deliberate boundary |
| Epistemic status unambiguous? | **Yes.** L1–L3 claimable, L4 not representable as a claim layer; ADR-0031 envelope with conservative defaults |
| **Overall** | **PASS WITH CONTROLLED DEBT** |

---

## 6. Findings raised by this phase

### F-1 — The entry-gate artifact does not exist (process, not product)

No file carries the name or disposition the entry condition names. The disposition was **inferred**
from `PHASE_0_10_SEMANTIC_CLOSURE.md`. The inference is sound and the evidence is strong, but a gate
whose input must be inferred is not a gate. **Recommendation:** either issue the report with an
explicit disposition line, or amend the entry condition to name the closure certificate.

### F-2 — Four documents asserted a withdrawn ADR as current — **corrected in this phase**

ADR-0021 is superseded by ADR-0023 and the **implementation is correct**. Four documentation sites
still described the withdrawn de-duplication as live:

| Location | Was | Now |
| --- | --- | --- |
| `PHASE_HANDOFF.md` §2 item 13 | *"`MET-PORT-003` de-duplicates shared root causes … removing $38.93M"* | Corrected to ADR-0023: additive, $90.80M, concentration non-additive |
| `PHASE_HANDOFF.md` §4, C-20 row | *"RESOLVED — ADR-0021 (Accepted)"* | Corrected to ADR-0023, with the withdrawal struck through |
| `PHASE_HANDOFF.md` §3 debt table, DR-048 | Open, `PHASE_9_BLOCKER` | **Closed** by ADR-0023 — it contradicted §3b in the same document |
| `docs/SECURITY_DEBT_REGISTER.md` DR-048 | Open, with a closure-evidence plan for work that must not happen | Closed, with the reason |
| `docs/DEMO_SCRIPT_PHASE_7.md:117` | *"the de-duplication rule is under-determined and unimplemented"* | Corrected |

**Severity: S3, and it pointed directly at Phase 11.** §2 is the *"what Phase 11 must NOT assume"*
list — the one document the next phase reads as binding. An assistant built to item 13 as written
would have told an executive the portfolio figure nets shared causes, re-committing the exact
$38.93M error ADR-0023 closed. **The code was never wrong; the instruction to the next phase was.**

Three source comments still reference ADR-0021 in stale terms (`aggregation.ts:46`,
`command-center.ts:88`, `command-center-adapter.ts:186`). They are comments beside correct code,
carried as documentation debt rather than corrected in an architecture-only phase.

### F-3 — The handoff's open-debt count was stale by five

§3 said **38 open** while its own table listed **43**. Written at Phase 7 closure and never updated
as DR-056…DR-071 were opened. Corrected to **44** (43 − DR-048 + DR-072 + DR-073).

### F-4 — Two new debt items opened

| ID | Item | Class | Gate |
| --- | --- | --- | --- |
| **DR-072** | Validator lexicons hand-written and incomplete; **selection bias undetectable by any control here** | B — unsupported claim strength | `ACCEPTED_DEBT` |
| **DR-073** | No prompt-injection corpus in the synthetic data; T-AI-02 rests on reasoning, not evidence | E — unverified | `PHASE_11_BLOCKER` — blocks the *claim*, not the work |

**DR-072's second clause is the more serious half.** Every control in this architecture governs the
claims the assistant *makes*; none governs the claims it *omits*. An answer that leaves out the most
material true fact passes every check. This is the same failure the margin demo committed by
rendering three high-coverage scenarios while the median sits at 45.5% — **and no control in this
phase would have caught it.**

---

## 7. Self-review

- [x] **Was a parallel architecture designed where one existed?** No. Every seam is an existing one:
      `ApplicationGateway`, `EnforcementPoint`, `shape()`, `ProvenanceDto`, `SignalState`,
      `ValueReference`, `assistant.use`, the `assistant` rate-limit bucket, `ASSISTANT_QUERY`. Three
      things changed, each through an ADR.
- [x] **Did any number move?** No. No metric, threshold, weight, band edge, formula or fact was
      touched. Verified: 1241 tests pass, unchanged.
- [x] **Was a candidate tool name adopted without checking its semantics?** No — three were changed
      and one was excluded, each with the governed reason (§3).
- [x] **Does any deliverable claim something is implemented?** No. Every document carries an explicit
      "nothing here has been executed" section. The stub is described as an 81-line stub.
- [x] **Was the entry gate reported honestly?** Yes. The named artifact does not exist; that is stated
      as F-1 rather than resolved by asserting a `GO`.
- [x] **Could this architecture still produce a materially wrong answer?** **Yes — by omission.**
      DR-072. Stated rather than designed around.
- [x] **Is the read/write boundary genuinely closed, or merely asserted?** Enforced three ways, two of
      them type-level. But **all three are Phase 11B build controls that do not yet exist.** Today the
      boundary holds because there is no assistant at all.
- [x] **Was any correction made to make a prior phase look better?** No. F-2's corrections make the
      record *worse* — they add an S3 that shipped through the closure pass. The struck-through
      original text is retained in every case.
