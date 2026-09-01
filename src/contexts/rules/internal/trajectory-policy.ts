/**
 * Trajectory observation policies — versioned, and **specific to each signal**.
 *
 * Phase 3 correction, Correction 2. `trajectoryWindowWeeks = 8` was previously carried as though it
 * were the business definition of trajectory. It is not. Eight rolling weeks is a reasonable policy
 * for a signal that genuinely moves weekly, such as delivery velocity; it is the wrong observation
 * policy for a figure restated once a reporting period, for an event stream like milestone
 * outcomes, or for an exposure whose *age* matters as much as its trend.
 *
 * Using one window for all of them produces two specific failures:
 *   - a quarterly-restated figure sampled weekly looks flat for eleven weeks and then jumps, so a
 *     slope over eight weeks is usually zero and occasionally enormous;
 *   - an event signal like "did the last five milestones land" has no meaningful weekly slope at all.
 *
 * **This is the contract and the configuration seam only.** The Phase 4 TrajectoryEngine consumes
 * these policies; nothing here computes a trajectory.
 */
import type { CalendarDate } from '@platform/time';
import type { RuleVersion } from '@platform/provenance';

/**
 * How observations are drawn for a signal.
 *
 * | Type | Draws | Suits |
 * | --- | --- | --- |
 * | `ROLLING_WEEK` | The trailing N snapshot weeks | Signals that genuinely move weekly |
 * | `REPORTING_PERIOD` | The trailing N reporting periods | Figures restated on a reporting cadence |
 * | `LAST_N_EVENTS` | The last N occurrences, whenever they happened | Event streams with no weekly cadence |
 * | `CUMULATIVE_PLUS_RECENT` | Cumulative position plus the recent-window delta | Drawdowns, where level and rate both matter |
 * | `AGE_AND_TREND` | Age of open items plus the trend in that age | Exposures where ageing is itself the signal |
 */
export type TrajectoryWindowType =
  | 'ROLLING_WEEK'
  | 'REPORTING_PERIOD'
  | 'LAST_N_EVENTS'
  | 'CUMULATIVE_PLUS_RECENT'
  | 'AGE_AND_TREND';

/** Whether recent observations count for more than older ones, and how. */
export type RecencyWeighting = 'NONE' | 'LINEAR' | 'EXPONENTIAL';

export interface TrajectoryObservationPolicy {
  /** The signal this policy governs. Not a metric ID: several metrics may share a signal. */
  readonly signalId: string;
  readonly windowType: TrajectoryWindowType;
  /** Window length, in the unit implied by `windowType`. */
  readonly windowSize: number;
  /** Below this many observations the signal is `NOT_COMPUTABLE`, never approximated. */
  readonly minimumObservations: number;
  readonly recencyWeighting: RecencyWeighting;
  /** Which metrics this policy applies to. */
  readonly applicability: readonly string[];
  readonly effectiveFrom: CalendarDate;
  readonly version: RuleVersion;
  readonly rationale: string;
}

/**
 * `TRAJECTORY-v1` policies. Window sizes are **synthetic calibration candidates**, not approved
 * production policy — the same caveat that applies to every other value in this rule set.
 */
