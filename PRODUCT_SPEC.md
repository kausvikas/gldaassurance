# PRODUCT_SPEC.md — GlobalLogic Delivery Intelligence

**Status:** Approved baseline (Phase 0)
**Version:** 1.0.0
**Applies to:** Fixed-Bid Portfolio Command Center POC
**Classification:** Internal — DEMO / SYNTHETIC DATA

This document is the authoritative statement of *what* Delivery Intelligence is, *who* it serves,
*what it must do*, and *what it must never do*. Later phases implement against the requirement IDs
in §7. No phase may reinterpret this document; deviations require an ADR.

---

## 1. North Star

> **"Will this project deliver the contracted scope, by the committed date, within the economics we
> sold — and if not, how early can we detect deterioration, how much value is at risk, why is it
> happening, and what intervention can change the outcome?"**

### 1.1 The differentiator

Conventional delivery reporting tells you a project is Red **after** it is Red. Delivery
Intelligence exists to identify **Green projects that are moving toward Amber/Red while
intervention can still change the outcome**.

Everything in this product is subordinate to that claim. A feature that does not help detect,
explain, quantify, or act on *deterioration in trajectory* is a secondary feature.

### 1.2 The four questions, in order

| # | Question | Product answer |
| --- | --- | --- |
| 1 | **Is it deteriorating?** | Trajectory and deterioration signals, not just current RAG |
| 2 | **How much is at risk?** | Value at Risk in currency, not an abstract score |
| 3 | **Why?** | Evidence chain from the score down to the observed facts that moved it |
| 4 | **What do I do?** | A named, owned, time-boxed intervention with an expected effect |

A screen that answers 1 without 2, 3 and 4 is incomplete.

### 1.3 Explicit non-goals

Delivery Intelligence is **not** a PSA/ERP replacement, not a timesheet system, not a system of
record for contracts or invoices, not a resource-scheduling tool, and not a project management
tool. It is a **read-mostly intelligence layer** over facts owned elsewhere, plus a thin
system-of-record for *its own* judgements (overrides, interventions, acknowledgements).

---

## 2. Primary users and the decision each one makes

| Persona | Decision they make with this product | Time budget | Primary surface |
| --- | --- | --- | --- |
| **CDO / Delivery Executive** | Where do I spend my intervention capacity this week? | 30 seconds to a shortlist | Portfolio Command Center |
| **Portfolio / Account Director** | Which of my accounts is quietly deteriorating, and what do I raise with the client? | 5 minutes | Portfolio + Project Executive Health |
| **Delivery Manager / Program Director** | Is my reported status defensible, and what is the earliest corrective action? | 10 minutes | Project Executive Health, Forward Risk |
| **Finance / Commercial Controller** | Is forecast margin real, and does it reconcile? | 15 minutes | Margin Intelligence |
| **CTO / Engineering Leadership** | Are quality and engineering signals leading indicators of the economics? | 10 minutes | Project Executive Health |
| **CISO / Assurance** | Who saw what, who changed what, and can I prove it? | On demand | Audit + Assurance |

**Design consequence:** the CDO's 30-second path is the constraint that governs the Portfolio
Command Center. If a design decision helps another persona but costs the CDO seconds, the CDO wins.

---

## 3. Governing product decisions (binding)

These are product law for this build. Each is recorded as, or referenced by, an ADR.

### 3.1 Three baselines, never conflated

| Baseline | Definition | Mutability |
| --- | --- | --- |
| **Original As-Sold Baseline** | Scope, schedule, price, cost and margin at contract signature | **Immutable.** Never recomputed, never restated, never "corrected" |
| **Current Contractual Baseline** | As-Sold plus **only** formally approved and executed contract changes | Changes only by an executed change record, append-only |
| **Current Forecast** | Best current estimate of outturn | Changes freely; always versioned and dated |

Rules:

- Variance is always stated **against a named baseline**. A variance with no named baseline is a
  defect.
- **Pending or unexecuted change requests may never inflate base Forecast Revenue.** They are
  reported separately as *Unsecured Upside*, always visually and structurally distinct.
