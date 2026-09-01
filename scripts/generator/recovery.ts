/**
 * Recovery plans, corrective actions and assurance dispositions — **DEMO — SYNTHETIC DATA**.
 *
 * **This closes DR-049.** Until Phase 10 the portfolio held no recovery plan at all, so
 * `MET-PORT-007` tier 5 graded every project `NOT_ASSESSED` and the Phase 8 surface honestly read
 * "Not assessed" on every row. The metric and the engine were both correct and had nothing to work
 * on.
 *
 * ### What is a fact here, and what is not
 *
 * An **early warning is not stored**. It is derived from current evidence on every run, so detection
 * is reproducible and cannot drift from the numbers it claims to be about. What *is* stored is the
 * human act that followed: whether assurance validated, challenged or accepted the warning, and what
 * corrective action delivery committed to. Separating the two is what makes follow-through
 * measurable — a warning nobody dispositioned is a different failure from one that was validated and
 * then ignored.
 *
 * ### Who owns what
 *
 * `SECURITY_MODEL.md` and the Phase 10 brief both draw the same line: **delivery owns corrective
 * execution; assurance owns validation, follow-through and escalation.** So a `RecoveryActionRow`
 * carries a delivery owner and an execution status, and a `WarningDispositionRow` carries an
 * assurance actor and a control clock — and neither carries the other's fields.
 *
 * Every figure is deterministic from the seed (REQ-DATA-007).
 */
import { Money } from '@platform/decimal';
import { addDays } from '@platform/time';
import type {
  AssuranceReviewRow, ProjectFacts, RecoveryActionRow, RecoveryPlanRow, ScheduleForecastRow,
  WarningDispositionRow,
} from './facts.js';
import { ARCHETYPE_BY_ID } from './archetypes.js';
import type { ProjectSpec } from './portfolio.js';
import { Rng, dec } from './rng.js';

/** Delivery owns execution. Assurance owns validation. Two disjoint actor pools, deliberately. */
const DELIVERY_OWNERS = ['usr-dm-mobility', 'usr-dir-emea', 'usr-dir-amer'] as const;
const ASSURANCE_ACTORS = ['usr-da-lead', 'usr-da-reviewer'] as const;

/**
 * The corrective actions a recovery plan can contain, keyed to the signal each answers.
 *
 * `group` is the incompatibility group: two actions attacking the same root cause cannot both be
 * banked, and `computeRecoveryEconomics` counts only the largest benefit in a group. A plan that
 * claims both a renegotiation and a descope of the *same* scope is claiming one saving twice.
 */
const ACTION_TEMPLATES = [
  {
    signal: 'UNCOMMERCIALISED_SCOPE',
    description: 'Raise and land a change request covering the scope already delivered without one',
    group: 'SCOPE_COMMERCIAL',
    revenueShare: 0.85, costShare: 0, weeks: 0, confidence: '0.55',
    executiveDecision: true,
  },
  {
    signal: 'UNCOMMERCIALISED_SCOPE',
    description: 'Descope the uncontracted work back to the signed statement of work',
    group: 'SCOPE_COMMERCIAL',
    revenueShare: 0, costShare: 0.60, weeks: 2, confidence: '0.70',
    executiveDecision: true,
  },
  {
    signal: 'QUALITY_REWORK',
    description: 'Stand up a defect-prevention cell and stop the rework leak at source',
    group: 'QUALITY',
    revenueShare: 0, costShare: 0.45, weeks: 0, confidence: '0.60',
    executiveDecision: false,
  },
  {
    signal: 'REQUIRED_VELOCITY',
    description: 'Rebaseline the delivery schedule against demonstrated velocity',
    group: 'SCHEDULE',
    revenueShare: 0, costShare: 0.20, weeks: 6, confidence: '0.75',
    executiveDecision: true,
  },
  {
    signal: 'RESOURCE_COST_DRIFT',
    description: 'Rebalance the team pyramid toward the priced seniority mix',
    group: 'RESOURCE',
    revenueShare: 0, costShare: 0.35, weeks: 0, confidence: '0.65',
    executiveDecision: false,
  },
  {
    signal: 'BURN_GAP',
    description: 'Revalidate the ETC bottom-up against demonstrated cost performance',
    group: 'FORECAST',
    revenueShare: 0, costShare: 0.15, weeks: 0, confidence: '0.80',
    executiveDecision: false,
  },
] as const;

