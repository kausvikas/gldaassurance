/**
 * `MET-PORT-003` — portfolio gross-margin value at risk, and shared-cause **concentration**.
 *
 * ## The correction this file records
 *
 * An earlier implementation (ADR-0021, now **superseded by ADR-0023**) subtracted a "shared-cause
 * double count" from the portfolio total: where several projects carried the same `riskCauseKey`,
 * that cause was counted once at its largest single-project exposure. On the demo portfolio it
 * removed **$38.93M from an $89.19M gross — 44%**.
 *
 * **That was wrong, and it understated real exposure.**
 *
 * `MET-FIN-019` is `max(0, MET-FIN-026 − MET-FIN-032)`: *this* project's sold margin less *this*
 * project's risk-adjusted margin. Two projects' margins are **disjoint pools of money**. No dollar
 * can appear in both, so there is nothing to de-duplicate between them.
 *
 * A shared `riskCauseKey` is a **category label**, not a pointer to one monetary event. The fact
 * model settles it: `RiskRow` carries no shared-exposure id, no allocation amount and no allocation
 * basis, and on the demo portfolio `KEY_PERSON` spans 75 risk rows across 59 projects with 67
 * *distinct* cost impacts. Those are 59 separate risks filed under one label — not one loss booked
 * 59 times. If a key person is lost across three projects, three margins are damaged.
 *
 * **Shared root cause is correlation and concentration. It is not duplicated money.**
 *
 * ## What would justify a reduction
 *
 * Only explicit **monetary shared-exposure evidence**: a governed `SharedExposureId` with a total
 * amount, a per-project allocation, an allocation basis and a residual that reconciles. Cause
 * identity alone can never distinguish *"six separate losses from one root cause"* from *"one loss
 * booked six times"*, and only the second is duplication. ADR-0023 §4 specifies that fact model for
 * the day it is needed; until it exists, no cross-project subtraction is permissible.
 *
 * ## What this file therefore does
 *
 * `portfolioValueAtRisk` counts each **distinct eligible project exactly once**. A project with four
 * cause keys still contributes its `MET-FIN-019` once — that is the only de-duplication the
 * requirement ever needed, and it is what `REQ-PORT-003` means by *"without double counting"*.
 *
 * `causeConcentration` reports systemic concentration **beside** that total and never inside it. Its
 * rows are **deliberately non-additive**: a project exposed to three causes appears in three rows, so
 * the rows sum to more than the portfolio total. That is correct for a concentration measure and is
 * flagged on the result so no caller can mistake it for an allocation.
 */
import { type CurrencyCode, Money, type Quantity, qAdd, qCompare, qDiv, qMul, qty } from '@platform/decimal';

// ---------------------------------------------------------------------------

/** One open risk, as the register holds it. Supplied by the Application layer, never fetched. */
export interface RiskCauseInput {
  /** A shared root-cause **category**. Not an identifier for one monetary event. */
  readonly causeKey: string;
  /** 0–1. */
  readonly probability: Quantity;
  readonly costImpact: Money;
}

export interface ProjectCauseInput {
  readonly projectId: string;
  /** `MET-FIN-019` — the authoritative per-project figure, used exactly as governed. */
  readonly gmValueAtRisk: Money;
  readonly risks: readonly RiskCauseInput[];
}

/**
 * How one project's own value at risk divides across its causes.
 *
 * A **within-project** diagnostic only. It answers *"which cause dominates this project?"* and is
 * never used to reduce a portfolio total — attribution inside a project says nothing about whether
 * two projects share a dollar.
 */
export interface CauseAttribution {
  readonly causeKey: string;
  readonly amount: Money;
}

export interface ProjectAttribution {
  readonly projectId: string;
  readonly gmValueAtRisk: Money;
  readonly attributions: readonly CauseAttribution[];
  readonly dominantCause: string | null;
  readonly dominantAmount: Money;
  readonly notAttributableReason?: string;
}

/**
 * Systemic concentration on one root cause. **Non-additive across rows.**
 *
 * `exposedValueAtRisk` is the full `MET-FIN-019` of every project carrying this cause — the question
 * being answered is *"how much portfolio margin sits on projects exposed to this cause?"*, not
 * *"how much of the portfolio total belongs to it"*. A project with three causes contributes its
 * whole figure to all three rows, which is why the rows must never be summed.
 */
export interface CauseConcentration {
  readonly causeKey: string;
  readonly exposedProjectCount: number;
  readonly projectIds: readonly string[];
  readonly exposedValueAtRisk: Money;
  readonly largestSingleProjectExposure: Money;
  /** `exposedValueAtRisk / portfolio total`, as a decimal string. May exceed 1 across all rows. */
  readonly shareOfPortfolioValueAtRisk: Quantity | null;
}

export interface PortfolioValueAtRisk {
  readonly metricId: 'MET-PORT-003';
  /** Σ `MET-FIN-019` over **distinct** eligible projects. Each project counted exactly once. */
  readonly valueAtRisk: Money;
  readonly projectCount: number;
  /**
   * Concentration diagnostics. **Non-additive**: these rows describe where exposure clusters, and
   * summing them double counts multi-cause projects by construction.
   */
  readonly concentration: readonly CauseConcentration[];
  readonly concentrationIsAdditive: false;
  /** Per-project cause attribution, for driver ranking. Never subtracted from the total. */
  readonly attributions: readonly ProjectAttribution[];
  readonly projectsWithNoRecordedCause: readonly string[];
  /**
   * Why no cross-project reduction is applied, carried on the result so a consumer rendering this
   * figure cannot present it as de-duplicated when it is not.
   */
  readonly deduplicationBasis: string;
}

