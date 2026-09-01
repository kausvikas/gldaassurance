/**
 * Project-scoped assistant tools (**ADR-0029**).
 *
 * Each reaches its data through `ApplicationGateway.request()` with an `entityId`, so the
 * enforcement point's object-level check runs before anything is read: a project outside the
 * caller's resolved set returns the same generic not-found a non-existent project returns, and this
 * file cannot tell the two apart. That is deliberate — code that could distinguish them would be
 * one refactor away from disclosing which.
 *
 * The claims built here are where the phase's semantic obligations become data rather than prose:
 *
 *   - **RAG** carries the final band, the pre-override composite, the deciding mechanism and the
 *     fired override as **four separate claims**, so a rule-forced RED can never be narrated as a
 *     score (§5). On this portfolio every RED is override-forced, so a single-claim design would
 *     have misdescribed all 47.
 *   - **Margin** returns bridge causes and `MET-FIN-041` coverage from **one tool**, because a
 *     consumer able to fetch causes without coverage will quote the waterfall as the explanation
 *     (DR-062, ADR-0029). The residual is claimed as *unattributed*, never as opportunity.
 *   - **Late detection** carries `executiveAuthoritative: false` into the envelope, so CS-1 fires
 *     and the figure can be reported but never concluded from (DR-059).
 *   - **Recovery** claims each rung of the ladder separately and carries each action's
 *     `counted` / `notCountedReason`, which is the compatibility and exclusivity the engine already
 *     computed. Nothing here re-derives it.
 */
import type { MaterialClaim, ToolResult } from '@contexts/ai-intelligence';
import { findMetric, provenanceLayerOf } from '@contexts/rules';
import { LIMITATIONS_FOR } from './envelope.js';
import {
  type ToolContext, ToolDenied, claim, list, projectView, refsFrom, str, sub,
} from './tools.js';

const MAX_ROWS = 12;

/** `AssessmentStatus` from a coverage block, defaulting conservatively (ADR-0031 D-3). */
function statusOf(row: Record<string, unknown> | undefined): 'COMPLETE' | 'PROVISIONAL' | 'NOT_COMPUTABLE' {
  const s = str(row, 'status');
  return s === 'COMPLETE' || s === 'PROVISIONAL' || s === 'NOT_COMPUTABLE' ? s : 'PROVISIONAL';
}

/**
 * The governed sentence for each epistemic state.
 *
 * These are not paraphrases. Each says the one thing its state means and refuses the adjacent
 * reading that would be wrong: **no records is not zero, zero is an observation, unknown is an
 * epistemic state, not applicable is not unknown, and a configuration error is not a project
 * defect** (`PHASE_0_10_SEMANTIC_CLOSURE.md` §2).
 */
export function inputStateSentence(
  label: string, state: string, reasonCode: string | null, observed: string | null,
): string {
  switch (state) {
    case 'KNOWN_ZERO':
      return `${label} is a governed known zero: the source reported and the answer is zero. This is an observation, not missing data.`;
    case 'NOT_APPLICABLE':
      return `${label} does not apply to this project${reasonCode === null ? '' : ` (${reasonCode})`}. That is different from unmeasured and different from clear.`;
    case 'NOT_COMPUTABLE':
      return `${label} could not be computed${reasonCode === null ? '' : ` (${reasonCode})`}: the evidence it needs is unavailable. It is not zero and it is not a clean result.`;
    case 'UNBOUNDED':
      return `${label} is unbounded - the strongest adverse reading available, not an absence. Observed value: ${observed ?? 'no finite value'}.`;
    case 'CONFIGURATION_ERROR':
      return `${label} could not be evaluated because a control is misconfigured. This is a platform defect, not a project finding.`;
    default:
      return `${label} is ${observed ?? 'not stated'}.`;
  }
}

// ---------------------------------------------------------------------------
// Project executive health — §5, the RAG explanation.
// ---------------------------------------------------------------------------

