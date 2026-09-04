/**
 * The population tools (ADR-0034, Phase 13).
 *
 * These answer the portfolio-shaped questions a typed plan makes expressible: filtered lists,
 * governed aggregates over a filtered subset, concentration by dimension, period movement, and
 * bounded comparison.
 *
 * ## Three properties, in the order a reviewer should check them
 *
 * 1. **They read the command-centre view, not a second data path.** Exactly like the Phase 11 tools
 *    (ADR-0029), so the Assistant *inherits* session validation, ABAC scope resolution, the
 *    object-level check and field shaping instead of re-implementing them. It also means the
 *    Assistant and the Portfolio surface are reading the same rows — which is why cross-surface
 *    reconciliation (§70) is structural rather than a promise two code paths keep.
 *
 * 2. **Filtering never recomputes.** Every predicate here tests a value a governed engine already
 *    decided: `systemAssessedRag` is the health engine's band, `outlook60` is the deterministic
 *    forward outlook, a driver is a condition `executive-facts` read from an engine's own
 *    assessment. Nothing in this file decides whether a project is deteriorating; it decides whether
 *    a project the engines called deteriorating is in the population the executive asked about.
 *
 * 3. **Aggregation uses the catalogue formula, never a shortcut.** `MET-PORT-002` is
 *    `(Σ forecast revenue − Σ cost at completion) / Σ forecast revenue`. The Phase 12 review found
 *    the browser computing a contract-value-weighted mean of project percentages instead, which
 *    agrees with the governed figure only when no change request has ever been executed. That defect
 *    is closed here by calling the portfolio context's own `aggregate()` over the same four
 *    components the KPIs were built from — so there is one formula, in one place, and a filtered
 *    total is arithmetically the same kind of object as an unfiltered one.
 */
import { Money, isComputable, qAbs, qCompare, qMul, qSub, qty, ratioToPercentString } from '@platform/decimal';
import type { CurrencyCode } from '@platform/decimal';
import { aggregate } from '@contexts/portfolio';
import type { ProjectContribution } from '@contexts/portfolio';
import type { RecordRef } from '@platform/provenance';
import type { MaterialClaim, QueryPlan, ToolResult } from '@contexts/ai-intelligence';
import { DRIVER_LABEL, METRIC_LABEL, describeScope } from '@contexts/ai-intelligence';
import type { ToolContext } from './tools.js';
import { formatMoneyCompact } from '../portfolio/command-center.js';
import { ToolDenied, claim, list, str, sub } from './tools.js';

interface Row { readonly [k: string]: unknown }

const num = (row: Row | undefined, key: string): string => {
  const v = row?.[key];
  return typeof v === 'string' ? v : '0';
};

async function commandCentre(tc: ToolContext): Promise<Row> {
  const response = await tc.gateway.request(tc.ctx, { view: 'portfolio.commandCenter' });
  if (response.status !== 200) throw new ToolDenied();
  const body = response.body as { data?: unknown } | undefined;
  const rows = Array.isArray(body?.data) ? body.data as Row[] : [];
  const row = rows[0];
  if (row === undefined) throw new ToolDenied();
  return row;
}

/**
 * Applies a plan's filters to already-assessed rows.
 *
 * Every clause is an equality or membership test against a governed value. There is no arithmetic
 * here except the threshold comparison, and that is decimal.
 */
export function applyFilters(rows: readonly Row[], plan: QueryPlan): readonly Row[] {
  const f = plan.filters;
  return rows.filter((r) => {
    if (f.projectIds.length > 0 && !f.projectIds.includes(str(r, 'projectId') ?? '')) return false;
    if (f.regions.length > 0 && !f.regions.includes(str(r, 'region') ?? '')) return false;
    if (f.industries.length > 0 && !f.industries.includes(str(r, 'industry') ?? '')) return false;
    if (f.deliveryGroups.length > 0 && !f.deliveryGroups.includes(str(r, 'deliveryGroup') ?? '')) return false;
    if (f.customers.length > 0 && !f.customers.some((c) => (str(r, 'name') ?? '').includes(c))) return false;
    if (f.accounts.length > 0 && !f.accounts.some((a) => (str(r, 'name') ?? '').includes(a))) return false;
    if (f.systemRag.length > 0 && !f.systemRag.includes((str(r, 'systemAssessedRag') ?? '') as never)) return false;
    if (f.reportedRag.length > 0 && !f.reportedRag.includes((str(r, 'reportedRag') ?? '') as never)) return false;
    if (f.outlook30.length > 0 && !f.outlook30.includes((str(r, 'outlook30') ?? '') as never)) return false;
    if (f.outlook60.length > 0 && !f.outlook60.includes((str(r, 'outlook60') ?? '') as never)) return false;
    if (f.trajectory.length > 0 && !f.trajectory.includes((str(r, 'trajectory') ?? '') as never)) return false;
    for (const finding of f.findings) {
      if (finding === 'reportedGreenRisk') {
        // ADR-0018 / Phase 12 taxonomy: reported GREEN while the system assesses worse. Read from
        // the two governed bands rather than from MET-HLTH-033, whose second arm also admits
        // projects the system agrees are Green — labelling those "the evidence disagrees" would tell
        // a CDO the delivery line is misreporting when it is not.
        if (!(str(r, 'reportedRag') === 'GREEN' && str(r, 'systemAssessedRag') !== 'GREEN')) return false;
      }
      if (finding === 'emergingRisk') {
        if (!(str(r, 'systemAssessedRag') === 'GREEN'
          && (str(r, 'outlook30') !== 'GREEN' || str(r, 'outlook60') !== 'GREEN'))) return false;
      }
      if (finding === 'recovering') {
        if (str(r, 'trajectory') !== 'IMPROVING') return false;
      }
    }
    for (const driver of f.drivers) {
      if (!exhibitsDriver(r, driver)) return false;
    }
    for (const threshold of f.thresholds) {
      const value = metricValueOf(r, threshold.metric);
      if (value === null) return false;
      const comparison = qCompare(qty(value), qty(threshold.value));
      if (threshold.operator === 'gte' && comparison < 0) return false;
      if (threshold.operator === 'lte' && comparison > 0) return false;
    }
    return true;
  });
}