- Restating the As-Sold Baseline is prohibited. If a demo scenario appears to require it, that is a
  scenario defect, not a product requirement.

### 3.2 Three layers, never conflated

| Layer | Contents | Trust | May change without notice? |
| --- | --- | --- | --- |
| **L1 — Observed Fact** | What was recorded: hours booked, invoices raised, defects logged, milestones dated, CRs executed | Highest | No — facts are append-only with corrections recorded as corrections |
| **L2 — Deterministic Derived Metric** | Anything computed by a versioned, testable formula from L1 (EAC, margin, CPI, health score) | High, reproducible | Only via a versioned formula change |
| **L3 — Inferred Intelligence** | Trajectory forecasts, similarity-based warnings, narrative explanations, recommendations | Advisory | Yes |

Rules:

- Every value displayed in the UI must be attributable to exactly one layer and must be visually
  distinguishable as such.
- **L3 may never overwrite, silently adjust, or substitute for L1 or L2.**
- An L3 output must cite the L1/L2 evidence it rests on, or it may not be shown.

### 3.3 Health is not one number, and RAG is not one value

Three RAG values coexist and are **always stored and displayed separately**:

| Value | Source | Purpose |
| --- | --- | --- |
| **Reported RAG** | What the delivery team declared | The organisation's stated position |
| **System-Assessed RAG** | Deterministic rules over L2 metrics | The evidence's position |
| **Manual Override RAG** | An authorised human decision | The accountable position |

- The **divergence** between Reported and System-Assessed is itself a first-class signal
  (see `METRIC_CATALOG.md` → `MET-HLTH-030 Status Divergence`). It is arguably the single most
  valuable signal in the product.
- Any override requires an actor, a timestamp, a reason, and an expiry. Overrides are audited and
  never silent.
- **Health ≠ Trajectory.** A Green project with a steep negative trajectory outranks a stable Amber
  project for executive attention.

### 3.4 Data Confidence is separate from Project Health

A project may be *confidently Red* or *unreliably Green*. These are different failures and are
never blended into one score.

- `Data Confidence` is computed from completeness, freshness, consistency and source coverage.
- Low confidence **suppresses claims, not the project.** A low-confidence project is escalated as a
  *reporting failure*, not hidden.
- No screen may show a health score without its confidence qualifier.

### 3.5 Determinism and decimal safety

- All money is stored and computed as fixed-scale decimal, never binary floating point, and never
  computed in the browser as the system of record. See ADR-0002.
- Every currency amount carries an explicit currency code. Cross-currency aggregation requires an
  explicit, dated FX rate recorded with the result.
- Given the same inputs and the same rule version, every derived metric must produce an identical
  result. Reproducibility is a tested property, not an aspiration.

### 3.6 Rules are versioned, explainable, and external to the UI

- Health rules, RAG thresholds, and risk rules live in the **Rules** context with a version
  identifier stamped onto every result.
- Every rule firing produces a human-readable explanation naming the inputs, thresholds and
  contribution.
- Changing a threshold is a data/config change with an audit record, not a code edit buried in a
  component.

### 3.7 AI boundary

- The assistant may **read** L1/L2 facts through authorised, audited services and **explain,
  summarise, compare and narrate** them.
- The assistant **may not** compute official economics or official health, may not perform
  arithmetic that is presented as authoritative, and may not access data the requesting user is not
  authorised to see.
- Every assistant answer must be traceable to the specific records used. An answer with no
  provenance may not be rendered.
- The assistant is never the system of record. See ADR-0004.

### 3.8 Time is a first-class dimension

- History is **append-only, snapshot-oriented**. Prior states are never overwritten.
- The system supports "as of" queries: what did we believe on a given date?
- Trajectory requires history; therefore snapshotting is a Phase 2/3 foundation, not a later feature.

### 3.9 Demo integrity

- Every screen, export, and API response in the POC carries a `DEMO — SYNTHETIC DATA` marker.
- No real client names, real employee names, or real financial figures enter this repository.

---

## 4. Scope of the POC

### 4.1 In scope

- Fixed-bid engagements as the primary commercial model (T&M and capacity models modelled but not
  optimised for).
