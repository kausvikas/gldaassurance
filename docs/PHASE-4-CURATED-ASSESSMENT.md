# Phase 4 Acceptance Gate — Curated Scenario Assessment

> ## ⚠️ DEMO — SYNTHETIC DATA
> No real client, employee or financial data. Every figure below is computed from the
> generated portfolio by the Phase 4 engines.

**Generated** by `npm run assess:curated`. Deterministic: the same seed and the same rule
versions produce the same bytes. Do not edit by hand.

- Seed: `gldi-portfolio-2026-08-31`
- As-of: `2026-08-31`
- Health model: `HEALTH-v2` (four executive dimensions) — **Draft**, CONFLICT C-7, ADR-0015
- Rule sets: `HEALTH-v2`, `TRAJECTORY-v1`, `DQ-v1`, `EAC-v1`, `VAR-v1`
- Metric catalog: `2.0.0`

**Every threshold below is a SYNTHETIC CALIBRATION CANDIDATE, not approved production policy.**
See `RULE_SETS` in `src/contexts/rules/internal/rule-sets.ts` for the values in force and the
register item and owner that must supply each one still open.

---

## Scenario A — Healthy Green

`prj-007`

### Economics

| Metric | ID | Value |
| --- | --- | --- |
| Contract value (As-Sold) | MET-FIN-001 | 3200000.00 |
| Forecast revenue (executed change only) | MET-FIN-010 | 3200000.00 |
| Unsecured upside (pending CRs, never in revenue) | MET-FIN-011 | 0.00 |
| Estimate at completion | MET-FIN-008 | 2479999.92 |
| Gross margin — As-Sold | MET-FIN-012 | 24.00% |
| Gross margin — Forecast | MET-FIN-014 | 22.50% |
| Margin erosion | MET-FIN-016 | -1.50% |
| Cost consumed | MET-FIN-028 | 60.44% |
| Burn gap (cost consumed − physical) | MET-FIN-027 | -1.56% |
| Contingency consumed | MET-FIN-035 | 13.75% |
| Performance-implied EAC | MET-FIN-029 | 2370967.61 |
| ETC optimism gap | MET-FIN-030 | 0.00 |
| Incremental risk exposure (not in ETC) | MET-RSK-008 | 8000.00 |
| Risk already provisioned in ETC (not double counted) | — | 100000.00 |
| Risk-adjusted gross margin | MET-FIN-033 | 22.25% |
| GM value at risk | MET-FIN-019 | 55999.92 |

### Health

- **Reported RAG** (MET-HLTH-012, L1): GREEN
- **System-Assessed RAG** (MET-HLTH-011, L3): **GREEN**
- **Composite** (MET-HLTH-020, Draft): 98.44
- **Data confidence** (MET-DQ-005): 100.00 — HIGH
- **Status divergence** (MET-HLTH-030): none

```
System-Assessed RAG = GREEN
```

### Trajectory and outlook

- **State** (MET-FCST-020, Draft): **IMPROVING**
- Materially adverse signals: 0

| Horizon | Band | Confidence | Rationale |
| --- | --- | --- | --- |
| CURRENT | GREEN | MEDIUM | Current System-Assessed band is GREEN. |
| DAYS_30 | GREEN | MEDIUM | No band change expected by 30 days: trajectory is IMPROVING. |
| DAYS_60 | GREEN | LOW | No band change expected by 60 days: trajectory is IMPROVING. |
| DAYS_90 | GREEN | LOW | No band change expected by 90 days: trajectory is IMPROVING. |

### Green-at-Risk

- **Determination** (MET-FCST-025, Draft): not Green-at-Risk
- Why not: Trajectory is IMPROVING. Green and not falling is simply Green.
- Economic exposure (MET-FCST-026, Draft): 55999.92
- Intervention window open: yes
- Confidence in the finding: HIGH

---

## Scenario B — Green-at-Risk

`prj-001`

### Economics

