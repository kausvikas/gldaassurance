/**
 * Data confidence and forecast reliability.
 *
 * Two numbers, never one. `PRODUCT_SPEC.md` §3.4: an unreliably-Green project and a confidently-
 * Amber one must not be able to collapse to the same figure, so `MET-DQ-006` is a **tuple** and this
 * engine never multiplies health by confidence. It also never multiplies *data* confidence by
 * *forecast* confidence: "are the inputs trustworthy" and "has this team's estimating held up" are
 * different questions with different remedies.
 *
 * Pure over the observations it is handed (ADR-0012): fact contexts implement `DataQualityProbe`
 * and the application layer registers them, so adding a fact domain does not widen this context's
 * import surface.
 */
import {
  type Quantity, Q_HUNDRED, Q_ZERO, qAdd, qClamp, qCompare, qDiv, qFixed, qMul, qSub, qty,
} from '@platform/decimal';
import { type Explanation, type RuleEvaluation, explain } from '@platform/explainability';
import type { RecordRef, RuleVersion } from '@platform/provenance';
import type { Instant, WeekId } from '@platform/time';

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

/** What one fact domain reports about itself. It reports; it does not score itself. */
export interface DomainObservationInput {
  readonly domain: string;
  readonly requiredFields: number;
  readonly populatedFields: number;
  readonly valuesChecked: number;
  readonly valuesValid: number;
  /** Named domain-rule failures, so validity can be explained rather than merely reported. */
  readonly invalidFields: readonly string[];
  readonly assertionsEvaluated: number;
  readonly assertionsPassed: number;
  readonly failedAssertions: readonly string[];
  readonly ageDays: number | null;
  readonly expectedCadenceDays: number;
  readonly evidence: readonly RecordRef[];
}

export interface DataConfidenceWeights {
  readonly completeness: Quantity;
  readonly freshness: Quantity;
  readonly consistency: Quantity;
  readonly coverage: Quantity;
  readonly validity: Quantity;
  readonly highBandFloor: Quantity;
  readonly mediumBandFloor: Quantity;
  /** Freshness scores 0 at this multiple of the expected cadence. */
  readonly stalenessRedMultiple: Quantity;
  /**
   * **DR-018 — the band ceiling.** Domains whose silence makes an assessment undefendable regardless
   * of how well everything else scores.
   *
   * The defect this closes: the composite is a weighted mean, and a weighted mean is exactly the
   * instrument for hiding one bad component behind five good ones. A project could score 80 —
   * comfortably HIGH — while its authoritative Finance feed had said nothing for two months, and the
   * displayed label would read "HIGH confidence" beside a margin figure computed from stale cost.
   *
   * The fix is a **ceiling, not a penalty**. The arithmetic is untouched: the score still says what
   * the components average to, which is a true statement about the components. What changes is the
   * *band*, which is the claim a reader acts on — and the band cannot assert more confidence than
   * the worst critical domain supports. The two are reported separately so neither is disguised as
   * the other.
   */
  readonly criticalDomains: readonly string[];
  /**
   * Per-domain staleness tolerance, in multiples of that domain's own expected cadence.
   *
   * Deliberately **not** a universal number of days. A finance feed on a monthly cadence and a
   * delivery tracker on a weekly one become undefendable at very different absolute ages, and a
   * single "60 days" threshold would be simultaneously too strict for one and far too lax for the
   * other. Expressed as a multiple so the tolerance travels with the cadence the domain actually
   * reports on.
   */
  readonly criticalStalenessTolerance: Quantity;
  /** Version of the ceiling policy in force, recorded on every assessment. */
  readonly freshnessPolicyVersion: string;
}

