# Traceability — Phase 6 Closure & Phase 7 Entry Gate

- **Phase:** 6 closure (no Phase 7 implementation)
- **Date:** 2026-08-30
- **Author:** Product architecture + front-end architecture + analytics architecture + independent review
- **Scope:** ADR-0017 disposition; C-10; MC-5; DR-018; DR-021; DR-041; DR-026; governance coherence
- **Artifacts consumed:** `CLAUDE.md`, `PRODUCT_SPEC.md`, `ARCHITECTURE_DECISIONS.md`,
  `METRIC_CATALOG.md`, `SECURITY_MODEL.md` v2.1.0, `BRAND_DESIGN_SYSTEM.md` v1.1.0,
  `PHASE_HANDOFF.md`, `docs/SECURITY_DEBT_REGISTER.md`, `docs/PHASE-4-CURATED-ASSESSMENT.md`,
  `docs/adr/ADR-0015`, `ADR-0016`, `ADR-0017`, `docs/traceability/PHASE-6-TRACEABILITY.md`

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## 1. Entry-gate item → resolution

| # | Item | Resolution | Evidence |
| --- | --- | --- | --- |
| 1 | **ADR-0017 disposition** | **ACCEPTED.** D-1/D-2/D-3/D-5 ACCEPT; D-4 (DOM lib + G-BROWSER) **ACCEPT WITH DEBT** (DR-040) | ADR-0017 disposition table; index row; ADR-status consistency test |
| 2 | **C-10 — Green-at-Risk** | **RESOLVED (ADR-0018).** Two independent findings: `MET-FCST-025` System Green-at-Risk, `MET-HLTH-033` Reported Green Risk. ADR-0015 D-4 superseded | 13 tests in `phase4-engines.test.ts` §4 + scenario B/C/LR golden cases |
| 3 | **MC-5 — Intervention priority** | **RESOLVED (ADR-0019).** `MET-PORT-007` is a 7-tier lexicographic ordering, exposure separated from actionability. `rankAsMetPort007()` no longer exists | 36 tests in `intervention-priority.test.ts`, incl. antisymmetry and transitivity |
| 4 | **DR-018 — staleness vs confidence** | **CLOSED.** Band ceiling; score untouched; per-domain cadence multiples; policy versioned | 8 tests incl. a property test over the staleness range |
| 5 | **DR-021 — multi-signal trajectory** | **CLOSED.** Six signals, each under its own observation policy; absent signals omitted, never zero-filled | 7 tests; scenario LR detectable with no adverse cost burn |
| 6 | **DR-041 — client runtime** | **CLOSED as an accepted runtime decision (ADR-0020).** `ApplicationGateway`, in-process. **No HTTP transport introduced.** Residual carried as **DR-044** | 15 tests in `gateway.test.ts` |
| 7 | **DR-026 — impersonation** | **NOT REQUIRED for Phase 7; explicitly deferred.** AC-5 is discharged by test, not by UI inspection. No persona switcher built | Debt register §5a |
| 8 | **PHASE_HANDOFF coherence** | **VERIFIED clean; now enforced.** The duplication described in the brief was an artefact of the Phase 6 *diff display*, not of the file | 7 coherence tests + 3 ADR-status tests |
| 9 | **All repository gates** | Green | §4 |

## 2. Metric and semantic changes

| Metric | Before | After | Authority |
| --- | --- | --- | --- |
| `MET-FCST-025` | "Green-at-Risk Determination": `MET-HLTH-011 = GREEN AND trajectory falling AND ≥1 stated reason` | **"System Green-at-Risk"**: `MET-HLTH-011 = GREEN AND (outlook@30d ∈ {AMBER,RED} OR outlook@60d ∈ {AMBER,RED})` | ADR-0018 |
| `MET-HLTH-033` | *(did not exist)* | **"Reported Green Risk"**: Reported GREEN while System-Assessed is AMBER/RED or the evidence shows material deterioration | ADR-0018 |
| `MET-PORT-007` | `ordering by MET-FIN-019 × MET-FCST-010 × intervenability` — **blocked, threw** | 7-tier lexicographic ordering; no composite score | ADR-0019 |
| `MET-DQ-005` | Weighted composite → band | Composite unchanged; **band capped** by critical-domain freshness | DR-018 |
| `PRIORITY-v1` | `intervenabilityFactor` (open, MC-5) | `criticalGmValueAtRiskFloor`, `immediateHorizonWeeks` (set, synthetic calibration) | ADR-0019 |

**Not changed:** no financial formula, no RAG banding mechanism, no epistemic classification, no
domain boundary, no authorization rule, no security assumption, no brand token, no accessibility
rule, no provenance rule. **Reported RAG is never written.** Synthetic content hash unchanged
(`7fdc2f19…`).

### 2.1 Draft status, stated honestly

`MET-FCST-025`, `MET-HLTH-033` and `MET-PORT-007` remain **`Draft`**. Their own semantics are now
settled; what keeps them Draft is **C-7** — which health model produces `MET-HLTH-011` — which is out
of scope for this gate and already tracked under ADR-0015. The registry validator enforces that a
Draft metric names a genuine Type A gap and an owner, and it rejected an earlier draft of these notes
that claimed MC-5 as the blocker after MC-5 had been resolved.

## 3. Tests added or changed

```
820 tests, 0 failed, 0 skipped   (25 files)   was 746

+36  tests/unit/contexts/intervention-priority.test.ts   rewritten for MC-5
+15  tests/authz/gateway.test.ts                          new — DR-041
+19  tests/authz/threat-model-regression.test.ts          governance coherence + ADR status
 +8  tests/unit/contexts/confidence-engine.test.ts        DR-018 ceiling
 +8  tests/golden/phase4-engines.test.ts                  DR-021 multi-signal + C-10 scenarios
  5  tests/unit/rules/metric-registry.test.ts             Draft-set and blocked-count updates (changed, not added)
```

