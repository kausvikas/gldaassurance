/** Health, forecast, data-quality and portfolio metric definitions. */
import { type MetricDefinition } from '../metric-types.js';
import { ALL_CONTRACT_TYPES, EDGE, def } from './define.js';

const hl = { sourceDomain: 'health', owner: 'Delivery Intelligence', applicableContractTypes: ALL_CONTRACT_TYPES, status: 'Frozen', version: '1.0.0' } as const;
const fc = { sourceDomain: 'forecast', owner: 'Delivery Intelligence', applicableContractTypes: ALL_CONTRACT_TYPES, status: 'Frozen', version: '1.0.0' } as const;
const dq = { sourceDomain: 'data-quality', owner: 'Assurance', applicableContractTypes: ALL_CONTRACT_TYPES, status: 'Frozen', version: '1.0.0' } as const;
const po = { sourceDomain: 'portfolio', owner: 'Delivery Intelligence', applicableContractTypes: ALL_CONTRACT_TYPES, status: 'Frozen', version: '1.0.0' } as const;

/**
 * All six dimension scores share one mechanism, so they share one definition here.
 *
 * `normalise(v, greenEdge, redEdge)` is piecewise-linear: 1 at or beyond the green edge, 0 at or
 * beyond the red edge, linear between, clamped to [0, 1]. The mechanism is the semantic contract
 * and is frozen; the edge values and the weights are calibration and live in `HEALTH-v1`.
 */
const dimension = (id: string, name: string, from: string[], note: string): MetricDefinition =>
  def({
    ...hl, id, name, epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED', businessDefinition: note,
    formula:
      `100 × Σᵢ (wᵢ × normalise(mᵢ, greenEdgeᵢ, redEdgeᵢ)) / Σᵢ wᵢ over [${from.join(', ')}], ` +
      'where normalise is piecewise-linear and clamped to [0,1]',
    inputs: from, unit: 'Score', aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'NONE',
    edgeHandling: { zeroDenominator: 'NOT_COMPUTABLE', missingInput: 'NOT_COMPUTABLE', minimumHistoryWeeks: 0 },
    status: 'Frozen', ruleSet: 'HEALTH-v1',
    calibrationParameters: from.flatMap((f) => [`${f}.greenEdge`, `${f}.redEdge`, `${f}.weight`]),
    evidenceExpectations: [
      'Each contributing metric value',
      'The HEALTH-v1 edge and weight parameters in force, by version',
    ],
    notes: 'Frozen in Phase 2 closure (Decision 8, Type B): the normalisation and weighting mechanism is settled, so the metric means something definite. The edge values and weights remain open calibration (MC-3, OQ-4/MC-2) and live in HEALTH-v1 as versioned parameters — changing one changes the number, not the meaning.',
  });

