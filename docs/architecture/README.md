# Architecture blueprint — index

**Status:** Phase 1 deliverable · **DEMO — SYNTHETIC DATA**

These documents describe the target architecture. They do not override anything: accepted ADRs in
`docs/adr/` govern, and `ARCHITECTURE_DECISIONS.md` §4 is the standing architecture. Where a
document below describes something not yet decided, it says so and names the ADR proposing it.

**Nothing proposed here is implemented.** `ARCHITECTURE_DECISIONS.md` §3 step 7 — "Only then
implement." Phase 1's code implements only what ADR-0001…0005 already authorise: the module
structure, the boundary enforcement, the platform contracts, and the provenance envelope.

| Document | Answers |
| --- | --- |
| [`C4-DIAGRAMS.md`](C4-DIAGRAMS.md) | What is the system, what runs, what is inside it? |
| [`DOMAIN-MODEL.md`](DOMAIN-MODEL.md) | What are the canonical entities, and how do they relate? |
| [`MODULE-MAP.md`](MODULE-MAP.md) | What does each context own, what may it depend on, and how is that enforced? |
| [`DATA-FLOW.md`](DATA-FLOW.md) | How does a fact become a number on a screen, and how is it attributed? |
| [`API-STRATEGY.md`](API-STRATEGY.md) | How does the UI talk to the system, and how do contracts change? (ADR-0006) |
| [`DATA-PLATFORM.md`](DATA-PLATFORM.md) | Operational vs analytical storage, and how it scales (ADR-0007) |
| [`INTEGRATION-MODEL.md`](INTEGRATION-MODEL.md) | How enterprise sources arrive and stay trustworthy (ADR-0008) |
| [`RESILIENCE.md`](RESILIENCE.md) | What happens when something fails |
| [`OBSERVABILITY.md`](OBSERVABILITY.md) | How we know what happened (ADR-0009) |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Environments, configuration, secrets (ADR-0010) |
| [`SECURITY-ARCHITECTURE.md`](SECURITY-ARCHITECTURE.md) | Trust zones and enforcement points at architecture level |
| [`DEFERRED-DECISIONS.md`](DEFERRED-DECISIONS.md) | What Phase 1 deliberately did not decide, and who decides it |

## The one-paragraph version

A modular monolith in one process over one PostgreSQL database, partitioned into nineteen bounded
contexts whose dependency rules are enforced by a build gate rather than by convention. Facts (L1)
flow in through adapter seams, are canonicalised, and are snapshotted weekly and append-only.
Deterministic engines compute derived metrics (L2) from those facts under versioned rules. Inferred
outputs (L3) — trajectory and narration — read L1 and L2 but can never write to them. Every value
that crosses the Application layer carries a provenance envelope saying which of the three it is
and what it rests on. Authorization is enforced once, at the Application layer, over a scope
resolved before any query runs. The assistant has no data path of its own; it goes through the same
door as the UI, under the same authorization context, and emits references to computed values
rather than numerals.
