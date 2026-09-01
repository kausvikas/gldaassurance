# ADR-0018 — Green-at-Risk: "System Green-at-Risk" and "Reported Green Risk" are two findings, not one

- **Status:** **ACCEPTED**
- **Date:** 2026-08-30 (Phase 6 closure / Phase 7 entry gate)
- **Approver:** Sponsor / Delivery leadership, Delivery Intelligence Product Owner
- **Phase:** 6 closure, resolving **CONFLICT C-10**
- **Affects:** `ADR-0015 §D-4` (superseded in part); `MET-FCST-025`; new `MET-HLTH-033`;
  `src/contexts/forecast/internal/green-at-risk.ts`; `scripts/assessment/curated-assessment.ts`;
  `tests/golden/phase4-engines.test.ts`
- **Supersedes:** ADR-0015 D-4 only. C-7 and C-9 remain open under ADR-0015.

---

## Context

`PRODUCT_SPEC.md` §1.1 states the differentiator: *"identifying **Green** projects moving toward
Amber/Red while intervention can still change the outcome."* It does not say which Green.

§3.3 requires three RAG values be kept separate — Reported, System-Assessed, Effective — so "Green"
is genuinely ambiguous, and the ambiguity is not academic. ADR-0015 D-4 chose System-Assessed as the
conservative reading and pinned it by test, noting that under that reading the flagship curated
scenario **B** does not fire the flagship rule. That was a defensible holding position and a bad
permanent answer, for a reason worth stating plainly:

**The two readings are not two answers to one question. They are answers to two different questions,
and both questions matter.**

- *Which projects look healthy to the system today but are predicted to deteriorate?* — a statement
  about the **future**, and the thing the product claims to be better at than anything else.
- *Which projects are still being reported Green despite system evidence of risk?* — a statement
  about a **disagreement now**, and the thing `PRODUCT_SPEC.md` §3.3 calls the most valuable signal
  in the product.

Collapsing them into one flag means a screen can say "at risk" without saying which, and the two lead
to different conversations: one with a delivery team about a trajectory, one with a reporting line
about a status. Phase 7 is about to build a navigation destination called *Green-at-Risk*, so the
ambiguity had to be settled before a screen was named after it.

---

## Decision

### D-1 — Two named findings, computed independently

**System Green-at-Risk** (`MET-FCST-025`)

> A project whose **System-Assessed RAG (`MET-HLTH-011`) is GREEN**, and whose **approved forward
> outlook (`MET-FCST-022`) at 30 or 60 days is AMBER or RED**.

**Reported Green Risk** (`MET-HLTH-033`, new)

> A project whose **Reported RAG (`MET-HLTH-012`) is GREEN**, while **either** the System-Assessed
> RAG is already AMBER or RED, **or** the evidence shows material deterioration (trajectory
> DETERIORATING/RAPIDLY_DETERIORATING, or an outlook horizon worse than the present band).

**Reported/System Conflict** is the broader existing metric, `MET-HLTH-030 Status Divergence`, which
measures divergence in *either* direction and is unchanged. Reported Green Risk is the narrower,
directional case — reported **more optimistic** than the evidence — which is the direction that hides
a problem. Both remain.

They are **independent booleans**. A project may be both, either or neither, and the finding carries
both verdicts plus both bands so a consumer can always show them side by side.

### D-2 — Reported RAG is never overwritten, corrected or derived

It is L1 observed — a management declaration — and it is read in and read out unchanged
(`PRODUCT_SPEC.md` §3.3, §8 anti-requirement 6). `null` means no status was reported for the period,
which is a **different fact** from a reported GREEN and is recorded as such: the rule emits
`notEvaluatedReason: 'no status was reported for this period'` rather than defaulting.

Asserted by a test that walks all twelve (reported × system) combinations and checks the value
survives.

### D-3 — Scenario B stays out of System Green-at-Risk, and that is the point

