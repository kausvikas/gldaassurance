/**
 * Hard override rules — the conditions that force a status regardless of the composite score.
 *
 * A weighted composite is a good way to rank a portfolio and a bad way to catch a catastrophe: a
 * project can be losing money on every unit it delivers and still average out to Amber because three
 * of four dimensions are fine. These rules exist so that cannot happen.
 *
 * **Thresholds are data.** `ARCHITECTURE_DECISIONS.md` and ADR-0004 §5 both require it, and
 * `PRODUCT_SPEC.md` §8 lists a threshold buried in a component as a defect. Nothing in this file is
 * imported by presentation code, and the architecture gate makes that a build failure.
 *
 * The values below are **SYNTHETIC CALIBRATION CANDIDATES**, not approved production policy. MC-3
 * remains open; its owner is Rules + Delivery leadership. Where a threshold has genuinely never been
 * decided the rule carries `blockedBy` and reports itself as unevaluated rather than assuming a
 * number.
 */
import { qCompare, qty } from '@platform/decimal';
import { ruleVersion } from '@platform/provenance';
import type { ApplicabilityVerdict, ThresholdRule } from './engine.js';

const HEALTH = ruleVersion('HEALTH-v2');

const rule = (
  id: string, name: string, signalId: string, signalMetricId: string,
  comparison: ThresholdRule['comparison'], threshold: string | undefined,
  effect: string, whenFired: string, whenClear: string, blockedBy?: string,
): ThresholdRule => ({
  id, name, ruleSetId: 'HEALTH', ruleVersion: HEALTH, signalId, signalMetricId,
  comparison, ...(threshold !== undefined ? { threshold } : {}),
  severity: 'OVERRIDE', effect,
  narrativeWhenFired: whenFired, narrativeWhenClear: whenClear,
  ...(blockedBy !== undefined ? { blockedBy } : {}),
});

/**
 * Any of these firing forces **RED**, whatever the composite says.
 *
 * Order matters only for reporting: all are evaluated, all firings are recorded, and the outcome is
 * Red if any fired. A system that stopped at the first would tell an executive one reason when there
 * were four.
 */
export const HARD_OVERRIDE_RULES: readonly ThresholdRule[] = [
  rule(
    'OVR-GM-NEGATIVE', 'Forecast gross margin is negative',
    'FORECAST_GM_PERCENT', 'MET-FIN-014', 'LT', '0',
    'forces RED',
    'Forecast margin is below zero: every remaining unit of delivery costs more than it earns. This is a commercial decision, not a delivery one.',
    'Forecast margin is positive.',
  ),
  rule(
    'OVR-RAGM-NEGATIVE', 'Risk-adjusted gross margin is negative',
    'RISK_ADJUSTED_GM_PERCENT', 'MET-FIN-033', 'LT', '0',
    'forces RED',
    'Once unresolved risk that is not already provisioned in ETC is counted, the engagement is loss-making. The headline margin may still look positive; it is not the number to act on.',
    'Risk-adjusted margin is positive.',
  ),
  rule(
    'OVR-CONTRACT-LOSS', 'Forecast contract loss against the as-sold position',
    'GM_VALUE_AT_RISK_RATIO', 'MET-FIN-042', 'GTE', '0.80',
    'forces RED',
    'Substantially all of the margin sold has been put at risk. The engagement is heading for a contractual loss position rather than a margin shortfall.',
    'Margin at risk is within tolerance of the as-sold position.',
  ),
  rule(
    'OVR-LD-EXPOSURE', 'Critical liquidated-damages exposure',
    // MET-COM-011, not MET-FIN-019: this compares an LD exposure ratio, not GM value at risk.
    // The wrong id was the visible symptom of a signal that was never assembled (ADR-0025).
    'LD_EXPOSURE_RATIO', 'MET-COM-011', 'GTE', '0.02',
    'forces RED',
    'Liquidated damages are live and material against contract value. Exposure of this kind is contractual and does not resolve through delivery recovery alone.',
    'No material liquidated-damages exposure.',
  ),
  rule(
    'OVR-ACCEPTANCE-FAILURE', 'Material acceptance failure',
    'ACCEPTANCE_BLOCKERS', 'MET-QUA-010', 'GTE', '5',
    'forces RED',
    'The client has named enough blocking objections that formal acceptance is not achievable on the current plan. In fixed-bid these gate revenue, so this is an economic event.',
    'Acceptance blockers are below the override threshold.',
  ),
  rule(
    'OVR-BURN-MISMATCH', 'Severe burn against progress mismatch',
    'BURN_GAP', 'MET-FIN-027', 'GTE', '0.25',
    'forces RED',
    'Spending has run far ahead of delivered progress. Whatever the current margin says, the remaining work is being funded from margin that has already been consumed.',
    'Cost consumption is within tolerance of delivered progress.',
  ),
  rule(
    'OVR-UNCOMMERCIALISED-SCOPE', 'Material uncommercialised scope',
    'UNCOMPENSATED_SCOPE_RATIO', 'MET-COM-009', 'GTE', '0.10',
    'forces RED',
    'A material share of contract value is being delivered with no executed change request behind it. The loss is already incurred and the remedy is commercial.',
    'Uncommercialised scope is below the override threshold.',
  ),
  {
    ...rule(
      'OVR-NO-CREDIBLE-PLAN', 'No credible completion plan',
      'REQUIRED_VELOCITY_RATIO', 'MET-DEL-018', 'GTE', '2.00',
    'forces RED',
      'Finishing on the committed date requires at least twice the delivery rate this team has demonstrated. The plan assumes a step-change nobody has shown.',
      'The remaining plan is within reach of demonstrated delivery rate.',
    ),
    requiredEvidence: ['MET-DEL-018', 'MET-DEL-019', 'MET-DEL-020', 'MET-DEL-016'],
    /*
     * ADR-0026 D-3. `MET-DEL-018` is `MET-DEL-020 / MET-DEL-019` — required future velocity over
     * **demonstrated** velocity — so the rule asks whether the rate a team has actually shown
     * implies an implausible step-change. Three conditions remove the subject of that question
     * entirely, and in none of them is evidence missing.
     *
     * Keyed on remaining work, remaining window and elapsed delivery rather than on
     * `lifecycleStage`: measured on the demo portfolio, the stage label misclassifies 3 of 13.
     */
    applicability: (ctx): ApplicabilityVerdict => {
      if (ctx.physicalCompletion !== null && qCompare(ctx.physicalCompletion, qty('1')) >= 0) {
        return {
          applicable: false,
          reasonCode: 'NO_REMAINING_WORK',
          reasonText: 'Delivery is complete, so there is no remaining plan whose credibility could be in question.',
        };
      }
      if (ctx.daysToBaselineCompletion !== null && ctx.daysToBaselineCompletion <= 0) {
        return {
          applicable: false,
          reasonCode: 'NO_REMAINING_DELIVERY_WINDOW',
          reasonText: 'The committed completion date has been reached, so there is no remaining window a required future velocity could be measured against. Whether the date was met is a separate, backward-looking finding.',
        };
      }
      if (ctx.elapsedDeliveryWeeks !== null
        && ctx.elapsedDeliveryWeeks < ctx.velocityWindowWeeks + 1) {
        return {
          applicable: false,
          reasonCode: 'INSUFFICIENT_EXECUTION_HISTORY',
          reasonText: `Delivery has been running ${String(ctx.elapsedDeliveryWeeks)} weeks, and a demonstrated velocity needs ${String(ctx.velocityWindowWeeks + 1)}. The comparison this rule makes has no subject yet -- the history is not missing, it cannot exist yet.`,
        };
      }
      return { applicable: true };
    },
  },
];