| Requirement | Test |
| --- | --- |
| C-10 System Green-at-Risk definition | "flags System Green-at-Risk when the band is GREEN and the outlook turns adverse" |
| C-10 Reported Green Risk definition | "flags Reported Green Risk when the organisation reports GREEN over a System AMBER" |
| C-10 independence | "keeps the two findings independent — a project can be both" |
| C-10 scenario B | "does not flag scenario B as Green-at-Risk under the System-Assessed reading" |
| C-10 scenario C | canonical conflict retained in the curated assessment |
| C-10 no overwrite of Reported RAG | "never overwrites Reported RAG with the system view" — all 12 combinations |
| MC-5 deterministic ordering | "produces an identical ordering from identical inputs" |
| MC-5 stable tie handling | "breaks a total tie by project id, ascending"; "is independent of input order" |
| MC-5 hard-risk priority | "outranks a project that beats it on every single lower tier" |
| MC-5 GM VaR ordering | "orders larger exposure first"; "does not let GM value at risk override an earlier clock" |
| MC-5 actionability ≠ severity | "never derives actionability from severity"; "does not lift a small problem above a large one" |
| MC-5 missing evidence | "lists a candidate with no evaluable tier separately, not last" |
| MC-5 replay determinism | byte-identical `JSON.stringify` over the same universe |
| MC-5 no Draft dependency | "depends on no Draft-blocked metric — every tier input is supplied" |
| DR-018 stale cannot show HIGH | "makes the misleading HIGH state unreachable for a stale critical domain" |
| DR-018 fresh equivalent can | "does not cap when the same age is inside the domain's own tolerance" |
| DR-018 explanation cites freshness | "cites the freshness evidence behind a cap, not merely the fact of it" |
| DR-018 policy version recorded | "always emits the ceiling rule, firing or not, and records the policy version" |
| DR-021 multiple policies | "gives every supplied signal a declared observation policy" |
| DR-021 different windows | "lets each signal use its own window, rather than one universal eight-week window" |
| DR-021 missing observations | "omits a signal the facts do not support rather than zero-filling it" |
| DR-021 leading-risk case | "detects leading risk with no adverse cost burn (scenario LR, prj-029)" |
| DR-021 no oracle import | "does not import the Phase 3 recomputation oracle into production intelligence" |
| DR-041 no bypass | "authorises a gateway request exactly as a dispatched one"; "cannot reach an out-of-scope entity" |
| DR-041 no authz in React | "never compares against a role name to decide what may be shown" |
| DR-041 no context access | "imports no domain context, no platform module and no persistence" |
| DR-041 no network dependency | "opens no network listener and makes no network call from src" |
| Governance | 7 handoff-coherence + 3 ADR-status assertions |

## 4. Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run check:architecture` | **87 source files, 0 violations** |
| `npm run check:schema` | 8 migrations, 0 violations |
| `npm run lint` | 0 problems |
| `npm test` | **820 passed, 0 failed, 0 skipped** |
| of which authorization | 272 |
| of which design-system / a11y | 125 |
| `npm run data:validate` | 126,126 records, hash `7fdc2f19…` **unchanged** |
| `npm run catalog:generate` | regenerated; catalog matches registry byte for byte |
| `npm run design:gallery` | builds |
| `node scripts/ci/secret-scan.mjs` | 0 findings |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `npm run db:verify` | **not re-run — no persistence artifact changed** |

**No gate was weakened.** Three gates rejected work during this pass and each rejection was fixed
rather than suppressed: G-FLOAT caught a `Number()` coercion in the DR-018 ceiling; the registry
validator rejected metrics claiming a resolved blocker; and the edge-case suite flagged a `/` in
prose as an undeclared division.

## 5. Self-review

- [x] **Did any formula, threshold or scenario change without an ADR?** No. Three ADRs were written
      (0018, 0019, 0020) and one was dispositioned (0017). ADR-0015 D-2 and D-4 are marked superseded
      in place, with the original text retained as the record.
- [x] **Was any Phase 7 UI built?** No. `src/presentation` is unchanged apart from nothing — the
      gallery still builds from the same 24 components. `src/app/gateway.ts` is a contract, not a
      screen.
- [x] **Was a transport introduced?** No, and it is asserted: no server package, no `node:http`, no
      `fetch`, no `.listen` anywhere in `src/`, and ADR-0006 still reads `Proposed`.
- [x] **Was an ADR accepted merely because the code existed?** No. ADR-0017's disposition reviews each
      decision independently and accepts D-4 **with debt** rather than cleanly.
- [x] **Did anything get marked resolved that is not?** No. `MET-PORT-007`, `MET-FCST-025` and
      `MET-HLTH-033` remain Draft under C-7 and say so; DR-041's residual is carried as DR-044 rather
      than absorbed.
- [x] **Was a defect introduced and caught?** Yes — worth recording. An early EAC-trend proxy had a
      denominator artefact that flagged curated scenario **A**, the healthy reference, as System
      Green-at-Risk. The healthy-reference regression test is what caught it; the proxy was replaced
      with an indexed cost-per-unit-of-progress series.
- [x] **If a claim here is wrong, would we find out now or in front of the client?** Now, for
      semantics, ordering, confidence and the interaction boundary — all are asserted. **In front of
      the client** for a *driven* AC-1 demonstration, which is DR-044 and is stated as unresolved.
