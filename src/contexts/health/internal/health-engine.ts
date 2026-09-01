/**
 * HealthAssessmentEngine.
 *
 * Produces a System-Assessed RAG from evidence, keeps it strictly separate from what the delivery
 * team reported and from any authorised override, and explains every step.
 *
 * Three design points worth stating, because each is a decision rather than an implementation
 * detail:
 *
 * 1. **The composite score is not the executive output.** The Phase 4 brief is explicit, and it is
 *    right: a weighted average of four dimensions is a ranking device, not a verdict. The verdict is
 *    the RAG, and the dimension breakdown sits beneath it. The composite is returned because the
 *    ranking needs it, not because a screen should lead with it.
 *
 * 2. **Hard overrides bypass the composite entirely.** A project can be losing money on every unit
 *    it delivers and still average to Amber because three of four dimensions are fine. The override
 *    rules exist so that cannot happen, and they are evaluated *before* banding.
 *
 * 3. **Every rule that was considered is reported**, including the ones that did not fire and the
 *    ones that could not be evaluated because a threshold is still undecided. Reporting only
 *    firings makes "we checked and it was fine" indistinguishable from "we never looked".
 */
import {
  type Quantity, Q_ZERO, isComputable, qAdd, qDiv, qFixed, qMul, qty,
  ratioToQuantity, type Ratio,
} from '@platform/decimal';
import {
  type Explanation, type NotEvaluatedReasonCode, type RuleEvaluation, type SignalState, explain,
} from '@platform/explainability';
import { type RecordRef, type RuleVersion, derived, inferred } from '@platform/provenance';
import type { Instant, WeekId } from '@platform/time';
import {
  BAND_THRESHOLDS, ELEVATION_RULES, HARD_OVERRIDE_RULES,
  type HealthModel, type SignalReading, evaluateRules, normaliseToScore,
  type RuleApplicabilityContext,
  signalStateOf,
} from '@contexts/rules';
import { qCompare } from '@platform/decimal';

/** Mirrors the canonical `Rag` on the context surface; kept local so the engine has no cycle. */
export type Rag = 'RED' | 'AMBER' | 'GREEN';

const RAG_ORDER: Readonly<Record<Rag, number>> = { RED: 0, AMBER: 1, GREEN: 2 };

export interface DimensionScore {
  readonly dimensionId: string;
  readonly name: string;
  readonly metricId: string;
  readonly weight: string;
  /** 0–100 as a decimal string, or null when too many inputs are not computable. */
  readonly score: Quantity | null;
  /** Points this dimension contributed to the composite. */
  readonly contribution: Quantity | null;
  readonly inputs: readonly {
    readonly metricId: string;
    readonly signalId: string;
    readonly observed: string | null;
    readonly normalised: Quantity | null;
    /**
     * The epistemic state of this input (ADR-0028 D-1). **Always present.**
     *
     * `observed: null` alone cannot distinguish an absent risk object from absent evidence from an
     * observed adverse state with no finite value — and a consumer that guessed chose the
     * optimistic reading.
     */
    readonly state: SignalState;
    /** Machine-readable cause, for any state other than OBSERVED/KNOWN_ZERO. */
    readonly reasonCode?: NotEvaluatedReasonCode;
    /** The domain engine's own words, preserved rather than genericised (ADR-0027 D-7). */
    readonly reason?: string;
    readonly weight: string;
    readonly greenEdge: string;
    readonly redEdge: string;
    readonly higherIsBetter: boolean;
    readonly materiality?: 'MATERIAL' | 'SUPPORTING';
  }[];
  readonly notComputableReason?: string;
}

