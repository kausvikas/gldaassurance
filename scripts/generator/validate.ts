/**
 * Portfolio validation.
 *
 * `TEST_STRATEGY.md` §6: "Generator validation **fails the build**, not a warning — a demo built on
 * incoherent data is worse than no demo."
 *
 * The recomputation checks below implement metric formulas a second time, independently of the
 * registry, to verify the *facts* produce the intended derived values. **This is not the Phase 4
 * engine** and must not become it: it exists to prove the generated facts are coherent, and it will
 * be deleted or superseded when the real engines land. It is written from `METRIC_CATALOG.md`
 * directly, so if it and Phase 4 ever disagree, one of them is wrong and the golden fixtures say
 * which.
 */
import Decimal from 'decimal.js';
import { Money } from '@platform/decimal';
import { compareDates, type CalendarDate } from '@platform/time';

/** The generator emits dates as plain strings; re-brand them at the validation boundary. */
const cd = (v: string): CalendarDate => v as CalendarDate;
import { ARCHETYPES } from './archetypes.js';
import type { CuratedScenario } from './curated.js';
import { REAL_WORLD_DENY_LIST } from './names.js';
import {
  TARGET_CAPACITY, TARGET_FIXED_BID, TARGET_TIME_AND_MATERIALS, TARGET_TOTAL,
} from './portfolio.js';
import type { SyntheticPortfolio } from './index.js';

export interface Finding {
  readonly check: string;
  readonly severity: 'ERROR' | 'WARN';
  readonly subject: string;
  readonly detail: string;
}

const D = (v: string | number) => new Decimal(v);
const sum = (rows: readonly { amount: { amount: string } }[]): Decimal =>
  rows.reduce((a, r) => a.plus(D(r.amount.amount)), D(0));

/** Per-project economics, recomputed from facts. Independent of the registry and of Phase 4. */
export interface ProjectEconomics {
  readonly projectId: string;
  readonly currency: string;
  readonly contractValueAsSold: Decimal;
  readonly budgetedCostAsSold: Decimal;
  readonly executedValueDelta: Decimal;
  readonly contractualRevenue: Decimal;
  readonly costToDate: Decimal;
  readonly etc: Decimal;
  readonly committed: Decimal;
  readonly eac: Decimal;
  readonly soldGmValue: Decimal;
  readonly forecastGmValue: Decimal;
  readonly forecastGmPercent: Decimal | null;
  readonly physicalCompletion: Decimal | null;
  readonly plannedCompletion: Decimal | null;
  readonly costConsumedPercent: Decimal | null;
  readonly contingencyBudget: Decimal;
  readonly contingencyConsumed: Decimal;
  readonly contingencyConsumedPercent: Decimal | null;
  readonly performanceImpliedEac: Decimal | null;
  readonly etcOptimismGap: Decimal | null;
  readonly incrementalRiskExposure: Decimal;
  readonly expectedCrRecovery: Decimal;
  readonly riskAdjustedRevenue: Decimal;
  readonly riskAdjustedGmValue: Decimal;
  readonly riskAdjustedGmPercent: Decimal | null;
  readonly uncompensatedExposure: Decimal;
  readonly reworkRatio: Decimal | null;
  readonly excessReworkCost: Decimal;
  /** Effective position after corrections — the sum of every live posting. */
  readonly recognisedRevenue: Decimal;
  /** The ORIGINAL series only: what Finance had booked when invoices were raised. */
  readonly recognisedRevenueOriginal: Decimal;
  readonly hasAccountingRestatement: boolean;
  readonly invoiced: Decimal;
  readonly collected: Decimal;
  readonly blockingAcceptanceItems: number;
  readonly reportedRagSeries: readonly { week: string; rag: string }[];
  // --- forward signals, none of which depend on adverse cost burn ------------
  readonly gatingMilestoneForecastSlipDays: number;
  readonly openCustomerDependencies: number;
  readonly oldestOpenCustomerDependencyDays: number;
  readonly openCriticalRisks: number;
  readonly uncontractedScopeItems: number;
  readonly executedChangeCount: number;
  readonly demonstratedVelocityPpPerWeek: Decimal | null;
  readonly requiredVelocityPpPerWeek: Decimal | null;
  readonly requiredVelocityRatio: Decimal | null;
  readonly contingencyDrawRecent: Decimal;
  readonly contingencyDrawEarlier: Decimal;
  readonly defectReopenTrendWorsening: boolean;
}

