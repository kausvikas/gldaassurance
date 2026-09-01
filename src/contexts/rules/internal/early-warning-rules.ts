/**
 * Early-warning rules — the conditions that say *this will break before it turns Red*.
 *
 * **These are `WARNING` severity, and that is the whole design.** A hard override forces a band; an
 * early warning does not touch health at all. It exists to be acted on *while the project is still
 * Green or Amber*, which is precisely the window a RAG status cannot describe — by the time the band
 * moves, the intervention window has closed. `MET-FCST-007` is the metric for that window; these
 * rules are what open it.
 *
 * **Thresholds are data** (ADR-0004 §5), and every value here is a **SYNTHETIC CALIBRATION
 * CANDIDATE**, not approved production policy. MC-3 remains open; its owner is Rules + Delivery
 * leadership. A rule whose threshold has genuinely never been decided carries `blockedBy` and
 * reports itself unevaluated rather than assuming a number.
 *
 * ### Why these thresholds are deliberately tighter than the health bands
 *
 * A health band answers *"is this project in trouble now?"*. An early warning answers *"is this
 * project heading there?"*, so it has to fire **before** the band would. Setting the two at the same
 * level would produce a warning system that never warns — it would only ever confirm what the RAG
 * already said, which is the late-detection failure the product exists to remove.
 *
 * ### What a warning is not
 *
 * It is not a probability. Nothing here is trained, fitted or sampled: a rule fires when an observed
 * value crosses a stated threshold, and the surface says so in those words. Presenting a rules-based
 * firing as a modelled likelihood would be a claim the system cannot support.
 */
import { ruleVersion } from '@platform/provenance';
import type { ThresholdRule } from './engine.js';

const EW = ruleVersion('EARLY_WARNING-v1');

const warn = (
  id: string, name: string, signalId: string, signalMetricId: string,
  comparison: ThresholdRule['comparison'], threshold: string | undefined,
  effect: string, whenFired: string, whenClear: string, blockedBy?: string,
): ThresholdRule => ({
  id, name, ruleSetId: 'EARLY-WARNING', ruleVersion: EW, signalId, signalMetricId,
  comparison, ...(threshold !== undefined ? { threshold } : {}),
  severity: 'WARNING', effect,
  narrativeWhenFired: whenFired, narrativeWhenClear: whenClear,
  ...(blockedBy !== undefined ? { blockedBy } : {}),
});

/**
 * The twelve emerging signals.
 *
 * Ordered by how early they typically appear, not by severity: the first few move while a project
 * still reports Green, and the last few move once it is already visibly struggling. A reader working
 * down the list is working forward in time.
 */
