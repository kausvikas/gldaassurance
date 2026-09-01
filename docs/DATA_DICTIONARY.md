# Data dictionary

**DEMO — SYNTHETIC DATA** · Phase 2 (closure) · Version 2.0.0

Every canonical entity, its owning context, its classification, and the metrics it feeds.
Types are the TypeScript public surface (`src/contexts/*/index.ts`); the physical columns are in
`migrations/`.

**Classification** drives server-side redaction (`SECURITY_MODEL.md` §4.3). It is recorded here per
entity so Phase 5 implements from a declared table rather than from judgement.

Legend — **C:** `PI` PUBLIC_INTERNAL · `DS` DELIVERY_SENSITIVE · `CC` COMMERCIAL_CONFIDENTIAL ·
`PD` PERSONAL_DATA.

---

## Conventions applying to every entity

| Rule | Detail |
| --- | --- |
| Money | `Money` value object; `NUMERIC(18,4)` at rest, always beside an explicit `currency_code` (ADR-0002) |
| Rates / ratios | `NUMERIC(12,6)`; `NULL` means `NOT_COMPUTABLE`, never zero |
| Dates | `CalendarDate` (`YYYY-MM-DD`), UTC, DST-free |
| Timestamps | `Instant` (`YYYY-MM-DDTHH:MM:SSZ`), UTC only |
| Weeks | `WeekId` (`YYYY-Www`), ISO-8601. The reporting period (ADR-0003 §3) |
| Snapshot key | `(project_id, week, correction_seq)`; `seq 0` original, `> 0` a correction naming what it corrects |
| Synthetic marker | Every fact-bearing row carries `synthetic BOOLEAN NOT NULL CHECK (synthetic)` (REQ-DATA-009) |
| Identifiers | Branded string types. A `ProjectId` cannot be passed where a `ContractId` is expected |
| Cross-context references | Opaque identifiers. **No foreign key crosses a schema** (ADR-0001 §3) |

---

## `organization` — tier 1, L1

| Entity | Key fields | C | Feeds |
| --- | --- | --- | --- |
| `OrganizationNode` | `id`, `kind`, `parentId`, `fiscalCalendarId` | PI | Scope resolution (REQ-SEC-003), portfolio rollup |
| `OrganizationHierarchySnapshot` | `capturedAt`, `childId`, `parentId` | PI | As-of rollups against the structure that existed then |
| `Region` | `code`, `parentBusinessUnitId` | PI | Regional segmentation |
| `Industry` | `code`, `name` | PI | Vertical segmentation |
| `Customer` | `id`, `alias`, `industryCode`, `regionCode` | PI | Account grouping. **Alias only — never a real client name** |
| `Account` | `id`, `customerId`, `organizationNodeId` | PI | Scope, portfolio membership |
| `FiscalCalendarAssignment` | `organizationNodeId`, `calendar`, `effectiveFrom` | PI | Fiscal period resolution. **OQ-5 is answered per entity here, not assumed globally** |

## `portfolio` — tier 1, L1

| Entity | Key fields | C | Feeds |
| --- | --- | --- | --- |
| `Portfolio` / `Program` | `id`, `organizationNodeId` | PI | Grouping |
| `PortfolioMembership` | `portfolioId`, `projectId`, `effectiveFrom` | PI | Rollup membership |
| `PortfolioAggregationInput` | per-project metric values | CC | MET-PORT-001…008. **Supplied by the app layer, already scope-filtered** (ADR-0005 §5) |

## `project` — tier 1, L1

| Entity | Key fields | C | Feeds |
| --- | --- | --- | --- |
| `Project` | `id`, `engagementModel`, `lifecycleStage`, `lifecycleSubStage`, `inRecovery` | PI | Everything |
| `ProjectSnapshot` | `(projectId, week, correctionSeq)` | PI | The weekly spine every other snapshot hangs from |

## `contract` — tier 1, L1

