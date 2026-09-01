/**
 * Phase 4 metric definitions — the executive health model, trajectory, outlook, Green-at-Risk,
 * recovery economics, and the two data-confidence additions.
 *
 * **Why these are new IDs rather than edits.** Prompt 4 specifies a four-dimension executive health
 * model (Financial 40 / Delivery 25 / Scope-Commercial 20 / Product-Quality 15). `METRIC_CATALOG.md`
 * freezes a *six*-dimension model at MET-HLTH-001…006 and MET-HLTH-010. That is **CONFLICT C-7**.
 * Editing MET-HLTH-010's frozen formula would be exactly the silent change invariant 3 forbids, so
 * the executive model is registered here as a **new, `Draft`, parallel** family under `HEALTH-v2`
 * and proposed in ADR-0015. Neither model is deleted; the six-dimension model stays Frozen and stays
 * blocked on MC-2, and which one is authoritative is a decision for the ADR, not for this file.
 *
 * The same reasoning governs MET-DQ-009: Prompt 4's forecast-confidence factor list does not match
 * the Frozen MET-DQ-007 formula, so it is registered as a separate Draft profile rather than
 * rewritten over the top of a frozen definition.
 */
import { type MetricDefinition } from '../metric-types.js';
import { ALL_CONTRACT_TYPES, EDGE, FIXED_BID_ONLY, def } from './define.js';

const hl = { sourceDomain: 'health', owner: 'Delivery Intelligence', applicableContractTypes: ALL_CONTRACT_TYPES, version: '1.0.0' } as const;
const fc = { sourceDomain: 'forecast', owner: 'Delivery Intelligence', applicableContractTypes: ALL_CONTRACT_TYPES, version: '1.0.0' } as const;
const rc = { sourceDomain: 'recovery', owner: 'Delivery Intelligence', applicableContractTypes: FIXED_BID_ONLY, version: '1.0.0' } as const;
const dq = { sourceDomain: 'data-quality', owner: 'Assurance', applicableContractTypes: ALL_CONTRACT_TYPES, version: '1.0.0' } as const;

/**
 * C-7 is resolved. Phase 4 raised it and Phase 7 closure settled it (ADR-0015 D-1, amended).
 *
 * The question was never which arithmetic to use; it was **which model the organisation is
 * accountable to**, because the two can rank the same portfolio differently. That is a question
 * about meaning, and it needed an owner rather than a threshold.
 */
const C7 =
  'C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1, amended). The **four HEALTH-v2 executive ' +
  'dimensions** — Financial, Delivery, Scope & Commercial, Product & Quality — are authoritative for ' +
  'MET-HLTH-011 System-Assessed RAG. The six HEALTH-v1 analytical dimensions (MET-HLTH-001…006, 010) ' +
  'are **retained, computable and not deleted**; they are the diagnostic detail view beneath the ' +
  'executive four, and they remain blocked on MC-2 for their own weights. Resource, dependency, ' +
  'acceptance and assurance measures are **drivers and sub-measures feeding these four**, not ' +
  'competing peer-level executive dimensions — MET-DEL-023 dependency ageing feeds Delivery, ' +
  'MET-QUA-010 acceptance blockers feed Product & Quality. Data confidence is reported beside health ' +
  'and never becomes a fifth dimension (PRODUCT_SPEC.md §3.4). **Frozen**: the mechanism is settled. ' +
  'The four weights (0.40 / 0.25 / 0.20 / 0.15) and every normalisation edge remain **open ' +
  'calibration (Type B)** and live in the HEALTH-v2 rule set as versioned parameters — changing one ' +
  'changes the number, not the meaning.';