export interface DataConfidenceInput {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  readonly ruleVersion: RuleVersion;
  readonly metricCatalogVersion: string;
  readonly expectedDomains: readonly string[];
  readonly observations: readonly DomainObservationInput[];
  /**
   * The record that defines what *should* have been reported for this project — its weekly
   * snapshot row. Required, and the reason is not bureaucratic: a finding about **absence**
   * ("Finance is silent") cannot cite the missing record, so it cites the record that establishes
   * the expectation instead. Without it `explain()` would have to choose between refusing to state
   * the most important data-quality finding there is and stating it with nothing behind it.
   */
  readonly assessmentEvidence: readonly RecordRef[];
  readonly weights: DataConfidenceWeights;
}

export interface DataConfidenceAssessment {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  /** MET-DQ-001 */ readonly completeness: Quantity | null;
  /** MET-DQ-002 — worst domain age in days. */ readonly freshnessDays: number | null;
  /** MET-DQ-003 */ readonly consistency: Quantity | null;
  /** MET-DQ-004 */ readonly sourceCoverage: Quantity | null;
  /** MET-DQ-008 */ readonly validity: Quantity | null;
  /** MET-DQ-005 — 0–100. The arithmetic, untouched by the ceiling. */
  readonly confidenceScore: Quantity | null;
  /** The band the score alone would have produced. Kept so the cap is visible, not silent. */
  readonly arithmeticBand: ConfidenceBand;
  /** The band that may be displayed, after the DR-018 critical-freshness ceiling. */
  readonly band: ConfidenceBand;
  /** Set when the ceiling bound the band below the arithmetic. */
  readonly bandCappedBy?: string;
  /** Critical domains beyond their staleness tolerance, named with their age and tolerance. */
  readonly staleCriticalDomains: readonly StaleCriticalDomain[];
  /** Critical domains that have never reported at all — a different fact from stale. */
  readonly silentCriticalDomains: readonly string[];
  readonly freshnessPolicyVersion: string;
  readonly missingDomains: readonly string[];
  readonly failedAssertions: readonly string[];
  readonly invalidFields: readonly string[];
  readonly explanation: Explanation;
}

export interface StaleCriticalDomain {
  readonly domain: string;
  readonly ageDays: number;
  readonly expectedCadenceDays: number;
  /**
   * The age at which this domain becomes undefendable, derived from its own cadence.
   *
   * A `Quantity`, not a `number`: it is `cadence × tolerance` and the G-FLOAT gate rejects coercing
   * it back — which it did, when the first draft of this closed over `Number(tolerance)`.
   */
  readonly toleranceDays: Quantity;
}

/** Σa / Σb as a 0–1 ratio, or null when nothing was measured. */
function share(pairs: readonly (readonly [number, number])[]): Quantity | null {
  const num = pairs.reduce((a, [n]) => a + n, 0);
  const den = pairs.reduce((a, [, d]) => a + d, 0);
  return den === 0 ? null : qDiv(qty(String(num)), qty(String(den)));
}

