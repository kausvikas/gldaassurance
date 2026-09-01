/**
 * Gallery fixtures — **DEMO — SYNTHETIC DATA**.
 *
 * Hand-written view models for the component gallery. They live in `scripts/` rather than `src/`
 * because they are a demo artefact, not product code, and because a fixture inside the presentation
 * layer eventually gets imported by a real screen.
 *
 * Every figure here is a **pre-formatted string**, exactly as the Application layer would supply it.
 * That is the point of the exercise as much as the pictures are: if a component could be built from
 * these fixtures only by computing something, the component's contract would be wrong, and we would
 * find out here rather than in Phase 7.
 *
 * The narrative deliberately matches `SYNTHETIC_DATA_SPEC.md`'s shape — a Reported-Green project
 * that the system assesses Amber (AC-2), a margin bridge that reconciles (AC-4) — so the gallery
 * shows the components under the load they will actually carry.
 */
import type {
  BubbleMatrixViewModel, ExecutiveActionViewModel, FilterViewModel, ForecastOutlookViewModel,
  FreshnessViewModel, InsightViewModel, KpiViewModel, MetricComparisonViewModel,
  ProgressBurnViewModel, ReportingPeriodViewModel, ScopeSelectionViewModel,
  StatusConflictViewModel, TableViewModel, TrendChartViewModel, WaterfallViewModel,
} from '@presentation/index.js';
import { statusFor } from '@presentation/index.js';

export const SCOPE: ScopeSelectionViewModel = {
  label: 'Portfolio scope',
  selectedId: 'bu-emea',
  available: [
    { id: 'all', label: 'All authorised', kind: 'BUSINESS_UNIT' },
    { id: 'bu-emea', label: 'EMEA', kind: 'BUSINESS_UNIT' },
    { id: 'bu-americas', label: 'Americas', kind: 'BUSINESS_UNIT' },
    { id: 'bu-apac', label: 'APAC', kind: 'BUSINESS_UNIT' },
  ],
};

export const PERIOD: ReportingPeriodViewModel = {
  selectedId: '2026-08',
  asAtLabel: 'as at 31 Aug 2026',
  periods: [
    { id: '2026-08', label: 'Aug 2026' },
    { id: '2026-q3', label: 'Q3 2026' },
    { id: '2026-fy', label: 'FY 2026' },
  ],
};

export const FRESHNESS_CURRENT: FreshnessViewModel = {
  state: 'CURRENT', glyph: '●', label: 'Data current',
  detail: 'Finance 7h · Delivery 1d · Contract 1d',
  degradedSources: [],
};

export const FRESHNESS_DEGRADED: FreshnessViewModel = {
  state: 'DEGRADED', glyph: '▲', label: 'Sources degraded',
  detail: 'Finance 7h · Delivery 12d · Contract sync failed',
  degradedSources: ['Delivery tracker', 'Contract system'],
  servingLastKnownGood: true,
};

export const USER = { name: 'A. Okafor', roleLabel: 'Portfolio Director' } as const;

export const KPIS: readonly KpiViewModel[] = [
  {
    id: 'var',
    label: 'Gross margin at risk',
    value: '$4.82M',
    treatment: 'computed',
    status: statusFor('critical', 'Critical'),
    delta: { direction: 'up', sentiment: 'negative', display: '+$1.10M', comparisonLabel: 'vs Jul' },
    metricId: 'MET-FIN-013',
    evidence: {
      title: 'Gross margin at risk',
      metricId: 'MET-FIN-013',
      ruleVersion: 'FIN-v2.1',
      computedAt: '31 Aug 2026 02:14 UTC',
      sources: ['Finance / ERP', 'Contract system'],
      lines: [
        { label: 'Contract value (as-sold)', value: '$61.40M', treatment: 'fact' },
        { label: 'Forecast gross margin', value: '18.1%', treatment: 'computed' },
        { label: 'As-sold gross margin', value: '26.0%', treatment: 'fact' },
        { label: 'Margin erosion', value: '−7.9pp', treatment: 'computed' },
      ],
    },
  },
  {
    id: 'projects',
    label: 'Projects in scope',
    value: '34',
    treatment: 'fact',
    delta: { direction: 'flat', sentiment: 'neutral', display: 'no change', comparisonLabel: 'vs Jul' },
  },
  {
    id: 'divergent',
    label: 'Reported Green, assessed Amber or Red',
    value: '6',
    unitHint: 'of 34',
    treatment: 'computed',
    status: statusFor('caution', 'Attention'),
    delta: { direction: 'up', sentiment: 'negative', display: '+2', comparisonLabel: 'vs Jul' },
  },
  {
    id: 'cost-rate',
    label: 'Blended cost rate',
    value: '',
    treatment: 'fact',
    restricted: true,
  },
];