- A synthetic portfolio of accounts, programs, and projects with 18 months of weekly history.
- Deterministic financial engine: revenue, cost, EAC/ETC, margin, variance.
- Deterministic delivery/quality/resource metric engine.
- Versioned health scoring, RAG assessment, and trajectory/deterioration detection.
- Server-side authorization, scoping, audit, and data-quality assessment.
- Six executive surfaces: Portfolio Command Center, Project Executive Health, Margin Intelligence,
  Forward Risk & Recovery, Assurance/Audit view, AI Assistant.

### 4.2 Out of scope for the POC (deferred, not forgotten)

| Item | Why deferred | Where recorded |
| --- | --- | --- |
| Live integrations to PSA/ERP/Jira/HRIS | Integration context is defined with adapter seams only | `PHASE_HANDOFF.md` debt register |
| Multi-tenant isolation at infrastructure level | Single-tenant POC; logical scoping enforced | `SECURITY_MODEL.md` §9 |
| SSO/SCIM provisioning | Local identity with role fixtures | `SECURITY_MODEL.md` §3 |
| Model fine-tuning / ML forecasting | Phase 11 uses deterministic rules + LLM narration only | ADR-0004 |
| Mobile-native applications | Responsive web only | — |
| Write-back to source systems | Read-mostly by design | §1.3 |

### 4.3 Bounded contexts (see ADR-0001)

`Identity` · `Organization` · `Portfolio` · `Project` · `Contract` · `Financial` · `Delivery` ·
`Commercial` · `Quality` · `Resource` · `Risk` · `Assurance` · `Recovery` · `Health` · `Forecast` ·
`Rules` · `Data Quality` · `Integration` · `AI Intelligence`

---

## 5. The six executive surfaces

Each is built in its own phase and must reuse — never reimplement — domain services.

| Surface | Phase | The one job |
| --- | --- | --- |
| **Portfolio Command Center** | 7 | In 30 seconds: which projects need intervention this week, ranked by value at risk × deterioration × intervenability |
| **Project Executive Health** | 8 | Defend or challenge a project's status with an evidence chain from score to fact |
| **Margin Intelligence** | 9 | Explain the delta between as-sold margin and forecast margin, decomposed to causes that reconcile to the total |
| **Forward Risk & Recovery** | 10 | Convert early warnings into owned, time-boxed interventions and track whether they worked |
| **Assurance & Audit** | 5 (foundation) | Prove who saw what, who changed what, and under which rule version |
| **AI Assistant** | 11 | Answer portfolio questions in natural language, grounded and authorised, with citations |

---

## 6. Product-level acceptance criteria (the POC is not credible without these)

| ID | Criterion |
| --- | --- |
| **AC-1** | A CDO can go from portfolio load to a specific named project needing intervention in under 30 seconds and under 3 interactions. |
| **AC-2** | At least one demo project is **Reported Green** while **System-Assessed Amber/Red**, and the product explains the divergence with evidence. |
| **AC-3** | Every headline number can be drilled to the L1 facts that produced it, in ≤3 steps, without leaving the product. |
| **AC-4** | Margin decomposition reconciles: the sum of the named causes equals the total margin delta, to the cent. |
| **AC-5** | Two users with different roles on the same project receive materially different, server-enforced data — verified by test, not by UI inspection. |
| **AC-6** | Every AI answer displays its sources; removing a source's authorization removes it from the answer. |
| **AC-7** | Re-running the metric engine on identical inputs produces byte-identical outputs. |
| **AC-8** | Every screen is legible and compliant in the GlobalLogic palette, with no colour-only status encoding. |

---

## 7. Requirement register

Requirement IDs are stable. Later phases cite them in traceability reports. **Do not renumber.**

Legend — **Layer:** L1 fact / L2 derived / L3 inferred / — n/a.
**Verify:** `unit`, `golden` (fixed input→output fixture), `integration`, `authz` (negative-path
test), `manual` (documented demo script), `a11y`.

### 7.1 Governance & foundations (Phase 0–1)