export async function executiveHealth(tc: ToolContext, projectId: string | undefined): Promise<ToolResult> {
  const row = await projectView(tc, 'project.executiveHealth', projectId);
  const id = str(row, 'header') === null ? (projectId ?? '') : (projectId ?? '');
  const bp = sub(row, 'bandProvenance');
  const coverage = sub(row, 'coverage');
  const assessmentStatus = statusOf(coverage);
  const asOf = tc.asOf;
  const claims: MaterialClaim[] = [];
  const ref = { context: 'health', entityType: 'project', entityId: id };

  const finalRag = str(bp, 'systemAssessedRag') ?? 'not computable';
  const composite = str(bp, 'compositeBand') ?? 'not computable';
  const decidedBy = str(bp, 'decidedBy') ?? 'WEIGHTED_MODEL';
  const fired = list(bp, 'firedOverrides')
    .map((o) => (typeof o === 'string' ? o : String(o)))
    .filter((o) => o !== '');
  const firedIds = (bp?.['firedOverrides'] as unknown[] | undefined ?? [])
    .filter((o): o is string => typeof o === 'string');

  claims.push(claim({
    id: 'rag:final',
    text: `Final System RAG is ${finalRag}.`,
    display: finalRag, metricId: 'MET-HLTH-011', layer: 'L3',
    entityType: 'project', entityId: id, asOf, sourceDomain: 'health',
    refs: [ref], signalState: 'OBSERVED',
    overrides: { assessmentStatus, executiveAuthoritative: assessmentStatus === 'COMPLETE' },
  }));
  claims.push(claim({
    id: 'rag:composite',
    text: `Pre-override composite band is ${composite}.`,
    display: composite, metricId: 'MET-HLTH-010', layer: 'L3',
    entityType: 'project', entityId: id, asOf, sourceDomain: 'health',
    refs: [ref], signalState: 'OBSERVED',
    overrides: { assessmentStatus },
  }));
  /*
   * **`decidedBy` and `firedOverrides` are two different facts and both must be stated.**
   *
   * A project can have a RED composite *and* fired overrides: the weighted model reached RED on its
   * own, so `decidedBy` is `WEIGHTED_MODEL`, while three hard overrides also fired and would have
   * forced RED regardless. An earlier draft of this claim read "no hard override fired" whenever
   * `decidedBy` was `WEIGHTED_MODEL`, which was flatly false on exactly that shape - the first
   * project it was run against had three.
   */
  claims.push(claim({
    id: 'rag:mechanism',
    text: decidedBy === 'POLICY_OVERRIDE'
      ? 'The band was forced by policy override. The weighted model alone did not produce it.'
      : firedIds.length > 0
        ? `The weighted model reached this band on its own; ${String(firedIds.length)} hard overrides also fired and would have forced it regardless.`
        : 'The band was produced by the weighted model. No hard override fired.',
    display: decidedBy, metricId: null, layer: 'L3',
    entityType: 'project', entityId: id, asOf, sourceDomain: 'health',
    refs: [ref], signalState: 'OBSERVED',
    overrides: { assessmentStatus, executiveAuthoritative: true },
  }));
  for (const ruleId of firedIds.slice(0, MAX_ROWS)) {
    claims.push(claim({
      id: `rag:override:${ruleId}`,
      text: `Override ${ruleId} fired.`,
      display: ruleId, metricId: null, ruleId, layer: 'L3',
      entityType: 'project', entityId: id, asOf, sourceDomain: 'rules',
      refs: [{ context: 'rules', entityType: 'rule', entityId: ruleId }],
      signalState: 'OBSERVED',
      overrides: { assessmentStatus },
    }));
  }
  // Control completeness over APPLICABLE rules — 7/7, never 7/8 (ADR-0026 D-4).
  const applicable = str(bp, 'applicableControlsEvaluated');
  if (applicable !== null) {
    claims.push(claim({
      id: 'rag:controls',
      text: `Applicable Red-forcing controls evaluated: ${applicable}.`,
      display: applicable, metricId: null, layer: 'L3',
      entityType: 'project', entityId: id, asOf, sourceDomain: 'rules',
      refs: [ref], signalState: 'OBSERVED',
      overrides: { assessmentStatus, executiveAuthoritative: true },
    }));
  }
  for (const d of list(row, 'dimensions').slice(0, MAX_ROWS)) {
    const label = str(d, 'name') ?? str(d, 'label') ?? '';
    const value = str(d, 'score') ?? 'not computable';
    claims.push(claim({
      id: `dim:${str(d, 'id') ?? label}`,
      text: d['computable'] === false
        ? `${label} dimension could not be scored: ${str(d, 'notComputableReason') ?? 'reason not stated'}.`
        : `${label} dimension scores ${value}.`,
      display: value, metricId: str(d, 'metricId'), layer: 'L3',
      entityType: 'project', entityId: id, asOf, sourceDomain: 'health',
      refs: refsFrom(sub(d, 'evidence'), id),
      signalState: d['computable'] === false ? 'NOT_COMPUTABLE' : 'OBSERVED',
      overrides: { assessmentStatus },
    }));
    /*
     * One claim per **governed input state**, not per display string.
     *
     * The DTO now carries `state` from the health engine (ADR-0028 D-1, surfaced at Phase 11C).
     * Before that, `KNOWN_ZERO`, `NOT_APPLICABLE`, `UNBOUNDED` and `CONFIGURATION_ERROR` were all
     * indistinguishable from `NOT_COMPUTABLE` here, because the only evidence was the words
     * "not supplied" inside `observed` - the exact flattening the algebra exists to prevent.
     * Only non-`OBSERVED` states are claimed: an observed input is already carried by its
     * dimension score, and claiming all ten would bury the adverse ones.
     */
    for (const i of list(d, 'inputs')) {
      const state = str(i, 'state');
      if (state === null || state === 'OBSERVED') continue;
      claims.push(claim({
        id: `input:${str(i, 'metricId') ?? str(i, 'label') ?? ''}`,
        text: inputStateSentence(
          str(i, 'label') ?? 'An input', state, str(i, 'reasonCode'), str(i, 'observed'),
        ),
        display: str(i, 'observed'), metricId: str(i, 'metricId'), layer: 'L2',
        entityType: 'project', entityId: id, asOf, sourceDomain: 'health',
        refs: refsFrom(sub(d, 'evidence'), id),
        signalState: state as MaterialClaim['envelope']['signalState'],
        overrides: {
          assessmentStatus,
          // A MATERIAL input in a non-observed state is what costs the assessment COMPLETE.
          executiveAuthoritative: false,
        },
      }));
    }
  }
  // Reported RAG is the delivery line's act. Claimed separately and NEVER derived (§5.4).
  const conflict = sub(row, 'statusConflict');
  const reported = str(conflict, 'reportedRag') ?? str(sub(row, 'header'), 'reportedRag');
  if (reported !== null) {
    claims.push(claim({
      id: 'rag:reported',
      text: `Reported RAG, as declared by the delivery line, is ${reported}.`,
      display: reported, metricId: null, layer: 'L1',
      entityType: 'project', entityId: id, asOf, sourceDomain: 'health',
      refs: [ref], signalState: 'OBSERVED',
      overrides: { executiveAuthoritative: true, assessmentStatus: 'COMPLETE', evidenceFreshness: 'CURRENT' },
    }));
  }
  claims.push(...burnClaims(tc, row, id));
  claims.push(...scopeClaims(tc, row, id));
  return { tool: 'project.executiveHealth.get', claims, untrustedContent: [] };
}