export interface HealthEvaluationInput {
  /** Governed applicability facts (ADR-0026 D-2). Omitted means applicability is not assessed. */
  readonly applicability?: RuleApplicabilityContext;
  /** Signal ids some builder claims to produce; absence makes a rule a CONFIGURATION_ERROR. */
  readonly declaredSignals?: ReadonlySet<string>;
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  readonly model: HealthModel;
  readonly metricCatalogVersion: string;
  /** Signal readings keyed by `signalId`, supplied by the application layer. */
  readonly readings: ReadonlyMap<string, SignalReading>;
  /** MET-HLTH-012 — the delivery team's declaration. L1_OBSERVED, never overwritten. */
  readonly reportedRag: Rag | null;
  /** An authorised, in-date override, if one applies (REQ-HLTH-007). */
  readonly override?: {
    readonly rag: Rag; readonly reason: string; readonly actorId: string;
    readonly appliedAt: Instant; readonly expiresAt: Instant;
  };
  readonly evidence: readonly RecordRef[];
}

/** How completely the governed rule set could be applied to one project (ADR-0025 D-1). */
export interface RuleCoverage {
  /** Total Red-forcing rules the model declares. */
  readonly overridesDeclared: number;
  /** Declared less not-applicable. **This is the denominator for completeness.** */
  readonly overridesApplicable: number;
  /** Rules that cannot arise on this project. Not a gap, and not evidence of anything. */
  readonly overridesNotApplicable: number;
  /** Applicable rules that ran and fired. */
  readonly overridesFired: number;
  /** Applicable rules that ran and did not fire. */
  readonly overridesClear: number;
  /**
   * Applicable rules whose required evidence was unavailable. **A real gap** -- never equivalent
   * to "clear", and distinct from a rule that does not apply.
   */
  readonly overridesNotComputable: number;
  /** Which rules do not apply, and why -- structured, so no consumer parses prose. */
  readonly notApplicableCriticalControls: readonly {
    readonly ruleId: string;
    readonly reasonCode: NotEvaluatedReasonCode;
    readonly reason: string;
  }[];
  /** Which applicable rules could not run, why, and what evidence they needed. */
  readonly unevaluatedApplicableCriticalControls: readonly {
    readonly ruleId: string;
    readonly reasonCode: NotEvaluatedReasonCode;
    readonly reason: string;
    readonly requiredEvidence: readonly string[];
    readonly missingEvidence: readonly string[];
  }[];
  /**
   * Rules whose signal has no builder at all -- a **system control defect, not a project finding**.
   * The static gate makes this unlikely; the runtime contract still represents it, because a
   * hardcoded empty list is how the previous version hid exactly this case (ADR-0026 D-5).
   */
  readonly configurationErrorCriticalControls: readonly string[];
  /** `true` when every **applicable** Red-forcing control was evaluated. */
  readonly allApplicableCriticalControlsEvaluated: boolean;
}

export interface HealthEvaluation {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  readonly healthModelVersion: RuleVersion;
  /** The composite. Present for ranking; **not** the executive headline. */
  readonly compositeScore: Quantity | null;
  readonly dimensions: readonly DimensionScore[];
  /** MET-HLTH-012 — what was declared. */
  readonly reportedRag: Rag | null;
  /** MET-HLTH-011 — what the evidence supports. */
  readonly systemAssessedRag: Rag;
  /** MET-HLTH-013 — the accountable position. */
  readonly effectiveRag: Rag;
  readonly overrideApplied: boolean;
  /** MET-HLTH-030 — positive means reported healthier than the evidence. */
  readonly statusDivergence: number | null;
  readonly statusConflict: StatusConflict | null;
  /** Which hard overrides forced the outcome, if any. */
  readonly firedOverrides: readonly string[];
  /**
   * Whether every Red-forcing control could actually be run on this project (ADR-0025 D-5).
   *
   * **`firedOverrides.length === 0` is not the same claim as "all overrides were checked and
   * cleared."** A rule whose signal is not computable is neither fired nor clear, and before this
   * existed the two were indistinguishable to every consumer. `OVR-LD-EXPOSURE` was declared but
   * never assembled, so it read as clear on all 75 projects while a live $180K liquidated-damages
   * exposure sat on one of them.
   *
   * **This does not change the band.** Absence of evidence is not evidence of failure: an AMBER
   * whose plan-credibility override could not be evaluated stays AMBER, and the incompleteness is
   * reported beside the band rather than folded into it.
   */
  readonly ruleCoverage: RuleCoverage;
  /**
   * The band the weighted composite alone would have produced, before any override.
   *
   * `null` where the composite is not computable. **A surface must not present the final band as
   * the model's verdict when an override produced it** — these two fields exist so it cannot.
   */
  readonly compositeBand: Rag | null;
  /** `true` when a hard override changed the outcome the composite would have given. */
  readonly overrideChangedBand: boolean;
  /**
   * Whether the composite covers the whole model. **Check this before treating the band as
   * authoritative** — a `PROVISIONAL` band is a real assessment of part of the model, not of all
   * of it.
   */
  readonly assessmentStatus: AssessmentStatus;
  /**
   * MATERIAL inputs that were absent, so a reader can see *why* an assessment is provisional even
   * though every dimension scored (ADR-0027 D-6).
   */
  readonly missingMaterialInputs: readonly string[];
  /** Share of the model's declared weight that could actually be scored, as a decimal string. */
  readonly dimensionCoverage: Quantity | null;
  /** Sum of the weights of the dimensions that scored. */
  readonly availableWeight: Quantity;
  /** Sum of the weights the model declares, whether or not they scored. */
  readonly declaredWeight: Quantity;
  /** Every declared dimension that could not be scored, with the reason. */
  readonly missingDimensions: readonly MissingDimension[];
  readonly explanation: Explanation;
}