/**
 * Builds recovery plans for the projects that would actually have one.
 *
 * Not every distressed project gets a plan, and that is the point: a portfolio where every Red
 * project has an owned, funded recovery plan is a portfolio nobody needs this product for. The
 * gaps — Red with no plan, plans with unowned actions, actions past their due date — are what the
 * early-warning and assurance surfaces exist to surface.
 */
export function buildRecoveryFacts(
  specs: readonly ProjectSpec[], asOf: string, seed: string,
): Pick<ProjectFacts, 'recoveryPlans' | 'recoveryActions' | 'warningDispositions'> {
  const recoveryPlans: RecoveryPlanRow[] = [];
  const recoveryActions: RecoveryActionRow[] = [];
  const warningDispositions: WarningDispositionRow[] = [];

  for (const spec of specs) {
    if (spec.engagementModel !== 'FIXED_BID') continue;
    const rng = Rng.fromSeed(`${seed}:recovery:${spec.projectId}`);

    // Who gets a plan: everything flagged in recovery, plus a deterministic minority of the rest.
    // The remainder are deliberately left without one — an unplanned Red is a finding.
    const hasPlan = spec.inRecovery || rng.float() < 0.34;
    if (!hasPlan) continue;

    const openedOn = addDays(asOf as never, -(28 + rng.int(0, 55)));
    const planId = `rec-${spec.projectId.replace('prj-', '')}`;
    const budget = Number(spec.budgetedCost.toDto().amount);

    recoveryPlans.push({
      id: planId,
      projectId: spec.projectId,
      contractId: spec.contractId,
      openedOn,
      targetExitOn: addDays(asOf as never, 42 + rng.int(0, 41)),
      sponsorActorId: 'usr-exec-cdo',
      // A recovery target is what the plan is trying to get back to, never what was sold.
      recoveryTargetMarginPercent: dec(0.12 + rng.float() * 0.06, 4),
      recoveryTargetCompletion: addDays(spec.plannedEndDate, 14 + rng.int(0, 41)),
      synthetic: true,
    });

    // Two to four actions, drawn deterministically and never two from the same group unless the
    // group is genuinely contested — which is exactly the case the economics engine must handle.
    const count = 2 + rng.int(0, 2);
    for (let i = 0; i < count; i += 1) {
      const template = rng.pick(ACTION_TEMPLATES);
      const scale = budget * (0.01 + rng.float() * 0.03);
      const overdue = rng.float() < 0.30;
      const dueOn = addDays(asOf as never, overdue ? -(3 + rng.int(0, 24)) : 7 + rng.int(0, 39));
      const status = rng.float() < 0.22
        ? 'COMPLETE'
        : rng.float() < 0.45 ? 'IN_PROGRESS' : rng.float() < 0.75 ? 'COMMITTED' : 'PROPOSED';
      // A minority of actions are genuinely unowned. `computeRecoveryEconomics` treats an unowned
      // action as a credibility deduction, not as a benefit to be quietly banked.
      const unowned = rng.float() < 0.18;

      recoveryActions.push({
        id: `${planId}-a${String(i + 1)}`,
        planId,
        projectId: spec.projectId,
        description: template.description,
        ...(unowned ? {} : {
          ownerActorId: rng.pick(DELIVERY_OWNERS),
        }),
        dueOn,
        status,
        ...(status === 'COMPLETE'
          ? { completedOn: addDays(asOf as never, -(1 + rng.int(0, 19))) }
          : {}),
        revenueBenefit: Money.of(dec(scale * template.revenueShare), 'USD').toDto(),
        costBenefit: Money.of(dec(scale * template.costShare), 'USD').toDto(),
        scheduleBenefitWeeks: template.weeks,
        confidence: template.confidence,
        incompatibilityGroup: template.group,
        respondsToSignal: template.signal,
        executiveDecisionRequired: template.executiveDecision,
        synthetic: true,
      });
    }

    // Assurance dispositions. A deliberate share are left undispositioned past their due date —
    // that is the overdue-control exception the assurance surface must raise against itself.
    const signals = [...new Set(
      recoveryActions.filter((a) => a.planId === planId).map((a) => a.respondsToSignal as string),
    )];
    for (const signalId of signals) {
      const raisedOn = addDays(asOf as never, -(7 + rng.int(0, 34)));
      const settled = rng.float() < 0.68;
      warningDispositions.push({
        id: `wd-${planId}-${signalId.toLowerCase()}`,
        projectId: spec.projectId,
        signalId,
        raisedOn,
        disposition: rng.float() < 0.78
          ? 'VALIDATED'
          : rng.float() < 0.6 ? 'CHALLENGED' : 'ACCEPTED_RISK',
        ...(settled ? { dispositionedOn: addDays(raisedOn, 2 + rng.int(0, 8)) } : {}),
        assuranceActorId:
          rng.pick(ASSURANCE_ACTORS),
        rationale: settled
          ? 'Reviewed against the evidence chain; the signal reflects the delivery position.'
          : 'Not yet reviewed.',
        // The control clock. Ten working days from detection, per the assurance policy.
        dueOn: addDays(raisedOn, 14),
        synthetic: true,
      });
    }
  }

  return { recoveryPlans, recoveryActions, warningDispositions };
}