export const CONFLICT: StatusConflictViewModel = {
  reported: statusFor('positive', 'Green'),
  assessed: statusFor('caution', 'Amber'),
  reportedBy: 'Delivery Manager, 28 Aug',
  divergenceSummary:
    'Schedule and margin dimensions both breach their amber thresholds while reported status is '
    + 'unchanged from June. Two milestones slipped inside the reporting window.',
  evidence: {
    title: 'Divergence evidence',
    metricId: 'MET-HLTH-009',
    ruleVersion: 'HEALTH-v1.4',
    computedAt: '31 Aug 2026 02:14 UTC',
    sources: ['Delivery tracker', 'Finance / ERP'],
    lines: [
      { label: 'Schedule dimension', value: 'Amber (0.42)', treatment: 'computed' },
      { label: 'Margin dimension', value: 'Amber (0.38)', treatment: 'computed' },
      { label: 'Quality dimension', value: 'Green (0.81)', treatment: 'computed' },
      { label: 'Milestones slipped in window', value: '2', treatment: 'fact' },
    ],
  },
};

export const OUTLOOK: ForecastOutlookViewModel = {
  headline: 'Projected to close 5.2pp below as-sold margin',
  basis: 'Cost-to-cost trajectory over 8 weeks, 34 projects',
  rangeLabel: '−3.9pp to −6.6pp (80% band)',
  ruleVersion: 'FCST-v1.2',
  confidence: {
    level: 'MEDIUM',
    label: 'Medium',
    rationale: 'Delivery tracker is 12 days stale; forecast rests on 6 of 8 expected inputs.',
  },
};

export const INSIGHTS: readonly InsightViewModel[] = [
  {
    id: 'i1',
    tone: 'critical',
    treatment: 'computed',
    headline: 'Meridian Payments has consumed 78% of budget at 54% completion',
    body: 'Burn outpaced physical completion for six consecutive weeks. The gap widened after the '
      + 'June change request was absorbed without a baseline revision.',
  },
  {
    id: 'i2',
    tone: 'analytic',
    treatment: 'inferred',
    headline: 'Two accounts show the early pattern that preceded last year’s recoveries',
    body: 'Similar erosion slope and the same sequence of milestone slips. This is a model '
      + 'similarity judgement, not an observation, and it has not been validated against outcomes.',
  },
];

export const ACTIONS: readonly ExecutiveActionViewModel[] = [
  {
    id: 'a1',
    title: 'Commission a delivery review on Meridian Payments',
    rationale: 'Highest value at risk in scope, deteriorating for six weeks, and intervenable — the '
      + 'contract has a scope-change mechanism that has not been used.',
    owner: 'A. Okafor',
    dueLabel: '5 Sep 2026',
    status: statusFor('critical', 'Critical'),
    valueAtRisk: '$1.84M',
    primaryActionLabel: 'Open recovery plan',
  },
  {
    id: 'a2',
    title: 'Re-baseline Northwind after executed change order',
    rationale: 'The executed change order has not been reflected in the current baseline, so every '
      + 'variance on this project is measured against the wrong denominator.',
    owner: 'R. Silveira',
    dueLabel: '12 Sep 2026',
    status: statusFor('caution', 'At risk'),
    valueAtRisk: '$0.42M',
  },
];