// ---------------------------------------------------------------------------
// Burn / progress and scope leakage.
//
// These are **projections of the same view**, not separate tools: one authorization, one shaping,
// one set of claims, and the intent selects which prefix it speaks about (ADR-0029 - one tool maps
// to exactly one ViewId, so a second tool over the same view would be a second name for one door).
// ---------------------------------------------------------------------------

function burnClaims(tc: ToolContext, row: Record<string, unknown>, id: string): readonly MaterialClaim[] {
  const pb = sub(row, 'progressBurn');
  const status = statusOf(sub(row, 'coverage'));
  const refs = refsFrom(sub(pb, 'evidence'), id);
  const lines: readonly (readonly [string, string, string | null])[] = [
    ['Planned completion', str(pb, 'plannedCompletion') ?? 'not computable', 'MET-DEL-001'],
    ['Actual physical completion', str(pb, 'actualCompletion') ?? 'not computable', 'MET-DEL-002'],
    ['Cost consumed', str(pb, 'costConsumed') ?? 'not computable', 'MET-FIN-004'],
    ['Progress variance', str(pb, 'progressVariance') ?? 'not computable', 'MET-DEL-003'],
    ['Burn gap', str(pb, 'burnGap') ?? 'not computable', 'MET-FIN-013'],
  ];
  return lines.map(([label, value, metricId]) => claim({
    id: `burn:${label}`,
    text: `${label} is ${value}.`,
    display: value, metricId, layer: 'L2',
    entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'delivery',
    refs, signalState: value === 'not computable' ? 'NOT_COMPUTABLE' : 'OBSERVED',
    overrides: { assessmentStatus: status, executiveAuthoritative: value !== 'not computable' },
  }));
}