| Metric | ID | Value |
| --- | --- | --- |
| Contract value (As-Sold) | MET-FIN-001 | 8000000.00 |
| Forecast revenue (executed change only) | MET-FIN-010 | 8000000.00 |
| Unsecured upside (pending CRs, never in revenue) | MET-FIN-011 | 235000.00 |
| Estimate at completion | MET-FIN-008 | 6168000.00 |
| Gross margin — As-Sold | MET-FIN-012 | 28.00% |
| Gross margin — Forecast | MET-FIN-014 | 22.90% |
| Margin erosion | MET-FIN-016 | -5.10% |
| Cost consumed | MET-FIN-028 | 70.00% |
| Burn gap (cost consumed − physical) | MET-FIN-027 | 12.00% |
| Contingency consumed | MET-FIN-035 | 72.00% |
| Performance-implied EAC | MET-FIN-029 | 6951724.14 |
| ETC optimism gap | MET-FIN-030 | 783724.14 |
| Incremental risk exposure (not in ETC) | MET-RSK-008 | 93000.00 |
| Risk already provisioned in ETC (not double counted) | — | 100000.00 |
| Risk-adjusted gross margin | MET-FIN-033 | 22.83% |
| GM value at risk | MET-FIN-019 | 388250.00 |

### Health

- **Reported RAG** (MET-HLTH-012, L1): GREEN
- **System-Assessed RAG** (MET-HLTH-011, L3): **AMBER**
- **Composite** (MET-HLTH-020, Draft): 66.40
- **Data confidence** (MET-DQ-005): 100.00 — HIGH
- **Status divergence** (MET-HLTH-030): +1 — REPORTED_OPTIMISTIC
  - Reported GREEN while the evidence supports AMBER. Nobody is necessarily wrong — the reporting may simply not have caught up with the arithmetic — but the gap is the finding, and it is worth more than either value alone.

```
System-Assessed RAG = AMBER
  ▲ Margin erosion against as-sold: -0.051 ≤ -0.05
      Five or more percentage points of margin have gone against the price we sold.
  ▲ Composite banding: 66.40 within band Green ≥ 70, Amber ≥ 45
      Composite 66.40 banded against the HEALTH-v2 thresholds (Green ≥ 70, Amber ≥ 45).
```

### Trajectory and outlook

- **State** (MET-FCST-020, Draft): **DETERIORATING**
- Materially adverse signals: 1

| Horizon | Band | Confidence | Rationale |
| --- | --- | --- | --- |
| CURRENT | AMBER | MEDIUM | Current System-Assessed band is AMBER. |
| DAYS_30 | AMBER | MEDIUM | No band change expected by 30 days: trajectory is DETERIORATING. |
| DAYS_60 | RED | LOW | Expected to reach RED by 60 days if the current trajectory (DETERIORATING, 1 adverse signal) continues unchanged. This is a stated rule, not a fitted model: it assumes nothing intervenes. |
| DAYS_90 | RED | LOW | Expected to reach RED by 90 days if the current trajectory (DETERIORATING, 1 adverse signal) continues unchanged. This is a stated rule, not a fitted model: it assumes nothing intervenes. |

### Green-at-Risk

- **Determination** (MET-FCST-025, Draft): not Green-at-Risk
- Why not: Already AMBER. Green-at-Risk describes projects that still look fine; this one does not, and is handled as an active problem instead.
- Economic exposure (MET-FCST-026, Draft): 388250.00
- Intervention window open: yes
- Confidence in the finding: HIGH

---

## Scenario C — Reported Green, Evidence Amber

`prj-009`

### Economics

| Metric | ID | Value |
| --- | --- | --- |
| Contract value (As-Sold) | MET-FIN-001 | 5000000.00 |
| Forecast revenue (executed change only) | MET-FIN-010 | 5000000.00 |
| Unsecured upside (pending CRs, never in revenue) | MET-FIN-011 | 120000.00 |
| Estimate at completion | MET-FIN-008 | 4200000.00 |
| Gross margin — As-Sold | MET-FIN-012 | 22.00% |
| Gross margin — Forecast | MET-FIN-014 | 16.00% |
| Margin erosion | MET-FIN-016 | -6.00% |
| Cost consumed | MET-FIN-028 | 64.62% |
| Burn gap (cost consumed − physical) | MET-FIN-027 | 16.62% |
| Contingency consumed | MET-FIN-035 | 82.00% |
| Performance-implied EAC | MET-FIN-029 | 5250000.00 |
| ETC optimism gap | MET-FIN-030 | 1050000.00 |
| Incremental risk exposure (not in ETC) | MET-RSK-008 | 60000.00 |
| Risk already provisioned in ETC (not double counted) | — | 100000.00 |
| Risk-adjusted gross margin | MET-FIN-033 | 15.61% |
| GM value at risk | MET-FIN-019 | 312000.00 |

