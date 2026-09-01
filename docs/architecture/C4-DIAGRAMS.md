# C4 architecture views

**DEMO — SYNTHETIC DATA** · Phase 1 · Governed by ADR-0001

Three levels: system context, containers, components. A fourth (code) is not drawn — the module map
and the enforced manifest serve that purpose better than a diagram that would be stale within a
phase.

Each diagram is drawn **twice where POC and target differ**, because the single most common way an
architecture document misleads is by drawing the aspiration and letting the reader assume it is
built.

---

## 1. System context

Who and what the system talks to.

```mermaid
flowchart TB
    CDO["CDO / Delivery Executive<br/><i>Where do I spend intervention capacity?</i>"]
    DIR["Portfolio / Account Director<br/><i>Which account is quietly deteriorating?</i>"]
    DM["Delivery Manager<br/><i>Is my reported status defensible?</i>"]
    FIN["Finance / Commercial Controller<br/><i>Is forecast margin real?</i>"]
    CISO["CISO / Assurance<br/><i>Who saw what, who changed what?</i>"]

    DI["<b>GlobalLogic Delivery Intelligence</b><br/>Read-mostly intelligence layer over<br/>facts owned elsewhere, plus a thin<br/>system of record for its own judgements"]

    PSA["PSA / ERP<br/><i>actuals, cost, invoicing</i>"]
    CLM["Contract / CLM<br/><i>as-sold, change records</i>"]
    ALM["Jira / ALM<br/><i>milestones, scope, defects</i>"]
    HRIS["HRIS / Staffing<br/><i>assignments, pyramid, attrition</i>"]
    FX["FX rate source<br/><i>dated rates</i>"]
    IDP["Enterprise IdP<br/><i>SSO / SCIM</i>"]
    LLM["LLM provider<br/><i>narration only</i>"]

    CDO --> DI
    DIR --> DI
    DM --> DI
    FIN --> DI
    CISO --> DI

    PSA -.->|"read-only ingest"| DI
    CLM -.->|"read-only ingest"| DI
    ALM -.->|"read-only ingest"| DI
    HRIS -.->|"read-only ingest"| DI
    FX -.->|"read-only ingest"| DI
    IDP -.->|"identity"| DI
    DI -.->|"minimised, authorised<br/>context only"| LLM

    classDef poc fill:#e8f0fe,stroke:#3b5bdb,stroke-width:2px
    classDef deferred stroke-dasharray: 5 5
    class DI poc
    class PSA,CLM,ALM,HRIS,FX,IDP,LLM deferred
```

**Dashed = not connected in the POC.** Every external system above is represented in the POC by the
synthetic loader behind the `integration` adapter seam (`PRODUCT_SPEC.md` §4.2). The LLM provider is
introduced in Phase 11 and only then.

Two directional facts the diagram is making load-bearing:

- **Every source arrow points inward.** The product does not write back to source systems
  (`PRODUCT_SPEC.md` §1.3). It is not a PSA, an ERP, a timesheet system, or a PM tool.
- **The browser never appears beside a source system.** There is no path from a user's browser to an
  enterprise source; all ingestion is server-side. This is a security constraint, not a performance
  one.

---

## 2. Containers

### 2.1 POC — what actually runs

```mermaid
flowchart TB
    subgraph browser["Untrusted zone"]
        SPA["Web application<br/><i>React SPA</i><br/>renders; computes nothing"]
    end

    subgraph host["Application host — one process (ADR-0001)"]
        BFF["API / BFF<br/><i>HTTP, session, CSRF,<br/>schema validation</i>"]
        APP["Application layer<br/><i>use cases · <b>authorization</b> ·<br/>audit emission · DTO assembly</i>"]
        DOM["Domain — 19 bounded contexts<br/><i>economics · rules · health ·<br/>trajectory · data quality</i>"]
        PLAT["Platform<br/><i>decimal · clock · persistence ·<br/>authz types · audit sink · config</i>"]
        JOB["Scheduled worker<br/><i>in-process; weekly snapshot,<br/>synthetic ingest</i>"]
    end

    subgraph data["Data"]
        PG[("PostgreSQL<br/><i>schema per context ·<br/>NUMERIC money ·<br/>append-only snapshots + audit</i>")]
        SEED["Synthetic seed<br/><i>data/synthetic/ + MANIFEST.json</i>"]
    end

    SPA -->|"HTTPS, HttpOnly session cookie"| BFF
    BFF --> APP
    APP --> DOM
    APP --> PLAT
    DOM --> PLAT
    JOB --> APP
    PLAT --> PG
    SEED -.->|"Phase 3 loader"| JOB

    classDef untrusted fill:#fff4e6,stroke:#e8590c,stroke-width:2px
    class SPA untrusted
```

The single most important property of this picture is what is **absent**: no message broker, no
cache tier, no second datastore, no per-context service (ADR-0001 §Decision 7). One process and one
transaction boundary is why the margin bridge reconciles.

`JOB` runs in-process rather than as a separate container. It is drawn separately because it is the
first thing that becomes its own container at scale, not because it is one now.

### 2.2 Target state — where the seams lead

