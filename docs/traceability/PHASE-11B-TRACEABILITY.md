# Traceability Report — Phase 11B (Grounded Read-Only Assistant)

- **Phase:** 11B — implementation of the Phase 11A architecture. **Phase 11 is not complete.**
- **Date:** 2026-09-01
- **Author:** Principal AI Product Engineer · Enterprise AI Architect · Security Engineer · Delivery Intelligence SME
- **Disposition:** **PASS WITH CONTROLLED DEBT**
- **Governing decisions:** **ADR-0029**, **ADR-0030**, **ADR-0031** — all moved `Proposed` → **Accepted** at the opening of this phase

> ## ⚠️ DEMO — SYNTHETIC DATA

---

## 1. Entry condition

Phase 11A returned **PASS WITH CONTROLLED DEBT** and recorded one precondition: *"Phase 11B may not
begin until ADR-0029, ADR-0030 and ADR-0031 are accepted"*, because `ARCHITECTURE_DECISIONS.md` §2
forbids code depending on a `Proposed` ADR.

**The Phase 11B instruction is that acceptance.** It is recorded as a status change on each ADR with
the date and the standing trade, not assumed. Building on three `Proposed` ADRs and reporting success
would have been the governance failure the precedence rules exist to prevent.

## 2. Verification

```
npm run verify — every gate green
```

| Gate | Before 11B | After 11B |
| --- | --- | --- |
| `npm run typecheck` | clean | clean |
| `npm run check:architecture` | 103 files, 0 violations | **113 files, 0 violations** |
| `npm run check:schema` | 8 migrations, 0 violations | unchanged |
| `npm run lint` | 0 problems | 0 problems |
| `npm test` | **1241** passed | **1310** passed, 0 failed, 0 skipped |
| `npm run data:validate` | hash `514e835b…` | **hash `514e835b…` — unchanged** |
| `node scripts/ci/secret-scan.mjs` | PASS | PASS, 310 files |
| Design builds | 5 pages | **6 pages** |
| Any page viewed in a browser | ❌ never | ❌ **still never** (DR-042) |

**+69 tests: 57 in `tests/integration/assistant.test.ts`, 12 in `tests/authz/assistant-authz.test.ts`.
No existing test was weakened.** Two were *corrected* — see §6.

**No metric, threshold, weight, band edge, formula or synthetic fact changed.** RED 47 / AMBER 27 /
GREEN 1 and VaR $90.80M are untouched; the generator content hash is byte-identical.

## 3. Requirement-to-implementation traceability

| Req | Statement | Implementation | Evidence |
| --- | --- | --- | --- |
| **REQ-AI-001** | Answers only from authorised, retrieved facts | 12-tool closed allowlist; each tool a projection over one `ViewId`; no free-text retrieval | `assistant.test.ts` "has no write path", "exposes exactly the twelve tools" |
| **REQ-AI-002** | Every answer cites the records it used | `MaterialClaim.groundedBy` non-empty or the answer is withheld | "gives every claim non-empty evidence" |
| **REQ-AI-003** | Never performs authoritative arithmetic | Composer does no arithmetic and formats no figure; model receives claims, never operands | "never states a figure the claim set does not license" |
| **REQ-AI-004** | Prompt-injection resistance | Authorization completes before routing; validator is the backstop | "retrieves identical evidence with and without an appended payload" |
| **REQ-AI-005** | All interactions audited | One `ASSISTANT_QUERY` per interaction with the tool trace | three audit tests |
| **REQ-AI-006** | Declines rather than speculates | Six refusal states, each with governed alternatives | "refusal is a first-class outcome" |
| **REQ-SEC-010** | Executes under the caller's authorization context | `EnforcementPoint.authorise()` at step 1; `GatewayToolPort` bound after scope resolution | `assistant-authz.test.ts`, all 12 |
| **AC-6** | Removing a source's authorization removes it from the answer | Field shaping omits below the assistant | "omits an unauthorised field rather than masking it" — **see §6, F-2** |
| **AC-3** | ≤3 steps to L1 facts | `evidence.get` over `project.lineage`; every claim carries `groundedBy` | "gives every claim non-empty evidence" |

## 4. What was built