function scopeClaims(tc: ToolContext, row: Record<string, unknown>, id: string): readonly MaterialClaim[] {
  const status = statusOf(sub(row, 'coverage'));
  return list(row, 'scopeCommercial').slice(0, MAX_ROWS).map((s, i) => {
    const value = str(s, 'value') ?? 'not computable';
    return claim({
      id: `scope:${str(s, 'metricId') ?? String(i)}`,
      text: `${str(s, 'label') ?? ''} is ${value}.`,
      display: value, metricId: str(s, 'metricId'), layer: 'L2',
      entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'commercial',
      refs: refsFrom(sub(s, 'evidence'), id),
      signalState: value === 'not computable' ? 'NOT_COMPUTABLE' : 'OBSERVED',
      overrides: { assessmentStatus: status, executiveAuthoritative: value !== 'not computable' },
    });
  });
}

// ---------------------------------------------------------------------------
// Margin drivers — §6. Causes and coverage are inseparable.
// ---------------------------------------------------------------------------

export async function marginDrivers(tc: ToolContext, projectId: string | undefined): Promise<ToolResult> {
  const row = await projectView(tc, 'project.marginIntelligence', projectId);
  const id = projectId ?? '';
  const bridge = sub(row, 'bridge');
  if (bridge === undefined) throw new ToolDenied();
  const refs = refsFrom(sub(bridge, 'evidence'), id);
  const coverage = str(bridge, 'explanatoryCoverage');
  const claims: MaterialClaim[] = [];

  claims.push(claim({
    id: 'margin:movement',
    text: `Gross margin moved ${str(bridge, 'totalDelta') ?? 'not computable'} from ${str(bridge, 'opening') ?? '?'} to ${str(bridge, 'closing') ?? '?'}.`,
    display: str(bridge, 'totalDelta'), metricId: 'MET-FIN-018', layer: 'L2',
    entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'financial',
    refs, signalState: 'OBSERVED',
    overrides: { evidenceCoverage: coverage, assessmentStatus: 'COMPLETE' },
  }));

  for (const s of list(bridge, 'steps').slice(0, MAX_ROWS)) {
    const amount = str(s, 'amount') ?? 'not computable';
    const modelled = s['modelled'] === true;
    claims.push(claim({
      id: `margin:cause:${str(s, 'id') ?? ''}`,
      // §4 wording: attribution, not causation. "attributed to", never "caused".
      text: `${str(s, 'label') ?? ''} is attributed ${amount} of the margin movement${modelled ? ', on a modelled basis' : ''}.`,
      display: amount, metricId: str(s, 'metricId'), layer: 'L2',
      entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'financial',
      refs, signalState: 'OBSERVED',
      overrides: {
        evidenceCoverage: coverage,
        assessmentStatus: 'COMPLETE',
        limitations: modelled ? ['DR-058', 'DR-062'] : ['DR-062'],
      },
    }));
  }

  claims.push(claim({
    id: 'margin:coverage',
    text: `The named causes account for ${coverage ?? 'an uncomputable share'} of gross movement (${str(bridge, 'explanatoryCoverageMetricId') ?? 'MET-FIN-041'}). The bridge reconciles by construction, so reconciliation is not evidence of attribution.`,
    display: coverage, metricId: 'MET-FIN-041', layer: 'L2',
    entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'financial',
    refs, signalState: coverage === null ? 'NOT_COMPUTABLE' : 'OBSERVED',
    overrides: { evidenceCoverage: coverage, assessmentStatus: 'COMPLETE' },
  }));

  // The residual is unattributed economics. It is NOT recovery opportunity (§5.3).
  for (const r of list(bridge, 'residualComponents').slice(0, MAX_ROWS)) {
    claims.push(claim({
      id: `margin:residual:${str(r, 'id') ?? ''}`,
      text: `${str(r, 'label') ?? 'Residual'} of ${str(r, 'amount') ?? 'not computable'} is unattributed: no governed cause accounts for it. It is not a recovery opportunity.`,
      display: str(r, 'amount'), metricId: str(r, 'metricId'), layer: 'L2',
      entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'financial',
      refs, signalState: 'OBSERVED',
      overrides: { evidenceCoverage: coverage, assessmentStatus: 'COMPLETE', limitations: ['DR-062'] },
    }));
  }
  return { tool: 'project.marginDrivers.get', claims, untrustedContent: [] };
}

