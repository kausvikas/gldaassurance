/**
 * Definition change history.
 *
 * `METRIC_CATALOG.md` §1.3 permits a `Draft` definition to change in Phase 2 — that is what Phase 2
 * is for. Global invariant 3 forbids changing one *silently*. This file is the difference: every
 * Phase 2 departure from the Phase 0 wording is recorded with its reason.
 */
import { calendarDate } from '@platform/time';
import { type MetricVersionRecord, metricId } from '../metric-types.js';

const PHASE_0 = calendarDate('2026-08-29');
const PHASE_2 = calendarDate('2026-08-31');
const PHASE_2_CLOSURE = calendarDate('2026-08-31');

export const METRIC_VERSION_HISTORY: readonly MetricVersionRecord[] = [
  {
    metricId: metricId('MET-QUA-003'), version: '1.0.0', effectiveFrom: PHASE_0,
    formula: 'escaped defects / all defects',
    changeReason: 'Phase 0 baseline. An empty defect population was NOT_COMPUTABLE, without asking why it was empty.',
  },
  {
    metricId: metricId('MET-QUA-003'), version: '2.0.0', effectiveFrom: PHASE_2_CLOSURE,
    supersedes: '1.0.0',
    formula: 'escaped defects / all defects, with KNOWN_ZERO where a reporting source observes none and NOT_COMPUTABLE where the source is absent or stale',
    changeReason:
      'ADR-0028. `defects.length === 0` covered two opposite realities -- a source reporting zero ' +
      'escaped defects, and no defect telemetry at all -- and the health model dropped the ' +
      'resulting null and renormalised Product & Quality upward. A dead feed therefore read as ' +
      'excellent quality and turned an AMBER project GREEN while still reporting COMPLETE. Major ' +
      'bump because the empty-population result changes meaning.',
  },
  {
    metricId: metricId('MET-DEL-018'), version: '1.0.0', effectiveFrom: PHASE_0,
    formula: 'MET-DEL-020 / MET-DEL-019',
    changeReason: 'Phase 0 baseline. A zero denominator returned NOT_COMPUTABLE without asking why it was zero.',
  },
  {
    metricId: metricId('MET-DEL-018'), version: '2.0.0', effectiveFrom: PHASE_2_CLOSURE,
    supersedes: '1.0.0',
    formula: 'MET-DEL-020 / MET-DEL-019, with an explicit UNBOUNDED state where MET-DEL-019 is an observed zero and MET-DEL-020 > 0',
    changeReason:
      'ADR-0027. An observed zero demonstrated velocity is DATA, not absence, and returning ' +
      'NOT_COMPUTABLE for it let a stalled project drop out of the Delivery dimension: the ' +
      'remaining inputs renormalised upward, Delivery scored 100.00, and a Fixed-Bid project with ' +
      'zero progress across the whole 8-week window, 40% complete and 200 days remaining, was ' +
      'assessed GREEN with a COMPLETE four-dimension assessment. The metric now distinguishes ' +
      'UNKNOWN (NOT_COMPUTABLE) from OBSERVED ZERO WITH WORK REMAINING (UNBOUNDED). Major bump ' +
      'because the zero-denominator result changes meaning.',
  },
  {
    metricId: metricId('MET-RES-002'), version: '1.0.0', effectiveFrom: PHASE_0,
    formula: 'actual hours − planned hours (named baseline)',
    changeReason:
      'Phase 0 baseline. The formula deliberately defers the baseline rather than fixing it, so ' +
      'naming one is an implementation decision and not a formula change.',
  },
  {
    metricId: metricId('MET-RES-002'), version: '2.0.0', effectiveFrom: PHASE_2_CLOSURE,
    supersedes: '1.0.0',
    formula: 'actual hours − (contract:baseline.plannedEffortHours × physical completion at t)',
    changeReason:
      'ADR-0024. The named baseline is EARNED effort, not scheduled effort. Time-phasing the ' +
      'priced plan by planned completion asks whether the planned hours have been spent, so a ' +
      'project running late books an effort underrun for work it has not performed — which the ' +
      'margin bridge then values at the sold rate and reports as margin gained. On the demo ' +
      'portfolio that produced $63.31M of phantom credit across 48 behind-schedule projects and ' +
      'left the effort cause net POSITIVE ($48.75M) on a portfolio losing $79.72M. Major bump ' +
      'because the value changes on 74 of 75 projects and is not comparable across the change.',
  },
  {
    metricId: metricId('MET-FIN-008'), version: '1.0.0', effectiveFrom: PHASE_0,
    formula: 'MET-FIN-005 + MET-FIN-007',
    changeReason: 'Phase 0 baseline: cost to date plus estimate to complete.',
  },
  {
    metricId: metricId('MET-FIN-008'), version: '2.0.0', effectiveFrom: PHASE_2, supersedes: '1.0.0',
    formula: 'MET-FIN-005 + MET-FIN-007 + MET-FIN-023',
    changeReason:
      'Phase 2 brief defines EAC as Actual Cost + Bottom-Up ETC + Committed Future Cost. ' +
      'Committed cost is contractually fixed but not yet incurred, and is not part of a bottom-up ' +
      'estimate; omitting it understates EAC and therefore overstates forecast margin. Major bump ' +
      'because every dependent value changes.',
  },
  {
    metricId: metricId('MET-FIN-019'), version: '1.0.0', effectiveFrom: PHASE_0,
    formula: 'max(0, contracted margin at risk) per rule set VAR-v1',
    changeReason: 'Phase 0 placeholder. VAR-v1 was undefined (MC-4).',
  },
  {
    metricId: metricId('MET-FIN-019'), version: '2.0.0', effectiveFrom: PHASE_2, supersedes: '1.0.0',
    formula: 'max(0, MET-FIN-026 − MET-FIN-032)',
    changeReason:
      'Phase 2 brief defines GM Value at Risk as Sold GM $ − Risk-Adjusted GM $. Resolves MC-4. ' +
      'The max(0, …) clamp and the cap at MET-FIN-002 are retained from the Phase 0 definition so ' +
      'the TEST_STRATEGY §3.3 property (VaR never exceeds contract value) still holds.',
  },
  {
    metricId: metricId('MET-FIN-009'), version: '1.0.0', effectiveFrom: PHASE_0,
    formula: 'MET-FIN-002 × MET-FIN-006 (percent-complete candidate)',
    changeReason: 'Phase 0 placeholder. Treated recognised revenue as something Delivery Intelligence would compute, pending OQ-2.',
  },
  {
    metricId: metricId('MET-FIN-009'), version: '2.0.0', effectiveFrom: PHASE_2_CLOSURE, supersedes: '1.0.0',
    formula: 'FinanceSystem.recognisedRevenueToDate (imported fact)',
    changeReason:
      'OQ-2 CLOSED. Recognised revenue is an authoritative Finance/ERP accounting fact governed by corporate ' +
      'accounting policy, not a Delivery Intelligence economic calculation. The metric changes epistemic level ' +
      'from L2_DERIVED to L1_OBSERVED and its authority from DERIVED to FINANCE_SYSTEM. Major bump because the ' +
      'meaning, not merely the arithmetic, has changed.',
  },
  {
    metricId: metricId('MET-FIN-006'), version: '2.0.0', effectiveFrom: PHASE_2_CLOSURE, supersedes: '1.0.0',
    formula: 'MET-FIN-005 / MET-FIN-008',
    changeReason:
      'Renamed "Percent Complete (cost-to-cost)" to "Cost Progress Ratio (cost-to-cost)". The arithmetic is ' +
      'unchanged; the name invited confusion with an accounting revenue-recognition method, which it is not. ' +
      'Unblocked by the OQ-2 closure — it is now a progress diagnostic with no recognition role.',
  },
  {
    metricId: metricId('MET-HLTH-004'), version: '2.0.0', effectiveFrom: PHASE_2_CLOSURE, supersedes: '1.0.0',
    formula: 'weighted normalised score over MET-QUA-003, MET-QUA-006, MET-QUA-009, MET-QUA-010',
    changeReason:
      'Replaced MET-QUA-002 defect density with MET-QUA-010 acceptance blockers. Defect density requires a scope ' +
      'unit that MC-8 leaves undefined, which would have kept the whole health tree Draft on a Type A gap in a ' +
      'single input. Acceptance blockers are directly observed, unblocked, and in fixed-bid are the quality ' +
      'signal that actually gates revenue.',
  },
  {
    metricId: metricId('MET-PORT-006'), version: '2.0.0', effectiveFrom: PHASE_2_CLOSURE, supersedes: '1.0.0',
    formula: 'count(projects WHERE MET-FCST-002)',
    changeReason:
      'Reclassified L2_DERIVED to L3_ASSESSED. The arithmetic is unchanged; counting inferred flags produces an ' +
      'inferred count, and a Frozen L2 metric may not rest on an L3 input.',
  },
  {
    metricId: metricId('MET-DQ-007'), version: '2.0.0', effectiveFrom: PHASE_2_CLOSURE, supersedes: '1.0.0',
    formula: 'weighted composite of MET-DEL-014, MET-FIN-030, MET-DEL-013 per DQ-v1',
    changeReason:
      'Reclassified L2_DERIVED to L3_ASSESSED per Phase 2 closure Decision 6, which names Forecast Confidence as ' +
      'an assessment. Deterministic implementation, but the value is a judgement about whether this team\'s ' +
      'estimates can be relied on.',
  },
  ...(['MET-HLTH-011', 'MET-HLTH-013', 'MET-HLTH-030', 'MET-HLTH-031'] as const).map((id) => ({
    metricId: metricId(id), version: '2.0.0' as const, effectiveFrom: PHASE_2_CLOSURE, supersedes: '1.0.0' as const,
    formula: 'unchanged',
    changeReason:
      'ADR-0014 ACCEPTED (resolves C-6). Reclassified L2_DERIVED to L3_ASSESSED. The arithmetic is ' +
      'unchanged; the semantic claim is not. Banding a score into a verdict, and comparing that ' +
      'verdict with a declaration, are judgements about project state. Epistemic level describes ' +
      'meaning, not implementation technique — a deterministic rule does not make a verdict L2.',
  })),
  ...(['MET-PORT-004', 'MET-PORT-005'] as const).map((id) => ({
    metricId: metricId(id), version: '2.0.0' as const, effectiveFrom: PHASE_2_CLOSURE, supersedes: '1.0.0' as const,
    formula: 'unchanged',
    changeReason:
      'ADR-0014 consequence. These aggregate MET-HLTH-011 and MET-HLTH-030, which are now ' +
      'L3_ASSESSED; counting or distributing assessments produces an assessment, and the ' +
      'dependency-purity rule forbids an L2 metric resting on an L3 input.',
  })),
];