export const EARLY_WARNING_RULES: readonly ThresholdRule[] = [
  warn(
    'EW-GM-DETERIORATION-STREAK', 'Forecast margin falling for consecutive periods',
    'GM_DETERIORATION_STREAK', 'MET-FIN-024', 'GTE', '3',
    'raises an early warning',
    'Forecast gross margin has fallen in three or more consecutive reporting periods. One period is '
    + 'noise; three is a direction, and it has not yet reached a band edge.',
    'Forecast margin has not fallen in three consecutive periods.',
  ),
  warn(
    'EW-EAC-INCREASE', 'Estimate at completion rising',
    'EAC_INCREASE_RATIO', 'MET-FIN-043', 'GTE', '0.05',
    'raises an early warning',
    'The estimate at completion has risen more than 5% against the earliest period on record. Cost '
    + 'to finish is growing, and every dollar of it comes out of margin on a fixed-bid contract.',
    'The estimate at completion is stable against its earlier position.',
  ),
  warn(
    'EW-BURN-GAP', 'Cost outrunning progress',
    'BURN_GAP', 'MET-FIN-027', 'GTE', '0.08',
    'raises an early warning',
    'Cost consumed is more than 8 percentage points ahead of physical completion. Money is being '
    + 'spent faster than value is being created, which is a margin problem before it is a schedule one.',
    'Cost consumption is tracking physical completion.',
  ),
  warn(
    'EW-CONTINGENCY-DEPLETION', 'Contingency consumed ahead of the work',
    'CONTINGENCY_BURN_GAP', 'MET-FIN-034', 'GTE', '0.15',
    'raises an early warning',
    'Contingency is more than 15 percentage points more consumed than the project is complete. The '
    + 'buffer that was meant to absorb the rest of the delivery is being spent on the first half.',
    'Contingency consumption is proportionate to completion.',
  ),
  warn(
    'EW-REQUIRED-VELOCITY', 'The plan needs a team this one has not been',
    'REQUIRED_VELOCITY_RATIO', 'MET-DEL-018', 'GTE', '1.30',
    'raises an early warning',
    'Finishing on the committed date now requires at least 1.3× the delivery rate demonstrated over '
    + 'the trailing window. The plan assumes an improvement nobody has shown yet.',
    'The remaining plan is within reach of the demonstrated delivery rate.',
  ),
  warn(
    'EW-UNCOMMERCIALISED-SCOPE', 'Scope delivered without a change request',
    'UNCOMPENSATED_SCOPE_RATIO', 'MET-COM-009', 'GTE', '0.02',
    'raises an early warning',
    'More than 2% of contract value has been delivered with no executed change request behind it. '
    + 'The cost is already incurred and the remedy is commercial, not operational.',
    'Delivered scope is covered by the contract and its executed changes.',
  ),
  warn(
    'EW-PENDING-CR-AGEING', 'Change requests ageing unresolved',
    'PENDING_CR_AGE_DAYS', 'MET-COM-007', 'GTE', '45',
    'raises an early warning',
    'A pending change request has been open more than 45 days. Unsigned work is not revenue, and an '
    + 'ageing request is usually a decision nobody is taking rather than one still being made.',
    'No pending change request is ageing beyond the review window.',
  ),
  warn(
    'EW-QUALITY-REWORK', 'Rework above the priced allowance',
    'REWORK_RATIO', 'MET-QUA-006', 'GTE', '0.12',
    'raises an early warning',
    'More than 12% of effort is rework. Every rework hour is paid for twice on a fixed-bid contract '
    + 'and was priced once.',
    'Rework is within the allowance priced into the contract.',
  ),
  warn(
    'EW-DEFECT-BACKLOG', 'Defect backlog growing',
    'DEFECT_BACKLOG_TREND', 'MET-QUA-009', 'GTE', '1.5',
    'raises an early warning',
    'Open defects are growing by more than 1.5 per week across the trailing window. The team is '
    + 'creating defects faster than it is closing them, which ends in an acceptance problem.',
    'The defect backlog is stable or shrinking.',
  ),
  warn(
    'EW-MILESTONE-SLIP', 'Milestones forecast past their baseline',
    'MILESTONES_AT_RISK', 'MET-DEL-010', 'GTE', '1',
    'raises an early warning',
    'At least one undelivered milestone is already forecast past its baseline date. Where the '
    + 'milestone gates payment, the slip is a cash event as well as a schedule one.',
    'No undelivered milestone is forecast past its baseline.',
  ),
  warn(
    'EW-RESOURCE-COST-DRIFT', 'Blended rate above the priced rate',
    'RESOURCE_COST_DRIFT_RATIO', 'MET-RES-011', 'GTE', '0.03',
    'raises an early warning',
    'The blended rate actually being paid, across hours delivered, is drifting more than 3% of '
    + 'budgeted cost above the rate the work was priced at.',
    'The blended rate is tracking the priced rate.',
  ),
  warn(
    'EW-DEPENDENCY-AGEING', 'Customer dependency ageing',
    'DEPENDENCY_AGEING_DAYS', 'MET-DEL-023', 'GTE', '30',
    'raises an early warning',
    'An open customer dependency has been outstanding more than 30 days. Whether the delay is '
    + 'recoverable is a contractual question, and it is cheaper to ask it now than at closure.',
    'No customer dependency is ageing beyond the tolerance.',
  ),
  warn(
    'EW-STALE-EVIDENCE', 'The evidence behind the assessment is stale',
    'CRITICAL_DOMAIN_STALENESS_DAYS', 'MET-DQ-002', 'GTE', '10',
    'raises an early warning',
    'A critical domain has not reported for more than 10 days. This warning is about the '
    + '**assessment**, not the project: a quiet project and a project nobody is measuring look '
    + 'identical from here, and only one of them is safe.',
    'Critical domains are reporting within their expected cadence.',
  ),
];

/**
 * Severity bands for a fired warning, as data.
 *
 * Severity is **how far past the threshold the value sits**, not how important the signal feels. A
 * burn gap at 8.1 points and one at 40 points fire the same rule and are not the same problem, and a
 * list that cannot tell them apart cannot be prioritised.
 */
export interface WarningSeverityBand {
  readonly id: 'ELEVATED' | 'HIGH' | 'SEVERE';
  /** Multiple of the threshold at or above which this band applies. */
  readonly atMultiple: string;
  readonly meaning: string;
}

export const WARNING_SEVERITY_BANDS: readonly WarningSeverityBand[] = [
  { id: 'SEVERE', atMultiple: '3', meaning: 'three or more times past the threshold' },
  { id: 'HIGH', atMultiple: '1.75', meaning: 'well past the threshold' },
  { id: 'ELEVATED', atMultiple: '1', meaning: 'past the threshold' },
];

export const EARLY_WARNING_RULE_VERSION = EW;
