# Architecture Decision Records

Process, states, and precedence: [`../../ARCHITECTURE_DECISIONS.md`](../../ARCHITECTURE_DECISIONS.md).

Start from [`ADR-TEMPLATE.md`](ADR-TEMPLATE.md). Number sequentially, never reuse a number, never
edit an accepted ADR in substance — supersede it instead.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](ADR-0001-poc-architecture.md) | POC architecture: modular monolith with strict bounded contexts | Accepted |
| [0002](ADR-0002-decimal-safe-money.md) | Decimal-safe money and deterministic financial computation | Accepted |
| [0003](ADR-0003-three-baselines-temporal-model.md) | Three baselines and an append-only temporal model | Accepted |
| [0004](ADR-0004-fact-derived-inferred-layering.md) | L1/L2/L3 layering and the AI authority boundary | Accepted |
| [0005](ADR-0005-server-side-authorization.md) | Server-side authorization, scoping and audit | Accepted |
| [0006](ADR-0006-api-bff-contract-strategy.md) | Task-shaped BFF and three-axis versioning | Accepted (promoted by 0032) |
| [0007](ADR-0007-operational-analytical-data-strategy.md) | Operational and analytical data strategy | **Proposed** |
| [0008](ADR-0008-integration-and-ingestion-model.md) | Integration and ingestion model | Accepted (promoted by 0035) |
| [0009](ADR-0009-observability-architecture.md) | Observability on OpenTelemetry, separated from audit | **Proposed** |
| [0010](ADR-0010-deployment-environment-configuration.md) | Deployment, environments and configuration | Accepted (promoted by 0032, §2–§9) |
| [0011](ADR-0011-epistemic-layers-are-not-dependency-tiers.md) | Epistemic layers are not dependency tiers | **Proposed** |
| [0012](ADR-0012-ports-in-orchestration.md) | Ports-in orchestration for aggregate, cross-domain and inferred contexts | **Proposed** |
| [0013](ADR-0013-revised-demo-portfolio-specification.md) | Revised demo portfolio specification (Phase 3 brief reconciliation) | Accepted |
| [0014](ADR-0014-epistemic-level-of-health-assessment.md) | Epistemic level of composite health and System-Assessed RAG | Accepted |
| [0015](ADR-0015-phase-4-engine-conflicts.md) | Phase 4 engine conflicts: executive health model, forecast reliability, and which "Green" | **Partially accepted** — C-7 resolved 2026-08-31 (D-1); C-8 superseded by 0019; C-10 superseded by 0018; C-9 open |
| [0016](ADR-0016-phase-5-security-conflicts.md) | Phase 5 security conflicts: role taxonomy, classification taxonomy, masking, and audit telemetry | Accepted |
| [0017](ADR-0017-presentation-stack-and-ui-gates.md) | Presentation stack, the token boundary, and the UI source gates | Accepted |
| [0018](ADR-0018-green-at-risk-semantics.md) | Green-at-Risk: System Green-at-Risk and Reported Green Risk are two findings | Accepted |
| [0019](ADR-0019-executive-intervention-priority.md) | Executive Intervention Priority: lexicographic tiers, exposure separated from actionability | Accepted |
| [0020](ADR-0020-phase-7-interaction-architecture.md) | Phase 7 interaction architecture: an application gateway, and no transport | Accepted |
| [0021](ADR-0021-portfolio-var-shared-cause-deduplication.md) | Portfolio value at risk: shared-cause de-duplication (raised C-20) | **Superseded by 0023** |
| [0022](ADR-0022-completing-the-health-v2-signal-set.md) | Completing the HEALTH-v2 signal set: where a derivation lives, and when a dimension may compute (resolves C-21) | Accepted |
| [0023](ADR-0023-portfolio-var-is-additive-across-projects.md) | Portfolio value at risk is additive across projects; shared cause is concentration, not duplication (resolves C-20) | Accepted |
| [0024](ADR-0024-effort-variance-baseline-is-earned-not-scheduled.md) | `MET-RES-002`'s named baseline is earned effort, not scheduled effort — slippage was being reported as margin saved (resolves C-22) | Accepted |
| [0025](ADR-0025-rule-signal-completeness-and-governed-ratio-metrics.md) | Rule signal completeness is a machine-checked contract; `MET-COM-011`, `MET-FIN-040`, `MET-FIN-041` registered (resolves C-23) | Accepted |
| [0026](ADR-0026-rule-applicability-is-governed-and-distinct-from-computability.md) | Rule applicability is governed business semantics, distinct from computability; five explicit evaluation states (resolves S3-1, S3-2) | Accepted |
| [0027](ADR-0027-observed-zero-is-not-missing-and-cannot-improve-health.md) | Observed zero is data, not absence; a missing adverse input may never improve health (resolves DR-068 S4) | Accepted |
| [0028](ADR-0028-dimension-input-epistemic-state-and-safe-renormalisation.md) | Every executive dimension input carries an epistemic state; renormalisation is safe only over governed absence (resolves the Product/Quality S4) | Accepted |
| [0029](ADR-0029-assistant-tool-allowlist-supersedes-free-text-retrieval.md) | The assistant's data window is a typed read-only tool allowlist, not a free-text retrieval port (resolves DQ-3) | Accepted |
| [0030](ADR-0030-grounding-is-deterministic-and-generation-is-not-trusted.md) | Narrative generation is a governed hybrid; grounding validation is deterministic and blocking | Accepted |
| [0031](ADR-0031-claim-envelope-carries-epistemic-metadata-to-the-assistant.md) | Every assistant-consumable output carries a uniform claim envelope; missing qualification defaults to the conservative reading | Accepted |
| [0032](ADR-0032-trusted-server-runtime.md) | The trusted server runtime is a container, and it activates ADR-0006 (promotes 0006, 0010; discharges DR-029) | Accepted |
| [0033](ADR-0033-llm-provider-boundary-and-external-ai-policy.md) | The LLM is a provider behind a port; sending data to one is a policy decision, and there is no silent fallback | Accepted |
| [0034](ADR-0034-typed-query-plan.md) | A typed query plan supersedes single-intent routing; the tool allow-list of 0029 is retained and extended | Accepted |
| [0035](ADR-0035-three-planes-and-source-authority.md) | Three data planes; source authority is declared per canonical concept, not per system (promotes 0008) | Accepted |
| [0036](ADR-0036-knowledge-ingestion-and-citation.md) | Knowledge grounding is ingestion, indexing and citation — not training; a source is grounded only when an answer has used it | Accepted |
| [0037](ADR-0037-enterprise-connector-contract.md) | One connector contract, honest status, and no invented GlobalLogic schemas | Accepted |
| [0038](ADR-0038-historical-learning-seam.md) | The historical-learning seam is declared and deliberately not implemented | Accepted |

`Proposed` means **no code may depend on it** (`../../ARCHITECTURE_DECISIONS.md` §2) and it is not
implemented (§3 step 7). ADR-0006…0012 were raised in Phase 1 and await approval.

Next ADR number: **0032**
