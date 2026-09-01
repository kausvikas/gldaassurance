/**
 * `MET-PORT-007` — Executive Intervention Priority Rank. **MC-5 resolved; see ADR-0019.**
 *
 * The Portfolio Command Center exists to answer one question in thirty seconds: *where should
 * leadership intervene first?* Phase 4 refused to answer it, and was right to: the registered
 * formula was `MET-FIN-019 × MET-FCST-010 × intervenability`, and "intervenability" was not a
 * threshold awaiting a number — it was a concept nobody had defined. Inventing a proxy would have
 * resolved an open question by inference.
 *
 * ADR-0019 resolves it by taking the question apart. Two things were conflated under one word:
 *
 *   - **Exposure and urgency** — how bad is this, and how soon. Observed or deterministically
 *     derived from facts.
 *   - **Actionability** — is there a credible intervention, evidenced by an owner, a date and a
 *     stated benefit. **Never inferred from severity.** A catastrophic project with no plan is not
 *     "highly actionable" because it is catastrophic; it is a catastrophic project with no plan, and
 *     that is a different sentence that leads to a different meeting.
 *
 * ### Why lexicographic and not weighted
 *
 * A weighted score would let a large `GM Value at Risk` outvote a contractual penalty already
 * crystallising, and nobody looking at the number would know it had happened. `CLAUDE.md` invariant
 * 9 and `PRODUCT_SPEC.md` §8 both push the same way: an opaque composite is not an explanation. So
 * ordering is **lexicographic over ordered tiers** — the first tier on which two projects differ
 * decides, and every comparison can be stated in one sentence: *"A outranks B because A has
 * crystallising contractual exposure and B does not."*
 *
 * A hard risk therefore cannot be buried by averaging, because there is no average.
 *
 * ### The tiers, in order
 *
 * | # | Tier | Direction | Why here |
 * | --- | --- | --- | --- |
 * | 1 | Critical economic / contractual exposure | present first | Penalties and contract loss are realised money with a legal clock; nothing outranks them |
 * | 2 | Predicted deterioration | present first | The product's differentiator — a problem you can still get ahead of |
 * | 3 | Time criticality | sooner first | Between two equal problems, the one with less time left is the one to take today |
 * | 4 | GM value at risk | larger first | Scale, once the qualitative questions are settled |
 * | 5 | Actionability | more credible first | **Below every exposure tier**, so it orders equals and can never lift a small problem above a large one |
 * | 6 | Rank confidence | higher first | A well-evidenced case is more usable than a speculative one of the same size |
 * | 7 | Project id | ascending | Deterministic tiebreak (AC-7) |
 *
 * ### Missing evidence
 *
 * Never fabricated in either direction. A candidate with no usable evidence at all goes to
 * `insufficientEvidence` rather than being sorted last — an unmeasured project is not a safe one.
 * A candidate that *can* be placed but has gaps ranks with `rankConfidence` lowered and its gaps
 * named, because "we are confident this is third" and "this is third on partial evidence" are
 * different claims.
 *
 * Tier 1, so this imports no other context (ADR-0001 §4.1). Every input is supplied by the
 * application layer, already filtered to the caller's authorised entity set (ADR-0005 §5).
 */
import { type Quantity, Q_ZERO, qCompare, qty } from '@platform/decimal';
import type { RuleVersion } from '@platform/provenance';
import type { WeekId } from '@platform/time';

export type Band = 'GREEN' | 'AMBER' | 'RED';
export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

// ---------------------------------------------------------------------------
// Inputs — exposure and actionability, deliberately separate shapes
// ---------------------------------------------------------------------------

/**
 * How bad, and how soon. Every field is observed or deterministically derived; none is a judgement
 * this module makes.
 */