const execDimension = (
  id: string, name: string, from: string[], note: string, weight: string,
): MetricDefinition =>
  def({
    ...hl, id, name, epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    status: 'Frozen', businessDefinition: note,
    formula:
      `100 × Σᵢ (wᵢ × normalise(mᵢ, greenEdgeᵢ, redEdgeᵢ)) / Σᵢ wᵢ over [${from.join(', ')}] ` +
      `(HEALTH-v2 dimension weight ${weight})`,
    inputs: from, unit: 'Score', aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'NONE',
    edgeHandling: { zeroDenominator: 'NOT_COMPUTABLE', missingInput: 'NOT_COMPUTABLE', minimumHistoryWeeks: 0 },
    ruleSet: 'HEALTH-v2',
    calibrationParameters: from.flatMap((f) => [`${f}.greenEdge`, `${f}.redEdge`, `${f}.weight`]),
    evidenceExpectations: [
      'Each contributing metric value, with its own evidence',
      'The HEALTH-v2 edge and weight parameters in force, by version',
      'Any contributing metric that was NOT_COMPUTABLE, named with its reason',
    ],
    notes: C7,
  });

export const EXECUTIVE_HEALTH_METRICS: readonly MetricDefinition[] = [
  execDimension('MET-HLTH-021', 'Financial Dimension (Executive)',
    ['MET-FIN-014', 'MET-FIN-016', 'MET-FIN-027', 'MET-FIN-021'],
    'Whether the project will land on the economics that were sold.', '0.40'),
  execDimension('MET-HLTH-022', 'Delivery Dimension (Executive)',
    ['MET-DEL-005', 'MET-DEL-011', 'MET-DEL-018', 'MET-DEL-010'],
    'Whether the committed scope will arrive by the committed date.', '0.25'),
  execDimension('MET-HLTH-023', 'Scope & Commercial Dimension (Executive)',
    ['MET-COM-007', 'MET-COM-008', 'MET-COM-009', 'MET-FIN-011'],
    'Whether scope growth is being commercially recovered rather than absorbed.', '0.20'),
  execDimension('MET-HLTH-024', 'Product Quality Dimension (Executive)',
    ['MET-QUA-003', 'MET-QUA-006', 'MET-QUA-009', 'MET-QUA-010'],
    'Whether engineering quality is sustaining delivery or quietly consuming it.', '0.15'),
  def({ ...hl, id: 'MET-HLTH-020', name: 'Executive Composite Health Score',
    epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED', status: 'Frozen',
    businessDefinition:
      'A single 0-100 score over the four executive dimensions, used for ranking and never as the headline verdict.',
    formula:
      '100 × Σᵈ (MET-HLTH-02d × weightᵈ) / Σᵈ weightᵈ over the dimensions that were computable, ' +
      'd = 1…4, per HEALTH-v2',
    inputs: ['MET-HLTH-021', 'MET-HLTH-022', 'MET-HLTH-023', 'MET-HLTH-024'],
    unit: 'Score', aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'NONE', edgeHandling: EDGE.ratio,
    ruleSet: 'HEALTH-v2',
    calibrationParameters: [
      'dimensionWeight.FINANCIAL', 'dimensionWeight.DELIVERY',
      'dimensionWeight.SCOPE_COMMERCIAL', 'dimensionWeight.PRODUCT_QUALITY',
    ],
    evidenceExpectations: [
      'All four dimension scores', 'The HEALTH-v2 weights in force', 'Rule version stamp',
      'Any dimension excluded for non-computability, named',
    ],
    notes:
      `${C7} Renormalised over computable dimensions only, so one missing fact domain lowers ` +
      'confidence rather than dragging the score toward zero — a silent zero would be a fabricated ' +
      'measurement. **L2_DERIVED**: banding it into a verdict is MET-HLTH-011 and is L3 (ADR-0014).' }),
];

