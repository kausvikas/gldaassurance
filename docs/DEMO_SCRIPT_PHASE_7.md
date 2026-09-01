# Demo script — Portfolio Command Center (REQ-PORT-004)

> ## ⚠️ DEMO — SYNTHETIC DATA
>
> Every figure below comes from the generated portfolio. No client, employee or financial data is
> real, and nothing in this repository points at a production system.

- **Requirement:** `REQ-PORT-004` — *"30-second path from load to named project verified by
  documented demo script"*, verify: **manual**
- **Acceptance criterion under test:** AC-1 — load → named project needing intervention, **under 30
  seconds, under 3 interactions**
- **Phase:** 7
- **Status of this script:** written and reproducible. **The 30-second run has not been performed** —
  it requires a human at a browser, and §5 records what that person must report.

---

## 0. Before you start

```bash
npm run design:command-center        # rebuilds the artifact from the real gateway
open docs/design/portfolio-command-center.html
```

Set the browser window to **1440×900** and do not zoom. If the page needs zooming out to fit, the
demo has already failed and §5's first check is a No.

The file contains **three pages separated by horizontal rules**, in this order: Chief Delivery
Officer, Portfolio Director (EMEA), Delivery Manager. The manual review checklist is the last
section.

---

## 1. The thirty-second run (AC-1)

Start a timer, open the **first** page, and do not scroll.

| # | What you are looking for | Where it is | Interactions spent |
| --- | --- | --- | --- |
| 1 | *"Which portfolio am I looking at?"* | The line above everything: **Fixed-bid portfolio · 75 of 91 projects in your authorised scope · excluded: 5 CAPACITY, 11 TIME_AND_MATERIALS** | 0 |
| 2 | *"How big is it, and how is margin doing?"* | KPIs 1–3, left to right: **$453.64M TCV**, **$115.47M sold GM**, **$35.76M forecast GM** | 0 |
| 3 | *"How much is at risk?"* | KPI 4: **$89.19M GM value at risk**; KPI 5: **$4.76M forecast loss exposure** | 0 |
| 4 | *"How bad is it already?"* | KPI 6: **73 of 75 Amber or Red** | 0 |
| 5 | *"Which Greens are deteriorating?"* | The Green-at-Risk panel — **1 System Green-at-Risk**, **4 Reported Green Risk**, shown as two separate findings | 0 |
| 6 | **"Where do I intervene first?"** | Named in a sentence **above** the table: **rank 1, Aventine Biosciences Data Modernisation Wave 1 (`prj-076`)**, with the tier that decided it, its clock and its rank confidence | 0 |

**Interactions spent reaching the answer: zero.** The AC-1 budget of three is for the drill-down that
follows, not for the answer itself.

Stop the timer. Record the elapsed time in §5.

## 2. The follow-up questions (AC-3, ≤3 steps to L1 facts)

Still on the CDO page:

1. **"Why is `prj-076` first?"** — its row states the deciding tier. On this portfolio the top of the
   table is separated by the **clock** (tier 3) and by **GM at risk** (tier 4); tier 1, critical
   exposure, fires for 47 of 75 projects and partitions rather than ranks (ADR-0019, closure note).
2. **"How long do I have?"** — the **Time to act** column. `prj-076` reads **now**. Note that *"no
   clock known"* and *"now"* are different cells and mean opposite things.
3. **"How much should I trust the order?"** — the **Rank conf.** column, reported beside the rank and
   never blended into it.
4. **"What is already being done?"** — the **Recovery** column reads **Not assessed** on every row.
   Say this out loud rather than skipping it: the POC has **no recovery-plan store** (DR-049), so
   "Not assessed" means *nobody has recorded a plan*, not *no recovery is needed*.
5. **"Where does $89.19M come from?"** — open the evidence disclosure on KPI 4. It names the metric
   (`MET-FIN-019`), the rule version, the scope line and the inputs.

## 3. The security story (AC-5) — scroll to the second page

The **EMEA Portfolio Director** made the *same request* against the *same portfolio*:

| | CDO | Portfolio Director, EMEA |
| --- | --- | --- |
| Projects in scope | **75** fixed-bid of 91 authorised | **27** |
| Total fixed-bid TCV | **$453.64M** | **$139.09M** |

Say the part that matters: **the smaller total is not the larger total filtered down.** It is
computed over the director's own authorised set, resolved server-side from their session. The two
project sets are asserted **disjoint** by test. The fixed-bid population is applied *inside* each
caller's scope, never instead of it.

## 4. The denial (SECURITY_MODEL §4.5) — scroll to the third page

The **Delivery Manager** does not hold `portfolio.viewAggregates`. The server returned the same
generic not-found it returns for a project that does not exist: **no capability, scope or reason is
disclosed**, and the page renders that state as the product would render it. A viewer cannot tell
"you may not see this" from "this does not exist" — which is the point.

## 5. What the reviewer must report

This script is reproducible; the judgement is not. Fill this in and attach it to the phase record.

| Check | Result |
| --- | --- |
| Elapsed time from load to naming `prj-076`, without scrolling | ______ seconds |
| Interactions spent | ______ |
| Did the page fit 1440×900 without zooming? | Yes / No |
| Did any status rely on colour alone? | Yes / No |
| Did anything read as a number you could not trace? | Yes / No |
| Reviewer, date | ______________ |

Then work the **12-point manual review checklist** in the artifact's final section. An unticked box
is an open gate, not a formality.

## 6. What this demo deliberately does not show

- **Movement.** No prior-period snapshot store exists (DR-045), so the KPIs carry no deltas. The page
  states the absence rather than rendering "no change" — do not describe a flat KPI as stable.
- **Live filtering.** The 13 filters render with **server-computed counts** and no dispatcher
  (DR-044). A viewer can see how many projects each filter would return without clicking; clicking
  is not yet wired.
- **Drill-through destinations.** Every link is declared and correct; the destination surfaces are
  Phase 8+ (DR-047).
- **Portfolio exposure is additive, and that is the correct treatment.** GM value at risk is
  **$90.80M** — `Σ MET-FIN-019` over **distinct eligible projects, each counted once**
  (`MET-PORT-003` v2.0.0). It does **not** net shared root causes: `MET-FIN-019` is one project's own
  margin, so two projects hold disjoint pools and there is nothing to subtract between them. Shared
  cause is reported beside the total as **concentration**, explicitly **non-additive**.
  **`REQ-PORT-003` is met** — counting each distinct project once is the entirety of the
  de-duplication the requirement asks for.
  *(Corrected at Phase 11A. This bullet previously described ~~ADR-0021's~~ withdrawn de-duplication
  as pending work and stated the requirement was unmet; **ADR-0023** supersedes it, and the earlier
  $38.93M reduction was economically unsupported.)*