### Health

- **Reported RAG** (MET-HLTH-012, L1): GREEN
- **System-Assessed RAG** (MET-HLTH-011, L3): **RED**
- **Composite** (MET-HLTH-020, Draft): 35.26
- **Data confidence** (MET-DQ-005): 100.00 — HIGH
- **Status divergence** (MET-HLTH-030): +2 — REPORTED_OPTIMISTIC
  - Reported GREEN while the evidence supports RED. Nobody is necessarily wrong — the reporting may simply not have caught up with the arithmetic — but the gap is the finding, and it is worth more than either value alone.

```
System-Assessed RAG = RED
  ▲ Contingency consumed far ahead of progress: 0.34 ≥ 0.20
      The buffer priced to absorb uncertainty is being spent faster than the work is being delivered. Margin protection is going before the risk it was meant to cover has materialised.
  ▲ Margin erosion against as-sold: -0.06 ≤ -0.05
      Five or more percentage points of margin have gone against the price we sold.
  ▲ Composite banding: 35.26 within band Green ≥ 70, Amber ≥ 45
      Composite 35.26 banded against the HEALTH-v2 thresholds (Green ≥ 70, Amber ≥ 45).
```

### Trajectory and outlook

- **State** (MET-FCST-020, Draft): **DETERIORATING**
- Materially adverse signals: 1

| Horizon | Band | Confidence | Rationale |
| --- | --- | --- | --- |
| CURRENT | RED | MEDIUM | Current System-Assessed band is RED. |
| DAYS_30 | RED | MEDIUM | No band change expected by 30 days: trajectory is DETERIORATING. |
| DAYS_60 | RED | LOW | Expected to reach RED by 60 days if the current trajectory (DETERIORATING, 1 adverse signal) continues unchanged. This is a stated rule, not a fitted model: it assumes nothing intervenes. |
| DAYS_90 | RED | LOW | Expected to reach RED by 90 days if the current trajectory (DETERIORATING, 1 adverse signal) continues unchanged. This is a stated rule, not a fitted model: it assumes nothing intervenes. |

### Green-at-Risk

- **Determination** (MET-FCST-025, Draft): not Green-at-Risk
- Why not: Already RED. Green-at-Risk describes projects that still look fine; this one does not, and is handled as an active problem instead.
- Economic exposure (MET-FCST-026, Draft): 312000.00
- Intervention window open: yes
- Confidence in the finding: HIGH

---

## Scenario D — Amber Recovering

`prj-004`

### Economics

| Metric | ID | Value |
| --- | --- | --- |
| Contract value (As-Sold) | MET-FIN-001 | 4600000.00 |
| Forecast revenue (executed change only) | MET-FIN-010 | 4600000.00 |
| Unsecured upside (pending CRs, never in revenue) | MET-FIN-011 | 0.00 |
| Estimate at completion | MET-FIN-008 | 3702999.96 |
| Gross margin — As-Sold | MET-FIN-012 | 26.00% |
| Gross margin — Forecast | MET-FIN-014 | 19.50% |
| Margin erosion | MET-FIN-016 | -6.50% |
| Cost consumed | MET-FIN-028 | 76.92% |
| Burn gap (cost consumed − physical) | MET-FIN-027 | -0.08% |
| Contingency consumed | MET-FIN-035 | 89.91% |
| Performance-implied EAC | MET-FIN-029 | 3376623.32 |
| ETC optimism gap | MET-FIN-030 | 0.00 |
| Incremental risk exposure (not in ETC) | MET-RSK-008 | 13500.00 |
| Risk already provisioned in ETC (not double counted) | — | 100000.00 |
| Risk-adjusted gross margin | MET-FIN-033 | 19.21% |
| GM value at risk | MET-FIN-019 | 156499.96 |

### Health

- **Reported RAG** (MET-HLTH-012, L1): AMBER
- **System-Assessed RAG** (MET-HLTH-011, L3): **AMBER**
- **Composite** (MET-HLTH-020, Draft): 72.19
- **Data confidence** (MET-DQ-005): 100.00 — HIGH
- **Status divergence** (MET-HLTH-030): none

