/**
 * Financial metric definitions — owned by the `financial` context.
 *
 * The authoritative formulas in the Phase 2 brief are implemented here verbatim. Where a Phase 0
 * `Draft` definition differed, the change is recorded in `versions.ts` with a reason —
 * `METRIC_CATALOG.md` §1.3 permits Draft definitions to change in Phase 2, but never silently
 * (global invariant 3).
 */
import { type MetricDefinition } from '../metric-types.js';
import { ALL_CONTRACT_TYPES, EDGE, FIXED_BID_ONLY, def } from './define.js';

const base = {
  sourceDomain: 'financial',
  owner: 'Finance',
  applicableContractTypes: ALL_CONTRACT_TYPES,
  status: 'Frozen',
  version: '1.0.0',
} as const;

export const FINANCIAL_METRICS: readonly MetricDefinition[] = [
  // --- Contract value and cost baselines -----------------------------------
  def({
    ...base, id: 'MET-FIN-001', name: 'Contract Value (As-Sold)', epistemicLevel: 'L1_OBSERVED', authoritativeSourceType: 'CONTRACT_SYSTEM',
    businessDefinition: 'Total contracted price at signature. The reference point every variance is measured from.',
    formula: 'AsSoldBaseline.contractValue',
    inputs: ['contract:AsSoldBaseline.contractValue'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'AS_SOLD',
    evidenceExpectations: ['Executed contract record', 'As-Sold baseline row (immutable)'],
    notes: 'Immutable. Restating it is prohibited (ADR-0003 §Decision 1).',
  }),
  def({
    ...base, id: 'MET-FIN-002', name: 'Contractual Revenue (Current Contractual)', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Commercial entitlement under the currently effective contract: the original contract plus contractual amendments and change requests that have become contractually effective. Excludes identified, submitted or negotiated changes that have not been executed.',
    formula: 'MET-FIN-001 + Σ ExecutedChange.valueDelta',
    inputs: ['MET-FIN-001', 'contract:ExecutedChange.valueDelta'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'CURRENT_CONTRACTUAL',
    evidenceExpectations: ['As-Sold baseline', 'Each executed change record with its execution date'],
    notes: 'Derived, never a stored editable row. Pending changes are excluded by construction.',
  }),
  def({
    ...base, id: 'MET-FIN-003', name: 'Budgeted Cost (As-Sold)', epistemicLevel: 'L1_OBSERVED', authoritativeSourceType: 'CONTRACT_SYSTEM',
    businessDefinition: 'Total planned delivery cost at signature.',
    formula: 'AsSoldBaseline.budgetedCost',
    inputs: ['contract:AsSoldBaseline.budgetedCost'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'AS_SOLD', evidenceExpectations: ['As-Sold baseline row (immutable)'],
  }),
  def({
    ...base, id: 'MET-FIN-004', name: 'Budgeted Cost (Current Contractual)', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Planned delivery cost including executed change requests only.',
    formula: 'MET-FIN-003 + Σ ExecutedChange.costDelta',
    inputs: ['MET-FIN-003', 'contract:ExecutedChange.costDelta'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'CURRENT_CONTRACTUAL', evidenceExpectations: ['As-Sold baseline', 'Executed change records'],
  }),

  // --- Actuals and estimates ------------------------------------------------
  def({
    ...base, id: 'MET-FIN-005', name: 'Cost to Date (ATD)', epistemicLevel: 'L1_OBSERVED', authoritativeSourceType: 'FINANCE_SYSTEM',
    businessDefinition: 'All delivery cost actually incurred to the as-of date: labour, non-labour and pass-through.',
    formula: 'Σ ActualCost.amount WHERE periodEnd ≤ t',
    inputs: ['financial:ActualCost.amount'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'ACTUAL_TO_DATE',
    evidenceExpectations: ['Cost ledger entries', 'Effort records reconciling to labour cost'],
  }),
  def({
    ...base, id: 'MET-FIN-006', name: 'Cost Progress Ratio (cost-to-cost)', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'The share of total forecast cost already incurred. A cost-based progress proxy used to compare against independently measured physical completion.',
    formula: 'MET-FIN-005 / MET-FIN-008',
    inputs: ['MET-FIN-005', 'MET-FIN-008'], unit: 'Ratio',
    aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'SINGLE_CURRENCY', edgeHandling: EDGE.ratio,
    evidenceExpectations: ['Cost ledger', 'ETC basis of estimate', 'Commitment register'],
    notes: 'Renamed from "Percent Complete (cost-to-cost)" in Phase 2 closure. **This is not a revenue recognition method.** Delivery Intelligence does not determine accounting revenue (Decision 1); recognised revenue is MET-FIN-009, an imported Finance fact. Compare this against MET-DEL-016 physical completion: a wide gap is the signal, and MET-FIN-027 Burn Gap is where that comparison is expressed.',
  }),
  def({
    ...base, id: 'MET-FIN-007', name: 'Estimate to Complete (ETC, bottom-up)', epistemicLevel: 'L1_OBSERVED', authoritativeSourceType: 'MANUAL_DECLARATION',
    businessDefinition: 'Management\'s bottom-up estimate of remaining cost to deliver the contracted scope.',
    formula: 'Σ EtcLineItem.amount (current forecast version)',
    inputs: ['financial:EtcLineItem.amount'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'FORECAST',
    evidenceExpectations: ['ETC line items with owner and date', 'Forecast version reference'],
    notes: 'A management assertion, recorded as an observed fact. Its optimism is measured by MET-FIN-030, not assumed away.',
  }),
  def({
    ...base, id: 'MET-FIN-023', name: 'Committed Future Cost', epistemicLevel: 'L1_OBSERVED', authoritativeSourceType: 'FINANCE_SYSTEM',
    businessDefinition: 'Cost already contractually committed but not yet incurred: signed subcontracts, purchase orders, non-cancellable licences.',
    formula: 'Σ Commitment.amount WHERE NOT incurred AND NOT cancellable',
    inputs: ['financial:Commitment.amount'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    evidenceExpectations: ['Purchase orders', 'Subcontract agreements'],
    notes: 'Separated from ETC because a commitment is contractually fixed while an estimate is not. Omitting it understates EAC.',
  }),
  def({
    ...base, id: 'MET-FIN-008', name: 'Estimate at Completion — Cost (EAC)', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Total expected delivery cost at completion: what has been spent, plus what is estimated to remain, plus what is already committed.',
    formula: 'MET-FIN-005 + MET-FIN-007 + MET-FIN-023',
    inputs: ['MET-FIN-005', 'MET-FIN-007', 'MET-FIN-023'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'FORECAST', version: '2.0.0',
    evidenceExpectations: ['Cost ledger', 'ETC line items', 'Commitment register'],
    notes: 'Also called Management EAC, to distinguish it from MET-FIN-029 Performance-Implied EAC. v2.0.0 adds committed future cost — see versions.ts.',
  }),
  def({
    ...base, id: 'MET-FIN-009', name: 'Recognised Revenue (cumulative to date)', epistemicLevel: 'L1_OBSERVED', authoritativeSourceType: 'FINANCE_SYSTEM',
    businessDefinition: 'Revenue booked to date under corporate accounting policy, as recorded by Finance. Delivery Intelligence consumes this figure; it does not compute it.',
    formula: 'FinanceSystem.recognisedRevenueToDate (imported fact)',
    inputs: ['financial:RecognisedRevenueFact.cumulativeAmount'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    evidenceExpectations: [
      'Finance/ERP recognised revenue record with period and posting reference',
      'The recognition policy identifier in force for the period',
    ],
    notes: 'OQ-2 CLOSED (Phase 2 closure, Decision 1). Recognition treatment is governed by corporate accounting policy and the underlying performance-obligation analysis — not by this product. Delivery Intelligence must not recreate the accounting ledger, must not derive this from MET-DEL-016 physical completion, and must not derive it from MET-FIN-029 Performance-Implied EAC. For the synthetic POC the value is produced by a documented synthetic recognition policy (rule set RECOGNITION-v1) and is still stored as an authoritative accounting fact, not as a computed metric.',
  }),
  def({
    ...base, id: 'MET-FIN-039', name: 'Recognised Revenue (period)', epistemicLevel: 'L1_OBSERVED', authoritativeSourceType: 'FINANCE_SYSTEM',
    businessDefinition: 'Revenue booked by Finance in a single reporting period, as recorded in the accounting ledger.',
    formula: 'FinanceSystem.recognisedRevenueInPeriod (imported fact)',
    inputs: ['financial:RecognisedRevenueFact.periodAmount'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    evidenceExpectations: [
      'Finance/ERP posting for the period',
      'Reporting period identifier resolved against the entity fiscal calendar',
    ],
    notes: 'Added in Phase 2 closure (Decision 11). Period and cumulative are separate metrics because a period figure is what Finance reports and a cumulative figure is what margin-to-date needs; deriving one from the other across a restatement would silently disagree with the ledger.',
  }),
  def({
    ...base, id: 'MET-FIN-010', name: 'Forecast Revenue (base)', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Revenue expected to be contractually earned by project completion under the current contractual baseline. Includes contractually effective revenue only; pending and unexecuted change requests are excluded.',
    formula: 'MET-FIN-002',
    inputs: ['MET-FIN-002'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'FORECAST',
    evidenceExpectations: ['Current contractual baseline derivation', 'Executed change records'],
    notes: 'A Delivery Intelligence deterministic project-economic metric — **not** accounting recognised revenue (MET-FIN-009). Hard product rule (REQ-FIN-005): unexecuted CRs may never inflate this. Pending CR recovery reaches only MET-FIN-031 Risk-Adjusted Revenue, and only as a labelled scenario.',
  }),
  def({
    ...base, id: 'MET-FIN-011', name: 'Unsecured Upside', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Face value of change requests raised but not executed. Reported beside forecast revenue, never inside it.',
    formula: 'Σ PendingChange.proposedValue WHERE NOT superseded',
    inputs: ['contract:PendingChange.proposedValue'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    applicableContractTypes: FIXED_BID_ONLY,
    evidenceExpectations: ['Pending change records with raise dates'],
    notes: 'Distinct from MET-COM-010, which probability-weights the same population for scenario analysis.',
  }),

  // --- Margin ---------------------------------------------------------------
  def({
    ...base, id: 'MET-FIN-026', name: 'Sold GM $', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Gross margin in currency at the price and cost we sold.',
    formula: 'MET-FIN-001 − MET-FIN-003',
    inputs: ['MET-FIN-001', 'MET-FIN-003'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'AS_SOLD', evidenceExpectations: ['As-Sold baseline row'],
  }),
  def({
    ...base, id: 'MET-FIN-024', name: 'Forecast GM $', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Gross margin in currency expected at completion, on secured revenue only.',
    formula: 'MET-FIN-010 − MET-FIN-008',
    inputs: ['MET-FIN-010', 'MET-FIN-008'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'FORECAST', evidenceExpectations: ['Forecast revenue derivation', 'EAC components'],
  }),
  def({
    ...base, id: 'MET-FIN-012', name: 'Gross Margin — As-Sold', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Percentage margin at signature.',
    formula: 'MET-FIN-026 / MET-FIN-001',
    inputs: ['MET-FIN-026', 'MET-FIN-001'], unit: 'Percent',
    aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'SINGLE_CURRENCY', edgeHandling: EDGE.ratio,
    baseline: 'AS_SOLD', evidenceExpectations: ['As-Sold baseline row'],
  }),
  def({
    ...base, id: 'MET-FIN-013', name: 'Gross Margin — Current Contractual', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Percentage margin against the contractual baseline including executed changes.',
    formula: '(MET-FIN-002 − MET-FIN-004) / MET-FIN-002',
    inputs: ['MET-FIN-002', 'MET-FIN-004'], unit: 'Percent',
    aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'SINGLE_CURRENCY', edgeHandling: EDGE.ratio,
    baseline: 'CURRENT_CONTRACTUAL', evidenceExpectations: ['Executed change records'],
  }),
  def({
    ...base, id: 'MET-FIN-014', name: 'Gross Margin — Forecast', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Percentage margin expected at completion. The headline economics number.',
    formula: 'MET-FIN-024 / MET-FIN-010',
    inputs: ['MET-FIN-024', 'MET-FIN-010'], unit: 'Percent',
    aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'SINGLE_CURRENCY', edgeHandling: EDGE.ratio,
    baseline: 'FORECAST', evidenceExpectations: ['Forecast revenue derivation', 'EAC components'],
    notes: 'Aggregates as a weighted mean over revenue, never as a mean of project percentages (MET-PORT-002).',
  }),
  def({
    ...base, id: 'MET-FIN-015', name: 'Gross Margin — Actual to Date', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Margin realised on the revenue Finance has recognised so far, against the cost incurred to earn it.',
    formula: '(MET-FIN-009 − MET-FIN-005) / MET-FIN-009',
    inputs: ['MET-FIN-009', 'MET-FIN-005'], unit: 'Percent',
    aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'SINGLE_CURRENCY', edgeHandling: EDGE.ratio,
    baseline: 'ACTUAL_TO_DATE',
    evidenceExpectations: ['Finance recognised revenue record', 'Cost ledger'],
    notes: 'Unblocked by the OQ-2 closure: MET-FIN-009 is now an imported Finance fact, so this is computable. It is an accounting-derived backward view and will differ from MET-FIN-014, which is contractual and forward-looking. The two answering differently is expected, not a reconciliation failure.',
  }),
  def({
    ...base, id: 'MET-FIN-016', name: 'Margin Erosion (pp)', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'How many percentage points of margin have been lost against the price and cost we sold.',
    formula: 'MET-FIN-014 − MET-FIN-012',
    inputs: ['MET-FIN-014', 'MET-FIN-012'], unit: 'PercentagePoints',
    aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'NONE', edgeHandling: EDGE.ratio,
    baseline: 'AS_SOLD', evidenceExpectations: ['Both margin derivations'],
    notes: 'Negative means erosion. Percentage-point differences are not aggregatable; use MET-FIN-025 in currency for portfolio views.',
  }),
  def({
    ...base, id: 'MET-FIN-017', name: 'Margin Value Delta', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Signed movement in margin currency between as-sold and forecast. The total the margin bridge must reconcile to.',
    formula: 'MET-FIN-024 − MET-FIN-026',
    inputs: ['MET-FIN-024', 'MET-FIN-026'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'AS_SOLD', evidenceExpectations: ['Both margin derivations'],
    notes: 'Negative means margin lost. MET-FIN-025 is the same quantity sign-flipped for erosion reporting; a golden test asserts the identity.',
  }),
  def({
    ...base, id: 'MET-FIN-025', name: 'GM Erosion $', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Margin lost in currency against the as-sold position. Positive means margin has been lost.',
    formula: 'MET-FIN-026 − MET-FIN-024',
    inputs: ['MET-FIN-026', 'MET-FIN-024'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'AS_SOLD', evidenceExpectations: ['Both margin derivations'],
    notes: 'Exactly −MET-FIN-017. Both exist because executives read erosion as a positive number while the bridge needs a signed delta. The identity is asserted by test so the two can never disagree.',
  }),
  def({
    ...base, id: 'MET-FIN-018', name: 'Margin Bridge Decomposition', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'The named causes that together explain the entire movement from as-sold margin to forecast margin.',
    formula: 'Ordered causes summing exactly to MET-FIN-017: scope-without-CR, effort overrun, rate/mix, schedule extension, quality rework, pass-through, FX, named residual',
    inputs: ['MET-FIN-017', 'MET-COM-009', 'MET-RES-002', 'MET-RES-005', 'MET-QUA-006', 'MET-FIN-038'],
    unit: 'MoneyBreakdown',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'AS_SOLD', applicableContractTypes: FIXED_BID_ONLY,
    evidenceExpectations: ['Each cause traced to the L1 records that produced it'],
    notes: 'AC-4: causes must sum exactly, to the cent. Largest-remainder allocation guarantees rounded parts sum to the rounded whole.',
  }),

  // --- Performance diagnostics (Phase 2 brief) ------------------------------
  def({
    ...base, id: 'MET-FIN-028', name: 'Cost Consumed %', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Proportion of the contractual cost budget already spent.',
    formula: 'MET-FIN-005 / MET-FIN-004',
    inputs: ['MET-FIN-005', 'MET-FIN-004'], unit: 'Percent',
    aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'SINGLE_CURRENCY', edgeHandling: EDGE.ratio,
    baseline: 'CURRENT_CONTRACTUAL', evidenceExpectations: ['Cost ledger', 'Contractual cost baseline'],
  }),
  def({
    ...base, id: 'MET-FIN-027', name: 'Burn Gap', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'How far spending has run ahead of delivered progress. Positive means money is being consumed faster than value is being produced.',
    formula: 'MET-FIN-028 − MET-DEL-016',
    inputs: ['MET-FIN-028', 'MET-DEL-016'], unit: 'PercentagePoints',
    aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'NONE', edgeHandling: EDGE.ratio,
    evidenceExpectations: ['Cost ledger', 'Physical completion claim with its basis'],
    notes: 'The earliest reliable economic warning available, because it moves before ETC is revised.',
  }),
  def({
    ...base, id: 'MET-FIN-029', name: 'Performance-Implied EAC', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'An extrapolative diagnostic comparing actual cost incurred with independently measured physical completion: the total cost implied if realised cost efficiency relative to physical progress continued.',
    formula: 'MET-FIN-005 / MET-DEL-016',
    inputs: ['MET-FIN-005', 'MET-DEL-016'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED',
    edgeHandling: {
      zeroDenominator: 'NOT_COMPUTABLE', missingInput: 'NOT_COMPUTABLE', minimumHistoryWeeks: 0,
      precondition: 'MET-DEL-016 ≥ maturity threshold (rule set EAC-v1, default 20%) and the progress measure is assessed meaningful. Below the threshold the extrapolation is arithmetic noise.',
    },
    ruleSet: 'EAC-v1', calibrationParameters: ['maturityThresholdCompletion', 'progressMeasureCredibilityRequired'],
    evidenceExpectations: ['Cost ledger', 'Physical completion claim', 'Maturity threshold in force'],
    notes: 'A diagnostic, not an authority. It is **not** an accounting revenue-recognition method, **not** a substitute for bottom-up ETC, **not** the official EAC, and **not** a cost-to-cost revenue calculation (Phase 2 closure, Decision 3). Its only job is to be an independent check on MET-FIN-008.',
  }),
  def({
    ...base, id: 'MET-FIN-042', name: 'GM Value at Risk Ratio', epistemicLevel: 'L2_DERIVED',
    authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Margin at risk as a share of the margin originally sold.',
    formula: 'MET-FIN-019 / MET-FIN-026',
    inputs: ['MET-FIN-019', 'MET-FIN-026'], unit: 'Ratio',
    aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'NONE',
    edgeHandling: {
      zeroDenominator: 'NOT_COMPUTABLE', missingInput: 'NOT_COMPUTABLE', minimumHistoryWeeks: 0,
    },
    // Inherited, not chosen: both MET-FIN-019 and MET-FIN-026 are measured against the as-sold
    // position, so the ratio of the two is too.
    baseline: 'AS_SOLD',
    ruleSet: 'VAR-v1', calibrationParameters: [],
    evidenceExpectations: ['MET-FIN-019', 'MET-FIN-026'],
    notes:
      'The comparand behind OVR-CONTRACT-LOSS, which previously cited MET-FIN-019 -- a MONEY metric '
      + '-- while comparing a ratio against 0.80 (DR-065, closed by ADR-0025 follow-up). '
      + 'IT CAN EXCEED 1: once risk-adjusted GM is negative the exposure covers the sold margin lost '
      + 'AND the contract loss beyond it, so a value of 1.17 means 117% of sold margin is at risk. '
      + 'It is NOT the share of sold margin remaining and must never be presented as such.',
  }),
  def({
    ...base, id: 'MET-FIN-043', name: 'EAC Increase Ratio', epistemicLevel: 'L2_DERIVED',
    authoritativeSourceType: 'DERIVED',
    businessDefinition: 'How far the estimate at completion has risen against the earliest estimate on record.',
    formula: '(MET-FIN-008@latest - MET-FIN-008@earliest) / MET-FIN-008@earliest',
    inputs: ['MET-FIN-008'], unit: 'Ratio',
    aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'NONE',
    edgeHandling: {
      zeroDenominator: 'NOT_COMPUTABLE', missingInput: 'NOT_COMPUTABLE', minimumHistoryWeeks: 0,
      precondition: 'Requires at least two EAC observations on record.',
    },
    evidenceExpectations: ['The earliest and latest MET-FIN-008 on record'],
    notes:
      'The comparand behind EW-EAC-INCREASE, which previously cited MET-FIN-008 -- Money -- while '
      + 'comparing a ratio against 0.05 (DR-065). Signed: a falling EAC gives a negative value.',
  }),
  def({
    ...base, id: 'MET-FIN-040', name: 'ETC Optimism Ratio', epistemicLevel: 'L2_DERIVED',
    authoritativeSourceType: 'DERIVED',
    businessDefinition: 'The ETC optimism gap expressed as a share of the stated estimate at completion.',
    formula: 'MET-FIN-030 / MET-FIN-008',
    inputs: ['MET-FIN-030', 'MET-FIN-008'], unit: 'Ratio',
    aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'NONE',
    edgeHandling: {
      zeroDenominator: 'NOT_COMPUTABLE', missingInput: 'NOT_COMPUTABLE', minimumHistoryWeeks: 0,
      precondition: 'Inherits the maturity gate on MET-FIN-029 through MET-FIN-030.',
    },
    ruleSet: 'EAC-v1', calibrationParameters: ['maturityThresholdCompletion'],
    evidenceExpectations: ['MET-FIN-030 gap', 'MET-FIN-008 stated EAC'],
    notes:
      'The comparand behind ELV-ETC-OPTIMISM. Registered by ADR-0025 because the rule previously '
      + 'compared a ratio against 0.10 while citing MET-FIN-030, which is Money, not a ratio -- so '
      + 'the thing actually being compared had no registered metric. The DENOMINATOR IS THE STATED '
      + 'EAC, so the metric reads "management\'s estimate is understated by X% of itself", which is '
      + 'what the rule narrative claims. Denominator sensitivity was measured before the choice was '
      + 'made: using MET-FIN-029 instead yields an identical breach count (7) on the demo portfolio, '
      + 'so the decision is not outcome-selected.',
  }),
  def({
    ...base, id: 'MET-FIN-041', name: 'Attributed Movement Coverage', epistemicLevel: 'L2_DERIVED',
    authoritativeSourceType: 'DERIVED',
    businessDefinition: 'The share of a margin bridge\'s GROSS movement carried by its named causes rather than by the unattributed residual.',
    formula: 'Sum of |named MET-FIN-018 causes| / (Sum of |named MET-FIN-018 causes| + |residual|)',
    inputs: ['MET-FIN-018'], unit: 'Ratio',
    aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'NONE',
    edgeHandling: {
      zeroDenominator: 'NOT_COMPUTABLE', missingInput: 'NOT_COMPUTABLE', minimumHistoryWeeks: 0,
      precondition: 'A bridge with no gross movement has nothing to attribute: NOT_COMPUTABLE, never 100%.',
    },
    evidenceExpectations: ['The named causes of MET-FIN-018', 'The residual'],
    notes:
      'GROSS, NOT NET. This is NOT the percentage of net margin change explained, and must never be '
      + 'labelled as such. Named drivers of +$5.0M and -$5.1M with a zero residual give coverage of '
      + '100% while the NET delta is only -$0.1M; both readings are true and only the gross one is '
      + 'measured here. Registered by ADR-0025: the value was already rendered to executives with no '
      + 'id, owner, version or catalog entry. It exists because MET-FIN-018 reconciles BY '
      + 'CONSTRUCTION -- the residual is defined as the total less the named causes -- so AC-4 holds '
      + 'however little the named causes explain. A net denominator was rejected: it is undefined at '
      + 'zero net delta and unstable near it.',
  }),
  def({
    ...base, id: 'MET-FIN-030', name: 'ETC Optimism Gap', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'How much lower management\'s estimate at completion is than the project\'s own demonstrated performance implies.',
    formula: 'max(0, MET-FIN-029 − MET-FIN-008)',
    inputs: ['MET-FIN-029', 'MET-FIN-008'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED',
    edgeHandling: {
      zeroDenominator: 'NOT_APPLICABLE', missingInput: 'NOT_COMPUTABLE', minimumHistoryWeeks: 0,
      precondition: 'Inherits the maturity gate on MET-FIN-029.',
    },
    ruleSet: 'EAC-v1', calibrationParameters: ['maturityThresholdCompletion'],
    evidenceExpectations: ['Both EAC derivations', 'Maturity threshold in force'],
    notes: 'Clamped at zero: a management EAC above the implied figure is prudence, not optimism, and is not reported as a gap.',
  }),

  // --- Risk-adjusted view ---------------------------------------------------
  def({
    ...base, id: 'MET-FIN-031', name: 'Risk-Adjusted Revenue', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Secured revenue plus the probability-weighted value of pending change requests. A scenario view, never the base forecast.',
    formula: 'MET-FIN-010 + MET-COM-010',
    inputs: ['MET-FIN-010', 'MET-COM-010'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    applicableContractTypes: FIXED_BID_ONLY, ruleSet: 'VAR-v1', calibrationParameters: [],
    evidenceExpectations: ['Pending change records with probability assessments and assessor'],
    notes: 'Must always be displayed as a scenario, distinct from MET-FIN-010 (REQ-FIN-005, REQ-MRGN-003).',
  }),
  def({
    ...base, id: 'MET-FIN-032', name: 'Risk-Adjusted GM $', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Expected margin once unresolved risk not already in the estimate is deducted and probable change recovery is added.',
    formula: 'MET-FIN-031 − MET-FIN-008 − MET-RSK-008',
    inputs: ['MET-FIN-031', 'MET-FIN-008', 'MET-RSK-008'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    ruleSet: 'VAR-v1', calibrationParameters: [],
    evidenceExpectations: ['EAC components', 'Risk register with IncludedInETC flags', 'Pending CR probabilities'],
    notes: 'Deducting only incremental risk is what prevents double counting: a risk already provisioned inside ETC must not be subtracted twice.',
  }),
  def({
    ...base, id: 'MET-FIN-033', name: 'Risk-Adjusted GM %', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Risk-adjusted margin as a percentage of risk-adjusted revenue.',
    formula: 'MET-FIN-032 / MET-FIN-031',
    inputs: ['MET-FIN-032', 'MET-FIN-031'], unit: 'Percent',
    aggregation: 'WEIGHTED_MEAN', currencyBehaviour: 'SINGLE_CURRENCY', edgeHandling: EDGE.ratio,
    ruleSet: 'VAR-v1', calibrationParameters: [], evidenceExpectations: ['Both risk-adjusted derivations'],
  }),
  def({
    ...base, id: 'MET-FIN-019', name: 'GM Value at Risk', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'How much of the margin we sold is now at risk once forecast performance and unresolved risk are taken into account.',
    formula: 'max(0, MET-FIN-026 − MET-FIN-032)',
    inputs: ['MET-FIN-026', 'MET-FIN-032'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'AS_SOLD', ruleSet: 'VAR-v1', calibrationParameters: [], version: '2.0.0',
    evidenceExpectations: ['Sold margin', 'Risk-adjusted margin derivation', 'Rule set version'],
    notes: 'Resolves MC-4. Clamped at zero and capped at MET-FIN-002 — a project cannot put more at risk than its contract value. v2.0.0 replaces the Phase 0 placeholder with the Phase 2 brief formula.',
  }),

  // --- Contingency ----------------------------------------------------------
  def({
    ...base, id: 'MET-FIN-036', name: 'Contingency Budget', epistemicLevel: 'L1_OBSERVED', authoritativeSourceType: 'CONTRACT_SYSTEM',
    businessDefinition: 'The cost buffer set aside at baseline to absorb estimating and delivery uncertainty.',
    formula: 'AsSoldBaseline.contingencyBudget + Σ ExecutedChange.contingencyDelta',
    inputs: ['contract:AsSoldBaseline.contingencyBudget'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'CURRENT_CONTRACTUAL', applicableContractTypes: FIXED_BID_ONLY,
    evidenceExpectations: ['Baseline contingency line', 'Executed change contingency adjustments'],
  }),
  def({
    ...base, id: 'MET-FIN-037', name: 'Contingency Consumed', epistemicLevel: 'L1_OBSERVED', authoritativeSourceType: 'FINANCE_SYSTEM',
    businessDefinition: 'Contingency drawn down to date, by authorised drawdown record.',
    formula: 'Σ ContingencyDrawdown.amount WHERE date ≤ t',
    inputs: ['financial:ContingencyDrawdown.amount'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    applicableContractTypes: FIXED_BID_ONLY,
    evidenceExpectations: ['Drawdown records with authoriser and reason'],
  }),
  def({
    ...base, id: 'MET-FIN-035', name: 'Contingency Consumed %', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Proportion of the contingency buffer already used.',
    formula: 'MET-FIN-037 / MET-FIN-036',
    inputs: ['MET-FIN-037', 'MET-FIN-036'], unit: 'Percent',
    aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'SINGLE_CURRENCY', edgeHandling: EDGE.ratio,
    applicableContractTypes: FIXED_BID_ONLY,
    evidenceExpectations: ['Drawdown records', 'Baseline contingency line'],
    notes: 'Resolves MC-9.',
  }),
  def({
    ...base, id: 'MET-FIN-034', name: 'Contingency Burn Gap', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'How far contingency consumption has outrun delivered progress. Positive means the buffer is being spent faster than the project is being delivered.',
    formula: 'MET-FIN-035 − MET-DEL-016',
    inputs: ['MET-FIN-035', 'MET-DEL-016'], unit: 'PercentagePoints',
    aggregation: 'NOT_AGGREGATABLE', currencyBehaviour: 'NONE', edgeHandling: EDGE.ratio,
    applicableContractTypes: FIXED_BID_ONLY,
    evidenceExpectations: ['Drawdown records', 'Physical completion claim'],
    notes: 'A project 48% complete having consumed 82% of contingency has, in effect, already spent its margin protection.',
  }),

  // --- Remaining Phase 0 metrics, retained -----------------------------------
  def({
    ...base, id: 'MET-FIN-020', name: 'Burn Rate', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Average delivery cost consumed per period over the recent past.',
    formula: 'Σ MET-FIN-005 over trailing 4 periods / 4',
    inputs: ['MET-FIN-005'], unit: 'Money/period',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.window(4),
    evidenceExpectations: ['Cost ledger for the trailing window'],
  }),
  def({
    ...base, id: 'MET-FIN-021', name: 'Budget Runway', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'How many periods of spending remain before the contractual cost budget is exhausted at the current rate.',
    formula: '(MET-FIN-004 − MET-FIN-005) / MET-FIN-020',
    inputs: ['MET-FIN-004', 'MET-FIN-005', 'MET-FIN-020'], unit: 'Periods',
    aggregation: 'MIN', currencyBehaviour: 'SINGLE_CURRENCY', edgeHandling: EDGE.window(4),
    baseline: 'CURRENT_CONTRACTUAL', evidenceExpectations: ['Cost ledger', 'Contractual cost baseline'],
  }),
  def({
    ...base, id: 'MET-FIN-022', name: 'Cost Variance to Baseline', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'Difference between planned and actual cost at the as-of date, against a named baseline.',
    formula: 'PlannedCost@t (named baseline) − MET-FIN-005',
    inputs: ['MET-FIN-005', 'contract:baseline.plannedCostCurve'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'CURRENT_CONTRACTUAL',
    evidenceExpectations: ['Planned cost curve for the named baseline', 'Cost ledger'],
  }),
  def({
    ...base, id: 'MET-FIN-038', name: 'FX Margin Impact', epistemicLevel: 'L2_DERIVED', authoritativeSourceType: 'DERIVED',
    businessDefinition: 'The portion of margin movement caused by exchange-rate movement rather than by delivery performance.',
    formula: 'MET-FIN-024 at current rates − MET-FIN-024 at as-sold rates',
    inputs: ['MET-FIN-024', 'financial:FxRate'], unit: 'Money',
    aggregation: 'SUM', currencyBehaviour: 'FX_CONVERT_REQUIRED', edgeHandling: EDGE.noDenominator,
    baseline: 'AS_SOLD',
    evidenceExpectations: ['As-sold FX rates with dates and source', 'Current FX rates with dates and source'],
    notes: 'Its own named cause in MET-FIN-018 so the bridge separates what the delivery team caused from what it did not.',
  }),
];
