# METRIC_CATALOG.md — Authoritative Metric & Formula Definitions

**Status:** Phase 2 — definitions populated. **Not yet fully `Frozen`;** see §14.
**Version:** 2.0.0
**Classification:** Internal — DEMO / SYNTHETIC DATA

> ⚠️ **This file is generated from the metric registry at**
> `src/contexts/rules/internal/registry/`. **Do not edit it by hand** — an edit here
> that is not mirrored in the registry fails `tests/integration/metric-catalog.test.ts`.
> Regenerate with `npm run catalog:generate`.

---

## 1. Catalog governance

### 1.1 The rules that make this file work

1. **Every number displayed anywhere in the product has a metric ID from this catalog.** A number on a screen with no ID is a defect (`PRODUCT_SPEC.md` §8.1).
2. **One definition, one implementation, one owner context.** Enforced by `validateRegistry()`, which fails on a duplicate ID or a duplicate formula-and-input pair.
3. **Formulas change only by version bump + a recorded reason.** §13 is the change log; it is asserted non-empty by test.
4. **Every metric declares its epistemic level and its authoritative source.** `L1_OBSERVED` / `L2_DERIVED` / `L3_ASSESSED` describes what kind of claim the value is, not whether its implementation is deterministic (ADR-0004, ADR-0011). A metric may not be registered without both.
10. **Delivery Intelligence is authoritative only for `DERIVED` and `RULE_ENGINE` values.** Everything else is consumed from the system that owns it — most importantly, Recognised Revenue is a Finance/ERP accounting fact, never a Delivery Intelligence calculation (Phase 2 closure, Decision 1).
5. **Every quotient declares its zero-denominator behaviour.** `NOT_COMPUTABLE` is a first-class result state, distinct from zero and from null. Never `NaN`, never `Infinity`, never a silent dash.
6. **Every variance names its baseline** (As-Sold / Current Contractual / Forecast / Recovery). A variance without a named baseline is a defect (ADR-0003).
7. **Every monetary metric carries a currency** and, if converted, the FX rate and rate date (ADR-0002).
8. **Aggregate metrics are computed over the caller's authorised entity set** (ADR-0005 §5).
9. **Rounding is presentation-only**, half-up, with largest-remainder allocation where parts must sum to a whole (ADR-0002 §5).

### 1.2 Metric ID scheme

`MET-<DOMAIN>-<NNN>` — domains: `FIN` financial · `COM` commercial · `DEL` delivery & earned value · `QUA` quality & engineering · `RES` resource & people · `RSK` risk · `HLTH` health & rag · `FCST` forecast & trajectory · `DQ` data quality & confidence · `PORT` portfolio aggregates.

**IDs are permanent.** A retired metric keeps its ID and is marked `Retired`. Never reuse.

### 1.3 Status lifecycle

| Status | Meaning |
| --- | --- |
| `Draft` | Definition may still change; blocked on an open question |
| `Frozen` | Confirmed; changes require a version bump and a recorded reason |
| `Implemented` | Frozen and covered by passing golden tests (Phase 4) |
| `Retired` | No longer computed; ID retained, superseding metric named |

### 1.4 Notation

`AS` = Original As-Sold Baseline · `CC` = Current Contractual Baseline · `FC` = Current Forecast · `ATD` = Actual to Date · `t` = as-of date.

### 1.5 Summary

| | Count |
| --- | --- |
| Metrics defined | **162** |
| `Frozen` | 159 |
| `Draft` (blocked — see §14) | 3 |
| L1_OBSERVED | 18 |
| L2_DERIVED | 116 |
| L3_ASSESSED | 28 |

| Authoritative source | Count |
| --- | --- |
| CONTRACT_SYSTEM | 3 |
| DELIVERY_SYSTEM | 1 |
| DERIVED | 116 |
| FINANCE_SYSTEM | 8 |
| MANUAL_DECLARATION | 3 |
| QUALITY_SYSTEM | 3 |
| RULE_ENGINE | 28 |

---

## 2. Index

| ID | Metric | Epistemic level | Authoritative source | Unit | Owner context | Status |
| --- | --- | --- | --- | --- | --- | --- |
| MET-FIN-001 | Contract Value (As-Sold) | L1_OBSERVED | CONTRACT_SYSTEM | Money | `financial` | `Frozen` |
| MET-FIN-002 | Contractual Revenue (Current Contractual) | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-003 | Budgeted Cost (As-Sold) | L1_OBSERVED | CONTRACT_SYSTEM | Money | `financial` | `Frozen` |
| MET-FIN-004 | Budgeted Cost (Current Contractual) | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-005 | Cost to Date (ATD) | L1_OBSERVED | FINANCE_SYSTEM | Money | `financial` | `Frozen` |
| MET-FIN-006 | Cost Progress Ratio (cost-to-cost) | L2_DERIVED | DERIVED | Ratio | `financial` | `Frozen` |
| MET-FIN-007 | Estimate to Complete (ETC, bottom-up) | L1_OBSERVED | MANUAL_DECLARATION | Money | `financial` | `Frozen` |
| MET-FIN-023 | Committed Future Cost | L1_OBSERVED | FINANCE_SYSTEM | Money | `financial` | `Frozen` |
| MET-FIN-008 | Estimate at Completion — Cost (EAC) | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-009 | Recognised Revenue (cumulative to date) | L1_OBSERVED | FINANCE_SYSTEM | Money | `financial` | `Frozen` |
| MET-FIN-039 | Recognised Revenue (period) | L1_OBSERVED | FINANCE_SYSTEM | Money | `financial` | `Frozen` |
| MET-FIN-010 | Forecast Revenue (base) | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-011 | Unsecured Upside | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-026 | Sold GM $ | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-024 | Forecast GM $ | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-012 | Gross Margin — As-Sold | L2_DERIVED | DERIVED | Percent | `financial` | `Frozen` |
| MET-FIN-013 | Gross Margin — Current Contractual | L2_DERIVED | DERIVED | Percent | `financial` | `Frozen` |
| MET-FIN-014 | Gross Margin — Forecast | L2_DERIVED | DERIVED | Percent | `financial` | `Frozen` |
| MET-FIN-015 | Gross Margin — Actual to Date | L2_DERIVED | DERIVED | Percent | `financial` | `Frozen` |
| MET-FIN-016 | Margin Erosion (pp) | L2_DERIVED | DERIVED | PercentagePoints | `financial` | `Frozen` |
| MET-FIN-017 | Margin Value Delta | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-025 | GM Erosion $ | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-018 | Margin Bridge Decomposition | L2_DERIVED | DERIVED | MoneyBreakdown | `financial` | `Frozen` |
| MET-FIN-028 | Cost Consumed % | L2_DERIVED | DERIVED | Percent | `financial` | `Frozen` |
| MET-FIN-027 | Burn Gap | L2_DERIVED | DERIVED | PercentagePoints | `financial` | `Frozen` |
| MET-FIN-029 | Performance-Implied EAC | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-042 | GM Value at Risk Ratio | L2_DERIVED | DERIVED | Ratio | `financial` | `Frozen` |
| MET-FIN-043 | EAC Increase Ratio | L2_DERIVED | DERIVED | Ratio | `financial` | `Frozen` |
| MET-FIN-040 | ETC Optimism Ratio | L2_DERIVED | DERIVED | Ratio | `financial` | `Frozen` |
| MET-FIN-041 | Attributed Movement Coverage | L2_DERIVED | DERIVED | Ratio | `financial` | `Frozen` |
| MET-FIN-030 | ETC Optimism Gap | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-031 | Risk-Adjusted Revenue | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-032 | Risk-Adjusted GM $ | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-033 | Risk-Adjusted GM % | L2_DERIVED | DERIVED | Percent | `financial` | `Frozen` |
| MET-FIN-019 | GM Value at Risk | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-036 | Contingency Budget | L1_OBSERVED | CONTRACT_SYSTEM | Money | `financial` | `Frozen` |
| MET-FIN-037 | Contingency Consumed | L1_OBSERVED | FINANCE_SYSTEM | Money | `financial` | `Frozen` |
| MET-FIN-035 | Contingency Consumed % | L2_DERIVED | DERIVED | Percent | `financial` | `Frozen` |
| MET-FIN-034 | Contingency Burn Gap | L2_DERIVED | DERIVED | PercentagePoints | `financial` | `Frozen` |
| MET-FIN-020 | Burn Rate | L2_DERIVED | DERIVED | Money/period | `financial` | `Frozen` |
| MET-FIN-021 | Budget Runway | L2_DERIVED | DERIVED | Periods | `financial` | `Frozen` |
| MET-FIN-022 | Cost Variance to Baseline | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-FIN-038 | FX Margin Impact | L2_DERIVED | DERIVED | Money | `financial` | `Frozen` |
| MET-COM-001 | Invoiced to Date | L1_OBSERVED | FINANCE_SYSTEM | Money | `commercial` | `Frozen` |
| MET-COM-002 | Collected to Date | L1_OBSERVED | FINANCE_SYSTEM | Money | `commercial` | `Frozen` |
| MET-COM-003 | Receivables Outstanding | L2_DERIVED | DERIVED | Money | `commercial` | `Frozen` |
| MET-COM-004 | Days Sales Outstanding | L2_DERIVED | DERIVED | Days | `commercial` | `Frozen` |
| MET-COM-005 | Aged Receivables > 60d | L2_DERIVED | DERIVED | Money | `commercial` | `Frozen` |
| MET-COM-006 | Unbilled Revenue | L2_DERIVED | DERIVED | Money | `commercial` | `Frozen` |
| MET-COM-007 | Pending CR Ageing | L2_DERIVED | DERIVED | Days | `commercial` | `Frozen` |
| MET-COM-008 | Scope Change Ratio | L2_DERIVED | DERIVED | Percent | `commercial` | `Frozen` |
| MET-COM-009 | Uncompensated Scope Ratio | L2_DERIVED | DERIVED | Percent | `commercial` | `Frozen` |
| MET-RES-011 | Resource Cost Drift Ratio | L2_DERIVED | DERIVED | Ratio | `resource` | `Frozen` |
| MET-COM-011 | Liquidated Damages Exposure Ratio | L2_DERIVED | DERIVED | Percent | `commercial` | `Frozen` |
| MET-COM-010 | Expected Pending CR Recovery | L2_DERIVED | DERIVED | Money | `commercial` | `Frozen` |
| MET-DEL-016 | Actual Physical Completion | L1_OBSERVED | MANUAL_DECLARATION | Percent | `delivery` | `Frozen` |
| MET-DEL-017 | Planned Physical Completion | L2_DERIVED | DERIVED | Percent | `delivery` | `Frozen` |
| MET-DEL-015 | Progress Variance | L2_DERIVED | DERIVED | PercentagePoints | `delivery` | `Frozen` |
| MET-DEL-019 | Demonstrated Velocity | L2_DERIVED | DERIVED | Percent | `delivery` | `Frozen` |
| MET-DEL-020 | Required Future Velocity | L2_DERIVED | DERIVED | Percent | `delivery` | `Frozen` |
| MET-DEL-018 | Required Velocity Ratio | L2_DERIVED | DERIVED | Ratio | `delivery` | `Frozen` |
| MET-DEL-021 | Required Productivity Improvement % | L2_DERIVED | DERIVED | Percent | `delivery` | `Frozen` |
| MET-DEL-001 | Planned Value (PV) | L2_DERIVED | DERIVED | Money | `delivery` | `Frozen` |
| MET-DEL-002 | Earned Value (EV) | L2_DERIVED | DERIVED | Money | `delivery` | `Frozen` |
| MET-DEL-003 | Actual Cost (AC) | L1_OBSERVED | FINANCE_SYSTEM | Money | `delivery` | `Frozen` |
| MET-DEL-004 | Cost Performance Index (CPI) | L2_DERIVED | DERIVED | Index | `delivery` | `Frozen` |
| MET-DEL-005 | Schedule Performance Index (SPI) | L2_DERIVED | DERIVED | Index | `delivery` | `Frozen` |
| MET-DEL-006 | Cost Variance (EVM) | L2_DERIVED | DERIVED | Money | `delivery` | `Frozen` |
| MET-DEL-007 | Schedule Variance (EVM) | L2_DERIVED | DERIVED | Money | `delivery` | `Frozen` |
| MET-DEL-008 | Variance at Completion (VAC) | L2_DERIVED | DERIVED | Money | `delivery` | `Frozen` |
| MET-DEL-009 | Milestone Slippage | L2_DERIVED | DERIVED | Days | `delivery` | `Frozen` |
| MET-DEL-010 | Milestones At Risk | L2_DERIVED | DERIVED | Count | `delivery` | `Frozen` |
| MET-DEL-011 | Schedule Variance (calendar) | L2_DERIVED | DERIVED | Days | `delivery` | `Frozen` |
| MET-DEL-012 | Scope Completion | L2_DERIVED | DERIVED | Percent | `delivery` | `Draft` |
| MET-DEL-013 | Velocity Stability | L2_DERIVED | DERIVED | Ratio | `delivery` | `Frozen` |
| MET-DEL-014 | Replan Frequency | L2_DERIVED | DERIVED | Count | `delivery` | `Frozen` |
| MET-DEL-022 | Blocked Effort | L2_DERIVED | DERIVED | Hours | `delivery` | `Frozen` |
| MET-DEL-023 | Customer Dependency Ageing | L2_DERIVED | DERIVED | Days | `delivery` | `Frozen` |
| MET-QUA-001 | Open Defects by Severity | L1_OBSERVED | QUALITY_SYSTEM | Count | `quality` | `Frozen` |
| MET-QUA-002 | Defect Density | L2_DERIVED | DERIVED | Ratio | `quality` | `Draft` |
| MET-QUA-003 | Escaped Defect Rate | L2_DERIVED | DERIVED | Percent | `quality` | `Frozen` |
| MET-QUA-004 | Defect Removal Efficiency | L2_DERIVED | DERIVED | Percent | `quality` | `Frozen` |
| MET-QUA-005 | Mean Time to Resolve (S1/S2) | L2_DERIVED | DERIVED | Hours | `quality` | `Frozen` |
| MET-QUA-006 | Rework Ratio | L2_DERIVED | DERIVED | Percent | `quality` | `Frozen` |
| MET-QUA-012 | Excess Rework Cost | L2_DERIVED | DERIVED | Money | `quality` | `Frozen` |
| MET-QUA-007 | Automated Test Coverage | L1_OBSERVED | QUALITY_SYSTEM | Percent | `quality` | `Frozen` |
| MET-QUA-008 | Change Failure Rate | L2_DERIVED | DERIVED | Percent | `quality` | `Frozen` |
| MET-QUA-009 | Defect Backlog Trend | L2_DERIVED | DERIVED | Count/period | `quality` | `Frozen` |
| MET-QUA-010 | Acceptance Blockers | L1_OBSERVED | QUALITY_SYSTEM | Count | `quality` | `Frozen` |
| MET-QUA-011 | Acceptance Latency | L2_DERIVED | DERIVED | Days | `quality` | `Frozen` |
| MET-RES-001 | Billable Utilisation | L2_DERIVED | DERIVED | Percent | `resource` | `Frozen` |
| MET-RES-002 | Effort Variance | L2_DERIVED | DERIVED | Hours | `resource` | `Frozen` |
| MET-RES-003 | Pyramid Ratio | L2_DERIVED | DERIVED | Ratio | `resource` | `Frozen` |
| MET-RES-004 | Pyramid Drift | L2_DERIVED | DERIVED | Ratio | `resource` | `Frozen` |
| MET-RES-005 | Blended Rate Variance | L2_DERIVED | DERIVED | Money/hr | `resource` | `Frozen` |
| MET-RES-010 | Resource Cost Drift Impact | L2_DERIVED | DERIVED | Money | `resource` | `Frozen` |
| MET-RES-006 | Attrition Rate (rolling 12m) | L2_DERIVED | DERIVED | Percent | `resource` | `Frozen` |
| MET-RES-007 | Key Person Concentration | L2_DERIVED | DERIVED | Percent | `resource` | `Frozen` |
| MET-RES-008 | Ramp Deficit | L2_DERIVED | DERIVED | FTE | `resource` | `Frozen` |
| MET-RES-009 | Open Role Ageing | L2_DERIVED | DERIVED | Days | `resource` | `Frozen` |
| MET-RSK-001 | Risk Exposure (gross) | L2_DERIVED | DERIVED | Money | `risk` | `Frozen` |
| MET-RSK-008 | Incremental Risk Exposure | L2_DERIVED | DERIVED | Money | `risk` | `Frozen` |
| MET-RSK-002 | Open Critical Risks | L1_OBSERVED | DELIVERY_SYSTEM | Count | `risk` | `Frozen` |
| MET-RSK-003 | Risk Proximity | L2_DERIVED | DERIVED | Days | `risk` | `Frozen` |
| MET-RSK-004 | Mitigation Coverage | L2_DERIVED | DERIVED | Percent | `risk` | `Frozen` |
| MET-RSK-005 | Overdue Mitigations | L2_DERIVED | DERIVED | Count | `risk` | `Frozen` |
| MET-RSK-006 | Risk Register Freshness | L2_DERIVED | DERIVED | Days | `risk` | `Frozen` |
| MET-RSK-007 | Issue Escalation Rate | L2_DERIVED | DERIVED | Count | `risk` | `Frozen` |
| MET-HLTH-001 | Financial Health Dimension | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-HLTH-002 | Schedule Health Dimension | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-HLTH-003 | Scope & Commercial Dimension | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-HLTH-004 | Quality Health Dimension | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-HLTH-005 | Resource Health Dimension | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-HLTH-006 | Risk Health Dimension | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-HLTH-010 | Composite Health Score | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-HLTH-011 | System-Assessed RAG | L3_ASSESSED | RULE_ENGINE | RAG | `health` | `Frozen` |
| MET-HLTH-012 | Reported RAG | L1_OBSERVED | MANUAL_DECLARATION | RAG | `health` | `Frozen` |
| MET-HLTH-013 | Effective RAG | L3_ASSESSED | RULE_ENGINE | RAG | `health` | `Frozen` |
| MET-HLTH-030 | Status Divergence | L3_ASSESSED | RULE_ENGINE | Score | `health` | `Frozen` |
| MET-HLTH-031 | Divergence Persistence | L3_ASSESSED | RULE_ENGINE | Weeks | `health` | `Frozen` |
| MET-HLTH-032 | Dimension Contribution | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-HLTH-033 | Reported Green Risk | L3_ASSESSED | RULE_ENGINE | Score | `health` | `Frozen` |
| MET-HLTH-021 | Financial Dimension (Executive) | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-HLTH-022 | Delivery Dimension (Executive) | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-HLTH-023 | Scope & Commercial Dimension (Executive) | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-HLTH-024 | Product Quality Dimension (Executive) | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-HLTH-020 | Executive Composite Health Score | L2_DERIVED | DERIVED | Score | `health` | `Frozen` |
| MET-FCST-001 | Health Trajectory | L3_ASSESSED | RULE_ENGINE | Score | `forecast` | `Frozen` |
| MET-FCST-002 | Deterioration Flag | L3_ASSESSED | RULE_ENGINE | Boolean | `forecast` | `Frozen` |
| MET-FCST-003 | Weeks to Amber | L3_ASSESSED | RULE_ENGINE | Weeks | `forecast` | `Frozen` |
| MET-FCST-004 | Margin Trajectory | L3_ASSESSED | RULE_ENGINE | PercentagePoints | `forecast` | `Frozen` |
| MET-FCST-005 | Projected Outturn Margin | L3_ASSESSED | RULE_ENGINE | Percent | `forecast` | `Frozen` |
| MET-FCST-006 | Signal Confluence | L3_ASSESSED | RULE_ENGINE | Count | `forecast` | `Frozen` |
| MET-FCST-007 | Intervention Window | L3_ASSESSED | RULE_ENGINE | Weeks | `forecast` | `Frozen` |
| MET-FCST-010 | Silent Deterioration Index | L3_ASSESSED | RULE_ENGINE | Score | `forecast` | `Frozen` |
| MET-FCST-020 | Trajectory State | L3_ASSESSED | RULE_ENGINE | Score | `forecast` | `Frozen` |
| MET-FCST-021 | Signal Trend Slope | L3_ASSESSED | RULE_ENGINE | Ratio | `forecast` | `Frozen` |
| MET-FCST-022 | Forward Outlook Band | L3_ASSESSED | RULE_ENGINE | RAG | `forecast` | `Frozen` |
| MET-FCST-025 | System Green-at-Risk | L3_ASSESSED | RULE_ENGINE | Score | `forecast` | `Frozen` |
| MET-FCST-026 | Economic Exposure at Risk | L3_ASSESSED | RULE_ENGINE | Money | `forecast` | `Frozen` |
| MET-FCST-030 | Late Detection Rate | L3_ASSESSED | RULE_ENGINE | Percent | `forecast` | `Frozen` |
| MET-DQ-001 | Completeness | L2_DERIVED | DERIVED | Percent | `data-quality` | `Frozen` |
| MET-DQ-002 | Freshness | L2_DERIVED | DERIVED | Days | `data-quality` | `Frozen` |
| MET-DQ-003 | Consistency | L2_DERIVED | DERIVED | Percent | `data-quality` | `Frozen` |
| MET-DQ-004 | Source Coverage | L2_DERIVED | DERIVED | Percent | `data-quality` | `Frozen` |
| MET-DQ-005 | Data Confidence Score | L2_DERIVED | DERIVED | Score | `data-quality` | `Frozen` |
| MET-DQ-006 | Confidence-Qualified Health | L2_DERIVED | DERIVED | Tuple | `data-quality` | `Frozen` |
| MET-DQ-007 | Forecast Confidence | L3_ASSESSED | RULE_ENGINE | Score | `data-quality` | `Frozen` |
| MET-DQ-008 | Validity | L2_DERIVED | DERIVED | Percent | `data-quality` | `Frozen` |
| MET-DQ-009 | Forecast Reliability Profile | L3_ASSESSED | RULE_ENGINE | Tuple | `data-quality` | `Draft` |
| MET-REC-001 | Recovery Case Gross Margin % | L3_ASSESSED | RULE_ENGINE | Percent | `recovery` | `Frozen` |
| MET-REC-002 | Probability-Adjusted Recovery Gross Margin % | L3_ASSESSED | RULE_ENGINE | Percent | `recovery` | `Frozen` |
| MET-REC-003 | Recovery Plan Credibility | L3_ASSESSED | RULE_ENGINE | Score | `recovery` | `Frozen` |
| MET-PORT-001 | Portfolio Contract Value | L2_DERIVED | DERIVED | Money | `portfolio` | `Frozen` |
| MET-PORT-002 | Portfolio Forecast Margin | L2_DERIVED | DERIVED | Percent | `portfolio` | `Frozen` |
| MET-PORT-003 | Portfolio Value at Risk | L2_DERIVED | DERIVED | Money | `portfolio` | `Frozen` |
| MET-PORT-004 | RAG Distribution | L3_ASSESSED | RULE_ENGINE | BandDistribution | `portfolio` | `Frozen` |
| MET-PORT-005 | Divergent Project Count | L3_ASSESSED | RULE_ENGINE | Count | `portfolio` | `Frozen` |
| MET-PORT-006 | Deteriorating Greens | L3_ASSESSED | RULE_ENGINE | Count | `portfolio` | `Frozen` |
| MET-PORT-007 | Executive Intervention Priority Rank | L3_ASSESSED | RULE_ENGINE | Rank | `portfolio` | `Frozen` |
| MET-PORT-008 | Portfolio Confidence | L2_DERIVED | DERIVED | BandDistribution | `portfolio` | `Frozen` |
| MET-PORT-009 | Portfolio Forecast Loss Exposure | L2_DERIVED | DERIVED | Money | `portfolio` | `Frozen` |

