# Five-role rejection review — live product

Conducted against `https://gldaassurance.web.app` in Chrome at 1440×900 and 1024, after the final
acceptance remediation. Each role was used to attempt rejection, not confirmation.

---

## Chief Delivery Officer — *can I run the weekly review and know where to act?*

**PASS.**

The Command Center opens on the decision: 75 projects, $451.28M contracted, forecast margin 20.2%
against 25.6% sold, $35.95M at risk, 27 awaiting a decision. Health is shown twice — 38/22/15 by
count, but $182.34M Green against $188.26M Amber by contract value, which is the reading that
changes what I do. Green projects requiring attention separates nine reported-Green disagreements
from ten emerging risks, and the intervention queue is ordered by the governed ranking with the
deciding reason on each row.

*Attempted rejection:* filtered to North America and deteriorating, moved through Projects, Forward
Risk and Interventions, and the population held at 7 of 75 and $6.39M on every surface. Selected the
scope-leakage driver and the whole product narrowed to the 60 projects carrying it.

**Defect found:** the intervention queue's "why it ranks here" column is dense — three lines of
governed reasoning per row. Readable, but it slows the scan. *Disposition: P1, not blocking; the
reasoning is correct and an executive can skip it.*

---

## CFO — *can I trust and reconcile the economics?*

**PASS.**

Every additive total is a sum of governed per-project values, asserted by
`executive-facts-reconciliation.test.ts` across five non-trivial filter combinations. Sold against
forecast margin is stated as a comparison rather than an isolated number. Risk-adjusted margin is
labelled "scenario, not accounting" on project pages. Contract-loss movement is reported directionally
(0 created, 2 cleared) rather than as a net.

*Attempted rejection:* checked that filtering cannot change arithmetic — the browser only counts and
sums facts the engines decided, and the reconciliation suite proves the payload agrees with the
engine on every band, trajectory and outlook.

**Defect found:** none blocking. Forecast margin is TCV-weighted; a reader could assume it is a
simple mean. *Disposition: P1, add the weighting basis to the label.*

---

## Chief Product Officer — *differentiated, or another dashboard?*

**PASS.**

Four things here are not reproducible in a BI tool: reported status held beside the assessed one
with the disagreement as the finding; a forward outlook that refuses to state a probability and says
why; recovery shown as named improving signals rather than a score; and an assistant whose
refusals are the product rather than a limitation.

*Attempted rejection:* asked whether removing the differentiators leaves a portfolio dashboard. It
does — but they are on the primary surface, not buried, and the Green taxonomy is the landing page's
third section.

**Defect found:** systemic intelligence surfaces six drivers; the directive's fuller list includes
ETC optimism and dependency blockage, which are governed conditions the facts do not yet carry.
*Disposition: P1, the six present are correct and drill through.*

---

## Chief Architect — *are governed semantics and boundaries preserved?*

**PASS.**

No threshold, weight, band edge, override or RAG rule was changed. The client runtime filters,
counts and sums authoritative facts and derives nothing — where an aggregation needed a number the
view model carried only as a display string, the numeric projection is emitted server-side, so
there is one business-truth path. The architecture gate enforces decimal safety and caught two
attempts to take a shortcut with `Number()` and `parseInt()`. The build fails if a legacy shell, a
second shell or a missing active state reaches the distribution.

The Green taxonomy correction is a presentation grouping over authoritative facts; MET-HLTH-033
keeps its historical semantics and rides on every fact for provenance.

*Attempted rejection:* looked for a second data path. There is none — the assistant is
pre-composed from governed responses, and no page makes a network request.

**Defect found:** none blocking.

---

## Executive UX / Design Director — *first-party GlobalLogic, logo hidden?*

**PASS.**

Compared against globallogic.com at 1440×900. The site has no sidebar, no cards and uses orange as
punctuation; all six routes here do the same — a floating rounded navigation bar on a light-steel
ground, alternating full-bleed bands, figures in aligned columns separated by rules, and one orange
moment per view as inline emphasis in the headline. Tables are editorial: no vertical rules, no
row fills, small RAG markers carrying a text label and a shape.

*Logo-hidden test:* with the wordmark removed, the typographic scale, spatial rhythm and colour
restraint still read as the same design organisation. It does not resemble Power BI, ServiceNow,
Jira or an admin template — there is no sidebar, no card grid and no tab bar anywhere.

**Defect found:** on project pages the governed status line can be as terse as "RED." where the
domain's summary offers nothing more. Honest, but thin at L1. *Disposition: P1, the cause, outlook,
economic impact and action lines beneath it carry the meaning.*

---

## Outcome

Five PASS, zero P0. Four P1 defects recorded above, none of which prevents an executive from
running the review, trusting the economics, or telling this product from a dashboard.