// ---------------------------------------------------------------------------
// Forward risk — §7. No fabricated probabilities. No ungoverned horizon.
// ---------------------------------------------------------------------------

export async function forwardRisk(tc: ToolContext, projectId: string | undefined): Promise<ToolResult> {
  const row = await projectView(tc, 'project.forwardRisk', projectId);
  const id = projectId ?? '';
  const ruleVersion = str(row, 'ruleVersion') ?? 'unknown';
  const outlook = sub(row, 'outlook');
  const refs = refsFrom(sub(row, 'signalsEvidence'), id);
  const claims: MaterialClaim[] = [];

  for (const o of list(outlook, 'rows')) {
    const horizon = str(o, 'horizon') ?? '';
    const band = str(o, 'band');
    const basis = (str(o, 'basis') ?? 'the listed rule signals').replace(/\.+$/, '') + '.';
    claims.push(claim({
      id: `outlook:${horizon}`,
      // §4 wording: a governed outlook, never a prediction.
      // A horizon the catalog does not register is reported as absent, not extrapolated - and it
      // is phrased as an absence rather than as an outlook "derived from" a sentence explaining
      // that no such outlook exists.
      text: band === 'not projected' || band === null
        ? `There is no governed ${horizon} outlook: ${basis}`
        : `The governed ${horizon} outlook is ${band}, derived from ${basis}`,
      display: band, metricId: 'MET-FCST-006', layer: 'L3',
      entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'forecast',
      refs: refsFrom(sub(outlook, 'evidence'), id), signalState: 'OBSERVED',
      overrides: { assessmentStatus: 'COMPLETE', version: ruleVersion },
    }));
  }
  for (const s of list(row, 'signals').slice(0, MAX_ROWS)) {
    const ruleId = str(s, 'ruleId') ?? '';
    claims.push(claim({
      id: `signal:${ruleId}`,
      text: `${str(s, 'name') ?? ruleId} fired: ${str(s, 'metricId') ?? 'the signal'} is ${str(s, 'currentValue') ?? 'not computable'} against ${str(s, 'expectedState') ?? 'its threshold'}. Trend ${str(s, 'trend') ?? 'not computable'}.`,
      display: str(s, 'currentValue'), metricId: str(s, 'metricId'), ruleId, layer: 'L3',
      entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'forecast',
      refs, signalState: 'OBSERVED',
      overrides: { assessmentStatus: 'COMPLETE', version: str(s, 'ruleVersion') ?? ruleVersion },
    }));
  }
  for (const c of list(row, 'notEvaluated').slice(0, MAX_ROWS)) {
    claims.push(claim({
      id: `signal:not-evaluated:${str(c, 'ruleId') ?? ''}`,
      text: `${str(c, 'ruleId') ?? 'A rule'} was not evaluated: ${str(c, 'reason') ?? 'reason not stated'}.`,
      display: null, metricId: null, ruleId: str(c, 'ruleId'), layer: 'L3',
      entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'forecast',
      refs, signalState: 'NOT_COMPUTABLE',
      overrides: { assessmentStatus: 'PROVISIONAL' },
    }));
  }
  return { tool: 'project.forwardRisk.get', claims, untrustedContent: [] };
}