---

## 3. Financial (`financial` context)

#### MET-FIN-001 — Contract Value (As-Sold)

Total contracted price at signature. The reference point every variance is measured from.

| Field | Value |
| --- | --- |
| Formula | `AsSoldBaseline.contractValue` |
| Inputs | `contract:AsSoldBaseline.contractValue` |
| Unit | Money |
| Epistemic level | L1_OBSERVED |
| Authoritative source | CONTRACT_SYSTEM |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | AS_SOLD |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Executed contract record; As-Sold baseline row (immutable) |

> Immutable. Restating it is prohibited (ADR-0003 §Decision 1).

#### MET-FIN-002 — Contractual Revenue (Current Contractual)

Commercial entitlement under the currently effective contract: the original contract plus contractual amendments and change requests that have become contractually effective. Excludes identified, submitted or negotiated changes that have not been executed.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-001 + Σ ExecutedChange.valueDelta` |
| Inputs | `MET-FIN-001`, `contract:ExecutedChange.valueDelta` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | As-Sold baseline; Each executed change record with its execution date |

> Derived, never a stored editable row. Pending changes are excluded by construction.

#### MET-FIN-003 — Budgeted Cost (As-Sold)

Total planned delivery cost at signature.

| Field | Value |
| --- | --- |
| Formula | `AsSoldBaseline.budgetedCost` |
| Inputs | `contract:AsSoldBaseline.budgetedCost` |
| Unit | Money |
| Epistemic level | L1_OBSERVED |
| Authoritative source | CONTRACT_SYSTEM |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | AS_SOLD |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | As-Sold baseline row (immutable) |

#### MET-FIN-004 — Budgeted Cost (Current Contractual)

Planned delivery cost including executed change requests only.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-003 + Σ ExecutedChange.costDelta` |
| Inputs | `MET-FIN-003`, `contract:ExecutedChange.costDelta` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | As-Sold baseline; Executed change records |

#### MET-FIN-005 — Cost to Date (ATD)

All delivery cost actually incurred to the as-of date: labour, non-labour and pass-through.

| Field | Value |
| --- | --- |
| Formula | `Σ ActualCost.amount WHERE periodEnd ≤ t` |
| Inputs | `financial:ActualCost.amount` |
| Unit | Money |
| Epistemic level | L1_OBSERVED |
| Authoritative source | FINANCE_SYSTEM |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | ACTUAL_TO_DATE |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Cost ledger entries; Effort records reconciling to labour cost |

#### MET-FIN-006 — Cost Progress Ratio (cost-to-cost)

The share of total forecast cost already incurred. A cost-based progress proxy used to compare against independently measured physical completion.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-005 / MET-FIN-008` |
| Inputs | `MET-FIN-005`, `MET-FIN-008` |
| Unit | Ratio |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Cost ledger; ETC basis of estimate; Commitment register |

> Renamed from "Percent Complete (cost-to-cost)" in Phase 2 closure. **This is not a revenue recognition method.** Delivery Intelligence does not determine accounting revenue (Decision 1); recognised revenue is MET-FIN-009, an imported Finance fact. Compare this against MET-DEL-016 physical completion: a wide gap is the signal, and MET-FIN-027 Burn Gap is where that comparison is expressed.

#### MET-FIN-007 — Estimate to Complete (ETC, bottom-up)

Management's bottom-up estimate of remaining cost to deliver the contracted scope.

| Field | Value |
| --- | --- |
| Formula | `Σ EtcLineItem.amount (current forecast version)` |
| Inputs | `financial:EtcLineItem.amount` |
| Unit | Money |
| Epistemic level | L1_OBSERVED |
| Authoritative source | MANUAL_DECLARATION |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | FORECAST |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | ETC line items with owner and date; Forecast version reference |

> A management assertion, recorded as an observed fact. Its optimism is measured by MET-FIN-030, not assumed away.

#### MET-FIN-023 — Committed Future Cost

Cost already contractually committed but not yet incurred: signed subcontracts, purchase orders, non-cancellable licences.

| Field | Value |
| --- | --- |
| Formula | `Σ Commitment.amount WHERE NOT incurred AND NOT cancellable` |
| Inputs | `financial:Commitment.amount` |
| Unit | Money |
| Epistemic level | L1_OBSERVED |
| Authoritative source | FINANCE_SYSTEM |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Purchase orders; Subcontract agreements |

> Separated from ETC because a commitment is contractually fixed while an estimate is not. Omitting it understates EAC.

#### MET-FIN-008 — Estimate at Completion — Cost (EAC)

Total expected delivery cost at completion: what has been spent, plus what is estimated to remain, plus what is already committed.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-005 + MET-FIN-007 + MET-FIN-023` |
| Inputs | `MET-FIN-005`, `MET-FIN-007`, `MET-FIN-023` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | FORECAST |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 2.0.0 |
| Status | `Frozen` |
| Evidence expected | Cost ledger; ETC line items; Commitment register |

> Also called Management EAC, to distinguish it from MET-FIN-029 Performance-Implied EAC. v2.0.0 adds committed future cost — see versions.ts.

#### MET-FIN-009 — Recognised Revenue (cumulative to date)

Revenue booked to date under corporate accounting policy, as recorded by Finance. Delivery Intelligence consumes this figure; it does not compute it.

| Field | Value |
| --- | --- |
| Formula | `FinanceSystem.recognisedRevenueToDate (imported fact)` |
| Inputs | `financial:RecognisedRevenueFact.cumulativeAmount` |
| Unit | Money |
| Epistemic level | L1_OBSERVED |
| Authoritative source | FINANCE_SYSTEM |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Finance/ERP recognised revenue record with period and posting reference; The recognition policy identifier in force for the period |

> OQ-2 CLOSED (Phase 2 closure, Decision 1). Recognition treatment is governed by corporate accounting policy and the underlying performance-obligation analysis — not by this product. Delivery Intelligence must not recreate the accounting ledger, must not derive this from MET-DEL-016 physical completion, and must not derive it from MET-FIN-029 Performance-Implied EAC. For the synthetic POC the value is produced by a documented synthetic recognition policy (rule set RECOGNITION-v1) and is still stored as an authoritative accounting fact, not as a computed metric.

#### MET-FIN-039 — Recognised Revenue (period)

Revenue booked by Finance in a single reporting period, as recorded in the accounting ledger.

| Field | Value |
| --- | --- |
| Formula | `FinanceSystem.recognisedRevenueInPeriod (imported fact)` |
| Inputs | `financial:RecognisedRevenueFact.periodAmount` |
| Unit | Money |
| Epistemic level | L1_OBSERVED |
| Authoritative source | FINANCE_SYSTEM |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Finance/ERP posting for the period; Reporting period identifier resolved against the entity fiscal calendar |

> Added in Phase 2 closure (Decision 11). Period and cumulative are separate metrics because a period figure is what Finance reports and a cumulative figure is what margin-to-date needs; deriving one from the other across a restatement would silently disagree with the ledger.

#### MET-FIN-010 — Forecast Revenue (base)

Revenue expected to be contractually earned by project completion under the current contractual baseline. Includes contractually effective revenue only; pending and unexecuted change requests are excluded.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-002` |
| Inputs | `MET-FIN-002` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | FORECAST |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Current contractual baseline derivation; Executed change records |

> A Delivery Intelligence deterministic project-economic metric — **not** accounting recognised revenue (MET-FIN-009). Hard product rule (REQ-FIN-005): unexecuted CRs may never inflate this. Pending CR recovery reaches only MET-FIN-031 Risk-Adjusted Revenue, and only as a labelled scenario.

#### MET-FIN-011 — Unsecured Upside

Face value of change requests raised but not executed. Reported beside forecast revenue, never inside it.

| Field | Value |
| --- | --- |
| Formula | `Σ PendingChange.proposedValue WHERE NOT superseded` |
| Inputs | `contract:PendingChange.proposedValue` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Pending change records with raise dates |

> Distinct from MET-COM-010, which probability-weights the same population for scenario analysis.

#### MET-FIN-026 — Sold GM $

Gross margin in currency at the price and cost we sold.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-001 − MET-FIN-003` |
| Inputs | `MET-FIN-001`, `MET-FIN-003` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | AS_SOLD |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | As-Sold baseline row |

#### MET-FIN-024 — Forecast GM $

Gross margin in currency expected at completion, on secured revenue only.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-010 − MET-FIN-008` |
| Inputs | `MET-FIN-010`, `MET-FIN-008` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | FORECAST |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Forecast revenue derivation; EAC components |

#### MET-FIN-012 — Gross Margin — As-Sold

Percentage margin at signature.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-026 / MET-FIN-001` |
| Inputs | `MET-FIN-026`, `MET-FIN-001` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | AS_SOLD |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | As-Sold baseline row |

#### MET-FIN-013 — Gross Margin — Current Contractual

Percentage margin against the contractual baseline including executed changes.

| Field | Value |
| --- | --- |
| Formula | `(MET-FIN-002 − MET-FIN-004) / MET-FIN-002` |
| Inputs | `MET-FIN-002`, `MET-FIN-004` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Executed change records |

#### MET-FIN-014 — Gross Margin — Forecast

Percentage margin expected at completion. The headline economics number.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-024 / MET-FIN-010` |
| Inputs | `MET-FIN-024`, `MET-FIN-010` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | FORECAST |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Forecast revenue derivation; EAC components |

> Aggregates as a weighted mean over revenue, never as a mean of project percentages (MET-PORT-002).

#### MET-FIN-015 — Gross Margin — Actual to Date

Margin realised on the revenue Finance has recognised so far, against the cost incurred to earn it.

| Field | Value |
| --- | --- |
| Formula | `(MET-FIN-009 − MET-FIN-005) / MET-FIN-009` |
| Inputs | `MET-FIN-009`, `MET-FIN-005` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | ACTUAL_TO_DATE |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Finance recognised revenue record; Cost ledger |

> Unblocked by the OQ-2 closure: MET-FIN-009 is now an imported Finance fact, so this is computable. It is an accounting-derived backward view and will differ from MET-FIN-014, which is contractual and forward-looking. The two answering differently is expected, not a reconciliation failure.

#### MET-FIN-016 — Margin Erosion (pp)

How many percentage points of margin have been lost against the price and cost we sold.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-014 − MET-FIN-012` |
| Inputs | `MET-FIN-014`, `MET-FIN-012` |
| Unit | PercentagePoints |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | AS_SOLD |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Both margin derivations |

