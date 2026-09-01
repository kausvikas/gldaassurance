/**
 * The claim envelope and its **conservative defaults** (**ADR-0031**).
 *
 * Every prior instance of this repository's defect family was a *forgetting*, not a decision: a
 * correct value produced by a correct engine, and a qualification dropped one hop above it. The
 * application layer discarded `notEvaluatedReason`, so `firedOverrides.length === 0` read as "all
 * eight controls checked and cleared" (ADR-0025). The adapter discarded
 * `SignalReading.notComputableReason`, so a known cause became "signal not supplied" (ADR-0027).
 *
 * An assistant is not four deliberately-wired surfaces; it composes across all of them. So the
 * defaults here point one way only:
 *
 * > **An un-migrated producer must degrade a claim, never strengthen it.**
 *
 * A uniform envelope with permissive defaults would be *worse* than no envelope, because it would
 * look like a control. `executiveAuthoritative` defaults to `false`; `assessmentStatus` to
 * `PROVISIONAL`; `signalState` to `NOT_COMPUTABLE`; `evidenceCoverage` to `null`, which trips CS-4
 * exactly as low coverage does.
 */
import type {
  AssessmentStatus, CalibrationStatus, ClaimEnvelope, EvidenceFreshness,
} from '@contexts/ai-intelligence';
import type { EpistemicLayer } from '@platform/provenance';
import type { SignalState } from '@platform/explainability';
import type { Instant } from '@platform/time';

/**
 * Debt reachable from a metric or rule, attached by **lookup rather than by memory**.
 *
 * A new debt item qualifies every claim that reaches it without anyone remembering to wire it in —
 * which is the only mechanism that survives the way the previous three did not.
 */
export const LIMITATIONS_FOR: Readonly<Record<string, readonly string[]>> = {
  'MET-FCST-030': ['DR-059'],                      // late detection replays one dimension of four
  'MET-FIN-018': ['DR-062', 'DR-058'],             // bridge reconciles by construction; two causes MODELLED
  'MET-FIN-041': ['DR-062'],
  'MET-RES-002': ['DR-064'],                       // earned baseline correct; seniority split deferred
  'MET-RES-003': ['DR-064'],                       // MID placed junior by a constant — 2.4x swing
  'MET-RES-010': ['DR-064'],
  'MET-PORT-003': [],                              // ADR-0023 — additive; nothing outstanding
  'MET-PORT-007': ['DR-055'],                      // ranking inherits uncalibrated override thresholds
  'MET-HLTH-011': ['DR-054', 'DR-055'],            // band edges and override thresholds uncalibrated
  'MET-REC-001': ['DR-060'],                       // no authorised accept/close workflow
  'MET-REC-002': ['DR-060'],
  'MET-REC-003': ['DR-060'],
};

/** Every early-warning and override rule inherits uncalibrated thresholds. */
export const RULE_LIMITATIONS: readonly string[] = ['DR-061', 'DR-063'];

/**
 * **`SYNTHETIC_UNVALIDATED` everywhere in this POC.** There is no approved calibration anywhere in
 * the repository. `APPROVED` exists in the type so the distinction is representable and so the
 * value is not silently absent when calibration eventually happens; a test asserts no producer
 * emits it today (ADR-0031 D-5).
 */
export const POC_CALIBRATION: CalibrationStatus = 'SYNTHETIC_UNVALIDATED';

export function envelope(args: {
  readonly metricId: string | null;
  readonly ruleId: string | null;
  readonly layer: EpistemicLayer;
  readonly asOf: Instant;
  readonly sourceDomain: string;
  readonly signalState?: SignalState;
  readonly overrides?: Partial<ClaimEnvelope>;
}): ClaimEnvelope {
  const fromMetric = args.metricId === null ? [] : LIMITATIONS_FOR[args.metricId] ?? [];
  const fromRule = args.ruleId === null ? [] : RULE_LIMITATIONS;
  const limitations = [...new Set([...fromMetric, ...fromRule])];

  const base: ClaimEnvelope = {
    metricId: args.metricId,
    ruleId: args.ruleId,
    version: 'HEALTH-v2',
    epistemicLayer: args.layer,
    asOf: args.asOf,
    sourceDomain: args.sourceDomain,
    // Conservative defaults. Each one is the reading that weakens the claim.
    evidenceFreshness: 'UNKNOWN' satisfies EvidenceFreshness,
    evidenceCoverage: null,
    assessmentStatus: 'PROVISIONAL' satisfies AssessmentStatus,
    signalState: args.signalState ?? 'NOT_COMPUTABLE',
    calibrationStatus: POC_CALIBRATION,
    executiveAuthoritative: false,
    limitations,
    syntheticData: true,
  };
  if (args.overrides === undefined) return base;
  // An override may only be applied deliberately, and `limitations` unions rather than replaces so
  // a caller cannot drop a debt item by supplying its own list.
  const merged = { ...base, ...args.overrides, syntheticData: true as const };
  return {
    ...merged,
    limitations: [...new Set([...limitations, ...(args.overrides.limitations ?? [])])],
  };
}

/** `true` when nothing about this claim requires qualification. */
export function isFullyAuthoritative(e: ClaimEnvelope): boolean {
  return e.executiveAuthoritative
    && e.assessmentStatus === 'COMPLETE'
    && e.limitations.length === 0
    && e.evidenceFreshness === 'CURRENT'
    && (e.signalState === 'OBSERVED' || e.signalState === 'KNOWN_ZERO');
}
