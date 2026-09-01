# ADR-0031 — Every assistant-consumable output carries a uniform claim envelope; missing qualification defaults to the conservative reading

- **Status:** **Accepted** — 2026-09-01
- **Date proposed:** 2026-09-01
- **Date accepted:** 2026-09-01
- **Approver:** Chief Enterprise Architect + Enterprise AI Architect + Delivery Economics SME + Independent Model-Governance Reviewer
- **Phase:** 11A (AI architecture)
- **Affects:** `src/app/dto/provenance-dto.ts`, `src/app/{portfolio,project,margin,risk}/*`,
  `@platform/explainability`, `REQ-AI-002`, `REQ-AI-003`, `AC-6`, **DR-059**, **DR-062**, **DR-064**
- **Supersedes:** —
- **Extends:** ADR-0004 (provenance envelope), ADR-0028 (dimension-input epistemic state)

---

## Context

The Phase 0–10 closure established that **losing evidence may change authority, but may never
manufacture health** (ADR-0028), and that qualification must be machine-readable so that "Phase 11
never parses prose" (ADR-0026).

The qualification fields exist. They are not uniform:

| Field | Lives in | Shape |
| --- | --- | --- |
| `executiveAuthoritative` | `contexts/forecast/internal/early-warning-engine.ts` | boolean on the late-detection result |
| `explanatoryCoverage` + `explanatoryCoverageMetricId` + narrative | `contexts/financial/internal/margin-bridge.ts` | three sibling fields |
| `assessmentStatus` | `contexts/health/internal/health-engine.ts` | enum on the health result |
| `bandProvenance` | `app/project/executive-health.ts` | nested object, app layer only |
| `SignalState` | `@platform/explainability` | per dimension input |
| `RuleEvaluationStatus` + reason code + required/missing evidence | `@platform/explainability` | per rule |
| `calibrationParameters` | metric registry | per metric definition |

Four surfaces consume these correctly today because **four humans wired each one deliberately**. The
Phase 7–10 record shows what happens when that wiring is missed: the application layer discarded
`notEvaluatedReason` and `firedOverrides.length === 0` read as *"all eight controls checked and
cleared"* (ADR-0025); the adapter discarded `SignalReading.notComputableReason` so a known cause
became *"signal not supplied"* (ADR-0027). **In both cases the domain layer was correct and the
qualification was lost one hop above it.**

An assistant is not four deliberately-wired surfaces. It composes across all of them, and a
qualification that arrives on some paths and not others produces exactly the Category B failure
`PHASE_HANDOFF.md` §3b names as *the one to watch entering Phase 11*: *"an assistant that reads these
outputs will quote them at whatever confidence the payload implies."*

## Decision

**1.** Every assistant-consumable material output crosses the application boundary inside a uniform
**`ClaimEnvelope`**, with the thirteen fields tabulated in `AI_TRUST_CONTRACT.md` §2: `metricId`,
`ruleId`, `version`, `epistemicLayer`, `asOf`, `sourceDomain`, `evidenceFreshness`, `evidenceCoverage`,
`assessmentStatus`, `signalState`, `calibrationStatus`, `executiveAuthoritative`, `limitations[]`,
`syntheticData`.

**2. The envelope is assembled from existing fields.** No new calculation, no new metric, no new
threshold. Where a producer has no value for a field, the default applies — it is **not** omitted.

**3. Absent qualification defaults to the conservative reading, always.**

| Field | Default when the producer supplies nothing |
| --- | --- |
| `executiveAuthoritative` | **`false`** |
| `calibrationStatus` | **`SYNTHETIC_UNVALIDATED`** |
| `assessmentStatus` | **`PROVISIONAL`** |
| `evidenceFreshness` | **`UNKNOWN`** |
| `signalState` | **`NOT_COMPUTABLE`** |
| `evidenceCoverage` | **`null`**, which triggers CS-4 as if coverage were low |

This is ADR-0028's rule applied one layer up: *"`observed: null` with no state is forbidden and
defaults to `NOT_COMPUTABLE` — the conservative reading — so an un-migrated caller cannot produce
silent optimism."* **An un-migrated producer must degrade the claim, never strengthen it.**

**4. `limitations[]` is machine-attached, not authored.** A registry of debt items maps a reachable
metric or rule id to the DR ids that qualify it — `MET-FCST-030` → DR-059; `MET-FIN-018` → DR-062,
DR-058; `MET-RES-003` → DR-064; every rule threshold → DR-061 or DR-055. Attachment is a lookup, so a
new debt item qualifies every claim that reaches it without anyone remembering to.