/**
 * Conditions that force **AMBER** where they do not already force Red. Warnings, not catastrophes.
 */
export const ELEVATION_RULES: readonly ThresholdRule[] = [
  {
    ...rule(
      'ELV-ETC-OPTIMISM', 'Estimate at completion is materially optimistic',
      // MET-FIN-040, not MET-FIN-030: the rule compares a RATIO and MET-FIN-030 is Money (ADR-0025).
      'ETC_OPTIMISM_RATIO', 'MET-FIN-040', 'GTE', '0.10',
      'forces at least AMBER',
      'Demonstrated performance implies a materially higher outturn cost than the stated estimate. The forecast has not caught up with the run rate.',
      'The stated estimate is consistent with demonstrated performance.',
    ),
    severity: 'WARNING',
  },
  {
    ...rule(
      'ELV-CONTINGENCY-BURN', 'Contingency consumed far ahead of progress',
      'CONTINGENCY_BURN_GAP', 'MET-FIN-034', 'GTE', '0.20',
      'forces at least AMBER',
      'The buffer priced to absorb uncertainty is being spent faster than the work is being delivered. Margin protection is going before the risk it was meant to cover has materialised.',
      'Contingency consumption is proportionate to progress.',
    ),
    severity: 'WARNING',
  },
  {
    ...rule(
      'ELV-MARGIN-EROSION', 'Margin erosion against as-sold',
      'MARGIN_EROSION_PP', 'MET-FIN-016', 'LTE', '-0.05',
      'forces at least AMBER',
      'Five or more percentage points of margin have gone against the price we sold.',
      'Margin erosion is within tolerance.',
    ),
    severity: 'WARNING',
  },
];

/**
 * Band thresholds for the composite. **MC-3 is open**, so these carry the calibration-candidate
 * caveat. The banding *mechanism* is frozen; these numbers are not.
 */
export const BAND_THRESHOLDS = {
  ruleSetId: 'HEALTH',
  ruleVersion: HEALTH,
  /** Composite at or above this is Green. */
  greenFloor: '70',
  /** Composite at or above this (and below greenFloor) is Amber; below it is Red. */
  amberFloor: '45',
  blockedBy: undefined as string | undefined,
  provenanceNote:
    'SYNTHETIC CALIBRATION CANDIDATE — NOT APPROVED PRODUCTION POLICY. MC-3 remains open; owner is ' +
    'Rules + Delivery leadership.',
} as const;

export const ALL_HEALTH_RULES: readonly ThresholdRule[] = [...HARD_OVERRIDE_RULES, ...ELEVATION_RULES];