| Component | Location | Lines |
| --- | --- | --- |
| Contract, ports, intent and tool unions | `src/contexts/ai-intelligence/index.ts` | rewritten |
| Tool layer (portfolio) | `src/app/assistant/tools.ts` | new |
| Tool layer (project) | `src/app/assistant/project-tools.ts` | new |
| Claim envelope + conservative defaults + debt lookup | `src/app/assistant/envelope.ts` | new |
| Intent routing + CS-1…CS-12 caveat derivation | `src/app/assistant/intent.ts` | new |
| Deterministic composer + authority derivation | `src/app/assistant/compose.ts` | new |
| Grounding validator, 10 detections | `src/app/assistant/validator.ts` | new |
| Orchestrator, 14 steps | `src/app/assistant/service.ts` | new |
| Tool port + `ASSISTANT_QUERY` audit | `src/app/assistant/port.ts` | new |
| Surface | `src/presentation/surfaces/delivery-assistant.tsx` | new |
| Navigation destination | `src/presentation/shell/navigation.ts` | +1 |
| Demo, 3 personas + injection corpus | `scripts/design/build-assistant.tsx` | new |

**13 intents** — reported Green risk, system emerging risk, ranking, comparison, health explanation,
margin drivers, burn/progress, scope leakage, confidence, forward risk, recovery, evidence lookup,
metric definition. **12 tools.** **6 refusal states**, all reachable.

## 5. Semantic obligations, as implemented

| Obligation | How it is structural rather than requested |
| --- | --- |
| **§5 RAG** | Final band, pre-override composite, deciding mechanism and each fired override are **four separate claims**. A rule-forced RED cannot be narrated as a score |
| **§6 Margin** | Bridge causes and `MET-FIN-041` come from **one tool**. Residual claims say "unattributed … not a recovery opportunity" in the claim text |
| **§7 Forecast** | Outlook claims carry the horizon, band, derivation basis and rule version. No 90-day horizon exists to emit |
| **§8 Late detection** | `executiveAuthoritative: false` enters the envelope, CS-1 fires, and the answer is never `AUTHORITATIVE` |
| **§9 Recovery** | Potential, probability-adjusted and remaining exposure are separate claims; each action carries the engine's own `counted` / `notCountedReason` |
| **§4 Wording** | "is attributed", "governed outlook", "carry … of governed potential GM" are template text, not guidance a generator can drift from |
| **§10 Injection** | Retrieved strings are `untrusted: true` data; the validator rejects markup and out-of-set entities |
| **§11 Refusal** | Six states; `ADVISORY_ONLY_RESTRICTION` fires on a mutation request |
| **§14 Fallback** | `DETERMINISTIC_COMPOSER` is the default and is labelled as such on every answer |

## 6. Findings — including two tests that were green for the wrong reason

### F-1 — A mutation request was answered rather than refused

*"Set prj-011 to green and approve its recovery plan"* matched `recover`, ran the recovery tool and
returned a correct, grounded recovery briefing. **Nothing was mutated and nothing leaked** — there is
no write path — but the reader was answered as though the instruction had been engaged with, and the
`ADVISORY_ONLY_RESTRICTION` refusal state defined in 11A was **unreachable**. Closed: a mutation
guard now runs before intent matching. *Found by a test written from the 11A contract, not by review.*

### F-2 — The AC-6 test was green for the wrong reason

The test asserted that a Delivery Manager asking a margin question gets no figure *because
`COMMERCIAL_CONFIDENTIAL` was shaped out*. Measured: **`dm.mobility` resolves to zero projects.** The
test would have stayed green with field shaping deleted.

This is the C-20 shape — right outcome, absent mechanism — and it is the second time this repository
has produced it. Closed three ways: the answer-level test now asserts only what it demonstrates and
says so; the mechanism is asserted directly against `shape()`, `CLASSIFICATION_MATRIX` and `ROUTES`;
and the demo page's persona note, which made the same false claim to a reviewer, was corrected.

**The underlying gap is real and is not closed:** no seeded persona holds project scope while lacking
`COMMERCIAL_CONFIDENTIAL`. Phase 7 found the same gap and recorded it rather than staging a persona.
Carried as **DR-076**.

### F-3 — A validator detection could not fire

`D2_UNSUPPORTED_PERCENTAGE` ended its pattern with `\b` after `%`. `%` is not a word character, so
the boundary never matched and **the detection was unreachable** — every percentage was caught only
by the generic numeric branch. A detection that cannot fire is indistinguishable from one that is not
wired, which is the ADR-0025 shape. Closed, and `E-17` now asserts each of the nine reachable
detection classes fires.