**5. `calibrationStatus` is `SYNTHETIC_UNVALIDATED` everywhere in this POC.** There is no approved
calibration in the repository. `APPROVED` exists in the type so the distinction is representable and
so the value is not silently absent when calibration eventually happens; a build control asserts no
producer emits it today.

**6. An envelope with empty `sources` fails construction.** Empty evidence is a defect, not an option
(REQ-DATA-010).

**7. The four existing surfaces are not rewritten.** They keep their bespoke fields; the envelope is
assembled *beside* them at the boundary. This ADR adds a projection, it does not refactor Phases 7–10.

## Rationale

The property being bought is that **the assistant cannot be more confident than its inputs, even when
someone forgets**. Every prior instance of this defect family was a forgetting, not a decision: a
correct value produced by a correct engine, and a qualification dropped one hop above it. A uniform
envelope with pessimistic defaults converts forgetting from *silent optimism* into *visible
qualification* — the answer gets weaker, a caveat appears, and somebody asks why.

That direction matters more than the uniformity. A uniform envelope with permissive defaults would be
worse than no envelope, because it would look like a control.

**Why the boundary and not the domain.** Domain engines are correct today and their bespoke shapes
carry meaning specific to their subject. Forcing the envelope down into them would be a large
refactor of working architecture for the assistant's convenience, which `CLAUDE.md` invariant 2
forbids. Assembling at the application boundary — where field shaping and DTO construction already
happen — is the smallest change that closes the gap.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Let the assistant read the bespoke fields directly** | Reproduces the per-surface wiring that has already been forgotten twice, in the one consumer that composes across every surface |
| **Optional envelope; omit fields the producer lacks** | An absent field reads as "no concern". This is the `NOT_APPLICABLE` / `NOT_COMPUTABLE` conflation (ADR-0026) in a new location |
| **Permissive defaults (`executiveAuthoritative: true`)** | Directly inverts ADR-0027 and ADR-0028. A missing qualification would manufacture authority — the exact defect family the closure exists to prevent |
| **Push the envelope into every domain engine** | A large refactor of working architecture for a downstream consumer's benefit. Invariant 2 |
| **Prose caveats instead of typed fields** | ADR-0026 D-1 explicitly requires that "Phase 11 never parses prose" |
| **Author `limitations[]` per claim by hand** | Guarantees drift the moment a new debt item is opened. A lookup cannot forget |

## Consequences

**Positive**
- Claim-strength rules CS-1…CS-12 become mechanically evaluable (`AI_TRUST_CONTRACT.md` §7):
  caveats are computed, never authored.
- **DR-059, DR-062 and DR-064 gain a delivery mechanism** — the qualification travels with the value
  instead of relying on a consumer having read the debt register.
- A new debt item automatically qualifies every claim reachable from it.

**Negative**
- Some claims will be `QUALIFIED` for benign reasons, exactly as DR-069's withdrawn general fix would
  have turned 64 of 75 projects PROVISIONAL for a known-good state. **The mitigation is that a
  qualification names its reason**, so a benign one is visibly benign — and unlike DR-069 this does
  not change any score, only the confidence attached to prose.
- One more construction step per DTO at the boundary.

**Neutral**
- No metric, threshold, weight or band edge changes. **No number moves.** RED 47 / AMBER 27 / GREEN 1
  and VaR $90.80M are untouched by this ADR.
- The four existing surfaces are unaffected.

## Compliance

- A build control asserts every allowlisted tool returns `ClaimEnvelope[]`.
- A build control asserts every envelope field has an explicit conservative default.
- A build control asserts no producer emits `calibrationStatus: 'APPROVED'`.
- A test asserts an envelope with empty `sources` fails construction.
- A test asserts the debt-lookup attaches DR-059 to `MET-FCST-030`, DR-062 to `MET-FIN-018` and
  DR-064 to `MET-RES-003`.

## Status note

**`Accepted` at the opening of Phase 11B.** Phase 11A recorded that 11B could not begin until this
ADR was accepted, because `ARCHITECTURE_DECISIONS.md` §2 forbids code depending on a `Proposed` ADR.
The Phase 11B implementation instruction is that acceptance; it is recorded here rather than assumed,
and the trade this ADR asks a reviewer to accept is restated unchanged in `PHASE_HANDOFF.md` §0.4.