// ---------------------------------------------------------------------------
// Late detection — §8. DR-059 carried all the way to the narrative.
// ---------------------------------------------------------------------------

export async function lateDetection(tc: ToolContext, projectId: string | undefined): Promise<ToolResult> {
  const row = await projectView(tc, 'project.forwardRisk', projectId);
  const id = projectId ?? '';
  const ld = sub(row, 'lateDetection');
  if (ld === undefined) throw new ToolDenied();
  const authoritative = ld['executiveAuthoritative'] === true;
  const rate = str(ld, 'rate') ?? 'not computable';
  const claims: MaterialClaim[] = [claim({
    id: 'late-detection:rate',
    text: `Late detection is ${rate}, reconstructed from ${str(ld, 'reconstructedDimensions') ?? 'a partial replay'}. ${str(ld, 'claimQualification') ?? ''}`.trim(),
    display: rate, metricId: 'MET-FCST-030', layer: 'L3',
    entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'forecast',
    refs: refsFrom(sub(ld, 'evidence'), id),
    signalState: ld['available'] === true ? 'OBSERVED' : 'NOT_COMPUTABLE',
    // executiveAuthoritative false ⇒ CS-1 fires ⇒ the figure may be reported, never concluded from.
    overrides: {
      executiveAuthoritative: authoritative,
      assessmentStatus: 'PROVISIONAL',
      limitations: LIMITATIONS_FOR['MET-FCST-030'] ?? ['DR-059'],
    },
  })];
  claims.push(claim({
    id: 'late-detection:coverage',
    text: `Historical coverage is ${str(ld, 'historicalCoverage') ?? 'unknown'}. Unavailable dimensions: ${str(ld, 'unavailableDimensions') ?? 'not stated'}.`,
    display: str(ld, 'historicalCoverage'), metricId: 'MET-FCST-030', layer: 'L3',
    entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'forecast',
    refs: refsFrom(sub(ld, 'evidence'), id), signalState: 'OBSERVED',
    overrides: { executiveAuthoritative: false, assessmentStatus: 'PROVISIONAL' },
  }));
  return { tool: 'project.lateDetection.get', claims, untrustedContent: [] };
}

// ---------------------------------------------------------------------------
// Recovery — §9. Every rung of the ladder, and never the bridge shortcut.
// ---------------------------------------------------------------------------