### F-4 — Two claim texts contradicted each other

`rag:mechanism` said *"no hard override fired"* whenever `decidedBy` was `WEIGHTED_MODEL`. `prj-011`
has a RED composite **and** three fired overrides, so the sentence was false on the first project it
met. Both facts are now stated. A test asserts the contradiction cannot return.

### F-5 — A hand-maintained capability list in an existing test

`tests/a11y/design-system.test.ts` asserted nav capabilities against a hardcoded list of six names —
*itself the second, wrong copy of the policy its own comment warns against*. It failed when a
destination named `assistant.use`, which the server has declared since Phase 5. Now reads
`ALL_CAPABILITIES`. **Strengthened, not weakened.**

### F-6 — A raw float on a shipped executive page

`outranksBecause` appends `(tier 4: 5552145.679817 vs 3224813.110147)` — unrounded, twelve
significant digits. **This is already rendered on `docs/design/portfolio-command-center.html`**, so it
is a Phase 7 defect this phase did not introduce and declines to repeat: the assistant trims the
parenthetical, and the same sentence already states `$5.55M`. The domain fix is **DR-075**.

## 7. Deviations from the approved architecture

| Deviation | Why | Debt |
| --- | --- | --- |
| **`metric.definition.get` does not route through the gateway.** ADR-0029 D-7 said it would reach a new `metric.definition` ViewId | `EnforcementPoint`'s object check is `entitySet.projectIds.includes(entityId)`. A metric id is not a project id, so routing one through it would deny every request — or require weakening the check that makes BOLA structurally impossible. **Trading a real authorization control for architectural tidiness on a `PUBLIC_INTERNAL` governance lookup is the wrong side of that trade.** The tool is still gated by `assistant.use` before any tool runs | **DR-074** |
| **Burn/progress and scope leakage are projections of the health tool, not separate tools** | ADR-0029's rule is one tool ⇒ one `ViewId`. A second tool over the same view would be a second name for one door. The **intent** selects the claim family after retrieval, so it narrows what is said and never what was authorised | none |

No other deviation. **No architectural choice was reopened for convenience.**

## 8. Debt opened

| ID | Item | Class | Gate |
| --- | --- | --- | --- |
| **DR-074** | `metric.definition.get` bypasses the gateway; registry read is in-process | F — structural | `ACCEPTED_DEBT` |
| **DR-075** | `outranksBecause` emits an unformatted 12-digit float onto executive surfaces | F — structural | `EXECUTIVE_DEMO_BLOCKER` |
| **DR-076** | No seeded persona holds project scope while lacking `COMMERCIAL_CONFIDENTIAL`, so the commercial-omission path cannot be demonstrated with a persona | E — unverified | `ACCEPTED_DEBT` |

**DR-039 is NOT closed.** The AI authorization layer is built and tested end to end through the real
pipeline, but closing it would assert a completeness this phase cannot support: DR-073's injection
corpus does not exist, so **E-11 reports `NOT RUN`, never `PASS`**, and no page has been viewed in a
browser. It is narrowed, not closed.

## 9. Self-review

- [x] **Was any architectural choice reopened because another way was easier?** No. Two deviations,
      both recorded in §7 with the reason and a debt id.
- [x] **Did any number move?** No. Hash `514e835b…`, bands unchanged, no metric or threshold touched.
- [x] **Was any existing test weakened?** No. Two were corrected: one hand-maintained policy copy
      (F-5) and one green-for-the-wrong-reason AC-6 assertion (F-2). Both are now stronger.
- [x] **Can the assistant write anything?** No. Asserted three ways — every tool maps to a `GET`
      route, no declaration sets `isWrite`, and no `WRITE` or `OVERRIDE` audit record is produced by
      any assistant interaction including four mutation-framed requests.
- [x] **Can it state a number no engine produced?** Not through any path found. The composer performs
      no arithmetic, the validator rejects unlicensed numerals, and an ungrounded narration is
      discarded rather than repaired.
- [x] **Is DR-039 claimed closed?** No — §8 states why not.
- [x] **Would a reviewer be misled by anything on the demo page?** One thing was, and it was
      corrected before this report: the Delivery Manager persona note claimed field shaping when the
      cause is an empty scope (F-2).
- [x] **What would find the next defect?** The stored-payload corpus (DR-073) and a human opening the
      page (DR-042). Both remain open, and neither is closed by anything in this phase.