/**
 * Schedule forecasts and assurance reviews — **DR-050 and DR-053**.
 *
 * Emitted in one pass over the final spec list so **every** project gets them, simulated and curated
 * alike. Putting them inside `simulateProject` would have skipped the nine curated scenarios, which
 * are precisely the projects the demo shows.
 */
export function buildScheduleAndAssuranceFacts(
  specs: readonly ProjectSpec[], asOf: string, seed: string,
): Pick<ProjectFacts, 'scheduleForecasts' | 'assuranceReviews'> {
  const scheduleForecasts: ScheduleForecastRow[] = [];
  const assuranceReviews: AssuranceReviewRow[] = [];

  for (const spec of specs) {
    const rng = Rng.fromSeed(`${seed}:schedule:${spec.projectId}`);
    const drag = ARCHETYPE_BY_ID.get(spec.archetype)?.drivers.productivityDrag ?? 1;

    // --- DR-050: delivery's completion forecast ------------------------------
    // Distinct from the contractual `plannedEndDate`, which never moves (ADR-0003 §1). Without this
    // row `MET-DEL-011` was not computable at all, and the milestone set is not a substitute — its
    // last entry sits months before the contractual date on a typical project.
    const slipDays = drag > 1 ? Math.round((drag - 1) * 140 * rng.range(0.5, 1.4)) : 0;
    scheduleForecasts.push({
      projectId: spec.projectId,
      forecastOn: asOf,
      forecastCompletionDate: addDays(spec.plannedEndDate, slipDays),
      basis: slipDays > 0
        ? 'demonstrated velocity extrapolated over the remaining scope'
        : 'delivery confirms the contractual completion date',
      synthetic: true,
    });

    // --- DR-053: independent / DA assurance review ---------------------------
    // Deliberately not every project. A distressed project with **no** independent review is a
    // finding about the control, and a portfolio where everything has been reviewed cannot show it.
    if (rng.chance(0.62)) {
      const outcome = drag > 1.15
        ? (rng.chance(0.45) ? 'ADVERSE' : 'QUALIFIED')
        : (rng.chance(0.75) ? 'SATISFACTORY' : 'QUALIFIED');
      assuranceReviews.push({
        id: `asr-${spec.projectId}`,
        projectId: spec.projectId,
        reviewedOn: addDays(asOf as never, -rng.int(14, 180)),
        reviewerActorId: rng.pick(['usr-da-lead', 'usr-da-reviewer'] as const),
        reviewType: rng.pick(['DA_REVIEW', 'INDEPENDENT_ASSURANCE', 'PEER_REVIEW'] as const),
        outcome,
        summary: outcome === 'ADVERSE'
          ? 'Delivery position materially worse than reported; forecast not supported by the evidence.'
          : outcome === 'QUALIFIED'
            ? 'Reported position broadly supported, with findings raised against the forecast basis.'
            : 'Reported position supported by the evidence reviewed.',
        synthetic: true,
      });
    }
  }

  return { scheduleForecasts, assuranceReviews };
}