export function recomputeEconomics(p: SyntheticPortfolio, projectId: string): ProjectEconomics {
  const spec = p.structure.projects.find((s) => s.projectId === projectId);
  if (!spec) throw new Error(`Unknown project ${projectId}`);
  const f = p.facts;
  const byProject = <T extends { projectId: string }>(rows: readonly T[]) => rows.filter((r) => r.projectId === projectId);
  const byContract = <T extends { contractId: string }>(rows: readonly T[]) => rows.filter((r) => r.contractId === spec.contractId);

  const contractValueAsSold = D(spec.contractValue.toDto().amount);
  const budgetedCostAsSold = D(spec.budgetedCost.toDto().amount);
  const contingencyBudget = D(spec.contingencyBudget.toDto().amount);

  // MET-FIN-002 — only executed changes, and only from their execution date forward.
  const executed = byContract(f.executedChanges).filter((c) => compareDates(cd(c.executedOn), cd(p.asOf)) <= 0);
  const executedValueDelta = executed.reduce((a, c) => a.plus(D(c.valueDelta.amount)), D(0));
  const contractualRevenue = contractValueAsSold.plus(executedValueDelta);

  // MET-FIN-005 — cost to date.
  const costToDate = sum(byProject(f.actualCosts));

  // MET-FIN-007 / MET-FIN-023 — latest ETC revision and latest commitment only.
  // The latest *revision*, identified by its estimate date rather than by an id suffix: the two
  // generators number revisions in opposite directions, and an id-order heuristic silently picked
  // the oldest ETC for curated projects.
  const etcRows = byProject(f.etcLineItems);
  const latestEstimatedOn = etcRows.reduce((a, r) => (r.estimatedOn > a ? r.estimatedOn : a), '');
  const etc = sum(etcRows.filter((r) => r.estimatedOn === latestEstimatedOn));
  const commitments = byProject(f.commitments);
  const latestCommittedOn = commitments.reduce((a, r) => (r.committedOn > a ? r.committedOn : a), '');
  const committed = commitments.length
    ? sum(commitments.filter((c) => c.committedOn === latestCommittedOn))
    : D(0);

  // MET-FIN-008 — EAC = ATD + bottom-up ETC + committed future cost.
  const eac = costToDate.plus(etc).plus(committed);

  const soldGmValue = contractValueAsSold.minus(budgetedCostAsSold);
  const forecastGmValue = contractualRevenue.minus(eac);
  const forecastGmPercent = contractualRevenue.isZero() ? null : forecastGmValue.dividedBy(contractualRevenue);

  const claims = byProject(f.progressClaims);
  const latestClaim = claims[claims.length - 1];
  const physicalCompletion = latestClaim ? D(latestClaim.physicalCompletion) : null;
  const plannedCompletion = latestClaim ? D(latestClaim.plannedCompletion) : null;

  const costConsumedPercent = budgetedCostAsSold.isZero() ? null : costToDate.dividedBy(budgetedCostAsSold);
  const contingencyConsumed = sum(byProject(f.contingencyDrawdowns));
  const contingencyConsumedPercent = contingencyBudget.isZero() ? null : contingencyConsumed.dividedBy(contingencyBudget);

  // MET-FIN-029 / MET-FIN-030 — gated at 20% completion per EAC-v1.
  const mature = physicalCompletion !== null && physicalCompletion.gte('0.20');
  const performanceImpliedEac = mature && physicalCompletion !== null && !physicalCompletion.isZero()
    ? costToDate.dividedBy(physicalCompletion) : null;
  const etcOptimismGap = performanceImpliedEac === null ? null
    : Decimal.max(0, performanceImpliedEac.minus(eac));

  // MET-RSK-008 — only risk NOT already provisioned in ETC.
  const risks = byProject(f.risks);
  const incrementalRiskExposure = risks
    .filter((r) => !r.includedInEtc && r.state !== 'MITIGATED')
    .reduce((a, r) => a.plus(D(r.probability).times(D(r.costImpact.amount))), D(0));

  // MET-COM-010 — probability-weighted pending CR recovery, unexecuted only.
  const expectedCrRecovery = byContract(f.pendingChanges)
    .filter((c) => c.supersededByExecutedId === undefined)
    .reduce((a, c) => a.plus(D(c.approvalProbability).times(D(c.proposedValue.amount))), D(0));

  const riskAdjustedRevenue = contractualRevenue.plus(expectedCrRecovery);
  const riskAdjustedGmValue = riskAdjustedRevenue.minus(eac).minus(incrementalRiskExposure);
  const riskAdjustedGmPercent = riskAdjustedRevenue.isZero() ? null : riskAdjustedGmValue.dividedBy(riskAdjustedRevenue);

  const uncompensatedExposure = byProject(f.exposures)
    .filter((e) => e.kind === 'UNCOMPENSATED_SCOPE')
    .reduce((a, e) => a.plus(D(e.estimatedValue.amount)), D(0));

  // MET-QUA-006 / MET-QUA-012.
  const effort = byProject(f.effort);
  const totalHours = effort.reduce((a, e) => a.plus(D(e.hours)), D(0));
  const reworkHours = effort.filter((e) => e.isRework).reduce((a, e) => a.plus(D(e.hours)), D(0));
  const reworkRatio = totalHours.isZero() ? null : reworkHours.dividedBy(totalHours);
  const allowance = D(spec.reworkAllowance);
  const excessReworkCost = reworkRatio === null || reworkRatio.lte(allowance)
    ? D(0) : reworkRatio.minus(allowance).times(costToDate);

  // Effective recognised revenue: the sum of every live posting, originals and corrections alike.
  // Reading the last `cumulativeAmount` would ignore restatements (Correction 6).
  const recognisedRows = byProject(f.recognisedRevenue);
  const recognisedRevenue = recognisedRows.reduce((a, r) => a.plus(D(r.periodAmount.amount)), D(0));
  const recognisedRevenueOriginal = recognisedRows
    .filter((r) => r.postingType === 'ORIGINAL')
    .reduce((a, r) => a.plus(D(r.periodAmount.amount)), D(0));
  const hasAccountingRestatement = recognisedRows.some((r) => r.postingType !== 'ORIGINAL');
  const invoices = byContract(f.invoices);
  const invoiced = invoices.reduce((a, i) => a.plus(D(i.amount.amount)), D(0));
  const invoiceIds = new Set(invoices.map((i) => i.id));
  const collected = f.payments.filter((pay) => invoiceIds.has(pay.invoiceId))
    .reduce((a, pay) => a.plus(D(pay.amount.amount)), D(0));

  // --- forward signals -------------------------------------------------------
  const milestones = byProject(f.milestones);
  const gatingSlip = milestones
    .filter((m) => m.paymentGating && m.actualDate === undefined)
    .reduce((a, m) => Math.max(a, Math.round((Date.parse(m.forecastDate) - Date.parse(m.baselineDate)) / 86_400_000)), 0);
  const openDeps = byProject(f.dependencies).filter((d) => d.owner === 'CUSTOMER' && d.resolvedOn === undefined);
  const oldestDep = openDeps.reduce(
    (a, d) => Math.max(a, Math.round((Date.parse(p.asOf) - Date.parse(d.raisedOn)) / 86_400_000)), 0);
  const openCriticalRisks = risks.filter((r) => r.severity === 'CRITICAL' && r.state === 'OPEN').length;
  const uncontractedScopeItems = byProject(f.scopeItems).filter((i) => i.uncontracted).length;

  // Velocity: what the team has demonstrated over the trailing eight weekly claims, against what
  // finishing on the committed date now requires.
  const trailing = claims.slice(-9);
  const demonstrated = trailing.length >= 2 && latestClaim
    ? D(latestClaim.physicalCompletion)
        .minus(D((trailing[0] as { physicalCompletion: string }).physicalCompletion))
        .times(100).dividedBy(trailing.length - 1)
    : null;
  const weeksRemaining = Math.max(1, Math.round((Date.parse(spec.plannedEndDate) - Date.parse(p.asOf)) / (7 * 86_400_000)));
  const required = physicalCompletion === null ? null
    : D(1).minus(physicalCompletion).times(100).dividedBy(weeksRemaining);
  const requiredVelocityRatio = demonstrated === null || required === null || demonstrated.lte(0)
    ? null : required.dividedBy(demonstrated);

  const draws = byProject(f.contingencyDrawdowns);
  const cutoff = Date.parse(p.asOf) - 8 * 7 * 86_400_000;
  const drawRecent = draws.filter((d) => Date.parse(d.drawnOn) >= cutoff).reduce((a, d) => a.plus(D(d.amount.amount)), D(0));
  const drawEarlier = draws
    .filter((d) => Date.parse(d.drawnOn) < cutoff && Date.parse(d.drawnOn) >= cutoff - 8 * 7 * 86_400_000)
    .reduce((a, d) => a.plus(D(d.amount.amount)), D(0));

  const defects = byProject(f.defects);
  const halfway = Math.floor(defects.length / 2);
  const reopenRate = (rows: typeof defects) => rows.length === 0 ? 0 : rows.filter((x) => x.reopenCount > 0).length / rows.length;
  const defectReopenTrendWorsening = defects.length >= 10 && reopenRate(defects.slice(halfway)) > reopenRate(defects.slice(0, halfway));

  return {
    projectId, currency: spec.currency,
    gatingMilestoneForecastSlipDays: gatingSlip,
    openCustomerDependencies: openDeps.length,
    oldestOpenCustomerDependencyDays: oldestDep,
    openCriticalRisks,
    uncontractedScopeItems,
    executedChangeCount: executed.length,
    demonstratedVelocityPpPerWeek: demonstrated,
    requiredVelocityPpPerWeek: required,
    requiredVelocityRatio,
    contingencyDrawRecent: drawRecent,
    contingencyDrawEarlier: drawEarlier,
    defectReopenTrendWorsening,
    contractValueAsSold, budgetedCostAsSold, executedValueDelta, contractualRevenue,
    costToDate, etc, committed, eac, soldGmValue, forecastGmValue, forecastGmPercent,
    physicalCompletion, plannedCompletion, costConsumedPercent,
    contingencyBudget, contingencyConsumed, contingencyConsumedPercent,
    performanceImpliedEac, etcOptimismGap, incrementalRiskExposure, expectedCrRecovery,
    riskAdjustedRevenue, riskAdjustedGmValue, riskAdjustedGmPercent,
    uncompensatedExposure, reworkRatio, excessReworkCost,
    recognisedRevenue, recognisedRevenueOriginal, hasAccountingRestatement, invoiced, collected,
    blockingAcceptanceItems: byProject(f.acceptanceItems).filter((a) => a.blocking && a.resolvedOn === undefined).length,
    reportedRagSeries: byProject(f.statusReports).map((s) => ({ week: s.week, rag: s.reportedRag })),
  };
}

