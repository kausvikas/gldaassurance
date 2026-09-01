/**
 * Forward-risk assessment — the product's reason to exist.
 *
 * `PRODUCT_SPEC.md` §1.1: the differentiator is *"identifying Green projects moving toward
 * Amber/Red while intervention can still change the outcome."* A project that is already Red is not
 * a discovery; every dashboard in the industry finds it. The value is entirely in the projects that
 * still look fine.
 *
 * **C-10 is resolved (ADR-0018). "Green" was ambiguous and the ambiguity produced two different
 * products.** There are two distinct findings here, and collapsing them loses the more valuable one:
 *
 *   1. **System Green-at-Risk** (`MET-FCST-025`) — the system's *own* assessment says GREEN today,
 *      and its approved forward outlook at 30 or 60 days says AMBER or RED. This answers *"which
 *      projects look healthy to the system today but are predicted to deteriorate?"* It is a
 *      statement about the future.
 *
 *   2. **Reported Green Risk** (`MET-HLTH-031`) — the *organisation* reports GREEN, and the system
 *      disagrees: either the System-Assessed band is already AMBER/RED, or the evidence shows
 *      material deterioration. This answers *"which projects are still being reported Green despite
 *      system evidence of risk?"* It is a statement about a disagreement, now.
 *
 * They are independent booleans, not a spectrum, and a project can be both, either or neither.
 * `PRODUCT_SPEC.md` §3.3 requires Reported and System-Assessed RAG be kept separate, and this file
 * **never overwrites, derives or corrects Reported RAG** — it is an L1 observed management
 * declaration and it is carried through untouched.
 *
 * **What changed from the Phase 4 reading**, and why it is a fix rather than a loosening: the old
 * rule required at least one *economics* reason (margin erosion, burn gap, contingency, scope) to
 * clear a threshold before a Green project could be flagged. That silently excluded schedule-led
 * deterioration — curated scenario **LR**, "Leading Risk, No Cost Overrun", is precisely a project
 * deteriorating on forward signals with no adverse cost burn, and under the old gate it could never
 * fire. The determination now keys off band + approved outlook, both of which carry their own
 * evidence, and `reasons` are supporting detail rather than a gate. ADR-0004 §2 is satisfied because
 * the outlook cites the trajectory evidence beneath it.
 *
 * L3_ASSESSED. Every finding cites the evidence beneath it or is not produced (ADR-0004 §2).
 */
import { type Money, type Quantity, qCompare, qty } from '@platform/decimal';
import { type Explanation, type RuleEvaluation, explain } from '@platform/explainability';
import type { RecordRef, RuleVersion } from '@platform/provenance';
import type { Instant, WeekId } from '@platform/time';
import type { OutlookBand, TrajectoryEvaluation, TrajectoryState } from './trajectory-engine.js';

export type GreenAtRiskReasonCode =
  | 'MARGIN_ERODING'
  | 'BURN_AHEAD_OF_PROGRESS'
  | 'CONTINGENCY_DEPLETING'
  | 'UNCOMMERCIALISED_SCOPE'
  | 'QUALITY_SPIRAL'
  | 'ETC_OPTIMISM'
  | 'REPORTED_STATUS_DIVERGENCE'
  | 'SIGNAL_CONFLUENCE';

export interface GreenAtRiskReason {
  readonly code: GreenAtRiskReasonCode;
  readonly metricId: string;
  readonly observedValue: string;
  readonly narrative: string;
  readonly evidence: readonly RecordRef[];
}

export interface GreenAtRiskInput {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  readonly ruleVersion: RuleVersion;
  readonly metricCatalogVersion: string;
  /**
   * `MET-HLTH-011` System-Assessed band — what the evidence supports. System Green-at-Risk applies
   * only when this is GREEN; a project already AMBER is an active problem, not a discovery.
   */
  readonly systemAssessedBand: 'GREEN' | 'AMBER' | 'RED';
  /**
   * `MET-HLTH-012` Reported RAG — the **L1 observed management declaration**, exactly as reported.
   * Read only. Nothing in this file writes it, corrects it or lets the system's view stand in for
   * it (`PRODUCT_SPEC.md` §3.3). `null` means no status was reported for the period, which is a
   * different and separately reportable fact from a reported GREEN.
   */
  readonly reportedRag: 'GREEN' | 'AMBER' | 'RED' | null;
  readonly trajectory: TrajectoryEvaluation;
  /** Contract value at stake if the trajectory runs to its conclusion. */
  readonly economicExposure: Money;
  /** Margin points that would be lost between today's forecast and the projected outturn. */
  readonly marginPointsAtRisk: Quantity | null;
  readonly reasons: readonly GreenAtRiskReason[];
  /**
   * The records behind the current band. Required: a firing rule that cannot be traced to a record
   * cannot be checked (REQ-DATA-010, AC-3), and `explain()` refuses to build an explanation without it.
   */
  readonly bandEvidence: readonly RecordRef[];
  /** MET-DQ-005 data confidence 0–100. A low-confidence Green is a different problem. */
  readonly dataConfidence: Quantity | null;
  /** Weeks before the band is projected to change. Null when no change is projected. */
  readonly weeksToBandChange: number | null;
  /** Below this, the finding is reported as *too late to act*, not as an opportunity. */
  readonly minimumInterventionWeeks: number;
}

