/**
 * Cohort selection — who is in a population, and why.
 *
 * Phase 3 corrections 3 and 5. Two populations were previously implicit:
 *
 *   - the **fixed-bid cohort**, which Phase 7's Command Center defaults to and which must not be
 *     contaminated by T&M or capacity engagements;
 *   - the **MC-6 calibration cohort**, which was reported as "81 projects" without the rules that
 *     produced 81.
 *
 * A population reported without its eligibility rules cannot be reproduced, checked, or argued with.
 * Both are now derived from explicit criteria, and the counts are whatever those criteria yield.
 */
import Decimal from 'decimal.js';
import type { SyntheticPortfolio } from './index.js';
import type { ProjectSpec } from './portfolio.js';
import { recomputeEconomics } from './validate.js';

const D = (v: string | number) => new Decimal(v);

// ---------------------------------------------------------------------------
// Correction 3 — contract-type cohorts
// ---------------------------------------------------------------------------

/**
 * The 75 fixed-price engagements. **Phase 7's Fixed-Bid Portfolio Command Center defaults to this
 * cohort.**
 *
 * T&M and capacity engagements exist to validate canonical modelling and prove contract-type
 * extensibility — to stop fixed-bid assumptions leaking into shared architecture. They must not
 * enter a fixed-bid aggregate.
 */
export function fixedBidCohort(p: SyntheticPortfolio): readonly ProjectSpec[] {
  return p.structure.projects.filter((s) => s.engagementModel === 'FIXED_BID');
}

export function cohortByEngagementModel(p: SyntheticPortfolio, model: ProjectSpec['engagementModel']): readonly ProjectSpec[] {
  return p.structure.projects.filter((s) => s.engagementModel === model);
}

/**
 * Filters a candidate population to the engagements a metric actually supports.
 *
 * A metric declares `applicableContractTypes`. Passing an unsupported engagement into an aggregate
 * is how a fixed-bid-only concept — unsecured upside, uncompensated scope, contingency — silently
 * acquires a denominator that includes T&M work.
 */
export function cohortForMetric(
  p: SyntheticPortfolio,
  applicableContractTypes: readonly string[],
): readonly ProjectSpec[] {
  return p.structure.projects.filter((s) => applicableContractTypes.includes(s.engagementModel));
}

// ---------------------------------------------------------------------------
// Correction 5 — the MC-6 calibration cohort
// ---------------------------------------------------------------------------

/**
 * Eligibility rules for margin-trajectory calibration. Each exists for a reason; none is a
 * convenience filter to reach a particular number.
 */
export const MC6_ELIGIBILITY = {
  includedContractTypes: ['FIXED_BID'] as const,
  excludedContractTypes: ['TIME_AND_MATERIALS', 'CAPACITY'] as const,
  excludedLifecycleSubStages: ['MOBILIZATION', 'CLOSED_OUT'] as const,
  minimumProgressClaims: 12,
  includeCuratedScenarios: false,
  rationale: {
    contractType:
      'Margin trajectory measures erosion against a fixed price. On T&M the client absorbs effort ' +
      'overrun, so the same slope means something different; mixing them makes the distribution ' +
      'describe two populations at once.',
    lifecycle:
      'A project in mobilisation has no delivery history to have a trend, and a closed-out project ' +
      'has stopped moving. Both would drag the distribution toward zero for reasons unrelated to ' +
      'deterioration.',
    observations:
      'A slope needs enough points to be a slope. Twelve weekly claims is the minimum at which a ' +
      'trailing-window trend is not dominated by two readings.',
    curated:
      'The eight curated scenarios and the leading-risk case are hand-solved to hit stated figures. ' +
      'Including them would calibrate the threshold partly against numbers chosen to demonstrate ' +
      'the threshold — circular.',
  },
} as const;

export interface Mc6CohortMember {
  readonly projectId: string;
  readonly soldGmPercent: Decimal;
  readonly forecastGmPercent: Decimal;
  readonly observations: number;
  /** Percentage points of margin per week, signed. Negative is erosion. */
  readonly marginSlopePpPerWeek: Decimal;
}

export interface Mc6Cohort {
  readonly totalPortfolio: number;
  readonly excluded: Readonly<Record<string, number>>;
  readonly members: readonly Mc6CohortMember[];
  readonly percentiles: Readonly<Record<'p05' | 'p10' | 'p25' | 'p50' | 'p75' | 'p90', string>>;
}

/** Derives the cohort from `MC6_ELIGIBILITY`. The count is whatever the rules yield. */
export function mc6Cohort(p: SyntheticPortfolio): Mc6Cohort {
  const excluded: Record<string, number> = {
    contractType: 0, lifecycle: 0, insufficientObservations: 0, curated: 0, marginNotComputable: 0,
  };
  const members: Mc6CohortMember[] = [];

  for (const spec of p.structure.projects) {
    if (!(MC6_ELIGIBILITY.includedContractTypes as readonly string[]).includes(spec.engagementModel)) {
      excluded['contractType'] = (excluded['contractType'] ?? 0) + 1;
      continue;
    }
    if ((MC6_ELIGIBILITY.excludedLifecycleSubStages as readonly string[]).includes(spec.lifecycleSubStage)) {
      excluded['lifecycle'] = (excluded['lifecycle'] ?? 0) + 1;
      continue;
    }
    if (!MC6_ELIGIBILITY.includeCuratedScenarios && spec.curatedScenario !== undefined) {
      excluded['curated'] = (excluded['curated'] ?? 0) + 1;
      continue;
    }
    const observations = p.facts.progressClaims.filter((r) => r.projectId === spec.projectId).length;
    if (observations < MC6_ELIGIBILITY.minimumProgressClaims) {
      excluded['insufficientObservations'] = (excluded['insufficientObservations'] ?? 0) + 1;
      continue;
    }
    const e = recomputeEconomics(p, spec.projectId);
    if (e.forecastGmPercent === null || e.contractValueAsSold.isZero()) {
      excluded['marginNotComputable'] = (excluded['marginNotComputable'] ?? 0) + 1;
      continue;
    }
    const sold = e.soldGmValue.dividedBy(e.contractValueAsSold);
    members.push({
      projectId: spec.projectId,
      soldGmPercent: sold,
      forecastGmPercent: e.forecastGmPercent,
      observations,
      marginSlopePpPerWeek: e.forecastGmPercent.minus(sold).times(100).dividedBy(observations),
    });
  }

  const sorted = [...members].sort((a, b) => a.marginSlopePpPerWeek.comparedTo(b.marginSlopePpPerWeek));
  const at = (f: number): string => {
    if (sorted.length === 0) return 'n/a';
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * f));
    return (sorted[idx] as Mc6CohortMember).marginSlopePpPerWeek.toFixed(4);
  };

  return {
    totalPortfolio: p.structure.projects.length,
    excluded,
    members,
    percentiles: { p05: at(0.05), p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) },
  };
}