| ID | Requirement | Phase | Layer | Verify |
| --- | --- | --- | --- | --- |
| REQ-GOV-001 | Authoritative spec, ADR, metric, security, brand, data, test and handoff artifacts exist and are cross-referenced | 0 | — | manual |
| REQ-GOV-002 | ADR process defined with template, states, and precedence order | 0 | — | manual |
| REQ-GOV-003 | Completion semantics (implemented/mocked/stubbed/deferred/tested) defined and binding | 0 | — | manual |
| REQ-GOV-004 | Requirement-to-implementation traceability template exists and is mandatory per phase | 0 | — | manual |
| REQ-GOV-005 | Bounded contexts defined with dependency rules; violations are detectable | 1 | — | integration |
| REQ-GOV-006 | Modular monolith structure enforced by build/lint boundaries, not convention alone | 1 | — | integration |
| REQ-GOV-007 | Every phase ends with an updated `PHASE_HANDOFF.md` and debt register | 0–12 | — | manual |

### 7.2 Canonical model & data (Phase 2–3)

| ID | Requirement | Phase | Layer | Verify |
| --- | --- | --- | --- | --- |
| REQ-DATA-001 | Canonical entities for account, portfolio, program, project, contract, baseline, change record, period, actual, forecast, risk, defect, milestone, resource assignment | 2 | L1 | unit |
| REQ-DATA-002 | Three baselines modelled as distinct, non-substitutable structures | 2 | L1 | unit |
| REQ-DATA-003 | As-Sold baseline is immutable at the persistence layer (writes rejected, not merely discouraged) | 2 | L1 | integration |
| REQ-DATA-004 | Executed vs pending change records are structurally distinct; pending cannot enter base forecast revenue | 2 | L1/L2 | golden |
| REQ-DATA-005 | Append-only weekly snapshots enable "as of" reconstruction of any prior state | 2 | L1 | integration |
| REQ-DATA-006 | Every monetary value carries currency; FX conversion is explicit and dated | 2 | L1/L2 | golden |
| REQ-DATA-007 | Synthetic portfolio is generated from a fixed seed and is byte-reproducible | 3 | L1 | golden |
| REQ-DATA-008 | Synthetic portfolio contains every scenario archetype in `SYNTHETIC_DATA_SPEC.md` | 3 | L1 | integration |
| REQ-DATA-009 | No real client, person, or financial data anywhere in the repository | 0–12 | — | integration |
| REQ-DATA-010 | Lineage: every derived value records its inputs, rule version, and computation timestamp | 2 | L2 | integration |

### 7.3 Financial & commercial (Phase 4, 9)

| ID | Requirement | Phase | Layer | Verify |
| --- | --- | --- | --- | --- |
| REQ-FIN-001 | Decimal-safe money type used throughout the domain; float money is impossible by construction | 4 | L2 | unit |
| REQ-FIN-002 | Revenue recognition, cost-to-date, ETC, EAC computed per `METRIC_CATALOG.md` | 4 | L2 | golden |
| REQ-FIN-003 | Margin computed for As-Sold, Current Contractual, Forecast, and Actual-to-Date | 4 | L2 | golden |
| REQ-FIN-004 | Margin variance decomposition sums exactly to total variance (zero residual, or a named residual line) | 9 | L2 | golden |
| REQ-FIN-005 | Unsecured upside (pending CRs) reported separately and never in base forecast | 4 | L2 | golden |
| REQ-FIN-006 | EVM measures (PV, EV, AC, CPI, SPI, VAC) computed and explainable | 4 | L2 | golden |
| REQ-FIN-007 | Value at Risk computed per project and aggregated to portfolio without double counting | 4 | L2 | golden |
| REQ-FIN-008 | All aggregations are associative and order-independent (tested) | 4 | L2 | unit |
| REQ-FIN-009 | Rounding policy is single, explicit, and applied at presentation only | 4 | L2 | unit |

### 7.4 Health, trajectory & rules (Phase 4, 8)