export const PHASE4_FORECAST_METRICS: readonly MetricDefinition[] = [
  def({ ...fc, id: 'MET-FCST-020', name: 'Trajectory State', epistemicLevel: 'L3_ASSESSED',
    authoritativeSourceType: 'RULE_ENGINE', status: 'Frozen',
    businessDefinition:
      'Which way the project is moving — improving, stable, deteriorating, or deteriorating rapidly — independent of where it currently stands.',
    formula:
      'RAPIDLY_DETERIORATING if |materially adverse signals| ≥ rapidConfluenceThreshold; ' +
      'else DETERIORATING if ≥ 1; else IMPROVING if more than half of computable signals improve; else STABLE',
    inputs: ['MET-FCST-021', 'MET-FCST-006'], unit: 'Score', aggregation: 'DISTRIBUTION',
    currencyBehaviour: 'NONE', edgeHandling: EDGE.window(3), ruleSet: 'TRAJECTORY-v1',
    calibrationParameters: ['rapidConfluenceThreshold', 'materialAdverseSlope'],
    evidenceExpectations: [
      'Every signal series with its window and observation count',
      'Each signal slope, and which crossed its material-adverse threshold',
      'Signals excluded for insufficient history, named with their minimum',
    ],
    notes:
      'C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. Deliberately never reads the current RAG band: a Green project ' +
      'falling and a Red project recovering are the two cases this product exists to tell apart, ' +
      'and deriving trajectory from the band would collapse them. Reports STABLE when nothing has ' +
      'enough history — absence of evidence of movement, which the explanation states rather than ' +
      'implying movement was ruled out.' }),
  def({ ...fc, id: 'MET-FCST-021', name: 'Signal Trend Slope', epistemicLevel: 'L3_ASSESSED',
    authoritativeSourceType: 'RULE_ENGINE', status: 'Frozen',
    businessDefinition: 'How fast one signal is moving, per period, over its approved observation window.',
    formula:
      'least-squares slope of the signal over its TrajectoryObservationPolicy window; ' +
      'NOT_COMPUTABLE below the policy minimum observations',
    inputs: ['rules:TrajectoryObservationPolicy'], unit: 'Ratio', aggregation: 'NOT_AGGREGATABLE',
    currencyBehaviour: 'NONE', edgeHandling: EDGE.window(3), ruleSet: 'TRAJECTORY-v1',
    calibrationParameters: ['windowSize', 'minimumObservations'],
    evidenceExpectations: ['The observations used, in order, with their periods', 'The policy version applied'],
    notes:
      'C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. Returns NOT_COMPUTABLE rather than a slope when the window is short: ' +
      'a line through two points is not a trend, and reporting it as one is how a forecast acquires ' +
      'confidence it has not earned.' }),
  def({ ...fc, id: 'MET-FCST-022', name: 'Forward Outlook Band', epistemicLevel: 'L3_ASSESSED',
    authoritativeSourceType: 'RULE_ENGINE', status: 'Frozen',
    businessDefinition:
      'The band the project is expected to be in at 30, 60 and optionally 90 days if nothing intervenes.',
    formula:
      'degrade(currentBand, floor(stepsPerHorizon(MET-FCST-020) × horizonPeriods)), ' +
      'stepsPerHorizon = 1 for RAPIDLY_DETERIORATING, 0.5 for DETERIORATING, else 0',
    inputs: ['MET-FCST-020', 'MET-HLTH-011'], unit: 'RAG', aggregation: 'DISTRIBUTION',
    currencyBehaviour: 'NONE', edgeHandling: EDGE.window(3), ruleSet: 'TRAJECTORY-v1',
    calibrationParameters: ['stepsPerHorizon.RAPIDLY_DETERIORATING', 'stepsPerHorizon.DETERIORATING'],
    evidenceExpectations: [
      'The trajectory state and the signals behind it', 'The current band',
      'The stated assumption that nothing intervenes', 'Confidence for the horizon',
    ],
    notes:
      'C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. **Rules-based, not a model.** PRODUCT_SPEC.md §4.2 defers ML ' +
      'forecasting, and a fitted curve nobody can interrogate would fail AC-3. Confidence decreases ' +
      'with horizon by design; a 90-day statement is worth less than a 30-day one and must not be ' +
      'presented as though it were not.' }),
  def({ ...fc, id: 'MET-FCST-025', name: 'System Green-at-Risk', epistemicLevel: 'L3_ASSESSED',
    authoritativeSourceType: 'RULE_ENGINE', status: 'Frozen',
    businessDefinition:
      'Whether a project the SYSTEM currently assesses as healthy is predicted to deteriorate to Amber or Red within 30 or 60 days, while there is still time to act.',
    formula:
      'MET-HLTH-011 = GREEN AND (MET-FCST-022@30d ∈ {AMBER, RED} OR MET-FCST-022@60d ∈ {AMBER, RED}); ' +
      'interventionWindowOpen = MET-FCST-007 ≥ minimumInterventionWeeks',
    inputs: ['MET-HLTH-011', 'MET-FCST-022', 'MET-FCST-007'], unit: 'Score',
    aggregation: 'COUNT', currencyBehaviour: 'NONE', edgeHandling: EDGE.window(3),
    ruleSet: 'TRAJECTORY-v1', calibrationParameters: ['minimumInterventionWeeks'],
    evidenceExpectations: [
      'The System-Assessed band with its evidence',
      'The forward outlook at 30 and 60 days, with the trajectory beneath it',
      'Every contributing reason with its metric and evidence, where any cleared its threshold',
      'Weeks remaining before the projected band change',
      'Data confidence, reported separately and never blended in',
    ],
    notes:
      'C-10 RESOLVED by ADR-0018. C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. ' +

      '"Green" here means **System-Assessed** (MET-HLTH-011), and the ' +
      'trigger is the **approved forward outlook** at 30 or 60 days rather than the raw trajectory ' +
      'state. Reported RAG plays no part: a project reported Green while the system already says ' +
      'Amber is MET-HLTH-033 Reported Green Risk, a different and separately reported finding. ' +
      'The two are never collapsed. **The former "≥ 1 stated reason" condition was removed** — it ' +
      'gated on economics signals and so made schedule-led deterioration (curated scenario LR) ' +
      'structurally undetectable; reasons are now supporting evidence, and the outlook carries its ' +
      'own. This is the product\'s differentiator (PRODUCT_SPEC.md §1.1). The intervention window is ' +
      'reported separately from the determination on purpose: a Green project that will be Red next ' +
      'week is a finding, but it is not an opportunity, and presenting the two identically would ' +
      'waste the executive attention this product is competing for.' }),
  def({ ...fc, id: 'MET-FCST-026', name: 'Economic Exposure at Risk', epistemicLevel: 'L3_ASSESSED',
    authoritativeSourceType: 'RULE_ENGINE', status: 'Frozen',
    businessDefinition:
      'The margin value that would be lost between today\'s forecast and the projected outturn if the trajectory continues.',
    formula: 'MET-FIN-024 − (MET-FCST-005 × MET-FIN-010), floored at zero',
    inputs: ['MET-FIN-024', 'MET-FCST-005', 'MET-FIN-010'], unit: 'Money', aggregation: 'SUM',
    currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.window(3), ruleSet: 'TRAJECTORY-v1',
    baseline: 'FORECAST',
    calibrationParameters: [],
    evidenceExpectations: ['Current forecast GM $', 'Projected outturn margin and its window', 'FX rate with date and source'],
    notes:
      'C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. L3 because the projected outturn it rests on is an inference. It is ' +
      'therefore never presented with the authority of MET-FIN-024, which is arithmetic over ' +
      'observed cost.' }),

  /**
   * The KPI that measures the product rather than the portfolio (Phase 10).
   *
   * If early detection works, most projects that reach Red were flagged before they got there. A
   * high late-detection rate means the system is confirming failures rather than preventing them —
   * which is the one thing this product exists not to do.
   */
  def({ ...fc, id: 'MET-FCST-030', name: 'Late Detection Rate', epistemicLevel: 'L3_ASSESSED',
    authoritativeSourceType: 'RULE_ENGINE', status: 'Frozen',
    businessDefinition:
      'The share of projects that reached System-Assessed RED without a prior Amber band or a prior fired early warning.',
    formula:
      'count(project WHERE first RED period has neither an AMBER prior period nor a fired EARLY-WARNING rule at that prior period) / count(project reaching RED)',
    inputs: ['MET-HLTH-011'], unit: 'Percent', aggregation: 'WEIGHTED_MEAN',
    currencyBehaviour: 'NONE',
    edgeHandling: { zeroDenominator: 'NOT_COMPUTABLE', missingInput: 'NOT_COMPUTABLE', minimumHistoryWeeks: 8 },
    ruleSet: 'EARLY_WARNING-v1',
    calibrationParameters: [],
    evidenceExpectations: [
      'Each project reaching RED, with the period it first did',
      'The band and fired warnings at the immediately prior period',
      'The early-warning rule set version in force',
    ],
    notes:
      'L3 because it rests on MET-HLTH-011, itself an assessment, and on the early-warning rule set. ' +
      'A zero denominator is NOT_COMPUTABLE and never 0%: no project reaching Red is an absence of ' +
      'cases, not a perfect detection record. Deliberately uncomfortable — it is the measure of ' +
      'whether the product prevents failures or merely records them.' }),
];