export interface GreenAtRiskFinding {
  readonly projectId: string;
  readonly week: WeekId;
  readonly assessedAt: Instant;
  /**
   * `MET-FCST-025` — System-Assessed GREEN now, approved forward outlook AMBER/RED at 30 or 60 days.
   */
  readonly isSystemGreenAtRisk: boolean;
  /**
   * `MET-HLTH-031` — Reported GREEN while the system's evidence says otherwise. Independent of
   * `isSystemGreenAtRisk`; a project may be both, either or neither.
   */
  readonly isReportedGreenRisk: boolean;
  /** Carried through untouched, so a consumer can always show both verdicts side by side. */
  readonly reportedRag: 'GREEN' | 'AMBER' | 'RED' | null;
  readonly systemAssessedBand: 'GREEN' | 'AMBER' | 'RED';
  /** The approved forward outlook at each horizon, as the trajectory engine produced it. */
  readonly outlook30: OutlookBand | null;
  readonly outlook60: OutlookBand | null;
  readonly reasons: readonly GreenAtRiskReason[];
  readonly economicExposure: Money;
  readonly marginPointsAtRisk: Quantity | null;
  /** How much of this finding rests on data we trust. Reported beside, never blended in. */
  readonly dataConfidence: Quantity | null;
  readonly confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW';
  readonly weeksToBandChange: number | null;
  /** The whole point: is there still room to change the outcome? */
  readonly interventionWindowOpen: boolean;
  readonly notApplicableReason?: string;
  readonly explanation: Explanation;
}

const FALLING: readonly TrajectoryState[] = ['DETERIORATING', 'RAPIDLY_DETERIORATING'];
const ADVERSE_OUTLOOK: readonly OutlookBand[] = ['AMBER', 'RED'];

/** The approved forward horizons C-10 keys on. 90 days is reported but does not trigger. */
export const SYSTEM_GREEN_AT_RISK_HORIZONS = ['DAYS_30', 'DAYS_60'] as const;

const outlookAt = (t: TrajectoryEvaluation, horizon: string): OutlookBand | null =>
  t.outlooks.find((o) => o.horizon === horizon)?.band ?? null;