| Entity | Key fields | C | Feeds |
| --- | --- | --- | --- |
| `Contract` | `id`, `contractType`, `liquidatedDamagesPerDay`, `acceptanceTermDays` | CC | Commercial terms; LD exposure |
| `AsSoldBaseline` | `contractValue`, `budgetedCost`, `contingencyBudget`, `pyramidRatio`, `blendedRate`, `reworkAllowance` | CC | MET-FIN-001/003/026/036, MET-RES-004/005, MET-QUA-012. **Immutable** |
| `CurrentContractualBaseline` | derived | CC | MET-FIN-002/004. **Never stored as an editable row** |
| `ForecastBaseline` | `revisionId`, `effectiveFrom`, `reason` | CC | MET-DEL-014 |
| `BaselineRevision` | `revisedAt`, `actorId`, `reason` | CC | MET-DEL-014 replan frequency |
| `ScopeBaseline` | `totalScopeUnits?`, `scopeUnitDefinition?` | DS | MET-DEL-012. **NULL while MC-8 is open** |
| `ExecutedChange` | `executedOn`, `valueDelta`, `costDelta` | CC | MET-FIN-002/004, MET-COM-008 |
| `PendingChange` | `raisedOn`, `proposedValue`, `approvalProbability` | CC | MET-FIN-011, MET-COM-007/010. **No status column** |

## Revenue concepts — six things, never collapsed

Phase 2 closure, Decisions 2 and 11. These are routinely conflated in delivery reporting, and each
conflation produces a specific, familiar argument in a review meeting.

| Concept | Metric | Level | Authority | What it is *not* |
| --- | --- | --- | --- | --- |
| **Contractual Revenue** | `MET-FIN-002` | `L2_DERIVED` | `DERIVED` from Contract | Not what has been earned, billed or collected |
| **Forecast Revenue at Completion** | `MET-FIN-010` | `L2_DERIVED` | `DERIVED` | Not accounting revenue; excludes pending CRs entirely |
| **Recognised Revenue (cumulative)** | `MET-FIN-009` | `L1_OBSERVED` | `FINANCE_SYSTEM` | Not computed here; not derived from physical completion |
| **Recognised Revenue (period)** | `MET-FIN-039` | `L1_OBSERVED` | `FINANCE_SYSTEM` | Not derivable from the cumulative figure across a restatement |
| **Invoiced / Billed** | `MET-COM-001` | `L1_OBSERVED` | `FINANCE_SYSTEM` | **Not revenue.** Billing follows milestones, recognition follows policy |
| **Cash Collected** | `MET-COM-002` | `L1_OBSERVED` | `FINANCE_SYSTEM` | **Neither revenue nor billing** |
| **Pending CR Recovery — face value** | `MET-FIN-011` | `L2_DERIVED` | `DERIVED` | Never in base forecast revenue |
| **Pending CR Recovery — expected** | `MET-COM-010` | `L2_DERIVED` | `DERIVED` | A scenario input to `MET-FIN-031` only |

**The load-bearing rule:** Delivery Intelligence does not determine corporate accounting revenue
recognition. It consumes the recognised amount from Finance/ERP. In production the flow is
`Finance/ERP → Recognised Revenue fact → canonical model`; for the synthetic POC the fact is produced
by a documented synthetic policy (`RECOGNITION-v1`) and is still **stored as an accounting fact**,
never as a Delivery Intelligence calculation. The registry enforces this: an `L1_OBSERVED` metric may
not declare `DERIVED` authority, and `validateRegistry()` fails if one does.

## `financial` — tier 2, L1 → L2

| Entity | Key fields | C | Feeds |
| --- | --- | --- | --- |
| `RecognisedRevenueFact` | `periodAmount`, `cumulativeAmount`, `reportingPeriodId`, `postingReference`, `recognitionPolicyId` | CC | MET-FIN-009/039. **Imported from Finance; never computed here** |
| `ActualCost` | `periodEnd`, `category`, `amount`, `recordedAt` | CC | MET-FIN-005. `recordedAt ≠ periodEnd` makes late entry detectable |
| `EtcLineItem` | `amount`, `basisOfEstimate`, `estimatedBy` | CC | MET-FIN-007 |
| `Commitment` | `amount`, `committedOn`, `cancellable` | CC | MET-FIN-023. Separated from ETC because a commitment is fixed |
| `ContingencyDrawdown` | `amount`, `reason`, `authorisedBy` | CC | MET-FIN-037 |
| `FxRateRecord` | `from`, `to`, `rate`, `rateType`, `effectiveDate`, `source` | PI | All cross-currency aggregation; MET-FIN-038 |
| `FinancialSnapshot` | 20 provenance-wrapped metric values | CC | The economics of every surface |