export const PORTFOLIO_TABLE: TableViewModel = {
  caption: 'Projects in scope, ranked by intervention priority',
  summary: '6 of 34 projects · ranked by value at risk × deterioration × intervenability',
  density: 'compact',
  columns: [
    { key: 'project', header: 'Project', widthHint: '26%' },
    { key: 'account', header: 'Account' },
    { key: 'reported', header: 'Reported', description: 'Status reported by the delivery manager' },
    { key: 'assessed', header: 'Assessed', description: 'Status assessed by the health model' },
    { key: 'trajectory', header: 'Trajectory' },
    { key: 'var', header: 'GM at risk', align: 'end', sort: 'descending' },
    { key: 'margin', header: 'Forecast GM', align: 'end' },
  ],
  rows: [
    {
      id: 'p1',
      cells: {
        project: { display: 'Meridian Payments Platform', emphasis: true },
        account: { display: 'Meridian Financial' },
        reported: { status: statusFor('positive', 'Green') },
        assessed: { status: statusFor('critical', 'Red') },
        trajectory: { trajectory: { direction: 'deteriorating', glyph: '▼', label: 'Deteriorating', windowLabel: '6 wks' } },
        var: { display: '$1.84M', treatment: 'computed' },
        margin: { display: '11.4%', treatment: 'computed' },
      },
    },
    {
      id: 'p2',
      cells: {
        project: { display: 'Northwind Logistics Core' },
        account: { display: 'Northwind Group' },
        reported: { status: statusFor('caution', 'Amber') },
        assessed: { status: statusFor('caution', 'Amber') },
        trajectory: { trajectory: { direction: 'stable', glyph: '▬', label: 'Stable', windowLabel: '6 wks' } },
        var: { display: '$0.42M', treatment: 'computed' },
        margin: { display: '19.8%', treatment: 'computed' },
      },
    },
    {
      id: 'p3',
      cells: {
        project: { display: 'Helios Retail Modernisation' },
        account: { display: 'Helios Retail' },
        reported: { status: statusFor('positive', 'Green') },
        assessed: { status: statusFor('caution', 'Amber') },
        trajectory: { trajectory: { direction: 'deteriorating', glyph: '▼', label: 'Deteriorating', windowLabel: '4 wks' } },
        var: { display: '$0.31M', treatment: 'computed' },
        margin: { restricted: true },
      },
    },
    {
      id: 'p4',
      cells: {
        project: { display: 'Aster Health Data Platform' },
        account: { display: 'Aster Health' },
        reported: { status: statusFor('positive', 'Green') },
        assessed: { status: statusFor('positive', 'Green') },
        trajectory: { trajectory: { direction: 'improving', glyph: '▲', label: 'Improving', windowLabel: '6 wks' } },
        var: { display: '$0.04M', treatment: 'computed' },
        margin: { display: '27.9%', treatment: 'computed' },
      },
    },
    {
      id: 'p5',
      cells: {
        project: { display: 'Vantage Telecom OSS' },
        account: { display: 'Vantage Telecom' },
        reported: { status: statusFor('neutral', 'Not reported') },
        assessed: { status: statusFor('neutral', 'No data') },
        trajectory: { trajectory: { direction: 'unknown', glyph: '◌', label: 'Unknown', windowLabel: '—' } },
        var: { display: '—' },
        margin: { display: '—' },
      },
    },
  ],
};

export const FILTERS: readonly FilterViewModel[] = [
  {
    id: 'status', label: 'Status', selected: 'all',
    options: [
      { value: 'all', label: 'All statuses' },
      { value: 'red', label: 'Red only' },
      { value: 'divergent', label: 'Divergent only' },
    ],
  },
  {
    id: 'engagement', label: 'Engagement', selected: 'all',
    options: [
      { value: 'all', label: 'All models' },
      { value: 'fixed', label: 'Fixed price' },
      { value: 'tm', label: 'Time & materials' },
    ],
  },
];

const trendTable: TableViewModel = {
  caption: 'Forecast gross margin by week',
  columns: [
    { key: 'week', header: 'Week' },
    { key: 'forecast', header: 'Forecast GM', align: 'end' },
    { key: 'sold', header: 'As-sold GM', align: 'end' },
    { key: 'kind', header: 'Basis' },
  ],
  rows: [
    { id: 'w1', cells: { week: { display: '7 Jul' }, forecast: { display: '24.8%' }, sold: { display: '26.0%' }, kind: { display: 'Actual' } } },
    { id: 'w2', cells: { week: { display: '21 Jul' }, forecast: { display: '23.1%' }, sold: { display: '26.0%' }, kind: { display: 'Actual' } } },
    { id: 'w3', cells: { week: { display: '4 Aug' }, forecast: { display: '21.0%' }, sold: { display: '26.0%' }, kind: { display: 'Actual' } } },
    { id: 'w4', cells: { week: { display: '18 Aug' }, forecast: { display: '19.4%' }, sold: { display: '26.0%' }, kind: { display: 'Actual' } } },
    { id: 'w5', cells: { week: { display: '31 Aug' }, forecast: { display: '18.1%' }, sold: { display: '26.0%' }, kind: { display: 'Actual' } } },
    { id: 'w6', cells: { week: { display: '14 Sep' }, forecast: { display: '17.2%' }, sold: { display: '26.0%' }, kind: { display: 'Projected' } } },
    { id: 'w7', cells: { week: { display: '28 Sep' }, forecast: { display: '16.4%' }, sold: { display: '26.0%' }, kind: { display: 'Projected' } } },
  ],
};