> Negative means erosion. Percentage-point differences are not aggregatable; use MET-FIN-025 in currency for portfolio views.

#### MET-FIN-017 — Margin Value Delta

Signed movement in margin currency between as-sold and forecast. The total the margin bridge must reconcile to.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-024 − MET-FIN-026` |
| Inputs | `MET-FIN-024`, `MET-FIN-026` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | AS_SOLD |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Both margin derivations |

> Negative means margin lost. MET-FIN-025 is the same quantity sign-flipped for erosion reporting; a golden test asserts the identity.

#### MET-FIN-025 — GM Erosion $

Margin lost in currency against the as-sold position. Positive means margin has been lost.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-026 − MET-FIN-024` |
| Inputs | `MET-FIN-026`, `MET-FIN-024` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | AS_SOLD |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Both margin derivations |

> Exactly −MET-FIN-017. Both exist because executives read erosion as a positive number while the bridge needs a signed delta. The identity is asserted by test so the two can never disagree.

#### MET-FIN-018 — Margin Bridge Decomposition

The named causes that together explain the entire movement from as-sold margin to forecast margin.

| Field | Value |
| --- | --- |
| Formula | `Ordered causes summing exactly to MET-FIN-017: scope-without-CR, effort overrun, rate/mix, schedule extension, quality rework, pass-through, FX, named residual` |
| Inputs | `MET-FIN-017`, `MET-COM-009`, `MET-RES-002`, `MET-RES-005`, `MET-QUA-006`, `MET-FIN-038` |
| Unit | MoneyBreakdown |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | AS_SOLD |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each cause traced to the L1 records that produced it |

> AC-4: causes must sum exactly, to the cent. Largest-remainder allocation guarantees rounded parts sum to the rounded whole.

#### MET-FIN-028 — Cost Consumed %

Proportion of the contractual cost budget already spent.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-005 / MET-FIN-004` |
| Inputs | `MET-FIN-005`, `MET-FIN-004` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Cost ledger; Contractual cost baseline |

#### MET-FIN-027 — Burn Gap

How far spending has run ahead of delivered progress. Positive means money is being consumed faster than value is being produced.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-028 − MET-DEL-016` |
| Inputs | `MET-FIN-028`, `MET-DEL-016` |
| Unit | PercentagePoints |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Cost ledger; Physical completion claim with its basis |

> The earliest reliable economic warning available, because it moves before ETC is revised.

#### MET-FIN-029 — Performance-Implied EAC

An extrapolative diagnostic comparing actual cost incurred with independently measured physical completion: the total cost implied if realised cost efficiency relative to physical progress continued.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-005 / MET-DEL-016` |
| Inputs | `MET-FIN-005`, `MET-DEL-016` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Precondition | MET-DEL-016 ≥ maturity threshold (rule set EAC-v1, default 20%) and the progress measure is assessed meaningful. Below the threshold the extrapolation is arithmetic noise. |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | EAC-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Cost ledger; Physical completion claim; Maturity threshold in force |

> A diagnostic, not an authority. It is **not** an accounting revenue-recognition method, **not** a substitute for bottom-up ETC, **not** the official EAC, and **not** a cost-to-cost revenue calculation (Phase 2 closure, Decision 3). Its only job is to be an independent check on MET-FIN-008.

#### MET-FIN-042 — GM Value at Risk Ratio

Margin at risk as a share of the margin originally sold.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-019 / MET-FIN-026` |
| Inputs | `MET-FIN-019`, `MET-FIN-026` |
| Unit | Ratio |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | AS_SOLD |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | VAR-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | MET-FIN-019; MET-FIN-026 |

> The comparand behind OVR-CONTRACT-LOSS, which previously cited MET-FIN-019 -- a MONEY metric -- while comparing a ratio against 0.80 (DR-065, closed by ADR-0025 follow-up). IT CAN EXCEED 1: once risk-adjusted GM is negative the exposure covers the sold margin lost AND the contract loss beyond it, so a value of 1.17 means 117% of sold margin is at risk. It is NOT the share of sold margin remaining and must never be presented as such.

#### MET-FIN-043 — EAC Increase Ratio

How far the estimate at completion has risen against the earliest estimate on record.

| Field | Value |
| --- | --- |
| Formula | `(MET-FIN-008@latest - MET-FIN-008@earliest) / MET-FIN-008@earliest` |
| Inputs | `MET-FIN-008` |
| Unit | Ratio |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Precondition | Requires at least two EAC observations on record. |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | The earliest and latest MET-FIN-008 on record |

> The comparand behind EW-EAC-INCREASE, which previously cited MET-FIN-008 -- Money -- while comparing a ratio against 0.05 (DR-065). Signed: a falling EAC gives a negative value.

#### MET-FIN-040 — ETC Optimism Ratio

The ETC optimism gap expressed as a share of the stated estimate at completion.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-030 / MET-FIN-008` |
| Inputs | `MET-FIN-030`, `MET-FIN-008` |
| Unit | Ratio |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Precondition | Inherits the maturity gate on MET-FIN-029 through MET-FIN-030. |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | EAC-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | MET-FIN-030 gap; MET-FIN-008 stated EAC |

> The comparand behind ELV-ETC-OPTIMISM. Registered by ADR-0025 because the rule previously compared a ratio against 0.10 while citing MET-FIN-030, which is Money, not a ratio -- so the thing actually being compared had no registered metric. The DENOMINATOR IS THE STATED EAC, so the metric reads "management's estimate is understated by X% of itself", which is what the rule narrative claims. Denominator sensitivity was measured before the choice was made: using MET-FIN-029 instead yields an identical breach count (7) on the demo portfolio, so the decision is not outcome-selected.

#### MET-FIN-041 — Attributed Movement Coverage

The share of a margin bridge's GROSS movement carried by its named causes rather than by the unattributed residual.

| Field | Value |
| --- | --- |
| Formula | `Sum of \|named MET-FIN-018 causes\| / (Sum of \|named MET-FIN-018 causes\| + \|residual\|)` |
| Inputs | `MET-FIN-018` |
| Unit | Ratio |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Precondition | A bridge with no gross movement has nothing to attribute: NOT_COMPUTABLE, never 100%. |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | The named causes of MET-FIN-018; The residual |

> GROSS, NOT NET. This is NOT the percentage of net margin change explained, and must never be labelled as such. Named drivers of +$5.0M and -$5.1M with a zero residual give coverage of 100% while the NET delta is only -$0.1M; both readings are true and only the gross one is measured here. Registered by ADR-0025: the value was already rendered to executives with no id, owner, version or catalog entry. It exists because MET-FIN-018 reconciles BY CONSTRUCTION -- the residual is defined as the total less the named causes -- so AC-4 holds however little the named causes explain. A net denominator was rejected: it is undefined at zero net delta and unstable near it.

#### MET-FIN-030 — ETC Optimism Gap

How much lower management's estimate at completion is than the project's own demonstrated performance implies.

| Field | Value |
| --- | --- |
| Formula | `max(0, MET-FIN-029 − MET-FIN-008)` |
| Inputs | `MET-FIN-029`, `MET-FIN-008` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Precondition | Inherits the maturity gate on MET-FIN-029. |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | EAC-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Both EAC derivations; Maturity threshold in force |

> Clamped at zero: a management EAC above the implied figure is prudence, not optimism, and is not reported as a gap.

#### MET-FIN-031 — Risk-Adjusted Revenue

Secured revenue plus the probability-weighted value of pending change requests. A scenario view, never the base forecast.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-010 + MET-COM-010` |
| Inputs | `MET-FIN-010`, `MET-COM-010` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID |
| Rule set | VAR-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Pending change records with probability assessments and assessor |

> Must always be displayed as a scenario, distinct from MET-FIN-010 (REQ-FIN-005, REQ-MRGN-003).

#### MET-FIN-032 — Risk-Adjusted GM $

Expected margin once unresolved risk not already in the estimate is deducted and probable change recovery is added.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-031 − MET-FIN-008 − MET-RSK-008` |
| Inputs | `MET-FIN-031`, `MET-FIN-008`, `MET-RSK-008` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | VAR-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | EAC components; Risk register with IncludedInETC flags; Pending CR probabilities |

> Deducting only incremental risk is what prevents double counting: a risk already provisioned inside ETC must not be subtracted twice.

#### MET-FIN-033 — Risk-Adjusted GM %

Risk-adjusted margin as a percentage of risk-adjusted revenue.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-032 / MET-FIN-031` |
| Inputs | `MET-FIN-032`, `MET-FIN-031` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | VAR-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Both risk-adjusted derivations |

#### MET-FIN-019 — GM Value at Risk

How much of the margin we sold is now at risk once forecast performance and unresolved risk are taken into account.

| Field | Value |
| --- | --- |
| Formula | `max(0, MET-FIN-026 − MET-FIN-032)` |
| Inputs | `MET-FIN-026`, `MET-FIN-032` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | AS_SOLD |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | VAR-v1 |
| Effective from | 2026-08-31 |
| Version | 2.0.0 |
| Status | `Frozen` |
| Evidence expected | Sold margin; Risk-adjusted margin derivation; Rule set version |

> Resolves MC-4. Clamped at zero and capped at MET-FIN-002 — a project cannot put more at risk than its contract value. v2.0.0 replaces the Phase 0 placeholder with the Phase 2 brief formula.

#### MET-FIN-036 — Contingency Budget

The cost buffer set aside at baseline to absorb estimating and delivery uncertainty.

| Field | Value |
| --- | --- |
| Formula | `AsSoldBaseline.contingencyBudget + Σ ExecutedChange.contingencyDelta` |
| Inputs | `contract:AsSoldBaseline.contingencyBudget` |
| Unit | Money |
| Epistemic level | L1_OBSERVED |
| Authoritative source | CONTRACT_SYSTEM |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Baseline contingency line; Executed change contingency adjustments |

#### MET-FIN-037 — Contingency Consumed

Contingency drawn down to date, by authorised drawdown record.

| Field | Value |
| --- | --- |
| Formula | `Σ ContingencyDrawdown.amount WHERE date ≤ t` |
| Inputs | `financial:ContingencyDrawdown.amount` |
| Unit | Money |
| Epistemic level | L1_OBSERVED |
| Authoritative source | FINANCE_SYSTEM |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Drawdown records with authoriser and reason |

#### MET-FIN-035 — Contingency Consumed %

Proportion of the contingency buffer already used.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-037 / MET-FIN-036` |
| Inputs | `MET-FIN-037`, `MET-FIN-036` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Drawdown records; Baseline contingency line |

> Resolves MC-9.

#### MET-FIN-034 — Contingency Burn Gap

How far contingency consumption has outrun delivered progress. Positive means the buffer is being spent faster than the project is being delivered.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-035 − MET-DEL-016` |
| Inputs | `MET-FIN-035`, `MET-DEL-016` |
| Unit | PercentagePoints |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Drawdown records; Physical completion claim |

> A project 48% complete having consumed 82% of contingency has, in effect, already spent its margin protection.

#### MET-FIN-020 — Burn Rate

Average delivery cost consumed per period over the recent past.

| Field | Value |
| --- | --- |
| Formula | `Σ MET-FIN-005 over trailing 4 periods / 4` |
| Inputs | `MET-FIN-005` |
| Unit | Money/period |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 4 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Cost ledger for the trailing window |

#### MET-FIN-021 — Budget Runway

How many periods of spending remain before the contractual cost budget is exhausted at the current rate.

| Field | Value |
| --- | --- |
| Formula | `(MET-FIN-004 − MET-FIN-005) / MET-FIN-020` |
| Inputs | `MET-FIN-004`, `MET-FIN-005`, `MET-FIN-020` |
| Unit | Periods |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | MIN |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 4 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Cost ledger; Contractual cost baseline |

#### MET-FIN-022 — Cost Variance to Baseline

Difference between planned and actual cost at the as-of date, against a named baseline.

| Field | Value |
| --- | --- |
| Formula | `PlannedCost@t (named baseline) − MET-FIN-005` |
| Inputs | `MET-FIN-005`, `contract:baseline.plannedCostCurve` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Planned cost curve for the named baseline; Cost ledger |

#### MET-FIN-038 — FX Margin Impact

The portion of margin movement caused by exchange-rate movement rather than by delivery performance.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-024 at current rates − MET-FIN-024 at as-sold rates` |
| Inputs | `MET-FIN-024`, `financial:FxRate` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `financial` |
| Definition owner | Finance |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | AS_SOLD |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | As-sold FX rates with dates and source; Current FX rates with dates and source |

> Its own named cause in MET-FIN-018 so the bridge separates what the delivery team caused from what it did not.

---

## 4. Commercial (`commercial` context)

#### MET-COM-001 — Invoiced to Date

Value invoiced to the customer to date. This is a billing figure and is not revenue.

| Field | Value |
| --- | --- |
| Formula | `Σ Invoice.amount WHERE issuedAt ≤ t` |
| Inputs | `commercial:Invoice.amount` |
| Unit | Money |
| Epistemic level | L1_OBSERVED |
| Authoritative source | FINANCE_SYSTEM |
| Owner context | `commercial` |
| Definition owner | Commercial |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Invoice records |

> Decision 2D — do not call this recognised revenue. Billing follows contractual milestones; recognition follows accounting policy. They routinely differ.

#### MET-COM-002 — Collected to Date

Cash actually collected from the customer against issued invoices. This is a cash figure and is neither revenue nor billing.

| Field | Value |
| --- | --- |
| Formula | `Σ Payment.amount WHERE receivedAt ≤ t` |
| Inputs | `commercial:Payment.amount` |
| Unit | Money |
| Epistemic level | L1_OBSERVED |
| Authoritative source | FINANCE_SYSTEM |
| Owner context | `commercial` |
| Definition owner | Commercial |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Payment records |

> Decision 2E — do not call this revenue. MET-COM-003 is the gap between this and billing.

#### MET-COM-003 — Receivables Outstanding

Invoiced value the client has not yet paid.

| Field | Value |
| --- | --- |
| Formula | `MET-COM-001 − MET-COM-002` |
| Inputs | `MET-COM-001`, `MET-COM-002` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `commercial` |
| Definition owner | Commercial |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Invoice and payment records |

#### MET-COM-004 — Days Sales Outstanding

How many days of billing are tied up in unpaid invoices.

| Field | Value |
| --- | --- |
| Formula | `MET-COM-003 / (MET-COM-001 over trailing 90d / 90)` |
| Inputs | `MET-COM-003`, `MET-COM-001` |
| Unit | Days |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `commercial` |
| Definition owner | Commercial |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 13 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Invoice and payment records |

#### MET-COM-005 — Aged Receivables > 60d

Receivables outstanding more than 60 days.

| Field | Value |
| --- | --- |
| Formula | `Σ Receivable.amount WHERE age > 60d` |
| Inputs | `MET-COM-003` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `commercial` |
| Definition owner | Commercial |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Invoice records with due dates |

#### MET-COM-006 — Unbilled Revenue

Revenue recognised but not yet invoiced.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-009 − MET-COM-001` |
| Inputs | `MET-FIN-009`, `MET-COM-001` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `commercial` |
| Definition owner | Commercial |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Finance recognised revenue record; Invoice records |

> The gap between what Finance has recognised and what has been billed. Both sides are Finance facts; this metric does not recompute either.

#### MET-COM-007 — Pending CR Ageing

How long change requests have sat unexecuted. Long-ageing CRs are usually scope already delivered.

| Field | Value |
| --- | --- |
| Formula | `max and mean of (t − raisedAt) over PendingChange WHERE NOT superseded` |
| Inputs | `contract:PendingChange.raisedAt` |
| Unit | Days |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `commercial` |
| Definition owner | Commercial |
| Aggregation | MAX |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Pending change records with raise dates |

> Ageing survives execution because a pending change is never status-flipped in place (ADR-0003 §Decision 2).

#### MET-COM-008 — Scope Change Ratio