export function assessDataConfidence(input: DataConfidenceInput): DataConfidenceAssessment {
  const { observations: obs, weights: w } = input;
  const reporting = new Set(obs.map((o) => o.domain));
  const missingDomains = input.expectedDomains.filter((d) => !reporting.has(d));

  const completeness = share(obs.map((o) => [o.populatedFields, o.requiredFields] as const));
  const consistency = share(obs.map((o) => [o.assertionsPassed, o.assertionsEvaluated] as const));
  const validity = share(obs.map((o) => [o.valuesValid, o.valuesChecked] as const));
  const sourceCoverage = input.expectedDomains.length === 0 ? null
    : qDiv(qty(String(reporting.size)), qty(String(input.expectedDomains.length)));

  const ages = obs.map((o) => o.ageDays).filter((a): a is number => a !== null);
  const freshnessDays = ages.length === 0 ? null : Math.max(...ages);

  // Freshness → score. A domain at its expected cadence scores 1; at `stalenessRedMultiple` × the
  // cadence it scores 0. Reported per domain and taken at the worst, because one silent source is
  // enough to make an assessment undefendable — averaging would let nine fresh domains hide it.
  const freshnessScores = obs.map((o) => {
    if (o.ageDays === null) return { domain: o.domain, score: Q_ZERO, reason: 'never reported' };
    const red = qMul(qty(String(o.expectedCadenceDays)), w.stalenessRedMultiple);
    const over = qSub(qty(String(o.ageDays)), qty(String(o.expectedCadenceDays)));
    const span = qSub(red, qty(String(o.expectedCadenceDays)));
    if (qCompare(over, Q_ZERO) <= 0) return { domain: o.domain, score: qty('1') };
    const decayed = qDiv(over, span);
    return {
      domain: o.domain,
      score: decayed === null ? Q_ZERO : qClamp(qSub(qty('1'), decayed), Q_ZERO, qty('1')),
    };
  });
  const freshnessScore = freshnessScores.length === 0 ? null
    : freshnessScores.reduce(
        (worst, f) => (qCompare(f.score, worst) < 0 ? f.score : worst), qty('1'),
      );

  const components: readonly { id: string; metricId: string; value: Quantity | null; weight: Quantity }[] = [
    { id: 'COMPLETENESS', metricId: 'MET-DQ-001', value: completeness, weight: w.completeness },
    { id: 'FRESHNESS', metricId: 'MET-DQ-002', value: freshnessScore, weight: w.freshness },
    { id: 'CONSISTENCY', metricId: 'MET-DQ-003', value: consistency, weight: w.consistency },
    { id: 'COVERAGE', metricId: 'MET-DQ-004', value: sourceCoverage, weight: w.coverage },
    { id: 'VALIDITY', metricId: 'MET-DQ-008', value: validity, weight: w.validity },
  ];
  const usable = components.filter((c) => c.value !== null);
  const weightSum = usable.reduce((a, c) => qAdd(a, c.weight), Q_ZERO);
  const weighted = usable.reduce((a, c) => qAdd(a, qMul(c.value as Quantity, c.weight)), Q_ZERO);
  const raw = usable.length === 0 ? null : qDiv(weighted, weightSum);
  const confidenceScore = raw === null ? null : qty(qFixed(qMul(raw, Q_HUNDRED), 2));

  const arithmeticBand: ConfidenceBand = confidenceScore === null ? 'LOW'
    : qCompare(confidenceScore, w.highBandFloor) >= 0 ? 'HIGH'
    : qCompare(confidenceScore, w.mediumBandFloor) >= 0 ? 'MEDIUM'
    : 'LOW';

  // --- DR-018: the critical-freshness ceiling --------------------------------
  // Tolerance is a multiple of each domain's *own* cadence, so a monthly finance feed and a weekly
  // delivery tracker are held to the same standard of defensibility rather than the same number of
  // days. Silent and stale are separated: "never reported" and "reported two months ago" are
  // different facts with different remedies, and a single label for both loses that.
  // Only domains this assessment actually expects can be critical to it. A project that does not
  // report a domain at all — because it has none — must not be capped for the silence of something
  // nobody asked for; `expectedDomains` is the caller's declaration of what applies here.
  const applicableCritical = w.criticalDomains.filter((d) => input.expectedDomains.includes(d));
  const critical = new Set(applicableCritical);
  const staleCriticalDomains: StaleCriticalDomain[] = [];
  const silentCriticalDomains: string[] = [];

  for (const o of obs) {
    if (!critical.has(o.domain)) continue;
    if (o.ageDays === null) { silentCriticalDomains.push(o.domain); continue; }
    const tolerance = qMul(qty(String(o.expectedCadenceDays)), w.criticalStalenessTolerance);
    if (qCompare(qty(String(o.ageDays)), tolerance) > 0) {
      staleCriticalDomains.push({
        domain: o.domain,
        ageDays: o.ageDays,
        expectedCadenceDays: o.expectedCadenceDays,
        toleranceDays: tolerance,
      });
    }
  }
  // A critical domain that reported nothing at all is silence, and it is caught here rather than
  // only by coverage — coverage is a ratio, and a ratio dilutes.
  for (const d of applicableCritical) {
    if (!reporting.has(d) && !silentCriticalDomains.includes(d)) silentCriticalDomains.push(d);
  }

  // Ceiling, never a floor: a critical domain that has gone silent caps at LOW, one that is merely
  // beyond tolerance caps at MEDIUM. The band can only move down.
  const ceiling: ConfidenceBand | null =
    silentCriticalDomains.length > 0 ? 'LOW'
    : staleCriticalDomains.length > 0 ? 'MEDIUM'
    : null;

  const RANK: Readonly<Record<ConfidenceBand, number>> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  const capped = ceiling !== null && RANK[ceiling] < RANK[arithmeticBand];
  const band: ConfidenceBand = capped ? (ceiling as ConfidenceBand) : arithmeticBand;

  const bandCappedBy = !capped ? undefined
    : silentCriticalDomains.length > 0
      ? `Critical domain${silentCriticalDomains.length === 1 ? '' : 's'} `
        + `${silentCriticalDomains.join(', ')} reported nothing at all. The composite scores `
        + `${confidenceScore ?? 'nothing'}, but an assessment cannot be more trustworthy than a `
        + `domain it never heard from, so the displayed band is capped at LOW `
        + `(freshness policy ${w.freshnessPolicyVersion}).`
      : `Critical domain${staleCriticalDomains.length === 1 ? '' : 's'} `
        + `${staleCriticalDomains.map((d) => `${d.domain} (${d.ageDays}d against a ${d.toleranceDays}d tolerance on a ${d.expectedCadenceDays}d cadence)`).join(', ')} `
        + `${staleCriticalDomains.length === 1 ? 'is' : 'are'} beyond tolerance. The composite scores `
        + `${confidenceScore ?? 'nothing'} — a true statement about the components — but a weighted `
        + `mean can hide one stale authoritative source behind several fresh ones, so the displayed `
        + `band is capped at MEDIUM (freshness policy ${w.freshnessPolicyVersion}).`;

  const evaluations: RuleEvaluation[] = [
    ...components.map((c): RuleEvaluation => ({
      ruleId: `DQ-${c.id}`, ruleName: c.id, ruleSetId: 'DQ-v1', ruleVersion: input.ruleVersion,
      signalId: c.id, signalMetricId: c.metricId,
      observedValue: c.value, comparison: 'PRESENT',
      ...(c.value === null ? { notEvaluatedReason: 'no domain reported anything measurable' } : {}),
      status: (c.value !== null) ? 'FIRED' : 'CLEAR',
      fired: c.value !== null,
      contribution: c.value === null ? 'excluded from the composite'
        : `${c.weight} weight × ${c.value}`,
      narrative: c.value === null
        ? `${c.id} could not be measured and was excluded, rather than scored as zero — a zero here ` +
          'would be a fabricated measurement.'
        : `${c.id} = ${c.value} at weight ${c.weight}.`,
      evidence: [...obs.flatMap((o) => o.evidence), ...input.assessmentEvidence],
    })),
    {
      ruleId: 'DQ-BAND', ruleName: 'Confidence band', ruleSetId: 'DQ-v1',
      ruleVersion: input.ruleVersion, signalId: 'CONFIDENCE_SCORE', signalMetricId: 'MET-DQ-005',
      observedValue: confidenceScore, comparison: 'GTE', thresholdValue: w.highBandFloor,
      status: (arithmeticBand === 'HIGH') ? 'FIRED' : 'CLEAR',
      fired: arithmeticBand === 'HIGH', contribution: `arithmetic band = ${arithmeticBand}`,
      narrative: confidenceScore === null
        ? 'Nothing measurable was reported, so confidence is LOW by default — an unmeasured project ' +
          'is not a trustworthy one.'
        : `Score ${confidenceScore} against High ≥ ${w.highBandFloor}, Medium ≥ ${w.mediumBandFloor}.`,
      evidence: input.assessmentEvidence,
    },
    {
      // DR-018. Always emitted, firing or not, so a reader can see the ceiling was checked rather
      // than inferring it from its silence.
      ruleId: 'DQ-CRITICAL-FRESHNESS', ruleName: 'Critical-domain freshness ceiling',
      ruleSetId: 'DQ-v1', ruleVersion: input.ruleVersion,
      signalId: 'CRITICAL_DOMAIN_FRESHNESS', signalMetricId: 'MET-DQ-002',
      observedValue: [...staleCriticalDomains.map((d) => `${d.domain}=${d.ageDays}d`), ...silentCriticalDomains.map((d) => `${d}=silent`)].join(', ') || 'all critical domains within tolerance',
      comparison: 'LTE',
      thresholdValue: `${w.criticalStalenessTolerance} × each domain's expected cadence`,
      ...(applicableCritical.length === 0
        ? { notEvaluatedReason: 'no declared critical domain is expected for this project' }
        : {}),
      status: (capped) ? 'FIRED' : 'CLEAR',
      fired: capped,
      contribution: capped
        ? `band capped from ${arithmeticBand} to ${band}`
        : `no cap; band stands at ${arithmeticBand}`,
      narrative: bandCappedBy
        ?? `Critical domains (${w.criticalDomains.join(', ')}) are all within `
           + `${w.criticalStalenessTolerance}× their expected cadence, so the arithmetic band stands `
           + `(freshness policy ${w.freshnessPolicyVersion}).`,
      evidence: [
        ...obs.filter((o) => critical.has(o.domain)).flatMap((o) => o.evidence),
        ...input.assessmentEvidence,
      ],
    },
    ...(missingDomains.length > 0 ? [{
      ruleId: 'DQ-MISSING-DOMAINS', ruleName: 'Expected domains silent', ruleSetId: 'DQ-v1',
      ruleVersion: input.ruleVersion, signalId: 'MISSING_DOMAINS', signalMetricId: 'MET-DQ-004',
      observedValue: missingDomains.join(', '), comparison: 'PRESENT',
      status: (true) ? 'FIRED' : 'CLEAR',
      fired: true, contribution: 'lowers coverage',
      narrative:
        `${missingDomains.length} expected domain${missingDomains.length === 1 ? '' : 's'} reported ` +
        `nothing: ${missingDomains.join(', ')}. Named rather than counted, because "coverage 0.8" ` +
        'is not actionable and "Finance is silent" is.',
      evidence: input.assessmentEvidence,
    } satisfies RuleEvaluation] : []),
  ];

  return {
    projectId: input.projectId, week: input.week, assessedAt: input.assessedAt,
    completeness, freshnessDays, consistency, sourceCoverage, validity,
    confidenceScore, arithmeticBand, band,
    ...(bandCappedBy !== undefined ? { bandCappedBy } : {}),
    staleCriticalDomains, silentCriticalDomains,
    freshnessPolicyVersion: w.freshnessPolicyVersion,
    missingDomains,
    failedAssertions: obs.flatMap((o) => o.failedAssertions),
    invalidFields: obs.flatMap((o) => o.invalidFields),
    explanation: explain({
      outcome: `Data confidence = ${band}`,
      outcomeDetail: capped
        ? `score ${confidenceScore ?? 'not computable'} (arithmetic band ${arithmeticBand}), capped to ${band} by critical-domain freshness`
        : `score ${confidenceScore ?? 'not computable'}`,
      evaluatedAt: input.assessedAt,
      ruleSetVersion: input.ruleVersion,
      metricCatalogVersion: input.metricCatalogVersion,
      evaluations,
    }),
  };
}