export const HEALTH_METRICS: readonly MetricDefinition[] = [
  dimension('MET-HLTH-001', 'Financial Health Dimension', ['MET-FIN-014', 'MET-FIN-016', 'MET-DEL-004', 'MET-FIN-021'],
    'How the project\'s economics are performing against what was sold.'),
  dimension('MET-HLTH-002', 'Schedule Health Dimension', ['MET-DEL-005', 'MET-DEL-009', 'MET-DEL-010', 'MET-DEL-011'],
    'Whether the project will deliver by the committed date.'),
  dimension('MET-HLTH-003', 'Scope & Commercial Dimension', ['MET-COM-007', 'MET-COM-008', 'MET-COM-009', 'MET-FIN-011'],
    'Whether scope growth is being commercially recovered.'),
  dimension('MET-HLTH-004', 'Quality Health Dimension', ['MET-QUA-003', 'MET-QUA-006', 'MET-QUA-009', 'MET-QUA-010'],
    'Whether engineering quality is sustaining delivery or eroding it.'),
  dimension('MET-HLTH-005', 'Resource Health Dimension', ['MET-RES-004', 'MET-RES-006', 'MET-RES-007', 'MET-RES-008'],
    'Whether the team shape and stability can deliver the remaining work.'),
  dimension('MET-HLTH-006', 'Risk Health Dimension', ['MET-RSK-001', 'MET-RSK-002', 'MET-RSK-004', 'MET-RSK-005'],
    'Whether known risk is being actively managed.'),
  def({ ...hl, id: 'MET-HLTH-010', name: 'Composite Health Score', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'A single 0-100 score combining the six health dimensions under sponsor-approved weights.',
    formula: 'Σᵈ (MET-HLTH-00d × dimensionWeightᵈ) / Σᵈ dimensionWeightᵈ, d = 1…6, per HealthModelVersion',
    inputs: ['MET-HLTH-001', 'MET-HLTH-002', 'MET-HLTH-003', 'MET-HLTH-004', 'MET-HLTH-005', 'MET-HLTH-006'],
    unit: 'Score', aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'NONE', edgeHandling: EDGE.ratio,
    ruleSet: 'HEALTH-v1',
    calibrationParameters: ['dimensionWeight.FINANCIAL', 'dimensionWeight.SCHEDULE', 'dimensionWeight.SCOPE_COMMERCIAL', 'dimensionWeight.QUALITY', 'dimensionWeight.RESOURCE', 'dimensionWeight.RISK'],
    evidenceExpectations: ['All six dimension scores', 'The HealthModelVersion weights in force', 'Rule version stamp'],
    notes: 'Frozen in Phase 2 closure (Decision 8, Type B). Bounded 0-100 and monotonic in each dimension — both property-tested in Phase 4. The six weights are open calibration (OQ-4/MC-2) and are versioned in HealthModelVersion. **L2_DERIVED**: the score is a mathematical output over observed facts. The epistemic boundary falls immediately after it — banding this score into a verdict (MET-HLTH-011) is a judgement and is L3_ASSESSED (ADR-0014).' }),
  def({ ...hl, id: 'MET-HLTH-011', name: 'System-Assessed RAG', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE', version: '2.0.0',
    businessDefinition: 'The status the evidence supports, independent of what was reported.',
    formula: 'RED if any criticalBreachTrigger fires, else RED if MET-HLTH-010 < redThreshold, else AMBER if < amberThreshold, else GREEN',
    inputs: ['MET-HLTH-010'], unit: 'RAG', aggregation: 'DISTRIBUTION', currencyBehaviour: 'NONE',
    edgeHandling: EDGE.noDenominator, ruleSet: 'HEALTH-v1',
    calibrationParameters: ['redThreshold', 'amberThreshold', 'criticalBreachTriggers'],
    evidenceExpectations: ['Composite score', 'Band thresholds in force', 'Any critical-breach trigger that fired, named'],
    notes: 'Frozen in Phase 2 closure (Decision 8, Type B). The banding mechanism and the override precedence — a critical breach forces Red regardless of the composite — are the semantic contract; band edges and critical triggers are calibration (MC-3). **L3_ASSESSED** (ADR-0014): this asserts "this project is Amber", which is a verdict about project state, not an arithmetic consequence. A deterministic implementation does not make it L2.' }),
  def({ ...hl, id: 'MET-HLTH-012', name: 'Reported RAG', epistemicLevel: 'L1_OBSERVED', authoritativeSourceType: 'MANUAL_DECLARATION',
    businessDefinition: 'The status the delivery team declared.', formula: 'StatusReport.reportedRag (latest ≤ t)',
    inputs: ['health:StatusReport.reportedRag'], unit: 'RAG', aggregation: 'DISTRIBUTION', currencyBehaviour: 'NONE',
    edgeHandling: EDGE.noDenominator, status: 'Frozen',
    evidenceExpectations: ['Status report with author and date'] }),
  def({ ...hl, id: 'MET-HLTH-013', name: 'Effective RAG', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE', version: '2.0.0',
    businessDefinition: 'The status the organisation is accountable for: an in-date authorised override if one exists, otherwise the system assessment.',
    formula: 'RagOverride.rag WHERE in date, else MET-HLTH-011',
    inputs: ['MET-HLTH-011', 'health:RagOverride'], unit: 'RAG', aggregation: 'DISTRIBUTION',
    currencyBehaviour: 'NONE', edgeHandling: EDGE.noDenominator, ruleSet: 'HEALTH-v1',
    calibrationParameters: [],
    evidenceExpectations: ['System assessment', 'Override with actor, reason, timestamp and expiry if applied'],
    notes: 'Fully specified: an in-date authorised override wins, otherwise the system assessment. Frozen in Phase 2 closure — it was Draft only because MET-HLTH-011 was.' }),
  def({ ...hl, id: 'MET-HLTH-030', name: 'Status Divergence', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE', version: '2.0.0',
    businessDefinition: 'How far the reported status is from what the evidence supports. Positive means reported healthier than the evidence.',
    formula: 'band(MET-HLTH-012) − band(MET-HLTH-011), where GREEN=0, AMBER=1, RED=2',
    inputs: ['MET-HLTH-012', 'MET-HLTH-011'], unit: 'Score', aggregation: 'COUNT', currencyBehaviour: 'NONE',
    edgeHandling: EDGE.noDenominator, ruleSet: 'HEALTH-v1', calibrationParameters: [],
    evidenceExpectations: ['Both RAG values with their derivations'],
    notes: 'The product\'s flagship signal (PRODUCT_SPEC.md §3.3, AC-2). Must never be averaged into the composite.' }),
  def({ ...hl, id: 'MET-HLTH-031', name: 'Divergence Persistence', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE', version: '2.0.0',
    businessDefinition: 'How many consecutive weeks the reported status has been healthier than the evidence.',
    formula: 'consecutive weekly snapshots with MET-HLTH-030 > 0, counting back from t',
    inputs: ['MET-HLTH-030'], unit: 'Weeks', aggregation: 'MAX', currencyBehaviour: 'NONE',
    edgeHandling: EDGE.window(2), ruleSet: 'HEALTH-v1', calibrationParameters: [],
    evidenceExpectations: ['Divergence values across the snapshot series'],
    notes: 'One week of divergence is noise. Six is a pattern, and the pattern is what makes it actionable.' }),
  def({ ...hl, id: 'MET-HLTH-032', name: 'Dimension Contribution', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'How many points each dimension added to or removed from the composite score.',
    formula: 'per dimension d: (MET-HLTH-00d − neutralBaseline) × dimensionWeightᵈ',
    inputs: ['MET-HLTH-001', 'MET-HLTH-002', 'MET-HLTH-003', 'MET-HLTH-004', 'MET-HLTH-005', 'MET-HLTH-006'],
    unit: 'Score', aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'NONE', edgeHandling: EDGE.noDenominator,
    ruleSet: 'HEALTH-v1', calibrationParameters: ['neutralBaseline', 'dimensionWeight.*'],
    evidenceExpectations: ['Each dimension score and weight'],
    notes: 'The first drill step of the evidence chain (AC-3, REQ-PROJ-002).' }),
  def({ ...hl, id: 'MET-HLTH-033', name: 'Reported Green Risk', epistemicLevel: 'L3_ASSESSED',
    authoritativeSourceType: 'RULE_ENGINE', status: 'Frozen', version: '1.0.0',
    businessDefinition:
      'Whether a project is still being REPORTED Green while the system\'s own evidence says otherwise — either the System-Assessed band is already Amber or Red, or the evidence shows material deterioration.',
    formula:
      'MET-HLTH-012 = GREEN AND (MET-HLTH-011 ∈ {AMBER, RED} OR MET-FCST-020 ∈ {DETERIORATING, ' +
      'RAPIDLY_DETERIORATING} OR MET-FCST-022 at 30 or 60 days worse than MET-HLTH-011)',
    inputs: ['MET-HLTH-012', 'MET-HLTH-011', 'MET-FCST-020', 'MET-FCST-022'], unit: 'Score',
    aggregation: 'COUNT', currencyBehaviour: 'NONE', edgeHandling: EDGE.noDenominator,
    ruleSet: 'HEALTH-v2', calibrationParameters: [],
    evidenceExpectations: [
      'Reported RAG exactly as reported, with the status report behind it',
      'System-Assessed RAG with its evidence',
      'The trajectory or outlook establishing material deterioration, where that is the trigger',
    ],
    notes:
      'C-10 RESOLVED by ADR-0018. C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. ' +
      'The counterpart to MET-FCST-025 System Green-at-Risk, and ' +
      'deliberately a **separate** metric: one is about the future (system Green now, predicted to ' +
      'worsen), this one is about a disagreement now (organisation says Green, evidence says ' +
      'otherwise). Collapsing them into a single flag loses the ability to say which is which, and ' +
      'they lead to different conversations — one with a delivery team, one with a reporting line. ' +
      'Curated scenario C is the canonical case and scenario B also fires it. **Reported RAG is L1 ' +
      'observed and is never overwritten, corrected or derived** (PRODUCT_SPEC.md §3.3); this metric ' +
      'records the disagreement, it does not resolve it. Narrower than MET-HLTH-030 Status ' +
      'Divergence, which measures divergence in either direction; this one fires only on reported ' +
      'GREEN, which is the direction that hides a problem.' }),
];