export interface ExposureEvidence {
  /** `MET-HLTH-011`. */
  readonly systemAssessedBand: Band | null;
  /** `MET-FIN-019` — GM value at risk in the reporting currency. */
  readonly gmValueAtRisk: Quantity | null;
  /** Contractual penalty exposure already crystallising (liquidated damages). */
  readonly contractualPenaltyExposure: Quantity | null;
  /** Forecast loss at completion — a contract expected to finish below cost. */
  readonly forecastContractLoss: Quantity | null;
  /** `MET-FCST-025` — System Green-at-Risk (ADR-0018). */
  readonly isSystemGreenAtRisk: boolean;
  /** Approved forward outlook. `null` where no outlook was projected for that horizon. */
  readonly outlook30: Band | null;
  readonly outlook60: Band | null;
  /** `MET-FCST-007` — weeks until the projected band change. */
  readonly weeksToBandChange: number | null;
  /** Weeks until the next contractually critical milestone. */
  readonly weeksToCriticalMilestone: number | null;
  /**
   * An executive RAG override in force. Recorded because an overridden project is one leadership has
   * already touched — it does not change the exposure, and it must be visible in the explanation.
   */
  readonly hardOverridePresent: boolean;
}

/**
 * Whether a credible intervention exists. **Evidence of a plan, never a restatement of severity.**
 *
 * Each field is a record that either exists or does not. There is no "estimated actionability"
 * because there is no evidence that would support one.
 */
export interface ActionabilityEvidence {
  readonly openRecoveryActionId: string | null;
  readonly namedOwner: string | null;
  readonly dueDate: string | null;
  /** Estimated GM benefit of the plan, in the reporting currency. */
  readonly estimatedGmBenefit: Quantity | null;
  readonly estimatedScheduleBenefitWeeks: number | null;
  readonly planConfidence: ConfidenceBand | null;
  /** The plan needs an executive decision — the single most useful thing this list can surface. */
  readonly executiveDependency: boolean;
}

export interface PriorityCandidate {
  readonly projectId: string;
  readonly exposure: ExposureEvidence;
  readonly actionability: ActionabilityEvidence;
  /** `MET-DQ-005` band. Qualifies the ranking; never blended into it. */
  readonly dataConfidenceBand: ConfidenceBand | null;
  /** `MET-DQ-007` band. Same treatment. */
  readonly forecastConfidenceBand: ConfidenceBand | null;
}

/**
 * `PRIORITY-v1` governed parameters. **Synthetic calibration candidates, not approved thresholds** —
 * the same caveat that applies to every other threshold in this repository.
 */
export interface PriorityPolicy {
  readonly version: RuleVersion;
  /** At or above this GM value at risk, a RED project counts as critical economic exposure. */
  readonly criticalGmValueAtRiskFloor: Quantity;
  /** Weeks at or below which time criticality is treated as immediate. */
  readonly immediateHorizonWeeks: number;
}

// ---------------------------------------------------------------------------
// Derived grades
// ---------------------------------------------------------------------------

/**
 * Actionability, graded from evidence presence alone.
 *
 * `NOT_ASSESSED` and `NO_PLAN` are different and the difference matters: one means nobody has looked,
 * the other means somebody looked and there is nothing. Collapsing them would make "no plan" and "no
 * information" identical on screen, and they call for opposite responses.
 */
export type ActionabilityGrade = 'CREDIBLE_PLAN' | 'PLAN_FORMING' | 'NO_PLAN' | 'NOT_ASSESSED';

const ACTIONABILITY_ORDER: Readonly<Record<ActionabilityGrade, number>> = {
  CREDIBLE_PLAN: 3, PLAN_FORMING: 2, NO_PLAN: 1, NOT_ASSESSED: 0,
};

export function gradeActionability(a: ActionabilityEvidence): ActionabilityGrade {
  const nothingKnown = a.openRecoveryActionId === null && a.namedOwner === null
    && a.dueDate === null && a.estimatedGmBenefit === null
    && a.estimatedScheduleBenefitWeeks === null && a.planConfidence === null;
  if (nothingKnown) return 'NOT_ASSESSED';
  if (a.openRecoveryActionId === null) return 'NO_PLAN';
  const hasBenefit = a.estimatedGmBenefit !== null || a.estimatedScheduleBenefitWeeks !== null;
  return a.namedOwner !== null && a.dueDate !== null && hasBenefit
    ? 'CREDIBLE_PLAN'
    : 'PLAN_FORMING';
}

const BAND_ORDER: Readonly<Record<Band, number>> = { GREEN: 0, AMBER: 1, RED: 2 };
const CONFIDENCE_ORDER: Readonly<Record<ConfidenceBand, number>> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