How much the contracted scope has grown through executed changes.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-002 / MET-FIN-001 − 1` |
| Inputs | `MET-FIN-002`, `MET-FIN-001` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `commercial` |
| Definition owner | Commercial |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | AS_SOLD |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Executed change records |

#### MET-COM-009 — Uncompensated Scope Ratio

The share of contract value being delivered as scope for which no change request has been executed.

| Field | Value |
| --- | --- |
| Formula | `estimated value of delivered-but-uncontracted scope / MET-FIN-002` |
| Inputs | `delivery:ScopeItem`, `contract:ExecutedChange`, `MET-FIN-002` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `commercial` |
| Definition owner | Commercial |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Scope items with no linked executed change; The estimation basis, labelled as an estimate |

> A signature Delivery Intelligence metric: work delivered without a CR is the most common silent margin killer in fixed-bid. Its input is an estimate and must be labelled as such.

#### MET-COM-011 — Liquidated Damages Exposure Ratio

Live liquidated-damages exposure as a share of contract value.

| Field | Value |
| --- | --- |
| Formula | `sum of CommercialExposure[kind = LIQUIDATED_DAMAGES].estimatedValue / MET-FIN-002` |
| Inputs | `commercial:CommercialExposure`, `MET-FIN-002` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `commercial` |
| Definition owner | Commercial |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Liquidated-damages exposure records; The estimation basis, labelled as an estimate |

> The comparand behind OVR-LD-EXPOSURE. Registered by ADR-0025: the hard override cited MET-FIN-019 (GM Value at Risk) as its signal metric, which is not what it compares, and the LD ratio itself had no registered metric -- so the override was declared, never assembled, and never evaluated on any project. Liquidated damages are a CONTRACTUAL remedy path: the exposure does not resolve through delivery recovery, which is why it forces RED in its own right rather than being absorbed into the weighted composite. Its input is an estimate and must be labelled as one.

#### MET-COM-010 — Expected Pending CR Recovery

Probability-weighted value of pending change requests, used only for scenario analysis.

| Field | Value |
| --- | --- |
| Formula | `Σ (PendingChange.proposedValue × PendingChange.approvalProbability)` |
| Inputs | `contract:PendingChange.proposedValue`, `contract:PendingChange.approvalProbability` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `commercial` |
| Definition owner | Commercial |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID |
| Rule set | VAR-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Pending change records; Probability assessment with assessor and date |

> Never base revenue (REQ-FIN-005). It enters MET-FIN-031 only, which is always displayed as a scenario.

---

## 5. Delivery & earned value (`delivery` context)

#### MET-DEL-016 — Actual Physical Completion

The proportion of contracted scope the delivery team asserts is genuinely finished, assessed against defined completion criteria — not effort spent.

| Field | Value |
| --- | --- |
| Formula | `ProgressClaim.physicalCompletion (latest ≤ t)` |
| Inputs | `delivery:ProgressClaim.physicalCompletion` |
| Unit | Percent |
| Epistemic level | L1_OBSERVED |
| Authoritative source | MANUAL_DECLARATION |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Progress claim with assessor, date, and completion-criteria basis |

> An observed fact — a recorded assertion — not a derived value. Its reliability is measured by MET-FIN-027 and MET-FIN-030, not assumed. Distinct from MET-DEL-012, which counts scope units and is blocked by MC-8.

#### MET-DEL-017 — Planned Physical Completion

The proportion of scope the baseline schedule says should be complete by now.

| Field | Value |
| --- | --- |
| Formula | `baseline.plannedProgressCurve@t (named baseline)` |
| Inputs | `contract:baseline.plannedProgressCurve` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Baseline progress curve |

> The "named baseline" defers nothing here: it is the contract baseline progress curve, a single observed series on the current contractual baseline, so there is exactly one reading. Recorded explicitly because the identical phrasing in MET-RES-002 DID defer a choice, and the implementation named the wrong field (ADR-0024). MET-DEL-017 is PLANNED progress; MET-DEL-016 is CLAIMED physical progress. They differ on 74 of 75 fixed-bid projects and are not interchangeable: time-phasing effort by this metric credits unperformed work as a saving.

#### MET-DEL-015 — Progress Variance

How far actual delivered progress is ahead of or behind the plan. Negative means behind.

| Field | Value |
| --- | --- |
| Formula | `MET-DEL-016 − MET-DEL-017` |
| Inputs | `MET-DEL-016`, `MET-DEL-017` |
| Unit | PercentagePoints |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Progress claim; Baseline progress curve |

#### MET-DEL-019 — Demonstrated Velocity

The rate of progress the project has actually achieved over the recent past.

| Field | Value |
| --- | --- |
| Formula | `(MET-DEL-016@t − MET-DEL-016@t−8w) / 8` |
| Inputs | `MET-DEL-016` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Progress claims across the trailing window |

#### MET-DEL-020 — Required Future Velocity

The rate of progress needed from now on to finish by the committed date.

| Field | Value |
| --- | --- |
| Formula | `(100% − MET-DEL-016) / weeks remaining to baseline completion` |
| Inputs | `MET-DEL-016`, `contract:baseline.completionDate` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Progress claim; Baseline completion date |

#### MET-DEL-018 — Required Velocity Ratio

How many times faster the project must run from here than it has run so far.

| Field | Value |
| --- | --- |
| Formula | `MET-DEL-020 / MET-DEL-019` |
| Inputs | `MET-DEL-020`, `MET-DEL-019` |
| Unit | Ratio |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | MAX |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 2.0.0 |
| Status | `Frozen` |
| Evidence expected | Both velocity derivations |

> ZERO-DENOMINATOR SEMANTICS (ADR-0027): an UNKNOWN demonstrated velocity is NOT_COMPUTABLE, but an OBSERVED zero with positive required velocity is UNBOUNDED -- an adverse observation, not missing evidence. UNBOUNDED breaches any finite upper threshold and scores at the red edge; it is never dropped from a dimension. No Infinity is produced: the numeric value stays null and the state is carried explicitly. Observed zero with ZERO required velocity is benign and reported as not computable. A ratio above roughly 1.5 sustained over weeks is the clearest available evidence that a recovery plan is arithmetic rather than a plan.

#### MET-DEL-021 — Required Productivity Improvement %

The productivity uplift the remaining plan silently assumes.

| Field | Value |
| --- | --- |
| Formula | `MET-DEL-018 − 1` |
| Inputs | `MET-DEL-018` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | MAX |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Required velocity ratio derivation |

#### MET-DEL-001 — Planned Value (PV)

Budgeted cost of the work the baseline says should have been done by now.

| Field | Value |
| --- | --- |
| Formula | `baseline.plannedCostCurve@t` |
| Inputs | `contract:baseline.plannedCostCurve` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Baseline cost curve |

#### MET-DEL-002 — Earned Value (EV)

Budgeted cost of the work actually completed.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-004 × MET-DEL-016` |
| Inputs | `MET-FIN-004`, `MET-DEL-016` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Contractual cost baseline; Progress claim |

> Uses physical completion (MET-DEL-016) rather than scope units, so it is not blocked by MC-8.

#### MET-DEL-003 — Actual Cost (AC)

Delivery cost incurred to date, presented in earned-value terms.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-005` |
| Inputs | `MET-FIN-005` |
| Unit | Money |
| Epistemic level | L1_OBSERVED |
| Authoritative source | FINANCE_SYSTEM |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Cost ledger |

> An alias, not a second definition. `financial` owns the computation; `delivery` consumes it.

#### MET-DEL-004 — Cost Performance Index (CPI)

Value earned per unit of cost spent. Below 1.0 means work is costing more than budgeted.

| Field | Value |
| --- | --- |
| Formula | `MET-DEL-002 / MET-DEL-003` |
| Inputs | `MET-DEL-002`, `MET-DEL-003` |
| Unit | Index |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | RECOMPUTE_FROM_INPUTS |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | EV and AC derivations |

#### MET-DEL-005 — Schedule Performance Index (SPI)

Value earned against value planned. Below 1.0 means the project is behind schedule.

| Field | Value |
| --- | --- |
| Formula | `MET-DEL-002 / MET-DEL-001` |
| Inputs | `MET-DEL-002`, `MET-DEL-001` |
| Unit | Index |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | RECOMPUTE_FROM_INPUTS |
| Currency behaviour | SINGLE_CURRENCY |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | EV and PV derivations |

#### MET-DEL-006 — Cost Variance (EVM)

Value earned minus cost spent, in currency.

| Field | Value |
| --- | --- |
| Formula | `MET-DEL-002 − MET-DEL-003` |
| Inputs | `MET-DEL-002`, `MET-DEL-003` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | EV and AC derivations |

#### MET-DEL-007 — Schedule Variance (EVM)

Value earned minus value planned, in currency.

| Field | Value |
| --- | --- |
| Formula | `MET-DEL-002 − MET-DEL-001` |
| Inputs | `MET-DEL-002`, `MET-DEL-001` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | EV and PV derivations |

#### MET-DEL-008 — Variance at Completion (VAC)

Expected cost overrun or underrun against the contractual budget at completion.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-004 − MET-FIN-008` |
| Inputs | `MET-FIN-004`, `MET-FIN-008` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Contractual cost baseline; EAC components |

#### MET-DEL-009 — Milestone Slippage

Total days of delay across milestones against a named baseline.

| Field | Value |
| --- | --- |
| Formula | `Σ max(0, forecastDate − baselineDate) over milestones` |
| Inputs | `delivery:Milestone.baselineDate`, `delivery:Milestone.forecastDate` |
| Unit | Days |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Milestone records with both dates |

#### MET-DEL-010 — Milestones At Risk

How many milestones are currently forecast to miss their baseline date.

| Field | Value |
| --- | --- |
| Formula | `count(Milestone WHERE forecastDate > baselineDate AND actualDate IS NULL)` |
| Inputs | `delivery:Milestone` |
| Unit | Count |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Milestone records |

#### MET-DEL-011 — Schedule Variance (calendar)

Days between forecast and baseline completion of the project as a whole.

| Field | Value |
| --- | --- |
| Formula | `forecastCompletionDate − baselineCompletionDate` |
| Inputs | `delivery:forecastCompletionDate`, `contract:baseline.completionDate` |
| Unit | Days |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | MAX |
| Currency behaviour | NONE |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Forecast and baseline completion dates |

#### MET-DEL-012 — Scope Completion

Proportion of contracted scope units delivered.

| Field | Value |
| --- | --- |
| Formula | `completed scope units / total scope units (named baseline)` |
| Inputs | `delivery:ScopeItem` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Draft` |
| Evidence expected | Scope baseline; Scope item completion records |

> BLOCKED by MC-8 — **Type A**. What a "scope unit" is (a requirement? a story? a deliverable?) is undefined, and the answer changes what the number means: two projects counted in different units are not comparable. This is a semantic gap, not a threshold awaiting a value, so the metric cannot be frozen. Owner: Delivery + Phase 2 metric owner. Nothing downstream is blocked — MET-DEL-016 physical completion carries progress everywhere it is needed.

#### MET-DEL-013 — Velocity Stability

How consistent the delivery rate has been. High variability makes any forecast unreliable.

| Field | Value |
| --- | --- |
| Formula | `stddev(weekly ΔMET-DEL-016 over trailing 6) / mean(same)` |
| Inputs | `MET-DEL-016` |
| Unit | Ratio |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 6 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Progress claims across the trailing window |

#### MET-DEL-014 — Replan Frequency

How often the forecast baseline has been revised recently.

| Field | Value |
| --- | --- |
| Formula | `count(BaselineRevision WHERE kind = FORECAST AND date ≥ t − 90d)` |
| Inputs | `contract:BaselineRevision` |
| Unit | Count |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 13 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Baseline revision records with actor and reason |

> A governance signal, not a delivery signal: frequent revision is often the visible residue of a project rebasing its way out of visible variance.

#### MET-DEL-022 — Blocked Effort

Delivery effort unable to proceed because of an unmet customer or third-party dependency.

| Field | Value |
| --- | --- |
| Formula | `Σ EffortRecord.hours WHERE blockedByDependencyId IS NOT NULL` |
| Inputs | `resource:EffortRecord.hours`, `delivery:Dependency` |
| Unit | Hours |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Dependency records with owner and due date; Effort records referencing them |

> In fixed-bid, blocked effort is usually cost we absorb and a commercial claim we do not make. It is the L1 fact behind the customer-dependency cause in MET-FIN-018.

#### MET-DEL-023 — Customer Dependency Ageing

How long unmet customer dependencies have been outstanding.

| Field | Value |
| --- | --- |
| Formula | `max and mean of (t − raisedDate) over open Dependency WHERE owner = CUSTOMER` |
| Inputs | `delivery:Dependency` |
| Unit | Days |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `delivery` |
| Definition owner | Delivery |
| Aggregation | MAX |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Dependency records with raise dates and owners |

---

## 6. Quality & engineering (`quality` context)

#### MET-QUA-001 — Open Defects by Severity

Count of unresolved defects, grouped by severity.

| Field | Value |
| --- | --- |
| Formula | `count(Defect WHERE closedAt IS NULL) GROUP BY severity` |
| Inputs | `quality:Defect` |
| Unit | Count |
| Epistemic level | L1_OBSERVED |
| Authoritative source | QUALITY_SYSTEM |
| Owner context | `quality` |
| Definition owner | Engineering |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Defect records |

#### MET-QUA-002 — Defect Density

Defects found per unit of scope delivered.

| Field | Value |
| --- | --- |
| Formula | `defects found / scope units delivered` |
| Inputs | `quality:Defect`, `delivery:ScopeItem` |
| Unit | Ratio |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `quality` |
| Definition owner | Engineering |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Draft` |
| Evidence expected | Defect records; Scope baseline |

> BLOCKED by MC-8 — **Type A**, inherited from the same undefined scope unit as MET-DEL-012. Owner: Delivery + Engineering. Removed from MET-HLTH-004 in Phase 2 closure and replaced by MET-QUA-010 acceptance blockers, so the quality health dimension is no longer blocked by it.

#### MET-QUA-003 — Escaped Defect Rate

Share of defects found only after release to the client.

| Field | Value |
| --- | --- |
| Formula | `count(Defect WHERE escapedToClient) / count(Defect)` |
| Inputs | `quality:Defect` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `quality` |
| Definition owner | Engineering |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 2.0.0 |
| Status | `Frozen` |
| Evidence expected | Defect records with discovery phase |

> ZERO-POPULATION SEMANTICS (ADR-0028): an empty defect population no longer means one thing. A REPORTING source with zero escaped defects is KNOWN_ZERO -- a healthy observation that scores. An ABSENT or STALE source is NOT_COMPUTABLE and costs the assessment its COMPLETE claim. Previously both were NOT_COMPUTABLE, the null was renormalised out of Product & Quality, and a dead telemetry feed read as excellent quality: Quality 41.67 -> 56.41, composite 68.38 -> 72.21, AMBER -> GREEN while still reporting COMPLETE.

#### MET-QUA-004 — Defect Removal Efficiency

Share of defects caught before release.

| Field | Value |
| --- | --- |
| Formula | `pre-release defects / (pre + post-release defects)` |
| Inputs | `quality:Defect` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `quality` |
| Definition owner | Engineering |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Defect records with discovery phase |

#### MET-QUA-005 — Mean Time to Resolve (S1/S2)

Average hours to close a critical or major defect.

| Field | Value |
| --- | --- |
| Formula | `mean(closedAt − raisedAt) WHERE severity IN (CRITICAL, MAJOR)` |
| Inputs | `quality:Defect` |
| Unit | Hours |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `quality` |
| Definition owner | Engineering |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Defect records with raise and closure timestamps |

#### MET-QUA-006 — Rework Ratio

Share of delivery effort spent redoing work rather than producing new scope.

| Field | Value |
| --- | --- |
| Formula | `Σ EffortRecord.hours WHERE isRework / Σ EffortRecord.hours` |
| Inputs | `resource:EffortRecord.hours` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `quality` |
| Definition owner | Engineering |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Effort records flagged as rework, with the defect or change that caused them |

> The primary bridge between engineering signals and the quality-rework cause in MET-FIN-018.

#### MET-QUA-012 — Excess Rework Cost

Cost of rework above the level assumed when the work was priced.

| Field | Value |
| --- | --- |
| Formula | `(MET-QUA-006 − baseline rework allowance) × MET-FIN-005` |
| Inputs | `MET-QUA-006`, `MET-FIN-005`, `contract:baseline.reworkAllowance` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `quality` |
| Definition owner | Engineering |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | AS_SOLD |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Rework effort records; Baseline rework allowance |

> The quality-rework cause in the margin bridge. Zero when rework is within the priced allowance.

#### MET-QUA-007 — Automated Test Coverage

Automated test coverage as reported by the delivery team.

| Field | Value |
| --- | --- |
| Formula | `QualitySnapshot.testCoverage` |
| Inputs | `quality:QualitySnapshot.testCoverage` |
| Unit | Percent |
| Epistemic level | L1_OBSERVED |
| Authoritative source | QUALITY_SYSTEM |
| Owner context | `quality` |
| Definition owner | Engineering |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Coverage report reference |

#### MET-QUA-008 — Change Failure Rate

Share of releases that required remediation.

| Field | Value |
| --- | --- |
| Formula | `failed changes / total changes in trailing 90d` |
| Inputs | `quality:ReleaseRecord` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `quality` |
| Definition owner | Engineering |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 13 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Release records with outcome |

#### MET-QUA-009 — Defect Backlog Trend

Whether the open-defect count is growing or shrinking.

| Field | Value |
| --- | --- |
| Formula | `least-squares slope of MET-QUA-001 over trailing 8 weekly snapshots` |
| Inputs | `MET-QUA-001` |
| Unit | Count/period |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `quality` |
| Definition owner | Engineering |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Quality snapshots across the window |

#### MET-QUA-010 — Acceptance Blockers

Open issues the client has named as preventing formal acceptance.

| Field | Value |
| --- | --- |
| Formula | `count(AcceptanceItem WHERE blocking AND resolvedAt IS NULL)` |
| Inputs | `quality:AcceptanceItem` |
| Unit | Count |
| Epistemic level | L1_OBSERVED |
| Authoritative source | QUALITY_SYSTEM |
| Owner context | `quality` |
| Definition owner | Engineering |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Acceptance items with client reference and raise date |