export const FORECAST_METRICS: readonly MetricDefinition[] = [
  def({ ...fc, id: 'MET-FCST-001', name: 'Health Trajectory', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE',
    businessDefinition: 'The direction and speed at which the composite health score is moving.',
    formula: 'least-squares slope of MET-HLTH-010 over trailing 8 weekly snapshots',
    inputs: ['MET-HLTH-010'], unit: 'Score', aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'NONE',
    edgeHandling: EDGE.window(8), ruleSet: 'TRAJECTORY-v1', calibrationParameters: ['defaultWeeklySignalWindowWeeks'],
    evidenceExpectations: ['The eight weekly snapshots that produced the slope, named individually'],
    notes: 'L3 inferred despite being deterministic — a projection about the future is a judgement (ADR-0004 §Consequences, ADR-0011).' }),
  def({ ...fc, id: 'MET-FCST-002', name: 'Deterioration Flag', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE',
    businessDefinition: 'True when a currently-Green project is on a declining trajectory. The definition of a deteriorating green.',
    formula: 'MET-FCST-001 ≤ deteriorationSlopeThreshold AND MET-HLTH-013 = GREEN',
    inputs: ['MET-FCST-001', 'MET-HLTH-013'], unit: 'Boolean', aggregation: 'COUNT', currencyBehaviour: 'NONE',
    edgeHandling: EDGE.window(8), ruleSet: 'TRAJECTORY-v1', calibrationParameters: ['deteriorationSlopeThreshold'],
    evidenceExpectations: ['Trajectory slope with its window', 'Effective RAG'],
    notes: 'Frozen in Phase 2 closure (Decision 8, Type B). What it means — a currently-Green project whose health is declining at or beyond a threshold rate — is settled. The threshold value is calibrated against the generated portfolio in Phase 3 (MC-6) and is a versioned TRAJECTORY-v1 parameter.' }),
  def({ ...fc, id: 'MET-FCST-003', name: 'Weeks to Amber', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE',
    businessDefinition: 'At the current rate of decline, how long before the project crosses into Amber.',
    formula: '(MET-HLTH-010 − amberThreshold) / |MET-FCST-001| when MET-FCST-001 < 0, else NOT_COMPUTABLE',
    inputs: ['MET-HLTH-010', 'MET-FCST-001'], unit: 'Weeks', aggregation: 'MIN', currencyBehaviour: 'NONE',
    edgeHandling: EDGE.window(8), ruleSet: 'TRAJECTORY-v1', calibrationParameters: ['amberThreshold'],
    evidenceExpectations: ['Composite score', 'Trajectory slope', 'Amber threshold in force'] }),
  def({ ...fc, id: 'MET-FCST-004', name: 'Margin Trajectory', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE',
    businessDefinition: 'The direction and speed at which forecast margin is moving.',
    formula: 'least-squares slope of MET-FIN-014 over trailing 8 weekly snapshots',
    inputs: ['MET-FIN-014'], unit: 'PercentagePoints', aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'NONE',
    edgeHandling: EDGE.window(8), ruleSet: 'TRAJECTORY-v1', calibrationParameters: ['defaultWeeklySignalWindowWeeks'],
    evidenceExpectations: ['The eight snapshots that produced the slope'] }),
  def({ ...fc, id: 'MET-FCST-005', name: 'Projected Outturn Margin', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE',
    businessDefinition: 'Where margin lands at completion if the current trend continues.',
    formula: 'clamp(MET-FIN-014 + MET-FCST-004 × weeksRemainingToForecastCompletion, outturnFloor, outturnCeiling)',
    inputs: ['MET-FIN-014', 'MET-FCST-004'], unit: 'Percent', aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'NONE',
    edgeHandling: EDGE.window(8), ruleSet: 'TRAJECTORY-v1', calibrationParameters: ['outturnFloor', 'outturnCeiling'],
    evidenceExpectations: ['Current margin', 'Margin trajectory', 'Remaining duration'],
    notes: 'Must never be rendered with the authority of MET-FIN-014.' }),
  def({ ...fc, id: 'MET-FCST-006', name: 'Signal Confluence', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE',
    businessDefinition: 'How many health dimensions are deteriorating at the same time.',
    formula: 'count of MET-HLTH-001…006 with a negative slope over trailing 8 snapshots',
    inputs: ['MET-HLTH-001', 'MET-HLTH-002', 'MET-HLTH-003', 'MET-HLTH-004', 'MET-HLTH-005', 'MET-HLTH-006'],
    unit: 'Count', aggregation: 'MAX', currencyBehaviour: 'NONE', edgeHandling: EDGE.window(8),
    ruleSet: 'TRAJECTORY-v1', calibrationParameters: ['defaultWeeklySignalWindowWeeks'],
    evidenceExpectations: ['Per-dimension slopes across the window'],
    notes: 'One dimension declining is a problem; four declining together is usually the same problem seen from four angles.' }),
  def({ ...fc, id: 'MET-FCST-007', name: 'Intervention Window', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE',
    businessDefinition: 'How long remains to act before intervention stops being able to change the outcome.',
    formula: 'MET-FCST-003 − interventionLeadTimeWeeks',
    inputs: ['MET-FCST-003'], unit: 'Weeks', aggregation: 'MIN', currencyBehaviour: 'NONE',
    edgeHandling: EDGE.window(8), ruleSet: 'TRAJECTORY-v1', calibrationParameters: ['interventionLeadTimeWeeks'],
    evidenceExpectations: ['Weeks to amber', 'Lead-time assumption in force'] }),
  def({ ...fc, id: 'MET-FCST-010', name: 'Silent Deterioration Index', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE',
    businessDefinition: 'How likely a currently-Green project is to become Red while there is still time to act. The product\'s north-star ranking signal.',
    formula:
      '100 × (wₛ×n(−MET-FCST-001, slopeScale) + w_d×n(MET-HLTH-030, 2) + w_p×n(MET-HLTH-031, persistenceScale) + w_c×n(MET-FCST-006, 6)) / (wₛ+w_d+w_p+w_c), where n(v,s) = clamp(v/s, 0, 1)',
    inputs: ['MET-FCST-001', 'MET-HLTH-030', 'MET-HLTH-031', 'MET-FCST-006'], unit: 'Score',
    aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'NONE', edgeHandling: EDGE.window(8),
    ruleSet: 'TRAJECTORY-v1',
    calibrationParameters: ['slopeWeight', 'divergenceWeight', 'persistenceWeight', 'confluenceWeight', 'slopeScale', 'persistenceScale'],
    evidenceExpectations: ['All four component values with their windows', 'TRAJECTORY-v1 weights and scales in force'],
    notes: 'Frozen in Phase 2 closure (Decision 8, Type B): the four components, their normalisation and their combination are settled. Weights and scales are calibration (MC-6), tuned against the generated portfolio in Phase 3. L3_ASSESSED and must be structurally labelled as such — it may never be presented with the authority of a computed margin figure.' }),
];