/** Metrics whose Phase 0 `Draft` wording was refined in Phase 2 without a version bump. */
export const PHASE_2_DEFINITION_REFINEMENTS: readonly { id: string; change: string }[] = [
  { id: 'MET-FIN-002', change: 'Renamed "Contract Value (Current Contractual)" to "Contractual Revenue (Current Contractual)" and the definition restated in entitlement terms (Phase 2 closure, Decision 2A). Formula unchanged.' },
  { id: 'MET-FIN-010', change: 'Definition restated as revenue expected to be contractually earned by completion, and explicitly distinguished from accounting recognised revenue. Formula unchanged.' },
  { id: 'MET-FIN-015', change: 'Unblocked by the OQ-2 closure. Now an accounting-derived margin view, explicitly distinct from the forward-looking MET-FIN-014.' },
  { id: 'MET-FIN-029', change: 'Wording tightened to "an extrapolative diagnostic comparing actual cost incurred with independently measured physical completion" and explicitly separated from cost-to-cost revenue recognition (Decision 3). Formula unchanged.' },
  { id: 'MET-COM-001', change: 'Definition states plainly that billing is not revenue (Decision 2D).' },
  { id: 'MET-COM-002', change: 'Definition states plainly that cash collection is neither revenue nor billing (Decision 2E).' },
  { id: 'MET-COM-006', change: 'Unblocked by the OQ-2 closure; both sides are now Finance facts.' },
  { id: 'MET-HLTH-001…006', change: 'Normalisation mechanism made explicit (piecewise-linear against rule-defined edges, weighted, clamped) so the semantic contract is complete while edges and weights remain calibration.' },
  { id: 'MET-HLTH-011', change: 'Banding mechanism and critical-breach override precedence made explicit; band edges moved to HEALTH-v1 parameters.' },
  { id: 'MET-FCST-010', change: 'Composite made explicit (four normalised components, weighted, clamped) rather than "composite per TRAJECTORY-v1".' },
  { id: 'MET-PORT-003', change: 'Phase 2 made the de-duplication rule explicit (a shared risk cause counted once, at its largest single-project exposure). That reading was WITHDRAWN at the pre-Phase-11 closure — see the v2.0.0 record in METRIC_VERSION_HISTORY and ADR-0023.' },
  { id: 'MET-DEL-002', change: 'Earned Value now uses MET-DEL-016 physical completion rather than scope units, so it is not blocked by MC-8.' },
  { id: 'MET-FIN-010', change: 'Formula stated as MET-FIN-002 directly. Phase 0 wording "MET-FIN-002 + executed-only adjustments" was circular: executed adjustments are already inside MET-FIN-002.' },
  { id: 'MET-FIN-014', change: 'Restated as MET-FIN-024 / MET-FIN-010 so Forecast GM $ has a metric ID of its own rather than being an unnamed intermediate.' },
  { id: 'MET-FIN-012', change: 'Restated as MET-FIN-026 / MET-FIN-001 for the same reason.' },
  { id: 'MET-RSK-001', change: 'Renamed "Risk Exposure (gross)" to distinguish it from MET-RSK-008 Incremental Risk Exposure. Formula unchanged.' },
  { id: 'MET-QUA-009', change: 'Trailing window stated as 8 weekly snapshots, matching the snapshot cadence (ADR-0003 §3). Phase 0 said "8 periods" without naming the period.' },
];