> Resolves MC-12. In fixed-bid these gate revenue, so they are an economic signal, not only a quality one.

#### MET-QUA-011 — Acceptance Latency

How long deliverables wait between submission and formal client acceptance.

| Field | Value |
| --- | --- |
| Formula | `mean(acceptedAt − submittedAt) over AcceptanceItem WHERE accepted` |
| Inputs | `quality:AcceptanceItem` |
| Unit | Days |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `quality` |
| Definition owner | Engineering |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Acceptance items with submission and acceptance dates |

> Resolves MC-12. Rising latency with no rise in blockers usually indicates a client-side capacity problem, which is a dependency issue rather than a quality one.

---

## 7. Resource & people (`resource` context)

#### MET-RES-011 — Resource Cost Drift Ratio

Rate-and-mix cost drift as a share of budgeted cost, so the size of the drift is comparable across projects.

| Field | Value |
| --- | --- |
| Formula | `abs(MET-RES-010) / MET-FIN-004` |
| Inputs | `MET-RES-010`, `MET-FIN-004` |
| Unit | Ratio |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `resource` |
| Definition owner | People |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | AS_SOLD |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | MET-RES-010 drift impact; MET-FIN-004 budgeted cost |

> The comparand behind EW-RESOURCE-COST-DRIFT, which previously cited MET-RES-010 -- Money -- while comparing a ratio against 0.03 (DR-065). ABSOLUTE VALUE: the rule fires on drift in either direction, and the denominator is budgeted cost so an absolute dollar threshold does not fire on every large project and never on a small one.

#### MET-RES-001 — Billable Utilisation

Share of available hours booked to billable work.

| Field | Value |
| --- | --- |
| Formula | `billable hours / available hours` |
| Inputs | `resource:EffortRecord.hours` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `resource` |
| Definition owner | People |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Effort records; Assignment availability |

#### MET-RES-002 — Effort Variance

Hours spent against the hours the work actually completed was priced at.

| Field | Value |
| --- | --- |
| Formula | `actual hours − (contract:baseline.plannedEffortHours × physical completion at t)` |
| Inputs | `resource:EffortRecord.hours`, `contract:baseline.plannedEffort`, `delivery:ProgressClaim.physicalCompletion` |
| Unit | Hours |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `resource` |
| Definition owner | People |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 2.0.0 |
| Status | `Frozen` |
| Evidence expected | Effort records; Baseline effort plan; The claimed physical completion the baseline was time-phased by |

> The named baseline is EARNED effort (ADR-0024). It must not be time-phased by planned completion: that asks whether the planned hours have been spent, so a late project books an effort saving for work it has not done. Positive is an overrun. Not computable where no progress has been claimed.

#### MET-RES-003 — Pyramid Ratio

Ratio of senior to junior delivery staff.

| Field | Value |
| --- | --- |
| Formula | `senior FTE / junior FTE (bands per resource config)` |
| Inputs | `resource:Assignment` |
| Unit | Ratio |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `resource` |
| Definition owner | People |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Assignment records with seniority band |

#### MET-RES-004 — Pyramid Drift

How far the delivered staffing shape has moved from what was priced.

| Field | Value |
| --- | --- |
| Formula | `MET-RES-003 − as-sold pyramid ratio` |
| Inputs | `MET-RES-003`, `contract:baseline.pyramidRatio` |
| Unit | Ratio |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `resource` |
| Definition owner | People |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | AS_SOLD |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Assignment records; As-sold staffing model |

> Quietly staffing seniors to hit a date is a canonical fixed-bid margin failure: delivery looks fine, margin does not.

#### MET-RES-005 — Blended Rate Variance

Difference between the actual and as-sold average cost per delivery hour.

| Field | Value |
| --- | --- |
| Formula | `actual blended cost rate − as-sold blended cost rate` |
| Inputs | `resource:EffortRecord`, `financial:ActualCost`, `contract:baseline.blendedRate` |
| Unit | Money/hr |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `resource` |
| Definition owner | People |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | AS_SOLD |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Effort records; Cost ledger; As-sold rate card |

#### MET-RES-010 — Resource Cost Drift Impact

The margin impact of paying more per delivery hour than was priced.

| Field | Value |
| --- | --- |
| Formula | `MET-RES-005 × total delivery hours to date` |
| Inputs | `MET-RES-005`, `resource:EffortRecord.hours` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `resource` |
| Definition owner | People |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | AS_SOLD |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Blended rate variance derivation; Effort records |

> The rate/mix cause in the margin bridge.

#### MET-RES-006 — Attrition Rate (rolling 12m)

Share of the team that has left over the last twelve months.

| Field | Value |
| --- | --- |
| Formula | `leavers / mean headcount` |
| Inputs | `resource:Assignment` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `resource` |
| Definition owner | People |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 52 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Assignment start and end records |

#### MET-RES-007 — Key Person Concentration

Share of critical-path effort delivered by the two largest individual contributors.

| Field | Value |
| --- | --- |
| Formula | `% of critical-path effort delivered by top 2 individuals` |
| Inputs | `resource:EffortRecord` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `resource` |
| Definition owner | People |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Effort records by individual, aggregated |

> Reports a percentage, never a name. Identity is PERSONAL_DATA and is gated separately (SECURITY_MODEL.md §8).

#### MET-RES-008 — Ramp Deficit

Shortfall between planned and actual staffing at the as-of date.

| Field | Value |
| --- | --- |
| Formula | `planned FTE@t − actual FTE@t` |
| Inputs | `resource:Assignment`, `contract:baseline.staffingCurve` |
| Unit | FTE |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `resource` |
| Definition owner | People |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | CURRENT_CONTRACTUAL |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Assignment records; Baseline staffing curve |

#### MET-RES-009 — Open Role Ageing

Average days that unfilled roles have been open.

| Field | Value |
| --- | --- |
| Formula | `mean(t − openedAt) over unfilled roles` |
| Inputs | `resource:OpenRole` |
| Unit | Days |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `resource` |
| Definition owner | People |
| Aggregation | MAX |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Open role records |

---

## 8. Risk (`risk` context)

#### MET-RSK-001 — Risk Exposure (gross)

Probability-weighted financial impact of all open risks, before considering what is already provisioned.

| Field | Value |
| --- | --- |
| Formula | `Σ (Risk.probability × Risk.costImpact) over open risks` |
| Inputs | `risk:Risk.probability`, `risk:Risk.costImpact` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `risk` |
| Definition owner | Risk |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Risk register entries with probability and impact, and who assessed them |

#### MET-RSK-008 — Incremental Risk Exposure

Probability-weighted impact of risks that are not already provisioned inside the estimate to complete.

| Field | Value |
| --- | --- |
| Formula | `Σ (Risk.probability × Risk.costImpact) over open risks WHERE NOT includedInEtc` |
| Inputs | `risk:Risk.probability`, `risk:Risk.costImpact`, `risk:Risk.includedInEtc` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `risk` |
| Definition owner | Risk |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | VAR-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Risk register entries with the IncludedInETC flag and its justification |

> The flag is what prevents double counting. A risk provisioned inside ETC and also deducted from margin is counted twice, which systematically understates the portfolio.

#### MET-RSK-002 — Open Critical Risks

Number of open risks rated critical.

| Field | Value |
| --- | --- |
| Formula | `count(Risk WHERE severity = CRITICAL AND state = OPEN)` |
| Inputs | `risk:Risk` |
| Unit | Count |
| Epistemic level | L1_OBSERVED |
| Authoritative source | DELIVERY_SYSTEM |
| Owner context | `risk` |
| Definition owner | Risk |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Risk register entries |

#### MET-RSK-003 — Risk Proximity

Days until the nearest critical risk could materialise.

| Field | Value |
| --- | --- |
| Formula | `min(Risk.proximityDate) − t WHERE severity = CRITICAL` |
| Inputs | `risk:Risk.proximityDate` |
| Unit | Days |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `risk` |
| Definition owner | Risk |
| Aggregation | MIN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Risk register entries with proximity windows |

#### MET-RSK-004 — Mitigation Coverage

Share of open risks that have an owned, in-date mitigation.

| Field | Value |
| --- | --- |
| Formula | `risks with an owned in-date mitigation / open risks` |
| Inputs | `risk:Risk`, `risk:Mitigation` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `risk` |
| Definition owner | Risk |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Mitigation records with owner and due date |

#### MET-RSK-005 — Overdue Mitigations

Number of mitigations past their due date.

| Field | Value |
| --- | --- |
| Formula | `count(Mitigation WHERE dueDate < t AND NOT complete)` |
| Inputs | `risk:Mitigation` |
| Unit | Count |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `risk` |
| Definition owner | Risk |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Mitigation records |

#### MET-RSK-006 — Risk Register Freshness

Days since the risk register was last updated.

| Field | Value |
| --- | --- |
| Formula | `t − max(Risk.updatedAt)` |
| Inputs | `risk:Risk.updatedAt` |
| Unit | Days |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `risk` |
| Definition owner | Risk |
| Aggregation | MAX |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Risk register update timestamps |

#### MET-RSK-007 — Issue Escalation Rate

How many risks have become live issues recently.

| Field | Value |
| --- | --- |
| Formula | `count(Risk WHERE state transitioned to REALISED in trailing 90d)` |
| Inputs | `risk:Risk.state` |
| Unit | Count |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `risk` |
| Definition owner | Risk |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 13 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Risk state transition records |

---

## 9. Health & RAG (`health` context)

#### MET-HLTH-001 — Financial Health Dimension

How the project's economics are performing against what was sold.

| Field | Value |
| --- | --- |
| Formula | `100 × Σᵢ (wᵢ × normalise(mᵢ, greenEdgeᵢ, redEdgeᵢ)) / Σᵢ wᵢ over [MET-FIN-014, MET-FIN-016, MET-DEL-004, MET-FIN-021], where normalise is piecewise-linear and clamped to [0,1]` |
| Inputs | `MET-FIN-014`, `MET-FIN-016`, `MET-DEL-004`, `MET-FIN-021` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each contributing metric value; The HEALTH-v1 edge and weight parameters in force, by version |

> Frozen in Phase 2 closure (Decision 8, Type B): the normalisation and weighting mechanism is settled, so the metric means something definite. The edge values and weights remain open calibration (MC-3, OQ-4/MC-2) and live in HEALTH-v1 as versioned parameters — changing one changes the number, not the meaning.

#### MET-HLTH-002 — Schedule Health Dimension

Whether the project will deliver by the committed date.

| Field | Value |
| --- | --- |
| Formula | `100 × Σᵢ (wᵢ × normalise(mᵢ, greenEdgeᵢ, redEdgeᵢ)) / Σᵢ wᵢ over [MET-DEL-005, MET-DEL-009, MET-DEL-010, MET-DEL-011], where normalise is piecewise-linear and clamped to [0,1]` |
| Inputs | `MET-DEL-005`, `MET-DEL-009`, `MET-DEL-010`, `MET-DEL-011` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each contributing metric value; The HEALTH-v1 edge and weight parameters in force, by version |

> Frozen in Phase 2 closure (Decision 8, Type B): the normalisation and weighting mechanism is settled, so the metric means something definite. The edge values and weights remain open calibration (MC-3, OQ-4/MC-2) and live in HEALTH-v1 as versioned parameters — changing one changes the number, not the meaning.

#### MET-HLTH-003 — Scope & Commercial Dimension

Whether scope growth is being commercially recovered.

| Field | Value |
| --- | --- |
| Formula | `100 × Σᵢ (wᵢ × normalise(mᵢ, greenEdgeᵢ, redEdgeᵢ)) / Σᵢ wᵢ over [MET-COM-007, MET-COM-008, MET-COM-009, MET-FIN-011], where normalise is piecewise-linear and clamped to [0,1]` |
| Inputs | `MET-COM-007`, `MET-COM-008`, `MET-COM-009`, `MET-FIN-011` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each contributing metric value; The HEALTH-v1 edge and weight parameters in force, by version |

> Frozen in Phase 2 closure (Decision 8, Type B): the normalisation and weighting mechanism is settled, so the metric means something definite. The edge values and weights remain open calibration (MC-3, OQ-4/MC-2) and live in HEALTH-v1 as versioned parameters — changing one changes the number, not the meaning.

#### MET-HLTH-004 — Quality Health Dimension

Whether engineering quality is sustaining delivery or eroding it.

| Field | Value |
| --- | --- |
| Formula | `100 × Σᵢ (wᵢ × normalise(mᵢ, greenEdgeᵢ, redEdgeᵢ)) / Σᵢ wᵢ over [MET-QUA-003, MET-QUA-006, MET-QUA-009, MET-QUA-010], where normalise is piecewise-linear and clamped to [0,1]` |
| Inputs | `MET-QUA-003`, `MET-QUA-006`, `MET-QUA-009`, `MET-QUA-010` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each contributing metric value; The HEALTH-v1 edge and weight parameters in force, by version |

> Frozen in Phase 2 closure (Decision 8, Type B): the normalisation and weighting mechanism is settled, so the metric means something definite. The edge values and weights remain open calibration (MC-3, OQ-4/MC-2) and live in HEALTH-v1 as versioned parameters — changing one changes the number, not the meaning.

#### MET-HLTH-005 — Resource Health Dimension

Whether the team shape and stability can deliver the remaining work.

| Field | Value |
| --- | --- |
| Formula | `100 × Σᵢ (wᵢ × normalise(mᵢ, greenEdgeᵢ, redEdgeᵢ)) / Σᵢ wᵢ over [MET-RES-004, MET-RES-006, MET-RES-007, MET-RES-008], where normalise is piecewise-linear and clamped to [0,1]` |
| Inputs | `MET-RES-004`, `MET-RES-006`, `MET-RES-007`, `MET-RES-008` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each contributing metric value; The HEALTH-v1 edge and weight parameters in force, by version |

> Frozen in Phase 2 closure (Decision 8, Type B): the normalisation and weighting mechanism is settled, so the metric means something definite. The edge values and weights remain open calibration (MC-3, OQ-4/MC-2) and live in HEALTH-v1 as versioned parameters — changing one changes the number, not the meaning.

#### MET-HLTH-006 — Risk Health Dimension

Whether known risk is being actively managed.

| Field | Value |
| --- | --- |
| Formula | `100 × Σᵢ (wᵢ × normalise(mᵢ, greenEdgeᵢ, redEdgeᵢ)) / Σᵢ wᵢ over [MET-RSK-001, MET-RSK-002, MET-RSK-004, MET-RSK-005], where normalise is piecewise-linear and clamped to [0,1]` |
| Inputs | `MET-RSK-001`, `MET-RSK-002`, `MET-RSK-004`, `MET-RSK-005` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each contributing metric value; The HEALTH-v1 edge and weight parameters in force, by version |

> Frozen in Phase 2 closure (Decision 8, Type B): the normalisation and weighting mechanism is settled, so the metric means something definite. The edge values and weights remain open calibration (MC-3, OQ-4/MC-2) and live in HEALTH-v1 as versioned parameters — changing one changes the number, not the meaning.

#### MET-HLTH-010 — Composite Health Score

A single 0-100 score combining the six health dimensions under sponsor-approved weights.

| Field | Value |
| --- | --- |
| Formula | `Σᵈ (MET-HLTH-00d × dimensionWeightᵈ) / Σᵈ dimensionWeightᵈ, d = 1…6, per HealthModelVersion` |
| Inputs | `MET-HLTH-001`, `MET-HLTH-002`, `MET-HLTH-003`, `MET-HLTH-004`, `MET-HLTH-005`, `MET-HLTH-006` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | All six dimension scores; The HealthModelVersion weights in force; Rule version stamp |

> Frozen in Phase 2 closure (Decision 8, Type B). Bounded 0-100 and monotonic in each dimension — both property-tested in Phase 4. The six weights are open calibration (OQ-4/MC-2) and are versioned in HealthModelVersion. **L2_DERIVED**: the score is a mathematical output over observed facts. The epistemic boundary falls immediately after it — banding this score into a verdict (MET-HLTH-011) is a judgement and is L3_ASSESSED (ADR-0014).

#### MET-HLTH-011 — System-Assessed RAG

The status the evidence supports, independent of what was reported.

| Field | Value |
| --- | --- |
| Formula | `RED if any criticalBreachTrigger fires, else RED if MET-HLTH-010 < redThreshold, else AMBER if < amberThreshold, else GREEN` |
| Inputs | `MET-HLTH-010` |
| Unit | RAG |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | DISTRIBUTION |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v1 |
| Effective from | 2026-08-31 |
| Version | 2.0.0 |
| Status | `Frozen` |
| Evidence expected | Composite score; Band thresholds in force; Any critical-breach trigger that fired, named |

> Frozen in Phase 2 closure (Decision 8, Type B). The banding mechanism and the override precedence — a critical breach forces Red regardless of the composite — are the semantic contract; band edges and critical triggers are calibration (MC-3). **L3_ASSESSED** (ADR-0014): this asserts "this project is Amber", which is a verdict about project state, not an arithmetic consequence. A deterministic implementation does not make it L2.