/**
 * Whether a project exhibits a governed driver.
 *
 * Read from conditions the engines assessed. The two percentage-point tests use the same five-point
 * materiality the Command Center's own driver grouping uses, so a project that appears under
 * "margin erosion" on the Portfolio surface appears under it here — a second threshold would have
 * produced two populations with one name.
 */
function exhibitsDriver(r: Row, driver: string): boolean {
  /*
   * A percentage-point figure as a decimal string the platform will accept.
   *
   * The leading `+` has to go. Surfaces format a positive variance as `+0.1 pp` because a reader
   * needs the sign, and `qty` rejects `+0.1` by design — scientific notation and JavaScript numbers
   * are refused, and so is a leading plus. Leaving it in threw a TypeError inside a tool, which the
   * executor then reported as "nothing in your authorised scope": a programming defect wearing an
   * authorisation outcome's clothes.
   */
  const points = (key: string): string | null => {
    const raw = str(r, key);
    if (raw === null) return null;
    const cleaned = raw.replace(/[^0-9.+-]/g, '').replace(/^\+/, '');
    return /^-?\d+(\.\d+)?$/.test(cleaned) ? cleaned : null;
  };
  switch (driver) {
    case 'margin-erosion': {
      const sold = points('soldGmPercent');
      const forecast = points('forecastGmPercent');
      if (sold === null || forecast === null) return false;
      return qCompare(qSub(qty(sold), qty(forecast)), qty('5')) >= 0;
    }
    case 'scope-leakage':
      return (str(r, 'uncommercialisedExposure') ?? '').replace(/[^0-9]/g, '') !== ''
        && !/^\$?0(\.0+)?$/.test(str(r, 'uncommercialisedExposure') ?? '$0');
    case 'burn-ahead-of-progress': {
      const burn = points('burnGap');
      return burn !== null && qCompare(qty(burn), qty('5')) >= 0;
    }
    case 'behind-plan': {
      const progress = points('progressVariance');
      return progress !== null && qCompare(qty(progress), qty('-5')) <= 0;
    }
    case 'deteriorating':
      return (str(r, 'trajectory') ?? '').includes('DETERIORATING');
    case 'reporting-divergence':
      return r['isReportedGreenRisk'] === true;
    case 'emerging-risk':
      return r['isSystemGreenAtRisk'] === true;
    default:
      return false;
  }
}

/** The comparable value behind a threshold. Decimal strings; `null` where not computable. */
function metricValueOf(r: Row, metric: string): string | null {
  const clean = (raw: string | null): string | null => {
    if (raw === null) return null;
    // The minus sign surfaces use is U+2212, not the ASCII hyphen a decimal parser expects.
    const compact = raw.replace(/\u2212/g, '-').replace(/[^0-9.KMB+-]/gi, '').replace(/^\+/, '');
    const scale = /M$/i.test(compact) ? '1000000' : /K$/i.test(compact) ? '1000'
      : /B$/i.test(compact) ? '1000000000' : '1';
    const digits = compact.replace(/[KMB]/gi, '');
    if (!/^-?\d+(\.\d+)?$/.test(digits)) return null;
    return scale === '1' ? digits : multiply(digits, scale);
  };
  switch (metric) {
    case 'gmErosion': {
      const sold = clean(str(r, 'soldGmPercent'));
      const forecast = clean(str(r, 'forecastGmPercent'));
      if (sold === null || forecast === null) return null;
      return qSub(qty(sold), qty(forecast));
    }
    case 'gmAtRisk': return clean(str(r, 'gmValueAtRisk'));
    case 'tcv': return clean(str(r, 'tcv'));
    case 'soldGm': return clean(str(r, 'soldGmPercent'));
    case 'forecastGm': return clean(str(r, 'forecastGmPercent'));
    case 'riskAdjustedGm': return clean(str(r, 'riskAdjustedGmPercent'));
    case 'scopeExposure': return clean(str(r, 'uncommercialisedExposure'));
    default: return null;
  }
}