## `delivery` — tier 2, L1 → L2

| Entity | Key fields | C | Feeds |
| --- | --- | --- | --- |
| `Milestone` | `baselineDate`, `forecastDate`, `actualDate?`, `paymentGating`, `gatedValue?` | DS / CC when gating | MET-DEL-009/010/011 |
| `ScopeItem` | `completedOn?`, `uncontracted`, `estimatedValue?` | DS | MET-COM-009, MET-DEL-012 |
| `ProgressClaim` | `physicalCompletion`, `basis`, `claimedBy` | DS | MET-DEL-016 and everything downstream of progress |
| `Dependency` | `owner`, `raisedOn`, `dueOn`, `blocking` | DS | MET-DEL-022/023 |
| `DeliverySnapshot` | 16 metric values | DS | Schedule and EVM surfaces |

## `commercial` — tier 2, L1

| Entity | Key fields | C | Feeds |
| --- | --- | --- | --- |
| `Invoice` / `Payment` | `amount`, `issuedOn`, `receivedOn` | CC | MET-COM-001…006 |
| `CommercialExposure` | `kind`, `estimatedValue`, `estimationBasis` | CC | MET-COM-009. **Always an estimate, always labelled as one** |
| `CommercialSnapshot` | 5 metric values | CC | Margin and commercial surfaces |

## `quality` — tier 2, L1

| Entity | Key fields | C | Feeds |
| --- | --- | --- | --- |
| `Defect` | `severity`, `discoveryPhase`, `escapedToClient`, `reopenCount` | DS | MET-QUA-001…005/009 |
| `AcceptanceItem` | `submittedOn`, `acceptedOn?`, `blocking` | DS | MET-QUA-010/011 |
| `ReleaseRecord` | `releasedOn`, `failed` | DS | MET-QUA-008 |
| `QualitySnapshot` | 9 metric values | DS | Quality surfaces, MET-HLTH-004 |

## `resource` — tier 2, L1

| Entity | Key fields | C | Feeds |
| --- | --- | --- | --- |
| `Assignment` | `personRef`, `seniorityBand`, `allocationPercent` | **PD** | MET-RES-003/004/006/007 |
| `EffortRecord` | `hours`, `isRework`, `causedByDefectId?`, `blockedByDependencyId?` | **PD** at row level, DS aggregated | MET-QUA-006, MET-DEL-022, MET-RES-001/002 |
| `OpenRole` | `openedOn`, `filledOn?` | DS | MET-RES-009 |
| `ResourceSnapshot` | aggregate only — no individual identifiable | DS | MET-HLTH-005 |

## `risk` — tier 2, L1 → L2

| Entity | Key fields | C | Feeds |
| --- | --- | --- | --- |
| `Risk` | `probability`, `costImpact`, **`includedInEtc` + justification**, `proximityDate`, `state` | CC | MET-RSK-001/008, MET-FIN-032 |
| `Mitigation` | `ownerActorId`, `dueOn`, `completedOn?` | DS | MET-RSK-004/005 |
| `Intervention` | `ownerActorId`, `dueOn`, `status`, `expectedEffect`, `observedEffect?` | DS | REQ-RISK-003. One of the few places this product is a system of record |

## `health` — tier 3, L2

| Entity | Key fields | C | Feeds |
| --- | --- | --- | --- |
| `StatusReport` | `reportedRag`, `commentary`, `reportedBy` | CC | MET-HLTH-012 |
| `RagOverride` | `rag`, `reason`, `actorId`, `appliedAt`, **`expiresAt`** | CC | MET-HLTH-013. Expiry is mandatory (REQ-HLTH-007) |
| `HealthAssessment` | `compositeScore`, `contributions`, `rag`, `ruleVersion`, `snapshotRefs` | CC | Every health surface |

## `forecast` — tier 4, **L3**