export async function recoveryOptions(tc: ToolContext, projectId: string | undefined): Promise<ToolResult> {
  const row = await projectView(tc, 'project.forwardRisk', projectId);
  const id = projectId ?? '';
  const econ = sub(row, 'recoveryEconomics');
  const available = econ?.['available'] === true;
  const refs = refsFrom(sub(econ, 'evidence'), id);
  const claims: MaterialClaim[] = [];

  if (!available) {
    claims.push(claim({
      id: 'recovery:none',
      text: 'No recovery economics are computable for this project: no compatible recovery plan is recorded.',
      display: null, metricId: 'MET-REC-001', layer: 'L3',
      entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'recovery',
      refs, signalState: 'NOT_APPLICABLE',
      overrides: { assessmentStatus: 'NOT_COMPUTABLE' },
    }));
    return { tool: 'project.recoveryOptions.get', claims, untrustedContent: [] };
  }

  // Rung 4a — potential. A scenario BESIDE MET-FIN-024, never replacing it.
  claims.push(claim({
    id: 'recovery:potential',
    text: `Compatible recovery actions carry ${str(econ, 'recoveryCaseGm') ?? 'not computable'} of governed potential GM under the recovery case. This is a scenario beside the forecast, not a replacement for it.`,
    display: str(econ, 'recoveryCaseGm'), metricId: 'MET-REC-001', layer: 'L3',
    entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'recovery',
    refs, signalState: 'OBSERVED',
    overrides: { assessmentStatus: 'COMPLETE' },
  }));
  // Rung 4b — probability/confidence adjusted.
  claims.push(claim({
    id: 'recovery:probability-adjusted',
    text: `Probability-adjusted GM protection is ${str(econ, 'probabilityAdjustedGm') ?? 'not computable'}, at plan credibility ${str(econ, 'planCredibility') ?? 'not stated'}.`,
    display: str(econ, 'probabilityAdjustedGm'), metricId: 'MET-REC-002', layer: 'L3',
    entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'recovery',
    refs, signalState: 'OBSERVED',
    overrides: { assessmentStatus: 'COMPLETE' },
  }));
  // Rung 2 — remaining exposure, stated so it cannot be confused with the historical driver.
  claims.push(claim({
    id: 'recovery:exposure',
    text: `Risk-adjusted GM today is ${str(econ, 'riskAdjustedGm') ?? 'not computable'} against a current forecast of ${str(econ, 'currentForecastGm') ?? 'not computable'}.`,
    display: str(econ, 'riskAdjustedGm'), metricId: 'MET-FIN-032', layer: 'L2',
    entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'financial',
    refs, signalState: 'OBSERVED',
    overrides: { assessmentStatus: 'COMPLETE', executiveAuthoritative: true },
  }));

  for (const a of list(row, 'recoveryActions').slice(0, MAX_ROWS)) {
    const counted = a['counted'] === true;
    const status = str(a, 'status') ?? 'unknown';
    claims.push(claim({
      id: `recovery:action:${str(a, 'id') ?? ''}`,
      text: counted
        ? `${str(a, 'recommendedAction') ?? 'Action'} — status ${status}, ${str(a, 'gmBenefit') ?? 'no stated'} GM benefit at ${str(a, 'confidence') ?? 'unstated'} confidence. Counted in the recovery case.`
        : `${str(a, 'recommendedAction') ?? 'Action'} — status ${status}. **Not counted**: ${str(a, 'notCountedReason') ?? 'incompatible with a counted action'}.`,
      display: str(a, 'gmBenefit'), metricId: 'MET-REC-003', layer: 'L3',
      entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'recovery',
      refs, signalState: counted ? 'OBSERVED' : 'NOT_APPLICABLE',
      overrides: { assessmentStatus: 'COMPLETE' },
    }));
  }
  return { tool: 'project.recoveryOptions.get', claims, untrustedContent: [] };
}

// ---------------------------------------------------------------------------
// Evidence and metric definitions.
// ---------------------------------------------------------------------------