| ID | Requirement | Phase | Layer | Verify |
| --- | --- | --- | --- | --- |
| REQ-HLTH-001 | Composite health score computed from weighted, versioned dimension scores | 4 | L2 | golden |
| REQ-HLTH-002 | Reported, System-Assessed and Override RAG stored and surfaced separately | 4 | L2 | golden |
| REQ-HLTH-003 | Status divergence detected, quantified and ranked | 4 | L2 | golden |
| REQ-HLTH-004 | Trajectory computed over history; deterioration detected before threshold breach | 4 | L2 | golden |
| REQ-HLTH-005 | Every health result carries rule version and per-dimension contribution | 4 | L2 | golden |
| REQ-HLTH-006 | Every rule firing yields a human-readable explanation citing inputs and thresholds | 4 | L2 | golden |
| REQ-HLTH-007 | Overrides require actor, reason, timestamp and expiry; are audited; never silent | 5 | L1 | authz |
| REQ-HLTH-008 | Health scores are never computed in the UI layer | 4–12 | L2 | integration |

### 7.5 Data quality & confidence (Phase 4–5)

| ID | Requirement | Phase | Layer | Verify |
| --- | --- | --- | --- | --- |
| REQ-DQ-001 | Data confidence computed from completeness, freshness, consistency, source coverage | 4 | L2 | golden |
| REQ-DQ-002 | Confidence is displayed with, and never merged into, health | 7–10 | L2 | manual |
| REQ-DQ-003 | Low confidence escalates as a reporting failure with a named owner | 7 | L2 | manual |
| REQ-DQ-004 | Stale data is detectable and dated on every surface | 7–10 | L1 | integration |

### 7.6 Security, authorization & audit (Phase 5)

| ID | Requirement | Phase | Layer | Verify |
| --- | --- | --- | --- | --- |
| REQ-SEC-001 | Authentication with session management and explicit expiry | 5 | — | integration |
| REQ-SEC-002 | Role- and scope-based authorization enforced server-side on every read and write | 5 | — | authz |
| REQ-SEC-003 | Row-level scoping: users see only entities within their organisational scope | 5 | — | authz |
| REQ-SEC-004 | Field-level redaction: commercial fields (margin, rates, cost) gated by permission | 5 | — | authz |
| REQ-SEC-005 | Deny-by-default: an unmapped route or field is inaccessible | 5 | — | authz |
| REQ-SEC-006 | Immutable audit log for every read of sensitive commercial data and every write | 5 | L1 | integration |
| REQ-SEC-007 | Audit records are queryable by actor, entity, and time window | 5 | L1 | integration |
| REQ-SEC-008 | No secret material in the repository; configuration is externalised | 0–12 | — | integration |
| REQ-SEC-009 | Trust boundaries documented and enforced; the browser is untrusted | 5 | — | manual |
| REQ-SEC-010 | AI assistant queries execute under the requesting user's authorization context | 11 | — | authz |

### 7.7 Design system & accessibility (Phase 6)

| ID | Requirement | Phase | Layer | Verify |
| --- | --- | --- | --- | --- |
| REQ-UX-001 | Single tokenised design system; no ad-hoc colour or spacing values in components | 6 | — | integration |
| REQ-UX-002 | Status is never encoded by colour alone (icon + text always present) | 6–10 | — | a11y |
| REQ-UX-003 | Text and UI contrast meet WCAG 2.2 AA per `BRAND_DESIGN_SYSTEM.md` constraints | 6–10 | — | a11y |
| REQ-UX-004 | L1/L2/L3 provenance is visually distinguishable on every surface | 6–11 | — | manual |
| REQ-UX-005 | `DEMO — SYNTHETIC DATA` marker present on every screen and export | 6–12 | — | integration |
| REQ-UX-006 | Keyboard navigable; focus visible; charts have accessible text alternatives | 6–10 | — | a11y |

### 7.8 Executive surfaces (Phase 7–10)

