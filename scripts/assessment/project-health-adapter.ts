/**
 * Facts → `ProjectExecutiveHealthInput` — **DEMO — SYNTHETIC DATA**.
 *
 * The Phase 8 counterpart to `command-center-adapter.ts`, and it obeys the same rule: **this file
 * shapes facts into engine inputs and owns no arithmetic**. Every number it passes on was produced
 * by a `contexts/*` engine or is a count of rows. Where it appears to compute something — summing
 * executed change values, counting open defects by severity — it is aggregating L1 records into the
 * L1 counts the surface reports as facts, which is a different act from deriving a metric.
 *
 * It reuses `commandCenterProject()` for the assessment rather than running the engines a second
 * time. Two assessment paths for one project is how a portfolio row and a project page come to
 * disagree in front of a client.
 */
import { Money } from '@platform/decimal';
import { ruleVersion } from '@platform/provenance';
import type { CalendarDate, Instant, WeekId } from '@platform/time';
import { isOpenAsOf } from '@platform/time';
import type { ObservedSignals, ProjectExecutiveHealthInput, ProjectExecutiveHealthView } from '@app';
import { buildProjectExecutiveHealth } from '@app';
import { evaluateDelivery } from '@contexts/delivery';
import type { SyntheticPortfolio } from '../generator/index.js';
import { USD, deliveryInputFor } from './curated-assessment.js';
import { commandCenterProject } from './command-center-adapter.js';

const RULE = ruleVersion('HEALTH-v2');

/**
 * A fictional customer alias.
 *
 * The generated accounts already carry invented names, but the alias is derived from the account id
 * rather than reused from anywhere that could be mistaken for a real client, and it is rendered
 * beside a `DEMO — SYNTHETIC DATA` marker on every page.
 */
function aliasFor(accountId: string): string {
  return `Client ${accountId.replace(/^acc-/, '').toUpperCase()}`;
}

/** Days since a domain last produced a fact for this project; `null` where it never has. */
function domainAges(p: SyntheticPortfolio, projectId: string): Record<string, number | null> {
  const asOfMs = Date.parse(p.asOf);
  const age = (dates: readonly string[]): number | null => {
    let newest: number | null = null;
    for (const d of dates) {
      const t = Date.parse(d);
      if (newest === null || t > newest) newest = t;
    }
    return newest === null ? null : Math.round((asOfMs - newest) / 86_400_000);
  };
  const mine = <T extends { projectId: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.projectId === projectId);
  const spec = p.structure.projects.find((s) => s.projectId === projectId);
  const ours = <T extends { contractId: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.contractId === spec?.contractId);

  return {
    financial: age(mine(p.facts.actualCosts).map((r) => r.periodEnd)),
    delivery: age(mine(p.facts.progressClaims).map((r) => r.claimedOn)),
    commercial: age(ours(p.facts.executedChanges).map((r) => r.executedOn)),
    quality: age(mine(p.facts.defects).map((r) => r.raisedOn)),
    risk: age(mine(p.facts.risks).map((r) => r.updatedAt)),
  };
}