export const DATA_QUALITY_METRICS: readonly MetricDefinition[] = [
  def({ ...dq, id: 'MET-DQ-001', name: 'Completeness', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Share of required fields that are actually populated.',
    formula: 'Σ populatedRequiredFields / Σ expectedRequiredFields across domain probes',
    inputs: ['data-quality:DomainObservation'], unit: 'Percent', aggregation: 'WEIGHTED_MEAN',
    currencyBehaviour: 'NONE', edgeHandling: EDGE.ratio, evidenceExpectations: ['Per-domain probe observations'] }),
  def({ ...dq, id: 'MET-DQ-002', name: 'Freshness', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'How many days since each source domain last supplied data.',
    formula: 'max over domains of (t − mostRecentUpdateAt)', inputs: ['data-quality:DomainObservation'],
    unit: 'Days', aggregation: 'MAX', currencyBehaviour: 'NONE', edgeHandling: EDGE.ratio,
    evidenceExpectations: ['Per-domain last-update timestamps', 'Source freshness state'] }),
  def({ ...dq, id: 'MET-DQ-003', name: 'Consistency', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Share of cross-domain reconciliation assertions that pass.',
    formula: 'Σ assertionsPassed / Σ assertionsEvaluated', inputs: ['data-quality:DomainObservation'],
    unit: 'Percent', aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'NONE', edgeHandling: EDGE.ratio,
    evidenceExpectations: ['Each assertion, its inputs, and its outcome'],
    notes: 'Example assertion: invoiced ≤ recognised + tolerance. A failing assertion names both sides.' }),
  def({ ...dq, id: 'MET-DQ-004', name: 'Source Coverage', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Share of expected source domains that are reporting at all.',
    formula: 'domains reporting / domains expected', inputs: ['data-quality:DomainObservation'], unit: 'Percent',
    aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'NONE', edgeHandling: EDGE.ratio,
    evidenceExpectations: ['Expected domain list', 'Domains that reported'] }),
  def({ ...dq, id: 'MET-DQ-005', name: 'Data Confidence Score', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'How much the underlying data can be relied on, banded High, Medium or Low.',
    formula: 'weighted composite of MET-DQ-001…004 per DQ-v1, banded',
    inputs: ['MET-DQ-001', 'MET-DQ-002', 'MET-DQ-003', 'MET-DQ-004'], unit: 'Score',
    aggregation: 'DISTRIBUTION', currencyBehaviour: 'NONE', edgeHandling: EDGE.noDenominator, ruleSet: 'DQ-v1',
    calibrationParameters: ['completenessWeight', 'freshnessWeight', 'consistencyWeight', 'coverageWeight', 'highBandFloor', 'mediumBandFloor'],
    evidenceExpectations: ['All four component values', 'DQ-v1 weights in force'] }),
  def({ ...dq, id: 'MET-DQ-006', name: 'Confidence-Qualified Health', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Health and confidence presented together as a pair, so an unreliable Green is never mistaken for a confident one.',
    formula: '(MET-HLTH-010, band(MET-DQ-005)) — a tuple, never a product',
    inputs: ['MET-HLTH-010', 'MET-DQ-005'], unit: 'Tuple', aggregation: 'NOT_AGGREGATABLE',
    currencyBehaviour: 'NONE', edgeHandling: EDGE.noDenominator,
    evidenceExpectations: ['Both values with their own evidence'],
    notes: 'Deliberately a tuple. Multiplying health by confidence would let an unreliable Green and a confident Amber collapse to the same number, destroying the distinction PRODUCT_SPEC.md §3.4 exists to preserve. Any implementation that blends them is a defect.' }),
  def({ ...dq, id: 'MET-DQ-007', name: 'Forecast Confidence', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE',
    businessDefinition: 'How much the project\'s own forecast can be relied on, based on its track record of revision and estimating accuracy.',
    formula: 'weighted composite of MET-DEL-014 (replan frequency), MET-FIN-030 (ETC optimism gap) and MET-DEL-013 (velocity stability) per DQ-v1',
    inputs: ['MET-DEL-014', 'MET-FIN-030', 'MET-DEL-013'], unit: 'Score', aggregation: 'DISTRIBUTION',
    currencyBehaviour: 'NONE', edgeHandling: EDGE.window(8), ruleSet: 'DQ-v1',
    calibrationParameters: ['replanWeight', 'optimismWeight', 'stabilityWeight'],
    evidenceExpectations: ['All three component values'],
    notes: 'Distinct from MET-DQ-005: data confidence asks whether the inputs are trustworthy, forecast confidence asks whether this team\'s estimates have historically been.' }),
];