// ---------------------------------------------------------------------------
// Forecast reliability (MET-DQ-007 authoritative, MET-DQ-009 profile)
// ---------------------------------------------------------------------------

/**
 * **CONFLICT C-9, and why there are two things here.**
 *
 * `METRIC_CATALOG.md` freezes MET-DQ-007 as a weighted composite of exactly three inputs: replan
 * frequency (MET-DEL-014), ETC optimism gap (MET-FIN-030) and velocity stability (MET-DEL-013).
 * Phase 4 direction asks for a forecast-confidence assessment over a different and longer list —
 * ETC freshness and coverage, scope stability, milestone accuracy, open dependencies, resource
 * stability, and required future productivity.
 *
 * Rewriting the frozen formula to match the prompt would be exactly the silent change invariant 3
 * forbids, and the precedence order puts `METRIC_CATALOG.md` above a phase instruction. So:
 *
 *   - `forecastConfidence()` implements **MET-DQ-007 exactly as frozen**. It is the authoritative
 *     number.
 *   - `forecastReliabilityProfile()` implements the seven requested factors as **MET-DQ-009**, a
 *     separately registered `Draft` profile reported *beside* MET-DQ-007, never in place of it.
 *
 * ADR-0015 proposes the reconciliation. Until it is accepted, both exist and both are labelled.
 */