export function projectHealthInputFor(
  p: SyntheticPortfolio, projectId: string,
): ProjectExecutiveHealthInput {
  const spec = p.structure.projects.find((s) => s.projectId === projectId);
  if (spec === undefined) throw new Error(`unknown project ${projectId}`);

  const project = commandCenterProject(p, projectId);
  const delivery = evaluateDelivery(deliveryInputFor(p, projectId));
  const asOf = `${p.asOf}T00:00:00.000Z` as Instant;
  const week = (p.facts.progressClaims.filter((r) => r.projectId === projectId).at(-1)?.week
    ?? '2026-W35') as WeekId;

  const mine = <T extends { projectId: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.projectId === projectId);
  const ours = <T extends { contractId: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.contractId === spec.contractId);

  // --- L1 counts, reported as facts ----------------------------------------
  const asOfDate = p.asOf as CalendarDate;
  const defects = mine(p.facts.defects).filter((d) => isOpenAsOf(d.closedOn, asOfDate));
  const bySeverity: Record<string, number> = {};
  for (const d of defects) bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1;

  const acceptance = mine(p.facts.acceptanceItems);
  const executed = ours(p.facts.executedChanges).filter((c) => c.executedOn <= p.asOf);
  const executedById = new Map(ours(p.facts.executedChanges).map((c) => [c.id, c.executedOn]));
  const pending = ours(p.facts.pendingChanges).filter((c) => isOpenAsOf(
    c.supersededByExecutedId === undefined ? undefined : executedById.get(c.supersededByExecutedId),
    asOfDate,
  ));
  const risks = mine(p.facts.risks).filter((r) => r.state === 'OPEN' || r.state === 'MITIGATING');

  const observed: ObservedSignals = {
    openDefectsBySeverity: bySeverity,
    acceptanceBlockers: acceptance.filter((a) => a.blocking && isOpenAsOf(a.resolvedOn, asOfDate)).length,
    acceptedDeliverables: acceptance.filter((a) => !isOpenAsOf(a.acceptedOn, asOfDate)).length,
    submittedDeliverables: acceptance.length,
    executedChangeCount: executed.length,
    executedChangeValue: executed.reduce(
      (m, c) => m.plus(Money.of(c.valueDelta.amount, USD)), Money.zero(USD),
    ),
    pendingChangeCount: pending.length,
    pendingChangeValue: pending.reduce(
      (m, c) => m.plus(Money.of(c.proposedValue.amount, USD)), Money.zero(USD),
    ),
    uncontractedScopeItems: mine(p.facts.scopeItems).filter((s) => s.uncontracted).length,
    openRisks: risks.length,
    openCriticalRisks: risks.filter((r) => r.severity === 'CRITICAL').length,
  };

  // The as-sold baseline is read from the immutable project spec (ADR-0003 §1), never back-derived
  // from the current contractual position — that is the whole point of holding three baselines.
  //
  // The as-sold **margin percentage** is not computed here: `MET-FIN-012` is defined as
  // `MET-FIN-026 / MET-FIN-001`, both as-sold figures, and the economics engine already produces it
  // as `soldGmPercent`. Recomputing it in an adapter would be a second implementation of a frozen
  // financial metric — the exact defect this file's header disclaims.
  const soldValue = Money.of(spec.contractValue.toDto().amount, USD);
  const soldCost = Money.of(spec.budgetedCost.toDto().amount, USD);

  return {
    asOf,
    week,
    currency: USD,
    zero: Money.zero(USD),
    ruleVersion: RULE,
    identity: {
      projectId,
      name: spec.name,
      customerAlias: aliasFor(spec.accountId),
      industry: spec.vertical,
      region: spec.region,
      deliveryLeader: `Leader ${spec.portfolioId}`,
      daOwner: `DA ${spec.businessUnitId}`,
      engagementModel: spec.engagementModel,
      startDate: spec.startDate as CalendarDate,
      committedEndDate: spec.plannedEndDate as CalendarDate,
    },
    sold: {
      contractValueAsSold: soldValue,
      budgetedCostAsSold: soldCost,
      soldGmPercentAsSold: project.assessment.economics.soldGmPercent,
      committedEndDate: spec.plannedEndDate as CalendarDate,
    },
    assessment: project.assessment,
    delivery,
    observed,
    uncommercialisedExposure: project.uncommercialisedExposure,
    // DR-053 closed: assurance reviews are recorded facts. 58 of 91 projects have one, and the
    // remainder genuinely have none — a distressed project with no independent review is a finding
    // about the control, so the absence is still reported rather than hidden.
    ...(() => {
      const review = p.facts.assuranceReviews.find((r) => r.projectId === projectId);
      return review === undefined ? {} : {
        lastIndependentReview: {
          reviewedOn: review.reviewedOn as CalendarDate,
          reviewer: `${review.reviewType.replace(/_/g, ' ').toLowerCase()} by ${review.reviewerActorId}`,
          outcome: `${review.outcome} — ${review.summary}`,
        },
      };
    })(),
    domainAgeDays: domainAges(p, projectId),
  };
}

/** Builds the whole view for one project. */
export function projectExecutiveHealthFor(
  p: SyntheticPortfolio, projectId: string,
): ProjectExecutiveHealthView {
  return buildProjectExecutiveHealth(projectHealthInputFor(p, projectId));
}