#### MET-HLTH-012 — Reported RAG

The status the delivery team declared.

| Field | Value |
| --- | --- |
| Formula | `StatusReport.reportedRag (latest ≤ t)` |
| Inputs | `health:StatusReport.reportedRag` |
| Unit | RAG |
| Epistemic level | L1_OBSERVED |
| Authoritative source | MANUAL_DECLARATION |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | DISTRIBUTION |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Status report with author and date |

#### MET-HLTH-013 — Effective RAG

The status the organisation is accountable for: an in-date authorised override if one exists, otherwise the system assessment.

| Field | Value |
| --- | --- |
| Formula | `RagOverride.rag WHERE in date, else MET-HLTH-011` |
| Inputs | `MET-HLTH-011`, `health:RagOverride` |
| Unit | RAG |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | DISTRIBUTION |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v1 |
| Effective from | 2026-08-31 |
| Version | 2.0.0 |
| Status | `Frozen` |
| Evidence expected | System assessment; Override with actor, reason, timestamp and expiry if applied |

> Fully specified: an in-date authorised override wins, otherwise the system assessment. Frozen in Phase 2 closure — it was Draft only because MET-HLTH-011 was.

#### MET-HLTH-030 — Status Divergence

How far the reported status is from what the evidence supports. Positive means reported healthier than the evidence.

| Field | Value |
| --- | --- |
| Formula | `band(MET-HLTH-012) − band(MET-HLTH-011), where GREEN=0, AMBER=1, RED=2` |
| Inputs | `MET-HLTH-012`, `MET-HLTH-011` |
| Unit | Score |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | COUNT |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v1 |
| Effective from | 2026-08-31 |
| Version | 2.0.0 |
| Status | `Frozen` |
| Evidence expected | Both RAG values with their derivations |

> The product's flagship signal (PRODUCT_SPEC.md §3.3, AC-2). Must never be averaged into the composite.

#### MET-HLTH-031 — Divergence Persistence

How many consecutive weeks the reported status has been healthier than the evidence.

| Field | Value |
| --- | --- |
| Formula | `consecutive weekly snapshots with MET-HLTH-030 > 0, counting back from t` |
| Inputs | `MET-HLTH-030` |
| Unit | Weeks |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | MAX |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 2 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v1 |
| Effective from | 2026-08-31 |
| Version | 2.0.0 |
| Status | `Frozen` |
| Evidence expected | Divergence values across the snapshot series |

> One week of divergence is noise. Six is a pattern, and the pattern is what makes it actionable.

#### MET-HLTH-032 — Dimension Contribution

How many points each dimension added to or removed from the composite score.

| Field | Value |
| --- | --- |
| Formula | `per dimension d: (MET-HLTH-00d − neutralBaseline) × dimensionWeightᵈ` |
| Inputs | `MET-HLTH-001`, `MET-HLTH-002`, `MET-HLTH-003`, `MET-HLTH-004`, `MET-HLTH-005`, `MET-HLTH-006` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each dimension score and weight |

> The first drill step of the evidence chain (AC-3, REQ-PROJ-002).

#### MET-HLTH-033 — Reported Green Risk

Whether a project is still being REPORTED Green while the system's own evidence says otherwise — either the System-Assessed band is already Amber or Red, or the evidence shows material deterioration.

| Field | Value |
| --- | --- |
| Formula | `MET-HLTH-012 = GREEN AND (MET-HLTH-011 ∈ {AMBER, RED} OR MET-FCST-020 ∈ {DETERIORATING, RAPIDLY_DETERIORATING} OR MET-FCST-022 at 30 or 60 days worse than MET-HLTH-011)` |
| Inputs | `MET-HLTH-012`, `MET-HLTH-011`, `MET-FCST-020`, `MET-FCST-022` |
| Unit | Score |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | COUNT |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v2 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Reported RAG exactly as reported, with the status report behind it; System-Assessed RAG with its evidence; The trajectory or outlook establishing material deterioration, where that is the trigger |

> C-10 RESOLVED by ADR-0018. C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. The counterpart to MET-FCST-025 System Green-at-Risk, and deliberately a **separate** metric: one is about the future (system Green now, predicted to worsen), this one is about a disagreement now (organisation says Green, evidence says otherwise). Collapsing them into a single flag loses the ability to say which is which, and they lead to different conversations — one with a delivery team, one with a reporting line. Curated scenario C is the canonical case and scenario B also fires it. **Reported RAG is L1 observed and is never overwritten, corrected or derived** (PRODUCT_SPEC.md §3.3); this metric records the disagreement, it does not resolve it. Narrower than MET-HLTH-030 Status Divergence, which measures divergence in either direction; this one fires only on reported GREEN, which is the direction that hides a problem.

#### MET-HLTH-021 — Financial Dimension (Executive)

Whether the project will land on the economics that were sold.

| Field | Value |
| --- | --- |
| Formula | `100 × Σᵢ (wᵢ × normalise(mᵢ, greenEdgeᵢ, redEdgeᵢ)) / Σᵢ wᵢ over [MET-FIN-014, MET-FIN-016, MET-FIN-027, MET-FIN-021] (HEALTH-v2 dimension weight 0.40)` |
| Inputs | `MET-FIN-014`, `MET-FIN-016`, `MET-FIN-027`, `MET-FIN-021` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v2 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each contributing metric value, with its own evidence; The HEALTH-v2 edge and weight parameters in force, by version; Any contributing metric that was NOT_COMPUTABLE, named with its reason |

> C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1, amended). The **four HEALTH-v2 executive dimensions** — Financial, Delivery, Scope & Commercial, Product & Quality — are authoritative for MET-HLTH-011 System-Assessed RAG. The six HEALTH-v1 analytical dimensions (MET-HLTH-001…006, 010) are **retained, computable and not deleted**; they are the diagnostic detail view beneath the executive four, and they remain blocked on MC-2 for their own weights. Resource, dependency, acceptance and assurance measures are **drivers and sub-measures feeding these four**, not competing peer-level executive dimensions — MET-DEL-023 dependency ageing feeds Delivery, MET-QUA-010 acceptance blockers feed Product & Quality. Data confidence is reported beside health and never becomes a fifth dimension (PRODUCT_SPEC.md §3.4). **Frozen**: the mechanism is settled. The four weights (0.40 / 0.25 / 0.20 / 0.15) and every normalisation edge remain **open calibration (Type B)** and live in the HEALTH-v2 rule set as versioned parameters — changing one changes the number, not the meaning.

#### MET-HLTH-022 — Delivery Dimension (Executive)

Whether the committed scope will arrive by the committed date.

| Field | Value |
| --- | --- |
| Formula | `100 × Σᵢ (wᵢ × normalise(mᵢ, greenEdgeᵢ, redEdgeᵢ)) / Σᵢ wᵢ over [MET-DEL-005, MET-DEL-011, MET-DEL-018, MET-DEL-010] (HEALTH-v2 dimension weight 0.25)` |
| Inputs | `MET-DEL-005`, `MET-DEL-011`, `MET-DEL-018`, `MET-DEL-010` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v2 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each contributing metric value, with its own evidence; The HEALTH-v2 edge and weight parameters in force, by version; Any contributing metric that was NOT_COMPUTABLE, named with its reason |

> C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1, amended). The **four HEALTH-v2 executive dimensions** — Financial, Delivery, Scope & Commercial, Product & Quality — are authoritative for MET-HLTH-011 System-Assessed RAG. The six HEALTH-v1 analytical dimensions (MET-HLTH-001…006, 010) are **retained, computable and not deleted**; they are the diagnostic detail view beneath the executive four, and they remain blocked on MC-2 for their own weights. Resource, dependency, acceptance and assurance measures are **drivers and sub-measures feeding these four**, not competing peer-level executive dimensions — MET-DEL-023 dependency ageing feeds Delivery, MET-QUA-010 acceptance blockers feed Product & Quality. Data confidence is reported beside health and never becomes a fifth dimension (PRODUCT_SPEC.md §3.4). **Frozen**: the mechanism is settled. The four weights (0.40 / 0.25 / 0.20 / 0.15) and every normalisation edge remain **open calibration (Type B)** and live in the HEALTH-v2 rule set as versioned parameters — changing one changes the number, not the meaning.

#### MET-HLTH-023 — Scope & Commercial Dimension (Executive)

Whether scope growth is being commercially recovered rather than absorbed.

| Field | Value |
| --- | --- |
| Formula | `100 × Σᵢ (wᵢ × normalise(mᵢ, greenEdgeᵢ, redEdgeᵢ)) / Σᵢ wᵢ over [MET-COM-007, MET-COM-008, MET-COM-009, MET-FIN-011] (HEALTH-v2 dimension weight 0.20)` |
| Inputs | `MET-COM-007`, `MET-COM-008`, `MET-COM-009`, `MET-FIN-011` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v2 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each contributing metric value, with its own evidence; The HEALTH-v2 edge and weight parameters in force, by version; Any contributing metric that was NOT_COMPUTABLE, named with its reason |

> C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1, amended). The **four HEALTH-v2 executive dimensions** — Financial, Delivery, Scope & Commercial, Product & Quality — are authoritative for MET-HLTH-011 System-Assessed RAG. The six HEALTH-v1 analytical dimensions (MET-HLTH-001…006, 010) are **retained, computable and not deleted**; they are the diagnostic detail view beneath the executive four, and they remain blocked on MC-2 for their own weights. Resource, dependency, acceptance and assurance measures are **drivers and sub-measures feeding these four**, not competing peer-level executive dimensions — MET-DEL-023 dependency ageing feeds Delivery, MET-QUA-010 acceptance blockers feed Product & Quality. Data confidence is reported beside health and never becomes a fifth dimension (PRODUCT_SPEC.md §3.4). **Frozen**: the mechanism is settled. The four weights (0.40 / 0.25 / 0.20 / 0.15) and every normalisation edge remain **open calibration (Type B)** and live in the HEALTH-v2 rule set as versioned parameters — changing one changes the number, not the meaning.

#### MET-HLTH-024 — Product Quality Dimension (Executive)

Whether engineering quality is sustaining delivery or quietly consuming it.

| Field | Value |
| --- | --- |
| Formula | `100 × Σᵢ (wᵢ × normalise(mᵢ, greenEdgeᵢ, redEdgeᵢ)) / Σᵢ wᵢ over [MET-QUA-003, MET-QUA-006, MET-QUA-009, MET-QUA-010] (HEALTH-v2 dimension weight 0.15)` |
| Inputs | `MET-QUA-003`, `MET-QUA-006`, `MET-QUA-009`, `MET-QUA-010` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v2 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each contributing metric value, with its own evidence; The HEALTH-v2 edge and weight parameters in force, by version; Any contributing metric that was NOT_COMPUTABLE, named with its reason |

> C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1, amended). The **four HEALTH-v2 executive dimensions** — Financial, Delivery, Scope & Commercial, Product & Quality — are authoritative for MET-HLTH-011 System-Assessed RAG. The six HEALTH-v1 analytical dimensions (MET-HLTH-001…006, 010) are **retained, computable and not deleted**; they are the diagnostic detail view beneath the executive four, and they remain blocked on MC-2 for their own weights. Resource, dependency, acceptance and assurance measures are **drivers and sub-measures feeding these four**, not competing peer-level executive dimensions — MET-DEL-023 dependency ageing feeds Delivery, MET-QUA-010 acceptance blockers feed Product & Quality. Data confidence is reported beside health and never becomes a fifth dimension (PRODUCT_SPEC.md §3.4). **Frozen**: the mechanism is settled. The four weights (0.40 / 0.25 / 0.20 / 0.15) and every normalisation edge remain **open calibration (Type B)** and live in the HEALTH-v2 rule set as versioned parameters — changing one changes the number, not the meaning.

#### MET-HLTH-020 — Executive Composite Health Score

A single 0-100 score over the four executive dimensions, used for ranking and never as the headline verdict.

| Field | Value |
| --- | --- |
| Formula | `100 × Σᵈ (MET-HLTH-02d × weightᵈ) / Σᵈ weightᵈ over the dimensions that were computable, d = 1…4, per HEALTH-v2` |
| Inputs | `MET-HLTH-021`, `MET-HLTH-022`, `MET-HLTH-023`, `MET-HLTH-024` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `health` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | HEALTH-v2 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | All four dimension scores; The HEALTH-v2 weights in force; Rule version stamp; Any dimension excluded for non-computability, named |

> C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1, amended). The **four HEALTH-v2 executive dimensions** — Financial, Delivery, Scope & Commercial, Product & Quality — are authoritative for MET-HLTH-011 System-Assessed RAG. The six HEALTH-v1 analytical dimensions (MET-HLTH-001…006, 010) are **retained, computable and not deleted**; they are the diagnostic detail view beneath the executive four, and they remain blocked on MC-2 for their own weights. Resource, dependency, acceptance and assurance measures are **drivers and sub-measures feeding these four**, not competing peer-level executive dimensions — MET-DEL-023 dependency ageing feeds Delivery, MET-QUA-010 acceptance blockers feed Product & Quality. Data confidence is reported beside health and never becomes a fifth dimension (PRODUCT_SPEC.md §3.4). **Frozen**: the mechanism is settled. The four weights (0.40 / 0.25 / 0.20 / 0.15) and every normalisation edge remain **open calibration (Type B)** and live in the HEALTH-v2 rule set as versioned parameters — changing one changes the number, not the meaning. Renormalised over computable dimensions only, so one missing fact domain lowers confidence rather than dragging the score toward zero — a silent zero would be a fabricated measurement. **L2_DERIVED**: banding it into a verdict is MET-HLTH-011 and is L3 (ADR-0014).

---

## 10. Forecast & trajectory (`forecast` context)

#### MET-FCST-001 — Health Trajectory

The direction and speed at which the composite health score is moving.

| Field | Value |
| --- | --- |
| Formula | `least-squares slope of MET-HLTH-010 over trailing 8 weekly snapshots` |
| Inputs | `MET-HLTH-010` |
| Unit | Score |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | The eight weekly snapshots that produced the slope, named individually |

> L3 inferred despite being deterministic — a projection about the future is a judgement (ADR-0004 §Consequences, ADR-0011).

#### MET-FCST-002 — Deterioration Flag

True when a currently-Green project is on a declining trajectory. The definition of a deteriorating green.

| Field | Value |
| --- | --- |
| Formula | `MET-FCST-001 ≤ deteriorationSlopeThreshold AND MET-HLTH-013 = GREEN` |
| Inputs | `MET-FCST-001`, `MET-HLTH-013` |
| Unit | Boolean |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | COUNT |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Trajectory slope with its window; Effective RAG |

> Frozen in Phase 2 closure (Decision 8, Type B). What it means — a currently-Green project whose health is declining at or beyond a threshold rate — is settled. The threshold value is calibrated against the generated portfolio in Phase 3 (MC-6) and is a versioned TRAJECTORY-v1 parameter.

#### MET-FCST-003 — Weeks to Amber

At the current rate of decline, how long before the project crosses into Amber.

| Field | Value |
| --- | --- |
| Formula | `(MET-HLTH-010 − amberThreshold) / \|MET-FCST-001\| when MET-FCST-001 < 0, else NOT_COMPUTABLE` |
| Inputs | `MET-HLTH-010`, `MET-FCST-001` |
| Unit | Weeks |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | MIN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Composite score; Trajectory slope; Amber threshold in force |

#### MET-FCST-004 — Margin Trajectory

The direction and speed at which forecast margin is moving.

| Field | Value |
| --- | --- |
| Formula | `least-squares slope of MET-FIN-014 over trailing 8 weekly snapshots` |
| Inputs | `MET-FIN-014` |
| Unit | PercentagePoints |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | The eight snapshots that produced the slope |

#### MET-FCST-005 — Projected Outturn Margin

Where margin lands at completion if the current trend continues.

| Field | Value |
| --- | --- |
| Formula | `clamp(MET-FIN-014 + MET-FCST-004 × weeksRemainingToForecastCompletion, outturnFloor, outturnCeiling)` |
| Inputs | `MET-FIN-014`, `MET-FCST-004` |
| Unit | Percent |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Current margin; Margin trajectory; Remaining duration |

> Must never be rendered with the authority of MET-FIN-014.

#### MET-FCST-006 — Signal Confluence

How many health dimensions are deteriorating at the same time.

| Field | Value |
| --- | --- |
| Formula | `count of MET-HLTH-001…006 with a negative slope over trailing 8 snapshots` |
| Inputs | `MET-HLTH-001`, `MET-HLTH-002`, `MET-HLTH-003`, `MET-HLTH-004`, `MET-HLTH-005`, `MET-HLTH-006` |
| Unit | Count |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | MAX |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Per-dimension slopes across the window |

> One dimension declining is a problem; four declining together is usually the same problem seen from four angles.

#### MET-FCST-007 — Intervention Window

How long remains to act before intervention stops being able to change the outcome.