export interface ForecastConfidenceWeights {
  readonly replan: Quantity;
  readonly optimism: Quantity;
  readonly stability: Quantity;
}

export interface ForecastConfidenceInput {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  readonly ruleVersion: RuleVersion;
  readonly metricCatalogVersion: string;
  /** MET-DEL-014 — replans per period. Higher is worse. */
  readonly replanFrequency: Quantity | null;
  /** MET-FIN-030 — ETC optimism gap. Higher is worse. */
  readonly etcOptimismGap: Quantity | null;
  /** MET-DEL-013 — velocity stability, 0–1. Higher is better. */
  readonly velocityStability: Quantity | null;
  readonly weights: ForecastConfidenceWeights;
  /** Where each component scores 1 (green) and 0 (red). Calibration, not code. */
  readonly edges: {
    readonly replan: readonly [Quantity, Quantity];
    readonly optimism: readonly [Quantity, Quantity];
    readonly stability: readonly [Quantity, Quantity];
  };
  readonly evidence: readonly RecordRef[];
}

export interface ForecastConfidenceAssessment {
  readonly projectId: string;
  readonly week: WeekId;
  /** MET-DQ-007 — 0–100, or null when no component is measurable. */
  readonly score: Quantity | null;
  readonly band: ConfidenceBand;
  readonly explanation: Explanation;
}