| Entity | Key fields | C | Feeds |
| --- | --- | --- | --- |
| `TrajectoryAssessment` | `window`, `healthSlope`, `deteriorating`, `silentDeteriorationIndex` | CC | MET-FCST-*, MET-PORT-006/007 |
| `EarlyWarning` | `signal`, `narrative`, `triggeringMetrics` | CC | REQ-RISK-002. **Cannot exist without citable evidence** |

## `recovery` — tier 3, L1 → L2 · `assurance` — tier 2, L1 · `data-quality` — tier 3, L2

| Entity | Context | C | Feeds |
| --- | --- | --- | --- |
| `RecoveryPlan` / `RecoveryAction` / `RecoveryScenario` | recovery | CC | REQ-RISK-004 |
| `AssuranceReview` / `AssuranceFinding` | assurance | DS | Assurance surface |
| `EvidenceRecord` | assurance | varies with subject | AC-3 citations that survive later corrections |
| `DomainObservation` / `DataFreshness` / `DataQualityAssessment` | data-quality | DS | MET-DQ-001…007 |

## `rules` — tier 0 · `integration` — tier 0 · `identity` — tier 1

| Entity | Context | C | Feeds |
| --- | --- | --- | --- |
| `MetricDefinition` / `MetricVersionRecord` | rules | PI | The semantic contract. `METRIC_CATALOG.md` is generated from it |
| `RuleDefinition` / `RuleParameter` | rules | PI | Thresholds and weights **as data**, with `blockedBy` where undecided |
| `HealthModelVersion` | rules | PI | MET-HLTH-010 weights |
| `RuleEvaluation` / `RuleExplanation` | rules | DS | REQ-HLTH-006 explanations |
| `DataSource` / `StagedRecord` / `SourceFreshness` | integration | PI | MET-DQ-002/004, degradation banner |
| `User` / `RoleGrant` / `SessionRecord` | identity | **PD** | Authentication and scope (Phase 5) |
| `AuditRecord` | platform/audit | **CC** | REQ-SEC-006/007. Append-only |

---

## Fields that carry a governance guarantee

These exist for a reason that is not obvious from the name. Removing or defaulting any of them
silently weakens a control.

| Field | Entity | Why it exists |
| --- | --- | --- |
| `RecognisedRevenueFact.recognitionPolicyId` | `financial` | Records which accounting policy produced the figure, so a restatement is explicable rather than mysterious |
| `MetricDefinition.epistemicLevel` | `rules` | Separates what kind of claim a value is from whether its implementation is deterministic |
| `MetricDefinition.authoritativeSourceType` | `rules` | Makes "we consume this, we do not author it" checkable; an `L1_OBSERVED` metric claiming `DERIVED` authority fails validation |
| `MetricDefinition.calibrationParameters` | `rules` | Separates settled meaning from open calibration, so a metric can be `Frozen` while its thresholds are still argued about |
| `RuleParameter.blockedBy` | `rules` | An undecided threshold still exists, is named, and carries its owner. `value: undefined` is a different claim from `value: '0'` |
| `Risk.includedInEtc` + justification | `risk` | Prevents a risk being provisioned in ETC *and* deducted from margin — a double count that understates the whole portfolio |
| `PendingChange.supersededByExecutedId` | `contract` | Execution is an insert, not a status flip, so CR ageing survives |
| `ActualCost.recordedAt` vs `periodEnd` | `financial` | Makes late timesheet entry visible as a freshness problem rather than invisible |
| `ProgressClaim.basis` + `claimedBy` | `delivery` | Physical completion is an assertion; its author and basis are what make it challengeable |
| `RagOverride.expiresAt` | `health` | An override without an expiry is a permanent silent adjustment |
| `snapshot.correctionSeq` + `corrects` | all | Separates "what we believed then" from "what we now believe about then" |
| `EtcLineItem.basisOfEstimate` | `financial` | An ETC with no basis cannot be challenged, and MET-FIN-030 exists to challenge it |
| `Commitment.cancellable` | `financial` | A cancellable commitment is not a commitment; including it would overstate EAC |
| `synthetic` on every fact row | all | REQ-DATA-009 — a `CHECK (synthetic)` makes real data unstorable, not merely discouraged |