| Field | Value |
| --- | --- |
| Formula | `MET-FCST-003 − interventionLeadTimeWeeks` |
| Inputs | `MET-FCST-003` |
| Unit | Weeks |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | MIN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Weeks to amber; Lead-time assumption in force |

#### MET-FCST-010 — Silent Deterioration Index

How likely a currently-Green project is to become Red while there is still time to act. The product's north-star ranking signal.

| Field | Value |
| --- | --- |
| Formula | `100 × (wₛ×n(−MET-FCST-001, slopeScale) + w_d×n(MET-HLTH-030, 2) + w_p×n(MET-HLTH-031, persistenceScale) + w_c×n(MET-FCST-006, 6)) / (wₛ+w_d+w_p+w_c), where n(v,s) = clamp(v/s, 0, 1)` |
| Inputs | `MET-FCST-001`, `MET-HLTH-030`, `MET-HLTH-031`, `MET-FCST-006` |
| Unit | Score |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | All four component values with their windows; TRAJECTORY-v1 weights and scales in force |

> Frozen in Phase 2 closure (Decision 8, Type B): the four components, their normalisation and their combination are settled. Weights and scales are calibration (MC-6), tuned against the generated portfolio in Phase 3. L3_ASSESSED and must be structurally labelled as such — it may never be presented with the authority of a computed margin figure.

#### MET-FCST-020 — Trajectory State

Which way the project is moving — improving, stable, deteriorating, or deteriorating rapidly — independent of where it currently stands.

| Field | Value |
| --- | --- |
| Formula | `RAPIDLY_DETERIORATING if \|materially adverse signals\| ≥ rapidConfluenceThreshold; else DETERIORATING if ≥ 1; else IMPROVING if more than half of computable signals improve; else STABLE` |
| Inputs | `MET-FCST-021`, `MET-FCST-006` |
| Unit | Score |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | DISTRIBUTION |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 3 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Every signal series with its window and observation count; Each signal slope, and which crossed its material-adverse threshold; Signals excluded for insufficient history, named with their minimum |

> C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. Deliberately never reads the current RAG band: a Green project falling and a Red project recovering are the two cases this product exists to tell apart, and deriving trajectory from the band would collapse them. Reports STABLE when nothing has enough history — absence of evidence of movement, which the explanation states rather than implying movement was ruled out.

#### MET-FCST-021 — Signal Trend Slope

How fast one signal is moving, per period, over its approved observation window.

| Field | Value |
| --- | --- |
| Formula | `least-squares slope of the signal over its TrajectoryObservationPolicy window; NOT_COMPUTABLE below the policy minimum observations` |
| Inputs | `rules:TrajectoryObservationPolicy` |
| Unit | Ratio |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 3 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | The observations used, in order, with their periods; The policy version applied |

> C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. Returns NOT_COMPUTABLE rather than a slope when the window is short: a line through two points is not a trend, and reporting it as one is how a forecast acquires confidence it has not earned.

#### MET-FCST-022 — Forward Outlook Band

The band the project is expected to be in at 30, 60 and optionally 90 days if nothing intervenes.

| Field | Value |
| --- | --- |
| Formula | `degrade(currentBand, floor(stepsPerHorizon(MET-FCST-020) × horizonPeriods)), stepsPerHorizon = 1 for RAPIDLY_DETERIORATING, 0.5 for DETERIORATING, else 0` |
| Inputs | `MET-FCST-020`, `MET-HLTH-011` |
| Unit | RAG |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | DISTRIBUTION |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 3 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | The trajectory state and the signals behind it; The current band; The stated assumption that nothing intervenes; Confidence for the horizon |

> C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. **Rules-based, not a model.** PRODUCT_SPEC.md §4.2 defers ML forecasting, and a fitted curve nobody can interrogate would fail AC-3. Confidence decreases with horizon by design; a 90-day statement is worth less than a 30-day one and must not be presented as though it were not.

#### MET-FCST-025 — System Green-at-Risk

Whether a project the SYSTEM currently assesses as healthy is predicted to deteriorate to Amber or Red within 30 or 60 days, while there is still time to act.

| Field | Value |
| --- | --- |
| Formula | `MET-HLTH-011 = GREEN AND (MET-FCST-022@30d ∈ {AMBER, RED} OR MET-FCST-022@60d ∈ {AMBER, RED}); interventionWindowOpen = MET-FCST-007 ≥ minimumInterventionWeeks` |
| Inputs | `MET-HLTH-011`, `MET-FCST-022`, `MET-FCST-007` |
| Unit | Score |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | COUNT |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 3 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | The System-Assessed band with its evidence; The forward outlook at 30 and 60 days, with the trajectory beneath it; Every contributing reason with its metric and evidence, where any cleared its threshold; Weeks remaining before the projected band change; Data confidence, reported separately and never blended in |

> C-10 RESOLVED by ADR-0018. C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. "Green" here means **System-Assessed** (MET-HLTH-011), and the trigger is the **approved forward outlook** at 30 or 60 days rather than the raw trajectory state. Reported RAG plays no part: a project reported Green while the system already says Amber is MET-HLTH-033 Reported Green Risk, a different and separately reported finding. The two are never collapsed. **The former "≥ 1 stated reason" condition was removed** — it gated on economics signals and so made schedule-led deterioration (curated scenario LR) structurally undetectable; reasons are now supporting evidence, and the outlook carries its own. This is the product's differentiator (PRODUCT_SPEC.md §1.1). The intervention window is reported separately from the determination on purpose: a Green project that will be Red next week is a finding, but it is not an opportunity, and presenting the two identically would waste the executive attention this product is competing for.

#### MET-FCST-026 — Economic Exposure at Risk

The margin value that would be lost between today's forecast and the projected outturn if the trajectory continues.

| Field | Value |
| --- | --- |
| Formula | `MET-FIN-024 − (MET-FCST-005 × MET-FIN-010), floored at zero` |
| Inputs | `MET-FIN-024`, `MET-FCST-005`, `MET-FIN-010` |
| Unit | Money |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | FORECAST |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 3 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Current forecast GM $; Projected outturn margin and its window; FX rate with date and source |

> C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. L3 because the projected outturn it rests on is an inference. It is therefore never presented with the authority of MET-FIN-024, which is arithmetic over observed cost.

#### MET-FCST-030 — Late Detection Rate

The share of projects that reached System-Assessed RED without a prior Amber band or a prior fired early warning.

| Field | Value |
| --- | --- |
| Formula | `count(project WHERE first RED period has neither an AMBER prior period nor a fired EARLY-WARNING rule at that prior period) / count(project reaching RED)` |
| Inputs | `MET-HLTH-011` |
| Unit | Percent |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `forecast` |
| Definition owner | Delivery Intelligence |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | EARLY_WARNING-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each project reaching RED, with the period it first did; The band and fired warnings at the immediately prior period; The early-warning rule set version in force |

> L3 because it rests on MET-HLTH-011, itself an assessment, and on the early-warning rule set. A zero denominator is NOT_COMPUTABLE and never 0%: no project reaching Red is an absence of cases, not a perfect detection record. Deliberately uncomfortable — it is the measure of whether the product prevents failures or merely records them.

---

## 11. Data quality & confidence (`data-quality` context)

#### MET-DQ-001 — Completeness

Share of required fields that are actually populated.

| Field | Value |
| --- | --- |
| Formula | `Σ populatedRequiredFields / Σ expectedRequiredFields across domain probes` |
| Inputs | `data-quality:DomainObservation` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `data-quality` |
| Definition owner | Assurance |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Per-domain probe observations |

#### MET-DQ-002 — Freshness

How many days since each source domain last supplied data.

| Field | Value |
| --- | --- |
| Formula | `max over domains of (t − mostRecentUpdateAt)` |
| Inputs | `data-quality:DomainObservation` |
| Unit | Days |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `data-quality` |
| Definition owner | Assurance |
| Aggregation | MAX |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Per-domain last-update timestamps; Source freshness state |

#### MET-DQ-003 — Consistency

Share of cross-domain reconciliation assertions that pass.

| Field | Value |
| --- | --- |
| Formula | `Σ assertionsPassed / Σ assertionsEvaluated` |
| Inputs | `data-quality:DomainObservation` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `data-quality` |
| Definition owner | Assurance |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each assertion, its inputs, and its outcome |

> Example assertion: invoiced ≤ recognised + tolerance. A failing assertion names both sides.

#### MET-DQ-004 — Source Coverage

Share of expected source domains that are reporting at all.

| Field | Value |
| --- | --- |
| Formula | `domains reporting / domains expected` |
| Inputs | `data-quality:DomainObservation` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `data-quality` |
| Definition owner | Assurance |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Expected domain list; Domains that reported |

#### MET-DQ-005 — Data Confidence Score

How much the underlying data can be relied on, banded High, Medium or Low.

| Field | Value |
| --- | --- |
| Formula | `weighted composite of MET-DQ-001…004 per DQ-v1, banded` |
| Inputs | `MET-DQ-001`, `MET-DQ-002`, `MET-DQ-003`, `MET-DQ-004` |
| Unit | Score |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `data-quality` |
| Definition owner | Assurance |
| Aggregation | DISTRIBUTION |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | DQ-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | All four component values; DQ-v1 weights in force |

#### MET-DQ-006 — Confidence-Qualified Health

Health and confidence presented together as a pair, so an unreliable Green is never mistaken for a confident one.

| Field | Value |
| --- | --- |
| Formula | `(MET-HLTH-010, band(MET-DQ-005)) — a tuple, never a product` |
| Inputs | `MET-HLTH-010`, `MET-DQ-005` |
| Unit | Tuple |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `data-quality` |
| Definition owner | Assurance |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Both values with their own evidence |

> Deliberately a tuple. Multiplying health by confidence would let an unreliable Green and a confident Amber collapse to the same number, destroying the distinction PRODUCT_SPEC.md §3.4 exists to preserve. Any implementation that blends them is a defect.

#### MET-DQ-007 — Forecast Confidence

How much the project's own forecast can be relied on, based on its track record of revision and estimating accuracy.

| Field | Value |
| --- | --- |
| Formula | `weighted composite of MET-DEL-014 (replan frequency), MET-FIN-030 (ETC optimism gap) and MET-DEL-013 (velocity stability) per DQ-v1` |
| Inputs | `MET-DEL-014`, `MET-FIN-030`, `MET-DEL-013` |
| Unit | Score |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `data-quality` |
| Definition owner | Assurance |
| Aggregation | DISTRIBUTION |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | DQ-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | All three component values |

> Distinct from MET-DQ-005: data confidence asks whether the inputs are trustworthy, forecast confidence asks whether this team's estimates have historically been.

#### MET-DQ-008 — Validity

Share of supplied values that are within their declared domain — a date that is a date, a percentage between 0 and 100, a currency that exists.

| Field | Value |
| --- | --- |
| Formula | `Σ valuesPassingDomainRules / Σ valuesChecked across domain probes` |
| Inputs | `data-quality:DomainObservation` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `data-quality` |
| Definition owner | Assurance |
| Aggregation | WEIGHTED_MEAN |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each domain rule evaluated; Each violating value, named by field |

> Carried a C-7 block tag in Phase 4. That tag was over-broad: a domain-validity ratio does not depend on which health model the organisation is accountable to, and no other blocker was ever named against it. C-7 is resolved at Phase 7 closure (ADR-0015 D-1, amended) and this metric is Frozen on its own terms. Distinct from MET-DQ-001 completeness and MET-DQ-003 consistency: a field can be present (complete) and reconcile across domains (consistent) while still holding a value that cannot be true.

#### MET-DQ-009 — Forecast Reliability Profile

A named breakdown of the conditions that make this project's own forecast more or less believable, reported as factors rather than one number.