export const TRAJECTORY_OBSERVATION_POLICIES: readonly TrajectoryObservationPolicy[] = [
  {
    signalId: 'DELIVERY_VELOCITY',
    windowType: 'ROLLING_WEEK', windowSize: 8, minimumObservations: 6, recencyWeighting: 'NONE',
    applicability: ['MET-DEL-019', 'MET-DEL-013'],
    effectiveFrom: '2026-08-31' as CalendarDate, version: 'TRAJECTORY-v1' as RuleVersion,
    rationale: 'Progress is claimed weekly and moves weekly. Eight weeks is long enough to survive a quiet week and short enough to notice a change of pace.',
  },
  {
    signalId: 'FORECAST_GM_TREND',
    windowType: 'REPORTING_PERIOD', windowSize: 3, minimumObservations: 3, recencyWeighting: 'LINEAR',
    applicability: ['MET-FCST-004', 'MET-FCST-005'],
    effectiveFrom: '2026-08-31' as CalendarDate, version: 'TRAJECTORY-v1' as RuleVersion,
    rationale: 'Forecast margin is restated on the reporting cycle, not weekly. Sampling it weekly produces a flat line punctuated by steps, and a weekly slope over that is noise.',
  },
  {
    signalId: 'EAC_REVISION_TREND',
    windowType: 'REPORTING_PERIOD', windowSize: 3, minimumObservations: 2, recencyWeighting: 'LINEAR',
    applicability: ['MET-FIN-008', 'MET-DEL-014', 'MET-FIN-030'],
    effectiveFrom: '2026-08-31' as CalendarDate, version: 'TRAJECTORY-v1' as RuleVersion,
    rationale: 'An ETC revision is a discrete management act. What matters is the direction of successive revisions, not their weekly interpolation.',
  },
  {
    signalId: 'MILESTONE_HIT_RATE',
    windowType: 'LAST_N_EVENTS', windowSize: 5, minimumObservations: 3, recencyWeighting: 'NONE',
    applicability: ['MET-DEL-009', 'MET-DEL-010'],
    effectiveFrom: '2026-08-31' as CalendarDate, version: 'TRAJECTORY-v1' as RuleVersion,
    rationale: 'Milestones are events on their own irregular cadence. "Four of the last five slipped" is meaningful; a weekly slope over milestone dates is not.',
  },
  {
    signalId: 'SCOPE_EXPOSURE_TREND',
    windowType: 'REPORTING_PERIOD', windowSize: 3, minimumObservations: 2, recencyWeighting: 'LINEAR',
    applicability: ['MET-COM-008', 'MET-COM-009', 'MET-FIN-011'],
    effectiveFrom: '2026-08-31' as CalendarDate, version: 'TRAJECTORY-v1' as RuleVersion,
    rationale: 'Scope arrives in lumps and is assessed commercially on a period cadence.',
  },
  {
    signalId: 'QUALITY_REWORK_TREND',
    windowType: 'ROLLING_WEEK', windowSize: 6, minimumObservations: 4, recencyWeighting: 'LINEAR',
    applicability: ['MET-QUA-006', 'MET-QUA-009', 'MET-QUA-003'],
    effectiveFrom: '2026-08-31' as CalendarDate, version: 'TRAJECTORY-v1' as RuleVersion,
    rationale: 'Defect and rework signals move on a delivery-iteration cadence, faster than a reporting period and with more noise than velocity — so a shorter window with recency weighting.',
  },
  {
    signalId: 'CR_EXPOSURE',
    windowType: 'AGE_AND_TREND', windowSize: 3, minimumObservations: 1, recencyWeighting: 'NONE',
    applicability: ['MET-COM-007', 'MET-COM-010'],
    effectiveFrom: '2026-08-31' as CalendarDate, version: 'TRAJECTORY-v1' as RuleVersion,
    rationale: 'For an unexecuted change request the *age* is the signal. A CR that has sat 140 days is a finding on its own, before any trend in the population.',
  },
  {
    signalId: 'CONTINGENCY_CONSUMPTION',
    windowType: 'CUMULATIVE_PLUS_RECENT', windowSize: 8, minimumObservations: 4, recencyWeighting: 'NONE',
    applicability: ['MET-FIN-035', 'MET-FIN-034'],
    effectiveFrom: '2026-08-31' as CalendarDate, version: 'TRAJECTORY-v1' as RuleVersion,
    rationale: 'Both the level and the rate matter: 82% consumed is a fact about position, and a doubling of the weekly draw is a fact about direction. Neither alone is the signal.',
  },
  {
    signalId: 'DEPENDENCY_BLOCKAGE',
    windowType: 'AGE_AND_TREND', windowSize: 4, minimumObservations: 1, recencyWeighting: 'NONE',
    applicability: ['MET-DEL-022', 'MET-DEL-023'],
    effectiveFrom: '2026-08-31' as CalendarDate, version: 'TRAJECTORY-v1' as RuleVersion,
    rationale: 'An unresolved customer dependency ageing past 60 days is a leading indicator in its own right, independent of any trend.',
  },
  {
    signalId: 'HEALTH_TRAJECTORY',
    windowType: 'ROLLING_WEEK', windowSize: 8, minimumObservations: 6, recencyWeighting: 'NONE',
    applicability: ['MET-FCST-001', 'MET-FCST-002', 'MET-FCST-003', 'MET-FCST-006', 'MET-FCST-007', 'MET-FCST-010', 'MET-FCST-020', 'MET-FCST-021'],
    effectiveFrom: '2026-08-31' as CalendarDate, version: 'TRAJECTORY-v1' as RuleVersion,
    rationale: 'The composite health score is recomputed against every weekly snapshot, so a rolling weekly window is the right shape. **The window size is provisional**: it cannot be validated until MC-2 weights and MC-3 band edges exist and a health score can actually be computed.',
  },
  {
    signalId: 'BAND_OUTLOOK',
    windowType: 'ROLLING_WEEK', windowSize: 8, minimumObservations: 3, recencyWeighting: 'LINEAR',
    applicability: ['MET-FCST-022', 'MET-FCST-025', 'MET-FCST-026'],
    effectiveFrom: '2026-08-31' as CalendarDate, version: 'TRAJECTORY-v1' as RuleVersion,
    rationale: 'The forward outlook restates every week from the current band and the current trajectory, so it observes on the weekly cadence. The minimum is deliberately lower than HEALTH_TRAJECTORY\'s six: an outlook that refuses to speak until six weeks of history exist is silent for exactly the early period in which intervention is cheapest. Three is the point below which a slope is a line between two points; recency weighting carries the rest.',
  },
];

export function policyFor(signalId: string): TrajectoryObservationPolicy | undefined {
  return TRAJECTORY_OBSERVATION_POLICIES.find((p) => p.signalId === signalId);
}

export function policiesForMetric(metricId: string): readonly TrajectoryObservationPolicy[] {
  return TRAJECTORY_OBSERVATION_POLICIES.filter((p) => p.applicability.includes(metricId));
}