export async function evidence(tc: ToolContext, projectId: string | undefined): Promise<ToolResult> {
  const row = await projectView(tc, 'project.lineage', projectId);
  const id = projectId ?? '';
  const claims: MaterialClaim[] = list(row, 'metrics').slice(0, MAX_ROWS).map((m, i) => {
    const freshness = str(m, 'freshness');
    return claim({
      id: `evidence:${str(m, 'metricId') ?? String(i)}`,
      text: `${str(m, 'metricId') ?? 'Metric'} rests on ${String(list(m, 'sources').length)} source observations; freshness ${freshness ?? 'unknown'}.`,
      display: freshness, metricId: str(m, 'metricId'), layer: 'L1',
      entityType: 'project', entityId: id, asOf: tc.asOf, sourceDomain: 'data-quality',
      refs: [{ context: 'lineage', entityType: 'project', entityId: id }],
      signalState: 'OBSERVED',
      overrides: {
        assessmentStatus: 'COMPLETE',
        evidenceFreshness: freshness === 'CURRENT' ? 'CURRENT' : freshness === 'STALE' ? 'STALE' : 'UNKNOWN',
        executiveAuthoritative: true,
      },
    });
  });
  if (claims.length === 0) throw new ToolDenied();
  return { tool: 'evidence.get', claims, untrustedContent: [] };
}

/**
 * Registry metadata. **No project data, no scope, no evaluation** - this returns a *definition*, so
 * a fabricated metric id fails here rather than being narrated (T-AI-06).
 *
 * ## Deviation from ADR-0029 D-7, recorded rather than hidden
 *
 * ADR-0029 D-7 said this tool would reach a new `metric.definition` ViewId through the gateway.
 * **It does not**, and the reason is structural: `EnforcementPoint` performs its object-level check
 * as `entitySet.projectIds.includes(entityId)`. A metric id is not a project id, so routing one
 * through that check would deny every request - or require weakening the check so it skips
 * non-project entities, which is a change to the control that makes BOLA structurally impossible.
 *
 * Trading a real authorization control for architectural tidiness on a `PUBLIC_INTERNAL` governance
 * lookup is the wrong side of that trade. The tool is still gated: `assistant.use` is checked at
 * step 3 of the orchestrator, before any tool runs, and this returns registry text that already
 * ships in `METRIC_CATALOG.md`. Carried as **DR-074**.
 */
export function metricDefinition(tc: ToolContext, metricId: string | undefined): ToolResult {
  if (metricId === undefined) throw new ToolDenied();
  const m = findMetric(metricId);
  if (m === undefined) throw new ToolDenied();
  const calibrated = (m.calibrationParameters ?? []).length > 0;
  const claims: MaterialClaim[] = [claim({
    id: `metric:${m.id}`,
    text: `${m.id} — ${m.name}. ${m.businessDefinition} Formula: ${m.formula}. Unit ${m.unit}; owner ${m.owner}; source domain ${m.sourceDomain}; version ${m.version}; status ${m.status}.`,
    // The single mapping from registry level to provenance layer already exists. Reuse it.
    display: m.version, metricId: m.id, layer: provenanceLayerOf(m.epistemicLevel),
    entityType: 'metric', entityId: m.id, asOf: tc.asOf, sourceDomain: m.sourceDomain,
    refs: [{ context: 'rules', entityType: 'metric', entityId: m.id, metricId: m.id }],
    signalState: 'OBSERVED',
    overrides: {
      version: m.version,
      assessmentStatus: 'COMPLETE',
      executiveAuthoritative: true,
      evidenceFreshness: 'CURRENT',
      limitations: calibrated ? ['DR-055', 'DR-061'] : (LIMITATIONS_FOR[m.id] ?? []),
    },
  })];
  return { tool: 'metric.definition.get', claims, untrustedContent: [] };
}

export const PROJECT_TOOL_STATE: string =
  'Project tools project over project.executiveHealth, project.marginIntelligence, '
  + 'project.forwardRisk and project.lineage. No tool reaches a service directly.';