```
System-Assessed RAG = AMBER
  ▲ Margin erosion against as-sold: -0.0649999913043478260869565217391304 ≤ -0.05
      Five or more percentage points of margin have gone against the price we sold.
  ▲ Composite banding: 72.19 within band Green ≥ 70, Amber ≥ 45
      Composite 72.19 banded against the HEALTH-v2 thresholds (Green ≥ 70, Amber ≥ 45). Elevated to Amber by ELV-MARGIN-EROSION: the composite is in the Green band but a warning condition is live.
```

### Trajectory and outlook

- **State** (MET-FCST-020, Draft): **IMPROVING**
- Materially adverse signals: 0

| Horizon | Band | Confidence | Rationale |
| --- | --- | --- | --- |
| CURRENT | AMBER | MEDIUM | Current System-Assessed band is AMBER. |
| DAYS_30 | AMBER | MEDIUM | No band change expected by 30 days: trajectory is IMPROVING. |
| DAYS_60 | AMBER | LOW | No band change expected by 60 days: trajectory is IMPROVING. |
| DAYS_90 | AMBER | LOW | No band change expected by 90 days: trajectory is IMPROVING. |

### Green-at-Risk

- **Determination** (MET-FCST-025, Draft): not Green-at-Risk
- Why not: Already AMBER. Green-at-Risk describes projects that still look fine; this one does not, and is handled as an active problem instead.
- Economic exposure (MET-FCST-026, Draft): 156499.96
- Intervention window open: yes
- Confidence in the finding: HIGH

---

## Scenario E — Scope and Commercial Leakage

`prj-016`

### Economics

| Metric | ID | Value |
| --- | --- | --- |
| Contract value (As-Sold) | MET-FIN-001 | 2400000.00 |
| Forecast revenue (executed change only) | MET-FIN-010 | 2400000.00 |
| Unsecured upside (pending CRs, never in revenue) | MET-FIN-011 | 280000.00 |
| Estimate at completion | MET-FIN-008 | 2020000.00 |
| Gross margin — As-Sold | MET-FIN-012 | 24.00% |
| Gross margin — Forecast | MET-FIN-014 | 15.83% |
| Margin erosion | MET-FIN-016 | -8.17% |
| Cost consumed | MET-FIN-028 | 63.05% |
| Burn gap (cost consumed − physical) | MET-FIN-027 | 7.05% |
| Contingency consumed | MET-FIN-035 | 43.64% |
| Performance-implied EAC | MET-FIN-029 | 2053571.43 |
| ETC optimism gap | MET-FIN-030 | 33571.43 |
| Incremental risk exposure (not in ETC) | MET-RSK-008 | 33000.00 |
| Risk already provisioned in ETC (not double counted) | — | 100000.00 |
| Risk-adjusted gross margin | MET-FIN-033 | 17.43% |
| GM value at risk | MET-FIN-019 | 142500.00 |

### Health

- **Reported RAG** (MET-HLTH-012, L1): AMBER
- **System-Assessed RAG** (MET-HLTH-011, L3): **AMBER**
- **Composite** (MET-HLTH-020, Draft): 55.33
- **Data confidence** (MET-DQ-005): 100.00 — HIGH
- **Status divergence** (MET-HLTH-030): none

```
System-Assessed RAG = AMBER
  ▲ Margin erosion against as-sold: -0.0816666666666666666666666666666667 ≤ -0.05
      Five or more percentage points of margin have gone against the price we sold.
  ▲ Composite banding: 55.33 within band Green ≥ 70, Amber ≥ 45
      Composite 55.33 banded against the HEALTH-v2 thresholds (Green ≥ 70, Amber ≥ 45).
```

### Trajectory and outlook

- **State** (MET-FCST-020, Draft): **STABLE**
- Materially adverse signals: 0

| Horizon | Band | Confidence | Rationale |
| --- | --- | --- | --- |
| CURRENT | AMBER | MEDIUM | Current System-Assessed band is AMBER. |
| DAYS_30 | AMBER | MEDIUM | No band change expected by 30 days: trajectory is STABLE. |
| DAYS_60 | AMBER | LOW | No band change expected by 60 days: trajectory is STABLE. |
| DAYS_90 | AMBER | LOW | No band change expected by 90 days: trajectory is STABLE. |

### Green-at-Risk

- **Determination** (MET-FCST-025, Draft): not Green-at-Risk
- Why not: Already AMBER. Green-at-Risk describes projects that still look fine; this one does not, and is handled as an active problem instead.
- Economic exposure (MET-FCST-026, Draft): 142500.00
- Intervention window open: yes
- Confidence in the finding: HIGH