| ID | Requirement | Phase | Layer | Verify |
| --- | --- | --- | --- | --- |
| REQ-PORT-001 | Portfolio ranked by intervention priority, not alphabetically or by size | 7 | L2 | golden |
| REQ-PORT-002 | "Deteriorating Greens" surfaced as a first-class portfolio view | 7 | L2 | manual |
| REQ-PORT-003 | Portfolio value at risk aggregates without double counting | 7 | L2 | golden |
| REQ-PORT-004 | 30-second path from load to named project verified by documented demo script | 7 | — | manual |
| REQ-PROJ-001 | Project health page shows score, per-dimension contribution, and rule version | 8 | L2 | manual |
| REQ-PROJ-002 | Evidence chain: every dimension drills to the L1 facts behind it | 8 | L1/L2 | integration |
| REQ-PROJ-003 | Reported vs System-Assessed divergence explained in narrative and evidence | 8 | L2 | manual |
| REQ-MRGN-001 | As-sold → forecast margin bridge with named, reconciling causes | 9 | L2 | golden |
| REQ-MRGN-002 | Erosion drivers ranked by currency impact | 9 | L2 | golden |
| REQ-MRGN-003 | Unsecured upside shown separately and excluded from committed margin | 9 | L2 | golden |
| REQ-RISK-001 | Forward risk register with exposure, proximity, and trend | 10 | L2 | golden |
| REQ-RISK-002 | Early-warning signals convert to proposed interventions with expected effect | 10 | L3 | manual |
| REQ-RISK-003 | Interventions have owner, due date, and status; outcome is tracked | 10 | L1 | integration |
| REQ-RISK-004 | Recovery mode tracks a Red project against a recovery plan baseline | 10 | L2 | manual |

### 7.9 AI assistant (Phase 11)

| ID | Requirement | Phase | Layer | Verify |
| --- | --- | --- | --- | --- |
| REQ-AI-001 | Assistant answers only from authorised, retrieved facts; no free-form recall of portfolio data | 11 | L3 | integration |
| REQ-AI-002 | Every answer cites the records it used; citations are clickable to the source view | 11 | L3 | manual |
| REQ-AI-003 | Assistant never performs authoritative arithmetic; numbers come from domain services | 11 | L3 | integration |
| REQ-AI-004 | Prompt-injection resistance: untrusted content cannot alter authorization or instructions | 11 | — | integration |
| REQ-AI-005 | All assistant interactions are audited with user, query, retrieved scope, and answer | 11 | L1 | integration |
| REQ-AI-006 | Assistant declines rather than speculates when evidence is insufficient | 11 | L3 | manual |

### 7.10 Release gate (Phase 12)

| ID | Requirement | Phase | Layer | Verify |
| --- | --- | --- | --- | --- |
| REQ-OPS-001 | Full requirement-to-implementation traceability report with no unexplained gaps | 12 | — | manual |
| REQ-OPS-002 | Adversarial security review attempts scope escape, field leakage, and injection | 12 | — | authz |
| REQ-OPS-003 | Demo script executes end-to-end reproducibly from a clean environment | 12 | — | manual |
| REQ-OPS-004 | Debt register is complete, owned, and honest about what is mocked | 12 | — | manual |

---

## 8. Anti-requirements (things that are defects, not features)

1. A number on screen with no defined metric ID.
2. A metric computed in a React component, chart config, or SQL view outside the owning context.
3. A health or margin figure produced by the LLM.
4. Authorization implemented by conditionally rendering UI.
5. A pending CR counted as forecast revenue.
6. A restated As-Sold baseline.
7. A blended "health and confidence" score.
8. A status shown in colour only.
9. A phase report claiming "complete" for a mocked or unlabeled placeholder.
10. A chart whose colours are chosen per-screen rather than from the design system.

---

## 9. Open questions for the sponsor (do not resolve by inference)

| # | Question | Assumed answer for POC | Impact if wrong |
| --- | --- | --- | --- |
| OQ-1 | Reporting currency for portfolio aggregation | Single reporting currency (USD) with dated FX for others | Medium — FX policy in `Financial` |
| OQ-2 | Revenue recognition method for fixed-bid | Percent-complete by cost incurred (cost-to-cost) | High — changes `MET-FIN-*` |
| OQ-3 | Are cost rates visible to Delivery Managers? | No — commercial fields gated to Commercial/Finance/Executive roles | Medium — authorization matrix |
| OQ-4 | Health weighting owner | Rules context, config-driven, sponsor-approved defaults | Medium — health calibration |
| OQ-5 | Fiscal calendar | Calendar quarters | Low |

These are recorded, not silently assumed. Phase 2 must confirm or escalate each.