/**
 * Whether the assessment rests on the whole model or only part of it.
 *
 * `PROVISIONAL` is not a hedge — it is a statement that the composite was computed over a reduced
 * denominator, and it names which dimensions were absent. A consumer that needs an authoritative
 * overall band must check this rather than assume `compositeScore !== null` means complete.
 */
export type AssessmentStatus = 'COMPLETE' | 'PROVISIONAL' | 'NOT_COMPUTABLE';

/** A dimension the model declares but the evidence could not score. */
export interface MissingDimension {
  readonly dimensionId: string;
  readonly name: string;
  readonly weight: string;
  readonly reason: string;
}

/** A disagreement between what was declared and what the evidence supports. */
export interface StatusConflict {
  readonly reportedRag: Rag;
  readonly systemAssessedRag: Rag;
  /** Signed band distance. Positive = reported healthier than the evidence. */
  readonly divergence: number;
  readonly direction: 'REPORTED_OPTIMISTIC' | 'REPORTED_PESSIMISTIC';
  readonly narrative: string;
  /** The rule firings the reporter's declaration does not account for. */
  readonly unexplainedBy: readonly string[];
}

function scoreDimension(
  dim: HealthModel['dimensions'][number],
  readings: ReadonlyMap<string, SignalReading>,
): DimensionScore {
  const inputs = dim.inputs.map((x) => {
    const r = readings.get(x.signalId);
    /*
     * An UNBOUNDED observation scores at the worst end and STAYS IN THE DENOMINATOR (ADR-0027 D-5).
     *
     * Dropping it renormalised the remaining inputs upward, so the absence of the worst fact
     * *raised* the dimension: a project stalled at zero velocity scored Delivery 100.00. This is
     * not a null penalty — NOT_COMPUTABLE and NOT_APPLICABLE keep their existing treatment, and only
     * this explicitly governed observed adverse state scores adversely.
     */
    const state = signalStateOf(r);
    const observed = state === 'UNBOUNDED' ? 'UNBOUNDED' : r?.value ?? null;
    /*
     * State decides, not nullness (ADR-0028 D-2).
     *
     * OBSERVED / KNOWN_ZERO score normally. UNBOUNDED scores at the red edge and stays in the
     * denominator. NOT_APPLICABLE and NOT_COMPUTABLE both leave the denominator — the score is
     * NOT penalised for missingness — but only NOT_APPLICABLE is free: NOT_COMPUTABLE and
     * CONFIGURATION_ERROR cost the assessment its COMPLETE claim below.
     */
    const normalised = state === 'UNBOUNDED'
      ? Q_ZERO
      : (state === 'OBSERVED' || state === 'KNOWN_ZERO') && r?.value != null
        ? normaliseToScore(qty(r.value), qty(x.greenEdge), qty(x.redEdge), x.higherIsBetter)
        : null;
    return {
      metricId: x.metricId, signalId: x.signalId, observed, normalised, state,
      ...(r?.stateReasonCode !== undefined ? { reasonCode: r.stateReasonCode } : {}),
      ...(r?.notComputableReason !== undefined ? { reason: r.notComputableReason } : {}),
      weight: x.weight, greenEdge: x.greenEdge, redEdge: x.redEdge, higherIsBetter: x.higherIsBetter,
      ...(x.materiality !== undefined ? { materiality: x.materiality } : {}),
    };
  });

  const usable = inputs.filter((x) => x.normalised !== null);

  // The computability contract (ADR-0022 D-4), in two parts.
  //
  // 1. A **required** signal is one the dimension has no meaning without. Its absence stops the
  //    dimension whatever the arithmetic says — otherwise Product & Quality could score confidently
  //    on defect counts while rework, the signal that ties quality to margin, was never supplied.
  const missingRequired = dim.inputs
    .filter((x) => x.required === true)
    .filter((x) => inputs.find((y) => y.signalId === x.signalId)?.normalised == null)
    .map((x) => `${x.signalId} (${x.metricId})`);
  if (missingRequired.length > 0) {
    return {
      dimensionId: dim.id, name: dim.name, metricId: dim.metricId,
      weight: dim.weight === 'UNSET' ? '0' : dim.weight,
      score: null, contribution: null, inputs,
      notComputableReason:
        `required signal${missingRequired.length > 1 ? 's' : ''} not supplied: ` +
        `${missingRequired.join(', ')}. A dimension without the measure it is about is not a ` +
        'partial score, it is a different metric.',
    };
  }

  // 2. A dimension carried by less than half its inputs is not a dimension score, it is a guess.
  if (usable.length === 0 || usable.length * 2 < inputs.length) {
    return {
      dimensionId: dim.id, name: dim.name, metricId: dim.metricId,
      weight: dim.weight === 'UNSET' ? '0' : dim.weight,
      score: null, contribution: null, inputs,
      notComputableReason:
        `only ${usable.length} of ${inputs.length} contributing metrics are computable; ` +
        `a dimension carried by fewer than half its inputs is not reported`,
    };
  }

  const totalWeight = usable.reduce((a, x) => qAdd(a, qty(x.weight)), Q_ZERO);
  const weighted = usable.reduce(
    (a, x) => qAdd(a, qMul(x.normalised as Quantity, qty(x.weight))), Q_ZERO,
  );
  const score = qDiv(weighted, totalWeight);
  const weight = dim.weight === 'UNSET' ? '0' : dim.weight;
  if (score === null) {
    return {
      dimensionId: dim.id, name: dim.name, metricId: dim.metricId, weight,
      score: null, contribution: null, inputs,
      notComputableReason: 'contributing input weights sum to zero',
    };
  }
  return {
    dimensionId: dim.id, name: dim.name, metricId: dim.metricId, weight,
    score: qty(qFixed(score, 2)),
    contribution: qty(qFixed(qMul(score, qty(weight)), 2)),
    inputs,
  };
}