export const PORTFOLIO_METRICS: readonly MetricDefinition[] = [
  def({ ...po, id: 'MET-PORT-001', name: 'Portfolio Contract Value', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED', status: 'Frozen',
    businessDefinition: 'Total contracted value across the projects the caller is authorised to see.',
    formula: 'Σ MET-FIN-002 over authorised projects, converted to the reporting currency',
    inputs: ['MET-FIN-002'], unit: 'Money', aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED',
    edgeHandling: EDGE.noDenominator,
    evidenceExpectations: ['Per-project contract values', 'FX rates with dates and source'],
    notes: 'Computed over the caller\'s authorised entity set, never globally then filtered (ADR-0005 §5).' }),
  def({ ...po, id: 'MET-PORT-002', name: 'Portfolio Forecast Margin', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED', status: 'Frozen',
    businessDefinition: 'Margin percentage across the authorised portfolio, weighted by revenue.',
    formula: '(Σ MET-FIN-010 − Σ MET-FIN-008) / Σ MET-FIN-010',
    inputs: ['MET-FIN-010', 'MET-FIN-008'], unit: 'Percent', aggregation: 'RECOMPUTE_FROM_INPUTS',
    currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.ratio,
    evidenceExpectations: ['Per-project revenue and EAC', 'FX rates'],
    notes: 'A weighted margin, not an average of project margins. Averaging percentages across projects of different sizes is a classic and highly visible error; a controller will spot it immediately. Golden test required.' }),
  def({ ...po, id: 'MET-PORT-003', name: 'Portfolio Value at Risk', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    version: '2.0.0',
    businessDefinition: 'Total margin at risk across the authorised portfolio, counting each project exactly once.',
    formula:
      'Σ MET-FIN-019 over distinct authorised eligible projects, each counted exactly once',
    inputs: ['MET-FIN-019'], unit: 'Money', aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED',
    edgeHandling: EDGE.noDenominator, baseline: 'AS_SOLD', ruleSet: 'VAR-v1', calibrationParameters: [],
    evidenceExpectations: [
      'Per-project MET-FIN-019, one row per distinct project',
      'The count of distinct projects summed',
      'Shared-cause concentration, reported separately and marked non-additive',
    ],
    notes:
      'CORRECTED at the pre-Phase-11 architectural closure (ADR-0023, superseding ADR-0021). The ' +
      'v1.0.0 formula subtracted a shared-riskCauseKey group total less its largest member, and ' +
      'that subtraction was economically unsupported: MET-FIN-019 is one project\'s own margin, so ' +
      'two projects hold disjoint pools of money and there is nothing to de-duplicate between them. ' +
      'A shared cause key is a CATEGORY, not an identifier for one monetary event — the risk model ' +
      'carries no shared-exposure id, allocation amount or allocation basis, so cause identity ' +
      'cannot distinguish six separate losses from one root cause from one loss booked six times. ' +
      'On the demo portfolio the old rule removed $38.93M of 89.19M — real exposure, understated by ' +
      '44%. Shared cause is systemic CONCENTRATION and is reported beside this figure as explicitly ' +
      'non-additive diagnostics, never subtracted from it. A future cross-project reduction requires ' +
      'the explicit monetary allocation fact model in ADR-0023 D-4; cause identity remains ' +
      'permanently insufficient.' }),
  def({ ...po, id: 'MET-PORT-004', name: 'RAG Distribution', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE', version: '2.0.0',
    businessDefinition: 'How many authorised projects sit in each status band, split by reported and system-assessed.',
    formula: 'counts of MET-HLTH-012 and MET-HLTH-011 by band', inputs: ['MET-HLTH-012', 'MET-HLTH-011'],
    unit: 'BandDistribution', aggregation: 'DISTRIBUTION', currencyBehaviour: 'NONE', edgeHandling: EDGE.noDenominator,
    evidenceExpectations: ['Per-project RAG values'],
    notes: 'Shown as two distributions side by side, never merged — the gap between them is the portfolio-level view of MET-HLTH-030.' }),
  def({ ...po, id: 'MET-PORT-005', name: 'Divergent Project Count', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE', version: '2.0.0',
    businessDefinition: 'How many projects are reporting healthier than their evidence supports.',
    formula: 'count(projects WHERE MET-HLTH-030 > 0)', inputs: ['MET-HLTH-030'], unit: 'Count',
    aggregation: 'SUM', currencyBehaviour: 'NONE', edgeHandling: EDGE.noDenominator,
    evidenceExpectations: ['Per-project divergence values'] }),
  def({ ...po, id: 'MET-PORT-006', name: 'Deteriorating Greens', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE',
    businessDefinition: 'How many currently-Green projects are on a declining trajectory. The portfolio expression of the product\'s differentiator.',
    formula: 'count(projects WHERE MET-FCST-002)', inputs: ['MET-FCST-002'], unit: 'Count',
    aggregation: 'SUM', currencyBehaviour: 'NONE', edgeHandling: EDGE.window(8), ruleSet: 'TRAJECTORY-v1',
    calibrationParameters: ['deteriorationSlopeThreshold'],
    evidenceExpectations: ['Per-project deterioration flags with their trajectory windows'],
    notes: 'L3_ASSESSED: counting inferred flags produces an inferred count. Reclassified in Phase 2 closure — an L2 metric may not rest on an L3 input (Decision 6, Step 5).' }),
  def({ ...po, id: 'MET-PORT-007', name: 'Executive Intervention Priority Rank', epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE', status: 'Frozen',
    businessDefinition: 'The order in which projects should receive scarce executive attention this week.',
    formula:
      'LEXICOGRAPHIC ordering over seven tiers, first difference decides: ' +
      '(1) critical economic or contractual exposure — contractualPenaltyExposure > 0 OR forecastContractLoss > 0 OR (MET-HLTH-011 = RED AND MET-FIN-019 ≥ criticalGmValueAtRiskFloor); ' +
      '(2) predicted deterioration — MET-FCST-025 OR MET-FCST-022 at 30 or 60 days worse than MET-HLTH-011; ' +
      '(3) time criticality — min(MET-FCST-007, weeksToCriticalMilestone) ascending, unknown last; ' +
      '(4) MET-FIN-019 descending; ' +
      '(5) actionability grade descending (CREDIBLE_PLAN > PLAN_FORMING > NO_PLAN > NOT_ASSESSED); ' +
      '(6) rank confidence descending; ' +
      '(7) projectId ascending',
    inputs: ['MET-HLTH-011', 'MET-FIN-019', 'MET-FCST-025', 'MET-FCST-022', 'MET-FCST-007', 'MET-DQ-005', 'MET-DQ-007'],
    unit: 'Rank', aggregation: 'NOT_AGGREGATABLE',
    currencyBehaviour: 'NONE', edgeHandling: EDGE.window(8), ruleSet: 'PRIORITY-v1',
    calibrationParameters: ['criticalGmValueAtRiskFloor', 'immediateHorizonWeeks'],
    evidenceExpectations: [
      'Every tier value per project, with the tier that decided each adjacent pair',
      'Named evidence gaps where a project was placed on partial evidence',
      'Actionability grade with the plan records behind it',
      'PRIORITY-v1 parameters in force',
    ],
    notes:
      'MC-5 RESOLVED by ADR-0019 — the semantic gap that blocked this metric is closed, and the ' +
      'ordering is implemented, deterministic and explainable. It remains Draft because it is now ' +
      'C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. Tiers 1 and 2 ' +
      'consume MET-HLTH-011 and MET-FCST-025, and which health model produces the band is still ' +
      'unsettled. That is an input question, not an ordering question — the rank function no longer ' +
      'throws, and Phase 7 can build against it. ' +
      '"Intervenability" was never one thing: it conflated **exposure/' +
      'urgency** (how bad, how soon — observed or derived) with **actionability** (is there a ' +
      'credible plan — evidenced by an owner, a date and a stated benefit). Separating them made the ' +
      'metric definable. **Lexicographic, not weighted**, so a hard risk cannot be buried by an ' +
      'average: a crystallising contractual penalty outranks any amount of GM value at risk, and no ' +
      'reader has to trust a hidden weight to see why. Actionability sits at tier 5, below every ' +
      'exposure tier, so a small problem with a good plan can never outrank a large problem without ' +
      'one. Deterministic and replayable (AC-7); the ordering is antisymmetric and transitive by ' +
      'test. Missing evidence lowers rank confidence and names the gap; a project with no evaluable ' +
      'tier is listed separately rather than sorted last, because an unmeasured project is not a ' +
      'safe one. **No composite score is emitted anywhere** — CLAUDE.md invariant 9 and ' +
      'PRODUCT_SPEC.md §8. The floor and horizon remain synthetic calibration candidates.' }),
  def({ ...po, id: 'MET-PORT-008', name: 'Portfolio Confidence', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'How data confidence is distributed across the authorised portfolio.',
    formula: 'distribution of band(MET-DQ-005) across authorised projects', inputs: ['MET-DQ-005'],
    unit: 'BandDistribution', aggregation: 'DISTRIBUTION', currencyBehaviour: 'NONE', edgeHandling: EDGE.noDenominator,
    ruleSet: 'DQ-v1', calibrationParameters: ['highBandFloor', 'mediumBandFloor'],
    evidenceExpectations: ['Per-project confidence bands'] }),
  def({ ...po, id: 'MET-PORT-009', name: 'Portfolio Forecast Loss Exposure', epistemicLevel: 'L2_DERIVED',
    authoritativeSourceType: 'DERIVED', status: 'Frozen', version: '1.0.0',
    businessDefinition:
      'The total forecast loss across projects expected to complete below cost — the money the organisation expects to lose, not the margin it expects to miss.',
    formula: 'Σ max(0, −MET-FIN-024) over in-scope authorised projects',
    inputs: ['MET-FIN-024'], unit: 'Money', aggregation: 'SUM',
    currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'FORECAST', calibrationParameters: [],
    evidenceExpectations: [
      'Each loss-making project with its forecast GM',
      'The count of projects contributing, so a single large loss is distinguishable from many small ones',
    ],
    notes:
      'Registered at Phase 7 closure because no canonical metric expressed the concept and the ' +
      'command centre was reporting it under MET-FIN-024 — the ID for **Forecast GM $**, a different ' +
      'and much larger figure. Sharing one ID between "forecast margin" and "forecast loss" would ' +
      'have made two opposite numbers indistinguishable in traceability. **Downside only**: a ' +
      'profitable project contributes zero, never a negative offset, because a portfolio loss ' +
      'exposure that nets off against healthy projects understates exactly the thing it exists to ' +
      'surface. Distinct from MET-FIN-032 Risk-Adjusted GM $ (which prices unrealised risk) and from ' +
      'contractual penalty exposure (a liability, not a margin outcome).' }),
];