Curated scenario **B** is Reported GREEN over a System-Assessed AMBER. Under D-1 it is **not** System
Green-at-Risk — the system already says AMBER, so there is nothing forward-looking left to discover —
and it **is** Reported Green Risk. Scenario **C** ("Reported Green, Evidence Amber") remains the
canonical reported-vs-system conflict case.

This is the resolution of the objection ADR-0015 D-4 raised. The flagship scenario does fire a
flagship rule; it fires the *correct* one, and the reason it does not fire the other is now a stated
property rather than an awkward silence.

### D-4 — The "≥ 1 stated reason" condition is removed as a gate

The Phase 4 rule required three conditions: band GREEN, trajectory falling, **and at least one stated
economics reason** (margin erosion, burn gap, contingency depletion, uncompensated scope).

That third condition was a defect, and the defect had a name in the repository the whole time.
Curated scenario **LR** — *"Leading Risk, No Cost Overrun"* — is a project whose milestones slip,
contingency drains and scope exposure builds while cost tracks progress perfectly well. Every reason
in the list is an *economics* reason, so LR could clear none of them, and a project designed to be
the hardest and most valuable early detection in the portfolio was **structurally undetectable**.

The determination now keys on band + approved outlook. Both carry their own evidence (the outlook
cites the trajectory beneath it), so ADR-0004 §2 — *cite the evidence or do not produce the finding* —
is satisfied. Reasons are still gathered, still displayed, and are now **supporting detail rather
than a gate**.

With this and DR-021's multi-signal adapter in place, LR now reports System GREEN today, 30-day
AMBER, 60-day RED, and `isSystemGreenAtRisk = true` — with its `DELIVERY_VELOCITY` signal
**not** materially adverse, which is exactly the case the old rule could not see.

---

## Consequences

**Positive**

- The product can state which of two very different things it has found, and route each to the
  conversation that fixes it.
- Schedule-led and commercial-led deterioration are detectable. Previously only cost-led was.
- Scenario B's awkwardness is resolved by making it fire the right rule rather than by loosening the
  wrong one.

**Negative**

- Two metrics where there was one: a reader must learn the distinction, and a careless screen could
  still label both "at risk". Phase 7's design contract names them separately for that reason.
- Removing the reason gate makes the finding easier to fire. Mitigated by the trigger being the
  *approved outlook* — itself produced from multi-signal trajectory with per-signal material-adverse
  thresholds — rather than the raw trajectory state. The healthy reference scenario A is asserted by
  test to remain unflagged, and that test caught a real proxy defect during this closure.

**Neutral**

- `MET-FCST-025` and `MET-HLTH-033` both remain `Draft`. Their own meanings are now settled; what
  keeps them Draft is **C-7** — which health model produces `MET-HLTH-011` — and that is out of
  scope here and already tracked under ADR-0015.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Keep System-Assessed only (ADR-0015 D-4 as-is)** | Loses the reported-vs-system signal `PRODUCT_SPEC.md` §3.3 calls the most valuable in the product, and leaves scenario B firing nothing |
| **Key off Reported RAG instead** | Makes the product's headline finding a function of what somebody typed. A project reported Green by an optimist and one reported Green by a realist would be indistinguishable |
| **Fire on either, with the reading named in the finding** | The option ADR-0015 floated. Rejected: one flag with a discriminator field is a flag people filter on and a field people ignore. Two metrics cannot be conflated by accident |
| **Keep the reason gate and add schedule reasons to the list** | Treats the symptom. The list would need extending again for the next signal class, and each extension is a silent decision about what counts as risk |
| **Overwrite Reported RAG with the system view where they disagree** | Destroys the divergence signal outright, and violates §3.3 and §8 anti-requirement 6 |

## Rollback

Restore the single `isGreenAtRisk` boolean and the three-condition rule; drop `MET-HLTH-033`; revert
`MET-FCST-025`'s formula. Reported RAG plumbing is additive and can stay. The cost of rolling back is
that scenario LR becomes undetectable again, which is the reason not to.