/** Scales a compact figure back to its magnitude. Decimal, never by appending zeros. */
function multiply(a: string, b: string): string {
  return qMul(qty(a), qty(b));
}

/** Orders a filtered population by a governed sort. Ties break on rank, which is itself governed. */
export function applySort(rows: readonly Row[], plan: QueryPlan): readonly Row[] {
  const rank = (r: Row): number => (typeof r['rank'] === 'number' ? r['rank'] : 9999);
  const byMetric = (metric: string) => (a: Row, b: Row): number => {
    const av = metricValueOf(a, metric);
    const bv = metricValueOf(b, metric);
    if (av === null && bv === null) return rank(a) - rank(b);
    if (av === null) return 1;
    if (bv === null) return -1;
    const c = qCompare(qty(bv), qty(av));
    return c !== 0 ? c : rank(a) - rank(b);
  };
  const severity: Readonly<Record<string, number>> = {
    RAPIDLY_DETERIORATING: 0, DETERIORATING: 1, STABLE: 2, IMPROVING: 3,
  };
  const sorted = [...rows];
  switch (plan.sort) {
    case 'economicExposure': sorted.sort(byMetric('gmAtRisk')); break;
    case 'gmErosion': sorted.sort(byMetric('gmErosion')); break;
    case 'contractValue': sorted.sort(byMetric('tcv')); break;
    case 'trajectorySeverity':
      sorted.sort((a, b) => (severity[str(a, 'trajectory') ?? ''] ?? 4)
        - (severity[str(b, 'trajectory') ?? ''] ?? 4) || rank(a) - rank(b));
      break;
    case 'milestoneProximity':
      sorted.sort((a, b) => qCompare(weeks(str(a, 'timeCriticality')), weeks(str(b, 'timeCriticality')))
        || rank(a) - rank(b));
      break;
    case 'recovery':
      sorted.sort((a, b) => (str(a, 'trajectory') === 'IMPROVING' ? 0 : 1)
        - (str(b, 'trajectory') === 'IMPROVING' ? 0 : 1) || rank(a) - rank(b));
      break;
    case 'name':
      sorted.sort((a, b) => (str(a, 'name') ?? '').localeCompare(str(b, 'name') ?? ''));
      break;
    default: sorted.sort((a, b) => rank(a) - rank(b));
  }
  return sorted;
}

/**
 * Weeks to the nearest irreversible point, as a comparable quantity.
 *
 * Returned as a decimal string rather than a number so the sort compares it the way every other
 * figure in this file is compared. An undated clock sorts last, which is the correct reading: "no
 * irreversible point is known" is not "the deadline is far away".
 */
const NO_CLOCK = qty('99999');