/** Piecewise-linear normalisation to [0,1]: 1 at or past `green`, 0 at or past `red`. */
function normalise(v: Quantity, green: Quantity, red: Quantity): Quantity {
  const span = qSub(green, red);
  const scaled = qDiv(qSub(v, red), span);
  return scaled === null ? Q_ZERO : qClamp(scaled, Q_ZERO, qty('1'));
}

/** MET-DQ-007, exactly as frozen: three named inputs, weighted, banded. */
export function assessForecastConfidence(
  input: ForecastConfidenceInput,
  highBandFloor: Quantity,
  mediumBandFloor: Quantity,
): ForecastConfidenceAssessment {
  const parts = [
    { id: 'REPLAN_FREQUENCY', metricId: 'MET-DEL-014', raw: input.replanFrequency,
      edges: input.edges.replan, weight: input.weights.replan },
    { id: 'ETC_OPTIMISM_GAP', metricId: 'MET-FIN-030', raw: input.etcOptimismGap,
      edges: input.edges.optimism, weight: input.weights.optimism },
    { id: 'VELOCITY_STABILITY', metricId: 'MET-DEL-013', raw: input.velocityStability,
      edges: input.edges.stability, weight: input.weights.stability },
  ] as const;

  const scored = parts
    .filter((p) => p.raw !== null)
    .map((p) => ({ ...p, score: normalise(p.raw as Quantity, p.edges[0], p.edges[1]) }));

  const weightSum = scored.reduce((a, p) => qAdd(a, p.weight), Q_ZERO);
  const weighted = scored.reduce((a, p) => qAdd(a, qMul(p.score, p.weight)), Q_ZERO);
  const raw = scored.length === 0 ? null : qDiv(weighted, weightSum);
  const score = raw === null ? null : qty(qFixed(qMul(raw, Q_HUNDRED), 2));

  const band: ConfidenceBand = score === null ? 'LOW'
    : qCompare(score, highBandFloor) >= 0 ? 'HIGH'
    : qCompare(score, mediumBandFloor) >= 0 ? 'MEDIUM'
    : 'LOW';

  return {
    projectId: input.projectId, week: input.week, score, band,
    explanation: explain({
      outcome: `Forecast confidence = ${band}`,
      ...(score !== null ? { outcomeDetail: `score ${score} (MET-DQ-007)` } : {}),
      evaluatedAt: input.assessedAt,
      ruleSetVersion: input.ruleVersion,
      metricCatalogVersion: input.metricCatalogVersion,
      evaluations: parts.map((p): RuleEvaluation => {
        const s = scored.find((x) => x.id === p.id);
        return {
          ruleId: `FC-${p.id}`, ruleName: p.id, ruleSetId: 'DQ-v1', ruleVersion: input.ruleVersion,
          signalId: p.id, signalMetricId: p.metricId,
          observedValue: p.raw, comparison: 'IN_BAND',
          thresholdValue: `green ${p.edges[0]} / red ${p.edges[1]}`,
          ...(p.raw === null ? { notEvaluatedReason: 'component not available' } : {}),
          status: (p.raw !== null) ? 'FIRED' : 'CLEAR',
          fired: p.raw !== null,
          contribution: s === undefined ? 'excluded' : `${p.weight} × ${s.score}`,
          narrative: p.raw === null
            ? `${p.id} was not available and is excluded from the composite rather than scored zero.`
            : `${p.id} = ${p.raw}, normalised to ${s?.score} against green ${p.edges[0]} / red ${p.edges[1]}.`,
          evidence: input.evidence,
        };
      }),
    }),
  };
}