---

## Scenario F — ETC Optimism

`prj-014`

### Economics

| Metric | ID | Value |
| --- | --- | --- |
| Contract value (As-Sold) | MET-FIN-001 | 3600000.00 |
| Forecast revenue (executed change only) | MET-FIN-010 | 3600000.00 |
| Unsecured upside (pending CRs, never in revenue) | MET-FIN-011 | 0.00 |
| Estimate at completion | MET-FIN-008 | 2900000.00 |
| Gross margin — As-Sold | MET-FIN-012 | 25.00% |
| Gross margin — Forecast | MET-FIN-014 | 19.44% |
| Margin erosion | MET-FIN-016 | -5.56% |
| Cost consumed | MET-FIN-028 | 66.67% |
| Burn gap (cost consumed − physical) | MET-FIN-027 | 14.67% |
| Contingency consumed | MET-FIN-035 | 64.00% |
| Performance-implied EAC | MET-FIN-029 | 3461538.46 |
| ETC optimism gap | MET-FIN-030 | 561538.46 |
| Incremental risk exposure (not in ETC) | MET-RSK-008 | 39000.00 |
| Risk already provisioned in ETC (not double counted) | — | 100000.00 |
| Risk-adjusted gross margin | MET-FIN-033 | 18.36% |
| GM value at risk | MET-FIN-019 | 239000.00 |

### Health

- **Reported RAG** (MET-HLTH-012, L1): AMBER
- **System-Assessed RAG** (MET-HLTH-011, L3): **AMBER**
- **Composite** (MET-HLTH-020, Draft): 56.06
- **Data confidence** (MET-DQ-005): 100.00 — HIGH
- **Status divergence** (MET-HLTH-030): none

```
System-Assessed RAG = AMBER
  ▲ Margin erosion against as-sold: -0.0555555555555555555555555555555556 ≤ -0.05
      Five or more percentage points of margin have gone against the price we sold.
  ▲ Composite banding: 56.06 within band Green ≥ 70, Amber ≥ 45
      Composite 56.06 banded against the HEALTH-v2 thresholds (Green ≥ 70, Amber ≥ 45).
```

### Trajectory and outlook

- **State** (MET-FCST-020, Draft): **STABLE**
- Materially adverse signals: 0

| Horizon | Band | Confidence | Rationale |
| --- | --- | --- | --- |
| CURRENT | AMBER | MEDIUM | Current System-Assessed band is AMBER. |
| DAYS_30 | AMBER | MEDIUM | No band change expected by 30 days: trajectory is STABLE. |
| DAYS_60 | AMBER | LOW | No band change expected by 60 days: trajectory is STABLE. |
| DAYS_90 | AMBER | LOW | No band change expected by 90 days: trajectory is STABLE. |

### Green-at-Risk

- **Determination** (MET-FCST-025, Draft): not Green-at-Risk
- Why not: Already AMBER. Green-at-Risk describes projects that still look fine; this one does not, and is handled as an active problem instead.
- Economic exposure (MET-FCST-026, Draft): 239000.00
- Intervention window open: yes
- Confidence in the finding: HIGH

---

## Scenario G — Quality Margin Leakage

`prj-006`

### Economics

| Metric | ID | Value |
| --- | --- | --- |
| Contract value (As-Sold) | MET-FIN-001 | 3000000.00 |
| Forecast revenue (executed change only) | MET-FIN-010 | 3000000.00 |
| Unsecured upside (pending CRs, never in revenue) | MET-FIN-011 | 0.00 |
| Estimate at completion | MET-FIN-008 | 2740000.00 |
| Gross margin — As-Sold | MET-FIN-012 | 24.00% |
| Gross margin — Forecast | MET-FIN-014 | 8.67% |
| Margin erosion | MET-FIN-016 | -15.33% |
| Cost consumed | MET-FIN-028 | 83.33% |
| Burn gap (cost consumed − physical) | MET-FIN-027 | 15.33% |
| Contingency consumed | MET-FIN-035 | 91.43% |
| Performance-implied EAC | MET-FIN-029 | 2794117.65 |
| ETC optimism gap | MET-FIN-030 | 54117.65 |
| Incremental risk exposure (not in ETC) | MET-RSK-008 | 72000.00 |
| Risk already provisioned in ETC (not double counted) | — | 100000.00 |
| Risk-adjusted gross margin | MET-FIN-033 | 6.27% |
| GM value at risk | MET-FIN-019 | 532000.00 |

