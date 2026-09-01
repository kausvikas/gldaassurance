/**
 * MetricCalculationService — the one place a project's assessment is assembled.
 *
 * The engines are pure functions over inputs. Something has to decide the order they run in, carry
 * each one's output into the next, and stamp the whole thing with the rule and catalog versions in
 * force. That is orchestration, and orchestration belongs in the application layer, not inside a
 * bounded context: `health` may not call `forecast`, and `recovery` may not call `financial`
 * (ADR-0001 §4.1). This service is the ports-in seam ADR-0012 describes — every context is handed
 * what it needs and reaches for nothing.
 *
 * It computes; it does not authorise. Authorization is enforced at the use-case boundary before
 * this service is called, and the caller's authorised entity set is what determines which projects
 * are passed in at all (ADR-0005 §5). Filtering results after computing them would still have
 * computed them.
 */
import type { CurrencyCode, Quantity, Ratio } from '@platform/decimal';
import type { RuleVersion } from '@platform/provenance';
import type { Clock, WeekId } from '@platform/time';
import {
  type EconomicsInput, type EconomicsResult, computeEconomics, ratioValue,
} from '@contexts/financial';
import {
  type HealthEvaluation, type HealthEvaluationInput, evaluateHealth,
} from '@contexts/health';
import {
  type DataConfidenceAssessment, type DataConfidenceInput,
  type ForecastConfidenceAssessment, type ForecastConfidenceInput,
  assessDataConfidence, assessForecastConfidence,
} from '@contexts/data-quality';
import {
  type GreenAtRiskFinding, type GreenAtRiskInput,
  type TrajectoryEvaluation, type TrajectoryEvaluationInput,
  assessGreenAtRisk, evaluateTrajectory,
} from '@contexts/forecast';
import {
  type RecoveryEconomics, type RecoveryEconomicsInput, computeRecoveryEconomics,
} from '@contexts/recovery';

/**
 * Everything one project's assessment needs, gathered by the caller.
 *
 * Assembled rather than fetched on purpose: a service that reaches into six contexts to collect its
 * own inputs is a service that quietly re-introduces the dependencies the architecture forbids.
 */
export interface ProjectAssessmentRequest {
  readonly projectId: string;
  readonly week: WeekId;
  readonly currency: CurrencyCode;
  readonly ruleVersion: RuleVersion;
  readonly metricCatalogVersion: string;
  readonly economics: EconomicsInput;
  /** Built from the economics result by the caller — the health engine reads signals, not money. */
  readonly health: (economics: EconomicsResult) => HealthEvaluationInput;
  readonly dataConfidence: DataConfidenceInput;
  readonly forecastConfidence: ForecastConfidenceInput;
  readonly forecastConfidenceBands: { readonly high: Quantity; readonly medium: Quantity };
  /**
   * Built from the health result by the caller.
   *
   * A function, not a value, because `TrajectoryEvaluationInput.currentBand` is the band the
   * projection starts from — and that band is `MET-HLTH-011`, which is not known until health has
   * run. Supplying it as a literal is how a forward outlook comes to be projected from a constant
   * instead of from the project's actual position (fixed in Phase 8).
   */
  readonly trajectory: (health: HealthEvaluation) => TrajectoryEvaluationInput;
  /** Reasons and exposure, built by the caller from the economics and trajectory results. */
  readonly greenAtRisk: (
    economics: EconomicsResult,
    trajectory: TrajectoryEvaluation,
    health: HealthEvaluation,
    dataConfidence: DataConfidenceAssessment,
  ) => GreenAtRiskInput;
  /** Absent when the project has no recovery plan — which is a fact, not a failure. */
  readonly recovery?: (
    economics: EconomicsResult, forecastGm: Ratio, riskAdjustedGm: Ratio,
  ) => RecoveryEconomicsInput;
}

export interface ProjectAssessment {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: string;
  readonly ruleVersion: RuleVersion;
  readonly metricCatalogVersion: string;
  readonly economics: EconomicsResult;
  readonly health: HealthEvaluation;
  readonly dataConfidence: DataConfidenceAssessment;
  readonly forecastConfidence: ForecastConfidenceAssessment;
  readonly trajectory: TrajectoryEvaluation;
  readonly greenAtRisk: GreenAtRiskFinding;
  readonly recovery: RecoveryEconomics | null;
  /**
   * MET-DQ-006. A **tuple**, never a product: an unreliable Green and a confident Amber must not be
   * able to collapse to the same number (`PRODUCT_SPEC.md` §3.4). Any code that multiplies these two
   * fields together is a defect.
   */
  readonly confidenceQualifiedHealth: {
    readonly compositeScore: Quantity | null;
    readonly systemAssessedRag: HealthEvaluation['systemAssessedRag'];
    readonly dataConfidenceBand: DataConfidenceAssessment['band'];
  };
}

/**
 * Runs the engines in dependency order and returns one assessment.
 *
 * Order matters and is not arbitrary: economics before health because health reads margin signals;
 * health before trajectory because the forward projection starts from the band health assessed;
 * trajectory before Green-at-Risk because the finding is a statement about the trajectory; data
 * confidence before Green-at-Risk so the finding can carry its own reliability instead of being
 * silently trusted; recovery last, because a recovery case is measured against the forecast the
 * earlier steps established.
 */
export function assessProject(
  request: ProjectAssessmentRequest,
  clock: Clock,
): ProjectAssessment {
  const economics = computeEconomics(request.economics);
  const health = evaluateHealth(request.health(economics));
  const dataConfidence = assessDataConfidence(request.dataConfidence);
  const forecastConfidence = assessForecastConfidence(
    request.forecastConfidence,
    request.forecastConfidenceBands.high,
    request.forecastConfidenceBands.medium,
  );
  const trajectory = evaluateTrajectory(request.trajectory(health));
  const greenAtRisk = assessGreenAtRisk(
    request.greenAtRisk(economics, trajectory, health, dataConfidence),
  );
  const recovery = request.recovery === undefined
    ? null
    : computeRecoveryEconomics(
        request.recovery(economics, economics.forecastGmPercent, economics.riskAdjustedGmPercent),
      );

  return {
    projectId: request.projectId,
    week: request.week,
    assessedAt: clock.now(),
    ruleVersion: request.ruleVersion,
    metricCatalogVersion: request.metricCatalogVersion,
    economics, health, dataConfidence, forecastConfidence, trajectory, greenAtRisk, recovery,
    confidenceQualifiedHealth: {
      compositeScore: health.compositeScore,
      systemAssessedRag: health.systemAssessedRag,
      dataConfidenceBand: dataConfidence.band,
    },
  };
}

/** Re-exported so a caller can read a `Ratio` without importing `financial` directly. */
export { ratioValue };