/** One named condition affecting how believable this project's own forecast is. */
export interface ReliabilityFactor {
  readonly id:
    | 'ETC_FRESHNESS' | 'ETC_COVERAGE' | 'SCOPE_STABILITY' | 'MILESTONE_ACCURACY'
    | 'CUSTOMER_DEPENDENCIES' | 'RESOURCE_STABILITY' | 'REQUIRED_FUTURE_PRODUCTIVITY';
  readonly metricId: string;
  readonly observed: Quantity | null;
  /** Green edge, red edge. Configuration, never a literal in a component. */
  readonly edges: readonly [Quantity, Quantity];
  readonly notMeasurableReason?: string;
  readonly evidence: readonly RecordRef[];
}

export interface ReliabilityFactorResult extends ReliabilityFactor {
  readonly band: ConfidenceBand | 'NOT_MEASURABLE';
  readonly narrative: string;
}

/**
 * MET-DQ-009 — the seven factors, banded individually and returned as a profile.
 *
 * Deliberately returns no single number. Collapsing seven named conditions into one score tells an
 * executive that reliability is low without telling them which condition to fix, and the whole
 * argument for this product is that a number without a named cause does not change any decision.
 */
export function forecastReliabilityProfile(
  factors: readonly ReliabilityFactor[],
): readonly ReliabilityFactorResult[] {
  return factors.map((f) => {
    if (f.observed === null) {
      return {
        ...f, band: 'NOT_MEASURABLE' as const,
        narrative:
          `${f.id} could not be measured` +
          `${f.notMeasurableReason !== undefined ? `: ${f.notMeasurableReason}` : ''}. ` +
          'Reported as unmeasurable rather than as a passing score.',
      };
    }
    const s = normalise(f.observed, f.edges[0], f.edges[1]);
    const band: ConfidenceBand =
      qCompare(s, qty('0.7')) >= 0 ? 'HIGH' : qCompare(s, qty('0.4')) >= 0 ? 'MEDIUM' : 'LOW';
    return {
      ...f, band,
      narrative:
        `${f.id} = ${f.observed} (${f.metricId}), normalised to ${s} against green ${f.edges[0]} / ` +
        `red ${f.edges[1]} → ${band}.`,
    };
  });
}