export function evaluateHealth(input: HealthEvaluationInput): HealthEvaluation {
  const { model } = input;

  // --- dimensions -----------------------------------------------------------
  const dimensions = model.dimensions.map((d) => scoreDimension(d, input.readings));
  const scored = dimensions.filter((d) => d.score !== null);

  /*
   * Coverage, declared rather than implied (ADR-0022 D-4).
   *
   * The composite is a weighted mean **over the dimensions that could be scored**, which means the
   * denominator shrinks when one is missing. That is the right arithmetic — scoring a missing
   * dimension as zero would treat absent evidence as catastrophic performance, and missing evidence
   * is not adverse evidence. But it is also a **redistribution of influence**: with Scope &
   * Commercial and Product & Quality absent, Financial's declared 0.40 becomes an effective 0.615.
   *
   * Before Phase 8 closure that redistribution happened silently, and the composite for a project
   * with only Financial scored was *literally the Financial score*. It is now reported: the model's
   * declared weight, the weight actually available, the missing dimensions by name, and a status
   * that says whether this is a complete assessment or a provisional one. Consumers that must not
   * treat a provisional score as authoritative can now tell the difference.
   *
   * The weights themselves are untouched — 0.40 / 0.25 / 0.20 / 0.15 — and nothing here renormalises
   * them into the model. The renormalisation is confined to this expression and is now named.
   */
  const declaredWeight = model.dimensions.reduce(
    (a, d) => qAdd(a, qty(d.weight === 'UNSET' ? '0' : d.weight)), Q_ZERO,
  );
  const availableWeight = scored.reduce((a, d) => qAdd(a, qty(d.weight)), Q_ZERO);
  const missingDimensions = dimensions
    .filter((d) => d.score === null)
    .map((d) => ({
      dimensionId: d.dimensionId,
      name: d.name,
      weight: d.weight,
      reason: d.notComputableReason ?? 'no reason recorded',
    }));
  const coverageRatio = qDiv(availableWeight, declaredWeight);

  const compositeScore = scored.length === 0 || model.blockedBy !== undefined
    ? null
    : (() => {
        const weighted = scored.reduce(
          (a, d) => qAdd(a, qMul(d.score as Quantity, qty(d.weight))), Q_ZERO,
        );
        const c = qDiv(weighted, availableWeight);
        return c === null ? null : qty(qFixed(c, 2));
      })();

  /*
   * Completeness is not the same question as computability (ADR-0027 D-6).
   *
   * A dimension can produce a number while a MATERIAL input it needed is absent. Answering
   * "is the assessment complete?" with "did every dimension score?" is what let a project whose only
   * plan-credibility signal had vanished report COMPLETE.
   */
  /*
   * What costs the assessment its COMPLETE claim (ADR-0028 D-2).
   *
   * NOT_APPLICABLE is free — the risk object does not exist, so nothing is unknown. OBSERVED,
   * KNOWN_ZERO and UNBOUNDED are all present observations. Only NOT_COMPUTABLE and
   * CONFIGURATION_ERROR represent evidence that could have existed and does not.
   *
   * This replaces the earlier `value === null` test, which could not tell "no open dependencies"
   * from "dependency evidence unavailable" and therefore marked 64 of 75 projects provisional.
   */
  const costsCompleteness = (signalId: string): boolean => {
    const st = signalStateOf(input.readings.get(signalId));
    return st === 'NOT_COMPUTABLE' || st === 'CONFIGURATION_ERROR';
  };

  // EVERY input whose evidence could have existed and does not, not only MATERIAL ones. The
  // MATERIAL flag remains the stronger signal and is reported separately.
  const materialAbsent = model.dimensions.flatMap((d) => d.inputs
    .filter((x) => costsCompleteness(x.signalId))
    .map((x) => ({ signalId: x.signalId, label: `${x.signalId} (${x.metricId}, ${d.name})` })));

  /*
   * Completeness keys on MATERIAL inputs only — deliberately, and after measuring the alternative.
   *
   * Dropping ANY single non-required input renormalises its dimension upward by **15 to 30 points**
   * and takes the composite to 100.00 (DR-069 records the full table). Making every absent input
   * cost completeness was implemented and measured: it marks **64 of 75** projects PROVISIONAL,
   * and 61 of those only because `DEPENDENCY_AGEING_DAYS` is absent on a project with **no open
   * dependencies** — a known-good state, not unknown evidence.
   *
   * Trading "unknown reported as complete" for "known-good reported as provisional" is not a fix.
   * The real repair is to classify each input's absence as structural / evidence / risk-trigger
   * (DR-069), which is a per-metric business decision and is governed rather than guessed here.
   */



  // --- rules ----------------------------------------------------------------
  // Hard overrides first: they decide the outcome regardless of the composite.
  const overrideEvaluations = evaluateRules(
    HARD_OVERRIDE_RULES, input.readings, input.applicability, input.declaredSignals,
  );
  const elevationEvaluations = evaluateRules(
    ELEVATION_RULES, input.readings, input.applicability, input.declaredSignals,
  );
  /*
   * A MATERIAL input that is absent because the rule consuming it does NOT APPLY is not an
   * assessment gap (ADR-0026, reused here rather than re-decided).
   *
   * `prj-005` is five weeks into delivery: `MET-DEL-018` cannot exist yet, `OVR-NO-CREDIBLE-PLAN`
   * is NOT_APPLICABLE, and calling that assessment "provisional" would report a gap the previous
   * remediation already established is not one. Absence with no such ruling IS a gap.
   */
  const inapplicableSignals = new Set(
    [...overrideEvaluations, ...elevationEvaluations]
      .filter((e) => e.status === 'NOT_APPLICABLE')
      .map((e) => e.signalId),
  );
  const missingMaterialInputs = materialAbsent
    .filter((x) => !inapplicableSignals.has(x.signalId))
    .map((x) => x.label);

  const firedOverrides = overrideEvaluations.filter((e) => e.status === 'FIRED').map((e) => e.ruleId);
  const assessmentStatus: AssessmentStatus = compositeScore === null
    ? 'NOT_COMPUTABLE'
    : missingDimensions.length === 0 && missingMaterialInputs.length === 0
      ? 'COMPLETE'
      : 'PROVISIONAL';

  const notApplicable = overrideEvaluations.filter((e) => e.status === 'NOT_APPLICABLE');
  const notComputable = overrideEvaluations.filter((e) => e.status === 'NOT_COMPUTABLE');
  const configErrors = overrideEvaluations.filter((e) => e.status === 'CONFIGURATION_ERROR');
  const applicable = overrideEvaluations.length - notApplicable.length;
  const ruleCoverage: RuleCoverage = {
    overridesDeclared: overrideEvaluations.length,
    // NOT_APPLICABLE leaves the denominator: counting a rule that cannot arise here as an
    // unevaluated control asserts a gap that does not exist (ADR-0026 D-4).
    overridesApplicable: applicable,
    overridesNotApplicable: notApplicable.length,
    overridesFired: firedOverrides.length,
    overridesClear: overrideEvaluations.filter((e) => e.status === 'CLEAR').length,
    overridesNotComputable: notComputable.length,
    notApplicableCriticalControls: notApplicable.map((e) => ({
      ruleId: e.ruleId,
      reasonCode: e.notEvaluatedReasonCode ?? 'LIFECYCLE_NOT_APPLICABLE',
      reason: e.notEvaluatedReason ?? 'not applicable',
    })),
    unevaluatedApplicableCriticalControls: notComputable.map((e) => ({
      ruleId: e.ruleId,
      reasonCode: e.notEvaluatedReasonCode ?? 'REQUIRED_METRIC_NOT_COMPUTABLE',
      reason: e.notEvaluatedReason ?? 'not computable',
      requiredEvidence: e.requiredEvidence ?? [],
      missingEvidence: e.missingEvidence ?? [],
    })),
    configurationErrorCriticalControls: configErrors.map((e) => e.ruleId),
    // True when every rule that *applies* was evaluated. A not-applicable rule does not count
    // against completeness, and a configuration error is a control defect, not a project gap.
    allApplicableCriticalControlsEvaluated:
      notComputable.length === 0 && configErrors.length === 0,
  };
  const firedElevations = elevationEvaluations.filter((e) => e.fired).map((e) => e.ruleId);

  // --- band -----------------------------------------------------------------
  /*
   * The composite's own verdict, computed **before** any override is considered.
   *
   * A hard override forces RED as a matter of policy. The weighted model may have said AMBER, and a
   * surface that renders only the final band tells an executive the model produced Red when a rule
   * did. Those are different claims: one is "the evidence, weighted, puts this project in the Red
   * band"; the other is "one condition is severe enough that we do not let the average absorb it".
   *
   * Both are now reported, so the reader can see which mechanism produced the answer in front of
   * them, and challenge the right one.
   */
  const compositeBand: Rag | null = compositeScore === null
    ? null
    : qCompare(compositeScore, qty(BAND_THRESHOLDS.greenFloor)) >= 0 ? 'GREEN'
      : qCompare(compositeScore, qty(BAND_THRESHOLDS.amberFloor)) >= 0 ? 'AMBER' : 'RED';

  let systemAssessedRag: Rag;
  let bandNarrative: string;
  if (firedOverrides.length > 0) {
    systemAssessedRag = 'RED';
    bandNarrative =
      `Red is forced by ${firedOverrides.length} hard override${firedOverrides.length > 1 ? 's' : ''} ` +
      `(${firedOverrides.join(', ')}), regardless of the composite score. An override exists precisely ` +
      `because a weighted average can absorb a catastrophe in one dimension. ` +
      `The weighted composite alone would have banded this project ` +
      `${compositeBand ?? 'NOT COMPUTABLE'} — the Red above is a policy decision, not the ` +
      `model's arithmetic.`;
  } else if (compositeScore === null) {
    systemAssessedRag = 'AMBER';
    bandNarrative =
      'The composite could not be computed, so no band could be derived from it. Amber is reported ' +
      'rather than Green: an unassessable project is not a healthy one.';
  } else {
    const green = qty(BAND_THRESHOLDS.greenFloor);
    const amber = qty(BAND_THRESHOLDS.amberFloor);
    systemAssessedRag = qCompare(compositeScore, green) >= 0 ? 'GREEN'
      : qCompare(compositeScore, amber) >= 0 ? 'AMBER' : 'RED';
    bandNarrative =
      `Composite ${compositeScore} banded against the HEALTH-v2 thresholds ` +
      `(Green ≥ ${green}, Amber ≥ ${amber}).`;
    if (systemAssessedRag === 'GREEN' && firedElevations.length > 0) {
      systemAssessedRag = 'AMBER';
      bandNarrative +=
        ` Elevated to Amber by ${firedElevations.join(', ')}: the composite is in the Green band but a ` +
        `warning condition is live.`;
    }
  }

  const bandEvaluation: RuleEvaluation = {
    ruleId: 'BAND-COMPOSITE', ruleName: 'Composite banding', ruleSetId: BAND_THRESHOLDS.ruleSetId,
    ruleVersion: BAND_THRESHOLDS.ruleVersion, signalId: 'COMPOSITE_HEALTH_SCORE',
    signalMetricId: model.compositeMetricId,
    observedValue: compositeScore,
    // `IN_BAND`, not `GTE`. Rendering a band decision as "66.40 ≥ 70" prints a false statement
    // next to a rule that did fire, which is worse than printing nothing: the one artifact an
    // executive is meant to be able to check would be lying to them.
    comparison: 'IN_BAND',
    thresholdValue: `Green ≥ ${BAND_THRESHOLDS.greenFloor}, Amber ≥ ${BAND_THRESHOLDS.amberFloor}`,
    status: (systemAssessedRag !== 'GREEN') ? 'FIRED' : 'CLEAR',
    fired: systemAssessedRag !== 'GREEN',
    contribution: `System-Assessed RAG = ${systemAssessedRag}`,
    narrative: bandNarrative,
    evidence: input.evidence,
  };

  // --- the three RAG values, kept separate -----------------------------------
  // MET-HLTH-012 reported, MET-HLTH-011 system-assessed, and the override are three different
  // claims by three different authorities. Reported RAG is never overwritten.
  const overrideInDate = input.override !== undefined
    && input.override.appliedAt <= input.assessedAt
    && input.override.expiresAt > input.assessedAt;
  const effectiveRag = overrideInDate ? (input.override as { rag: Rag }).rag : systemAssessedRag;

  const statusDivergence = input.reportedRag === null
    ? null
    : RAG_ORDER[input.reportedRag] - RAG_ORDER[systemAssessedRag];

  const statusConflict: StatusConflict | null =
    input.reportedRag === null || statusDivergence === null || statusDivergence === 0
      ? null
      : {
          reportedRag: input.reportedRag,
          systemAssessedRag,
          divergence: statusDivergence,
          direction: statusDivergence > 0 ? 'REPORTED_OPTIMISTIC' : 'REPORTED_PESSIMISTIC',
          narrative: statusDivergence > 0
            ? `Reported ${input.reportedRag} while the evidence supports ${systemAssessedRag}. ` +
              `Nobody is necessarily wrong — the reporting may simply not have caught up with the ` +
              `arithmetic — but the gap is the finding, and it is worth more than either value alone.`
            : `Reported ${input.reportedRag} while the evidence supports ${systemAssessedRag}. The team ` +
              `is reporting more conservatively than the evidence requires, which is worth understanding ` +
              `before it is corrected.`,
          unexplainedBy: [...firedOverrides, ...firedElevations],
        };

  const overrideEvaluation: RuleEvaluation = {
    ruleId: 'RAG-OVERRIDE', ruleName: 'Authorised manual override',
    ruleSetId: BAND_THRESHOLDS.ruleSetId, ruleVersion: BAND_THRESHOLDS.ruleVersion,
    signalId: 'MANUAL_OVERRIDE', signalMetricId: 'MET-HLTH-013',
    observedValue: input.override?.rag ?? null, comparison: 'PRESENT',
    status: (overrideInDate) ? 'FIRED' : 'CLEAR',
    fired: overrideInDate,
    contribution: overrideInDate ? `Effective RAG = ${effectiveRag} (override)` : 'none — no in-date override',
    narrative: overrideInDate
      ? `An authorised override by ${input.override?.actorId} holds this at ` +
        `${input.override?.rag} until ${input.override?.expiresAt}: "${input.override?.reason}". ` +
        `The system assessment of ${systemAssessedRag} is unchanged and remains visible beneath it.`
      : 'No in-date authorised override. The effective status is the system assessment.',
    evidence: overrideInDate
      ? [{ context: 'health', entityType: 'RagOverride', entityId: input.projectId }]
      : input.evidence,
  };

  const explanation = explain({
    outcome: `System-Assessed RAG = ${systemAssessedRag}`,
    ...(statusConflict !== null
      ? {
          outcomeDetail:
            `Reported ${statusConflict.reportedRag}; divergence ` +
            `${statusConflict.divergence > 0 ? '+' : ''}${statusConflict.divergence}`,
        }
      : {}),
    evaluatedAt: input.assessedAt,
    ruleSetVersion: BAND_THRESHOLDS.ruleVersion,
    metricCatalogVersion: input.metricCatalogVersion,
    healthModelVersion: model.version,
    evaluations: [...overrideEvaluations, ...elevationEvaluations, bandEvaluation, overrideEvaluation],
  });

  return {
    projectId: input.projectId, week: input.week, assessedAt: input.assessedAt,
    healthModelVersion: model.version,
    compositeScore, dimensions,
    reportedRag: input.reportedRag, systemAssessedRag, effectiveRag,
    overrideApplied: overrideInDate,
    statusDivergence, statusConflict, firedOverrides, ruleCoverage,
    compositeBand,
    overrideChangedBand: firedOverrides.length > 0 && compositeBand !== 'RED',
    assessmentStatus,
    dimensionCoverage: coverageRatio === null ? null : qty(qFixed(coverageRatio, 4)),
    availableWeight: qty(qFixed(availableWeight, 4)),
    declaredWeight: qty(qFixed(declaredWeight, 4)),
    missingDimensions,
    missingMaterialInputs,
    explanation,
  };
}

/** Wraps the assessment's headline values in provenance envelopes for the boundary crossing. */
export function toProvenance(a: HealthEvaluation, evidence: readonly RecordRef[]) {
  return {
    // MET-HLTH-020 — a mathematical output over observed facts.
    compositeScore: a.compositeScore === null ? null
      : derived(a.compositeScore, evidence, a.healthModelVersion, a.assessedAt),
    // MET-HLTH-011 — a verdict about project state (ADR-0014).
    systemAssessedRag: inferred(a.systemAssessedRag, evidence, a.assessedAt, a.healthModelVersion),
    effectiveRag: inferred(a.effectiveRag, evidence, a.assessedAt, a.healthModelVersion),
  };
}

/** Ratio → signal string for the rule engine, or `null` when NOT_COMPUTABLE. */
export function ratioToSignal(r: Ratio): string | null {
  return isComputable(r) ? ratioToQuantity(r) : null;
}