export function assessGreenAtRisk(input: GreenAtRiskInput): GreenAtRiskFinding {
  const falling = FALLING.includes(input.trajectory.state);
  const looksHealthy = input.systemAssessedBand === 'GREEN';
  const hasReasons = input.reasons.length > 0;
  const windowOpen =
    input.weeksToBandChange === null || input.weeksToBandChange >= input.minimumInterventionWeeks;

  const outlook30 = outlookAt(input.trajectory, 'DAYS_30');
  const outlook60 = outlookAt(input.trajectory, 'DAYS_60');
  const adverseHorizons = SYSTEM_GREEN_AT_RISK_HORIZONS
    .filter((h) => {
      const band = h === 'DAYS_30' ? outlook30 : outlook60;
      return band !== null && ADVERSE_OUTLOOK.includes(band);
    });
  const outlookAdverse = adverseHorizons.length > 0;

  // --- 1. System Green-at-Risk (MET-FCST-025) -------------------------------
  // System says GREEN today; the approved forward outlook says otherwise within 30 or 60 days.
  const isSystemGreenAtRisk = looksHealthy && outlookAdverse;

  // --- 2. Reported Green Risk (MET-HLTH-031) --------------------------------
  // The organisation reports GREEN; the system's evidence disagrees. Deliberately a *separate*
  // question — it fires on the current disagreement, not on a prediction, which is why an already-
  // AMBER project reported GREEN (curated scenario B) is caught here and not above.
  const reportedGreen = input.reportedRag === 'GREEN';
  const systemDisagreesNow = input.systemAssessedBand !== 'GREEN';
  const materialDeterioration = falling || outlookAdverse;
  const isReportedGreenRisk = reportedGreen && (systemDisagreesNow || materialDeterioration);

  const notApplicableReason = isSystemGreenAtRisk ? undefined
    : !looksHealthy
      ? `System-Assessed RAG is already ${input.systemAssessedBand}. System Green-at-Risk describes ` +
        'projects the system still assesses as healthy; this one it does not, and it is handled as ' +
        'an active problem instead.' +
        (isReportedGreenRisk
          ? ' It IS a Reported Green Risk: the organisation still reports GREEN.'
          : '')
    : 'The forward outlook stays GREEN at both 30 and 60 days. Green now and Green ahead is ' +
      'simply Green.';

  const confidenceBand: GreenAtRiskFinding['confidenceBand'] =
    input.dataConfidence === null ? 'LOW'
    : qCompare(input.dataConfidence, qty('75')) >= 0 ? 'HIGH'
    : qCompare(input.dataConfidence, qty('50')) >= 0 ? 'MEDIUM'
    : 'LOW';

  const evaluations: RuleEvaluation[] = [
    {
      ruleId: 'GAR-BAND', ruleName: 'Currently presents as healthy', ruleSetId: 'GREEN_AT_RISK',
      ruleVersion: input.ruleVersion, signalId: 'SYSTEM_ASSESSED_RAG', signalMetricId: 'MET-HLTH-011',
      observedValue: input.systemAssessedBand, comparison: 'EQ', thresholdValue: 'GREEN',
      status: (looksHealthy) ? 'FIRED' : 'CLEAR',
      fired: looksHealthy, contribution: looksHealthy ? 'condition 1 of 2 met' : 'condition 1 of 2 failed',
      narrative: `System-Assessed RAG is ${input.systemAssessedBand}.`,
      evidence: input.bandEvidence,
    },
    {
      ruleId: 'GAR-OUTLOOK', ruleName: 'Forward outlook turns adverse within 60 days',
      ruleSetId: 'GREEN_AT_RISK',
      ruleVersion: input.ruleVersion, signalId: 'FORWARD_OUTLOOK', signalMetricId: 'MET-FCST-022',
      observedValue: `30d=${outlook30 ?? 'none'} 60d=${outlook60 ?? 'none'}`,
      comparison: 'IN_BAND', thresholdValue: ADVERSE_OUTLOOK.join('|'),
      status: (outlookAdverse) ? 'FIRED' : 'CLEAR',
      fired: outlookAdverse,
      contribution: outlookAdverse
        ? `condition 2 of 2 met at ${adverseHorizons.join(' and ')}`
        : 'condition 2 of 2 failed — outlook stays GREEN through 60 days',
      trend: outlookAdverse ? 'WORSENING' : 'STABLE',
      narrative: outlookAdverse
        ? `The approved forward outlook is ${adverseHorizons.map((h) => `${h === 'DAYS_30' ? '30' : '60'}-day ${h === 'DAYS_30' ? outlook30 : outlook60}`).join(', ')}, ` +
          `driven by a ${input.trajectory.state} trajectory with ${input.trajectory.adverseConfluence} ` +
          `materially adverse signal${input.trajectory.adverseConfluence === 1 ? '' : 's'}.`
        : `The forward outlook is 30-day ${outlook30 ?? 'not projected'} and 60-day ` +
          `${outlook60 ?? 'not projected'}; neither is AMBER or RED.`,
      evidence: input.trajectory.explanation.evidence,
    },
    {
      ruleId: 'GAR-REPORTED-CONFLICT', ruleName: 'Reported GREEN against system evidence',
      ruleSetId: 'GREEN_AT_RISK',
      ruleVersion: input.ruleVersion, signalId: 'REPORTED_RAG', signalMetricId: 'MET-HLTH-012',
      observedValue: input.reportedRag ?? 'NOT_REPORTED',
      comparison: 'EQ', thresholdValue: 'GREEN',
      ...(input.reportedRag === null
        ? { notEvaluatedReason: 'no status was reported for this period' }
        : {}),
      status: (isReportedGreenRisk) ? 'FIRED' : 'CLEAR',
      fired: isReportedGreenRisk,
      contribution: isReportedGreenRisk
        ? 'Reported Green Risk (MET-HLTH-031)'
        : 'no reported/system conflict',
      narrative: input.reportedRag === null
        ? 'No Reported RAG for this period, so no reported/system comparison is possible. Absence of ' +
          'a report is recorded as absence, never as GREEN.'
        : isReportedGreenRisk
          ? `Reported GREEN while the system assesses ${input.systemAssessedBand}` +
            `${materialDeterioration ? ` and the evidence shows material deterioration (${input.trajectory.state})` : ''}. ` +
            'Reported RAG is left exactly as reported; this records the disagreement, it does not resolve it.'
          : `Reported ${input.reportedRag} against a System-Assessed ${input.systemAssessedBand}; no conflict.`,
      evidence: input.bandEvidence,
    },
    {
      ruleId: 'GAR-REASONS', ruleName: 'Stateable signal-level reasons', ruleSetId: 'GREEN_AT_RISK',
      ruleVersion: input.ruleVersion, signalId: 'REASON_COUNT',
      observedValue: String(input.reasons.length), comparison: 'GTE', thresholdValue: '1',
      status: (hasReasons) ? 'FIRED' : 'CLEAR',
      fired: hasReasons,
      // Supporting detail, not a gate (ADR-0018). Gating on economics reasons made schedule-led
      // deterioration — curated scenario LR — structurally undetectable.
      contribution: hasReasons ? 'supporting detail' : 'none available',
      narrative: hasReasons
        ? `${input.reasons.length} reason${input.reasons.length === 1 ? '' : 's'}: ` +
          `${input.reasons.map((r) => r.code).join(', ')}.`
        : 'No economics signal cleared its threshold. The determination rests on the band and the ' +
          'forward outlook, both of which carry their own evidence.',
      evidence: hasReasons
        ? input.reasons.flatMap((r) => r.evidence)
        : input.trajectory.explanation.evidence,
    },
    {
      ruleId: 'GAR-WINDOW', ruleName: 'Intervention window still open', ruleSetId: 'GREEN_AT_RISK',
      ruleVersion: input.ruleVersion, signalId: 'WEEKS_TO_BAND_CHANGE', signalMetricId: 'MET-FCST-007',
      observedValue: input.weeksToBandChange === null ? null : String(input.weeksToBandChange),
      comparison: 'GTE', thresholdValue: String(input.minimumInterventionWeeks),
      ...(input.weeksToBandChange === null
        ? { notEvaluatedReason: 'no band change is projected within the outlook horizon' }
        : {}),
      status: (windowOpen) ? 'FIRED' : 'CLEAR',
      fired: windowOpen,
      contribution: windowOpen ? 'actionable' : 'flagged as late — escalate rather than plan',
      narrative: input.weeksToBandChange === null
        ? 'No band change projected within the horizon, so the window is treated as open.'
        : `${input.weeksToBandChange} weeks until the projected band change, against a minimum ` +
          `intervention window of ${input.minimumInterventionWeeks}.`,
      evidence: input.trajectory.explanation.evidence,
    },
    ...input.reasons.map((r): RuleEvaluation => ({
      ruleId: `GAR-${r.code}`, ruleName: r.code, ruleSetId: 'GREEN_AT_RISK',
      ruleVersion: input.ruleVersion, signalId: r.code, signalMetricId: r.metricId,
      observedValue: r.observedValue, comparison: 'PRESENT',
      status: (true) ? 'FIRED' : 'CLEAR',
      fired: true, contribution: 'contributing reason', narrative: r.narrative,
      evidence: r.evidence,
    })),
  ];

  return {
    projectId: input.projectId, week: input.week, assessedAt: input.assessedAt,
    isSystemGreenAtRisk,
    isReportedGreenRisk,
    // Read in, read out. Never derived, never corrected (PRODUCT_SPEC.md §3.3).
    reportedRag: input.reportedRag,
    systemAssessedBand: input.systemAssessedBand,
    outlook30, outlook60,
    // Reasons accompany either finding; they are evidence for a reader, not the trigger.
    reasons: isSystemGreenAtRisk || isReportedGreenRisk ? input.reasons : [],
    economicExposure: input.economicExposure,
    marginPointsAtRisk: input.marginPointsAtRisk,
    dataConfidence: input.dataConfidence,
    confidenceBand,
    weeksToBandChange: input.weeksToBandChange,
    interventionWindowOpen: windowOpen,
    ...(notApplicableReason !== undefined ? { notApplicableReason } : {}),
    explanation: explain({
      outcome: isSystemGreenAtRisk && isReportedGreenRisk
        ? 'SYSTEM GREEN-AT-RISK and REPORTED GREEN RISK'
        : isSystemGreenAtRisk ? 'SYSTEM GREEN-AT-RISK'
        : isReportedGreenRisk ? 'REPORTED GREEN RISK'
        : 'Neither System Green-at-Risk nor Reported Green Risk',
      ...(notApplicableReason !== undefined ? { outcomeDetail: notApplicableReason } : {}),
      evaluatedAt: input.assessedAt,
      ruleSetVersion: input.ruleVersion,
      metricCatalogVersion: input.metricCatalogVersion,
      evaluations,
    }),
  };
}