const NO_CROSS_PROJECT_DEDUP =
  'Each distinct eligible project contributes MET-FIN-019 exactly once. No cross-project reduction '
  + 'is applied: a shared riskCauseKey is a category label, not evidence that two projects share a '
  + 'monetary exposure, and two projects\' margins are disjoint pools. A reduction would require '
  + 'explicit shared-exposure allocation facts, which the model does not carry (ADR-0023).';

// ---------------------------------------------------------------------------

/**
 * Splits one project's `MET-FIN-019` across its own causes, probability-weighted.
 *
 * A within-project diagnostic. The shares sum exactly to the project's value at risk, which is what
 * makes "the dominant cause on this project" a defensible statement — and it remains a statement
 * about **one** project.
 */
export function attributeProject(input: ProjectCauseInput, zero: Money): ProjectAttribution {
  const byCause = new Map<string, Quantity>();
  for (const r of input.risks) {
    const weighted = qMul(r.costImpact.toQuantity(), r.probability);
    byCause.set(r.causeKey, qAdd(byCause.get(r.causeKey) ?? qty('0'), weighted));
  }

  const rawTotal = [...byCause.values()].reduce((a, b) => qAdd(a, b), qty('0'));
  if (byCause.size === 0 || qCompare(rawTotal, qty('0')) <= 0 || input.gmValueAtRisk.isZero()) {
    return {
      projectId: input.projectId,
      gmValueAtRisk: input.gmValueAtRisk,
      attributions: [],
      dominantCause: null,
      dominantAmount: zero,
      notAttributableReason: byCause.size === 0
        ? 'no open risk carries a cause key'
        : input.gmValueAtRisk.isZero()
          ? 'the project has no gross margin at risk to attribute'
          : 'every recorded risk has zero probability-weighted impact',
    };
  }

  const ordered = [...byCause.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const scaled = ordered.map(([causeKey, raw]) => ({
    causeKey,
    amount: input.gmValueAtRisk.times(qDiv(raw, rawTotal) ?? qty('0')),
  }));
  const assigned = scaled.reduce((a, x) => a.plus(x.amount), zero);
  const residual = input.gmValueAtRisk.minus(assigned);

  let largestIndex = 0;
  for (let i = 1; i < scaled.length; i += 1) {
    const here = (scaled[i] as CauseAttribution).amount.toQuantity();
    const best = (scaled[largestIndex] as CauseAttribution).amount.toQuantity();
    if (qCompare(here, best) > 0) largestIndex = i;
  }
  const attributions = scaled.map((x, i) => (
    i === largestIndex ? { causeKey: x.causeKey, amount: x.amount.plus(residual) } : x
  ));
  const dominant = attributions[largestIndex] as CauseAttribution;

  return {
    projectId: input.projectId,
    gmValueAtRisk: input.gmValueAtRisk,
    attributions,
    dominantCause: dominant.causeKey,
    dominantAmount: dominant.amount,
  };
}

/**
 * `MET-PORT-003` over an authorised set, plus non-additive concentration diagnostics.
 *
 * Pure over its inputs. The caller supplies the projects; this function holds no repository and
 * cannot widen the population (ADR-0005 §5).
 */
export function portfolioValueAtRisk(
  projects: readonly ProjectCauseInput[], zero: Money,
): PortfolioValueAtRisk {
  // Distinct projects only. A project supplied twice is one economic exposure, and this is the
  // only de-duplication the requirement calls for.
  const distinct = new Map<string, ProjectCauseInput>();
  for (const p of projects) if (!distinct.has(p.projectId)) distinct.set(p.projectId, p);
  const unique = [...distinct.values()];

  const valueAtRisk = unique.reduce((a, p) => a.plus(p.gmValueAtRisk), zero);
  const attributions = unique.map((p) => attributeProject(p, zero));

  // Concentration: every project carrying the cause, at its full value at risk.
  const byCause = new Map<string, ProjectCauseInput[]>();
  for (const p of unique) {
    for (const key of new Set(p.risks.map((r) => r.causeKey))) {
      byCause.set(key, [...(byCause.get(key) ?? []), p]);
    }
  }

  const concentration = [...byCause.entries()]
    .map(([causeKey, members]) => {
      const exposed = members.reduce((a, m) => a.plus(m.gmValueAtRisk), zero);
      const largest = members.reduce(
        (best, m) => (qCompare(m.gmValueAtRisk.toQuantity(), best.toQuantity()) > 0 ? m.gmValueAtRisk : best),
        zero,
      );
      return {
        causeKey,
        exposedProjectCount: members.length,
        projectIds: members.map((m) => m.projectId).sort(),
        exposedValueAtRisk: exposed,
        largestSingleProjectExposure: largest,
        shareOfPortfolioValueAtRisk: valueAtRisk.isZero()
          ? null : qDiv(exposed.toQuantity(), valueAtRisk.toQuantity()),
      };
    })
    // Largest concentration first; ties by cause key so the order is deterministic (AC-7).
    .sort((a, b) => qCompare(b.exposedValueAtRisk.toQuantity(), a.exposedValueAtRisk.toQuantity())
      || a.causeKey.localeCompare(b.causeKey));

  return {
    metricId: 'MET-PORT-003',
    valueAtRisk,
    projectCount: unique.length,
    concentration,
    concentrationIsAdditive: false,
    attributions,
    projectsWithNoRecordedCause: attributions
      .filter((a) => a.dominantCause === null)
      .map((a) => a.projectId),
    deduplicationBasis: NO_CROSS_PROJECT_DEDUP,
  };
}

/** Currency guard, exported so a caller can state the unit it aggregated in. */
export function currencyOf(zero: Money): CurrencyCode {
  return zero.toDto().currency as CurrencyCode;
}