| Field | Value |
| --- | --- |
| Formula | `the vector [etcFreshnessDays, etcCoverage, scopeStability, milestoneAccuracy, openCustomerDependencies, resourceStability, MET-DEL-021] with each factor banded against DQ-v1 edges — a profile, never a product` |
| Inputs | `MET-FIN-007`, `MET-COM-008`, `MET-DEL-009`, `MET-DEL-023`, `MET-RES-006`, `MET-DEL-021` |
| Unit | Tuple |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `data-quality` |
| Definition owner | Assurance |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | DQ-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Draft` |
| Evidence expected | Each factor with its observed value and its band; Each factor that could not be evaluated, named with its reason |

> BLOCKED by CONFLICT C-9 / ADR-0015 — **Type A**. Owner: Assurance. Phase 4 direction lists seven forecast-reliability factors; the Frozen MET-DQ-007 formula names three different ones (MET-DEL-014, MET-FIN-030, MET-DEL-013). Rewriting a frozen formula to match a prompt is the silent change invariant 3 forbids, so both exist: MET-DQ-007 stays authoritative and unchanged, and this profile is registered separately and reported as factors. Deliberately a tuple, for the same reason MET-DQ-006 is: collapsing seven named conditions into one score tells an executive a number is low without telling them which condition to fix.

---

## 12. Portfolio aggregates (`portfolio` context)

#### MET-PORT-001 — Portfolio Contract Value

Total contracted value across the projects the caller is authorised to see.

| Field | Value |
| --- | --- |
| Formula | `Σ MET-FIN-002 over authorised projects, converted to the reporting currency` |
| Inputs | `MET-FIN-002` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `portfolio` |
| Definition owner | Delivery Intelligence |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Per-project contract values; FX rates with dates and source |

> Computed over the caller's authorised entity set, never globally then filtered (ADR-0005 §5).

#### MET-PORT-002 — Portfolio Forecast Margin

Margin percentage across the authorised portfolio, weighted by revenue.

| Field | Value |
| --- | --- |
| Formula | `(Σ MET-FIN-010 − Σ MET-FIN-008) / Σ MET-FIN-010` |
| Inputs | `MET-FIN-010`, `MET-FIN-008` |
| Unit | Percent |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `portfolio` |
| Definition owner | Delivery Intelligence |
| Aggregation | RECOMPUTE_FROM_INPUTS |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Per-project revenue and EAC; FX rates |

> A weighted margin, not an average of project margins. Averaging percentages across projects of different sizes is a classic and highly visible error; a controller will spot it immediately. Golden test required.

#### MET-PORT-003 — Portfolio Value at Risk

Total margin at risk across the authorised portfolio, counting each project exactly once.

| Field | Value |
| --- | --- |
| Formula | `Σ MET-FIN-019 over distinct authorised eligible projects, each counted exactly once` |
| Inputs | `MET-FIN-019` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `portfolio` |
| Definition owner | Delivery Intelligence |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | AS_SOLD |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | VAR-v1 |
| Effective from | 2026-08-31 |
| Version | 2.0.0 |
| Status | `Frozen` |
| Evidence expected | Per-project MET-FIN-019, one row per distinct project; The count of distinct projects summed; Shared-cause concentration, reported separately and marked non-additive |

> CORRECTED at the pre-Phase-11 architectural closure (ADR-0023, superseding ADR-0021). The v1.0.0 formula subtracted a shared-riskCauseKey group total less its largest member, and that subtraction was economically unsupported: MET-FIN-019 is one project's own margin, so two projects hold disjoint pools of money and there is nothing to de-duplicate between them. A shared cause key is a CATEGORY, not an identifier for one monetary event — the risk model carries no shared-exposure id, allocation amount or allocation basis, so cause identity cannot distinguish six separate losses from one root cause from one loss booked six times. On the demo portfolio the old rule removed $38.93M of 89.19M — real exposure, understated by 44%. Shared cause is systemic CONCENTRATION and is reported beside this figure as explicitly non-additive diagnostics, never subtracted from it. A future cross-project reduction requires the explicit monetary allocation fact model in ADR-0023 D-4; cause identity remains permanently insufficient.

#### MET-PORT-004 — RAG Distribution

How many authorised projects sit in each status band, split by reported and system-assessed.

| Field | Value |
| --- | --- |
| Formula | `counts of MET-HLTH-012 and MET-HLTH-011 by band` |
| Inputs | `MET-HLTH-012`, `MET-HLTH-011` |
| Unit | BandDistribution |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `portfolio` |
| Definition owner | Delivery Intelligence |
| Aggregation | DISTRIBUTION |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 2.0.0 |
| Status | `Frozen` |
| Evidence expected | Per-project RAG values |

> Shown as two distributions side by side, never merged — the gap between them is the portfolio-level view of MET-HLTH-030.

#### MET-PORT-005 — Divergent Project Count

How many projects are reporting healthier than their evidence supports.

| Field | Value |
| --- | --- |
| Formula | `count(projects WHERE MET-HLTH-030 > 0)` |
| Inputs | `MET-HLTH-030` |
| Unit | Count |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `portfolio` |
| Definition owner | Delivery Intelligence |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 2.0.0 |
| Status | `Frozen` |
| Evidence expected | Per-project divergence values |

#### MET-PORT-006 — Deteriorating Greens

How many currently-Green projects are on a declining trajectory. The portfolio expression of the product's differentiator.

| Field | Value |
| --- | --- |
| Formula | `count(projects WHERE MET-FCST-002)` |
| Inputs | `MET-FCST-002` |
| Unit | Count |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `portfolio` |
| Definition owner | Delivery Intelligence |
| Aggregation | SUM |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | TRAJECTORY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Per-project deterioration flags with their trajectory windows |

> L3_ASSESSED: counting inferred flags produces an inferred count. Reclassified in Phase 2 closure — an L2 metric may not rest on an L3 input (Decision 6, Step 5).

#### MET-PORT-007 — Executive Intervention Priority Rank

The order in which projects should receive scarce executive attention this week.

| Field | Value |
| --- | --- |
| Formula | `LEXICOGRAPHIC ordering over seven tiers, first difference decides: (1) critical economic or contractual exposure — contractualPenaltyExposure > 0 OR forecastContractLoss > 0 OR (MET-HLTH-011 = RED AND MET-FIN-019 ≥ criticalGmValueAtRiskFloor); (2) predicted deterioration — MET-FCST-025 OR MET-FCST-022 at 30 or 60 days worse than MET-HLTH-011; (3) time criticality — min(MET-FCST-007, weeksToCriticalMilestone) ascending, unknown last; (4) MET-FIN-019 descending; (5) actionability grade descending (CREDIBLE_PLAN > PLAN_FORMING > NO_PLAN > NOT_ASSESSED); (6) rank confidence descending; (7) projectId ascending` |
| Inputs | `MET-HLTH-011`, `MET-FIN-019`, `MET-FCST-025`, `MET-FCST-022`, `MET-FCST-007`, `MET-DQ-005`, `MET-DQ-007` |
| Unit | Rank |
| Epistemic level | L3_ASSESSED |
| Authoritative source | RULE_ENGINE |
| Owner context | `portfolio` |
| Definition owner | Delivery Intelligence |
| Aggregation | NOT_AGGREGATABLE |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_COMPUTABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | 8 weekly snapshots |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | PRIORITY-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Every tier value per project, with the tier that decided each adjacent pair; Named evidence gaps where a project was placed on partial evidence; Actionability grade with the plan records behind it; PRIORITY-v1 parameters in force |

> MC-5 RESOLVED by ADR-0019 — the semantic gap that blocked this metric is closed, and the ordering is implemented, deterministic and explainable. It remains Draft because it is now C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. Tiers 1 and 2 consume MET-HLTH-011 and MET-FCST-025, and which health model produces the band is still unsettled. That is an input question, not an ordering question — the rank function no longer throws, and Phase 7 can build against it. "Intervenability" was never one thing: it conflated **exposure/urgency** (how bad, how soon — observed or derived) with **actionability** (is there a credible plan — evidenced by an owner, a date and a stated benefit). Separating them made the metric definable. **Lexicographic, not weighted**, so a hard risk cannot be buried by an average: a crystallising contractual penalty outranks any amount of GM value at risk, and no reader has to trust a hidden weight to see why. Actionability sits at tier 5, below every exposure tier, so a small problem with a good plan can never outrank a large problem without one. Deterministic and replayable (AC-7); the ordering is antisymmetric and transitive by test. Missing evidence lowers rank confidence and names the gap; a project with no evaluable tier is listed separately rather than sorted last, because an unmeasured project is not a safe one. **No composite score is emitted anywhere** — CLAUDE.md invariant 9 and PRODUCT_SPEC.md §8. The floor and horizon remain synthetic calibration candidates.

#### MET-PORT-008 — Portfolio Confidence

How data confidence is distributed across the authorised portfolio.

| Field | Value |
| --- | --- |
| Formula | `distribution of band(MET-DQ-005) across authorised projects` |
| Inputs | `MET-DQ-005` |
| Unit | BandDistribution |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `portfolio` |
| Definition owner | Delivery Intelligence |
| Aggregation | DISTRIBUTION |
| Currency behaviour | NONE |
| Baseline | — |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | DQ-v1 |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Per-project confidence bands |

#### MET-PORT-009 — Portfolio Forecast Loss Exposure

The total forecast loss across projects expected to complete below cost — the money the organisation expects to lose, not the margin it expects to miss.

| Field | Value |
| --- | --- |
| Formula | `Σ max(0, −MET-FIN-024) over in-scope authorised projects` |
| Inputs | `MET-FIN-024` |
| Unit | Money |
| Epistemic level | L2_DERIVED |
| Authoritative source | DERIVED |
| Owner context | `portfolio` |
| Definition owner | Delivery Intelligence |
| Aggregation | SUM |
| Currency behaviour | FX_CONVERT_REQUIRED |
| Baseline | FORECAST |
| Zero denominator | NOT_APPLICABLE |
| Missing input | NOT_COMPUTABLE |
| Minimum history | none |
| Contract types | FIXED_BID, TIME_AND_MATERIALS, CAPACITY |
| Rule set | — |
| Effective from | 2026-08-31 |
| Version | 1.0.0 |
| Status | `Frozen` |
| Evidence expected | Each loss-making project with its forecast GM; The count of projects contributing, so a single large loss is distinguishable from many small ones |

> Registered at Phase 7 closure because no canonical metric expressed the concept and the command centre was reporting it under MET-FIN-024 — the ID for **Forecast GM $**, a different and much larger figure. Sharing one ID between "forecast margin" and "forecast loss" would have made two opposite numbers indistinguishable in traceability. **Downside only**: a profitable project contributes zero, never a negative offset, because a portfolio loss exposure that nets off against healthy projects understates exactly the thing it exists to surface. Distinct from MET-FIN-032 Risk-Adjusted GM $ (which prices unrealised risk) and from contractual penalty exposure (a liability, not a margin outcome).

---

## 13. Definition change log

Global invariant 3 forbids changing a formula *silently*. `METRIC_CATALOG.md` §1.3 permits a `Draft` definition to change in Phase 2 — this is the record of every one that did.

### Version bumps

| Metric | Version | Effective | Formula | Reason |
| --- | --- | --- | --- | --- |
| MET-QUA-003 | 1.0.0 | 2026-08-29 | `escaped defects / all defects` | Phase 0 baseline. An empty defect population was NOT_COMPUTABLE, without asking why it was empty. |
| MET-QUA-003 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `escaped defects / all defects, with KNOWN_ZERO where a reporting source observes none and NOT_COMPUTABLE where the source is absent or stale` | ADR-0028. `defects.length === 0` covered two opposite realities -- a source reporting zero escaped defects, and no defect telemetry at all -- and the health model dropped the resulting null and renormalised Product & Quality upward. A dead feed therefore read as excellent quality and turned an AMBER project GREEN while still reporting COMPLETE. Major bump because the empty-population result changes meaning. |
| MET-DEL-018 | 1.0.0 | 2026-08-29 | `MET-DEL-020 / MET-DEL-019` | Phase 0 baseline. A zero denominator returned NOT_COMPUTABLE without asking why it was zero. |
| MET-DEL-018 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `MET-DEL-020 / MET-DEL-019, with an explicit UNBOUNDED state where MET-DEL-019 is an observed zero and MET-DEL-020 > 0` | ADR-0027. An observed zero demonstrated velocity is DATA, not absence, and returning NOT_COMPUTABLE for it let a stalled project drop out of the Delivery dimension: the remaining inputs renormalised upward, Delivery scored 100.00, and a Fixed-Bid project with zero progress across the whole 8-week window, 40% complete and 200 days remaining, was assessed GREEN with a COMPLETE four-dimension assessment. The metric now distinguishes UNKNOWN (NOT_COMPUTABLE) from OBSERVED ZERO WITH WORK REMAINING (UNBOUNDED). Major bump because the zero-denominator result changes meaning. |
| MET-RES-002 | 1.0.0 | 2026-08-29 | `actual hours − planned hours (named baseline)` | Phase 0 baseline. The formula deliberately defers the baseline rather than fixing it, so naming one is an implementation decision and not a formula change. |
| MET-RES-002 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `actual hours − (contract:baseline.plannedEffortHours × physical completion at t)` | ADR-0024. The named baseline is EARNED effort, not scheduled effort. Time-phasing the priced plan by planned completion asks whether the planned hours have been spent, so a project running late books an effort underrun for work it has not performed — which the margin bridge then values at the sold rate and reports as margin gained. On the demo portfolio that produced $63.31M of phantom credit across 48 behind-schedule projects and left the effort cause net POSITIVE ($48.75M) on a portfolio losing $79.72M. Major bump because the value changes on 74 of 75 projects and is not comparable across the change. |
| MET-FIN-008 | 1.0.0 | 2026-08-29 | `MET-FIN-005 + MET-FIN-007` | Phase 0 baseline: cost to date plus estimate to complete. |
| MET-FIN-008 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `MET-FIN-005 + MET-FIN-007 + MET-FIN-023` | Phase 2 brief defines EAC as Actual Cost + Bottom-Up ETC + Committed Future Cost. Committed cost is contractually fixed but not yet incurred, and is not part of a bottom-up estimate; omitting it understates EAC and therefore overstates forecast margin. Major bump because every dependent value changes. |
| MET-FIN-019 | 1.0.0 | 2026-08-29 | `max(0, contracted margin at risk) per rule set VAR-v1` | Phase 0 placeholder. VAR-v1 was undefined (MC-4). |
| MET-FIN-019 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `max(0, MET-FIN-026 − MET-FIN-032)` | Phase 2 brief defines GM Value at Risk as Sold GM $ − Risk-Adjusted GM $. Resolves MC-4. The max(0, …) clamp and the cap at MET-FIN-002 are retained from the Phase 0 definition so the TEST_STRATEGY §3.3 property (VaR never exceeds contract value) still holds. |
| MET-FIN-009 | 1.0.0 | 2026-08-29 | `MET-FIN-002 × MET-FIN-006 (percent-complete candidate)` | Phase 0 placeholder. Treated recognised revenue as something Delivery Intelligence would compute, pending OQ-2. |
| MET-FIN-009 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `FinanceSystem.recognisedRevenueToDate (imported fact)` | OQ-2 CLOSED. Recognised revenue is an authoritative Finance/ERP accounting fact governed by corporate accounting policy, not a Delivery Intelligence economic calculation. The metric changes epistemic level from L2_DERIVED to L1_OBSERVED and its authority from DERIVED to FINANCE_SYSTEM. Major bump because the meaning, not merely the arithmetic, has changed. |
| MET-FIN-006 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `MET-FIN-005 / MET-FIN-008` | Renamed "Percent Complete (cost-to-cost)" to "Cost Progress Ratio (cost-to-cost)". The arithmetic is unchanged; the name invited confusion with an accounting revenue-recognition method, which it is not. Unblocked by the OQ-2 closure — it is now a progress diagnostic with no recognition role. |
| MET-HLTH-004 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `weighted normalised score over MET-QUA-003, MET-QUA-006, MET-QUA-009, MET-QUA-010` | Replaced MET-QUA-002 defect density with MET-QUA-010 acceptance blockers. Defect density requires a scope unit that MC-8 leaves undefined, which would have kept the whole health tree Draft on a Type A gap in a single input. Acceptance blockers are directly observed, unblocked, and in fixed-bid are the quality signal that actually gates revenue. |
| MET-PORT-006 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `count(projects WHERE MET-FCST-002)` | Reclassified L2_DERIVED to L3_ASSESSED. The arithmetic is unchanged; counting inferred flags produces an inferred count, and a Frozen L2 metric may not rest on an L3 input. |
| MET-DQ-007 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `weighted composite of MET-DEL-014, MET-FIN-030, MET-DEL-013 per DQ-v1` | Reclassified L2_DERIVED to L3_ASSESSED per Phase 2 closure Decision 6, which names Forecast Confidence as an assessment. Deterministic implementation, but the value is a judgement about whether this team's estimates can be relied on. |
| MET-HLTH-011 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `unchanged` | ADR-0014 ACCEPTED (resolves C-6). Reclassified L2_DERIVED to L3_ASSESSED. The arithmetic is unchanged; the semantic claim is not. Banding a score into a verdict, and comparing that verdict with a declaration, are judgements about project state. Epistemic level describes meaning, not implementation technique — a deterministic rule does not make a verdict L2. |
| MET-HLTH-013 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `unchanged` | ADR-0014 ACCEPTED (resolves C-6). Reclassified L2_DERIVED to L3_ASSESSED. The arithmetic is unchanged; the semantic claim is not. Banding a score into a verdict, and comparing that verdict with a declaration, are judgements about project state. Epistemic level describes meaning, not implementation technique — a deterministic rule does not make a verdict L2. |
| MET-HLTH-030 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `unchanged` | ADR-0014 ACCEPTED (resolves C-6). Reclassified L2_DERIVED to L3_ASSESSED. The arithmetic is unchanged; the semantic claim is not. Banding a score into a verdict, and comparing that verdict with a declaration, are judgements about project state. Epistemic level describes meaning, not implementation technique — a deterministic rule does not make a verdict L2. |
| MET-HLTH-031 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `unchanged` | ADR-0014 ACCEPTED (resolves C-6). Reclassified L2_DERIVED to L3_ASSESSED. The arithmetic is unchanged; the semantic claim is not. Banding a score into a verdict, and comparing that verdict with a declaration, are judgements about project state. Epistemic level describes meaning, not implementation technique — a deterministic rule does not make a verdict L2. |
| MET-PORT-004 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `unchanged` | ADR-0014 consequence. These aggregate MET-HLTH-011 and MET-HLTH-030, which are now L3_ASSESSED; counting or distributing assessments produces an assessment, and the dependency-purity rule forbids an L2 metric resting on an L3 input. |
| MET-PORT-005 | 2.0.0 (supersedes 1.0.0) | 2026-08-31 | `unchanged` | ADR-0014 consequence. These aggregate MET-HLTH-011 and MET-HLTH-030, which are now L3_ASSESSED; counting or distributing assessments produces an assessment, and the dependency-purity rule forbids an L2 metric resting on an L3 input. |

### Wording refinements without a version bump

| Metric | Change |
| --- | --- |
| MET-FIN-002 | Renamed "Contract Value (Current Contractual)" to "Contractual Revenue (Current Contractual)" and the definition restated in entitlement terms (Phase 2 closure, Decision 2A). Formula unchanged. |
| MET-FIN-010 | Definition restated as revenue expected to be contractually earned by completion, and explicitly distinguished from accounting recognised revenue. Formula unchanged. |
| MET-FIN-015 | Unblocked by the OQ-2 closure. Now an accounting-derived margin view, explicitly distinct from the forward-looking MET-FIN-014. |
| MET-FIN-029 | Wording tightened to "an extrapolative diagnostic comparing actual cost incurred with independently measured physical completion" and explicitly separated from cost-to-cost revenue recognition (Decision 3). Formula unchanged. |
| MET-COM-001 | Definition states plainly that billing is not revenue (Decision 2D). |
| MET-COM-002 | Definition states plainly that cash collection is neither revenue nor billing (Decision 2E). |
| MET-COM-006 | Unblocked by the OQ-2 closure; both sides are now Finance facts. |
| MET-HLTH-001…006 | Normalisation mechanism made explicit (piecewise-linear against rule-defined edges, weighted, clamped) so the semantic contract is complete while edges and weights remain calibration. |
| MET-HLTH-011 | Banding mechanism and critical-breach override precedence made explicit; band edges moved to HEALTH-v1 parameters. |
| MET-FCST-010 | Composite made explicit (four normalised components, weighted, clamped) rather than "composite per TRAJECTORY-v1". |
| MET-PORT-003 | Phase 2 made the de-duplication rule explicit (a shared risk cause counted once, at its largest single-project exposure). That reading was WITHDRAWN at the pre-Phase-11 closure — see the v2.0.0 record in METRIC_VERSION_HISTORY and ADR-0023. |
| MET-DEL-002 | Earned Value now uses MET-DEL-016 physical completion rather than scope units, so it is not blocked by MC-8. |
| MET-FIN-010 | Formula stated as MET-FIN-002 directly. Phase 0 wording "MET-FIN-002 + executed-only adjustments" was circular: executed adjustments are already inside MET-FIN-002. |
| MET-FIN-014 | Restated as MET-FIN-024 / MET-FIN-010 so Forecast GM $ has a metric ID of its own rather than being an unnamed intermediate. |
| MET-FIN-012 | Restated as MET-FIN-026 / MET-FIN-001 for the same reason. |
| MET-RSK-001 | Renamed "Risk Exposure (gross)" to distinguish it from MET-RSK-008 Incremental Risk Exposure. Formula unchanged. |
| MET-QUA-009 | Trailing window stated as 8 weekly snapshots, matching the snapshot cadence (ADR-0003 §3). Phase 0 said "8 periods" without naming the period. |

## 14. Open items blocking the freeze

**3 of 162 metrics remain `Draft`.** The catalog cannot be declared `Frozen` while any of these is open. Escalate rather than assume — an assumed formula that reaches Phase 9 is a formula nobody will question again.

| Metric | Blocked by |
| --- | --- |
| MET-DEL-012 Scope Completion | MC-8 — **Type A** |
| MET-QUA-002 Defect Density | MC-8 — **Type A**, inherited from the same undefined scope unit as MET-DEL-012 |
| MET-DQ-009 Forecast Reliability Profile | CONFLICT C-9 / ADR-0015 — **Type A** |