export const RECOVERY_METRICS: readonly MetricDefinition[] = [
  def({ ...rc, id: 'MET-REC-001', name: 'Recovery Case Gross Margin %', epistemicLevel: 'L3_ASSESSED',
    authoritativeSourceType: 'RULE_ENGINE', status: 'Frozen',
    businessDefinition:
      'The margin the project would reach if every action in the recovery plan lands as written.',
    formula:
      '(forecastRevenue + Σ actionRevenueBenefit − (forecastCost − Σ actionCostBenefit)) / ' +
      '(forecastRevenue + Σ actionRevenueBenefit), over compatible actions only',
    inputs: ['MET-FIN-010', 'MET-FIN-008', 'recovery:RecoveryAction.expectedMarginEffect'],
    unit: 'Percent', aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'FX_CONVERT_REQUIRED',
    edgeHandling: EDGE.ratio, ruleSet: 'RECOVERY-v1',
    calibrationParameters: ['incompatibleActionGroups'],
    evidenceExpectations: [
      'Every action counted, with owner, due date and expected benefit',
      'Every action excluded as incompatible, named with the group that excluded it',
      'The base forecast the case is measured from',
    ],
    notes:
      'C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. The best case, and labelled as such. Actions in the same ' +
      'incompatibility group are counted once, at their largest benefit: two plans to fix the same ' +
      'overrun are one fix, and summing them is the most common way a recovery plan comes to promise ' +
      'more margin than the contract contains.' }),
  def({ ...rc, id: 'MET-REC-002', name: 'Probability-Adjusted Recovery Gross Margin %',
    epistemicLevel: 'L3_ASSESSED', authoritativeSourceType: 'RULE_ENGINE', status: 'Frozen',
    businessDefinition:
      'The recovery case with each action discounted by how likely it is to actually land.',
    formula:
      'as MET-REC-001 but each action benefit is multiplied by its confidence, ' +
      'and overdue incomplete actions are additionally discounted by overdueDiscount',
    inputs: ['MET-REC-001', 'recovery:RecoveryAction.confidence'], unit: 'Percent',
    aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.ratio,
    ruleSet: 'RECOVERY-v1', calibrationParameters: ['overdueDiscount', 'confidenceFloor'],
    evidenceExpectations: [
      'Each action\'s confidence and where it came from',
      'Each overdue action and the discount applied',
      'Both the unadjusted and adjusted figures, side by side',
    ],
    notes:
      'C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. Reported beside MET-REC-001, never instead of it. The gap between ' +
      'the two is the honest measure of how much of a recovery plan is a plan and how much is hope, ' +
      'and collapsing them to one number destroys exactly that signal.' }),
  def({ ...rc, id: 'MET-REC-003', name: 'Recovery Plan Credibility', epistemicLevel: 'L3_ASSESSED',
    authoritativeSourceType: 'RULE_ENGINE', status: 'Frozen',
    businessDefinition:
      'Whether the recovery plan is owned, dated, and being delivered — as distinct from whether it is optimistic.',
    formula:
      '100 × (w_o×ownedShare + w_d×onTimeShare + w_c×completedShare) / (w_o+w_d+w_c)',
    inputs: ['recovery:RecoveryAction'], unit: 'Score', aggregation: 'WEIGHTED_MEAN',
    currencyBehaviour: 'NONE', edgeHandling: EDGE.ratio, ruleSet: 'RECOVERY-v1',
    calibrationParameters: ['ownershipWeight', 'timelinessWeight', 'completionWeight'],
    evidenceExpectations: ['Action count', 'Actions without an owner or a due date, named', 'Overdue actions, named'],
    notes:
      'C-7 RESOLVED at Phase 7 closure (ADR-0015 D-1 amended): the four HEALTH-v2 executive dimensions are authoritative for MET-HLTH-011, and the six HEALTH-v1 analytical dimensions are retained as the diagnostic detail view beneath them. Frozen: the mechanism is settled; weights and band edges remain open calibration (Type B) and live in the rule set. Separate from the economics on purpose: a plan can be arithmetically ' +
      'sound and completely unowned, and OVR-NO-CREDIBLE-PLAN needs to be able to say so.' }),
];