### Health

- **Reported RAG** (MET-HLTH-012, L1): AMBER
- **System-Assessed RAG** (MET-HLTH-011, L3): **RED**
- **Composite** (MET-HLTH-020, Draft): 12.57
- **Data confidence** (MET-DQ-005): 100.00 — HIGH
- **Status divergence** (MET-HLTH-030): +1 — REPORTED_OPTIMISTIC
  - Reported AMBER while the evidence supports RED. Nobody is necessarily wrong — the reporting may simply not have caught up with the arithmetic — but the gap is the finding, and it is worth more than either value alone.

```
System-Assessed RAG = RED
  ▲ Contingency consumed far ahead of progress: 0.2342857142857142857142857142857143 ≥ 0.20
      The buffer priced to absorb uncertainty is being spent faster than the work is being delivered. Margin protection is going before the risk it was meant to cover has materialised.
  ▲ Margin erosion against as-sold: -0.1533333333333333333333333333333333 ≤ -0.05
      Five or more percentage points of margin have gone against the price we sold.
  ▲ Composite banding: 12.57 within band Green ≥ 70, Amber ≥ 45
      Composite 12.57 banded against the HEALTH-v2 thresholds (Green ≥ 70, Amber ≥ 45).
```

### Trajectory and outlook

- **State** (MET-FCST-020, Draft): **STABLE**
- Materially adverse signals: 0

| Horizon | Band | Confidence | Rationale |
| --- | --- | --- | --- |
| CURRENT | RED | MEDIUM | Current System-Assessed band is RED. |
| DAYS_30 | RED | MEDIUM | No band change expected by 30 days: trajectory is STABLE. |
| DAYS_60 | RED | LOW | No band change expected by 60 days: trajectory is STABLE. |
| DAYS_90 | RED | LOW | No band change expected by 90 days: trajectory is STABLE. |

### Green-at-Risk

- **Determination** (MET-FCST-025, Draft): not Green-at-Risk
- Why not: Already RED. Green-at-Risk describes projects that still look fine; this one does not, and is handled as an active problem instead.
- Economic exposure (MET-FCST-026, Draft): 532000.00
- Intervention window open: yes
- Confidence in the finding: HIGH

---

## Scenario H — Contract-Loss Risk

`prj-011`

### Economics

| Metric | ID | Value |
| --- | --- | --- |
| Contract value (As-Sold) | MET-FIN-001 | 6000000.00 |
| Forecast revenue (executed change only) | MET-FIN-010 | 6000000.00 |
| Unsecured upside (pending CRs, never in revenue) | MET-FIN-011 | 0.00 |
| Estimate at completion | MET-FIN-008 | 5819999.90 |
| Gross margin — As-Sold | MET-FIN-012 | 24.00% |
| Gross margin — Forecast | MET-FIN-014 | 3.00% |
| Margin erosion | MET-FIN-016 | -21.00% |
| Cost consumed | MET-FIN-028 | 85.53% |
| Burn gap (cost consumed − physical) | MET-FIN-027 | 19.53% |
| Contingency consumed | MET-FIN-035 | 100.00% |
| Performance-implied EAC | MET-FIN-029 | 5909090.76 |
| ETC optimism gap | MET-FIN-030 | 89090.86 |
| Incremental risk exposure (not in ETC) | MET-RSK-008 | 420000.00 |
| Risk already provisioned in ETC (not double counted) | — | 100000.00 |
| Risk-adjusted gross margin | MET-FIN-033 | -4.00% |
| GM value at risk | MET-FIN-019 | 1679999.90 |

### Health

- **Reported RAG** (MET-HLTH-012, L1): RED
- **System-Assessed RAG** (MET-HLTH-011, L3): **RED**
- **Composite** (MET-HLTH-020, Draft): 0.00
- **Data confidence** (MET-DQ-005): 100.00 — HIGH
- **Status divergence** (MET-HLTH-030): none