```mermaid
flowchart TB
    SPA["Web application"]
    GW["API gateway<br/><i>TLS, WAF, rate limiting</i>"]
    BFF["BFF<br/><i>per-surface composition</i>"]

    subgraph svc["Extractable services — only where scale or ownership justifies it"]
        CORE["Delivery Intelligence core<br/><i>foundation + fact + rules contexts</i>"]
        ENG["Metric & health engine<br/><i>compute-heavy, horizontally scalable</i>"]
        AI["AI intelligence service<br/><i>separate blast radius, separate rate limits</i>"]
        ING["Ingestion service<br/><i>adapters, staging, canonicalisation</i>"]
    end

    subgraph datat["Data"]
        OLTP[("Operational store<br/>PostgreSQL")]
        WH[("Analytical warehouse<br/><i>snapshots, portfolio history</i>")]
        FS[("Feature store<br/><i>optional — only if ML forecasting arrives</i>")]
    end

    BUS{{"Event backbone<br/><i>ingestion + recompute triggers</i>"}}

    SPA --> GW --> BFF
    BFF --> CORE
    BFF --> ENG
    BFF --> AI
    ING --> BUS --> CORE
    CORE --> OLTP
    ENG --> OLTP
    ENG --> WH
    CORE -.->|"CDC"| WH
    WH -.-> FS
    FS -.-> ENG
    AI -->|"through core's own API,<br/>under caller authorization"| CORE

    classDef future stroke-dasharray: 5 5
    class BUS,WH,FS,GW,ING,AI,ENG future
```

**The seams are chosen deliberately, and there are only four.** Each corresponds to a real reason to
separate — compute profile, blast radius, ownership, or ingest cadence — not to a context boundary.
Nineteen contexts do not become nineteen services (ADR-0001 §Alternatives).

| Seam | Why it is a plausible service later | Why it is not one now |
| --- | --- | --- |
| Ingestion | Different cadence, different failure modes, different scaling from query traffic | One synthetic loader, no live sources |
| Metric & health engine | CPU-bound; scales with projects × weeks, not with users | 48 projects × 78 weeks computes in milliseconds |
| AI intelligence | Different blast radius, different rate limits, external provider dependency | Already isolated *architecturally* by the import ban — the wall exists without the process |
| BFF | Per-surface composition may want independent deploy cadence from the domain | One surface family, one team |

The AI arrow in the target diagram is the same arrow as in the POC: it reaches data only through the
core's application services, under the caller's authorization. That property must survive extraction
or ADR-0004's guarantee is lost.

---

## 3. Components — inside the application host

```mermaid
flowchart TB
    subgraph pres["Presentation — renders, never decides"]
        VM["View models<br/><i>provenance treatment · status<br/>never colour-only</i>"]
    end

    subgraph app["Application — TRUST BOUNDARY, every request re-authorised"]
        UC["Use cases"]
        ENF["Enforcement point<br/><i>role × scope × field</i>"]
        SCOPE["Scope resolver<br/><i>→ authorised entity set</i>"]
        ORCH["Orchestrators<br/><i>portfolio aggregation ·<br/>DQ probe registry ·<br/>AI retrieval ports</i>"]
        AUD["Audit emitter"]
        DTO["DTO assembly<br/><i>+ field redaction</i>"]
    end

    subgraph dom["Domain"]
        direction TB
        FOUND["<b>Foundation</b> · tier 1<br/>identity · organization ·<br/>portfolio · project · contract"]
        FACT["<b>Fact (L1)</b> · tier 2<br/>financial · delivery · commercial ·<br/>quality · resource · risk · assurance"]
        SUP["<b>Support</b> · tier 0<br/>rules · integration"]
        DER["<b>Derived (L2)</b> · tier 3<br/>health · data-quality · recovery"]
        INF["<b>Inferred (L3)</b> · tier 4<br/>forecast"]
        AIC["<b>ai-intelligence</b> · tier 4<br/><i>imports no domain context</i>"]
    end

    subgraph plat["Platform"]
        MON["decimal<br/><i>Money</i>"]
        CLK["time<br/><i>Clock</i>"]
        PROV["provenance<br/><i>envelope</i>"]
        AZ["authz<br/><i>types</i>"]
        AUDP["audit<br/><i>sink</i>"]
        PER["persistence"]
        CFG["config"]
    end

    VM --> UC
    UC --> ENF --> SCOPE
    UC --> ORCH
    UC --> AUD
    UC --> DTO
    ORCH --> FOUND
    ORCH --> FACT
    ORCH --> DER
    ORCH --> INF
    ORCH -->|"injects authorised ports"| AIC
    DER --> FACT
    DER --> SUP
    INF --> DER
    INF --> FACT
    FACT --> FOUND
    dom --> plat

    classDef boundary fill:#e6fcf5,stroke:#0ca678,stroke-width:3px
    class app boundary
```

Read the arrows into `ai-intelligence` carefully: they point **from** the orchestrator **into** the
context, not the other way. The assistant does not fetch; it is handed a port that was already
bound to the caller's authorization context. That inversion is what makes AC-6 a test rather than a
promise, and it is enforced as violation `ARCH-004`.

Three components deserve naming because the brief names them as distinct concepts and conflating
them is a common failure:

| Concept | Where it lives | What it must never do |
| --- | --- | --- |
| **ProjectEconomicsEngine** | `financial` context | Be reimplemented in a chart, a SQL view, or the assistant |
| **Rules engine** | `rules` context (definitions) evaluated by consumers | Hold thresholds as code constants |
| **Health engine** | `health` context | Run in the UI (REQ-HLTH-008), or absorb confidence into its score |
| **Trajectory engine** | `forecast` context | Be presented with the authority of a computed margin figure |