export const TREND: TrendChartViewModel = {
  title: 'Forecast gross margin against as-sold baseline',
  yAxisLabel: 'Gross margin %',
  textAlternative:
    'Forecast gross margin falls from 24.8% on 7 July to 18.1% on 31 August against a flat as-sold '
    + 'baseline of 26.0%, and is projected to reach 16.4% by 28 September. The final two points are '
    + 'projected, not actual.',
  dataTable: trendTable,
  series: [
    {
      id: 'forecast', label: 'Forecast GM', role: 'primary',
      points: [
        { label: '7 Jul', value: { value: 24.8, display: '24.8%' } },
        { label: '21 Jul', value: { value: 23.1, display: '23.1%' } },
        { label: '4 Aug', value: { value: 21.0, display: '21.0%' } },
        { label: '18 Aug', value: { value: 19.4, display: '19.4%' } },
        { label: '31 Aug', value: { value: 18.1, display: '18.1%' } },
        { label: '14 Sep', value: { value: 17.2, display: '17.2%' }, projected: true },
        { label: '28 Sep', value: { value: 16.4, display: '16.4%' }, projected: true },
      ],
    },
    {
      id: 'sold', label: 'As-sold GM', role: 'baseline',
      points: [
        { label: '7 Jul', value: { value: 26, display: '26.0%' } },
        { label: '21 Jul', value: { value: 26, display: '26.0%' } },
        { label: '4 Aug', value: { value: 26, display: '26.0%' } },
        { label: '18 Aug', value: { value: 26, display: '26.0%' } },
        { label: '31 Aug', value: { value: 26, display: '26.0%' } },
        { label: '14 Sep', value: { value: 26, display: '26.0%' } },
        { label: '28 Sep', value: { value: 26, display: '26.0%' } },
      ],
    },
  ],
};

export const WATERFALL: WaterfallViewModel = {
  title: 'Margin bridge — as-sold to forecast',
  textAlternative:
    'As-sold margin of $15.96M is reduced by $2.10M of effort overrun, $1.34M of rate dilution and '
    + '$0.86M of unrecovered scope, and increased by $0.32M of executed change orders, giving a '
    + 'forecast margin of $11.98M.',
  reconciliationNote:
    'Named causes sum to the total delta to the cent (AC-4). Reconciliation is asserted by the '
    + 'Financial context, not by this chart.',
  steps: [
    { label: 'As-sold', amount: { value: 15.96, display: '$15.96M' }, kind: 'start' },
    { label: 'Effort overrun', amount: { value: -2.1, display: '−$2.10M' }, kind: 'decrease' },
    { label: 'Rate dilution', amount: { value: -1.34, display: '−$1.34M' }, kind: 'decrease' },
    { label: 'Unrecovered scope', amount: { value: -0.86, display: '−$0.86M' }, kind: 'decrease' },
    { label: 'Executed COs', amount: { value: 0.32, display: '+$0.32M' }, kind: 'increase' },
    { label: 'Forecast', amount: { value: 11.98, display: '$11.98M' }, kind: 'total' },
  ],
  dataTable: {
    caption: 'Margin bridge components',
    columns: [
      { key: 'cause', header: 'Cause' },
      { key: 'amount', header: 'Amount', align: 'end' },
    ],
    rows: [
      { id: 's1', cells: { cause: { display: 'As-sold margin' }, amount: { display: '$15.96M' } } },
      { id: 's2', cells: { cause: { display: 'Effort overrun' }, amount: { display: '−$2.10M' } } },
      { id: 's3', cells: { cause: { display: 'Rate dilution' }, amount: { display: '−$1.34M' } } },
      { id: 's4', cells: { cause: { display: 'Unrecovered scope' }, amount: { display: '−$0.86M' } } },
      { id: 's5', cells: { cause: { display: 'Executed change orders' }, amount: { display: '+$0.32M' } } },
      { id: 's6', cells: { cause: { display: 'Forecast margin' }, amount: { display: '$11.98M' } } },
    ],
  },
};