function weeks(raw: string | null): string {
  const m = /(\d{1,3})/.exec(raw ?? '');
  const value = m?.[1];
  return value === undefined ? NO_CLOCK : qty(value);
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export async function populationQuery(tc: ToolContext, plan: QueryPlan): Promise<ToolResult> {
  const row = await commandCentre(tc);
  const ranked = list(row, 'ranked');
  const filtered = applySort(applyFilters(ranked, plan), plan);
  const shown = filtered.slice(0, plan.limit);

  const claims: MaterialClaim[] = [];
  claims.push(claim({
    id: 'population:count',
    text: filtered.length === 0
      ? `No project in your authorised set matches ${describeScope(plan)}.`
      : `${String(filtered.length)} projects match ${describeScope(plan)}`
        + `${filtered.length > shown.length ? `; the ${String(shown.length)} largest are listed` : ''}.`,
    display: String(filtered.length),
    metricId: null, layer: 'L1',
    entityType: 'portfolio', entityId: 'authorised-set',
    asOf: tc.asOf, sourceDomain: 'portfolio',
    refs: [{ context: 'portfolio', entityType: 'population', entityId: str(row, 'populationLabel') ?? 'population' }],
    signalState: 'OBSERVED',
    overrides: { executiveAuthoritative: true, assessmentStatus: 'COMPLETE' },
  }));

  for (const r of shown) {
    claims.push(claim({
      id: `population:${str(r, 'projectId') ?? ''}`,
      text: `${str(r, 'name') ?? ''} — assessed ${str(r, 'systemAssessedRag') ?? '?'}, `
        + `reported ${str(r, 'reportedRag') ?? '?'}, trajectory ${(str(r, 'trajectory') ?? '?').toLowerCase().replace(/_/g, ' ')}, `
        + `60-day outlook ${str(r, 'outlook60') ?? '?'}, ${str(r, 'tcv') ?? '?'} contract value, `
        + `${str(r, 'gmValueAtRisk') ?? 'no'} margin at risk.`,
      display: str(r, 'gmValueAtRisk'),
      metricId: 'MET-FIN-019', layer: 'L3',
      entityType: 'project', entityId: str(r, 'projectId') ?? '',
      asOf: tc.asOf, sourceDomain: 'portfolio',
      refs: [{ context: 'portfolio', entityType: 'project', entityId: str(r, 'projectId') ?? '', metricId: 'MET-FIN-019' }],
      signalState: 'OBSERVED',
    }));
  }
  return { tool: 'portfolio.population.query', claims, untrustedContent: [] };
}

/**
 * The governed aggregate over a filtered population.
 *
 * `aggregate()` is the portfolio context's own function — the same one the KPIs use. Nothing is
 * recomputed here and no alternative formula exists in this file, which is the whole point:
 * §13 of the Phase 13 contract exists because a second implementation of `MET-PORT-002` was written
 * once and disagreed with the first.
 */
export async function populationAggregate(tc: ToolContext, plan: QueryPlan): Promise<ToolResult> {
  const row = await commandCentre(tc);
  const ranked = list(row, 'ranked');
  const filtered = applyFilters(ranked, plan);
  const ids = new Set(filtered.map((r) => str(r, 'projectId') ?? ''));

  const contributions = list(row, 'contributions');
  if (contributions.length === 0) {
    // The caller holds no commercial grant, so the components were shaped out. A portfolio margin
    // cannot be produced, and saying so is the correct answer — not falling back to a mean of the
    // percentages that survived shaping, which would be a different figure wearing this one's name.
    throw new ToolDenied();
  }

  const currency = (str(row, 'currency') ?? 'USD') as CurrencyCode;
  const zero = Money.zero(currency);
  const selected: ProjectContribution[] = [];
  for (const c of contributions) {
    const id = str(c, 'projectId') ?? '';
    if (!ids.has(id)) continue;
    selected.push({
      projectId: id,
      contractValue: Money.of(num(c, 'contractValue'), currency),
      forecastRevenue: Money.of(num(c, 'forecastRevenue'), currency),
      estimateAtCompletion: Money.of(num(c, 'estimateAtCompletion'), currency),
      gmValueAtRisk: Money.of(num(c, 'gmValueAtRisk'), currency),
    });
  }

  const totals = aggregate(selected, zero);
  const soldValue = contributions
    .filter((c) => ids.has(str(c, 'projectId') ?? ''))
    .reduce((m, c) => m.plus(Money.of(num(c, 'soldGmValue'), currency)), zero);
  const soldRevenue = contributions
    .filter((c) => ids.has(str(c, 'projectId') ?? ''))
    .reduce((m, c) => m.plus(Money.of(num(c, 'contractValue'), currency)), zero);
  const soldMargin = soldRevenue.isZero() ? null : soldValue.dividedBy(soldRevenue);

  /*
   * `ratioToPercentString` returns the digits without the sign, so a caller that forgets to append
   * it renders `20.21` where every surface in the product renders `20.21%`. That is the DR-075
   * defect class in miniature — the same governed figure in two notations — so the symbol is
   * attached here, once, at the only place this tool formats a ratio.
   */
  const forecastDigits = isComputable(totals.forecastMarginPercent)
    ? ratioToPercentString(totals.forecastMarginPercent, 2) : null;
  const forecastMargin = forecastDigits === null ? null : `${forecastDigits}%`;

  const claims: MaterialClaim[] = [
    claim({
      id: 'aggregate:count',
      text: `The aggregate covers ${String(totals.projectCount)} projects matching ${describeScope(plan)}.`,
      display: String(totals.projectCount),
      metricId: null, layer: 'L1',
      entityType: 'portfolio', entityId: 'authorised-set',
      asOf: tc.asOf, sourceDomain: 'portfolio',
      refs: [{ context: 'portfolio', entityType: 'population', entityId: 'filtered' }],
      signalState: 'OBSERVED',
      overrides: { executiveAuthoritative: true, assessmentStatus: 'COMPLETE' },
    }),
    claim({
      id: 'aggregate:tcv',
      text: `Total contract value across that population is ${formatMoneyCompact(totals.contractValue)}.`,
      display: formatMoneyCompact(totals.contractValue),
      metricId: 'MET-PORT-001', layer: 'L2',
      entityType: 'portfolio', entityId: 'authorised-set',
      asOf: tc.asOf, sourceDomain: 'financial',
      refs: [{ context: 'portfolio', entityType: 'aggregate', entityId: 'contract-value', metricId: 'MET-PORT-001' }],
      signalState: 'OBSERVED',
      overrides: { executiveAuthoritative: true, assessmentStatus: 'COMPLETE' },
    }),
  ];

  if (forecastMargin !== null) {
    claims.push(claim({
      id: 'aggregate:forecast-gm',
      text: `Forecast gross margin across that population is ${forecastMargin}, computed as aggregate `
        + 'forecast revenue less aggregate cost at completion over aggregate forecast revenue — '
        + 'weighted, never a mean of the project margins.',
      display: forecastMargin,
      metricId: 'MET-PORT-002', layer: 'L2',
      entityType: 'portfolio', entityId: 'authorised-set',
      asOf: tc.asOf, sourceDomain: 'financial',
      refs: [{ context: 'portfolio', entityType: 'aggregate', entityId: 'forecast-margin', metricId: 'MET-PORT-002' }],
      signalState: 'OBSERVED',
      overrides: { executiveAuthoritative: true, assessmentStatus: 'COMPLETE' },
    }));
  }
  if (soldMargin !== null && isComputable(soldMargin)) {
    claims.push(claim({
      id: 'aggregate:sold-gm',
      text: `As-sold gross margin across that population is ${percent(ratioToPercentString(soldMargin, 2))}.`,
      display: percent(ratioToPercentString(soldMargin, 2)),
      metricId: 'MET-PORT-008', layer: 'L2',
      entityType: 'portfolio', entityId: 'authorised-set',
      asOf: tc.asOf, sourceDomain: 'financial',
      refs: [{ context: 'portfolio', entityType: 'aggregate', entityId: 'sold-margin', metricId: 'MET-PORT-008' }],
      signalState: 'OBSERVED',
      overrides: { executiveAuthoritative: true, assessmentStatus: 'COMPLETE' },
    }));
  }
  claims.push(claim({
    id: 'aggregate:var',
    text: `Gross margin at risk across that population totals ${formatMoneyCompact(totals.valueAtRisk)}. `
      + 'This is a plain sum of per-project exposure; where projects share a root cause it overstates '
      + 'the portfolio figure rather than de-duplicating it.',
    display: formatMoneyCompact(totals.valueAtRisk),
    metricId: 'MET-FIN-019', layer: 'L2',
    entityType: 'portfolio', entityId: 'authorised-set',
    asOf: tc.asOf, sourceDomain: 'financial',
    refs: [{ context: 'portfolio', entityType: 'aggregate', entityId: 'value-at-risk', metricId: 'MET-FIN-019' }],
    signalState: 'OBSERVED',
  }));

  return { tool: 'portfolio.population.aggregate', claims, untrustedContent: [] };
}

/** A percentage, or the stated reason there is none. Never a bare number wearing a percent's name. */
function percent(digits: string | null): string {
  return digits === null ? 'not computable' : `${digits}%`;
}

/*
 * Money is formatted by the *surface's* own formatter, imported rather than reimplemented.
 *
 * A second compact-money function is exactly how `$4.82M` and `$4.8M` end up on two screens
 * describing the same figure, and a reader who notices has no way to tell which is rounded. There is
 * one formatter in this product and this is a caller of it.
 */

/**
 * Where a condition is concentrated.
 *
 * Counts and sums per group over the filtered population — no ranking rule, no new judgement. It
 * answers *"where is margin erosion concentrated?"* by saying which dimension values hold the most
 * of it, which is a fact about the population rather than an assessment of the groups.
 */
export async function concentration(tc: ToolContext, plan: QueryPlan): Promise<ToolResult> {
  const row = await commandCentre(tc);
  const filtered = applyFilters(list(row, 'ranked'), plan);
  const dimension = plan.groupBy ?? 'driver';

  const buckets = new Map<string, Row[]>();
  for (const r of filtered) {
    for (const key of groupKeys(r, dimension)) {
      const existing = buckets.get(key);
      if (existing === undefined) buckets.set(key, [r]); else existing.push(r);
    }
  }

  const ordered = [...buckets.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, plan.limit);

  const claims: MaterialClaim[] = [claim({
    id: 'concentration:scope',
    text: `${String(filtered.length)} projects match ${describeScope(plan)}, grouped by ${dimension}.`,
    display: String(filtered.length),
    metricId: null, layer: 'L1',
    entityType: 'portfolio', entityId: 'authorised-set',
    asOf: tc.asOf, sourceDomain: 'portfolio',
    refs: [{ context: 'portfolio', entityType: 'population', entityId: dimension }],
    signalState: 'OBSERVED',
    overrides: { executiveAuthoritative: true, assessmentStatus: 'COMPLETE' },
  })];

  for (const [key, group] of ordered) {
    const label = dimension === 'driver' ? DRIVER_LABEL[key as never] ?? key : key;
    claims.push(claim({
      id: `concentration:${dimension}:${key}`,
      text: `${label}: ${String(group.length)} of ${String(filtered.length)} projects`
        + `${group.length > 0 ? `, led by ${str(group[0], 'name') ?? ''}` : ''}.`,
      display: `${String(group.length)} of ${String(filtered.length)}`,
      metricId: null, layer: 'L2',
      entityType: 'segment', entityId: key,
      asOf: tc.asOf, sourceDomain: 'portfolio',
      refs: group.slice(0, 5).map((g) => ({
        context: 'portfolio', entityType: 'project', entityId: str(g, 'projectId') ?? '',
      })),
      signalState: 'OBSERVED',
    }));
  }
  if (claims.length === 1) throw new ToolDenied();
  return { tool: 'portfolio.concentration.get', claims, untrustedContent: [] };
}

function groupKeys(r: Row, dimension: string): readonly string[] {
  switch (dimension) {
    case 'region': return [str(r, 'region') ?? 'unstated'];
    case 'industry': return [str(r, 'industry') ?? 'unstated'];
    case 'deliveryGroup': return [str(r, 'deliveryGroup') ?? 'unstated'];
    case 'account':
    case 'customer': return [(str(r, 'name') ?? '').split(' ').slice(0, 2).join(' ') || 'unstated'];
    default: {
      const drivers = ['margin-erosion', 'scope-leakage', 'burn-ahead-of-progress', 'behind-plan',
        'deteriorating', 'reporting-divergence', 'emerging-risk'];
      const present = drivers.filter((d) => exhibitsDriver(r, d));
      return present.length === 0 ? ['no single governed condition'] : present;
    }
  }
}

/**
 * Period movement, read from the surface that already computes it.
 *
 * Phase 11 declined this question outright — DR-045, no prior-period snapshot. Phase 12 built it,
 * and the Assistant's refusal was left behind, so the Portfolio surface and the Assistant gave
 * different answers to *"what changed?"* That is a cross-surface reconciliation defect (§70) and
 * this tool closes it by reading the same `whatChanged` narrative the surface renders.
 */
export async function periodChange(tc: ToolContext, plan: QueryPlan): Promise<ToolResult> {
  const row = await commandCentre(tc);
  const contributions = list(row, 'contributions');
  if (contributions.length === 0) throw new ToolDenied();

  const ranked = list(row, 'ranked');
  const inScope = new Set(applyFilters(ranked, plan).map((r) => str(r, 'projectId') ?? ''));
  const currency = (str(row, 'currency') ?? 'USD') as CurrencyCode;
  const zero = Money.zero(currency);

  const comparable = contributions.filter(
    (c) => inScope.has(str(c, 'projectId') ?? '') && str(c, 'priorForecastRevenue') !== null,
  );
  const label = str(comparable[0], 'priorPeriodLabel');

  if (comparable.length === 0 || label === null) {
    return {
      tool: 'portfolio.change.get',
      claims: [claim({
        id: 'change:coverage',
        text: 'No prior governed period is available for this population, so movement is not '
          + 'reported. Absence of a comparison is stated rather than rendered as no change — '
          + '"unchanged" and "unknown" are different claims and only one of them is reassuring.',
        display: null,
        metricId: null, layer: 'L1',
        entityType: 'portfolio', entityId: 'authorised-set',
        asOf: tc.asOf, sourceDomain: 'portfolio',
        refs: [{ context: 'portfolio', entityType: 'period', entityId: 'none' }],
        signalState: 'NOT_COMPUTABLE',
        overrides: { assessmentStatus: 'NOT_COMPUTABLE' },
      })],
      untrustedContent: [],
    };
  }

  /*
   * Margin movement, from the governed components rather than from a stored delta.
   *
   * Forecast margin *value* is forecast revenue less cost at completion, at each period end, both
   * produced by the same economics engine. Summing the two positions and subtracting is the
   * portfolio-level movement; per project, the sign of the difference is what "worsened" and
   * "improved" mean. Nothing here re-derives a margin — it subtracts two the engine produced.
   */
  let marginNow = zero;
  let marginPrior = zero;
  let worsened = 0;
  let improved = 0;
  let eacRevisions = 0;
  let lossCreated = 0;
  let lossCleared = 0;

  for (const c of comparable) {
    const now = Money.of(num(c, 'currentForecastRevenue'), currency)
      .minus(Money.of(num(c, 'currentEstimateAtCompletion'), currency));
    const before = Money.of(num(c, 'priorForecastRevenue'), currency)
      .minus(Money.of(num(c, 'priorEstimateAtCompletion'), currency));
    marginNow = marginNow.plus(now);
    marginPrior = marginPrior.plus(before);
    const direction = qCompare(qty(now.toQuantity()), qty(before.toQuantity()));
    if (direction < 0) worsened += 1;
    if (direction > 0) improved += 1;

    /*
     * A **material** cost-at-completion revision, on the same half-a-point threshold the Command
     * Center uses.
     *
     * Counting every non-zero difference gives 73 of 73, which is true and useless: a forecast that
     * moves by a few dollars between period ends has not been revised in any sense a reader means.
     * The two surfaces must also agree, and a second threshold here would have produced two numbers
     * with one name.
     */
    const priorEac = qty(num(c, 'priorEstimateAtCompletion'));
    const currentEac = qty(num(c, 'currentEstimateAtCompletion'));
    const rise = qSub(currentEac, priorEac);
    if (qCompare(rise, qMul(qAbs(priorEac), qty('0.005'))) > 0) eacRevisions += 1;

    // Crossing zero forecast margin is a contract-loss condition created or cleared. A crossing is a
    // different event from a movement, and an executive reads it differently.
    const wasLoss = qCompare(qty(before.toQuantity()), qty('0')) < 0;
    const isLoss = qCompare(qty(now.toQuantity()), qty('0')) < 0;
    if (!wasLoss && isLoss) lossCreated += 1;
    if (wasLoss && !isLoss) lossCleared += 1;
  }
  const movement = marginNow.minus(marginPrior);

  const severity: Readonly<Record<string, number>> = { GREEN: 0, AMBER: 1, RED: 2 };
  let reportedChanges = 0;
  let downgrades = 0;
  let upgrades = 0;
  const byId = new Map(ranked.map((r) => [str(r, 'projectId') ?? '', r]));
  for (const c of comparable) {
    const prior = str(c, 'priorReportedRag');
    const current = str(byId.get(str(c, 'projectId') ?? ''), 'reportedRag');
    if (prior === null || current === null || prior === current) continue;
    reportedChanges += 1;
    const from = severity[prior];
    const to = severity[current];
    if (from === undefined || to === undefined) continue;
    if (to > from) downgrades += 1; else if (to < from) upgrades += 1;
  }

  const ref = (entityId: string, metricId?: string): readonly RecordRef[] => [{
    context: 'portfolio', entityType: 'period', entityId,
    ...(metricId === undefined ? {} : { metricId }),
  }];

  const claims: MaterialClaim[] = [
    claim({
      id: 'change:movement',
      text: `Forecast margin across ${String(comparable.length)} projects with a prior period has `
        + `moved ${formatMoneyCompact(movement)} since ${label}.`,
      display: formatMoneyCompact(movement),
      metricId: 'MET-FIN-014', layer: 'L2',
      entityType: 'portfolio', entityId: 'authorised-set',
      asOf: tc.asOf, sourceDomain: 'financial',
      refs: ref(label, 'MET-FIN-014'),
      signalState: 'OBSERVED',
      overrides: { executiveAuthoritative: true, assessmentStatus: 'COMPLETE' },
    }),
    claim({
      id: 'change:direction',
      text: `${String(worsened)} projects have worsened and ${String(improved)} have improved.`,
      display: `${String(worsened)} worse / ${String(improved)} better`,
      metricId: null, layer: 'L2',
      entityType: 'portfolio', entityId: 'authorised-set',
      asOf: tc.asOf, sourceDomain: 'financial',
      refs: ref(label),
      signalState: 'OBSERVED',
    }),
    claim({
      id: 'change:loss',
      text: lossCreated === 0 && lossCleared === 0
        ? 'No project crossed zero forecast margin in either direction.'
        : `${String(lossCreated)} projects crossed into a forecast loss and ${String(lossCleared)} crossed out of one.`,
      display: `${String(lossCreated)} created / ${String(lossCleared)} cleared`,
      metricId: null, layer: 'L2',
      entityType: 'portfolio', entityId: 'authorised-set',
      asOf: tc.asOf, sourceDomain: 'financial',
      refs: ref(label),
      signalState: 'OBSERVED',
    }),
    claim({
      id: 'change:eac',
      text: `${String(eacRevisions)} projects made a material cost-at-completion revision, meaning `
        + 'the estimate was raised by more than half a point of the prior figure.',
      display: String(eacRevisions),
      metricId: 'MET-FIN-008', layer: 'L2',
      entityType: 'portfolio', entityId: 'authorised-set',
      asOf: tc.asOf, sourceDomain: 'financial',
      refs: ref(label, 'MET-FIN-008'),
      signalState: 'OBSERVED',
    }),
    claim({
      id: 'change:reported',
      text: `${String(reportedChanges)} projects changed the status delivery management reports: `
        + `${String(downgrades)} downgrades and ${String(upgrades)} upgrades.`,
      display: String(reportedChanges),
      metricId: null, layer: 'L1',
      entityType: 'portfolio', entityId: 'authorised-set',
      asOf: tc.asOf, sourceDomain: 'delivery',
      refs: ref(label),
      signalState: 'OBSERVED',
    }),
    claim({
      id: 'change:coverage',
      text: `Movement is measured against ${label}. It covers financial position and reported `
        + 'status, which are the two histories this product holds. System-assessed bands are not '
        + 'stored per period, so a change in the system band is not reported — and '
        + `${String(contributions.length - comparable.length)} projects have no earlier period at all.`,
      display: label,
      metricId: null, layer: 'L1',
      entityType: 'portfolio', entityId: 'authorised-set',
      asOf: tc.asOf, sourceDomain: 'portfolio',
      refs: ref(label),
      signalState: 'OBSERVED',
    }),
  ];

  return { tool: 'portfolio.change.get', claims, untrustedContent: [] };
}

/** Bounded project-to-project comparison inside the authorised set. */
export async function compareProjects(tc: ToolContext, plan: QueryPlan): Promise<ToolResult> {
  const row = await commandCentre(tc);
  const filtered = applySort(applyFilters(list(row, 'ranked'), plan), plan);
  const shown = filtered.slice(0, Math.min(plan.limit, 5));
  if (shown.length < 2) throw new ToolDenied();

  const claims: MaterialClaim[] = shown.map((r) => claim({
    id: `compare:${str(r, 'projectId') ?? ''}`,
    text: `${str(r, 'name') ?? ''}: ${str(r, 'tcv') ?? '?'} contract value, sold margin `
      + `${str(r, 'soldGmPercent') ?? '?'} against forecast ${str(r, 'forecastGmPercent') ?? '?'}, `
      + `${str(r, 'gmValueAtRisk') ?? 'no'} at risk, assessed ${str(r, 'systemAssessedRag') ?? '?'}, `
      + `${str(r, 'timeCriticality') ?? 'no clock known'} to the next irreversible point.`,
    display: str(r, 'gmValueAtRisk'),
    metricId: 'MET-FIN-019', layer: 'L3',
    entityType: 'project', entityId: str(r, 'projectId') ?? '',
    asOf: tc.asOf, sourceDomain: 'portfolio',
    refs: [{ context: 'portfolio', entityType: 'project', entityId: str(r, 'projectId') ?? '', metricId: 'MET-FIN-019' }],
    signalState: 'OBSERVED',
  }));
  return { tool: 'projects.compare', claims, untrustedContent: [] };
}

/**
 * Projects the trajectory engine calls improving, with the signals behind the call.
 *
 * A trajectory of IMPROVING is a conclusion; on its own it tells an executive nothing about whether
 * the improvement is enough. The panel the Command Center renders carries the signal names, and this
 * tool reads them rather than re-deriving them.
 */
export async function recovering(tc: ToolContext, plan: QueryPlan): Promise<ToolResult> {
  const row = await commandCentre(tc);
  const improving = applyFilters(list(row, 'ranked'), plan)
    .filter((r) => str(r, 'trajectory') === 'IMPROVING')
    .slice(0, plan.limit);

  const claims: MaterialClaim[] = [claim({
    id: 'recovery:count',
    text: improving.length === 0
      ? 'No project in that population is on an improving trajectory.'
      : `${String(improving.length)} projects are on an improving trajectory.`,
    display: String(improving.length),
    metricId: null, layer: 'L3',
    entityType: 'portfolio', entityId: 'authorised-set',
    asOf: tc.asOf, sourceDomain: 'portfolio',
    refs: [{ context: 'portfolio', entityType: 'population', entityId: 'improving' }],
    signalState: 'OBSERVED',
  })];

  for (const r of improving) {
    claims.push(claim({
      id: `recovery:${str(r, 'projectId') ?? ''}`,
      text: `${str(r, 'name') ?? ''} is improving but still assessed `
        + `${str(r, 'systemAssessedRag') ?? '?'}, with a 60-day outlook of ${str(r, 'outlook60') ?? '?'} `
        + `and ${str(r, 'gmValueAtRisk') ?? 'no'} still at risk. Improvement is a direction, not an `
        + 'arrival: the outlook is what says whether it is enough.',
      display: str(r, 'outlook60'),
      metricId: null, layer: 'L3',
      entityType: 'project', entityId: str(r, 'projectId') ?? '',
      asOf: tc.asOf, sourceDomain: 'portfolio',
      refs: [{ context: 'portfolio', entityType: 'project', entityId: str(r, 'projectId') ?? '' }],
      signalState: 'OBSERVED',
    }));
  }
  return { tool: 'portfolio.recovery.list', claims, untrustedContent: [] };
}

/** Which values the planner may filter on, read from the surface's own filter definitions. */
export async function vocabularyFrom(tc: ToolContext): Promise<{
  readonly regions: readonly string[];
  readonly industries: readonly string[];
  readonly deliveryGroups: readonly string[];
  readonly projects: readonly { readonly id: string; readonly name: string }[];
}> {
  const row = await commandCentre(tc);
  const ranked = list(row, 'ranked');
  const distinct = (key: string): readonly string[] =>
    [...new Set(ranked.map((r) => str(r, key) ?? '').filter((v) => v !== ''))].sort();
  return {
    regions: distinct('region'),
    industries: distinct('industry'),
    deliveryGroups: distinct('deliveryGroup'),
    projects: ranked.map((r) => ({ id: str(r, 'projectId') ?? '', name: str(r, 'name') ?? '' }))
      .filter((p) => p.id !== ''),
  };
}

export { sub };