/**
 * Scenarios that explicitly model margin erosion **caused by delivery inefficiency or cost
 * overrun**. Only these are required to show cost consumed ahead of physical completion. It is a
 * property of the mechanism they model, not a general law about deterioration (Correction 1).
 */
const COST_DRIVEN_EROSION_SCENARIOS = new Set(['B', 'C', 'G', 'H']);

const near = (actual: Decimal | null, expected: number, tolerance: number): boolean =>
  actual !== null && actual.minus(expected).abs().lte(tolerance);

export function validate(p: SyntheticPortfolio): Finding[] {
  const out: Finding[] = [];
  const err = (check: string, subject: string, detail: string) =>
    out.push({ check, severity: 'ERROR', subject, detail });

  // --- 1. portfolio shape ---------------------------------------------------
  const projects = p.structure.projects;
  if (projects.length !== TARGET_TOTAL) err('shape.count', 'portfolio', `Expected ${TARGET_TOTAL} projects, got ${projects.length}.`);
  const byModel = (m: string) => projects.filter((s) => s.engagementModel === m).length;
  if (byModel('FIXED_BID') !== TARGET_FIXED_BID) err('shape.mix', 'portfolio', `Expected ${TARGET_FIXED_BID} fixed-bid, got ${byModel('FIXED_BID')}.`);
  if (byModel('TIME_AND_MATERIALS') !== TARGET_TIME_AND_MATERIALS) err('shape.mix', 'portfolio', `Expected ${TARGET_TIME_AND_MATERIALS} T&M, got ${byModel('TIME_AND_MATERIALS')}.`);
  if (byModel('CAPACITY') !== TARGET_CAPACITY) err('shape.mix', 'portfolio', `Expected ${TARGET_CAPACITY} capacity, got ${byModel('CAPACITY')}.`);
  for (const band of ['LT_1M', 'B_1_5M', 'B_5_10M', 'GTE_10M']) {
    if (projects.filter((s) => s.tcvBand === band).length === 0) err('shape.bands', band, 'TCV band is empty.');
  }
  for (const v of new Set(projects.map((s) => s.vertical))) {
    if (projects.filter((s) => s.vertical === v).length === 0) err('shape.verticals', v, 'Vertical is empty.');
  }
  if (new Set(projects.map((s) => s.vertical)).size !== 8) err('shape.verticals', 'portfolio', 'Expected all eight verticals to be represented.');
  if (new Set(projects.map((s) => s.region)).size !== 4) err('shape.regions', 'portfolio', 'Expected all four regions to be represented.');
  for (const stage of ['MOBILIZATION', 'EARLY_EXECUTION', 'MID_PROJECT', 'LATE_STAGE', 'UAT_ACCEPTANCE', 'CLOSED_OUT']) {
    if (projects.filter((s) => s.lifecycleSubStage === stage).length === 0) err('shape.lifecycle', stage, 'Lifecycle stage is empty.');
  }

  // --- 2. every archetype present and findable (REQ-DATA-008) ---------------
  for (const a of ARCHETYPES) {
    const n = projects.filter((s) => s.archetype === a.id).length;
    if (n === 0) err('archetypes.present', a.id, 'Archetype has no projects. REQ-DATA-008 requires every archetype to exist and be findable.');
  }

  // --- 3. no real-world names (REQ-DATA-009) --------------------------------
  const corpus = JSON.stringify({ s: p.structure, u: p.users }).toLowerCase();
  for (const banned of REAL_WORLD_DENY_LIST) {
    if (corpus.includes(banned)) err('privacy.realNames', banned, `Deny-listed real-world token "${banned}" appears in the generated corpus.`);
  }
  // Personas are handles, never generated human names.
  for (const a of p.facts.assignments) {
    if (!/^psn-\d{4}$/.test(a.personRef)) err('privacy.personRef', a.id, `personRef "${a.personRef}" is not an opaque synthetic handle.`);
  }

  // --- 4. referential integrity --------------------------------------------
  const projectIds = new Set(projects.map((s) => s.projectId));
  const contractIds = new Set(projects.map((s) => s.contractId));
  const assignmentIds = new Set(p.facts.assignments.map((a) => a.id));
  const invoiceIds = new Set(p.facts.invoices.map((i) => i.id));
  const check = <T>(rows: readonly T[], name: string, key: (r: T) => string, valid: Set<string>) => {
    for (const r of rows) {
      if (!valid.has(key(r))) { err('integrity.fk', name, `Dangling reference "${key(r)}".`); return; }
    }
  };
  check(p.facts.effort, 'effort.assignmentId', (r) => r.assignmentId, assignmentIds);
  check(p.facts.effort, 'effort.projectId', (r) => r.projectId, projectIds);
  check(p.facts.actualCosts, 'actualCosts.projectId', (r) => r.projectId, projectIds);
  check(p.facts.defects, 'defects.projectId', (r) => r.projectId, projectIds);
  check(p.facts.risks, 'risks.projectId', (r) => r.projectId, projectIds);
  check(p.facts.executedChanges, 'executedChanges.contractId', (r) => r.contractId, contractIds);
  check(p.facts.pendingChanges, 'pendingChanges.contractId', (r) => r.contractId, contractIds);
  check(p.facts.payments, 'payments.invoiceId', (r) => r.invoiceId, invoiceIds);
  check(p.facts.recognisedRevenue, 'recognisedRevenue.projectId', (r) => r.projectId, projectIds);

  // --- 5. periods are valid and within the history window -------------------
  const weekRe = /^\d{4}-W\d{2}$/;
  for (const r of p.facts.progressClaims) {
    if (!weekRe.test(r.week)) err('periods.week', r.projectId, `Malformed week "${r.week}".`);
    if (compareDates(cd(r.claimedOn), cd(p.asOf)) > 0) err('periods.future', r.projectId, `Progress claim dated after the as-of date: ${r.claimedOn}.`);
  }
  for (const r of p.facts.actualCosts) {
    if (compareDates(cd(r.periodEnd), cd(p.asOf)) > 0) err('periods.future', r.projectId, `Cost dated after the as-of date: ${r.periodEnd}.`);
  }

  // --- 6. executed CR dates align to a baseline revision --------------------
  const revisionReasons = new Set(p.facts.baselineRevisions.map((r) => r.reason));
  for (const c of p.facts.executedChanges) {
    if (![...revisionReasons].some((r) => r.includes(c.id))) {
      err('contract.crRevision', c.id, 'Executed change has no corresponding contractual baseline revision.');
    }
    if (compareDates(cd(c.executedOn), cd(p.asOf)) > 0) {
      err('contract.crFuture', c.id, `Executed change dated after the as-of date: ${c.executedOn}.`);
    }
  }
  // A pending change that was executed must reference the executed record, and vice versa.
  const executedIds = new Set(p.facts.executedChanges.map((c) => c.id));
  for (const pc of p.facts.pendingChanges) {
    if (pc.supersededByExecutedId !== undefined && !executedIds.has(pc.supersededByExecutedId)) {
      err('contract.crLink', pc.id, `Pending change points at unknown executed change "${pc.supersededByExecutedId}".`);
    }
  }

  // --- 7. decimal safety and impossible values ------------------------------
  const moneyFields: [readonly { amount: { amount: string } }[], string][] = [
    [p.facts.actualCosts, 'actualCosts'], [p.facts.etcLineItems, 'etcLineItems'],
    [p.facts.commitments, 'commitments'], [p.facts.contingencyDrawdowns, 'contingencyDrawdowns'],
    [p.facts.invoices, 'invoices'], [p.facts.payments, 'payments'],
  ];
  for (const [rows, name] of moneyFields) {
    for (const r of rows) {
      const a = r.amount.amount;
      if (typeof a !== 'string') { err('money.type', name, 'Monetary amount is not a decimal string.'); break; }
      if (!/^-?\d+(\.\d+)?$/.test(a)) { err('money.format', name, `Amount "${a}" is not a plain decimal string.`); break; }
      if (D(a).isNegative()) { err('money.negative', name, `Negative amount "${a}" where none is supported.`); break; }
      // (Recognised-revenue postings are excluded from this list: an adjustment or reversal is
      // legitimately negative, which is exactly what makes restatement expressible.)
      // Must survive the domain Money constructor unchanged.
      try { Money.of(a, 'USD'); } catch { err('money.decimalSafe', name, `Amount "${a}" is rejected by the Money value object.`); break; }
    }
  }
  for (const r of p.facts.progressClaims) {
    const pc = D(r.physicalCompletion);
    if (pc.lt(0) || pc.gt(1)) err('percent.range', r.projectId, `Physical completion ${r.physicalCompletion} outside [0,1].`);
    const plan = D(r.plannedCompletion);
    if (plan.lt(0) || plan.gt(1)) err('percent.range', r.projectId, `Planned completion ${r.plannedCompletion} outside [0,1].`);
  }
  for (const r of p.facts.risks) {
    const prob = D(r.probability);
    if (prob.lt(0) || prob.gt(1)) err('percent.range', r.id, `Probability ${r.probability} outside [0,1].`);
    if (r.includedInEtc && !r.includedInEtcJustification) err('risk.justification', r.id, 'includedInEtc is true with no justification.');
  }
  for (const r of p.facts.pendingChanges) {
    const prob = D(r.approvalProbability);
    if (prob.lt(0) || prob.gt(1)) err('percent.range', r.id, `Approval probability ${r.approvalProbability} outside [0,1].`);
  }

  // --- 8. monotonicity where it is physically required ----------------------
  for (const spec of projects) {
    // ORIGINAL postings must not reverse. Corrections legitimately may — that is what they are for
    // — so monotonicity is asserted over the original series only (Correction 6).
    const rows = p.facts.recognisedRevenue.filter((r) => r.projectId === spec.projectId && r.postingType === 'ORIGINAL');
    for (let i = 1; i < rows.length; i += 1) {
      const prev = D((rows[i - 1] as { cumulativeAmount: { amount: string } }).cumulativeAmount.amount);
      const cur = D((rows[i] as { cumulativeAmount: { amount: string } }).cumulativeAmount.amount);
      if (cur.lt(prev.minus(1))) {
        err('monotonic.recognised', spec.projectId, `Cumulative recognised revenue fell from ${prev} to ${cur}.`);
        break;
      }
    }
    const claims = p.facts.progressClaims.filter((r) => r.projectId === spec.projectId);
    for (let i = 1; i < claims.length; i += 1) {
      const prev = D((claims[i - 1] as { physicalCompletion: string }).physicalCompletion);
      const cur = D((claims[i] as { physicalCompletion: string }).physicalCompletion);
      // Progress may be restated slightly downward but never collapse.
      if (cur.lt(prev.minus('0.05'))) {
        err('monotonic.progress', spec.projectId, `Physical completion fell from ${prev} to ${cur}.`);
        break;
      }
    }
  }

  // --- 9. cross-domain reconciliation (G3) ----------------------------------
  for (const spec of projects) {
    const e = recomputeEconomics(p, spec.projectId);
    // Billing is compared against the ORIGINAL recognised series — what Finance had booked when the
    // invoices were raised. Comparing against the *effective* position would be wrong: a downward
    // restatement months later does not retract an invoice already issued. Invoiced exceeding
    // effective recognised is a real condition (over-billing against restated revenue) and is
    // exactly what MET-COM-006 unbilled revenue turning negative would surface.
    if (e.invoiced.gt(e.recognisedRevenueOriginal.times('1.02').plus(1000))) {
      err('reconcile.billing', spec.projectId, `Invoiced ${e.invoiced.toFixed(2)} exceeds originally recognised ${e.recognisedRevenueOriginal.toFixed(2)} beyond tolerance.`);
    }
    if (e.collected.gt(e.invoiced.plus(1))) {
      err('reconcile.cash', spec.projectId, `Collected ${e.collected.toFixed(2)} exceeds invoiced ${e.invoiced.toFixed(2)}.`);
    }
    if (e.recognisedRevenueOriginal.gt(e.contractualRevenue.plus(1))) {
      err('reconcile.recognition', spec.projectId, `Recognised ${e.recognisedRevenueOriginal.toFixed(2)} exceeds contractual revenue ${e.contractualRevenue.toFixed(2)}.`);
    }
    if (e.contingencyConsumed.gt(e.contingencyBudget.plus(1))) {
      err('reconcile.contingency', spec.projectId, `Contingency consumed exceeds the budget.`);
    }
  }

  // --- 10. history depth for trajectory (MET-FCST-001 needs 8 weekly points) -
  // A project that started five weeks ago cannot have eight weeks of history, and a LOW_CONFIDENCE
  // project is *meant* to have gaps (G7). Both are correct data. What must hold is that any project
  // old enough, and reporting normally, has a computable trailing window.
  let deepSeries = 0;
  for (const spec of projects) {
    const elapsed = Math.round((Date.parse(p.asOf) - Date.parse(spec.startDate)) / (7 * 86_400_000));
    const claims = p.facts.progressClaims.filter((r) => r.projectId === spec.projectId).length;
    if (claims >= 8) deepSeries += 1;
    if (elapsed >= 16 && spec.archetype !== 'LOW_CONFIDENCE' && claims < 8) {
      err('history.depth', spec.projectId, `${elapsed} weeks elapsed but only ${claims} progress claims; MET-FCST-001 needs a trailing window of 8.`);
    }
  }
  if (deepSeries < 60) {
    err('history.coverage', 'portfolio', `Only ${deepSeries} projects have a computable 8-week trajectory window; the portfolio needs a substantial majority.`);
  }
  // The LOW_CONFIDENCE archetype must actually be under-reported, or the data does not demonstrate
  // what it claims to (SYNTHETIC_DATA_SPEC §9.7).
  for (const spec of projects.filter((s) => s.archetype === 'LOW_CONFIDENCE')) {
    const elapsed = Math.round((Date.parse(p.asOf) - Date.parse(spec.startDate)) / (7 * 86_400_000));
    const weeks = Math.min(elapsed, 78);
    const claims = p.facts.progressClaims.filter((r) => r.projectId === spec.projectId).length;
    if (weeks >= 20 && claims > weeks * 0.85) {
      err('archetype.lowConfidence', spec.projectId, `Reporting is not degraded: ${claims} claims across ${weeks} weeks.`);
    }
  }

  // --- 11. curated scenarios hit their stated targets ------------------------
  for (const { letter, projectId, scenario } of p.curated) {
    const e = recomputeEconomics(p, projectId);
    const x = scenario.expect;
    const fail = (what: string, actual: string, expected: string) =>
      err(`scenario.${letter}`, `${letter} ${scenario.title} (${projectId})`, `${what}: got ${actual}, expected ${expected}`);

    if (!near(e.soldGmValue.dividedBy(e.contractValueAsSold), x.soldGmPercent, 0.0005)) {
      fail('sold GM %', e.soldGmValue.dividedBy(e.contractValueAsSold).toFixed(4), String(x.soldGmPercent));
    }
    if (!near(e.forecastGmPercent, x.forecastGmPercent, 0.0015)) {
      fail('forecast GM %', e.forecastGmPercent?.toFixed(4) ?? 'null', String(x.forecastGmPercent));
    }
    if (x.physicalCompletion !== undefined && !near(e.physicalCompletion, x.physicalCompletion, 0.005)) {
      fail('physical completion', e.physicalCompletion?.toFixed(4) ?? 'null', String(x.physicalCompletion));
    }
    if (x.plannedCompletion !== undefined && !near(e.plannedCompletion, x.plannedCompletion, 0.005)) {
      fail('planned completion', e.plannedCompletion?.toFixed(4) ?? 'null', String(x.plannedCompletion));
    }
    if (x.costConsumedPercent !== undefined && !near(e.costConsumedPercent, x.costConsumedPercent, 0.005)) {
      fail('cost consumed %', e.costConsumedPercent?.toFixed(4) ?? 'null', String(x.costConsumedPercent));
    }
    if (x.contingencyConsumedPercent !== undefined && !near(e.contingencyConsumedPercent, x.contingencyConsumedPercent, 0.01)) {
      fail('contingency consumed %', e.contingencyConsumedPercent?.toFixed(4) ?? 'null', String(x.contingencyConsumedPercent));
    }
    if (x.performanceImpliedEac !== undefined && !near(e.performanceImpliedEac, x.performanceImpliedEac, 2000)) {
      fail('performance-implied EAC', e.performanceImpliedEac?.toFixed(2) ?? 'null', String(x.performanceImpliedEac));
    }
    if (x.etcOptimismGap !== undefined && !near(e.etcOptimismGap, x.etcOptimismGap, 2000)) {
      fail('ETC optimism gap', e.etcOptimismGap?.toFixed(2) ?? 'null', String(x.etcOptimismGap));
    }
    if (x.uncompensatedExposure !== undefined && !near(e.uncompensatedExposure, x.uncompensatedExposure, 1)) {
      fail('uncompensated exposure', e.uncompensatedExposure.toFixed(2), String(x.uncompensatedExposure));
    }
    if (x.excessReworkCost !== undefined && !near(e.excessReworkCost, x.excessReworkCost, 6000)) {
      fail('excess rework cost', e.excessReworkCost.toFixed(2), String(x.excessReworkCost));
    }
    if (x.incrementalRiskExposure !== undefined && !near(e.incrementalRiskExposure, x.incrementalRiskExposure, 1)) {
      fail('incremental risk exposure', e.incrementalRiskExposure.toFixed(2), String(x.incrementalRiskExposure));
    }
    if (x.riskAdjustedGmPercent !== undefined && !near(e.riskAdjustedGmPercent, x.riskAdjustedGmPercent, 0.002)) {
      fail('risk-adjusted GM %', e.riskAdjustedGmPercent?.toFixed(4) ?? 'null', String(x.riskAdjustedGmPercent));
    }
    // --- CORRECTION 1 ------------------------------------------------------
    // The invalid universal invariant "deterioration ⇒ cost consumed > physical completion" was
    // removed. A project may deteriorate long before cost burn shows it — through milestone
    // forecast slippage, acceptance delay, dependency blockage, unsigned scope, reopen trends,
    // a required velocity above the demonstrated one, or contingency acceleration.
    //
    // What remains is the narrower, correct claim: where a scenario *specifically models margin
    // erosion caused by delivery inefficiency or cost overrun*, its cost and progress facts must
    // causally support that mechanism. B, C, G and H do; A, D, E, F and LR do not, and are not
    // asserted against it.
    if (COST_DRIVEN_EROSION_SCENARIOS.has(letter) && e.costConsumedPercent !== null && e.physicalCompletion !== null) {
      if (e.costConsumedPercent.lte(e.physicalCompletion)) {
        fail(
          'cost/progress mechanism',
          `cost consumed ${e.costConsumedPercent.toFixed(4)} ≤ physical ${e.physicalCompletion.toFixed(4)}`,
          'cost consumed ahead of progress — this scenario models erosion caused by cost overrun',
        );
      }
    }

    // Scenario-specific structural expectations.
    if (letter === 'E' && p.facts.executedChanges.some((c) => c.contractId.endsWith(projectId.slice(-3)))) {
      fail('executed changes', 'present', 'none — the scenario is uncompensated scope');
    }
    if (letter === 'G' && e.blockingAcceptanceItems !== scenario.blockingAcceptanceItems) {
      fail('blocking acceptance items', String(e.blockingAcceptanceItems), String(scenario.blockingAcceptanceItems));
    }
    if ((letter === 'B' || letter === 'C') && e.reportedRagSeries.some((r) => r.rag !== 'GREEN')) {
      fail('reported RAG', 'not GREEN throughout', 'GREEN throughout — the divergence is the point');
    }
  }

  // --- 11b. leading risk before adverse cost burn (Correction 11) -----------
  const lrEntry = p.curated.find((c) => c.letter === 'LR');
  if (!lrEntry) {
    err('leadingRisk.present', 'portfolio', 'No leading-risk case. Phase 4 cannot be tested against detecting deterioration before cost burn turns adverse.');
  } else {
    const e = recomputeEconomics(p, lrEntry.projectId);
    const subject = `LR ${lrEntry.scenario.title} (${lrEntry.projectId})`;
    // The premise: cost is NOT adverse.
    if (e.costConsumedPercent === null || e.physicalCompletion === null || e.costConsumedPercent.gt(e.physicalCompletion)) {
      err('leadingRisk.premise', subject, `Cost consumed must be at or below physical completion for this case to mean anything; got ${e.costConsumedPercent?.toFixed(4)} vs ${e.physicalCompletion?.toFixed(4)}.`);
    }
    if (e.forecastGmPercent === null || e.forecastGmPercent.lt(e.soldGmValue.dividedBy(e.contractValueAsSold).minus('0.01'))) {
      err('leadingRisk.premise', subject, 'Forecast margin must not yet be adverse, or the case is not "before the cost burn shows it".');
    }
    // The forward signals that must nevertheless be present.
    const signals: [string, boolean][] = [
      ['gating milestone forecast slippage', e.gatingMilestoneForecastSlipDays >= 30],
      ['ageing unresolved customer dependencies', e.openCustomerDependencies >= 3 && e.oldestOpenCustomerDependencyDays >= 60],
      ['unsigned scope accumulating with no executed CR', e.uncontractedScopeItems >= 3 && e.executedChangeCount === 0],
      ['open critical risks', e.openCriticalRisks >= 3],
      ['required velocity materially above demonstrated', e.requiredVelocityRatio !== null && e.requiredVelocityRatio.gte('1.5')],
      ['contingency draw accelerating', e.contingencyDrawRecent.gt(e.contingencyDrawEarlier)],
      ['weakening acceptance readiness', e.blockingAcceptanceItems >= 3],
    ];
    const missing = signals.filter(([, present]) => !present).map(([name]) => name);
    if (missing.length > 0) {
      err('leadingRisk.signals', subject, `Missing forward deterioration signals: ${missing.join('; ')}.`);
    }
  }

  // --- 11c. accounting corrections are append-only (Correction 6) -----------
  const postingsById = new Map(p.facts.recognisedRevenue.map((r) => [r.id, r]));
  if (new Set(p.facts.recognisedRevenue.map((r) => r.id)).size !== p.facts.recognisedRevenue.length) {
    err('accounting.uniqueness', 'recognisedRevenue', 'Duplicate posting id — a posting was overwritten rather than appended.');
  }
  const correctionRows = p.facts.recognisedRevenue.filter((r) => r.postingType !== 'ORIGINAL');
  if (correctionRows.length === 0) {
    err('accounting.corrections', 'recognisedRevenue', 'No accounting corrections generated; Phase 4 cannot prove restatement is handled.');
  }
  for (const c of correctionRows) {
    if (!c.supersedesFactId || !postingsById.has(c.supersedesFactId)) {
      err('accounting.lineage', c.id, `${c.postingType} does not name a posting that exists.`);
    }
    const root = c.originalFactId ? postingsById.get(c.originalFactId) : undefined;
    if (!root || root.postingType !== 'ORIGINAL') {
      err('accounting.lineage', c.id, 'Correction chain does not resolve to an ORIGINAL posting.');
    } else if (root.sourceRecordId !== c.sourceRecordId) {
      err('accounting.lineage', c.id, 'Correction refers to a different source record than its original.');
    } else if (c.sourceTimestamp <= root.sourceTimestamp) {
      err('accounting.lineage', c.id, 'Correction is not dated after the posting it corrects.');
    }
  }
  for (const o of p.facts.recognisedRevenue.filter((r) => r.postingType === 'ORIGINAL')) {
    if (o.supersedesFactId !== undefined) {
      err('accounting.lineage', o.id, 'An ORIGINAL posting must not supersede anything.');
    }
  }

  // --- 12. no derived metric leaked into the data ---------------------------
  const forbidden = ['forecastGm', 'systemAssessedRag', 'healthScore', 'compositeScore', 'trajectory', 'eac', 'valueAtRisk'];
  const factKeys = new Set(Object.values(p.facts).flatMap((rows) =>
    (rows as unknown[]).slice(0, 1).flatMap((r) => Object.keys(r as object))));
  for (const key of factKeys) {
    if (forbidden.some((banned) => key.toLowerCase() === banned.toLowerCase())) {
      err('layering.derived', key, 'A derived metric appears as a stored fact. Phase 4 computes these; the generator must not.');
    }
  }

  // --- 13. DEMO — SYNTHETIC DATA labelling (invariant 11) -------------------
  for (const [name, rows] of Object.entries(p.facts)) {
    const bad = (rows as { synthetic?: boolean }[]).find((r) => r.synthetic !== true);
    if (bad) err('labelling.synthetic', name, 'A fact row is missing `synthetic: true`.');
  }

  return out;
}