export const BUBBLES: BubbleMatrixViewModel = {
  title: 'Intervention triage — value at risk against deterioration',
  xAxisLabel: 'Deterioration rate →',
  yAxisLabel: 'Value at risk →',
  sizeLabel: 'Bubble size = contract value',
  textAlternative:
    'Five projects plotted by deterioration rate against value at risk. Meridian Payments sits '
    + 'furthest right and highest, with the largest contract value, and is the highlighted '
    + 'intervention candidate.',
  bubbles: [
    { id: 'b1', label: 'Meridian Payments', x: { value: 0.82, display: 'high' }, y: { value: 1.84, display: '$1.84M' }, size: { value: 24.5, display: '$24.5M' }, status: statusFor('critical', 'Red'), emphasis: true },
    { id: 'b2', label: 'Northwind Logistics', x: { value: 0.35, display: 'moderate' }, y: { value: 0.42, display: '$0.42M' }, size: { value: 12.2, display: '$12.2M' }, status: statusFor('caution', 'Amber') },
    { id: 'b3', label: 'Helios Retail', x: { value: 0.61, display: 'high' }, y: { value: 0.31, display: '$0.31M' }, size: { value: 8.4, display: '$8.4M' }, status: statusFor('caution', 'Amber') },
    { id: 'b4', label: 'Aster Health', x: { value: 0.12, display: 'low' }, y: { value: 0.04, display: '$0.04M' }, size: { value: 6.1, display: '$6.1M' }, status: statusFor('positive', 'Green') },
    { id: 'b5', label: 'Vantage Telecom', x: { value: 0.28, display: 'moderate' }, y: { value: 0.18, display: '$0.18M' }, size: { value: 9.8, display: '$9.8M' }, status: statusFor('positive', 'Green') },
  ],
  dataTable: {
    caption: 'Intervention triage data',
    columns: [
      { key: 'project', header: 'Project' },
      { key: 'det', header: 'Deterioration' },
      { key: 'var', header: 'Value at risk', align: 'end' },
      { key: 'cv', header: 'Contract value', align: 'end' },
      { key: 'status', header: 'Assessed' },
    ],
    rows: [
      { id: 'b1', cells: { project: { display: 'Meridian Payments' }, det: { display: 'high' }, var: { display: '$1.84M' }, cv: { display: '$24.5M' }, status: { status: statusFor('critical', 'Red') } } },
      { id: 'b2', cells: { project: { display: 'Northwind Logistics' }, det: { display: 'moderate' }, var: { display: '$0.42M' }, cv: { display: '$12.2M' }, status: { status: statusFor('caution', 'Amber') } } },
      { id: 'b3', cells: { project: { display: 'Helios Retail' }, det: { display: 'high' }, var: { display: '$0.31M' }, cv: { display: '$8.4M' }, status: { status: statusFor('caution', 'Amber') } } },
      { id: 'b4', cells: { project: { display: 'Aster Health' }, det: { display: 'low' }, var: { display: '$0.04M' }, cv: { display: '$6.1M' }, status: { status: statusFor('positive', 'Green') } } },
      { id: 'b5', cells: { project: { display: 'Vantage Telecom' }, det: { display: 'moderate' }, var: { display: '$0.18M' }, cv: { display: '$9.8M' }, status: { status: statusFor('positive', 'Green') } } },
    ],
  },
};

export const BURN: ProgressBurnViewModel = {
  title: 'Budget consumed against physical completion',
  textAlternative:
    'Meridian Payments has consumed 78% of budget at 54% completion; Northwind 61% at 58%; '
    + 'Aster Health 44% at 49%. The marker on each bar is the planned position.',
  bars: [
    { label: 'Meridian Payments', actual: { value: 78, display: '78%' }, planned: { value: 54, display: '54%' }, status: statusFor('critical', 'Critical') },
    { label: 'Northwind Logistics', actual: { value: 61, display: '61%' }, planned: { value: 58, display: '58%' }, status: statusFor('caution', 'At risk') },
    { label: 'Aster Health', actual: { value: 44, display: '44%' }, planned: { value: 49, display: '49%' }, status: statusFor('positive', 'Healthy') },
  ],
};

export const COMPARISON: MetricComparisonViewModel = {
  title: 'This period against last',
  leftLabel: 'Jul 2026',
  rightLabel: 'Aug 2026',
  rows: [
    { label: 'Forecast gross margin', left: '19.4%', right: '18.1%', treatment: 'computed', delta: { direction: 'down', sentiment: 'negative', display: '−1.3pp', comparisonLabel: '' } },
    { label: 'Gross margin at risk', left: '$3.72M', right: '$4.82M', treatment: 'computed', delta: { direction: 'up', sentiment: 'negative', display: '+$1.10M', comparisonLabel: '' } },
    { label: 'Projects assessed Red', left: '2', right: '3', treatment: 'fact', delta: { direction: 'up', sentiment: 'negative', display: '+1', comparisonLabel: '' } },
    { label: 'Open interventions', left: '5', right: '7', treatment: 'fact', delta: { direction: 'up', sentiment: 'positive', display: '+2', comparisonLabel: '' } },
  ],
};