```
System-Assessed RAG = RED
  ▲ Risk-adjusted gross margin is negative: -0.03999998333333333333333333333333333 < 0
      Once unresolved risk that is not already provisioned in ETC is counted, the engagement is loss-making. The headline margin may still look positive; it is not the number to act on.
  ▲ Forecast contract loss against the as-sold position: 1.166666597222222222222222222222222 ≥ 0.80
      Substantially all of the margin sold has been put at risk. The engagement is heading for a contractual loss position rather than a margin shortfall.
  ▲ Contingency consumed far ahead of progress: 0.3399999333333333333333333333333333 ≥ 0.20
      The buffer priced to absorb uncertainty is being spent faster than the work is being delivered. Margin protection is going before the risk it was meant to cover has materialised.
  ▲ Margin erosion against as-sold: -0.2099999833333333333333333333333333 ≤ -0.05
      Five or more percentage points of margin have gone against the price we sold.
  ▲ Composite banding: 0.00 within band Green ≥ 70, Amber ≥ 45
      Red is forced by 2 hard overrides (OVR-RAGM-NEGATIVE, OVR-CONTRACT-LOSS), regardless of the composite score. An override exists precisely because a weighted average can absorb a catastrophe in one dimension.
```

### Trajectory and outlook

- **State** (MET-FCST-020, Draft): **STABLE**
- Materially adverse signals: 0

| Horizon | Band | Confidence | Rationale |
| --- | --- | --- | --- |
| CURRENT | RED | MEDIUM | Current System-Assessed band is RED. |
| DAYS_30 | RED | MEDIUM | No band change expected by 30 days: trajectory is STABLE. |
| DAYS_60 | RED | LOW | No band change expected by 60 days: trajectory is STABLE. |
| DAYS_90 | RED | LOW | No band change expected by 90 days: trajectory is STABLE. |

### Green-at-Risk

- **Determination** (MET-FCST-025, Draft): not Green-at-Risk
- Why not: Already RED. Green-at-Risk describes projects that still look fine; this one does not, and is handled as an active problem instead.
- Economic exposure (MET-FCST-026, Draft): 1679999.90
- Intervention window open: yes
- Confidence in the finding: HIGH

---

## What this report does not claim

1. **The thresholds are not approved.** Every band edge, weight and slope threshold above is a
   synthetic calibration candidate. A synthetic distribution can test behaviour; it cannot
   establish production policy.
2. **The health model is Draft.** `HEALTH-v2` and MET-HLTH-020…024 exist under CONFLICT C-7 and
   are not authoritative until ADR-0015 is accepted. The Frozen six-dimension model
   (MET-HLTH-001…006, 010) remains blocked on MC-2.
3. **Intervention priority is absent.** MET-PORT-007 is blocked on MC-5 and no substitute has
   been rendered. `orderByExposure()` returns two of its three factors and says so.
4. **Recovery economics are not shown per scenario.** The synthetic portfolio contains no
   recovery plans; the engine is proved by golden tests over hand-computed cases instead.

---

## CONFLICT C-10 — the flagship scenario does not fire the flagship rule

Scenario B is the Green-at-Risk reference case. Above, it is reported **not Green-at-Risk**,
because `MET-FCST-025` reads *Green* as `MET-HLTH-011` System-Assessed RAG, and under the
HEALTH-v2 synthetic band edges B already assesses **AMBER**. Its Reported RAG is GREEN, its
margin has eroded 5.10 points, and its trajectory is DETERIORATING.

There are two readings of "Green" and they disagree here:

- **System-Assessed** — the band the evidence supports. Under this reading B is an *already
  detected* problem, and Green-at-Risk correctly declines to claim a discovery.
- **Reported** — the band the organisation believes. Under this reading B is exactly the case
  the product exists for: it looks fine on the report that reaches the executive, and it is
  deteriorating.

`PRODUCT_SPEC.md` §1.1 says the differentiator is "identifying Green projects moving toward
Amber/Red **while intervention can still change the outcome**", and does not say which Green.
Choosing one here would resolve an open question by inference (`CLAUDE.md` invariant 4), so the
implementation uses the System-Assessed reading — the conservative one, which under-reports
rather than over-claims — and the conflict is raised in **ADR-0015** for a decision. A
regression test pins the current behaviour so the reading cannot change silently.

The divergence itself is not lost either way: MET-HLTH-030 reports B as **+1
REPORTED_OPTIMISTIC**, which is the signal `PRODUCT_SPEC.md` §3.3 calls the most valuable in
the product.