const positive = (q: Quantity | null): boolean => q !== null && qCompare(q, Q_ZERO) > 0;

/** Tier 1 — realised or contractually committed money with a clock on it. */
export function hasCriticalExposure(e: ExposureEvidence, policy: PriorityPolicy): boolean {
  if (positive(e.contractualPenaltyExposure)) return true;
  if (positive(e.forecastContractLoss)) return true;
  return e.systemAssessedBand === 'RED'
    && e.gmValueAtRisk !== null
    && qCompare(e.gmValueAtRisk, policy.criticalGmValueAtRiskFloor) >= 0;
}

/** Tier 2 — the outlook is worse than the present. The product's differentiator. */
export function hasPredictedDeterioration(e: ExposureEvidence): boolean {
  if (e.isSystemGreenAtRisk) return true;
  if (e.systemAssessedBand === null) return false;
  const now = BAND_ORDER[e.systemAssessedBand];
  return [e.outlook30, e.outlook60]
    .filter((b): b is Band => b !== null)
    .some((b) => BAND_ORDER[b] > now);
}

/** Tier 3 — weeks until something becomes irreversible. `null` means no clock is known. */
export function timeCriticalityWeeks(e: ExposureEvidence): number | null {
  const clocks = [e.weeksToBandChange, e.weeksToCriticalMilestone]
    .filter((w): w is number => w !== null);
  return clocks.length === 0 ? null : Math.min(...clocks);
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface PriorityTierValues {
  readonly criticalExposure: boolean;
  readonly predictedDeterioration: boolean;
  readonly timeCriticalityWeeks: number | null;
  readonly gmValueAtRisk: Quantity | null;
  readonly actionability: ActionabilityGrade;
  readonly rankConfidence: ConfidenceBand;
}

export interface PriorityRanking {
  readonly projectId: string;
  readonly rank: number;
  readonly tiers: PriorityTierValues;
  /** Named gaps in the evidence behind this placement. Empty when nothing is missing. */
  readonly evidenceGaps: readonly string[];
  /** Why this project sits where it does, in one readable sentence per deciding tier. */
  readonly narrative: string;
  /** Why it outranks the project immediately below it. Empty for the last ranked project. */
  readonly outranksBecause: string;
}

export interface UnrankedCandidate {
  readonly projectId: string;
  readonly reason: string;
  readonly evidenceGaps: readonly string[];
}

export interface InterventionPriorityResult {
  readonly week: WeekId;
  readonly ruleVersion: RuleVersion;
  readonly metricId: 'MET-PORT-007';
  readonly model: 'LEXICOGRAPHIC_TIERED';
  readonly tierOrder: readonly string[];
  readonly ranked: readonly PriorityRanking[];
  /** Never sorted to the bottom. An unmeasured project is not a safe one. */
  readonly insufficientEvidence: readonly UnrankedCandidate[];
}

export const PRIORITY_TIER_ORDER: readonly string[] = [
  '1. Critical economic / contractual exposure',
  '2. Predicted deterioration (System Green-at-Risk or worsening outlook)',
  '3. Time criticality (weeks to band change or critical milestone)',
  '4. GM value at risk',
  '5. Actionability (credible plan evidence)',
  '6. Rank confidence',
  '7. Project id (deterministic tiebreak)',
];

/**
 * Rank confidence — how much of the ordering rests on evidence we actually have.
 *
 * Deliberately **not** the data-confidence band restated. It answers a narrower question: could the
 * tiers above be evaluated? Missing the band or the exposure figure lowers it; a project with every
 * input present inherits the worse of the two supplied confidence bands, because a ranking built on
 * an untrustworthy forecast is an untrustworthy ranking.
 */
function rankConfidenceOf(c: PriorityCandidate, gaps: readonly string[]): ConfidenceBand {
  if (gaps.length >= 3) return 'LOW';
  const supplied = [c.dataConfidenceBand, c.forecastConfidenceBand]
    .filter((b): b is ConfidenceBand => b !== null);
  const base: ConfidenceBand = supplied.length === 0
    ? 'LOW'
    : supplied.reduce((worst, b) => (CONFIDENCE_ORDER[b] < CONFIDENCE_ORDER[worst] ? b : worst));
  if (gaps.length === 0) return base;
  // One or two gaps knock the band down one step, never up.
  return base === 'HIGH' ? 'MEDIUM' : 'LOW';
}

function gapsOf(c: PriorityCandidate): string[] {
  const gaps: string[] = [];
  if (c.exposure.systemAssessedBand === null) gaps.push('MET-HLTH-011 System-Assessed RAG');
  if (c.exposure.gmValueAtRisk === null) gaps.push('MET-FIN-019 GM value at risk');
  if (timeCriticalityWeeks(c.exposure) === null) gaps.push('no time-to-band-change or milestone clock');
  if (gradeActionability(c.actionability) === 'NOT_ASSESSED') gaps.push('no intervention assessment');
  if (c.dataConfidenceBand === null) gaps.push('MET-DQ-005 data confidence');
  return gaps;
}

/** Ascending comparison on a nullable clock: sooner first, unknown last but never treated as safe. */
function compareClock(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * The comparison. Walks the tiers and returns at the first difference.
 *
 * Exported so a test can assert the ordering law directly — transitivity and antisymmetry are
 * properties of this function, not of the sort that calls it.
 */
export function comparePriority(a: PriorityTierValues, b: PriorityTierValues, aId: string, bId: string): number {
  // 1. Critical exposure.
  if (a.criticalExposure !== b.criticalExposure) return a.criticalExposure ? -1 : 1;
  // 2. Predicted deterioration.
  if (a.predictedDeterioration !== b.predictedDeterioration) return a.predictedDeterioration ? -1 : 1;
  // 3. Time criticality — sooner first.
  const byClock = compareClock(a.timeCriticalityWeeks, b.timeCriticalityWeeks);
  if (byClock !== 0) return byClock;
  // 4. GM value at risk — larger first. A measured exposure orders ahead of an unmeasured one at
  //    the same tier position, and the gap is named on the ranking rather than hidden by the order.
  if (a.gmValueAtRisk === null || b.gmValueAtRisk === null) {
    if (a.gmValueAtRisk !== b.gmValueAtRisk) return a.gmValueAtRisk === null ? 1 : -1;
  } else {
    const byVar = qCompare(b.gmValueAtRisk, a.gmValueAtRisk);
    if (byVar !== 0) return byVar;
  }
  // 5. Actionability — orders equals only. It sits below every exposure tier by design.
  const byAction = ACTIONABILITY_ORDER[b.actionability] - ACTIONABILITY_ORDER[a.actionability];
  if (byAction !== 0) return byAction;
  // 6. Rank confidence.
  const byConfidence = CONFIDENCE_ORDER[b.rankConfidence] - CONFIDENCE_ORDER[a.rankConfidence];
  if (byConfidence !== 0) return byConfidence;
  // 7. Deterministic tiebreak (AC-7).
  return aId.localeCompare(bId);
}

function narrate(t: PriorityTierValues, gaps: readonly string[]): string {
  const parts: string[] = [];
  parts.push(t.criticalExposure
    ? 'Critical economic or contractual exposure is present'
    : 'No critical contractual exposure');
  parts.push(t.predictedDeterioration
    ? 'the forward outlook is worse than the present position'
    : 'the outlook does not worsen');
  parts.push(t.timeCriticalityWeeks === null
    ? 'no time clock is known'
    : `${t.timeCriticalityWeeks} week${t.timeCriticalityWeeks === 1 ? '' : 's'} until the next irreversible point`);
  parts.push(t.gmValueAtRisk === null
    ? 'GM value at risk is not computable'
    : `GM value at risk ${t.gmValueAtRisk}`);
  parts.push(`actionability ${t.actionability}`);
  const base = `${parts.join('; ')}. Rank confidence ${t.rankConfidence}.`;
  return gaps.length === 0
    ? base
    : `${base} Placed on partial evidence — missing: ${gaps.join(', ')}.`;
}

/** The one tier that separated two adjacent projects, stated plainly. */
function decidingTier(a: PriorityTierValues, b: PriorityTierValues, aId: string, bId: string): string {
  if (a.criticalExposure !== b.criticalExposure) {
    return 'it carries critical economic or contractual exposure and the next project does not (tier 1)';
  }
  if (a.predictedDeterioration !== b.predictedDeterioration) {
    return 'its forward outlook deteriorates and the next project\'s does not (tier 2)';
  }
  if (compareClock(a.timeCriticalityWeeks, b.timeCriticalityWeeks) !== 0) {
    return `less time remains before an irreversible point (tier 3: ${a.timeCriticalityWeeks ?? 'unknown'} vs ${b.timeCriticalityWeeks ?? 'unknown'} weeks)`;
  }
  if (a.gmValueAtRisk !== b.gmValueAtRisk) {
    return `more gross margin is at risk (tier 4: ${a.gmValueAtRisk ?? 'not computable'} vs ${b.gmValueAtRisk ?? 'not computable'})`;
  }
  if (a.actionability !== b.actionability) {
    return `a more credible intervention exists at equal exposure (tier 5: ${a.actionability} vs ${b.actionability})`;
  }
  if (a.rankConfidence !== b.rankConfidence) {
    return `the ranking rests on better evidence (tier 6: ${a.rankConfidence} vs ${b.rankConfidence})`;
  }
  return `every tier is equal; ordered by project id for determinism (tier 7: ${aId} before ${bId})`;
}

/**
 * `MET-PORT-007`. Deterministic, explainable, evidence-backed, versioned.
 *
 * A candidate is rankable when the ordering can be evaluated at all — which means either a GM value
 * at risk exists, or a higher tier has already fired. Everything else is returned separately.
 */
export function rankInterventionPriority(
  week: WeekId,
  policy: PriorityPolicy,
  candidates: readonly PriorityCandidate[],
): InterventionPriorityResult {
  const rankable: { id: string; tiers: PriorityTierValues; gaps: readonly string[] }[] = [];
  const insufficientEvidence: UnrankedCandidate[] = [];

  for (const c of candidates) {
    const gaps = gapsOf(c);
    const critical = hasCriticalExposure(c.exposure, policy);
    const predicted = hasPredictedDeterioration(c.exposure);
    const tiers: PriorityTierValues = {
      criticalExposure: critical,
      predictedDeterioration: predicted,
      timeCriticalityWeeks: timeCriticalityWeeks(c.exposure),
      gmValueAtRisk: c.exposure.gmValueAtRisk,
      actionability: gradeActionability(c.actionability),
      rankConfidence: rankConfidenceOf(c, gaps),
    };

    const placeable = critical || predicted || c.exposure.gmValueAtRisk !== null;
    if (!placeable) {
      insufficientEvidence.push({
        projectId: c.projectId,
        reason:
          'No tier could be evaluated: no critical exposure, no outlook worse than the present, and ' +
          'no GM value at risk. Listed separately rather than ranked last — an unmeasured project is ' +
          'not a safe one.',
        evidenceGaps: gaps,
      });
      continue;
    }
    rankable.push({ id: c.projectId, tiers, gaps });
  }

  rankable.sort((x, y) => comparePriority(x.tiers, y.tiers, x.id, y.id));

  const ranked: PriorityRanking[] = rankable.map((r, i) => {
    const next = rankable[i + 1];
    return {
      projectId: r.id,
      rank: i + 1,
      tiers: r.tiers,
      evidenceGaps: r.gaps,
      narrative: narrate(r.tiers, r.gaps),
      outranksBecause: next === undefined
        ? ''
        : decidingTier(r.tiers, next.tiers, r.id, next.id),
    };
  });

  return {
    week,
    ruleVersion: policy.version,
    metricId: 'MET-PORT-007',
    model: 'LEXICOGRAPHIC_TIERED',
    tierOrder: PRIORITY_TIER_ORDER,
    ranked,
    insufficientEvidence,
  };
}

/** Non-zero only where the ordering could be evaluated. For the aggregate coverage display. */
export function rankableCount(
  candidates: readonly PriorityCandidate[],
  policy: PriorityPolicy,
): Quantity {
  const n = candidates.filter(
    (c) => hasCriticalExposure(c.exposure, policy)
      || hasPredictedDeterioration(c.exposure)
      || c.exposure.gmValueAtRisk !== null,
  ).length;
  return n === 0 ? Q_ZERO : qty(String(n));
}