export const PHASE4_DATA_QUALITY_METRICS: readonly MetricDefinition[] = [
  def({ ...dq, id: 'MET-DQ-008', name: 'Validity', epistemicLevel: 'L2_DERIVED',
    authoritativeSourceType: 'DERIVED', status: 'Frozen',
    businessDefinition:
      'Share of supplied values that are within their declared domain — a date that is a date, a percentage between 0 and 100, a currency that exists.',
    formula: 'Σ valuesPassingDomainRules / Σ valuesChecked across domain probes',
    inputs: ['data-quality:DomainObservation'], unit: 'Percent', aggregation: 'WEIGHTED_MEAN',
    currencyBehaviour: 'NONE', edgeHandling: EDGE.ratio,
    evidenceExpectations: ['Each domain rule evaluated', 'Each violating value, named by field'],
    notes:
      'Carried a C-7 block tag in Phase 4. That tag was over-broad: a domain-validity ratio does ' +
      'not depend on which health model the organisation is accountable to, and no other blocker ' +
      'was ever named against it. C-7 is resolved at Phase 7 closure (ADR-0015 D-1, amended) and ' +
      'this metric is Frozen on its own terms. Distinct from MET-DQ-001 completeness and ' +
      'MET-DQ-003 consistency: a field can be present (complete) and reconcile across domains ' +
      '(consistent) while still holding a value that cannot be true.' }),
  def({ ...dq, id: 'MET-DQ-009', name: 'Forecast Reliability Profile', epistemicLevel: 'L3_ASSESSED',
    authoritativeSourceType: 'RULE_ENGINE', status: 'Draft',
    businessDefinition:
      'A named breakdown of the conditions that make this project\'s own forecast more or less believable, reported as factors rather than one number.',
    formula:
      'the vector [etcFreshnessDays, etcCoverage, scopeStability, milestoneAccuracy, ' +
      'openCustomerDependencies, resourceStability, MET-DEL-021] with each factor banded against ' +
      'DQ-v1 edges — a profile, never a product',
    inputs: [
      'MET-FIN-007', 'MET-COM-008', 'MET-DEL-009', 'MET-DEL-023', 'MET-RES-006', 'MET-DEL-021',
    ],
    unit: 'Tuple', aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'NONE',
    edgeHandling: EDGE.window(8), ruleSet: 'DQ-v1',
    calibrationParameters: [
      'etcFreshnessGreenEdge', 'etcFreshnessRedEdge', 'etcCoverageGreenEdge', 'etcCoverageRedEdge',
      'scopeStabilityGreenEdge', 'scopeStabilityRedEdge', 'milestoneAccuracyGreenEdge',
      'milestoneAccuracyRedEdge', 'dependencyGreenEdge', 'dependencyRedEdge',
      'resourceStabilityGreenEdge', 'resourceStabilityRedEdge',
      'requiredProductivityGreenEdge', 'requiredProductivityRedEdge',
    ],
    evidenceExpectations: [
      'Each factor with its observed value and its band',
      'Each factor that could not be evaluated, named with its reason',
    ],
    notes:
      'BLOCKED by CONFLICT C-9 / ADR-0015 — **Type A**. Owner: Assurance. Phase 4 direction lists seven forecast-reliability ' +
      'factors; the Frozen MET-DQ-007 formula names three different ones (MET-DEL-014, MET-FIN-030, ' +
      'MET-DEL-013). Rewriting a frozen formula to match a prompt is the silent change invariant 3 ' +
      'forbids, so both exist: MET-DQ-007 stays authoritative and unchanged, and this profile is ' +
      'registered separately and reported as factors. Deliberately a tuple, for the same reason ' +
      'MET-DQ-006 is: collapsing seven named conditions into one score tells an executive a number ' +
      'is low without telling them which condition to fix.' }),
];
